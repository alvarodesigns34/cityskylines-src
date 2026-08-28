import { DEFS, chainFor } from "../catalog";
import type { CitySim } from "../city";
import { hash2 } from "../rng";
import { N, ZONE_OF_ID, clamp01, idx, type Zone } from "../types";
import { ZONE_DEPTH, facingRoad } from "./network";

const CELLS = N * N;
const candidates = new Int32Array(CELLS);
let candidateCount = 0;

/**
 * Demanda, crecimiento, subida de nivel y abandono.
 *
 * La demanda no es un número suelto: sale del desequilibrio entre vecinos y empleo, y la
 * frenan los impuestos y el ánimo. Una parcela crece si está servida; sube de nivel si además
 * tiene valor de suelo; y se abandona si el bienestar se hunde durante suficiente tiempo.
 */
export function updateDemand(sim: CitySim) {
  let commercialJobs = 0;
  let industrialJobs = 0;
  for (const b of sim.buildings) {
    const d = DEFS[b.kind]!;
    if (d.zone === "C") commercialJobs += d.jobs * b.occupancy;
    else if (d.zone === "I") industrialJobs += d.jobs * b.occupancy;
  }

  const workers = Math.max(1, sim.workers);
  const jobSurplus = (sim.jobs - workers) / Math.max(25, workers);
  // "Queda sitio" se mide por lo llenos que están los edificios existentes, no por la
  // capacidad nominal: un bloque medio vacío frena la demanda mucho antes que uno lleno.
  const slackR = clamp01((0.9 - sim.occupancyR) * 2.2);
  const slackC = clamp01((0.88 - sim.occupancyC) * 2);
  const slackI = clamp01((0.88 - sim.occupancyI) * 2);

  let dR = 0.34 + jobSurplus * 0.7 - slackR * 0.5 + (sim.happiness - 52) / 260;
  // Reparto objetivo del empleo: comercio ~26% de la población, industria ~32%.
  // La suma se acerca a la población activa (58%), para que no haya paro estructural.
  const cNeed = sim.pop * 0.26;
  let dC = 0.24 + ((cNeed - commercialJobs) / Math.max(18, cNeed)) * 0.8 - slackC * 0.3;
  const iNeed = sim.pop * 0.32 + 8;
  let dI = 0.24 + ((iNeed - industrialJobs) / Math.max(16, iNeed)) * 0.8 - slackI * 0.3;

  // Los impuestos altos espantan; los bajos atraen.
  dR *= clamp01(1 - (sim.taxR - 0.09) * 2.6);
  dC *= clamp01(1 - (sim.taxC - 0.09) * 2.6);
  dI *= clamp01(1 - (sim.taxI - 0.09) * 2.6);

  // Sin trabajo no llegan vecinos; sin vecinos no abre nadie.
  if (sim.pop > 40 && sim.unemployment > 0.28) dR *= 0.35;
  if (sim.pop < 45) dR = Math.max(dR, 0.62);
  if (sim.pop > 25 && sim.jobs < sim.workers * 0.8) {
    dC = Math.max(dC, 0.5);
    dI = Math.max(dI, 0.55);
  }

  sim.demandR = clamp01(dR);
  sim.demandC = clamp01(dC);
  sim.demandI = clamp01(dI);
}

/** Refresca la lista de parcelas vacías listas para construir. */
export function refreshCandidates(sim: CitySim) {
  const g = sim.grid;
  candidateCount = 0;
  for (let i = 0; i < CELLS; i++) {
    if (g.zone[i] === 0) continue;
    if (g.building[i]! >= 0) continue;
    if (!g.buildable(i)) continue;
    if (g.roadDist[i]! > ZONE_DEPTH) continue;
    if (!g.powered[i] || !g.watered[i]) continue;
    candidates[candidateCount++] = i;
  }
}

export function updateGrowth(sim: CitySim) {
  if (sim.money < -30000) return;
  const g = sim.grid;
  const demandOf = (z: Zone) => (z === "R" ? sim.demandR : z === "C" ? sim.demandC : sim.demandI);

  // Ritmo de construcción proporcional a la ciudad, con techo para no petar un tick.
  const budget = Math.min(6, 1 + Math.floor(sim.pop / 260));
  let built = 0;
  let tries = Math.min(candidateCount, 40);
  while (tries-- > 0 && built < budget && candidateCount > 0) {
    const pick = (sim.rand() * candidateCount) | 0;
    const i = candidates[pick]!;
    if (g.building[i]! >= 0 || g.zone[i] === 0) {
      candidates[pick] = candidates[--candidateCount]!;
      continue;
    }
    const zone = ZONE_OF_ID[g.zone[i]!]!;
    const demand = demandOf(zone);
    if (demand < 0.08) continue;
    // El valor del suelo decide *dónde* se construye antes: los sitios buenos se llenan primero.
    const attractiveness = 0.35 + g.landValue[i]! * 0.65;
    if (sim.rand() > demand * attractiveness * 0.55) continue;

    const density = g.density[i] ? "high" : "low";
    const chain = chainFor(zone, density);
    const kind = chain[0];
    if (!kind) continue;
    spawnBuilding(sim, i % N, (i / N) | 0, kind);
    candidates[pick] = candidates[--candidateCount]!;
    built++;
  }
  if (built) sim.markBuildingsChanged();
}

export function updateUpgrades(sim: CitySim) {
  const g = sim.grid;
  for (let k = 0; k < sim.buildings.length; k++) {
    const b = sim.buildings[k]!;
    const d = DEFS[b.kind]!;
    if (d.zone === "none") continue;
    if (b.age < 80 || b.occupancy < 0.62) continue;
    const i = idx(b.x, b.z);
    const density = g.density[i] ? "high" : "low";
    const chain = chainFor(b.zone, density);
    const at = chain.indexOf(b.kind);

    // Cambio de densidad: si el jugador reclasifica, el edificio migra de familia.
    if (at < 0) {
      const migrated = chain[Math.min(chain.length - 1, d.level - 1)];
      if (migrated && tryReplace(sim, k, migrated)) continue;
      continue;
    }
    const next = chain[at + 1];
    if (!next) continue;
    const nd = DEFS[next]!;
    if (sim.tier < nd.level - 1) continue;
    const lv = g.landValue[i]!;
    // Subir de nivel exige valor de suelo, bienestar y demanda sostenida.
    const need = 0.1 + nd.level * 0.09;
    if (lv < need || b.wellbeing < 0.34) continue;
    // La subida de nivel la manda el valor del suelo, no la demanda: en una ciudad llena la
    // demanda es cero por definición y la única forma de crecer es densificar.
    const demand = b.zone === "R" ? sim.demandR : b.zone === "C" ? sim.demandC : sim.demandI;
    if (demand < 0.02 && b.occupancy < 0.9) continue;
    if (sim.rand() > 0.016 * (0.25 + lv * 1.5)) continue;
    tryReplace(sim, k, next);
  }
}

export function updateAbandon(sim: CitySim) {
  const g = sim.grid;
  for (let k = sim.buildings.length - 1; k >= 0; k--) {
    const b = sim.buildings[k]!;
    const d = DEFS[b.kind]!;
    if (d.zone === "none") continue;
    if (b.age < 120) continue;
    if (b.occupancy > 0.06 || b.wellbeing > 0.2) continue;
    removeBuilding(sim, k);
    sim.pushNotice("abandon", "Se abandonan edificios: revisa servicios, empleo y contaminación.", "warn");
  }
  // Incendios: sin cobertura de bomberos, algún edificio arde de verdad.
  if (sim.tier >= 2 && sim.buildings.length > 12) {
    const k = (sim.rand() * sim.buildings.length) | 0;
    const b = sim.buildings[k];
    if (b && DEFS[b.kind]!.zone !== "none") {
      const cover = g.service.fire![idx(b.x, b.z)]!;
      const risk = (1 - cover) * 0.0009 * (1 + DEFS[b.kind]!.pollution * 0.4);
      if (sim.rand() < risk) {
        removeBuilding(sim, k);
        sim.pushNotice("fire", "Incendio sin cobertura de bomberos: un edificio ha ardido.", "warn");
      }
    }
  }
}

/** Sustituye un edificio por el siguiente de su familia, ampliando la parcela si hace falta. */
function tryReplace(sim: CitySim, index: number, kind: string): boolean {
  const b = sim.buildings[index]!;
  const nd = DEFS[kind]!;
  if (nd.w === b.w && nd.d === b.d) {
    b.kind = kind;
    b.level = nd.level;
    b.age = 0;
    b.occupancy = Math.max(0.35, b.occupancy * 0.6);
    b.variant = (hash2(b.x, b.z, sim.seed + nd.level) * 1024) | 0;
    b.rot = facingRoad(sim.grid, b.x, b.z, b.w, b.d);
    sim.markBuildingsChanged();
    return true;
  }
  // Buscar un origen para la nueva huella que contenga la parcela actual.
  const origin = findFootprint(sim, b.x, b.z, nd.w, nd.d, index);
  if (!origin) return false;
  clearCells(sim, b);
  b.kind = kind;
  b.level = nd.level;
  b.x = origin.x;
  b.z = origin.z;
  b.w = nd.w;
  b.d = nd.d;
  b.age = 0;
  b.occupancy = Math.max(0.3, b.occupancy * 0.5);
  b.variant = (hash2(b.x, b.z, sim.seed + nd.level) * 1024) | 0;
  b.rot = facingRoad(sim.grid, b.x, b.z, b.w, b.d);
  fillCells(sim, b, index);
  sim.markBuildingsChanged();
  return true;
}

function findFootprint(
  sim: CitySim,
  bx: number,
  bz: number,
  w: number,
  d: number,
  selfIndex: number,
): { x: number; z: number } | null {
  const g = sim.grid;
  const wantZone = g.zone[idx(bx, bz)]!;
  const wantDensity = g.density[idx(bx, bz)]!;
  for (let oz = 0; oz < d; oz++) {
    for (let ox = 0; ox < w; ox++) {
      const x = bx - ox;
      const z = bz - oz;
      let ok = true;
      for (let zz = 0; zz < d && ok; zz++) {
        for (let xx = 0; xx < w && ok; xx++) {
          const i = g.at(x + xx, z + zz);
          if (i < 0) ok = false;
          else if (g.zone[i] !== wantZone || g.density[i] !== wantDensity) ok = false;
          else if (!g.buildable(i) && g.building[i] !== selfIndex) ok = false;
          else if (g.building[i]! >= 0 && g.building[i] !== selfIndex) ok = false;
          else if (g.roadDist[i]! > ZONE_DEPTH) ok = false;
        }
      }
      if (ok) return { x, z };
    }
  }
  return null;
}

export function spawnBuilding(sim: CitySim, x: number, z: number, kind: string): number | null {
  const g = sim.grid;
  const d = DEFS[kind]!;
  for (let zz = 0; zz < d.d; zz++) {
    for (let xx = 0; xx < d.w; xx++) {
      const i = g.at(x + xx, z + zz);
      if (i < 0 || !g.buildable(i)) return null;
    }
  }
  const index = sim.buildings.length;
  const b = {
    id: sim.nextBuildingId++,
    kind,
    zone: d.zone,
    x,
    z,
    w: d.w,
    d: d.d,
    rot: facingRoad(g, x, z, d.w, d.d),
    level: d.level,
    variant: (hash2(x, z, sim.seed) * 1024) | 0,
    occupancy: d.zone === "none" ? 1 : 0.12,
    age: 0,
    wellbeing: 0.4,
    trips: 0,
  };
  sim.buildings.push(b);
  fillCells(sim, b, index);
  sim.markBuildingsChanged();
  return index;
}

function fillCells(sim: CitySim, b: { x: number; z: number; w: number; d: number }, index: number) {
  const g = sim.grid;
  for (let zz = 0; zz < b.d; zz++) {
    for (let xx = 0; xx < b.w; xx++) {
      const i = g.at(b.x + xx, b.z + zz);
      if (i < 0) continue;
      g.building[i] = index;
      g.tree[i] = 0;
    }
  }
}

function clearCells(sim: CitySim, b: { x: number; z: number; w: number; d: number }) {
  const g = sim.grid;
  for (let zz = 0; zz < b.d; zz++) {
    for (let xx = 0; xx < b.w; xx++) {
      const i = g.at(b.x + xx, b.z + zz);
      if (i >= 0) g.building[i] = -1;
    }
  }
}

/** Borra por índice con swap-remove, reparando el índice del edificio movido. */
export function removeBuilding(sim: CitySim, index: number) {
  const b = sim.buildings[index];
  if (!b) return;
  clearCells(sim, b);
  const last = sim.buildings.length - 1;
  if (index !== last) {
    const moved = sim.buildings[last]!;
    sim.buildings[index] = moved;
    fillCells(sim, moved, index);
  }
  sim.buildings.pop();
  sim.markBuildingsChanged();
}
