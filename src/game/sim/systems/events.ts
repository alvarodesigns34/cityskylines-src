import type { CitySim } from "../city";
import { TAX_MIN } from "./economy";
import { TICKS_PER_DAY, clamp, type CityEvent, type EventChoice, type EventKind } from "../types";

const DAY = TICKS_PER_DAY;

const WAIT: EventChoice = { id: "wait", label: "Aguantar", hint: "El episodio sigue su curso." };

/**
 * Vida de la ciudad: ciclo económico y episodios con consecuencias reales.
 *
 * La demanda R/C/I por sí sola empuja a pintar más de lo mismo. Aquí pasan cosas
 * que no se resuelven zonificando: una recesión vacía el comercio, una ola de calor
 * dispara el agua, un incendio se propaga. El jugador elige, no solo pinta.
 */
export function tickEvents(sim: CitySim) {
  tickCycle(sim);
  if (sim.event && sim.tickCount >= sim.event.endsAt) endEvent(sim);
  applyStress(sim);
  if (sim.event) return;
  if (sim.pop < 40) return;

  if (!sim.seenFirstEvent && sim.day >= 3) {
    const roll = sim.rand();
    startEvent(sim, roll < 0.34 ? "festival" : roll < 0.67 ? "boom" : "heatwave");
    sim.seenFirstEvent = true;
    return;
  }

  if (sim.day < 5) return;
  const since = sim.tickCount - sim.lastEventAt;
  if (since < DAY * 4) return;
  if (sim.rand() > 0.42) return;

  const kind = pickKind(sim);
  if (kind) startEvent(sim, kind);
}

export function startEvent(sim: CitySim, kind: EventKind): CityEvent {
  if (sim.event) endEvent(sim);
  const ev = buildEvent(sim, kind);
  sim.event = ev;
  sim.seenFirstEvent = true;
  applyStress(sim);
  return ev;
}

export function resolveEvent(sim: CitySim, choiceId: string): boolean {
  const ev = sim.event;
  if (!ev) return false;
  const choice = ev.choices.find((c) => c.id === choiceId);
  if (!choice) return false;
  const before = ev.endsAt;
  const ok = applyChoice(sim, ev, choice.id);
  if (!ok) return false;
  if (choice.id !== "wait") {
    if (ev.endsAt === before) ev.endsAt = Math.min(ev.endsAt, sim.tickCount + DAY);
    ev.body = choice.hint;
    ev.choices = [WAIT];
  }
  applyStress(sim);
  return true;
}

export function endEvent(sim: CitySim) {
  sim.event = null;
  sim.lastEventAt = sim.tickCount;
  sim.powerStress = 0;
  sim.waterStress = 0;
  sim.fireBoost = 0;
}

function tickCycle(sim: CitySim) {
  // Oscila despacio e independiente del episodio: auge y recesión de fondo.
  const pull = (sim.rand() - 0.47) * 0.08;
  sim.cycle = clamp(sim.cycle + pull, -1, 1);
}

function applyStress(sim: CitySim) {
  const ev = sim.event;
  if (!ev) {
    sim.powerStress *= 0.85;
    sim.waterStress *= 0.85;
    if (sim.powerStress < 0.02) sim.powerStress = 0;
    if (sim.waterStress < 0.02) sim.waterStress = 0;
    return;
  }
  sim.powerStress = ev.power;
  sim.waterStress = ev.water;
}

function pickKind(sim: CitySim): EventKind | null {
  const bag: EventKind[] = [];
  const push = (k: EventKind, w: number) => {
    for (let i = 0; i < w; i++) bag.push(k);
  };

  if (sim.cycle < -0.35) push("recession", 4);
  else if (sim.cycle > 0.4) push("boom", 3);
  else {
    push("recession", 1);
    push("boom", 1);
  }

  if (sim.avgPollution > 0.28) push("strike", 3);
  if ((sim.serviceLevel.police ?? 0) < 0.25 && sim.pop > 90) push("crime", 3);
  if ((sim.serviceLevel.health ?? 0) < 0.22 && sim.pop > 110) push("outbreak", 3);
  if ((sim.serviceLevel.fire ?? 0) < 0.2 && sim.tier >= 2 && sim.buildings.length > 18) push("firestorm", 2);
  if (sim.powerNeed > 40) push("outage", 2);
  if (sim.happiness > 58 && sim.occupancyR > 0.7) push("influx", 2);
  if (sim.occupancyC > 0.55) push("festival", 2);
  push("heatwave", 2);

  if (!bag.length) return null;
  return bag[(sim.rand() * bag.length) | 0]!;
}

function buildEvent(sim: CitySim, kind: EventKind): CityEvent {
  const now = sim.tickCount;
  const id = `e${now.toString(36)}`;
  const base = {
    id,
    kind,
    startedAt: now,
    endsAt: now + DAY * 5,
    demandR: 1,
    demandC: 1,
    demandI: 1,
    happy: 0,
    water: 0,
    power: 0,
    choices: [WAIT] as EventChoice[],
    tone: "info" as CityEvent["tone"],
    title: "",
    body: "",
  };

  switch (kind) {
    case "recession":
      return {
        ...base,
        title: "Recesión comercial",
        body: "Los clientes dejan de gastar. Pintar más tiendas no sirve: o bajas el IAE o aguantas el chaparrón.",
        tone: "warn",
        demandC: 0.38,
        demandI: 0.72,
        demandR: 0.82,
        happy: -8,
        endsAt: now + DAY * 6,
        choices: [
          { id: "cut_tax", label: "Bajar IAE", hint: "El comercio respira; recaudas menos unos días." },
          { id: "stimulus", label: "Inyectar 8.000 $", hint: "Ayudas a los locales con cargo a caja.", cost: 8000 },
          WAIT,
        ],
      };
    case "boom":
      return {
        ...base,
        title: "Auge económico",
        body: "Llegan pedidos de fuera. El comercio y la industria tiran; si no hay manos, el paro se dispara al revés: faltan vecinos.",
        tone: "good",
        demandC: 1.35,
        demandI: 1.28,
        demandR: 1.18,
        happy: 6,
        endsAt: now + DAY * 5,
        choices: [
          { id: "housing", label: "Ayuda a la vivienda", hint: "Se activa la subvención para que lleguen vecinos." },
          WAIT,
        ],
      };
    case "heatwave":
      return {
        ...base,
        title: "Ola de calor",
        body: "El consumo de agua se dispara. Sin más depósitos o bombeo, los barrios se vacían.",
        tone: "warn",
        water: 0.55,
        happy: -10,
        demandR: 0.7,
        endsAt: now + DAY * 4,
        choices: [
          { id: "water_ops", label: "Turno extra de agua (4.000 $)", hint: "El estrés hídrico baja a la mitad.", cost: 4000 },
          WAIT,
        ],
      };
    case "festival":
      return {
        ...base,
        title: "Feria de verano",
        body: "Visitantes de fuera. El comercio se llena y las calles se atascan. No hace falta zonificar más: es temporal.",
        tone: "good",
        demandC: 1.45,
        demandR: 0.95,
        happy: 9,
        endsAt: now + DAY * 3,
        choices: [
          { id: "sponsor", label: "Patrocinar (3.500 $)", hint: "Más ánimo y un extra de recaudación.", cost: 3500 },
          WAIT,
        ],
      };
    case "crime":
      return {
        ...base,
        title: "Ola de delitos",
        body: "Sin comisarías de verdad la gente no se muda. Una comisaría nueva vale más que otra manzana de casas.",
        tone: "warn",
        demandR: 0.45,
        demandC: 0.7,
        happy: -14,
        endsAt: now + DAY * 5,
        choices: [
          { id: "patrol", label: "Patrullas extra (5.000 $)", hint: "La sensación de seguridad remonta unos días.", cost: 5000 },
          WAIT,
        ],
      };
    case "influx":
      return {
        ...base,
        title: "Oleada de vecinos",
        body: "Llegan familias. Si no hay casas libres se amontonan y el ánimo cae; si hay, la ciudad pega un estirón.",
        tone: "info",
        demandR: 1.55,
        demandC: 1.1,
        endsAt: now + DAY * 4,
        choices: [
          { id: "housing", label: "Ayuda a la vivienda", hint: "Se activa la subvención para absorber la oleada." },
          WAIT,
        ],
      };
    case "strike":
      return {
        ...base,
        title: "Huelga industrial",
        body: "Las fábricas paran por el humo y los sueldos. Más naves no arreglan esto: o limpias la industria o cedes.",
        tone: "warn",
        demandI: 0.25,
        demandC: 0.85,
        happy: -7,
        endsAt: now + DAY * 4,
        choices: [
          { id: "clean", label: "Industria limpia", hint: "Se activa la ordenanza; cuesta dinero cada día." },
          { id: "raise_wage", label: "Plus (6.000 $)", hint: "La huelga se acorta.", cost: 6000 },
          WAIT,
        ],
      };
    case "outbreak":
      return {
        ...base,
        title: "Brote sanitario",
        body: "La gente enferma. Sin consultorio u hospital la ocupación se hunde. No es un problema de zonas.",
        tone: "warn",
        demandR: 0.5,
        demandC: 0.6,
        happy: -16,
        endsAt: now + DAY * 5,
        choices: [
          { id: "clinic_rush", label: "Campaña sanitaria (7.000 $)", hint: "El brote pierde fuerza.", cost: 7000 },
          WAIT,
        ],
      };
    case "outage":
      return {
        ...base,
        title: "Avería en la red eléctrica",
        body: "Una central falla. Toda la ciudad parpadea hasta que reparas o pones otra.",
        tone: "warn",
        power: 0.45,
        demandR: 0.75,
        demandC: 0.7,
        demandI: 0.65,
        endsAt: now + DAY * 3,
        choices: [
          { id: "repair", label: "Reparar (9.000 $)", hint: "La potencia vuelve casi del todo.", cost: 9000 },
          WAIT,
        ],
      };
    case "firestorm":
      return {
        ...base,
        title: "Jornada de incendios",
        body: "El fuego salta de parcela en parcela. Sin bomberos se pierde el barrio; con ellos se ataja.",
        tone: "warn",
        happy: -12,
        demandR: 0.7,
        endsAt: now + DAY * 3,
        choices: [
          { id: "dispatch", label: "Movilizar (4.500 $)", hint: "La cobertura de bomberos se refuerza unos días.", cost: 4500 },
          WAIT,
        ],
      };
    default:
      return base;
  }
}

function applyChoice(sim: CitySim, ev: CityEvent, id: string): boolean {
  const pay = (n: number) => {
    if (sim.money < n) {
      sim.pushNotice("broke", "No hay fondos para esa medida.", "warn");
      return false;
    }
    sim.money -= n;
    return true;
  };

  switch (id) {
    case "cut_tax":
      sim.taxC = Math.max(TAX_MIN, sim.taxC - 0.05);
      ev.demandC = Math.min(1.05, ev.demandC + 0.4);
      ev.happy += 4;
      return true;
    case "stimulus":
      if (!pay(8000)) return false;
      ev.demandC = Math.min(1.1, ev.demandC + 0.35);
      ev.endsAt = sim.tickCount + DAY * 2;
      return true;
    case "housing":
      sim.policies.housingGrant = true;
      ev.demandR = Math.max(ev.demandR, 1.2);
      return true;
    case "water_ops":
      if (!pay(4000)) return false;
      ev.water *= 0.4;
      return true;
    case "sponsor":
      if (!pay(3500)) return false;
      ev.happy += 8;
      sim.money += 1800;
      return true;
    case "patrol":
      if (!pay(5000)) return false;
      ev.demandR = Math.max(ev.demandR, 0.85);
      ev.happy += 8;
      return true;
    case "clean":
      sim.policies.cleanIndustry = true;
      ev.demandI = Math.max(ev.demandI, 0.7);
      ev.endsAt = sim.tickCount + DAY * 2;
      return true;
    case "raise_wage":
      if (!pay(6000)) return false;
      ev.demandI = Math.max(ev.demandI, 0.75);
      ev.endsAt = sim.tickCount + DAY;
      return true;
    case "clinic_rush":
      if (!pay(7000)) return false;
      ev.demandR = Math.max(ev.demandR, 0.8);
      ev.happy += 10;
      ev.endsAt = sim.tickCount + DAY * 2;
      return true;
    case "repair":
      if (!pay(9000)) return false;
      ev.power = 0.08;
      ev.endsAt = sim.tickCount + Math.round(DAY * 0.6);
      return true;
    case "dispatch":
      if (!pay(4500)) return false;
      sim.fireBoost = 0.55;
      ev.endsAt = sim.tickCount + DAY;
      return true;
    default:
      return true;
  }
}

export function demandMul(sim: CitySim, zone: "R" | "C" | "I"): number {
  const ev = sim.event;
  const cycle =
    zone === "C" ? 1 + sim.cycle * 0.42 : zone === "I" ? 1 + sim.cycle * 0.22 : 1 + sim.cycle * 0.12;
  const eventMul = ev ? (zone === "R" ? ev.demandR : zone === "C" ? ev.demandC : ev.demandI) : 1;
  return cycle * eventMul;
}

export function eventHappiness(sim: CitySim): number {
  return sim.event?.happy ?? 0;
}
