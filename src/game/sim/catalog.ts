import type { Density, ServiceKind, Zone } from "./types";

export type Category = "residential" | "commercial" | "industrial" | "utility" | "service" | "park";

export type Shape = "house" | "row" | "block" | "tower" | "shed" | "civic" | "plant" | "flat";
export type Roof = "flat" | "gable" | "hip" | "parapet" | "saw";
export type WindowStyle = "none" | "grid" | "strip" | "ribbon" | "shop";

/** Parámetros que consume el generador paramétrico de geometría. */
export interface StyleDef {
  shape: Shape;
  floors: number;
  floorH: number;
  roof: Roof;
  windows: WindowStyle;
  /** Paleta de fachada; ver `render/geom/palettes.ts`. */
  palette: string;
  /** Retranqueo de la planta superior, 0..0.4. */
  setback?: number;
  /** Cuánto ocupa el edificio dentro de su parcela, 0..1. */
  fill?: number;
  chimneys?: number;
  antenna?: boolean;
  balconies?: boolean;
}

export interface ServiceDef {
  kind: ServiceKind;
  /** Radio de cobertura en casillas. */
  radius: number;
  /** Fuerza en el centro del radio, 0..1+. */
  strength: number;
  /** Ciudadanos (o toneladas/día para basura) que puede atender. */
  capacity: number;
}

export interface BuildingDef {
  kind: string;
  name: string;
  category: Category;
  zone: Zone;
  density: Density;
  level: number;
  w: number;
  d: number;
  /** Hogares que alberga (residencial). */
  homes: number;
  /** Puestos de trabajo. */
  jobs: number;
  /** Nivel educativo que exigen esos puestos: 0 básico · 1 medio · 2 alto. */
  jobEdu: 0 | 1 | 2;
  power: number;
  water: number;
  garbage: number;
  powerSupply: number;
  waterSupply: number;
  garbageCapacity: number;
  /** Emisión base de contaminación y ruido (se escala con la ocupación). */
  pollution: number;
  noise: number;
  cost: number;
  upkeep: number;
  service?: ServiceDef;
  /** Sube el valor del suelo a su alrededor. */
  amenity: number;
  amenityRadius: number;
  /** Nivel de ciudad en el que se desbloquea. */
  tier: number;
  desc: string;
  style: StyleDef;
}

type Partial0 = Partial<BuildingDef> & { kind: string; name: string; category: Category; style: StyleDef };

function def(d: Partial0): BuildingDef {
  return {
    zone: "none",
    density: "low",
    level: 1,
    w: 1,
    d: 1,
    homes: 0,
    jobs: 0,
    jobEdu: 0,
    power: 0,
    water: 0,
    garbage: 0,
    powerSupply: 0,
    waterSupply: 0,
    garbageCapacity: 0,
    pollution: 0,
    noise: 0,
    cost: 0,
    upkeep: 0,
    amenity: 0,
    amenityRadius: 0,
    tier: 0,
    desc: "",
    ...d,
  } as BuildingDef;
}

/* ------------------------------------------------------------------ *
 * Familias que crecen solas dentro de una zona.
 * Cada zona tiene dos densidades y tres niveles; el nivel sube cuando la
 * parcela tiene buen valor de suelo, servicios y demanda sostenida.
 * ------------------------------------------------------------------ */

const growables: BuildingDef[] = [
  // Residencial de baja densidad
  def({
    kind: "r_low_1", name: "Casa", category: "residential", zone: "R", density: "low", level: 1,
    homes: 3, power: 1, water: 1, garbage: 1, noise: 0.02,
    desc: "Vivienda unifamiliar.",
    style: { shape: "house", floors: 1, floorH: 1.05, roof: "gable", windows: "grid", palette: "suburb", fill: 0.62 },
  }),
  def({
    kind: "r_low_2", name: "Casa pareada", category: "residential", zone: "R", density: "low", level: 2,
    homes: 6, power: 2, water: 2, garbage: 2, noise: 0.03,
    desc: "Dos plantas y jardín.",
    style: { shape: "house", floors: 2, floorH: 1.0, roof: "hip", windows: "grid", palette: "suburb", fill: 0.68 },
  }),
  def({
    kind: "r_low_3", name: "Adosados", category: "residential", zone: "R", density: "low", level: 3,
    homes: 11, power: 4, water: 4, garbage: 3, noise: 0.05, amenity: 0.05, amenityRadius: 2,
    desc: "Hilera de viviendas de tres alturas.",
    style: { shape: "row", floors: 3, floorH: 0.95, roof: "gable", windows: "grid", palette: "townhouse", fill: 0.78 },
  }),
  // Residencial de alta densidad
  def({
    kind: "r_high_1", name: "Bloque bajo", category: "residential", zone: "R", density: "high", level: 1,
    homes: 16, power: 5, water: 6, garbage: 5, noise: 0.09,
    desc: "Bloque de cuatro alturas.",
    style: { shape: "block", floors: 4, floorH: 0.9, roof: "flat", windows: "grid", palette: "block", fill: 0.82, balconies: true },
  }),
  def({
    kind: "r_high_2", name: "Bloque", category: "residential", zone: "R", density: "high", level: 2,
    homes: 34, power: 11, water: 13, garbage: 9, noise: 0.13,
    desc: "Edificio residencial de ocho alturas.",
    style: { shape: "block", floors: 8, floorH: 0.88, roof: "parapet", windows: "grid", palette: "block", fill: 0.84, balconies: true },
  }),
  def({
    kind: "r_high_3", name: "Torre residencial", category: "residential", zone: "R", density: "high", w: 2, d: 2, level: 3,
    homes: 72, power: 24, water: 27, garbage: 18, noise: 0.16, amenity: 0.04, amenityRadius: 2,
    desc: "Torre de viviendas.",
    style: { shape: "tower", floors: 17, floorH: 0.86, roof: "parapet", windows: "ribbon", palette: "modern", fill: 0.74, setback: 0.16, antenna: true },
  }),
  // Comercio de baja densidad
  def({
    kind: "c_low_1", name: "Tienda", category: "commercial", zone: "C", density: "low", level: 1,
    jobs: 4, power: 2, water: 1, garbage: 2, noise: 0.06, amenity: 0.03, amenityRadius: 2,
    desc: "Comercio de barrio.",
    style: { shape: "shed", floors: 1, floorH: 1.2, roof: "flat", windows: "shop", palette: "retail", fill: 0.74 },
  }),
  def({
    kind: "c_low_2", name: "Comercios", category: "commercial", zone: "C", density: "low", level: 2,
    jobs: 11, power: 5, water: 3, garbage: 4, noise: 0.1, amenity: 0.05, amenityRadius: 3,
    desc: "Locales con vivienda encima.",
    style: { shape: "row", floors: 3, floorH: 0.98, roof: "parapet", windows: "shop", palette: "retail", fill: 0.8 },
  }),
  def({
    kind: "c_low_3", name: "Galería", category: "commercial", zone: "C", density: "low", w: 2, d: 2, level: 3,
    jobs: 24, jobEdu: 1, power: 10, water: 6, garbage: 8, noise: 0.14, amenity: 0.08, amenityRadius: 3,
    desc: "Galería comercial con aparcamiento.",
    style: { shape: "shed", floors: 2, floorH: 1.5, roof: "saw", windows: "strip", palette: "mall", fill: 0.9 },
  }),
  // Comercio de alta densidad (oficinas)
  def({
    kind: "c_high_1", name: "Oficinas", category: "commercial", zone: "C", density: "high", level: 1,
    jobs: 26, jobEdu: 1, power: 11, water: 6, garbage: 6, noise: 0.09,
    desc: "Edificio de oficinas.",
    style: { shape: "block", floors: 5, floorH: 0.95, roof: "flat", windows: "ribbon", palette: "office", fill: 0.84 },
  }),
  def({
    kind: "c_high_2", name: "Sede corporativa", category: "commercial", zone: "C", density: "high", level: 2,
    jobs: 58, jobEdu: 1, power: 24, water: 12, garbage: 12, noise: 0.11, amenity: 0.05, amenityRadius: 3,
    desc: "Oficinas de doce alturas.",
    style: { shape: "tower", floors: 12, floorH: 0.94, roof: "parapet", windows: "ribbon", palette: "office", fill: 0.8, setback: 0.1 },
  }),
  def({
    kind: "c_high_3", name: "Rascacielos", category: "commercial", zone: "C", density: "high", w: 2, d: 2, level: 3,
    jobs: 132, jobEdu: 2, power: 52, water: 24, garbage: 22, noise: 0.12, amenity: 0.12, amenityRadius: 4,
    desc: "Icono del skyline.",
    style: { shape: "tower", floors: 26, floorH: 0.92, roof: "parapet", windows: "ribbon", palette: "glass", fill: 0.72, setback: 0.22, antenna: true },
  }),
  // Industria ligera
  def({
    kind: "i_low_1", name: "Taller", category: "industrial", zone: "I", density: "low", level: 1,
    jobs: 7, power: 3, water: 2, garbage: 3, pollution: 0.35, noise: 0.2,
    desc: "Nave pequeña.",
    style: { shape: "shed", floors: 1, floorH: 1.4, roof: "gable", windows: "strip", palette: "industry", fill: 0.82 },
  }),
  def({
    kind: "i_low_2", name: "Fábrica", category: "industrial", zone: "I", density: "low", level: 2,
    jobs: 17, power: 8, water: 5, garbage: 7, pollution: 0.7, noise: 0.3,
    desc: "Producción y almacén.",
    style: { shape: "shed", floors: 1, floorH: 2.0, roof: "saw", windows: "strip", palette: "industry", fill: 0.88, chimneys: 1 },
  }),
  def({
    kind: "i_low_3", name: "Planta", category: "industrial", zone: "I", density: "low", level: 3,
    jobs: 30, jobEdu: 1, power: 15, water: 9, garbage: 12, pollution: 1.05, noise: 0.38,
    desc: "Complejo industrial.",
    style: { shape: "plant", floors: 2, floorH: 1.6, roof: "flat", windows: "strip", palette: "industry", fill: 0.92, chimneys: 2 },
  }),
  // Industria pesada
  def({
    kind: "i_high_1", name: "Nave logística", category: "industrial", zone: "I", density: "high", level: 1,
    jobs: 22, power: 10, water: 5, garbage: 9, pollution: 0.6, noise: 0.4,
    desc: "Muelles de carga y camiones.",
    style: { shape: "shed", floors: 1, floorH: 2.2, roof: "flat", windows: "strip", palette: "logistics", fill: 0.92 },
  }),
  def({
    kind: "i_high_2", name: "Acería", category: "industrial", zone: "I", density: "high", w: 2, d: 2, level: 2,
    jobs: 46, jobEdu: 1, power: 26, water: 16, garbage: 18, pollution: 1.7, noise: 0.55,
    desc: "Industria pesada. Mucho empleo, mucho humo.",
    style: { shape: "plant", floors: 2, floorH: 2.0, roof: "flat", windows: "none", palette: "heavy", fill: 0.94, chimneys: 3 },
  }),
  def({
    kind: "i_high_3", name: "Refinería", category: "industrial", zone: "I", density: "high", w: 2, d: 2, level: 3,
    jobs: 72, jobEdu: 1, power: 44, water: 26, garbage: 26, pollution: 2.4, noise: 0.6,
    desc: "El motor económico más sucio de la ciudad.",
    style: { shape: "plant", floors: 3, floorH: 1.9, roof: "flat", windows: "none", palette: "heavy", fill: 0.96, chimneys: 4 },
  }),
];

/* ------------------------------------------------------------------ *
 * Edificios que coloca el jugador.
 * ------------------------------------------------------------------ */

const placeables: BuildingDef[] = [
  def({
    kind: "power_coal", name: "Central térmica", category: "utility", w: 3, d: 3,
    jobs: 14, water: 8, garbage: 6, powerSupply: 260, pollution: 3.2, noise: 0.7,
    cost: 11500, upkeep: 95, amenity: -0.3, amenityRadius: 6, tier: 0,
    desc: "Barata y fiable. Ensucia mucho el aire.",
    style: { shape: "plant", floors: 2, floorH: 2.2, roof: "flat", windows: "strip", palette: "heavy", fill: 0.9, chimneys: 2 },
  }),
  def({
    kind: "power_wind", name: "Parque eólico", category: "utility", w: 2, d: 2,
    jobs: 3, powerSupply: 110, noise: 0.25,
    cost: 13000, upkeep: 62, tier: 2,
    desc: "Limpio pero flojo. Ocupa terreno.",
    style: { shape: "flat", floors: 1, floorH: 0.4, roof: "flat", windows: "none", palette: "clean", fill: 0.5 },
  }),
  def({
    kind: "power_solar", name: "Huerta solar", category: "utility", w: 3, d: 3,
    jobs: 5, powerSupply: 260,
    cost: 27000, upkeep: 110, tier: 3,
    desc: "Sin humo. Cara de instalar.",
    style: { shape: "flat", floors: 1, floorH: 0.3, roof: "flat", windows: "none", palette: "clean", fill: 0.95 },
  }),
  def({
    kind: "water_tower", name: "Depósito de agua", category: "utility", w: 1, d: 1,
    jobs: 1, power: 3, waterSupply: 130,
    cost: 4200, upkeep: 24, tier: 0,
    desc: "Abastece la red desde el acuífero.",
    style: { shape: "civic", floors: 1, floorH: 1.0, roof: "flat", windows: "none", palette: "civic", fill: 0.4 },
  }),
  def({
    kind: "water_pump", name: "Estación de bombeo", category: "utility", w: 2, d: 2,
    jobs: 5, power: 10, waterSupply: 520,
    cost: 14000, upkeep: 85, tier: 1,
    desc: "Debe tocar el río o la costa. Gran caudal.",
    style: { shape: "shed", floors: 1, floorH: 1.3, roof: "flat", windows: "strip", palette: "civic", fill: 0.8 },
  }),
  def({
    kind: "landfill", name: "Vertedero", category: "utility", w: 3, d: 3,
    jobs: 9, power: 2, garbageCapacity: 280, pollution: 1.2, noise: 0.3,
    cost: 5000, upkeep: 42, amenity: -0.35, amenityRadius: 7, tier: 0,
    service: { kind: "garbage", radius: 16, strength: 1, capacity: 280 },
    desc: "Absorbe la basura de la ciudad. Nadie quiere vivir al lado.",
    style: { shape: "flat", floors: 1, floorH: 0.5, roof: "flat", windows: "none", palette: "dirt", fill: 0.95 },
  }),
  def({
    kind: "recycling", name: "Planta de reciclaje", category: "utility", w: 2, d: 3,
    jobs: 24, jobEdu: 1, power: 22, water: 8, garbageCapacity: 760, pollution: 0.35, noise: 0.3,
    cost: 30000, upkeep: 240, amenity: -0.05, amenityRadius: 3, tier: 3,
    service: { kind: "garbage", radius: 22, strength: 1.3, capacity: 760 },
    desc: "Trata mucha más basura y casi no contamina.",
    style: { shape: "shed", floors: 1, floorH: 2.0, roof: "saw", windows: "strip", palette: "clean", fill: 0.9, chimneys: 1 },
  }),
  def({
    kind: "school", name: "Colegio", category: "service", w: 2, d: 2,
    jobs: 16, jobEdu: 2, power: 6, water: 5, garbage: 3,
    cost: 9000, upkeep: 150, amenity: 0.1, amenityRadius: 4, tier: 1,
    service: { kind: "education", radius: 11, strength: 1, capacity: 900 },
    desc: "Educación básica. Sube el nivel formativo del barrio.",
    style: { shape: "civic", floors: 2, floorH: 1.15, roof: "flat", windows: "grid", palette: "civic", fill: 0.82 },
  }),
  def({
    kind: "highschool", name: "Instituto", category: "service", w: 3, d: 2,
    jobs: 34, jobEdu: 2, power: 14, water: 10, garbage: 6,
    cost: 22000, upkeep: 320, amenity: 0.12, amenityRadius: 5, tier: 2,
    service: { kind: "education", radius: 15, strength: 1.5, capacity: 2400 },
    desc: "Forma trabajadores cualificados para oficinas e industria avanzada.",
    style: { shape: "civic", floors: 3, floorH: 1.1, roof: "flat", windows: "strip", palette: "civic", fill: 0.86 },
  }),
  def({
    kind: "clinic", name: "Consultorio", category: "service", w: 2, d: 2,
    jobs: 14, jobEdu: 2, power: 9, water: 7, garbage: 4,
    cost: 11000, upkeep: 175, amenity: 0.08, amenityRadius: 4, tier: 1,
    service: { kind: "health", radius: 11, strength: 1, capacity: 1100 },
    desc: "Atención primaria.",
    style: { shape: "civic", floors: 2, floorH: 1.1, roof: "flat", windows: "grid", palette: "health", fill: 0.8 },
  }),
  def({
    kind: "hospital", name: "Hospital", category: "service", w: 3, d: 3,
    jobs: 78, jobEdu: 2, power: 38, water: 30, garbage: 16,
    cost: 46000, upkeep: 720, amenity: 0.14, amenityRadius: 6, tier: 3,
    service: { kind: "health", radius: 19, strength: 1.7, capacity: 5200 },
    desc: "Cubre media ciudad. Caro de mantener.",
    style: { shape: "block", floors: 6, floorH: 1.05, roof: "flat", windows: "grid", palette: "health", fill: 0.86 },
  }),
  def({
    kind: "police", name: "Comisaría", category: "service", w: 2, d: 2,
    jobs: 20, jobEdu: 1, power: 8, water: 5, garbage: 3,
    cost: 11000, upkeep: 180, amenity: 0.04, amenityRadius: 3, tier: 1,
    service: { kind: "police", radius: 13, strength: 1, capacity: 2200 },
    desc: "Baja la delincuencia; la delincuencia hunde el valor del suelo.",
    style: { shape: "civic", floors: 2, floorH: 1.1, roof: "flat", windows: "grid", palette: "police", fill: 0.8 },
  }),
  def({
    kind: "fire", name: "Parque de bomberos", category: "service", w: 2, d: 2,
    jobs: 22, power: 8, water: 8, garbage: 3,
    cost: 12000, upkeep: 195, amenity: 0.03, amenityRadius: 3, tier: 2,
    service: { kind: "fire", radius: 13, strength: 1, capacity: 2200 },
    desc: "Sin cobertura, los incendios arrasan edificios enteros.",
    style: { shape: "civic", floors: 2, floorH: 1.2, roof: "flat", windows: "shop", palette: "fire", fill: 0.82 },
  }),
  def({
    kind: "park_small", name: "Plaza", category: "park", w: 1, d: 1,
    water: 1, cost: 700, upkeep: 14, amenity: 0.22, amenityRadius: 4, tier: 0,
    service: { kind: "leisure", radius: 5, strength: 0.5, capacity: 900 },
    desc: "Verde barato que sube el valor del suelo alrededor.",
    style: { shape: "flat", floors: 1, floorH: 0.2, roof: "flat", windows: "none", palette: "park", fill: 0.94 },
  }),
  def({
    kind: "park_plaza", name: "Parque urbano", category: "park", w: 2, d: 2,
    jobs: 2, water: 3, cost: 3000, upkeep: 34, amenity: 0.4, amenityRadius: 6, tier: 1,
    service: { kind: "leisure", radius: 9, strength: 1, capacity: 3200 },
    desc: "Arbolado, fuentes y bancos.",
    style: { shape: "flat", floors: 1, floorH: 0.25, roof: "flat", windows: "none", palette: "park", fill: 0.96 },
  }),
  def({
    kind: "park_large", name: "Gran parque", category: "park", w: 3, d: 3,
    jobs: 6, water: 8, cost: 12000, upkeep: 110, amenity: 0.7, amenityRadius: 9, tier: 3,
    service: { kind: "leisure", radius: 14, strength: 1.6, capacity: 9000 },
    desc: "El pulmón de la ciudad. Dispara el valor del suelo a su alrededor.",
    style: { shape: "flat", floors: 1, floorH: 0.3, roof: "flat", windows: "none", palette: "park", fill: 0.97 },
  }),
  def({
    kind: "city_hall", name: "Ayuntamiento", category: "service", w: 3, d: 2,
    jobs: 40, jobEdu: 2, power: 16, water: 12, garbage: 6,
    cost: 28000, upkeep: 260, amenity: 0.35, amenityRadius: 8, tier: 2,
    desc: "Único. Reduce el mantenimiento global de la ciudad un 10%.",
    style: { shape: "civic", floors: 3, floorH: 1.35, roof: "hip", windows: "grid", palette: "hall", fill: 0.84 },
  }),
];

export const DEFS: Record<string, BuildingDef> = Object.fromEntries(
  [...growables, ...placeables].map((d) => [d.kind, d]),
);

export const PLACEABLES = placeables.map((d) => d.kind);
export const UNIQUE_KINDS = new Set(["city_hall"]);

/** Cadena de crecimiento por zona y densidad. */
export const CHAIN: Record<string, string[]> = {
  "R:low": ["r_low_1", "r_low_2", "r_low_3"],
  "R:high": ["r_high_1", "r_high_2", "r_high_3"],
  "C:low": ["c_low_1", "c_low_2", "c_low_3"],
  "C:high": ["c_high_1", "c_high_2", "c_high_3"],
  "I:low": ["i_low_1", "i_low_2", "i_low_3"],
  "I:high": ["i_high_1", "i_high_2", "i_high_3"],
};

export function chainFor(zone: Zone, density: Density): string[] {
  return CHAIN[`${zone}:${density}`] ?? [];
}

/* ------------------------------------------------------------------ *
 * Vías
 * ------------------------------------------------------------------ */

export interface RoadDef {
  name: string;
  cost: number;
  bridgeCost: number;
  upkeep: number;
  /** Vehículos que absorbe sin congestionarse. */
  capacity: number;
  /** Velocidad relativa; alimenta el coste de las rutas. */
  speed: number;
  lanes: number;
  /** Ancho visual dentro de la casilla. */
  width: number;
  tier: number;
}

export const ROADS: Record<number, RoadDef> = {
  1: { name: "Calle", cost: 55, bridgeCost: 190, upkeep: 0.28, capacity: 620, speed: 1, lanes: 2, width: 0.62, tier: 0 },
  2: { name: "Avenida", cost: 150, bridgeCost: 420, upkeep: 0.9, capacity: 2100, speed: 1.5, lanes: 4, width: 0.86, tier: 1 },
  3: { name: "Autopista", cost: 420, bridgeCost: 980, upkeep: 2.4, capacity: 6400, speed: 2.4, lanes: 6, width: 0.96, tier: 4 },
};

export const BULLDOZE_ROAD = 18;
export const BULLDOZE_BUILDING = 60;
export const BULLDOZE_ZONE = 4;
export const START_MONEY = 62000;

/* ------------------------------------------------------------------ *
 * Progresión
 * ------------------------------------------------------------------ */

export interface Tier {
  name: string;
  pop: number;
  bonus: number;
  /** Qué desbloquea al llegar (para el aviso del HUD). */
  unlocks: string[];
}

export const TIERS: Tier[] = [
  { name: "Aldea", pop: 0, bonus: 0, unlocks: ["Calles", "Zonas de baja densidad", "Central térmica", "Depósito de agua", "Plaza", "Vertedero"] },
  { name: "Pueblo", pop: 140, bonus: 9000, unlocks: ["Avenidas", "Colegio", "Consultorio", "Comisaría", "Parque urbano", "Bombeo de agua"] },
  { name: "Villa", pop: 450, bonus: 20000, unlocks: ["Alta densidad", "Instituto", "Bomberos", "Ayuntamiento", "Parque eólico"] },
  { name: "Ciudad", pop: 1300, bonus: 45000, unlocks: ["Hospital", "Reciclaje", "Gran parque", "Huerta solar"] },
  { name: "Gran ciudad", pop: 3200, bonus: 90000, unlocks: ["Autopistas"] },
  { name: "Metrópolis", pop: 7500, bonus: 180000, unlocks: ["Todo desbloqueado"] },
];

export function tierForPop(pop: number): number {
  let t = 0;
  for (let i = 0; i < TIERS.length; i++) if (pop >= TIERS[i]!.pop) t = i;
  return t;
}
