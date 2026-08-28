import {
  BULLDOZE_BUILDING,
  BULLDOZE_ROAD,
  BRIDGE_COST,
  DEFS,
  GROWTH,
  MILESTONES,
  ROAD_COST,
  START_MONEY,
  type BuildingDef,
} from "./catalog";
import { generateMap } from "./generate";
import { hash2, mulberry32 } from "./rng";
import { readSave, type SaveBlob, writeSave } from "./save";
import {
  DIRS,
  N,
  SIM_DT,
  TICKS_PER_DAY,
  type Building,
  type BuildingKind,
  type Notice,
  type Snapshot,
  type Tile,
  type Tool,
  type Vehicle,
  type Zone,
  idx,
  inBounds,
} from "./types";

let noticeSeq = 1;

export class CitySim {
  seed: number;
  name: string;
  tiles: Tile[];
  buildings: Building[] = [];
  vehicles: Vehicle[] = [];
  money = START_MONEY;
  day = 1;
  hour = 8;
  tick = 0;
  speed = 1;
  paused = false;
  milestoneIndex = 0;
  notices: Notice[] = [];
  noticeCooldown = new Map<string, number>();
  nextId = 1;
  nextVeh = 1;
  acc = 0;
  visAcc = 0;
  buildingsVersion = 1;
  roadsVersion = 1;
  treesVersion = 1;
  lastIncome = 0;
  lastExpense = 0;
  demandR = 0.4;
  demandC = 0.2;
  demandI = 0.15;
  happiness = 62;
  pop = 0;
  jobs = 0;
  workers = 0;
  powerNeed = 0;
  powerSupply = 0;
  waterNeed = 0;
  waterSupply = 0;
  roadCount = 0;
  connectedCity = false;
  rand: () => number;
  hover: { x: number; z: number } | null = null;
  selected: { x: number; z: number } | null = null;
  tool: Tool = "road";
  overlay: "none" | "power" | "water" = "none";
  brushDragging = false;

  constructor(seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0) {
    this.seed = seed >>> 0;
    this.rand = mulberry32(this.seed);
    const gen = generateMap(this.seed);
    this.tiles = gen.tiles;
    this.name = gen.name;
    this.recomputeServices();
    this.rebuildSnapshotCache();
    this.pushNotice("welcome", "Traza una calle desde la autovía, zona viviendas y conecta la luz.");
  }

  static fromSave(blob: SaveBlob): CitySim {
    const sim = Object.create(CitySim.prototype) as CitySim;
    sim.seed = blob.seed;
    sim.name = blob.name;
    sim.tiles = blob.tiles;
    sim.buildings = blob.buildings;
    sim.vehicles = blob.vehicles ?? [];
    sim.money = blob.money;
    sim.day = blob.day;
    sim.hour = blob.hour;
    sim.tick = blob.tick;
    sim.milestoneIndex = blob.milestoneIndex ?? 0;
    sim.nextId = blob.nextId ?? 1;
    sim.nextVeh = blob.nextVeh ?? 1;
    sim.speed = 1;
    sim.paused = false;
    sim.notices = [];
    sim.noticeCooldown = new Map();
    sim.acc = 0;
    sim.visAcc = 0;
    sim.buildingsVersion = 1;
    sim.roadsVersion = 1;
    sim.treesVersion = 1;
    sim.lastIncome = blob.snapshot?.income ?? 0;
    sim.lastExpense = blob.snapshot?.expense ?? 0;
    sim.demandR = blob.snapshot?.demandR ?? 0.3;
    sim.demandC = blob.snapshot?.demandC ?? 0.2;
    sim.demandI = blob.snapshot?.demandI ?? 0.15;
    sim.happiness = blob.snapshot?.happiness ?? 60;
    sim.pop = blob.snapshot?.pop ?? 0;
    sim.jobs = blob.snapshot?.jobs ?? 0;
    sim.workers = blob.snapshot?.workers ?? 0;
    sim.powerNeed = 0;
    sim.powerSupply = 0;
    sim.waterNeed = 0;
    sim.waterSupply = 0;
    sim.roadCount = 0;
    sim.connectedCity = false;
    sim.rand = mulberry32(sim.seed + sim.tick);
    sim.hover = null;
    sim.selected = null;
    sim.tool = "select";
    sim.overlay = "none";
    sim.brushDragging = false;
    sim.recomputeServices();
    sim.rebuildSnapshotCache();
    sim.pushNotice("loaded", "Ciudad restaurada.");
    return sim;
  }

  toSave(snapshot: Snapshot): SaveBlob {
    return {
      version: 1,
      seed: this.seed,
      name: this.name,
      day: this.day,
      hour: this.hour,
      tick: this.tick,
      money: this.money,
      milestoneIndex: this.milestoneIndex,
      tiles: this.tiles,
      buildings: this.buildings,
      vehicles: this.vehicles,
      nextId: this.nextId,
      nextVeh: this.nextVeh,
      snapshot,
    };
  }

  persist() {
    writeSave(this.toSave(this.snapshot()));
  }

  tile(x: number, z: number): Tile | null {
    if (!inBounds(x, z)) return null;
    return this.tiles[idx(x, z)] ?? null;
  }

  step(dt: number) {
    const d = Math.min(dt, 0.1);
    const factor = this.paused ? 0 : this.speed === 3 ? 4 : this.speed === 2 ? 2 : 1;
    this.acc += d * factor;
    let guard = 0;
    while (this.acc >= SIM_DT && guard++ < 8) {
      this.acc -= SIM_DT;
      this.simTick();
      this.tickVehicles(SIM_DT);
    }
    if (this.paused) this.tickVehicles(0);
  }

  private simTick() {
    this.tick += 1;
    this.hour = 8 + ((this.tick % TICKS_PER_DAY) | 0);
    if (this.tick % TICKS_PER_DAY === 0) {
      this.day += 1;
      this.resolveBudget();
    }
    if (this.tick % 2 === 0) this.recomputeServices();
    this.tickOccupancy();
    this.tickGrowth();
    this.tickAbandon();
    if (this.tick % 3 === 0) this.spawnTraffic();
    this.rebuildSnapshotCache();
    this.checkMilestones();
    this.maybeAdvice();
  }

  private def(b: Building): BuildingDef {
    return DEFS[b.kind];
  }

  private cellsOf(b: Building): Array<[number, number]> {
    const cells: Array<[number, number]> = [];
    for (let z = 0; z < b.d; z++) {
      for (let x = 0; x < b.w; x++) cells.push([b.x + x, b.z + z]);
    }
    return cells;
  }

  roadAccess(x: number, z: number): boolean {
    for (const [dx, dz] of DIRS) {
      const t = this.tile(x + dx, z + dz);
      if (t?.road && t.connected) return true;
    }
    const t = this.tile(x, z);
    return Boolean(t?.road && t.connected);
  }

  lotServed(x: number, z: number, field: "powered" | "watered"): boolean {
    for (const [dx, dz] of DIRS) {
      const n = this.tile(x + dx, z + dz);
      if (n?.road && n.connected && n[field]) return true;
    }
    const t = this.tile(x, z);
    return Boolean(t?.[field]);
  }

  recomputeServices() {
    for (const t of this.tiles) {
      t.powered = false;
      t.watered = false;
      t.connected = false;
    }

    const q: number[] = [];
    for (const t of this.tiles) {
      if (t.road && t.highway) {
        t.connected = true;
        q.push(idx(t.x, t.z));
      }
    }
    while (q.length) {
      const i = q.pop()!;
      const t = this.tiles[i]!;
      for (const [dx, dz] of DIRS) {
        const n = this.tile(t.x + dx, t.z + dz);
        if (!n || !n.road || n.connected) continue;
        n.connected = true;
        q.push(idx(n.x, n.z));
      }
    }
    this.connectedCity = this.tiles.some((t) => t.connected);

    let powerSupply = 0;
    let waterSupply = 0;
    const bankrupt = this.money < 0;

    const pq: number[] = [];
    const wq: number[] = [];

    for (const b of this.buildings) {
      const d = this.def(b);
      if (d.powerSupply && !bankrupt) {
        powerSupply += d.powerSupply;
        for (const [x, z] of this.cellsOf(b)) {
          const t = this.tile(x, z);
          if (t) t.powered = true;
          for (const [dx, dz] of DIRS) {
            const n = this.tile(x + dx, z + dz);
            if (n?.road && n.connected && !n.powered) {
              n.powered = true;
              pq.push(idx(n.x, n.z));
            }
          }
        }
      }
      if (d.waterSupply) {
        waterSupply += d.waterSupply;
        for (const [x, z] of this.cellsOf(b)) {
          const t = this.tile(x, z);
          if (t) t.watered = true;
          for (const [dx, dz] of DIRS) {
            const n = this.tile(x + dx, z + dz);
            if (n?.road && n.connected && !n.watered) {
              n.watered = true;
              wq.push(idx(n.x, n.z));
            }
          }
        }
      }
    }

    for (const t of this.tiles) {
      if (!t.road || !t.connected) continue;
      for (const [dx, dz] of DIRS) {
        const n = this.tile(t.x + dx, t.z + dz);
        if (n?.terrain === "water") {
          t.watered = true;
          wq.push(idx(t.x, t.z));
          waterSupply += 0.35;
          break;
        }
      }
    }

    const flood = (queue: number[], field: "powered" | "watered") => {
      let i = 0;
      while (i < queue.length) {
        const t = this.tiles[queue[i]!]!;
        i++;
        for (const [dx, dz] of DIRS) {
          const n = this.tile(t.x + dx, t.z + dz);
          if (!n || !n.road || !n.connected || n[field]) continue;
          n[field] = true;
          queue.push(idx(n.x, n.z));
        }
      }
    };
    flood(pq, "powered");
    flood(wq, "watered");

    for (const b of this.buildings) {
      let p = false;
      let w = false;
      for (const [x, z] of this.cellsOf(b)) {
        if (this.roadAccess(x, z)) {
          for (const [dx, dz] of DIRS) {
            const n = this.tile(x + dx, z + dz);
            if (n?.road && n.powered) p = true;
            if (n?.road && n.watered) w = true;
          }
        }
        const t = this.tile(x, z);
        if (t?.powered) p = true;
        if (t?.watered) w = true;
      }
      for (const [x, z] of this.cellsOf(b)) {
        const t = this.tile(x, z);
        if (!t) continue;
        t.powered = p;
        t.watered = w;
      }
    }

    let powerNeed = 0;
    let waterNeed = 0;
    for (const b of this.buildings) {
      const d = this.def(b);
      powerNeed += d.power;
      waterNeed += d.water;
    }
    this.powerNeed = powerNeed;
    this.powerSupply = powerSupply;
    this.waterNeed = waterNeed;
    this.waterSupply = waterSupply;
    this.roadCount = this.tiles.reduce((n, t) => n + (t.road ? 1 : 0), 0);
  }

  private tickOccupancy() {
    let pop = 0;
    let jobs = 0;
    let workers = 0;
    let happy = 58;
    let parks = 0;
    let unpowered = 0;

    for (const b of this.buildings) {
      const d = this.def(b);
      const t = this.tile(b.x, b.z);
      const ok = Boolean(t?.powered && t.watered && this.roadAccess(b.x, b.z));
      let target = ok ? 1 : 0.08;
      if (d.zone === "R" && this.jobs + 4 < this.pop) target *= 0.55;
      if ((d.zone === "C" || d.zone === "I") && this.workers + 4 < this.jobs) target *= 0.5;
      if (this.money < 0 && d.kind === "power") target = 0;
      const rate = ok ? 0.08 : 0.14;
      b.occupancy += (target - b.occupancy) * rate;
      b.occupancy = Math.max(0, Math.min(1, b.occupancy));
      b.age += 1;
      pop += d.residents * b.occupancy;
      jobs += d.jobs * b.occupancy;
      workers += d.residents * b.occupancy * 0.62;
      happy += d.happiness * b.occupancy;
      if (d.kind === "park") parks += 1;
      if (!ok && (d.residents || d.jobs)) unpowered += 1;
    }

    const unemp = Math.max(0, workers - jobs);
    happy -= unemp * 0.35;
    happy -= unpowered * 1.8;
    happy += Math.min(18, parks * 3);
    this.pop = Math.round(pop);
    this.jobs = Math.round(jobs);
    this.workers = Math.round(workers);
    this.happiness = Math.max(12, Math.min(98, happy));

    const housing = this.buildings.reduce((s, b) => s + this.def(b).residents, 0);
    const jobCap = this.buildings.reduce((s, b) => s + this.def(b).jobs, 0);
    this.demandR = clamp01((jobCap * 0.9 - this.pop) / 40 + 0.25);
    this.demandC = clamp01((this.pop * 0.35 - jobCap * 0.45) / 28 + 0.2);
    this.demandI = clamp01((this.pop * 0.28 - jobCap * 0.4) / 24 + 0.15);
    if (housing < 8) this.demandR = Math.max(this.demandR, 0.55);
    if (this.pop > 20 && jobCap < 8) {
      this.demandC = Math.max(this.demandC, 0.5);
      this.demandI = Math.max(this.demandI, 0.4);
    }
  }

  private tickGrowth() {
    if (this.money < 0) return;
    const empties: Tile[] = [];
    for (const t of this.tiles) {
      if (t.zone === "none" || t.building >= 0 || t.road) continue;
      if (!this.lotServed(t.x, t.z, "powered") || !this.lotServed(t.x, t.z, "watered")) continue;
      if (!this.roadAccess(t.x, t.z)) continue;
      empties.push(t);
    }
    shuffle(empties, this.rand);
    const maxSpawn = 5;
    let spawned = 0;
    for (const t of empties) {
      if (spawned >= maxSpawn) break;
      const demand = t.zone === "R" ? this.demandR : t.zone === "C" ? this.demandC : this.demandI;
      if (demand < 0.06) continue;
      if (this.rand() > 0.42 * Math.max(demand, 0.2)) continue;
      const chain = GROWTH[t.zone];
      const kind = chain[0];
      if (!kind) continue;
      this.spawnGrown(t.x, t.z, kind);
      spawned += 1;
    }
    if (spawned) this.recomputeServices();

    if (this.milestoneIndex < 2) return;
    for (const b of this.buildings) {
      const d = this.def(b);
      if (d.zone === "none" || b.occupancy < 0.82 || b.age < 36) continue;
      const chain = GROWTH[d.zone];
      const next = chain[b.level];
      if (!next) continue;
      const need = d.zone === "R" ? this.demandR : d.zone === "C" ? this.demandC : this.demandI;
      if (need < 0.22) continue;
      if (this.milestoneIndex < 3 && b.level >= 2) continue;
      if (this.rand() > 0.04 * need) continue;
      b.kind = next;
      b.level = DEFS[next].level;
      b.age = 0;
      b.occupancy = 0.55;
      this.buildingsVersion++;
    }
  }

  private spawnGrown(x: number, z: number, kind: BuildingKind) {
    const d = DEFS[kind];
    const b: Building = {
      id: `b${this.nextId++}`,
      kind,
      zone: d.zone,
      x,
      z,
      w: d.w,
      d: d.d,
      level: d.level,
      occupancy: 0.18,
      variant: Math.floor(hash2(x, z, this.seed) * 4),
      age: 0,
    };
    const bi = this.buildings.length;
    this.buildings.push(b);
    const t = this.tile(x, z);
    if (t) {
      t.building = bi;
      t.tree = false;
    }
    this.buildingsVersion++;
    this.treesVersion++;
  }

  private tickAbandon() {
    for (let i = this.buildings.length - 1; i >= 0; i--) {
      const b = this.buildings[i]!;
      const d = this.def(b);
      if (d.cost > 0) continue;
      if (b.occupancy > 0.04 || b.age < 40) continue;
      const t = this.tile(b.x, b.z);
      if (t?.powered && t.watered) continue;
      this.removeBuildingAt(i, false);
    }
  }

  private resolveBudget() {
    let income = 0;
    let expense = this.roadCount * 0.35;
    for (const b of this.buildings) {
      const d = this.def(b);
      income += d.residents * b.occupancy * 5.8;
      income += d.jobs * b.occupancy * (d.zone === "C" ? 8.4 : 6.6);
      expense += d.upkeep;
    }
    income *= 0.35 + this.happiness / 200;
    this.lastIncome = Math.round(income);
    this.lastExpense = Math.round(expense);
    this.money = Math.round(this.money + income - expense);
    if (this.money < 0) this.pushNotice("broke", "Presupuesto en números rojos. Las centrales se apagarán.");
  }

  private checkMilestones() {
    const next = MILESTONES[this.milestoneIndex + 1];
    if (!next || this.pop < next.pop) return;
    this.milestoneIndex += 1;
    this.money += next.bonus;
    this.pushNotice("mile", `${next.name}: la ciudad crece. Prima $${next.bonus.toLocaleString()}.`);
  }

  private maybeAdvice() {
    if (this.tick % 18 !== 0) return;
    if (!this.connectedCity) this.pushNotice("conn", "Las calles deben tocar la autovía oeste para abrir la ciudad.");
    else if (this.powerSupply < 1 && this.buildings.length === 0)
      this.pushNotice("pow", "Coloca una central y conéctala con calles.");
    else if (this.pop > 12 && this.jobs < this.workers * 0.7)
      this.pushNotice("jobs", "Falta empleo. Zona comercio o industria.");
    else if (this.jobs > 16 && this.pop < this.jobs * 0.7)
      this.pushNotice("homes", "Los negocios piden más vecinos cerca.");
    else if (this.powerNeed > this.powerSupply)
      this.pushNotice("blackout", "Falta luz. Construye otra central o reduce la demanda.");
  }

  private spawnTraffic() {
    const cap = Math.min(42, 4 + Math.floor(this.pop / 10));
    if (this.vehicles.length >= cap) return;
    const homes: Building[] = [];
    const work: Building[] = [];
    for (const b of this.buildings) {
      if (this.def(b).residents && b.occupancy > 0.3) homes.push(b);
      if (this.def(b).jobs && b.occupancy > 0.3) work.push(b);
    }
    if (!homes.length || !work.length) return;
    const a = homes[Math.floor(this.rand() * homes.length)]!;
    const c = work[Math.floor(this.rand() * work.length)]!;
    const start = this.nearestRoad(a.x, a.z);
    const end = this.nearestRoad(c.x, c.z);
    if (start < 0 || end < 0 || start === end) return;
    const path = this.bfsPath(start, end);
    if (!path || path.length < 2) return;
    const colors = [0xc45b4a, 0xe8e4dc, 0x3d6ea8, 0x2a2e33, 0xd4b46a, 0x4a8f6e];
    this.vehicles.push({
      id: this.nextVeh++,
      x: 0,
      z: 0,
      y: 0,
      yaw: 0,
      path,
      i: 0,
      t: 0,
      color: colors[Math.floor(this.rand() * colors.length)]!,
      speed: 1.6 + this.rand() * 1.1,
    });
  }

  private nearestRoad(x: number, z: number): number {
    if (this.tile(x, z)?.road) return idx(x, z);
    for (const [dx, dz] of DIRS) {
      const t = this.tile(x + dx, z + dz);
      if (t?.road) return idx(t.x, t.z);
    }
    return -1;
  }

  private bfsPath(start: number, goal: number): number[] | null {
    const prev = new Int32Array(N * N).fill(-1);
    const seen = new Uint8Array(N * N);
    const q = [start];
    seen[start] = 1;
    let qi = 0;
    while (qi < q.length) {
      const cur = q[qi++]!;
      if (cur === goal) break;
      const t = this.tiles[cur]!;
      for (const [dx, dz] of DIRS) {
        const n = this.tile(t.x + dx, t.z + dz);
        if (!n?.road) continue;
        const ni = idx(n.x, n.z);
        if (seen[ni]) continue;
        seen[ni] = 1;
        prev[ni] = cur;
        q.push(ni);
      }
    }
    if (!seen[goal]) return null;
    const path: number[] = [];
    let c = goal;
    while (c !== start && c >= 0) {
      path.push(c);
      c = prev[c]!;
    }
    path.push(start);
    path.reverse();
    return path;
  }

  private tickVehicles(dt: number) {
    const live: Vehicle[] = [];
    for (const v of this.vehicles) {
      if (dt === 0) {
        this.placeVehicle(v);
        live.push(v);
        continue;
      }
      const a = v.path[v.i];
      const b = v.path[v.i + 1];
      if (a === undefined || b === undefined) continue;
      const ta = this.tiles[a]!;
      const tb = this.tiles[b]!;
      const dist = Math.hypot(tb.x - ta.x, tb.z - ta.z) || 1;
      v.t += (v.speed * dt) / dist;
      while (v.t >= 1 && v.i < v.path.length - 2) {
        v.t -= 1;
        v.i += 1;
      }
      if (v.t >= 1 && v.i >= v.path.length - 2) continue;
      this.placeVehicle(v);
      live.push(v);
    }
    this.vehicles = live;
  }

  private placeVehicle(v: Vehicle) {
    const a = this.tiles[v.path[v.i]!]!;
    const b = this.tiles[v.path[Math.min(v.i + 1, v.path.length - 1)]!]!;
    const t = Math.min(1, v.t);
    v.x = a.x + 0.5 + (b.x - a.x) * t;
    v.z = a.z + 0.5 + (b.z - a.z) * t;
    v.y = Math.max(a.height, b.height) + 0.12;
    v.yaw = Math.atan2(-(b.x - a.x), -(b.z - a.z));
  }

  canPlace(tool: Tool, x: number, z: number): { ok: boolean; reason?: string; cost: number } {
    const t = this.tile(x, z);
    if (!t) return { ok: false, reason: "Fuera del mapa", cost: 0 };
    if (tool === "select") return { ok: true, cost: 0 };
    if (tool === "road") {
      if (t.building >= 0) return { ok: false, reason: "Ocupado", cost: 0 };
      if (t.road) return { ok: false, reason: "Ya hay calle", cost: 0 };
      const cost = t.terrain === "water" ? BRIDGE_COST : ROAD_COST;
      if (this.money < cost) return { ok: false, reason: "Sin fondos", cost };
      return { ok: true, cost };
    }
    if (tool === "zone-r" || tool === "zone-c" || tool === "zone-i") {
      if (t.terrain === "water" || t.road || t.building >= 0)
        return { ok: false, reason: "No se puede zonificar", cost: 0 };
      return { ok: true, cost: 0 };
    }
    if (tool === "bulldoze") {
      if (!t.road && t.zone === "none" && t.building < 0 && !t.tree)
        return { ok: false, reason: "Nada que demoler", cost: 0 };
      const cost = t.building >= 0 ? BULLDOZE_BUILDING : t.road ? BULLDOZE_ROAD : 5;
      if (this.money < cost) return { ok: false, reason: "Sin fondos", cost };
      return { ok: true, cost };
    }
    if (tool === "power" || tool === "water" || tool === "park") {
      const kind: BuildingKind = tool === "power" ? "power" : tool === "water" ? "water-tower" : "park";
      const d = DEFS[kind];
      if (this.money < d.cost) return { ok: false, reason: "Sin fondos", cost: d.cost };
      for (let zz = 0; zz < d.d; zz++) {
        for (let xx = 0; xx < d.w; xx++) {
          const c = this.tile(x + xx, z + zz);
          if (!c) return { ok: false, reason: "Falta espacio", cost: d.cost };
          if (c.terrain === "water" || c.road || c.building >= 0)
            return { ok: false, reason: "Parcela ocupada", cost: d.cost };
        }
      }
      return { ok: true, cost: d.cost };
    }
    return { ok: false, cost: 0 };
  }

  applyTool(tool: Tool, x: number, z: number): boolean {
    const check = this.canPlace(tool, x, z);
    if (!check.ok) return false;
    const t = this.tile(x, z)!;

    if (tool === "road") {
      t.road = true;
      t.tree = false;
      t.zone = "none";
      this.money -= check.cost;
      this.roadsVersion++;
      this.treesVersion++;
      this.recomputeServices();
      return true;
    }
    if (tool === "zone-r" || tool === "zone-c" || tool === "zone-i") {
      t.zone = tool === "zone-r" ? "R" : tool === "zone-c" ? "C" : "I";
      t.tree = false;
      this.treesVersion++;
      this.buildingsVersion++;
      return true;
    }
    if (tool === "bulldoze") {
      if (t.building >= 0) this.removeBuildingCovering(x, z);
      t.road = false;
      t.highway = false;
      t.zone = "none";
      t.tree = false;
      this.money -= check.cost;
      this.roadsVersion++;
      this.treesVersion++;
      this.buildingsVersion++;
      this.recomputeServices();
      return true;
    }
    if (tool === "power" || tool === "water" || tool === "park") {
      const kind: BuildingKind = tool === "power" ? "power" : tool === "water" ? "water-tower" : "park";
      const d = DEFS[kind];
      const b: Building = {
        id: `b${this.nextId++}`,
        kind,
        zone: "none",
        x,
        z,
        w: d.w,
        d: d.d,
        level: 1,
        occupancy: 1,
        variant: 0,
        age: 0,
      };
      const bi = this.buildings.length;
      this.buildings.push(b);
      for (const [cx, cz] of this.cellsOf(b)) {
        const c = this.tile(cx, cz);
        if (!c) continue;
        c.building = bi;
        c.tree = false;
        c.zone = "none";
      }
      this.money -= d.cost;
      this.buildingsVersion++;
      this.treesVersion++;
      this.recomputeServices();
      return true;
    }
    return false;
  }

  private removeBuildingCovering(x: number, z: number) {
    const t = this.tile(x, z);
    if (!t || t.building < 0) return;
    this.removeBuildingAt(t.building, false);
  }

  private removeBuildingAt(index: number, refund: boolean) {
    const b = this.buildings[index];
    if (!b) return;
    if (refund) this.money += Math.round(this.def(b).cost * 0.2);
    for (const [x, z] of this.cellsOf(b)) {
      const t = this.tile(x, z);
      if (t && t.building === index) t.building = -1;
    }
    const last = this.buildings.length - 1;
    if (index !== last) {
      const moved = this.buildings[last]!;
      this.buildings[index] = moved;
      for (const [x, z] of this.cellsOf(moved)) {
        const t = this.tile(x, z);
        if (t) t.building = index;
      }
    }
    this.buildings.pop();
    this.buildingsVersion++;
  }

  inspect(x: number, z: number) {
    const t = this.tile(x, z);
    if (!t) return null;
    const b = t.building >= 0 ? this.buildings[t.building] : null;
    const d = b ? this.def(b) : null;
    return {
      x,
      z,
      terrain: t.terrain,
      road: t.road,
      zone: t.zone,
      tree: t.tree,
      powered: t.powered,
      watered: t.watered,
      connected: t.connected || this.roadAccess(x, z),
      height: t.height,
      building: b
        ? {
            name: d!.name,
            kind: b.kind,
            level: b.level,
            occupancy: b.occupancy,
            residents: Math.round(d!.residents * b.occupancy),
            jobs: Math.round(d!.jobs * b.occupancy),
          }
        : null,
    };
  }

  pushNotice(key: string, text: string) {
    const last = this.noticeCooldown.get(key) ?? -999;
    if (this.tick - last < 40 && key !== "welcome" && key !== "mile" && key !== "loaded") return;
    this.noticeCooldown.set(key, this.tick);
    this.notices = this.notices.filter((n) => n.text !== text);
    this.notices.unshift({ id: `n${noticeSeq++}`, text, at: this.tick });
    if (this.notices.length > 4) this.notices.length = 4;
  }

  rebuildSnapshotCache() {
    /* occupancy already computed */
  }

  snapshot(): Snapshot {
    return {
      name: this.name,
      seed: this.seed,
      day: this.day,
      hour: this.hour,
      money: this.money,
      pop: this.pop,
      jobs: this.jobs,
      workers: this.workers,
      happiness: Math.round(this.happiness),
      demandR: this.demandR,
      demandC: this.demandC,
      demandI: this.demandI,
      income: this.lastIncome,
      expense: this.lastExpense,
      powerNeed: this.powerNeed,
      powerSupply: this.powerSupply,
      waterNeed: this.waterNeed,
      waterSupply: Math.round(this.waterSupply),
      buildings: this.buildings.length,
      roads: this.roadCount,
      connected: this.connectedCity,
      milestone: MILESTONES[this.milestoneIndex]?.name ?? "Aldea",
      notices: this.notices.slice(0, 3),
      bankrupt: this.money < 0,
    };
  }
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

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function shuffle<T>(arr: T[], rand: () => number) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
}

export function zoneFromTool(tool: Tool): Zone {
  if (tool === "zone-r") return "R";
  if (tool === "zone-c") return "C";
  if (tool === "zone-i") return "I";
  return "none";
}

export function createPreview(): CitySim {
  const s = new CitySim(20260828);
  const tryPaint = (tool: Tool, x: number, z: number) => {
    s.money = START_MONEY;
    s.applyTool(tool, x, z);
  };
  for (let x = 0; x <= 22; x++) {
    tryPaint("road", x, 16);
    tryPaint("road", x, 17);
  }
  for (let z = 9; z <= 26; z++) {
    tryPaint("road", 8, z);
    tryPaint("road", 14, z);
    tryPaint("road", 20, z);
  }
  tryPaint("power", 6, 14);
  tryPaint("water", 10, 15);
  tryPaint("park", 11, 19);
  tryPaint("park", 17, 21);
  for (let x = 9; x <= 13; x++) {
    for (let z = 18; z <= 22; z++) tryPaint("zone-r", x, z);
  }
  for (let x = 15; x <= 19; x++) {
    for (let z = 18; z <= 21; z++) tryPaint("zone-c", x, z);
  }
  for (let x = 9; x <= 13; x++) {
    for (let z = 10; z <= 14; z++) tryPaint("zone-i", x, z);
  }
  s.money = START_MONEY;
  s.paused = false;
  s.speed = 3;
  for (let i = 0; i < 40; i++) s.step(0.25);
  s.paused = true;
  s.speed = 1;
  s.money = START_MONEY;
  s.notices = [];
  return s;
}

