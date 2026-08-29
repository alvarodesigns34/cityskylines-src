import type { HistoryPoint, Policies } from "./types";

export const SAVE_VERSION = 2;
export const SAVE_KEY = "skyline-mini-save-v2";
export const SAVE_BACKUP = "skyline-mini-save-v2-bak";
/** Clave del prototipo anterior. No se migra (el mapa cambió de 36×36 a 64×64) ni se borra. */
export const LEGACY_KEY = "skyline-mini-save-v1";

export interface SavedBuilding {
  id: number;
  kind: string;
  x: number;
  z: number;
  rot: number;
  variant: number;
  occupancy: number;
  age: number;
  wellbeing: number;
}

export interface SaveBlob {
  version: number;
  seed: number;
  name: string;
  entry: { x: number; z: number };
  day: number;
  tick: number;
  money: number;
  debt: number;
  taxR: number;
  taxC: number;
  taxI: number;
  tier: number;
  garbageBacklog: number;
  eduLevel: number;
  nextBuildingId: number;
  /** Grid en typed arrays codificados en base64. */
  grid: Record<string, string | number>;
  buildings: SavedBuilding[];
  history: HistoryPoint[];
  rain?: number;
  policies?: Partial<Policies>;
}

export function writeSave(blob: SaveBlob): boolean {
  try {
    const json = JSON.stringify({ ...blob, version: SAVE_VERSION });
    const prev = localStorage.getItem(SAVE_KEY);
    if (prev) localStorage.setItem(SAVE_BACKUP, prev);
    localStorage.setItem(SAVE_KEY, json);
    return true;
  } catch {
    return false;
  }
}

function parse(raw: string | null): SaveBlob | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SaveBlob;
    if (!parsed || parsed.version !== SAVE_VERSION) return null;
    if (!parsed.grid || !Array.isArray(parsed.buildings)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function readSave(): SaveBlob | null {
  try {
    return parse(localStorage.getItem(SAVE_KEY)) ?? parse(localStorage.getItem(SAVE_BACKUP));
  } catch {
    return null;
  }
}

export function hasSave(): boolean {
  try {
    return Boolean(readSave());
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
    localStorage.removeItem(SAVE_BACKUP);
  } catch {
    /* almacenamiento no disponible */
  }
}
