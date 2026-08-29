import { DEFS } from "../catalog";
import type { CitySim } from "../city";
import { clamp01, idx, lerp } from "../types";

/** Personas por hogar. */
export const HOUSEHOLD_SIZE = 2.5;
/** Fracción de la población en edad de trabajar. */
export const ACTIVE_RATE = 0.58;

/**
 * Personas, empleo, formación, salud y ánimo.
 *
 * La ocupación de cada edificio no es un interruptor: es el resultado continuo de lo bien
 * servida que está su parcela (luz, agua, valor del suelo, servicios, atascos) y de si hay
 * gente o clientes que lo llenen. De ahí salen población, paro y ánimo.
 */
export function updatePopulation(sim: CitySim) {
  const g = sim.grid;

  // --- Formación de la población: converge hacia la cobertura educativa ---
  const eduTarget = clamp01(sim.serviceLevel.education ?? 0);
  sim.eduLevel = lerp(sim.eduLevel, eduTarget, 0.004);
  // La salud depende del consultorio y del aire que se respira.
  sim.healthLevel = clamp01((sim.serviceLevel.health ?? 0) * 0.85 + 0.25 - sim.avgPollution * 0.55);
  sim.safetyLevel = clamp01((sim.serviceLevel.police ?? 0) * 0.9 + 0.18 - sim.avgPollution * 0.1);

  // --- Reparto del empleo por nivel formativo (con datos del tick anterior) ---
  const workers = Math.max(0, sim.pop * ACTIVE_RATE);
  const share2 = 0.04 + 0.42 * sim.eduLevel;
  const share1 = 0.22 + 0.34 * sim.eduLevel;
  const share0 = Math.max(0, 1 - share1 - share2);
  let pool2 = workers * share2;
  const pool1 = workers * share1;
  const pool0 = workers * share0;

  const jobsBy = [0, 0, 0];
  for (const b of sim.buildings) {
    const d = DEFS[b.kind]!;
    if (!d.jobs) continue;
    jobsBy[d.jobEdu] += d.jobs * b.occupancy;
  }
  // Los cualificados pueden bajar de categoría, no al revés.
  const fill2 = jobsBy[2]! > 0 ? Math.min(1, pool2 / jobsBy[2]!) : 1;
  pool2 = Math.max(0, pool2 - jobsBy[2]!);
  const supply1 = pool1 + pool2;
  const fill1 = jobsBy[1]! > 0 ? Math.min(1, supply1 / jobsBy[1]!) : 1;
  const left1 = Math.max(0, supply1 - jobsBy[1]!);
  const supply0 = pool0 + left1;
  const fill0 = jobsBy[0]! > 0 ? Math.min(1, supply0 / jobsBy[0]!) : 1;
  sim.jobFill = [fill0, fill1, fill2];

  const jobsTotal = jobsBy[0]! + jobsBy[1]! + jobsBy[2]!;
  const filled = jobsBy[0]! * fill0 + jobsBy[1]! * fill1 + jobsBy[2]! * fill2;
  sim.unemployment = workers > 1 ? clamp01((workers - filled) / workers) : 0;
  sim.jobs = Math.round(jobsTotal);
  sim.workers = Math.round(workers);

  // Clientes por puesto comercial: sin vecinos, el comercio no llena.
  const customers = jobsBy.length ? sim.pop : 0;
  const commercialJobs = sumJobs(sim, "C");
  const trade = commercialJobs > 0 ? clamp01(customers / (commercialJobs * 3.4)) : 1;
  // La industria vende fuera, pero necesita mano de obra y salida por carretera.
  const industry = clamp01(1 - sim.congestion * 0.55);

  // --- Ocupación edificio a edificio ---
  let households = 0;
  let homesCapacity = 0;
  let popRaw = 0;
  let wellSum = 0;
  let wellN = 0;
  const occSum = { R: 0, C: 0, I: 0 };
  const occCap = { R: 0, C: 0, I: 0 };

  for (const b of sim.buildings) {
    const d = DEFS[b.kind]!;
    const i = idx(b.x, b.z);
    const powered = d.power > 0 ? (g.powered[i] ? sim.powerRatio : 0) : 1;
    const watered = d.water > 0 ? (g.watered[i] ? sim.waterRatio : 0) : 1;
    const lv = g.landValue[i]!;
    const services =
      (sim.grid.service.education![i]! * 0.22 +
        sim.grid.service.health![i]! * 0.22 +
        sim.grid.service.police![i]! * 0.24 +
        sim.grid.service.leisure![i]! * 0.16 +
        sim.grid.service.garbage![i]! * 0.16 * sim.garbageRatio);
    const nuisance = g.pollution[i]! * 0.6 + g.noise[i]! * 0.35;

    // Bienestar de la parcela: la señal que decide llenarse, subir de nivel o vaciarse.
    const well = clamp01(
      0.18 +
        powered * 0.2 +
        watered * 0.18 +
        lv * 0.24 +
        services * 0.3 -
        nuisance * 0.45 -
        sim.congestion * 0.12,
    );
    b.wellbeing = lerp(b.wellbeing, well, 0.05);

    let target: number;
    if (d.zone === "none") {
      // Servicios y utilidades: funcionan si tienen enganche y suministro.
      target = powered > 0.2 && watered > 0.2 ? 1 : 0.15;
    } else if (d.zone === "R") {
      // Un barrio con luz, agua y sin molestias se llena aunque no tenga aún servicios;
      // el bienestar decide cuánto más se llena, no si se llena.
      target = powered * watered * (0.55 + 0.45 * b.wellbeing);
      target *= 0.55 + 0.45 * clamp01(1 - sim.unemployment * 1.4);
      // Una ciudad infeliz pierde vecinos: si el ánimo se hunde, la gente se marcha.
      target *= 0.4 + 0.6 * clamp01((sim.happiness - 12) / 48);
    } else if (d.zone === "C") {
      target = powered * watered * (0.45 + 0.55 * b.wellbeing) * (0.35 + 0.65 * trade);
      target *= 0.35 + 0.65 * (sim.jobFill[d.jobEdu] ?? 1);
    } else {
      target = powered * watered * (0.45 + 0.55 * b.wellbeing) * (0.4 + 0.6 * industry);
      target *= 0.35 + 0.65 * (sim.jobFill[d.jobEdu] ?? 1);
    }
    target = clamp01(target);

    const rate = target > b.occupancy ? 0.035 : 0.06;
    b.occupancy = clamp01(b.occupancy + (target - b.occupancy) * rate);
    b.age += 1;

    if (d.homes) {
      households += d.homes * b.occupancy;
      homesCapacity += d.homes;
      popRaw += d.homes * b.occupancy * HOUSEHOLD_SIZE;
    }
    if (d.zone !== "none") {
      wellSum += b.wellbeing;
      wellN++;
      const cap = d.homes || d.jobs;
      occSum[d.zone] += b.occupancy * cap;
      occCap[d.zone] += cap;
    }
  }

  // Ocupación media por zona: es la señal de "queda sitio" que mueve la demanda.
  sim.occupancyR = occCap.R > 0 ? occSum.R / occCap.R : 0;
  sim.occupancyC = occCap.C > 0 ? occSum.C / occCap.C : 0;
  sim.occupancyI = occCap.I > 0 ? occSum.I / occCap.I : 0;

  sim.households = Math.round(households);
  sim.homesCapacity = Math.round(homesCapacity * HOUSEHOLD_SIZE);
  sim.pop = Math.round(popRaw);
  sim.avgWellbeing = wellN ? wellSum / wellN : 0;

  // --- Ánimo ---
  // Base neutra: un pueblo limpio y sin servicios está "bien"; los servicios suman de verdad
  // y las molestias restan. Así el ánimo no arranca hundido en la primera hora de partida.
  let happy = 58;
  happy += (sim.avgLandValue - 0.3) * 45;
  happy += (sim.serviceLevel.education ?? 0) * 12;
  happy += (sim.serviceLevel.health ?? 0) * 14;
  happy += (sim.serviceLevel.police ?? 0) * 12;
  happy += (sim.serviceLevel.leisure ?? 0) * 14;
  happy -= sim.avgPollution * 38;
  happy -= sim.avgNoise * 16;
  happy -= sim.unemployment * 45;
  happy -= sim.congestion * 22;
  happy -= (1 - sim.powerRatio) * 45;
  happy -= (1 - sim.waterRatio) * 40;
  happy -= clamp01(sim.garbageBacklog / Math.max(80, sim.pop * 0.8)) * 30;
  const avgTax = (sim.taxR + sim.taxC + sim.taxI) / 3;
  happy -= (avgTax - 0.11) * 180;
  happy -= sim.rain * 4;
  sim.happiness = Math.max(3, Math.min(99, happy));
}

function sumJobs(sim: CitySim, zone: string): number {
  let n = 0;
  for (const b of sim.buildings) {
    const d = DEFS[b.kind]!;
    if (d.zone === zone) n += d.jobs * b.occupancy;
  }
  return n;
}
