export const N = 36;
export const TICKS_PER_DAY = 24;
export const SIM_DT = 1 / 20;

export type Zone = "none" | "R" | "C" | "I";
export type Terrain = "grass" | "water" | "sand";

export type Tool =
  | "select"
  | "road"
  | "bulldoze"
  | "zone-r"
  | "zone-c"
  | "zone-i"
  | "power"
  | "water"
  | "park";

export type BuildingKind =
  | "house"
  | "apartments"
  | "tower"
  | "shop"
  | "market"
  | "office"
  | "warehouse"
  | "factory"
  | "works"
  | "power"
  | "water-tower"
  | "park";

export interface Tile {
  x: number;
  z: number;
  terrain: Terrain;
  height: number;
  road: boolean;
  highway: boolean;
  zone: Zone;
  tree: boolean;
  building: number;
  powered: boolean;
  watered: boolean;
  connected: boolean;
}

export interface Building {
  id: string;
  kind: BuildingKind;
  zone: Zone;
  x: number;
  z: number;
  w: number;
  d: number;
  level: 1 | 2 | 3;
  occupancy: number;
  variant: number;
  age: number;
}

export interface Vehicle {
  id: number;
  x: number;
  z: number;
  y: number;
  yaw: number;
  path: number[];
  i: number;
  t: number;
  color: number;
  speed: number;
}

export interface Notice {
  id: string;
  text: string;
  at: number;
}

export interface Snapshot {
  name: string;
  seed: number;
  day: number;
  hour: number;
  money: number;
  pop: number;
  jobs: number;
  workers: number;
  happiness: number;
  demandR: number;
  demandC: number;
  demandI: number;
  income: number;
  expense: number;
  powerNeed: number;
  powerSupply: number;
  waterNeed: number;
  waterSupply: number;
  buildings: number;
  roads: number;
  connected: boolean;
  milestone: string;
  notices: Notice[];
  bankrupt: boolean;
}

export function idx(x: number, z: number): number {
  return z * N + x;
}

export function inBounds(x: number, z: number): boolean {
  return x >= 0 && z >= 0 && x < N && z < N;
}

export const DIRS: Array<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
