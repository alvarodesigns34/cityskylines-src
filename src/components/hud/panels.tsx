import { TAX_MAX, TAX_MIN, debtCeiling } from "@/game/sim/systems/economy";
import { SERVICES, type Snapshot } from "@/game/sim/types";
import { sim, useGame } from "@/game/store";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { money, num, pct } from "./format";

export function Sheet({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <aside className="pointer-events-auto hud-sheet absolute top-20 right-3 bottom-24 z-20 flex w-[min(100vw-1.5rem,23rem)] flex-col rounded-3xl sm:right-4">
      <header className="flex items-start justify-between gap-3 border-b border-line/60 px-4 py-3">
        <div>
          <h2 className="font-display text-lg leading-tight text-fg">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-[11px] text-muted">{subtitle}</p> : null}
        </div>
        <button type="button" aria-label="Cerrar" onClick={onClose} className="rounded-lg p-1 text-muted hover:text-fg">
          <X className="size-4" />
        </button>
      </header>
      <div className="scroll-x flex-1 overflow-y-auto px-4 py-3">{children}</div>
    </aside>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-xs">
      <span className="text-muted">{label}</span>
      <span className={`font-medium tabular-nums ${tone ?? "text-fg"}`}>{value}</span>
    </div>
  );
}

export function Meter({ label, value, color, hint }: { label: string; value: number; color: string; hint?: string }) {
  return (
    <div className="mt-2">
      <div className="mb-1 flex items-baseline justify-between text-[11px]">
        <span className="text-muted">{label}</span>
        <span className="tabular-nums text-fg">{hint ?? pct(value)}</span>
      </div>
      <div className="meter">
        <span style={{ width: `${Math.max(2, Math.min(100, value * 100))}%`, background: color }} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ presupuesto */

function TaxSlider({ label, zone, value }: { label: string; zone: "R" | "C" | "I"; value: number }) {
  const changeTax = useGame((s) => s.changeTax);
  return (
    <div className="mt-3">
      <div className="mb-1 flex items-baseline justify-between text-[11px]">
        <span className="text-muted">{label}</span>
        <span className="tabular-nums text-fg">{pct(value, 1)}</span>
      </div>
      <input
        type="range"
        min={TAX_MIN * 1000}
        max={TAX_MAX * 1000}
        step={5}
        value={Math.round(value * 1000)}
        onChange={(e) => changeTax(zone, Number(e.target.value) / 1000)}
        className="w-full accent-accent"
        aria-label={`Impuesto ${label}`}
      />
    </div>
  );
}

export function BudgetPanel({ snap, onClose }: { snap: Snapshot; onClose: () => void }) {
  const borrow = useGame((s) => s.borrow);
  const repay = useGame((s) => s.repay);
  const balance = snap.income - snap.expense;
  const ceiling = sim ? debtCeiling(sim) : 0;

  return (
    <Sheet title="Presupuesto" subtitle={`Día ${snap.day} · ${snap.tierName}`} onClose={onClose}>
      <div className="rounded-2xl bg-raised/50 p-3">
        <Row label="Caja" value={money(snap.money)} tone={snap.money < 0 ? "text-danger" : "text-fg"} />
        <Row label="Balance diario" value={`${balance >= 0 ? "+" : "−"}${money(Math.abs(balance))}`} tone={balance >= 0 ? "text-ok" : "text-danger"} />
        <Row label="Deuda" value={money(snap.debt)} tone={snap.debt > ceiling * 0.8 ? "text-danger" : "text-muted"} />
      </div>

      <h3 className="mt-4 text-[11px] font-medium tracking-wide text-muted uppercase">Tipos impositivos</h3>
      <p className="mt-1 text-[11px] leading-relaxed text-faint">
        Más impuestos recaudan hoy y espantan vecinos mañana: bajan la demanda y el ánimo.
      </p>
      <TaxSlider label="Vivienda" zone="R" value={snap.taxR} />
      <TaxSlider label="Comercio" zone="C" value={snap.taxC} />
      <TaxSlider label="Industria" zone="I" value={snap.taxI} />

      <h3 className="mt-5 text-[11px] font-medium tracking-wide text-muted uppercase">Ingresos</h3>
      <div className="mt-1">
        {snap.incomeLines.map((l) => (
          <Row key={l.label} label={l.label} value={money(l.amount)} tone="text-ok" />
        ))}
        <Row label="Total" value={money(snap.income)} />
      </div>

      <h3 className="mt-4 text-[11px] font-medium tracking-wide text-muted uppercase">Gastos</h3>
      <div className="mt-1">
        {snap.expenseLines.map((l) => (
          <Row key={l.label} label={l.label} value={money(l.amount)} tone="text-danger" />
        ))}
        <Row label="Total" value={money(snap.expense)} />
      </div>

      <h3 className="mt-5 text-[11px] font-medium tracking-wide text-muted uppercase">Crédito</h3>
      <p className="mt-1 text-[11px] leading-relaxed text-faint">
        Límite {money(ceiling)} · interés 9,5% anual, se amortiza solo cada día.
      </p>
      <div className="mt-2 flex gap-2">
        <button type="button" className="pill-btn flex-1 justify-center" onClick={() => borrow(20000)}>
          Pedir {money(20000)}
        </button>
        <button
          type="button"
          className="pill-btn flex-1 justify-center"
          onClick={() => repay(20000)}
          disabled={snap.debt <= 0}
        >
          Amortizar
        </button>
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ estadísticas */

const CHART_GRID = "#2a3644";

export function StatsPanel({ snap, onClose }: { snap: Snapshot; onClose: () => void }) {
  const data = snap.history.slice(-90);
  return (
    <Sheet title="Estadísticas" subtitle={`${num(snap.pop)} habitantes · ${snap.tierName}`} onClose={onClose}>
      <div className="rounded-2xl bg-raised/50 p-3">
        <Row label="Habitantes" value={num(snap.pop)} />
        <Row label="Hogares" value={num(snap.households)} />
        <Row label="Población activa" value={num(snap.workers)} />
        <Row label="Empleos" value={num(snap.jobs)} />
        <Row label="Paro" value={pct(snap.unemployment, 1)} tone={snap.unemployment > 0.15 ? "text-danger" : "text-ok"} />
      </div>

      <h3 className="mt-4 text-[11px] font-medium tracking-wide text-muted uppercase">Población</h3>
      <div className="mt-1 h-28">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="popFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3fa06a" stopOpacity={0.7} />
                <stop offset="100%" stopColor="#3fa06a" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={CHART_GRID} strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="day" hide />
            <YAxis width={34} tick={{ fill: "#8a9aab", fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: "#141c26", border: "1px solid #2a3644", borderRadius: 12, fontSize: 11 }}
              labelFormatter={(d) => `Día ${d}`}
            />
            <Area type="monotone" dataKey="pop" stroke="#3fa06a" fill="url(#popFill)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <h3 className="mt-4 text-[11px] font-medium tracking-wide text-muted uppercase">Balance diario</h3>
      <div className="mt-1 h-24">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={CHART_GRID} strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="day" hide />
            <YAxis width={40} tick={{ fill: "#8a9aab", fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: "#141c26", border: "1px solid #2a3644", borderRadius: 12, fontSize: 11 }}
              labelFormatter={(d) => `Día ${d}`}
            />
            <Line type="monotone" dataKey="balance" stroke="#c5d0d8" dot={false} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <h3 className="mt-4 text-[11px] font-medium tracking-wide text-muted uppercase">Ánimo y valor del suelo</h3>
      <div className="mt-1 h-24">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={CHART_GRID} strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="day" hide />
            <YAxis width={30} tick={{ fill: "#8a9aab", fontSize: 10 }} axisLine={false} tickLine={false} domain={[0, 100]} />
            <Tooltip
              contentStyle={{ background: "#141c26", border: "1px solid #2a3644", borderRadius: 12, fontSize: 11 }}
              labelFormatter={(d) => `Día ${d}`}
            />
            <Line type="monotone" dataKey="happiness" stroke="#5aae7a" dot={false} strokeWidth={2} />
            <Line
              type="monotone"
              dataKey={(d: { landValue: number }) => Math.round(d.landValue * 100)}
              name="valor"
              stroke="#3d7ec4"
              dot={false}
              strokeWidth={2}
            />
            <Line
              type="monotone"
              dataKey={(d: { pollution: number }) => Math.round(d.pollution * 100)}
              name="humo"
              stroke="#c48a3a"
              dot={false}
              strokeWidth={2}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-faint">
        Verde ánimo · azul valor del suelo · ámbar contaminación.
      </p>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ servicios */

const SERVICE_LABEL: Record<string, string> = {
  education: "Educación",
  health: "Sanidad",
  police: "Seguridad",
  fire: "Bomberos",
  garbage: "Recogida",
  leisure: "Ocio",
};

const SERVICE_COLOR: Record<string, string> = {
  education: "#8fd0e8",
  health: "#4fd0a8",
  police: "#5f9ae8",
  fire: "#e0785c",
  garbage: "#c9c14a",
  leisure: "#7fd07f",
};

export function ServicesPanel({ snap, onClose }: { snap: Snapshot; onClose: () => void }) {
  const levels = sim?.serviceLevel ?? {};
  const missing = SERVICES.filter((s) => (levels[s] ?? 0) < 0.2);
  return (
    <Sheet title="Servicios" subtitle="Cobertura media sobre la población" onClose={onClose}>
      <div className="rounded-2xl bg-raised/50 p-3">
        <Meter
          label="Electricidad"
          value={snap.powerNeed ? snap.powerSupply / Math.max(1, snap.powerNeed) : 1}
          color="#e0c44a"
          hint={`${num(snap.powerSupply)} / ${num(snap.powerNeed)}`}
        />
        <Meter
          label="Agua"
          value={snap.waterNeed ? snap.waterSupply / Math.max(1, snap.waterNeed) : 1}
          color="#4aa7d4"
          hint={`${num(snap.waterSupply)} / ${num(snap.waterNeed)}`}
        />
        <Meter
          label="Tratamiento de basura"
          value={snap.garbageNeed ? snap.garbageCapacity / Math.max(1, snap.garbageNeed) : 1}
          color="#c9c14a"
          hint={`${num(snap.garbageCapacity)} / ${num(snap.garbageNeed)}`}
        />
        {snap.garbageBacklog > 0 ? (
          <p className="mt-2 text-[11px] text-danger">
            {num(snap.garbageBacklog)} t sin recoger acumuladas en las calles.
          </p>
        ) : null}
      </div>

      <h3 className="mt-4 text-[11px] font-medium tracking-wide text-muted uppercase">Cobertura</h3>
      <div className="rounded-2xl bg-raised/50 p-3">
        {SERVICES.map((s) => (
          <Meter key={s} label={SERVICE_LABEL[s]!} value={levels[s] ?? 0} color={SERVICE_COLOR[s]!} />
        ))}
      </div>

      <h3 className="mt-4 text-[11px] font-medium tracking-wide text-muted uppercase">Calidad de vida</h3>
      <div className="rounded-2xl bg-raised/50 p-3">
        <Meter label="Nivel formativo" value={snap.education} color="#8fd0e8" />
        <Meter label="Salud" value={snap.health} color="#4fd0a8" />
        <Meter label="Seguridad" value={snap.safety} color="#5f9ae8" />
        <Meter label="Valor del suelo" value={snap.landValue} color="#3d7ec4" />
        <Meter label="Contaminación" value={snap.pollution} color="#c48a3a" />
        <Meter label="Ruido" value={snap.noise} color="#a37ec4" />
        <Meter label="Congestión" value={snap.congestion} color="#d15b4c" />
      </div>

      {missing.length ? (
        <p className="mt-3 text-[11px] leading-relaxed text-faint">
          Sin cobertura suficiente: {missing.map((m) => SERVICE_LABEL[m]).join(", ")}. Cada servicio sube el
          valor del suelo alrededor, y el valor del suelo es lo que hace que los edificios suban de nivel.
        </p>
      ) : null}
    </Sheet>
  );
}
