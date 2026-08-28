/** Lado del mapa en casillas. */
export const N = 64;
/** Ticks de simulación por día (uno cada 30 min de juego). */
export const TICKS_PER_DAY = 48;
/** Paso fijo de simulación en segundos reales. */
export const SIM_DT = 1 / 12;
/** Multiplicador de tiempo por nivel de velocidad. */
export const SPEEDS = [0, 1, 3, 7] as const;

export type Zone = "none" | "R" | "C" | "I";
export type Density = "low" | "high";

export const TERRAIN = { grass: 0, water: 1, sand: 2, rock: 3 } as const;
export type TerrainId = (typeof TERRAIN)[keyof typeof TERRAIN];
export const TERRAIN_NAME = ["hierba", "agua", "arena", "roca"] as const;

/** 0 sin vía · 1 calle · 2 avenida · 3 autopista */
export const ROAD = { none: 0, street: 1, avenue: 2, highway: 3 } as const;
export type RoadClass = (typeof ROAD)[keyof typeof ROAD];

export const ZONE_ID = { none: 0, R: 1, C: 2, I: 3 } as const;
export const ZONE_OF_ID: Zone[] = ["none", "R", "C", "I"];

/** Campos de servicio urbano rasterizados sobre el grid. */
export const SERVICES = ["education", "health", "police", "fire", "garbage", "leisure"] as const;
export type ServiceKind = (typeof SERVICES)[number];

export type Tool =
  | "select"
  | "bulldoze"
  | "road-street"
  | "road-avenue"
  | "road-highway"
  | "zone-r"
  | "zone-c"
  | "zone-i"
  | "zone-r-high"
  | "zone-c-high"
  | "zone-i-high"
  | `build:${string}`;

export type OverlayKind =
  | "none"
  | "power"
  | "water"
  | "pollution"
  | "noise"
  | "landvalue"
  | "traffic"
  | "education"
  | "health"
  | "safety"
  | "garbage";

export interface Building {
  id: number;
  kind: string;
  zone: Zone;
  x: number;
  z: number;
  w: number;
  d: number;
  /** 0..3 · cuartos de vuelta; la fachada mira a la calle más cercana. */
  rot: number;
  level: number;
  variant: number;
  /** 0..1 · cuánto del edificio está realmente en uso. */
  occupancy: number;
  /** Ticks desde que se construyó o subió de nivel. */
  age: number;
  /** 0..1 · calidad media del servicio recibido; alimenta abandono y nivel. */
  wellbeing: number;
  /** Viajes diarios que genera; lo calcula el sistema de tráfico. */
  trips: number;
}

export interface Vehicle {
  id: number;
  kind: 0 | 1 | 2 | 3; // coche · furgoneta · camión · emergencia
  path: Int32Array;
  /** Índice del segmento actual dentro de path. */
  i: number;
  /** Progreso 0..1 dentro del segmento. */
  t: number;
  speed: number;
  color: number;
  /** Carril: -1 derecha, +1 izquierda del eje. */
  lane: number;
  x: number;
  z: number;
  y: number;
  yaw: number;
}

export interface Notice {
  id: string;
  text: string;
  kind: "info" | "warn" | "good";
  at: number;
}

export interface BudgetLine {
  label: string;
  amount: number;
}

export interface Snapshot {
  name: string;
  seed: number;
  day: number;
  hour: number;
  /** 0..1 dentro del día, para el ciclo día/noche del render. */
  dayFraction: number;
  paused: boolean;
  speed: number;

  money: number;
  debt: number;
  income: number;
  expense: number;
  incomeLines: BudgetLine[];
  expenseLines: BudgetLine[];
  taxR: number;
  taxC: number;
  taxI: number;

  pop: number;
  households: number;
  homesCapacity: number;
  workers: number;
  jobs: number;
  unemployment: number;
  education: number;
  health: number;
  safety: number;

  happiness: number;
  landValue: number;
  pollution: number;
  noise: number;
  garbageBacklog: number;
  congestion: number;

  demandR: number;
  demandC: number;
  demandI: number;

  powerNeed: number;
  powerSupply: number;
  waterNeed: number;
  waterSupply: number;
  garbageNeed: number;
  garbageCapacity: number;

  buildings: number;
  roads: number;
  connected: boolean;

  tier: number;
  tierName: string;
  nextTierName: string | null;
  nextTierPop: number | null;
  unlocked: string[];

  notices: Notice[];
  bankrupt: boolean;
  history: HistoryPoint[];
}

export interface HistoryPoint {
  day: number;
  pop: number;
  money: number;
  balance: number;
  happiness: number;
  landValue: number;
  pollution: number;
}

export function idx(x: number, z: number): number {
  return z * N + x;
}

export function inBounds(x: number, z: number): boolean {
  return x >= 0 && z >= 0 && x < N && z < N;
}

export const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export const DIRS8: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

export function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

export function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
