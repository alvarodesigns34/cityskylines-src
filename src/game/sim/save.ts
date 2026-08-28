import type { Building, Snapshot, Tile, Vehicle } from "./types";

export const SAVE_VERSION = 1;
export const SAVE_KEY = "skyline-mini-save-v1";
export const SAVE_BACKUP = "skyline-mini-save-v1-bak";

export interface SaveBlob {
  version: number;
  seed: number;
  name: string;
  day: number;
  hour: number;
  tick: number;
  money: number;
  milestoneIndex: number;
  tiles: Tile[];
  buildings: Building[];
  vehicles: Vehicle[];
  nextId: number;
  nextVeh: number;
  snapshot: Snapshot;
}

function migrate(raw: SaveBlob): SaveBlob {
  const s = { ...raw };
  if (!s.version) s.version = 1;
  return s;
}

export function writeSave(blob: SaveBlob): boolean {
  try {
    const prev = localStorage.getItem(SAVE_KEY);
    if (prev) localStorage.setItem(SAVE_BACKUP, prev);
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...blob, version: SAVE_VERSION }));
    return true;
  } catch {
    return false;
  }
}

export function readSave(): SaveBlob | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SaveBlob;
    if (!parsed || !Array.isArray(parsed.tiles) || !Array.isArray(parsed.buildings)) return null;
    return migrate(parsed);
  } catch {
    try {
      const bak = localStorage.getItem(SAVE_BACKUP);
      if (!bak) return null;
      return migrate(JSON.parse(bak) as SaveBlob);
    } catch {
      return null;
    }
  }
}

export function hasSave(): boolean {
  try {
    return Boolean(localStorage.getItem(SAVE_KEY));
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}
