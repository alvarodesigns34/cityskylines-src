import {
  BULLDOZE_BUILDING,
  BULLDOZE_ROAD,
  BULLDOZE_ZONE,
  DEFS,
  ROADS,
  START_MONEY,
  TIERS,
  UNIQUE_KINDS,
} from "./catalog";
import { Grid } from "./grid";
import { generateMap } from "./generate";
import { mulberry32 } from "./rng";
import { readSave, type SaveBlob, writeSave } from "./save";
import { updateEnvironment } from "./systems/environment";
import { checkProgression, resolveBudget } from "./systems/economy";
import { ZONE_DEPTH, facingRoad, rebuildNetwork } from "./systems/network";
import { updatePopulation } from "./systems/population";
import { isHooked, updateServices } from "./systems/services";
import { assignTraffic, tickAssignment, updateVehicles } from "./systems/traffic";
import {
  refreshCandidates,
  removeBuilding,
  spawnBuilding,
  updateAbandon,
  updateDemand,
  updateGrowth,
  updateUpgrades,
} from "./systems/zoning";
import {
  DIRS,
  N,
  ROAD,
  SERVICES,
  SIM_DT,
  SPEEDS,
  TERRAIN,
  TICKS_PER_DAY,
  ZONE_ID,
  clamp01,
  idx,
  inBounds,
  type Building,
  type BudgetLine,
  type HistoryPoint,
  type Notice,
  type OverlayKind,
  type Policies,
  type Snapshot,
  type Tool,
  type Vehicle,
  type Zone,
  DEFAULT_POLICIES,
} from "./types";

let noticeSeq = 1;

/** Coste de plantar un árbol en una parcela vacía. */
const TREE_COST = 18;

export interface PlaceCheck {
  ok: boolean;
  reason?: string;
  cost: number;
  w: number;
  d: number;
}

/**
 * Estado y orquestación de la ciudad.
 *
 * `CitySim` guarda el estado y decide *cuándo* corre cada subsistema; las reglas viven en
 * `systems/`. Nada de aquí conoce Three.js: el render solo lee este objeto y los contadores
 * de versión para saber qué mallas rehacer.
 */
export class CitySim {
  seed = 0;
  name = "";
  grid!: Grid;
  entry = { x: 0, z: 0 };
  buildings: Building[] = [];
  vehicles: Vehicle[] = [];
  routes: Int32Array[] = [];
  rand: () => number = Math.random;

  // Tiempo. Arranca a las 7:00; tickCount tiene que coincidir o el primer tick salta a medianoche.
  tickCount = Math.round((7 / 24) * TICKS_PER_DAY);
  day = 1;
  hour = 7;
  dayFraction = 7 / 24;
  acc = 0;
  speed = 1;
  paused = false;

  // Dinero
  money = START_MONEY;
  debt = 0;
  taxR = 0.11;
  taxC = 0.11;
  taxI = 0.11;
  lastIncome = 0;
  lastExpense = 0;
  incomeLines: BudgetLine[] = [];
  expenseLines: BudgetLine[] = [];
  history: HistoryPoint[] = [];

  // Gente
  pop = 0;
  households = 0;
  homesCapacity = 0;
  workers = 0;
  jobs = 0;
  unemployment = 0;
  eduLevel = 0.1;
  healthLevel = 0.2;
  safetyLevel = 0.2;
  happiness = 55;
  avgWellbeing = 0.4;
  occupancyR = 0;
  occupancyC = 0;
  occupancyI = 0;
  jobFill: number[] = [1, 1, 1];

  // Entorno
  avgPollution = 0;
  avgNoise = 0;
  avgLandValue = 0.3;
  congestion = 0;
  windX = 0.6;
  windZ = -0.4;
  rain = 0;
  rainTarget = 0;
  policies: Policies = { ...DEFAULT_POLICIES };

  // Servicios
  powerNeed = 0;
  powerSupply = 0;
  powerRatio = 1;
  waterNeed = 0;
  waterSupply = 0;
  waterRatio = 1;
  garbageNeed = 0;
  garbageCapacity = 0;
  garbageRatio = 1;
  garbageBacklog = 0;
  serviceLevel: Record<string, number> = {};

  // Demanda y progresión
  demandR = 0.6;
  demandC = 0.2;
  demandI = 0.2;
  tier = 0;
  hasCityHall = false;

  // Red
  roadCount = 0;
  connectedCity = false;

  // UI
  notices: Notice[] = [];
  noticeCooldown = new Map<string, number>();
  tool: Tool = "road-street";
  overlay: OverlayKind = "none";
  hover: { x: number; z: number } | null = null;
  selected: { x: number; z: number } | null = null;

  // Versiones para el render
  buildingsVersion = 1;
  roadsVersion = 1;
  zonesVersion = 1;
  treesVersion = 1;
  terrainVersion = 1;
  fieldsVersion = 1;
  catalogVersion = 1;

  nextBuildingId = 1;
  nextVehicleId = 1;
  vehicleBudget = 140;

  /** Versión de edificios con la que se rasterizó por última vez la cobertura. */
  private coverageVersion = -1;
  private netDirty = true;
  private servicesDirty = true;

  constructor(seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0) {
    this.seed = seed >>> 0;
    this.rand = mulberry32(this.seed);
    const gen = generateMap(this.seed);
    this.grid = gen.grid;
    this.name = gen.name;
    this.entry = gen.entry;
    const a = (this.seed % 360) * (Math.PI / 180);
    this.windX = Math.cos(a) * 0.9;
    this.windZ = Math.sin(a) * 0.9;
    for (const k of SERVICES) this.serviceLevel[k] = 0;
    this.refreshAll();
    this.pushNotice(
      "welcome",
      "Prolonga la autovía con calles, zonifica junto a ellas y engancha luz y agua.",
      "info",
    );
  }

  // ------------------------------------------------------------------ tick

  step(dt: number) {
    const d = Math.min(dt, 0.12);
    const factor = this.paused ? 0 : (SPEEDS[this.speed] ?? 1);
    if (factor === 0) {
      updateVehicles(this, 0);
      return;
    }
    this.acc += d * factor;
    let guard = 0;
    while (this.acc >= SIM_DT && guard++ < 12) {
      this.acc -= SIM_DT;
      this.simTick();
    }
    updateVehicles(this, d * factor);
  }

  private simTick() {
    this.tickCount++;
    const t = this.tickCount % TICKS_PER_DAY;
    this.dayFraction = t / TICKS_PER_DAY;
    this.hour = this.dayFraction * 24;
    if (t === 0) {
      this.day++;
      resolveBudget(this);
      checkProgression(this);
    }

    if (this.netDirty) {
      const r = rebuildNetwork(this.grid);
      this.roadCount = r.roadCount;
      this.connectedCity = r.connected;
      this.netDirty = false;
      this.servicesDirty = true;
    }
    if (this.servicesDirty || this.tickCount % 6 === 0) {
      const coverageStale = this.servicesDirty || this.coverageVersion !== this.buildingsVersion;
      updateServices(this, coverageStale);
      if (coverageStale) this.coverageVersion = this.buildingsVersion;
      this.servicesDirty = false;
      this.fieldsVersion++;
    }

    updatePopulation(this);

    if (this.tickCount % 8 === 0) updateDemand(this);
    if (this.tickCount % 6 === 0) refreshCandidates(this);
    updateGrowth(this);
    if (this.tickCount % 20 === 0) updateUpgrades(this);
    if (this.tickCount % 30 === 0) updateAbandon(this);
    tickAssignment(this);
    if (this.tickCount % 14 === 0) {
      updateEnvironment(this);
      this.fieldsVersion++;
    }
    if (this.tickCount % 40 === 0) {
      this.pruneNotices();
      this.advise();
    }
    this.tickWeather();
  }

  /** Frente de lluvia: entra y sale despacio para que el cielo y el tráfico no den saltos. */
  private tickWeather() {
    if (this.tickCount % 90 === 0) {
      this.rainTarget = this.rand() < 0.28 ? 0.45 + this.rand() * 0.55 : 0;
    }
    this.rain += (this.rainTarget - this.rain) * 0.04;
    if (this.rain < 0.008 && this.rainTarget === 0) this.rain = 0;
  }

  /** Recalcula todo de golpe (arranque, carga, cambio grande). */
  refreshAll() {
    const r = rebuildNetwork(this.grid);
    this.roadCount = r.roadCount;
    this.connectedCity = r.connected;
    this.netDirty = false;
    updateServices(this);
    updateEnvironment(this);
    updatePopulation(this);
    updateDemand(this);
    refreshCandidates(this);
    assignTraffic(this);
    this.hasCityHall = this.buildings.some((b) => b.kind === "city_hall");
    this.fieldsVersion++;
  }

  markBuildingsChanged() {
    this.buildingsVersion++;
  }

  markCatalogChanged() {
    this.catalogVersion++;
  }

  /**
   * La red se recalcula al instante (una BFS sobre 4.096 casillas: microsegundos), no en el
   * siguiente tick. Así el cursor sabe de inmediato si una parcela tiene calle, y se puede
   * construir junto a una calle recién trazada incluso con el juego en pausa.
   * Lo caro —servicios, campos ambientales— sí se aplaza al tick.
   */
  markNetworkDirty() {
    const r = rebuildNetwork(this.grid);
    this.roadCount = r.roadCount;
    this.connectedCity = r.connected;
    this.netDirty = false;
    this.servicesDirty = true;
    this.roadsVersion++;
  }

  // ------------------------------------------------------------------ herramientas

  isUnlocked(kind: string): boolean {
    const d = DEFS[kind];
    if (!d) return false;
    if (UNIQUE_KINDS.has(kind) && this.buildings.some((b) => b.kind === kind)) return false;
    return this.tier >= d.tier;
  }

  roadClassOfTool(tool: Tool): number {
    if (tool === "road-street") return ROAD.street;
    if (tool === "road-avenue") return ROAD.avenue;
    if (tool === "road-highway") return ROAD.highway;
    return ROAD.none;
  }

  toolFootprint(tool: Tool): { w: number; d: number } {
    if (tool.startsWith("build:")) {
      const def = DEFS[tool.slice(6)];
      if (def) return { w: def.w, d: def.d };
    }
    return { w: 1, d: 1 };
  }

  roadCost(cls: number, i: number): number {
    const def = ROADS[cls]!;
    const g = this.grid;
    if (g.terrain[i] === TERRAIN.water) return def.bridgeCost;
    // Desmonte: cuanto más empinado, más caro.
    return Math.round(def.cost * (1 + g.slope[i]! * 2.4));
  }

  canPlace(tool: Tool, x: number, z: number): PlaceCheck {
    const g = this.grid;
    const fp = this.toolFootprint(tool);
    const none = (reason: string, cost = 0): PlaceCheck => ({ ok: false, reason, cost, ...fp });
    if (!inBounds(x, z)) return none("Fuera del mapa");
    const i = idx(x, z);

    if (tool === "select") return { ok: true, cost: 0, ...fp };

    if (tool.startsWith("road-")) {
      const cls = this.roadClassOfTool(tool);
      const def = ROADS[cls]!;
      if (this.tier < def.tier) return none(`Se desbloquea en ${TIERS[def.tier]!.name}`);
      if (g.building[i]! >= 0) return none("Hay un edificio");
      if (g.road[i] === cls) return none("Ya existe esa vía");
      if (g.slope[i]! > 0.72 && g.terrain[i] !== TERRAIN.water) return none("Pendiente excesiva");
      const cost = this.roadCost(cls, i);
      if (this.money < cost) return none("Sin fondos", cost);
      return { ok: true, cost, ...fp };
    }

    if (tool.startsWith("zone-")) {
      const high = tool.endsWith("-high");
      if (high && this.tier < 2) return none("La alta densidad llega con la Villa");
      if (g.terrain[i] === TERRAIN.water) return none("Es agua");
      if (g.road[i] !== ROAD.none) return none("Hay una vía");
      if (g.slope[i]! > 0.55) return none("Terreno demasiado inclinado");
      if (g.building[i]! >= 0) return none("Parcela ocupada");
      return { ok: true, cost: 0, ...fp };
    }

    if (tool === "bulldoze") {
      const hasSomething =
        g.road[i] !== ROAD.none || g.zone[i] !== 0 || g.building[i]! >= 0 || g.tree[i] === 1;
      if (!hasSomething) return none("Nada que demoler");
      if (g.road[i] === ROAD.highway) return none("La autovía no se toca");
      const cost =
        g.building[i]! >= 0 ? BULLDOZE_BUILDING : g.road[i] !== ROAD.none ? BULLDOZE_ROAD : BULLDOZE_ZONE;
      if (this.money < cost) return none("Sin fondos", cost);
      return { ok: true, cost, ...fp };
    }

    if (tool === "tree-plant") {
      if (g.terrain[i] === TERRAIN.water) return none("Es agua");
      if (g.road[i] !== ROAD.none) return none("Hay una vía");
      if (g.building[i]! >= 0) return none("Parcela ocupada");
      if (g.tree[i] === 1) return none("Ya hay un árbol");
      if (g.slope[i]! > 0.62) return none("Pendiente excesiva");
      if (this.money < TREE_COST) return none("Sin fondos", TREE_COST);
      return { ok: true, cost: TREE_COST, ...fp };
    }

    if (tool.startsWith("build:")) {
      const kind = tool.slice(6);
      const def = DEFS[kind];
      if (!def) return none("Desconocido");
      if (this.tier < def.tier) return none(`Se desbloquea en ${TIERS[def.tier]!.name}`);
      if (UNIQUE_KINDS.has(kind) && this.buildings.some((b) => b.kind === kind))
        return none("Solo puede haber uno");
      if (this.money < def.cost) return none("Sin fondos", def.cost);
      let touchesWater = false;
      for (let zz = 0; zz < def.d; zz++) {
        for (let xx = 0; xx < def.w; xx++) {
          const j = g.at(x + xx, z + zz);
          if (j < 0) return none("Falta espacio", def.cost);
          if (g.terrain[j] === TERRAIN.water) return none("Sobre el agua no", def.cost);
          if (g.road[j] !== ROAD.none) return none("Hay una vía", def.cost);
          if (g.building[j]! >= 0) return none("Parcela ocupada", def.cost);
          if (g.slope[j]! > 0.5) return none("Terreno demasiado inclinado", def.cost);
          for (const [dx, dz] of DIRS) {
            const k = g.at(x + xx + dx, z + zz + dz);
            if (k >= 0 && g.terrain[k] === TERRAIN.water) touchesWater = true;
          }
        }
      }
      if (kind === "water_pump" && !touchesWater) return none("Debe tocar el río o la costa", def.cost);
      // Todo lo que coloca el jugador necesita enganche viario: sin él no da servicio,
      // no reparte luz ni agua y no llega nadie a trabajar.
      if (!isHooked(this, x, z, def.w, def.d))
        return none(`Necesita una calle a ${ZONE_DEPTH} casillas o menos`, def.cost);
      return { ok: true, cost: def.cost, ...fp };
    }

    return none("Herramienta desconocida");
  }

  applyTool(tool: Tool, x: number, z: number): boolean {
    const check = this.canPlace(tool, x, z);
    if (!check.ok) return false;
    const g = this.grid;
    const i = idx(x, z);

    if (tool.startsWith("road-")) {
      const cls = this.roadClassOfTool(tool);
      if (g.building[i]! >= 0) return false;
      g.road[i] = cls;
      g.zone[i] = 0;
      g.tree[i] = 0;
      this.money -= check.cost;
      this.markNetworkDirty();
      this.treesVersion++;
      this.zonesVersion++;
      return true;
    }

    if (tool.startsWith("zone-")) {
      const zone: Zone = tool.includes("-r") ? "R" : tool.includes("-c") ? "C" : "I";
      const high = tool.endsWith("-high") ? 1 : 0;
      const nextZone = ZONE_ID[zone];
      if (g.zone[i] === nextZone && g.density[i] === high) return false;
      g.zone[i] = nextZone;
      g.density[i] = high;
      g.tree[i] = 0;
      this.treesVersion++;
      this.zonesVersion++;
      this.servicesDirty = true;
      return true;
    }

    if (tool === "bulldoze") {
      if (g.building[i]! >= 0) {
        const bi = g.building[i]!;
        const b = this.buildings[bi];
        if (b && b.kind === "city_hall") this.hasCityHall = false;
        removeBuilding(this, bi);
      }
      g.road[i] = ROAD.none;
      g.zone[i] = 0;
      g.density[i] = 0;
      g.tree[i] = 0;
      this.money -= check.cost;
      this.markNetworkDirty();
      this.treesVersion++;
      this.zonesVersion++;
      return true;
    }

    if (tool.startsWith("build:")) {
      const kind = tool.slice(6);
      const index = spawnBuilding(this, x, z, kind);
      if (index === null) return false;
      this.money -= check.cost;
      if (kind === "city_hall") this.hasCityHall = true;
      this.servicesDirty = true;
      this.treesVersion++;
      return true;
    }

    if (tool === "tree-plant") {
      g.tree[i] = 1;
      this.money -= check.cost;
      this.treesVersion++;
      return true;
    }

    return false;
  }

  // ------------------------------------------------------------------ consulta

  buildingAt(x: number, z: number): Building | null {
    const i = this.grid.at(x, z);
    if (i < 0) return null;
    const bi = this.grid.building[i]!;
    return bi >= 0 ? (this.buildings[bi] ?? null) : null;
  }

  inspect(x: number, z: number) {
    const g = this.grid;
    const i = g.at(x, z);
    if (i < 0) return null;
    const b = this.buildingAt(x, z);
    const def = b ? DEFS[b.kind]! : null;
    return {
      x,
      z,
      terrain: g.terrain[i]!,
      height: g.height[i]!,
      slope: g.slope[i]!,
      road: g.road[i]!,
      zone: g.zoneOf(i),
      density: g.density[i] ? ("high" as const) : ("low" as const),
      tree: g.tree[i] === 1,
      connected: g.roadDist[i]! <= ZONE_DEPTH,
      roadDist: g.roadDist[i]!,
      powered: g.powered[i] === 1,
      watered: g.watered[i] === 1,
      landValue: g.landValue[i]!,
      pollution: g.pollution[i]!,
      noise: g.noise[i]!,
      traffic: g.traffic[i]!,
      demand:
        g.zoneOf(i) === "R" ? this.demandR : g.zoneOf(i) === "C" ? this.demandC : g.zoneOf(i) === "I" ? this.demandI : 0,
      services: Object.fromEntries(SERVICES.map((k) => [k, g.service[k]![i]!])) as Record<string, number>,
      building: b
        ? {
            id: b.id,
            name: def!.name,
            kind: b.kind,
            category: def!.category,
            desc: def!.desc,
            level: b.level,
            size: `${b.w}×${b.d}`,
            occupancy: b.occupancy,
            wellbeing: b.wellbeing,
            residents: Math.round(def!.homes * b.occupancy * 2.5),
            jobs: Math.round(def!.jobs * b.occupancy),
            upkeep: def!.upkeep,
            trips: b.trips,
            hooked: isHooked(this, b.x, b.z, b.w, b.d),
          }
        : null,
    };
  }

  pushNotice(key: string, text: string, kind: Notice["kind"] = "info") {
    const last = this.noticeCooldown.get(key) ?? -99999;
    if (this.tickCount - last < TICKS_PER_DAY * 2 && key !== "welcome") return;
    this.noticeCooldown.set(key, this.tickCount);
    this.notices = this.notices.filter((n) => n.key !== key && n.text !== text);
    this.notices.unshift({ id: `n${noticeSeq++}`, key, text, kind, at: this.tickCount });
    if (this.notices.length > 5) this.notices.length = 5;
  }

  /** Retira avisos viejos y los que ya no aplican, para que el HUD no se quede anclado al día 1. */
  pruneNotices() {
    const ttl = TICKS_PER_DAY * 3;
    const done = new Set<string>();
    if (this.connectedCity) done.add("conn");
    if (this.powerRatio >= 0.95) done.add("power");
    if (this.waterRatio >= 0.95) done.add("water");
    if (this.garbageRatio >= 0.9) done.add("garbage");
    if ((this.serviceLevel.education ?? 0) >= 0.25) done.add("edu");
    if ((this.serviceLevel.health ?? 0) >= 0.25) done.add("health");
    if (this.congestion <= 0.45) done.add("jam");
    if (this.unemployment <= 0.2) done.add("unemp");
    if (this.avgPollution <= 0.35) done.add("pollution");
    this.notices = this.notices.filter((n) => {
      if (this.tickCount - n.at >= ttl) return false;
      if (n.key && done.has(n.key)) return false;
      return true;
    });
  }

  private advise() {
    if (!this.connectedCity) {
      this.pushNotice("conn", "Ninguna calle llega a la autovía: la ciudad está aislada.", "warn");
      return;
    }
    if (this.powerRatio < 0.95 && this.powerNeed > 0)
      this.pushNotice("power", "Falta potencia eléctrica: apagones parciales en toda la ciudad.", "warn");
    else if (this.waterRatio < 0.95 && this.waterNeed > 0)
      this.pushNotice("water", "El agua no llega a todos: amplía el suministro.", "warn");
    else if (this.garbageRatio < 0.9)
      this.pushNotice("garbage", "La basura se acumula. Hace falta más capacidad de tratamiento.", "warn");
    else if (this.pop > 80 && (this.serviceLevel.education ?? 0) < 0.25)
      this.pushNotice("edu", "Sin colegios no habrá trabajadores cualificados para oficinas.", "info");
    else if (this.pop > 120 && (this.serviceLevel.health ?? 0) < 0.25)
      this.pushNotice("health", "La ciudad no tiene sanidad.", "info");
    else if (this.congestion > 0.55)
      this.pushNotice("jam", "Atascos serios: prueba con avenidas o rutas alternativas.", "warn");
    else if (this.unemployment > 0.25 && this.pop > 60)
      this.pushNotice("unemp", "Paro alto: falta empleo comercial o industrial.", "warn");
    else if (this.avgPollution > 0.4)
      this.pushNotice("pollution", "El aire está muy contaminado. Aleja la industria o límpiala.", "warn");
  }

  // ------------------------------------------------------------------ snapshot

  snapshot(): Snapshot {
    this.pruneNotices();
    const tier = TIERS[this.tier]!;
    const next = TIERS[this.tier + 1] ?? null;
    return {
      name: this.name,
      seed: this.seed,
      day: this.day,
      hour: this.hour,
      dayFraction: this.dayFraction,
      paused: this.paused,
      speed: this.speed,

      money: this.money,
      debt: Math.round(this.debt),
      income: this.lastIncome,
      expense: this.lastExpense,
      incomeLines: this.incomeLines,
      expenseLines: this.expenseLines,
      taxR: this.taxR,
      taxC: this.taxC,
      taxI: this.taxI,

      pop: this.pop,
      households: this.households,
      homesCapacity: this.homesCapacity,
      workers: this.workers,
      jobs: this.jobs,
      unemployment: this.unemployment,
      education: this.eduLevel,
      health: this.healthLevel,
      safety: this.safetyLevel,

      happiness: Math.round(this.happiness),
      landValue: this.avgLandValue,
      pollution: this.avgPollution,
      noise: this.avgNoise,
      garbageBacklog: Math.round(this.garbageBacklog),
      congestion: this.congestion,

      demandR: this.demandR,
      demandC: this.demandC,
      demandI: this.demandI,

      powerNeed: Math.round(this.powerNeed),
      powerSupply: Math.round(this.powerSupply),
      waterNeed: Math.round(this.waterNeed),
      waterSupply: Math.round(this.waterSupply),
      garbageNeed: Math.round(this.garbageNeed),
      garbageCapacity: Math.round(this.garbageCapacity),

      buildings: this.buildings.length,
      roads: this.roadCount,
      connected: this.connectedCity,

      tier: this.tier,
      tierName: tier.name,
      nextTierName: next?.name ?? null,
      nextTierPop: next?.pop ?? null,
      unlocked: TIERS.slice(0, this.tier + 1).flatMap((t) => t.unlocks),

      notices: this.notices.slice(0, 4),
      bankrupt: this.money < 0,
      history: this.history,

      rain: this.rain,
      policies: { ...this.policies },
    };
  }

  // ------------------------------------------------------------------ guardado

  toSave(): SaveBlob {
    return {
      version: 2,
      seed: this.seed,
      name: this.name,
      entry: this.entry,
      day: this.day,
      tick: this.tickCount,
      money: this.money,
      debt: this.debt,
      taxR: this.taxR,
      taxC: this.taxC,
      taxI: this.taxI,
      tier: this.tier,
      garbageBacklog: this.garbageBacklog,
      eduLevel: this.eduLevel,
      nextBuildingId: this.nextBuildingId,
      grid: this.grid.serialize(),
      buildings: this.buildings.map((b) => ({
        id: b.id,
        kind: b.kind,
        x: b.x,
        z: b.z,
        rot: b.rot,
        variant: b.variant,
        occupancy: Number(b.occupancy.toFixed(3)),
        age: b.age,
        wellbeing: Number(b.wellbeing.toFixed(3)),
      })),
      history: this.history,
      rain: Number(this.rain.toFixed(3)),
      policies: { ...this.policies },
    };
  }

  persist(): boolean {
    return writeSave(this.toSave());
  }

  static fromSave(blob: SaveBlob): CitySim | null {
    if (blob.version !== 2) return null;
    const grid = Grid.deserialize(blob.grid);
    if (!grid) return null;
    const sim = Object.create(CitySim.prototype) as CitySim;
    Object.assign(sim, new CitySimDefaults());
    sim.seed = blob.seed;
    sim.name = blob.name;
    sim.entry = blob.entry ?? { x: 8, z: 32 };
    sim.grid = grid;
    sim.rand = mulberry32(blob.seed + blob.tick);
    sim.day = blob.day;
    sim.tickCount = blob.tick;
    sim.money = blob.money;
    sim.debt = blob.debt ?? 0;
    sim.taxR = blob.taxR ?? 0.11;
    sim.taxC = blob.taxC ?? 0.11;
    sim.taxI = blob.taxI ?? 0.11;
    sim.tier = blob.tier ?? 0;
    sim.garbageBacklog = blob.garbageBacklog ?? 0;
    sim.eduLevel = blob.eduLevel ?? 0.1;
    sim.nextBuildingId = blob.nextBuildingId ?? 1;
    sim.history = blob.history ?? [];
    sim.rain = blob.rain ?? 0;
    sim.rainTarget = blob.rain ?? 0;
    sim.policies = {
      cleanIndustry: blob.policies?.cleanIndustry ?? false,
      housingGrant: blob.policies?.housingGrant ?? false,
      overtime: blob.policies?.overtime ?? false,
    };
    const a = (blob.seed % 360) * (Math.PI / 180);
    sim.windX = Math.cos(a) * 0.9;
    sim.windZ = Math.sin(a) * 0.9;

    sim.buildings = blob.buildings.map((b) => {
      const def = DEFS[b.kind] ?? DEFS.r_low_1!;
      return {
        id: b.id,
        kind: DEFS[b.kind] ? b.kind : "r_low_1",
        zone: def.zone,
        x: b.x,
        z: b.z,
        w: def.w,
        d: def.d,
        rot: b.rot ?? 0,
        level: def.level,
        variant: b.variant ?? 0,
        occupancy: b.occupancy ?? 0.5,
        age: b.age ?? 200,
        wellbeing: b.wellbeing ?? 0.4,
        trips: 0,
      } satisfies Building;
    });
    // El índice tile→edificio se reconstruye: nunca se guarda un índice de array.
    sim.grid.building.fill(-1);
    for (let k = 0; k < sim.buildings.length; k++) {
      const b = sim.buildings[k]!;
      for (let zz = 0; zz < b.d; zz++) {
        for (let xx = 0; xx < b.w; xx++) {
          const i = sim.grid.at(b.x + xx, b.z + zz);
          if (i >= 0) sim.grid.building[i] = k;
        }
      }
    }
    const t = sim.tickCount % TICKS_PER_DAY;
    sim.dayFraction = t / TICKS_PER_DAY;
    sim.hour = sim.dayFraction * 24;
    for (const k of SERVICES) sim.serviceLevel[k] = 0;
    sim.refreshAll();
    for (const b of sim.buildings) {
      // 0 es una orientación válida (fachada al norte): no usar `||`.
      if ((b.rot | 0) !== b.rot || b.rot < 0 || b.rot > 3) {
        b.rot = facingRoad(sim.grid, b.x, b.z, b.w, b.d);
      }
    }
    sim.pushNotice("loaded", "Ciudad restaurada.", "good");
    return sim;
  }
}

/** Valores por defecto para reconstruir una instancia sin pasar por el constructor. */
class CitySimDefaults {
  buildings: Building[] = [];
  vehicles: Vehicle[] = [];
  routes: Int32Array[] = [];
  acc = 0;
  speed = 1;
  paused = false;
  lastIncome = 0;
  lastExpense = 0;
  incomeLines: BudgetLine[] = [];
  expenseLines: BudgetLine[] = [];
  history: HistoryPoint[] = [];
  pop = 0;
  households = 0;
  homesCapacity = 0;
  workers = 0;
  jobs = 0;
  unemployment = 0;
  healthLevel = 0.2;
  safetyLevel = 0.2;
  happiness = 55;
  avgWellbeing = 0.4;
  occupancyR = 0;
  occupancyC = 0;
  occupancyI = 0;
  jobFill = [1, 1, 1];
  avgPollution = 0;
  avgNoise = 0;
  avgLandValue = 0.3;
  congestion = 0;
  rain = 0;
  rainTarget = 0;
  policies: Policies = { ...DEFAULT_POLICIES };
  powerNeed = 0;
  powerSupply = 0;
  powerRatio = 1;
  waterNeed = 0;
  waterSupply = 0;
  waterRatio = 1;
  garbageNeed = 0;
  garbageCapacity = 0;
  garbageRatio = 1;
  serviceLevel: Record<string, number> = {};
  demandR = 0.6;
  demandC = 0.2;
  demandI = 0.2;
  hasCityHall = false;
  roadCount = 0;
  connectedCity = false;
  notices: Notice[] = [];
  noticeCooldown = new Map<string, number>();
  tool: Tool = "select";
  overlay: OverlayKind = "none";
  hover: { x: number; z: number } | null = null;
  selected: { x: number; z: number } | null = null;
  buildingsVersion = 1;
  roadsVersion = 1;
  zonesVersion = 1;
  treesVersion = 1;
  terrainVersion = 1;
  fieldsVersion = 1;
  catalogVersion = 1;
  nextBuildingId = 1;
  nextVehicleId = 1;
  vehicleBudget = 140;
}

export function loadOrNull(): CitySim | null {
  const blob = readSave();
  if (!blob) return null;
  try {
    return CitySim.fromSave(blob);
  } catch {
    return null;
  }
}

export function zoneFromTool(tool: Tool): Zone {
  if (tool.includes("-r")) return "R";
  if (tool.includes("-c")) return "C";
  if (tool.includes("-i")) return "I";
  return "none";
}

/** Ciudad de fondo para la portada: se construye sola y se deja bonita. */
export function createPreview(): CitySim {
  const s = new CitySim(20260828);
  // La portada enseña una ciudad ya madura: todo desbloqueado desde el principio.
  s.tier = 3;
  s.money = 900000;
  const { x: ex, z: ez } = s.entry;
  const free = () => {
    s.money = 900000;
  };
  const road = (x: number, z: number, avenue = false) => {
    free();
    s.applyTool(avenue ? "road-avenue" : "road-street", x, z);
  };

  const x0 = ex;
  const x1 = Math.min(N - 3, ex + 30);
  const z0 = Math.max(2, ez - 13);
  const z1 = Math.min(N - 3, ez + 13);
  // Avenida principal desde la autovía y retícula de calles cada cinco casillas.
  for (let x = x0; x <= x1; x++) road(x, ez, true);
  for (let x = x0 + 3; x <= x1; x += 5) for (let z = z0; z <= z1; z++) road(x, z);
  for (let z = z0; z <= z1; z += 5) for (let x = x0; x <= x1; x++) road(x, z);

  s.refreshAll();

  const zoneRect = (tool: Tool, ax: number, az: number, bx: number, bz: number) => {
    for (let x = ax; x <= bx; x++) {
      for (let z = az; z <= bz; z++) {
        free();
        s.applyTool(tool, x, z);
      }
    }
  };
  // Centro denso junto a la avenida, barrios bajos fuera, industria al fondo.
  zoneRect("zone-c-high", x0 + 4, ez - 4, x0 + 17, ez - 1);
  zoneRect("zone-c-high", x0 + 4, ez + 1, x0 + 12, ez + 4);
  zoneRect("zone-r-high", x0 + 13, ez + 1, x0 + 22, ez + 4);
  zoneRect("zone-r", x0 + 1, z0 + 1, x0 + 22, ez - 6);
  zoneRect("zone-r", x0 + 1, ez + 6, x0 + 17, z1 - 1);
  zoneRect("zone-i", x0 + 19, ez + 6, x1 - 1, z1 - 1);
  zoneRect("zone-i", x0 + 24, z0 + 1, x1 - 1, ez - 6);

  const place = (kind: string, cx: number, cz: number) => {
    for (let r = 0; r < 14; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          free();
          if (s.canPlace(`build:${kind}`, cx + dx, cz + dz).ok) {
            const i = s.grid.at(cx + dx, cz + dz);
            if (i >= 0 && s.grid.roadDist[i]! <= ZONE_DEPTH) {
              return s.applyTool(`build:${kind}`, cx + dx, cz + dz);
            }
          }
        }
      }
    }
    return false;
  };
  place("power_coal", x1 - 3, z1 - 3);
  place("water_tower", x0 + 2, ez - 8);
  place("landfill", x1 - 3, z0 + 3);
  place("school", x0 + 8, ez - 8);
  place("clinic", x0 + 14, ez - 8);
  place("police", x0 + 8, ez + 8);
  place("park_plaza", x0 + 10, ez - 2);
  place("park_plaza", x0 + 18, ez + 3);
  place("city_hall", x0 + 6, ez + 2);

  free();
  s.refreshAll();
  s.paused = false;
  s.speed = 3;
  // Suficiente para que la ciudad se llene sin bloquear la carga de la página.
  for (let i = 0; i < 220; i++) s.step(0.12);
  s.money = 900000;
  s.notices = [];
  s.speed = 1;
  s.rain = 0;
  s.rainTarget = 0;
  return s;
}

export { clamp01, N, idx, inBounds };
