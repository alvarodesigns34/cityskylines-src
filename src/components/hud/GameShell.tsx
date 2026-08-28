import { input } from "@/game/input";
import { createPreview } from "@/game/sim/city";
import { TOOL_META } from "@/game/sim/catalog";
import { setSim, sim, useGame } from "@/game/store";
import { hasSave } from "@/game/sim/save";
import type { Tool } from "@/game/sim/types";
import {
  Droplets,
  Factory,
  FastForward,
  Hammer,
  HelpCircle,
  Home,
  Pause,
  Play,
  Pointer,
  Save,
  Store,
  Trees,
  Waypoints,
  Zap,
} from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";

const CityCanvas = lazy(() =>
  import("@/game/render/CityScene").then((m) => ({ default: m.CityCanvas })),
);

const TOOLS: { id: Tool; icon: typeof Home }[] = [
  { id: "select", icon: Pointer },
  { id: "road", icon: Waypoints },
  { id: "zone-r", icon: Home },
  { id: "zone-c", icon: Store },
  { id: "zone-i", icon: Factory },
  { id: "power", icon: Zap },
  { id: "water", icon: Droplets },
  { id: "park", icon: Trees },
  { id: "bulldoze", icon: Hammer },
];

export function GameShell() {
  const [mounted, setMounted] = useState(false);
  const phase = useGame((s) => s.phase);

  useEffect(() => {
    setMounted(true);
    useGame.setState({ hasSave: hasSave() });
    input.attach();
    if (!sim) setSim(createPreview());
    const onHide = () => {
      if (document.hidden) useGame.getState().persistNow();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      input.detach();
      document.removeEventListener("visibilitychange", onHide);
    };
  }, []);

  return (
    <div className="game-root">
      {mounted ? (
        <Suspense fallback={null}>
          <CityCanvas interactive={phase === "playing"} />
        </Suspense>
      ) : null}
      {phase === "menu" ? <StartOverlay /> : mounted ? <PlayHud /> : null}
    </div>
  );
}

function StartOverlay() {
  const startNew = useGame((s) => s.startNew);
  const continueSave = useGame((s) => s.continueSave);
  const hasSave = useGame((s) => s.hasSave);

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-5 sm:p-8">
      <div className="pointer-events-auto max-w-md">
        <p className="text-xs font-medium tracking-[0.22em] text-accent uppercase">Constructor de ciudades</p>
        <h1 className="font-display mt-2 text-5xl leading-[0.95] tracking-tight text-fg sm:text-6xl">
          Skyline Mini
        </h1>
        <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted">
          Una ciudad 3D compacta. Alarga la autovía, zona viviendas y trabajo, mantén la luz y el agua, y crece un skyline sin arruinarte.
        </p>
      </div>

      <div className="pointer-events-auto flex flex-col gap-3 sm:max-w-sm">
        <button
          type="button"
          onClick={() => startNew()}
          className="rounded-xl bg-fg px-5 py-3 text-left text-sm font-medium text-bg transition-transform duration-150 hover:opacity-95 active:scale-[0.98]"
        >
          Fundar una ciudad
        </button>
        {hasSave ? (
          <button
            type="button"
            onClick={continueSave}
            className="hud-panel rounded-xl px-5 py-3 text-left text-sm font-medium text-fg"
          >
            Continuar la última ciudad
          </button>
        ) : null}
        <p className="text-xs text-faint">
          WASD pan · Q/E rotar · rueda zoom · arrastra para construir
        </p>
      </div>
    </div>
  );
}

function PlayHud() {
  const [help, setHelp] = useState(false);
  const tool = useGame((s) => s.tool);
  const setTool = useGame((s) => s.setTool);
  const snapshot = useGame((s) => s.snapshot);
  const overlay = useGame((s) => s.overlay);
  const setOverlay = useGame((s) => s.setOverlay);
  const togglePause = useGame((s) => s.togglePause);
  const setSpeed = useGame((s) => s.setSpeed);
  const persistNow = useGame((s) => s.persistNow);
  const toMenu = useGame((s) => s.toMenu);
  const selected = useGame((s) => s.selected);
  const savedFlash = useGame((s) => s.savedFlash);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, Tool> = {
        Digit1: "select",
        Digit2: "road",
        Digit3: "zone-r",
        Digit4: "zone-c",
        Digit5: "zone-i",
        Digit6: "power",
        Digit7: "water",
        Digit8: "park",
        Digit9: "bulldoze",
      };
      const t = map[e.code];
      if (t) setTool(t);
      if (e.code === "Space") {
        e.preventDefault();
        togglePause();
      }
      if (e.code === "Escape") setTool("select");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setTool, togglePause]);

  const inspect = useMemo(() => {
    if (!selected || !sim) return null;
    return sim.inspect(selected.x, selected.z);
  }, [selected, snapshot]);

  const meta = TOOL_META[tool];
  const paused = Boolean(sim?.paused);
  const speed = sim?.speed ?? 1;

  return (
    <>
      <header className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-2 p-3 sm:p-4">
        <div className="pointer-events-auto hud-panel flex flex-wrap items-center gap-2 rounded-2xl px-3 py-2">
          <div>
            <p className="font-display text-base leading-none text-fg">{snapshot?.name ?? "Ciudad"}</p>
            <p className="mt-0.5 text-[11px] text-muted">
              {snapshot?.milestone} · Día {snapshot?.day ?? 1}
            </p>
          </div>
          <span className="hud-chip text-xs text-fg">
            <Home className="size-3.5 text-zone-r" />
            {snapshot?.pop ?? 0}
          </span>
          <span className="hud-chip text-xs text-fg">
            <Store className="size-3.5 text-zone-c" />
            {snapshot?.jobs ?? 0} empleos
          </span>
          <span className={`hud-chip text-xs ${snapshot && snapshot.money < 0 ? "text-danger" : "text-fg"}`}>
            ${Math.round(snapshot?.money ?? 0).toLocaleString()}
          </span>
        </div>

        <div className="pointer-events-auto hud-panel flex items-center gap-1 rounded-2xl p-1">
          <IconBtn label={paused ? "Reanudar" : "Pausa"} onClick={togglePause}>
            {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
          </IconBtn>
          <IconBtn label="Velocidad normal" active={!paused && speed === 1} onClick={() => setSpeed(1)}>
            <span className="text-[11px] font-medium">1x</span>
          </IconBtn>
          <IconBtn label="Rápido" active={!paused && speed === 2} onClick={() => setSpeed(2)}>
            <span className="text-[11px] font-medium">2x</span>
          </IconBtn>
          <IconBtn label="Muy rápido" active={!paused && speed === 3} onClick={() => setSpeed(3)}>
            <FastForward className="size-4" />
          </IconBtn>
          <IconBtn label="Guardar" onClick={persistNow}>
            <Save className="size-4" />
          </IconBtn>
          <IconBtn label="Cómo jugar" onClick={() => setHelp(true)}>
            <HelpCircle className="size-4" />
          </IconBtn>
          <IconBtn label="Menú" onClick={toMenu}>
            <span className="text-[11px] font-medium">Menú</span>
          </IconBtn>
        </div>
      </header>

      <div className="pointer-events-none absolute left-3 top-24 flex w-[min(100%-1.5rem,16rem)] flex-col gap-2 sm:left-4">
        <div className="pointer-events-auto hud-panel rounded-2xl p-3">
          <p className="text-[11px] font-medium tracking-wide text-muted uppercase">Demanda</p>
          <DemandRow label="Vivienda" color="bg-zone-r" value={snapshot?.demandR ?? 0} />
          <DemandRow label="Comercio" color="bg-zone-c" value={snapshot?.demandC ?? 0} />
          <DemandRow label="Industria" color="bg-zone-i" value={snapshot?.demandI ?? 0} />
          <div className="mt-2 flex justify-between text-[11px] text-muted">
            <span>Ánimo {snapshot?.happiness ?? 0}</span>
            <span>
              {snapshot && snapshot.income - snapshot.expense >= 0 ? "+" : ""}
              {Math.round((snapshot?.income ?? 0) - (snapshot?.expense ?? 0))}/día
            </span>
          </div>
        </div>

        <div className="pointer-events-auto hud-panel flex gap-1 rounded-2xl p-1">
          <IconBtn label="Mapa de luz" active={overlay === "power"} onClick={() => setOverlay(overlay === "power" ? "none" : "power")}>
            <Zap className="size-4" />
          </IconBtn>
          <IconBtn label="Mapa de agua" active={overlay === "water"} onClick={() => setOverlay(overlay === "water" ? "none" : "water")}>
            <Droplets className="size-4" />
          </IconBtn>
          <p className="flex items-center px-2 text-[11px] text-muted">
            Luz {Math.round(snapshot?.powerSupply ?? 0)}/{Math.round(snapshot?.powerNeed ?? 0)} · Agua {Math.round(snapshot?.waterSupply ?? 0)}/{Math.round(snapshot?.waterNeed ?? 0)}
          </p>
        </div>

        {inspect ? (
          <div className="pointer-events-auto hud-panel rounded-2xl p-3 text-xs">
            <p className="font-medium text-fg">
              {inspect.building?.name ?? (inspect.road ? "Calle" : inspect.zone !== "none" ? `Zona ${inspect.zone}` : inspect.terrain)}
            </p>
            <p className="mt-1 text-muted">
              {inspect.building
                ? `Nv ${inspect.building.level} · ${Math.round(inspect.building.occupancy * 100)}% ocupado · ${inspect.building.residents} pers. · ${inspect.building.jobs} empleos`
                : `Parcela ${inspect.x},${inspect.z}`}
            </p>
            <p className="mt-1 text-muted">
              {inspect.powered ? "Con luz" : "Sin luz"} · {inspect.watered ? "Con agua" : "Seco"} · {inspect.connected ? "En red" : "Fuera de la autovía"}
            </p>
          </div>
        ) : null}
      </div>

      <div className="pointer-events-none absolute right-3 top-24 flex w-[min(100%-1.5rem,16rem)] flex-col items-end gap-2 sm:right-4">
        {snapshot?.notices.map((n) => (
          <div key={n.id} className="pointer-events-auto hud-panel w-full rounded-2xl px-3 py-2 text-xs text-fg">
            {n.text}
          </div>
        ))}
        {savedFlash > 0 && Date.now() - savedFlash < 1800 ? (
          <div className="hud-panel rounded-full px-3 py-1 text-[11px] text-muted">Guardado</div>
        ) : null}
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 p-3 sm:p-4">
        <p className="pointer-events-none text-[11px] text-fg/90 drop-shadow-sm">
          {meta.name}
          {meta.cost ? ` · ${meta.cost}` : ""} — {meta.hint}
        </p>
        <nav className="pointer-events-auto hud-panel flex max-w-full gap-0.5 overflow-x-auto rounded-[22px] p-1.5">
          {TOOLS.map(({ id, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={`tool-btn ${tool === id ? "active" : ""}`}
              onClick={() => setTool(id)}
              aria-label={TOOL_META[id].name}
              aria-pressed={tool === id}
            >
              <Icon className="size-4" />
              <span className="label hidden sm:block">{TOOL_META[id].name}</span>
            </button>
          ))}
        </nav>
      </div>

      {help ? <HelpModal onClose={() => setHelp(false)} /> : null}
    </>
  );
}

function DemandRow({ label, color, value }: { label: string; color: string; value: number }) {
  return (
    <div className="mt-2">
      <div className="mb-1 flex justify-between text-[11px] text-muted">
        <span>{label}</span>
        <span>{Math.round(value * 100)}%</span>
      </div>
      <div className="demand-track">
        <div className={`demand-fill ${color}`} style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  active,
  label,
}: {
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`flex h-9 min-w-9 items-center justify-center rounded-[10px] px-2 text-muted transition-colors duration-150 hover:text-fg ${
        active ? "bg-raised text-fg" : ""
      }`}
    >
      {children}
    </button>
  );
}

function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-20 flex items-end justify-center bg-bg/50 p-4 sm:items-center" onClick={onClose}>
      <div
        className="hud-panel max-h-[80dvh] w-full max-w-md overflow-auto rounded-3xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display text-2xl text-fg">Cómo jugar</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-4 text-sm text-muted">
          <li>Arrastra una calle desde la autovía oeste para conectar la red.</li>
          <li>Pinta zonas de vivienda, comercio e industria junto a esas calles.</li>
          <li>Coloca una central y un depósito. Los servicios viajan por las calles. Las orillas del río también dan agua.</li>
          <li>Los edificios crecen solos si hay demanda, luz y agua.</li>
          <li>Vigila el presupuesto. Los parques levantan el ánimo. La industria paga, pero ensucia.</li>
        </ol>
        <p className="mt-4 text-xs text-faint">
          WASD pan · Q/E rotar · R/F zoom · 1–9 herramientas · Espacio pausa · clic derecho orbitar
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-xl bg-fg py-2.5 text-sm font-medium text-bg"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}
