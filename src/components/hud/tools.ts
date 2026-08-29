import { DEFS, ROADS, TIERS } from "@/game/sim/catalog";
import type { OverlayKind, Tool } from "@/game/sim/types";
import {
  Ambulance,
  Building2,
  CloudFog,
  Droplets,
  Eye,
  Factory,
  Flame,
  GraduationCap,
  Hammer,
  Home,
  Landmark,
  Layers,
  MousePointer2,
  Recycle,
  Route,
  School,
  ShieldCheck,
  Sparkles,
  Store,
  Stethoscope,
  Trash2,
  TreePine,
  Trees,
  Volume2,
  Waves,
  Wind,
  Zap,
} from "lucide-react";

export type Icon = typeof Zap;

export interface ToolEntry {
  tool: Tool;
  name: string;
  hint: string;
  cost: number | null;
  icon: Icon;
  tier: number;
}

export interface ToolGroup {
  id: string;
  name: string;
  icon: Icon;
  tools: ToolEntry[];
}

function build(kind: string, icon: Icon, hint?: string): ToolEntry {
  const d = DEFS[kind]!;
  return {
    tool: `build:${kind}`,
    name: d.name,
    hint: hint ?? d.desc,
    cost: d.cost,
    icon,
    tier: d.tier,
  };
}

export const TOOL_GROUPS: ToolGroup[] = [
  {
    id: "roads",
    name: "Vías",
    icon: Route,
    tools: [
      {
        tool: "road-street",
        name: ROADS[1]!.name,
        hint: "Barata y lenta. Arrastra para trazar; cruzar el agua cuesta más.",
        cost: ROADS[1]!.cost,
        icon: Route,
        tier: 0,
      },
      {
        tool: "road-avenue",
        name: ROADS[2]!.name,
        hint: "Cuádruple capacidad y más velocidad: la espina dorsal de la ciudad.",
        cost: ROADS[2]!.cost,
        icon: Route,
        tier: ROADS[2]!.tier,
      },
      {
        tool: "road-highway",
        name: ROADS[3]!.name,
        hint: "Para conectar distritos lejanos sin colapsar las avenidas.",
        cost: ROADS[3]!.cost,
        icon: Route,
        tier: ROADS[3]!.tier,
      },
      { tool: "bulldoze", name: "Demoler", hint: "Quita vías, zonas, árboles y edificios.", cost: null, icon: Hammer, tier: 0 },
    ],
  },
  {
    id: "zones",
    name: "Zonas",
    icon: Layers,
    tools: [
      { tool: "zone-r", name: "Vivienda", hint: "Casas y adosados. Necesita calle a menos de 4 casillas, luz y agua.", cost: 0, icon: Home, tier: 0 },
      { tool: "zone-c", name: "Comercio", hint: "Tiendas y oficinas: empleo y recaudación.", cost: 0, icon: Store, tier: 0 },
      { tool: "zone-i", name: "Industria", hint: "Mucho empleo poco cualificado. Humo, ruido y camiones.", cost: 0, icon: Factory, tier: 0 },
      { tool: "zone-r-high", name: "Vivienda alta", hint: "Bloques y torres. Densidad a cambio de servicios.", cost: 0, icon: Building2, tier: 2 },
      { tool: "zone-c-high", name: "Oficinas", hint: "Empleo cualificado: exige nivel educativo alto.", cost: 0, icon: Building2, tier: 2 },
      { tool: "zone-i-high", name: "Industria pesada", hint: "El motor económico más sucio.", cost: 0, icon: Factory, tier: 2 },
    ],
  },
  {
    id: "utilities",
    name: "Suministros",
    icon: Zap,
    tools: [
      build("power_coal", Zap),
      build("power_wind", Wind),
      build("power_solar", Sparkles),
      build("water_tower", Droplets),
      build("water_pump", Waves),
      build("landfill", Trash2),
      build("recycling", Recycle),
    ],
  },
  {
    id: "services",
    name: "Servicios",
    icon: ShieldCheck,
    tools: [
      build("school", School),
      build("highschool", GraduationCap),
      build("clinic", Stethoscope),
      build("hospital", Ambulance),
      build("police", ShieldCheck),
      build("fire", Flame),
      build("city_hall", Landmark),
    ],
  },
  {
    id: "leisure",
    name: "Ocio",
    icon: Trees,
    tools: [
      { tool: "tree-plant", name: "Árbol", hint: "Planta un árbol: limpia el aire y sube el valor del suelo.", cost: 18, icon: TreePine, tier: 0 },
      build("park_small", Trees),
      build("park_plaza", TreePine),
      build("park_large", TreePine),
    ],
  },
];

export const SELECT_TOOL: ToolEntry = {
  tool: "select",
  name: "Inspeccionar",
  hint: "Pulsa una parcela o un edificio para ver su ficha.",
  cost: null,
  icon: MousePointer2,
  tier: 0,
};

export function tierName(tier: number): string {
  return TIERS[tier]?.name ?? "";
}

export interface OverlayEntry {
  id: OverlayKind;
  name: string;
  icon: Icon;
}

export const OVERLAYS: OverlayEntry[] = [
  { id: "none", name: "Sin capa", icon: Eye },
  { id: "power", name: "Electricidad", icon: Zap },
  { id: "water", name: "Agua", icon: Droplets },
  { id: "landvalue", name: "Valor del suelo", icon: Landmark },
  { id: "traffic", name: "Tráfico", icon: Route },
  { id: "pollution", name: "Contaminación", icon: CloudFog },
  { id: "noise", name: "Ruido", icon: Volume2 },
  { id: "education", name: "Educación", icon: School },
  { id: "health", name: "Sanidad", icon: Stethoscope },
  { id: "safety", name: "Seguridad", icon: ShieldCheck },
  { id: "garbage", name: "Basura", icon: Trash2 },
];

/** Atajos 1..9 del dock. */
export const SHORTCUTS: Tool[] = [
  "select",
  "road-street",
  "road-avenue",
  "zone-r",
  "zone-c",
  "zone-i",
  "build:power_coal",
  "build:water_tower",
  "bulldoze",
];
