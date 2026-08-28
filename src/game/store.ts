import { create } from "zustand";
import { CitySim, loadOrNull } from "./sim/city";
import { hasSave } from "./sim/save";
import { repayLoan, setTax, takeLoan } from "./sim/systems/economy";
import type { OverlayKind, Snapshot, Tool } from "./sim/types";

export type Phase = "menu" | "playing";
export type Panel = "none" | "budget" | "stats" | "services";

interface GameStore {
  phase: Phase;
  hasSave: boolean;
  tool: Tool;
  overlay: OverlayKind;
  panel: Panel;
  snapshot: Snapshot | null;
  selected: { x: number; z: number } | null;
  savedFlash: number;
  worldId: number;
  startNew: (seed?: number) => void;
  continueSave: () => void;
  toMenu: () => void;
  setTool: (tool: Tool) => void;
  setOverlay: (overlay: OverlayKind) => void;
  setPanel: (panel: Panel) => void;
  setSpeed: (n: number) => void;
  togglePause: () => void;
  setSelected: (cell: { x: number; z: number } | null) => void;
  pullSnapshot: () => void;
  persistNow: () => void;
  changeTax: (zone: "R" | "C" | "I", value: number) => void;
  borrow: (amount: number) => void;
  repay: (amount: number) => void;
}

export let sim: CitySim | null = null;

export function setSim(next: CitySim | null) {
  sim = next;
  exposeQa();
}

/** Puente de QA: permite manejar la partida desde el navegador sin tocar la UI. */
function exposeQa() {
  if (typeof window === "undefined" || !sim) return;
  const city = sim;
  (window as Window & { __skyline?: unknown }).__skyline = {
    apply: (tool: Tool, x: number, z: number) => city.applyTool(tool, x, z),
    canPlace: (tool: Tool, x: number, z: number) => city.canPlace(tool, x, z),
    snapshot: () => city.snapshot(),
    inspect: (x: number, z: number) => city.inspect(x, z),
    entry: () => city.entry,
    setTool: (tool: Tool) => useGame.getState().setTool(tool),
    setOverlay: (overlay: OverlayKind) => useGame.getState().setOverlay(overlay),
    select: (x: number, z: number) => useGame.getState().setSelected({ x, z }),
    newCity: (seed: number) => useGame.getState().startNew(seed),
    setTier: (t: number) => {
      city.tier = t;
      city.markCatalogChanged();
    },
    grant: (n: number) => {
      city.money += n;
    },
    tick: (n: number) => {
      const wasPaused = city.paused;
      city.paused = false;
      city.speed = 3;
      for (let i = 0; i < n; i++) city.step(0.1);
      city.paused = wasPaused;
      useGame.getState().pullSnapshot();
    },
    get money() {
      return city.money;
    },
    get pop() {
      return city.pop;
    },
    get sim() {
      return city;
    },
  };
}

export const useGame = create<GameStore>((set, get) => ({
  phase: "menu",
  hasSave: false,
  tool: "road-street",
  overlay: "none",
  panel: "none",
  snapshot: null,
  selected: null,
  savedFlash: 0,
  worldId: 0,

  startNew: (seed?: number) => {
    setSim(new CitySim(seed));
    sim!.tool = "road-street";
    set({
      phase: "playing",
      tool: "road-street",
      overlay: "none",
      panel: "none",
      selected: null,
      snapshot: sim!.snapshot(),
      hasSave: true,
      worldId: get().worldId + 1,
    });
    sim!.persist();
  },

  continueSave: () => {
    const loaded = loadOrNull();
    if (!loaded) {
      get().startNew();
      return;
    }
    setSim(loaded);
    set({
      phase: "playing",
      tool: "select",
      overlay: "none",
      panel: "none",
      selected: null,
      snapshot: loaded.snapshot(),
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

  setPanel: (panel) => set({ panel }),

  setSpeed: (n) => {
    if (!sim) return;
    sim.speed = Math.max(1, n);
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
    set({ snapshot: sim.snapshot() });
  },

  persistNow: () => {
    if (!sim) return;
    sim.persist();
    set({ savedFlash: Date.now() });
  },

  changeTax: (zone, value) => {
    if (!sim) return;
    setTax(sim, zone, value);
    set({ snapshot: sim.snapshot() });
  },

  borrow: (amount) => {
    if (!sim) return;
    takeLoan(sim, amount);
    set({ snapshot: sim.snapshot() });
  },

  repay: (amount) => {
    if (!sim) return;
    repayLoan(sim, amount);
    set({ snapshot: sim.snapshot() });
  },
}));
