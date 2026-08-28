import { ROADS } from "@/game/sim/catalog";
import { ROAD, TERRAIN_NAME } from "@/game/sim/types";
import { sim, useGame } from "@/game/store";
import { AlertTriangle, Droplets, Zap } from "lucide-react";
import { useMemo } from "react";
import { money, num, pct } from "./format";

const SERVICE_LABEL: Record<string, string> = {
  education: "Educación",
  health: "Sanidad",
  police: "Seguridad",
  fire: "Bomberos",
  garbage: "Recogida",
  leisure: "Ocio",
};

/** Ficha de la parcela seleccionada: por qué crece o por qué no. */
export function Inspector() {
  const selected = useGame((s) => s.selected);
  const snapshot = useGame((s) => s.snapshot);
  // `snapshot` es la señal de refresco: la ficha se recalcula con cada latido del simulador.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const info = useMemo(() => (selected && sim ? sim.inspect(selected.x, selected.z) : null), [selected, snapshot]);
  if (!info) return null;

  const b = info.building;
  const title = b
    ? b.name
    : info.road !== ROAD.none
      ? ROADS[info.road]!.name
      : info.zone !== "none"
        ? `Zona ${info.zone === "R" ? "residencial" : info.zone === "C" ? "comercial" : "industrial"}`
        : TERRAIN_NAME[info.terrain as 0 | 1 | 2 | 3];

  const problems: string[] = [];
  if (info.zone !== "none" || b) {
    if (!info.connected) problems.push("sin acceso a la red viaria");
    else {
      if (!info.powered) problems.push("sin electricidad");
      if (!info.watered) problems.push("sin agua");
    }
    if (info.pollution > 0.35) problems.push("aire muy contaminado");
    if (info.noise > 0.5) problems.push("demasiado ruido");
  }

  return (
    <div className="pointer-events-auto hud-panel rounded-2xl p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-display text-base leading-tight text-fg">{title}</p>
        <span className="text-[10px] text-faint tabular-nums">
          {info.x},{info.z}
        </span>
      </div>

      {b ? (
        <>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">{b.desc}</p>
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
            <Stat label="Nivel" value={`${b.level} · ${b.size}`} />
            <Stat label="Ocupación" value={pct(b.occupancy)} />
            {b.residents > 0 ? <Stat label="Vecinos" value={num(b.residents)} /> : null}
            {b.jobs > 0 ? <Stat label="Empleos" value={num(b.jobs)} /> : null}
            {b.trips > 0 ? <Stat label="Viajes/día" value={num(b.trips)} /> : null}
            {b.upkeep > 0 ? <Stat label="Mantenimiento" value={`${money(b.upkeep)}/día`} /> : null}
          </div>
        </>
      ) : (
        <p className="mt-1 text-[11px] text-muted">
          {info.zone !== "none"
            ? `Densidad ${info.density === "high" ? "alta" : "baja"} · calle a ${info.roadDist > 20 ? "—" : info.roadDist} casillas`
            : `Altura ${info.height.toFixed(1)} · pendiente ${pct(info.slope)}`}
        </p>
      )}

      <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
        <Tag ok={info.powered} icon={<Zap className="size-3" />} label={info.powered ? "Luz" : "Sin luz"} />
        <Tag ok={info.watered} icon={<Droplets className="size-3" />} label={info.watered ? "Agua" : "Sin agua"} />
        <Tag ok={info.connected} label={info.connected ? "En red" : "Aislado"} />
      </div>

      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
        <Stat label="Valor del suelo" value={pct(info.landValue)} />
        <Stat label="Contaminación" value={pct(info.pollution)} />
        <Stat label="Ruido" value={pct(info.noise)} />
        {info.road !== ROAD.none ? <Stat label="Ocupación vía" value={pct(Math.min(1, info.traffic))} /> : null}
      </div>

      {Object.entries(info.services).some(([, v]) => v > 0.05) ? (
        <p className="mt-2 text-[10px] leading-relaxed text-faint">
          Cubierto por:{" "}
          {Object.entries(info.services)
            .filter(([, v]) => v > 0.05)
            .map(([k, v]) => `${SERVICE_LABEL[k]} ${pct(v)}`)
            .join(" · ")}
        </p>
      ) : null}

      {problems.length ? (
        <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-danger">
          <AlertTriangle className="mt-px size-3 shrink-0" />
          <span>No prospera: {problems.join(", ")}.</span>
        </p>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-faint">{label}</span>
      <span className="tabular-nums text-fg">{value}</span>
    </div>
  );
}

function Tag({ ok, label, icon }: { ok: boolean; label: string; icon?: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 ${
        ok ? "border-ok/40 text-ok" : "border-danger/40 text-danger"
      }`}
    >
      {icon}
      {label}
    </span>
  );
}
