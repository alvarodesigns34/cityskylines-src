import { DEFS } from "../catalog";
import { blur, stamp } from "../fields";
import type { CitySim } from "../city";
import { DIRS, N, ROAD, SERVICES, clamp01, idx } from "../types";
import { ZONE_DEPTH, nearestRoad } from "./network";

const CELLS = N * N;
const queue = new Int32Array(CELLS * 2);
const dist = new Uint8Array(CELLS);

/**
 * Reparte luz y agua por la red viaria y rasteriza la cobertura de los servicios urbanos.
 *
 * La red transporta el servicio; la *capacidad* decide la calidad. Si la demanda supera al
 * suministro no se apaga media ciudad de golpe: baja `powerRatio`, y ese ratio degrada la
 * ocupación, el ánimo y el crecimiento de forma continua (apagones parciales).
 */
export function updateServices(sim: CitySim, rebuildCoverage = true) {
  const g = sim.grid;

  let powerSupply = 0;
  let waterSupply = 0;
  let garbageCapacity = 0;
  let powerNeed = 0;
  let waterNeed = 0;
  let garbageNeed = 0;

  // --- 1. Qué edificios están enganchados a la red ---
  for (const b of sim.buildings) {
    const d = DEFS[b.kind]!;
    // Solo suministra lo que está enganchado a la red.
    const live = isHooked(sim, b.x, b.z, b.w, b.d) ? 1 : 0;
    if (d.powerSupply) powerSupply += d.powerSupply * live;
    if (d.waterSupply) waterSupply += d.waterSupply * live * (sim.powerRatio > 0.15 ? 1 : 0);
    if (d.garbageCapacity) garbageCapacity += d.garbageCapacity * live;
    // Los edificios que crecen consumen en proporción a lo ocupados que estén;
    // los servicios que coloca el jugador consumen siempre.
    const use = d.zone === "none" ? 1 : b.occupancy;
    powerNeed += d.power * use;
    waterNeed += d.water * use;
    garbageNeed += d.garbage * use;
  }

  // Las centrales dejan de comprarse combustible en bancarrota severa.
  if (sim.money < -20000) powerSupply *= 0.35;

  sim.powerSupply = powerSupply;
  sim.powerNeed = powerNeed;
  sim.waterSupply = waterSupply;
  sim.waterNeed = waterNeed;
  sim.garbageCapacity = garbageCapacity;
  sim.garbageNeed = garbageNeed;
  sim.powerRatio = powerNeed <= 0.01 ? 1 : clamp01(powerSupply / powerNeed);
  sim.waterRatio = waterNeed <= 0.01 ? 1 : clamp01(waterSupply / waterNeed);
  sim.garbageRatio = garbageNeed <= 0.01 ? 1 : clamp01(garbageCapacity / garbageNeed);

  // --- 2. Difusión por la red viaria ---
  g.powered.fill(0);
  g.watered.fill(0);
  if (powerSupply > 0) spreadFromSuppliers(sim, g.powered, "powerSupply");
  if (waterSupply > 0) spreadFromSuppliers(sim, g.watered, "waterSupply");

  // --- 3. Cobertura de servicios urbanos ---
  // Rasterizar los seis campos cuesta lo mismo que todo lo demás junto y solo cambia cuando
  // cambia el parque de equipamientos: se recalcula bajo demanda, no en cada pasada.
  if (!rebuildCoverage) return;
  for (const k of SERVICES) sim.grid.service[k]!.fill(0);
  const load: Record<string, { cap: number }> = {};
  for (const k of SERVICES) load[k] = { cap: 0 };
  for (const b of sim.buildings) {
    const d = DEFS[b.kind]!;
    if (!d.service) continue;
    if (!isOperational(sim, b)) continue;
    load[d.service.kind]!.cap += d.service.capacity;
  }
  const pop = Math.max(1, sim.pop);
  for (const b of sim.buildings) {
    const d = DEFS[b.kind]!;
    if (!d.service || !isOperational(sim, b)) continue;
    const cap = load[d.service.kind]!.cap;
    // Si el servicio está desbordado, todos sus edificios pierden fuerza.
    const saturation = d.service.kind === "garbage" ? 1 : clamp01(cap / pop);
    const strength = d.service.strength * (0.35 + 0.65 * saturation);
    stamp(
      sim.grid.service[d.service.kind]!,
      b.x + (b.w - 1) / 2,
      b.z + (b.d - 1) / 2,
      d.service.radius,
      strength,
    );
  }
  for (const k of SERVICES) {
    const f = sim.grid.service[k]!;
    blur(f, 1);
    for (let i = 0; i < CELLS; i++) f[i] = clamp01(f[i]!);
  }

  // Nivel medio de cada servicio sobre las casillas habitadas.
  sim.serviceLevel = {} as Record<string, number>;
  for (const k of SERVICES) {
    let sum = 0;
    let n = 0;
    for (const b of sim.buildings) {
      const d = DEFS[b.kind]!;
      if (!d.homes) continue;
      sum += sim.grid.service[k]![idx(b.x, b.z)]! * b.occupancy;
      n += b.occupancy;
    }
    sim.serviceLevel[k] = n > 0.001 ? clamp01(sum / n) : 0;
  }
  sim.serviceLevel.garbage = clamp01(sim.serviceLevel.garbage! * sim.garbageRatio);
}

/** ¿La parcela toca la red viaria conectada dentro de la profundidad de zonificación? */
export function isHooked(sim: CitySim, x: number, z: number, w = 1, d = 1): boolean {
  const g = sim.grid;
  for (let zz = 0; zz < d; zz++) {
    for (let xx = 0; xx < w; xx++) {
      const i = g.at(x + xx, z + zz);
      if (i >= 0 && g.roadDist[i]! <= ZONE_DEPTH) return true;
    }
  }
  return false;
}

export function isOperational(sim: CitySim, b: { x: number; z: number; w: number; d: number; kind: string }): boolean {
  const g = sim.grid;
  const i = idx(b.x, b.z);
  const def = DEFS[b.kind]!;
  if (!isHooked(sim, b.x, b.z, b.w, b.d)) return false;
  if (def.power > 0 && (!g.powered[i] || sim.powerRatio < 0.2)) return false;
  if (def.water > 0 && (!g.watered[i] || sim.waterRatio < 0.2)) return false;
  return true;
}

/**
 * Inunda un campo booleano: primero por las casillas de vía conectadas que tocan un
 * suministrador, después hacia las parcelas dentro de `ZONE_DEPTH`.
 */
function spreadFromSuppliers(sim: CitySim, out: Uint8Array, field: "powerSupply" | "waterSupply") {
  const g = sim.grid;
  let head = 0;
  let tail = 0;

  for (const b of sim.buildings) {
    const d = DEFS[b.kind]!;
    if (!d[field]) continue;
    if (!isHooked(sim, b.x, b.z, b.w, b.d)) continue;
    if (field === "waterSupply" && d.power > 0 && sim.powerRatio < 0.2) continue;
    for (let zz = 0; zz < b.d; zz++) {
      for (let xx = 0; xx < b.w; xx++) {
        const i = g.at(b.x + xx, b.z + zz);
        if (i >= 0) out[i] = 1;
      }
    }
    // El enganche puede estar a varias casillas: se busca la vía conectada más cercana.
    const hook = nearestRoad(g, b.x, b.z, b.w, b.d);
    if (hook >= 0 && !out[hook]) {
      out[hook] = 1;
      queue[tail++] = hook;
    }
  }
  // Por la red viaria.
  while (head < tail) {
    const cur = queue[head++]!;
    const x = cur % N;
    const z = (cur / N) | 0;
    for (const [dx, dz] of DIRS) {
      const j = g.at(x + dx, z + dz);
      if (j < 0 || g.road[j] === ROAD.none || !g.connected[j] || out[j]) continue;
      out[j] = 1;
      queue[tail++] = j;
    }
  }
  // Desde la vía hacia las parcelas.
  dist.fill(255);
  head = 0;
  const roadEnd = tail;
  for (let k = 0; k < roadEnd; k++) dist[queue[k]!] = 0;
  tail = roadEnd;
  while (head < tail) {
    const cur = queue[head++]!;
    const dv = dist[cur]!;
    if (dv >= ZONE_DEPTH) continue;
    const x = cur % N;
    const z = (cur / N) | 0;
    for (const [dx, dz] of DIRS) {
      const j = g.at(x + dx, z + dz);
      if (j < 0 || dist[j]! <= dv + 1) continue;
      if (g.road[j] !== ROAD.none || g.terrain[j] === 1) continue;
      dist[j] = dv + 1;
      out[j] = 1;
      queue[tail++] = j;
    }
  }
}
