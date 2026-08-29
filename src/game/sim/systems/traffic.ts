import { DEFS, ROADS } from "../catalog";
import type { CitySim } from "../city";
import { N, ROAD, TICKS_PER_DAY, clamp01, idx, type Vehicle } from "../types";
import { capacityOf, findPath, nearestRoad, roadSurface } from "./network";

const CELLS = N * N;
const load = new Float32Array(CELLS);

/** Cada cuántos ticks arranca una reasignación completa de flujos. */
export const ASSIGN_PERIOD = 24;
/** Pares origen-destino que se muestrean por reasignación. */
const OD_SAMPLES = 72;
/** Muestras que se enrutan por tick: reparte el coste en vez de concentrarlo en un frame. */
const OD_PER_TICK = 8;
const MAX_ROUTES = 64;

// Estado de la asignación en curso.
const homes: number[] = [];
const homeWeight: number[] = [];
const works: number[] = [];
const workWeight: number[] = [];
let totalHome = 0;
let totalWork = 0;
let perSample = 0;
let cursor = -1;
let pendingRoutes: Int32Array[] = [];

/**
 * Tráfico agregado + vehículos visibles.
 *
 * No se simula un agente por persona. Se muestrean pares casa→trabajo, se enrutan con A* sobre
 * la red (coste = clase de vía + congestión previa) y se acumula la carga en cada casilla. De
 * ahí sale `grid.traffic`, que alimenta la congestión, el ruido, la contaminación y el ánimo.
 * Los coches que se ven en pantalla recorren *esas mismas rutas*, así que el atasco visible y
 * el atasco simulado son el mismo.
 *
 * Las 72 rutas no se calculan de golpe (era un pico de ~7 ms en una sola frame con una ciudad
 * grande): se reparten de ocho en ocho a lo largo de nueve ticks y se publican al terminar.
 */
export function assignTraffic(sim: CitySim) {
  beginAssignment(sim);
  while (cursor >= 0) stepAssignment(sim);
}

/** Un trozo de la asignación. Lo llama el tick; arranca un ciclo nuevo cuando toca. */
export function tickAssignment(sim: CitySim) {
  if (cursor < 0) {
    if (sim.tickCount % ASSIGN_PERIOD !== 0) return;
    beginAssignment(sim);
  }
  if (cursor >= 0) stepAssignment(sim);
}

function beginAssignment(sim: CitySim) {
  const g = sim.grid;
  load.fill(0);
  homes.length = 0;
  homeWeight.length = 0;
  works.length = 0;
  workWeight.length = 0;
  totalHome = 0;
  totalWork = 0;
  pendingRoutes = [];

  for (let k = 0; k < sim.buildings.length; k++) {
    const b = sim.buildings[k]!;
    const d = DEFS[b.kind]!;
    if (b.occupancy < 0.15) continue;
    if (d.homes) {
      const w = d.homes * b.occupancy;
      homes.push(k);
      homeWeight.push(w);
      totalHome += w;
    }
    if (d.jobs) {
      const w = d.jobs * b.occupancy;
      works.push(k);
      workWeight.push(w);
      totalWork += w;
    }
  }

  if (!homes.length || !works.length) {
    g.traffic.fill(0);
    sim.congestion = 0;
    sim.routes.length = 0;
    cursor = -1;
    return;
  }
  // Viajes diarios que representa cada muestra (ida y vuelta).
  const commuters = Math.min(totalHome * 2.5 * 0.58, totalWork) * 2;
  perSample = commuters / OD_SAMPLES;
  cursor = 0;
}

function stepAssignment(sim: CitySim) {
  if (cursor < 0) return;
  const g = sim.grid;
  const end = Math.min(OD_SAMPLES, cursor + OD_PER_TICK);
  for (; cursor < end; cursor++) {
    const a = sim.buildings[pickWeighted(sim, homes, homeWeight, totalHome)]!;
    const c = sim.buildings[pickWeighted(sim, works, workWeight, totalWork)]!;
    const from = nearestRoad(g, a.x, a.z, a.w, a.d);
    const to = nearestRoad(g, c.x, c.z, c.w, c.d);
    if (from < 0 || to < 0 || from === to) continue;
    const { path } = findPath(g, from, to, 4000);
    if (!path || path.length < 2) continue;
    for (let i = 0; i < path.length; i++) load[path[i]!] += perSample;
    if (pendingRoutes.length < MAX_ROUTES) pendingRoutes.push(path);
  }
  if (cursor < OD_SAMPLES) return;
  commit(sim);
  cursor = -1;
}

function commit(sim: CitySim) {
  const g = sim.grid;
  let jamSum = 0;
  let jamW = 0;
  for (let i = 0; i < CELLS; i++) {
    if (g.road[i] === ROAD.none) {
      g.traffic[i] = 0;
      continue;
    }
    const cap = capacityOf(g, i);
    const ratio = cap > 0 ? load[i]! / cap : 0;
    // Suavizado temporal: la congestión no debe parpadear entre reasignaciones.
    g.traffic[i] = g.traffic[i]! * 0.4 + Math.min(2.5, ratio) * 0.6;
    if (load[i]! > 0) {
      jamSum += Math.min(1.6, g.traffic[i]!) * load[i]!;
      jamW += load[i]!;
    }
  }
  sim.congestion = jamW > 0 ? clamp01(jamSum / jamW) : 0;
  sim.routes = pendingRoutes;

  for (const b of sim.buildings) {
    const d = DEFS[b.kind]!;
    b.trips = Math.round((d.homes * 2.5 * 0.58 * 2 + d.jobs * 0.55) * b.occupancy);
  }
}

function pickWeighted(sim: CitySim, list: number[], weights: number[], total: number): number {
  let r = sim.rand() * total;
  for (let i = 0; i < list.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return list[i]!;
  }
  return list[list.length - 1]!;
}

/** Curva de actividad a lo largo del día: dos puntas y valle nocturno. */
export function trafficRhythm(hour: number): number {
  const morning = Math.exp(-Math.pow((hour - 8.2) / 1.9, 2));
  const evening = Math.exp(-Math.pow((hour - 18.4) / 2.2, 2));
  const midday = Math.exp(-Math.pow((hour - 13) / 3.2, 2)) * 0.45;
  const night = 0.08;
  return Math.min(1, night + morning * 0.95 + evening + midday);
}

export function updateVehicles(sim: CitySim, dt: number) {
  const g = sim.grid;
  const rhythm = trafficRhythm(sim.hour);
  const cap = Math.min(
    sim.vehicleBudget,
    Math.round((6 + Math.sqrt(Math.max(0, sim.pop)) * 2.6) * (0.25 + rhythm * 0.9)),
  );

  // Altas y bajas.
  if (sim.routes.length && sim.vehicles.length < cap && sim.tickCount % 2 === 0) {
    spawnVehicle(sim);
  }
  while (sim.vehicles.length > cap + 6) sim.vehicles.pop();

  if (dt <= 0) {
    for (const v of sim.vehicles) place(sim, v, 0);
    return;
  }

  const alive: Vehicle[] = [];
  for (const v of sim.vehicles) {
    const a = v.path[v.i]!;
    const b = v.path[v.i + 1];
    if (b === undefined) continue;
    if (g.road[a] === ROAD.none || g.road[b] === ROAD.none) continue; // la calle se demolió
    // La velocidad real cae con la congestión de la casilla que se pisa.
    const cls = g.road[b]!;
    const jam = Math.min(1, g.traffic[b]!);
    const wet = 1 - sim.rain * 0.28;
    const speed = v.speed * ROADS[cls]!.speed * (1 - jam * 0.72) * (0.35 + rhythm * 0.8) * wet;
    v.t += speed * dt;
    while (v.t >= 1) {
      v.t -= 1;
      v.i++;
      if (v.i >= v.path.length - 1) break;
    }
    if (v.i >= v.path.length - 1) continue;
    place(sim, v, dt);
    alive.push(v);
  }
  sim.vehicles = alive;
}

function spawnVehicle(sim: CitySim) {
  const route = sim.routes[(sim.rand() * sim.routes.length) | 0];
  if (!route || route.length < 3) return;
  const forward = sim.rand() < 0.5;
  const path = forward ? route : reversed(route);
  const r = sim.rand();
  const kind: Vehicle["kind"] = r < 0.72 ? 0 : r < 0.88 ? 1 : r < 0.985 ? 2 : 3;
  const palette = [
    [0xc9553f, 0xe8e4dc, 0x2f4f7a, 0x2a2e33, 0xd4b46a, 0x4a8f6e, 0x8c8f94, 0x6b3f8a],
    [0xf0f0ea, 0xd9d5c8, 0x3d7ec4],
    [0x9aa0a6, 0x5b6670, 0xb85c3c],
    [0xd83c2e],
  ][kind]!;
  sim.vehicles.push({
    id: sim.nextVehicleId++,
    kind,
    path,
    i: 0,
    t: sim.rand() * 0.5,
    speed: (kind === 3 ? 1.5 : kind === 2 ? 0.72 : 0.95) * (0.85 + sim.rand() * 0.3),
    color: palette[(sim.rand() * palette.length) | 0]!,
    lane: 1,
    x: 0,
    z: 0,
    y: 0,
    yaw: 0,
  });
  place(sim, sim.vehicles[sim.vehicles.length - 1]!, 0);
}

function reversed(a: Int32Array): Int32Array {
  const out = new Int32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[a.length - 1 - i]!;
  return out;
}

function place(sim: CitySim, v: Vehicle, dt = 0) {
  const g = sim.grid;
  const a = v.path[v.i]!;
  const b = v.path[Math.min(v.i + 1, v.path.length - 1)]!;
  const ax = a % N;
  const az = (a / N) | 0;
  const bx = b % N;
  const bz = (b / N) | 0;
  const t = Math.min(1, Math.max(0, v.t));
  const dx = bx - ax;
  const dz = bz - az;
  // Carril derecho: desplazamiento perpendicular al sentido de la marcha.
  const cls = Math.max(g.road[a]!, g.road[b]!);
  const off = ROADS[cls]!.width * 0.24 * v.lane;
  v.x = ax + 0.5 + dx * t + dz * off;
  v.z = az + 0.5 + dz * t - dx * off;
  v.y = Math.max(roadSurface(g, a), roadSurface(g, b)) + 0.05;
  // La silueta del vehículo mira a −Z; hay que girar π para que el morro apunte al destino.
  // Si no, los coches circulan marcha atrás. En las esquinas se interpola para no teletransportar el yaw.
  const target = Math.atan2(dx, dz) + Math.PI;
  if (dt <= 0) {
    v.yaw = target;
  } else {
    let dYaw = target - v.yaw;
    while (dYaw > Math.PI) dYaw -= Math.PI * 2;
    while (dYaw < -Math.PI) dYaw += Math.PI * 2;
    v.yaw += dYaw * Math.min(1, 9 * dt);
  }
}

export function hourOfTick(tick: number): number {
  return ((tick % TICKS_PER_DAY) / TICKS_PER_DAY) * 24;
}

export function tileIndex(x: number, z: number): number {
  return idx(x, z);
}
