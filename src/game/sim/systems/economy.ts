import { DEFS, ROADS, TIERS } from "../catalog";
import type { CitySim } from "../city";
import { N, ROAD, clamp, clamp01 } from "../types";
import type { BudgetLine } from "../types";

const CELLS = N * N;
/** Interés diario de la deuda (~9,5% anual). */
export const DAILY_INTEREST = 0.00025;
/** Fracción del principal que se amortiza cada día. */
export const AMORTIZATION = 1 / 360;

export const TAX_MIN = 0.02;
export const TAX_MAX = 0.24;

/** Techo de deuda según el tamaño de la ciudad. */
export function debtCeiling(sim: CitySim): number {
  return Math.round(25000 + sim.pop * 120 + sim.tier * 30000);
}

/**
 * Presupuesto diario.
 *
 * Los ingresos no son un porcentaje plano: dependen del valor del suelo (una ciudad cara
 * recauda más por vecino), del ánimo (cumplimiento fiscal) y del tipo impositivo, que a su vez
 * frena la demanda. Subir impuestos da dinero hoy y vacía barrios mañana.
 */
export function resolveBudget(sim: CitySim) {
  const g = sim.grid;
  let commercialJobs = 0;
  let industrialJobs = 0;
  let upkeepService = 0;
  let upkeepUtility = 0;

  for (const b of sim.buildings) {
    const d = DEFS[b.kind]!;
    if (d.zone === "C") commercialJobs += d.jobs * b.occupancy;
    else if (d.zone === "I") industrialJobs += d.jobs * b.occupancy;
    if (d.upkeep) {
      if (d.category === "utility") upkeepUtility += d.upkeep;
      else upkeepService += d.upkeep;
    }
  }

  let roadUpkeep = 0;
  for (let i = 0; i < CELLS; i++) {
    const cls = g.road[i]!;
    if (cls === ROAD.none || cls === ROAD.highway) continue;
    roadUpkeep += ROADS[cls]!.upkeep;
  }

  // Cumplimiento fiscal: una ciudad contenta paga; una ciudad harta, no.
  const compliance = Math.min(1.15, 0.62 + sim.happiness / 150);
  const lv = sim.avgLandValue;
  const baseR = sim.pop * (6 + lv * 17);
  const baseC = commercialJobs * (19 + lv * 26);
  const baseI = industrialJobs * 21;

  const incomeR = baseR * sim.taxR * compliance;
  const incomeC = baseC * sim.taxC * compliance;
  const incomeI = baseI * sim.taxI * compliance;
  const income = incomeR + incomeC + incomeI;

  // El ayuntamiento abarata la administración.
  const admin = sim.hasCityHall ? 0.9 : 1;
  const interest = sim.debt * DAILY_INTEREST;
  const principal = sim.debt > 0 ? Math.min(sim.debt, sim.debt * AMORTIZATION) : 0;
  // Retirada de urgencia: lo que no trata la ciudad hay que sacarlo pagando fuera.
  const haulage = Math.max(0, sim.garbageNeed - sim.garbageCapacity) * 2.2;
  const expense =
    (upkeepService + upkeepUtility + roadUpkeep) * admin + haulage + interest + principal;

  sim.debt = Math.max(0, sim.debt - principal);
  sim.money = Math.round(sim.money + income - expense);
  sim.lastIncome = Math.round(income);
  sim.lastExpense = Math.round(expense);
  sim.incomeLines = [
    { label: "Vivienda", amount: Math.round(incomeR) },
    { label: "Comercio", amount: Math.round(incomeC) },
    { label: "Industria", amount: Math.round(incomeI) },
  ];
  sim.expenseLines = [
    { label: "Servicios", amount: Math.round(upkeepService * admin) },
    { label: "Suministros", amount: Math.round(upkeepUtility * admin) },
    { label: "Vías", amount: Math.round(roadUpkeep * admin) },
    { label: "Basura sin tratar", amount: Math.round(haulage) },
    { label: "Deuda", amount: Math.round(interest + principal) },
  ].filter((l) => l.amount !== 0) as BudgetLine[];

  // Basura acumulada: si no hay planta suficiente, se amontona. Se limita a un mes de
  // producción para que la cifra siga siendo legible y el castigo no sea infinito.
  const surplus = sim.garbageNeed - sim.garbageCapacity;
  const cap = Math.max(100, sim.garbageNeed * 30);
  sim.garbageBacklog = Math.min(
    cap,
    Math.max(0, sim.garbageBacklog + surplus * (surplus > 0 ? 0.6 : 1.4)),
  );

  if (sim.money < 0 && sim.debt < debtCeiling(sim)) {
    // Descubierto automático: se convierte en deuda antes de romper la ciudad.
    const draw = Math.round(Math.min(debtCeiling(sim) - sim.debt, -sim.money + 2000));
    sim.debt += draw;
    sim.money += draw;
    sim.pushNotice("overdraft", "Números rojos: se ha abierto crédito automático. Sube impuestos o recorta.", "warn");
  } else if (sim.money < 0) {
    sim.pushNotice("bankrupt", "Sin crédito disponible. Los servicios empiezan a fallar.", "warn");
  }

  sim.history.push({
    day: sim.day,
    pop: sim.pop,
    money: sim.money,
    balance: sim.lastIncome - sim.lastExpense,
    happiness: Math.round(sim.happiness),
    landValue: Number(sim.avgLandValue.toFixed(3)),
    pollution: Number(sim.avgPollution.toFixed(3)),
  });
  if (sim.history.length > 180) sim.history.shift();
}

export function takeLoan(sim: CitySim, amount: number): boolean {
  const room = debtCeiling(sim) - sim.debt;
  const take = Math.min(amount, room);
  if (take < 500) return false;
  sim.debt += take;
  sim.money += take;
  sim.pushNotice("loan", `Préstamo de $${take.toLocaleString("es")} concedido.`, "info");
  return true;
}

export function repayLoan(sim: CitySim, amount: number): boolean {
  const pay = Math.min(amount, sim.debt, Math.max(0, sim.money));
  if (pay < 100) return false;
  sim.debt -= pay;
  sim.money -= pay;
  return true;
}

export function setTax(sim: CitySim, zone: "R" | "C" | "I", value: number) {
  const v = clamp(value, TAX_MIN, TAX_MAX);
  if (zone === "R") sim.taxR = v;
  else if (zone === "C") sim.taxC = v;
  else sim.taxI = v;
}

export function checkProgression(sim: CitySim) {
  let target = sim.tier;
  while (target + 1 < TIERS.length && sim.pop >= TIERS[target + 1]!.pop) target++;
  if (target === sim.tier) return;
  for (let t = sim.tier + 1; t <= target; t++) {
    const tier = TIERS[t]!;
    sim.money += tier.bonus;
    sim.pushNotice(
      `tier${t}`,
      `${tier.name}. Prima de $${tier.bonus.toLocaleString("es")}. Nuevo: ${tier.unlocks.join(", ")}.`,
      "good",
    );
  }
  sim.tier = target;
  sim.markCatalogChanged();
}

export function budgetHealth(sim: CitySim): number {
  return clamp01((sim.lastIncome - sim.lastExpense) / Math.max(1, sim.lastExpense));
}
