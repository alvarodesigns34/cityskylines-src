import { create } from "zustand";
import { CitySim, loadOrNull } from "./sim/city";
import { hasSave } from "./sim/save";
import type { Snapshot, Tool } from "./sim/types";

export type Phase = "menu" | "playing";

interface GameStore {
  phase: Phase;
  hasSave: boolean;
  tool: Tool;
  overlay: "none" | "power" | "water";
  snapshot: Snapshot | null;
  selected: { x: number; z: number } | null;
  savedFlash: number;
  worldId: number;
  startNew: (seed?: number) => void;
  continueSave: () => void;
  toMenu: () => void;
  setTool: (tool: Tool) => void;
  setOverlay: (overlay: "none" | "power" | "water") => void;
  setSpeed: (n: number) => void;
  togglePause: () => void;
  setSelected: (cell: { x: number; z: number } | null) => void;
  pullSnapshot: () => void;
  persistNow: () => void;
}

export let sim: CitySim | null = null;

export function setSim(next: CitySim | null) {
  sim = next;
  exposeQa();
}

function exposeQa() {
  if (typeof window === "undefined" || !sim) return;
  const city = sim;
  (window as Window & { __skyline?: unknown }).__skyline = {
    apply: (tool: Tool, x: number, z: number) => city.applyTool(tool, x, z),
    snapshot: () => city.snapshot(),
    inspect: (x: number, z: number) => city.inspect(x, z),
    tick: (n: number) => {
      city.paused = false;
      city.speed = 3;
      for (let i = 0; i < n; i++) city.step(0.25);
    },
    get money() {
      return city.money;
    },
    get pop() {
      return city.pop;
    },
  };
}

const emptySnap = (): Snapshot | null => (sim ? sim.snapshot() : null);

export const useGame = create<GameStore>((set, get) => ({
  phase: "menu",
  hasSave: false,
  tool: "road",
  overlay: "none",
  snapshot: null,
  selected: null,
  savedFlash: 0,
  worldId: 0,

  startNew: (seed?: number) => {
    sim = new CitySim(seed);
    sim.tool = "road";
    set({
      phase: "playing",
      tool: "road",
      overlay: "none",
      selected: null,
      snapshot: sim.snapshot(),
      hasSave: true,
      worldId: get().worldId + 1,
    });
    sim.persist();
    exposeQa();
  },

  continueSave: () => {
    const loaded = loadOrNull();
    if (!loaded) {
      get().startNew();
      return;
    }
    sim = loaded;
    exposeQa();
    set({
      phase: "playing",
      tool: "select",
      overlay: "none",
      selected: null,
      snapshot: sim.snapshot(),
      worldId: get().worldId + 1,
    });
  },

  toMenu: () => {
    if (sim) {
      sim.persist();
      sim.paused = true;
    }
    set({ phase: "menu", hasSave: hasSave() });
  },

  setTool: (tool) => {
    if (sim) sim.tool = tool;
    set({ tool });
  },

  setOverlay: (overlay) => {
    if (sim) sim.overlay = overlay;
    set({ overlay });
  },

  setSpeed: (n) => {
    if (!sim) return;
    sim.speed = n;
    sim.paused = n === 0;
    set({ snapshot: sim.snapshot() });
  },

  togglePause: () => {
    if (!sim) return;
    sim.paused = !sim.paused;
    set({ snapshot: sim.snapshot() });
  },

  setSelected: (cell) => {
    if (sim) sim.selected = cell;
    set({ selected: cell });
  },

  pullSnapshot: () => {
    if (!sim) return;
    set({ snapshot: emptySnap() });
  },

  persistNow: () => {
    if (!sim) return;
    sim.persist();
    set({ savedFlash: Date.now() });
  },
}));
