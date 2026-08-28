import { input } from "@/game/input";
import { createPreview } from "@/game/sim/city";
import { hasSave } from "@/game/sim/save";
import type { OverlayKind, Snapshot, Tool } from "@/game/sim/types";
import { setSim, sim, useGame } from "@/game/store";
import { formatHour } from "@/game/render/daynight";
import {
  BarChart3,
  Coins,
  FastForward,
  HelpCircle,
  Pause,
  Play,
  Save,
  ShieldCheck,
  Smile,
  Store,
  Users,
} from "lucide-react";
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { money, num, pct } from "./format";
import { Inspector } from "./Inspector";
import { BudgetPanel, Meter, ServicesPanel, StatsPanel } from "./panels";
import { OVERLAYS, SELECT_TOOL, SHORTCUTS, TOOL_GROUPS, tierName, type ToolEntry } from "./tools";

const CityCanvas = lazy(() =>
  import("@/game/render/CityScene").then((m) => ({ default: m.CityCanvas })),
);

export function GameShell() {
  const [mounted, setMounted] = useState(false);
  const phase = useGame((s) => s.phase);

  useEffect(() => {
    setMounted(true);
    useGame.setState({ hasSave: hasSave() });
    input.attach();
    if (!sim) setSim(createPreview());
    const onHide = () => {
      if (document.hidden && useGame.getState().phase === "playing") useGame.getState().persistNow();
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
  const canContinue = useGame((s) => s.hasSave);

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between bg-gradient-to-b from-bg/70 via-transparent to-bg/80 p-5 sm:p-8">
      <div className="pointer-events-auto max-w-md">
        <p className="text-xs font-medium tracking-[0.22em] text-accent uppercase">Constructor de ciudades</p>
        <h1 className="font-display mt-2 text-5xl leading-[0.95] tracking-tight text-fg sm:text-6xl">
          Skyline Mini
        </h1>
        <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted">
          Traza la red, zonifica junto a ella y mantén la ciudad viva: luz, agua, colegios, sanidad y basura.
          El valor del suelo decide qué se construye; el humo y los atascos deciden quién se marcha.
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
        {canContinue ? (
          <button
            type="button"
            onClick={continueSave}
            className="hud-panel rounded-xl px-5 py-3 text-left text-sm font-medium text-fg"
          >
            Continuar la última ciudad
          </button>
        ) : null}
        <p className="text-xs text-faint">
          WASD mover · Q/E girar · T/G inclinar · rueda zoom · arrastra para construir
        </p>
      </div>
    </div>
  );
}

function PlayHud() {
  const [help, setHelp] = useState(false);
  const [group, setGroup] = useState(TOOL_GROUPS[0]!.id);
  const tool = useGame((s) => s.tool);
  const setTool = useGame((s) => s.setTool);
  const snapshot = useGame((s) => s.snapshot);
  const overlay = useGame((s) => s.overlay);
  const setOverlay = useGame((s) => s.setOverlay);
  const panel = useGame((s) => s.panel);
  const setPanel = useGame((s) => s.setPanel);
  const togglePause = useGame((s) => s.togglePause);
  const setSpeed = useGame((s) => s.setSpeed);
  const persistNow = useGame((s) => s.persistNow);
  const toMenu = useGame((s) => s.toMenu);
  const savedFlash = useGame((s) => s.savedFlash);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      const digit = /^Digit([1-9])$/.exec(e.code);
      if (digit) {
        const t = SHORTCUTS[Number(digit[1]) - 1];
        if (t) setTool(t);
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        togglePause();
      }
      if (e.code === "Escape") {
        setTool("select");
        useGame.getState().setPanel("none");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setTool, togglePause]);

  const activeGroup = TOOL_GROUPS.find((g) => g.id === group) ?? TOOL_GROUPS[0]!;
  const entry: ToolEntry =
    tool === "select"
      ? SELECT_TOOL
      : TOOL_GROUPS.flatMap((g) => g.tools).find((t) => t.tool === tool) ?? SELECT_TOOL;

  if (!snapshot) return null;
  const paused = snapshot.paused;
  const speed = snapshot.speed;
  const balance = snapshot.income - snapshot.expense;
  const powerRatio = snapshot.powerNeed ? snapshot.powerSupply / snapshot.powerNeed : 1;
  const waterRatio = snapshot.waterNeed ? snapshot.waterSupply / snapshot.waterNeed : 1;
  const garbageRatio = snapshot.garbageNeed ? snapshot.garbageCapacity / snapshot.garbageNeed : 1;

  return (
    <>
      {/* --- barra superior --- */}
      <header className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-2 p-3 sm:p-4">
        <div className="pointer-events-auto hud-panel flex flex-wrap items-center gap-2 rounded-2xl px-3 py-2">
          <div className="pr-1">
            <p className="font-display text-base leading-none text-fg">{snapshot.name}</p>
            <p className="mt-0.5 text-[11px] text-muted tabular-nums">
              {snapshot.tierName} · Día {snapshot.day} · {formatHour(snapshot.hour)}
            </p>
          </div>
          <Chip icon={<Users className="size-3.5 text-zone-r" />} value={num(snapshot.pop)} label="hab." />
          <Chip icon={<Store className="size-3.5 text-zone-c" />} value={num(snapshot.jobs)} label="empleos" />
          <Chip
            icon={<Smile className={`size-3.5 ${snapshot.happiness < 40 ? "text-danger" : "text-ok"}`} />}
            value={String(snapshot.happiness)}
          />
          <button
            type="button"
            onClick={() => setPanel(panel === "budget" ? "none" : "budget")}
            className={`hud-chip text-xs ${snapshot.money < 0 ? "text-danger" : "text-fg"}`}
          >
            <Coins className="size-3.5" />
            {money(snapshot.money)}
            <span className={`text-[10px] ${balance >= 0 ? "text-ok" : "text-danger"}`}>
              {balance >= 0 ? "+" : "−"}
              {money(Math.abs(balance))}
            </span>
          </button>
        </div>

        <div className="pointer-events-auto hud-panel flex items-center gap-1 rounded-2xl p-1">
          <IconBtn label={paused ? "Reanudar" : "Pausa"} onClick={togglePause}>
            {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
          </IconBtn>
          <IconBtn label="Velocidad normal" active={!paused && speed === 1} onClick={() => setSpeed(1)}>
            <span className="text-[11px] font-medium">1×</span>
          </IconBtn>
          <IconBtn label="Rápido" active={!paused && speed === 2} onClick={() => setSpeed(2)}>
            <span className="text-[11px] font-medium">2×</span>
          </IconBtn>
          <IconBtn label="Muy rápido" active={!paused && speed === 3} onClick={() => setSpeed(3)}>
            <FastForward className="size-4" />
          </IconBtn>
          <span className="mx-1 h-5 w-px bg-line" />
          <IconBtn label="Estadísticas" active={panel === "stats"} onClick={() => setPanel(panel === "stats" ? "none" : "stats")}>
            <BarChart3 className="size-4" />
          </IconBtn>
          <IconBtn
            label="Servicios"
            active={panel === "services"}
            onClick={() => setPanel(panel === "services" ? "none" : "services")}
          >
            <ShieldCheck className="size-4" />
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

      {/* --- columna izquierda --- */}
      <div className="pointer-events-none absolute top-24 left-3 flex w-[min(100%-1.5rem,15.5rem)] flex-col gap-2 sm:left-4">
        <div className="pointer-events-auto hud-panel rounded-2xl p-3">
          <p className="text-[11px] font-medium tracking-wide text-muted uppercase">Demanda</p>
          <Meter label="Vivienda" value={snapshot.demandR} color="#3fa06a" />
          <Meter label="Comercio" value={snapshot.demandC} color="#3d7ec4" />
          <Meter label="Industria" value={snapshot.demandI} color="#d09a3a" />
          <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
            <Mini label="Paro" value={pct(snapshot.unemployment)} bad={snapshot.unemployment > 0.15} />
            <Mini label="Atascos" value={pct(snapshot.congestion)} bad={snapshot.congestion > 0.5} />
            <Mini label="Valor suelo" value={pct(snapshot.landValue)} bad={snapshot.landValue < 0.2} />
            <Mini label="Humo" value={pct(snapshot.pollution)} bad={snapshot.pollution > 0.3} />
          </div>
        </div>

        <div className="pointer-events-auto hud-panel rounded-2xl p-3">
          <button
            type="button"
            className="flex w-full items-baseline justify-between text-[11px] font-medium tracking-wide text-muted uppercase"
            onClick={() => setPanel(panel === "services" ? "none" : "services")}
          >
            Suministros
            <span className="text-[10px] normal-case tracking-normal text-faint">detalle</span>
          </button>
          <Meter label="Luz" value={powerRatio} color="#e0c44a" hint={pct(Math.min(1, powerRatio))} />
          <Meter label="Agua" value={waterRatio} color="#4aa7d4" hint={pct(Math.min(1, waterRatio))} />
          <Meter label="Basura" value={garbageRatio} color="#c9c14a" hint={pct(Math.min(1, garbageRatio))} />
        </div>

        <div className="pointer-events-auto hud-panel scroll-x flex gap-1 overflow-x-auto rounded-2xl p-1.5">
          {OVERLAYS.map(({ id, name, icon: Icon }) => (
            <button
              key={id}
              type="button"
              title={name}
              aria-label={name}
              aria-pressed={overlay === id}
              onClick={() => setOverlay(id as OverlayKind)}
              className={`pill-btn shrink-0 ${overlay === id ? "active" : ""}`}
            >
              <Icon className="size-3.5" />
            </button>
          ))}
        </div>
      </div>

      {/* --- columna derecha --- */}
      <div className="pointer-events-none absolute top-24 right-3 flex w-[min(100%-1.5rem,17rem)] flex-col items-end gap-2 sm:right-4">
        {panel === "none" ? (
          <>
            <Inspector />
            {snapshot.notices.map((n) => (
              <div
                key={n.id}
                className={`pointer-events-auto hud-panel w-full rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                  n.kind === "warn" ? "text-danger" : n.kind === "good" ? "text-ok" : "text-fg"
                }`}
              >
                {n.text}
              </div>
            ))}
          </>
        ) : null}
        {savedFlash > 0 && Date.now() - savedFlash < 1800 ? (
          <div className="hud-panel rounded-full px-3 py-1 text-[11px] text-muted">Guardado</div>
        ) : null}
      </div>

      {panel === "budget" ? <BudgetPanel snap={snapshot} onClose={() => setPanel("none")} /> : null}
      {panel === "stats" ? <StatsPanel snap={snapshot} onClose={() => setPanel("none")} /> : null}
      {panel === "services" ? <ServicesPanel snap={snapshot} onClose={() => setPanel("none")} /> : null}

      {/* --- dock inferior --- */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 p-3 sm:p-4">
        <p className="pointer-events-none max-w-lg text-center text-[11px] leading-snug text-fg/90 drop-shadow-sm">
          <span className="font-medium">{entry.name}</span>
          {entry.cost !== null ? ` · ${entry.cost === 0 ? "Gratis" : money(entry.cost)}` : ""} — {entry.hint}
        </p>
        <div className="pointer-events-auto hud-panel flex max-w-full flex-col gap-1 rounded-[22px] p-1.5">
          <div className="scroll-x flex gap-1 overflow-x-auto px-1">
            <button
              type="button"
              className={`tab-btn ${tool === "select" ? "active" : ""}`}
              onClick={() => setTool("select")}
            >
              Inspeccionar
            </button>
            {TOOL_GROUPS.map((g) => (
              <button
                key={g.id}
                type="button"
                className={`tab-btn ${group === g.id && tool !== "select" ? "active" : ""}`}
                onClick={() => {
                  setGroup(g.id);
                  const first = g.tools.find((t) => isUnlocked(t, snapshot));
                  if (first) setTool(first.tool);
                }}
              >
                {g.name}
              </button>
            ))}
          </div>
          <nav className="scroll-x flex max-w-full gap-0.5 overflow-x-auto">
            {activeGroup.tools.map(({ tool: id, name, icon: Icon, tier }) => {
              const locked = tier > snapshot.tier;
              return (
                <button
                  key={id}
                  type="button"
                  disabled={locked}
                  className={`tool-btn ${tool === id ? "active" : ""}`}
                  onClick={() => setTool(id as Tool)}
                  aria-label={locked ? `${name} (se desbloquea en ${tierName(tier)})` : name}
                  aria-pressed={tool === id}
                  title={locked ? `Se desbloquea en ${tierName(tier)}` : name}
                >
                  <Icon className="size-4" />
                  <span className="label hidden sm:block">{name}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {help ? <HelpModal onClose={() => setHelp(false)} /> : null}
    </>
  );
}

function isUnlocked(t: ToolEntry, snap: Snapshot) {
  return t.tier <= snap.tier;
}

function Chip({ icon, value, label }: { icon: ReactNode; value: string; label?: string }) {
  return (
    <span className="hud-chip text-xs text-fg">
      {icon}
      {value}
      {label ? <span className="text-[10px] text-faint">{label}</span> : null}
    </span>
  );
}

function Mini({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-faint">{label}</span>
      <span className={`tabular-nums ${bad ? "text-danger" : "text-fg"}`}>{value}</span>
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
      title={label}
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
    <div className="absolute inset-0 z-30 flex items-end justify-center bg-bg/60 p-4 sm:items-center" onClick={onClose}>
      <div
        className="hud-sheet max-h-[82dvh] w-full max-w-md overflow-auto rounded-3xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display text-2xl text-fg">Cómo jugar</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-4 text-sm leading-relaxed text-muted">
          <li>Prolonga la autovía con calles. Sin conexión a la autovía la ciudad no existe.</li>
          <li>
            Zonifica junto a la red: una parcela crece si tiene calle a <strong>4 casillas o menos</strong>, luz y agua.
          </li>
          <li>Coloca una central y un depósito, y engánchalos a la red.</li>
          <li>
            El <strong>valor del suelo</strong> manda: parques, colegios, sanidad y seguridad lo suben; humo, ruido y
            atascos lo hunden. Sube el valor y los edificios suben de nivel solos.
          </li>
          <li>
            Los colegios elevan el nivel formativo, y sin él las oficinas no encuentran trabajadores cualificados.
          </li>
          <li>Vigila la basura, el paro y los atascos. Y no dejes barrios sin bomberos.</li>
        </ol>
        <p className="mt-4 text-xs leading-relaxed text-faint">
          WASD mover · Q/E girar · T/G inclinar · rueda o R/F zoom · botón derecho orbitar · 1–9 herramientas ·
          Espacio pausa · Esc inspeccionar.
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
