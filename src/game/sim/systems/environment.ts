import { ROADS } from "../catalog";
import { DEFS } from "../catalog";
import type { CitySim } from "../city";
import { blur, stamp } from "../fields";
import { N, ROAD, TERRAIN, clamp01, idx } from "../types";

const CELLS = N * N;

/**
 * Capa ambiental y valor del suelo.
 *
 * Contaminación y ruido se emiten desde edificios y tráfico, se difunden con el viento y
 * decaen. El valor del suelo es el nudo del juego: lo suben el paisaje, los parques y los
 * servicios; lo hunden el humo, el ruido y la falta de policía o de recogida de basura.
 * De él dependen la demanda, la subida de nivel de los edificios y los impuestos.
 */
export function updateEnvironment(sim: CitySim) {
  const g = sim.grid;

  // --- Contaminación del aire ---
  const pol = g.pollution;
  pol.fill(0);
  for (const b of sim.buildings) {
    const d = DEFS[b.kind]!;
    if (d.pollution <= 0) continue;
    const amount =
      d.pollution *
      (d.zone === "none" ? 1 : 0.25 + 0.75 * b.occupancy) *
      (d.zone === "I" && sim.policies.cleanIndustry ? 0.55 : 1);
    stamp(pol, b.x + (b.w - 1) / 2, b.z + (b.d - 1) / 2, 3 + Math.sqrt(amount) * 3.6, amount * 0.17);
  }
  // El tráfico también ensucia.
  for (let i = 0; i < CELLS; i++) {
    if (g.road[i] === ROAD.none) continue;
    const t = g.traffic[i]!;
    if (t > 0.05) pol[i] += t * 0.12;
  }
  // Los árboles y el agua limpian.
  for (let i = 0; i < CELLS; i++) {
    if (g.tree[i]) pol[i] *= 0.72;
    else if (g.terrain[i] === TERRAIN.water) pol[i] *= 0.5;
  }
  blur(pol, 2);
  // Viento constante hacia el noreste: la industria a sotavento castiga menos.
  driftField(pol, sim.windX, sim.windZ);
  for (let i = 0; i < CELLS; i++) pol[i] = clamp01(pol[i]!);

  // --- Ruido ---
  const noise = g.noise;
  noise.fill(0);
  for (const b of sim.buildings) {
    const d = DEFS[b.kind]!;
    if (d.noise <= 0) continue;
    const amount = d.noise * (d.zone === "none" ? 1 : 0.3 + 0.7 * b.occupancy);
    stamp(noise, b.x + (b.w - 1) / 2, b.z + (b.d - 1) / 2, 2.2 + amount * 2.6, amount * 0.55);
  }
  for (let i = 0; i < CELLS; i++) {
    const cls = g.road[i]!;
    if (cls === ROAD.none) continue;
    const def = ROADS[cls]!;
    noise[i] += (0.05 + Math.min(1, g.traffic[i]!) * 0.45) * (def.lanes / 3);
  }
  blur(noise, 1);
  for (let i = 0; i < CELLS; i++) noise[i] = clamp01(noise[i]!);

  // --- Valor del suelo ---
  const lv = g.landValue;
  const edu = g.service.education!;
  const hea = g.service.health!;
  const pol2 = g.service.police!;
  const lei = g.service.leisure!;
  const gar = g.service.garbage!;
  for (let i = 0; i < CELLS; i++) {
    if (g.terrain[i] === TERRAIN.water) {
      lv[i] = 0;
      continue;
    }
    let v = 0.2 + g.scenery[i]! * 0.34;
    v += edu[i]! * 0.11;
    v += hea[i]! * 0.09;
    v += pol2[i]! * 0.13;
    v += lei[i]! * 0.2;
    v += gar[i]! * 0.07 * sim.garbageRatio;
    if (g.tree[i]) v += 0.08;
    v -= g.pollution[i]! * 0.55;
    v -= g.noise[i]! * 0.28;
    // Estar cerca de la red viaria vale; estar encima de una autopista, no.
    const rd = g.roadDist[i]!;
    if (rd === 255) v -= 0.12;
    else if (rd > 0) v += 0.06 - rd * 0.012;
    lv[i] = v;
  }
  // Las amenidades (parques, ayuntamiento, vertederos) se estampan encima.
  for (const b of sim.buildings) {
    const d = DEFS[b.kind]!;
    if (!d.amenity || !d.amenityRadius) continue;
    stamp(lv, b.x + (b.w - 1) / 2, b.z + (b.d - 1) / 2, d.amenityRadius, d.amenity);
  }
  blur(lv, 1);
  for (let i = 0; i < CELLS; i++) lv[i] = clamp01(lv[i]!);

  // --- Medias de ciudad ---
  let polSum = 0;
  let noiseSum = 0;
  let lvSum = 0;
  let w = 0;
  for (const b of sim.buildings) {
    const d = DEFS[b.kind]!;
    if (!d.homes) continue;
    const i = idx(b.x, b.z);
    const weight = d.homes * b.occupancy;
    polSum += g.pollution[i]! * weight;
    noiseSum += g.noise[i]! * weight;
    lvSum += g.landValue[i]! * weight;
    w += weight;
  }
  sim.avgPollution = w > 0.001 ? polSum / w : 0;
  sim.avgNoise = w > 0.001 ? noiseSum / w : 0;
  sim.avgLandValue = w > 0.001 ? lvSum / w : averageLand(sim);
}

function averageLand(sim: CitySim): number {
  const g = sim.grid;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < CELLS; i++) {
    if (g.terrain[i] === TERRAIN.water) continue;
    sum += g.landValue[i]!;
    n++;
  }
  return n ? sum / n : 0;
}

const drifted = new Float32Array(CELLS);

/** Arrastra el campo en la dirección del viento con interpolación bilineal. */
function driftField(field: Float32Array, wx: number, wz: number) {
  drifted.set(field);
  for (let z = 0; z < N; z++) {
    for (let x = 0; x < N; x++) {
      const sx = Math.max(0, Math.min(N - 1.001, x - wx));
      const sz = Math.max(0, Math.min(N - 1.001, z - wz));
      const x0 = sx | 0;
      const z0 = sz | 0;
      const fx = sx - x0;
      const fz = sz - z0;
      const x1 = Math.min(N - 1, x0 + 1);
      const z1 = Math.min(N - 1, z0 + 1);
      const a = drifted[idx(x0, z0)]! * (1 - fx) + drifted[idx(x1, z0)]! * fx;
      const b = drifted[idx(x0, z1)]! * (1 - fx) + drifted[idx(x1, z1)]! * fx;
      field[idx(x, z)] = field[idx(x, z)]! * 0.35 + (a * (1 - fz) + b * fz) * 0.65;
    }
  }
}
