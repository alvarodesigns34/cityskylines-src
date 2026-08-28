import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { roadSurface } from "../../sim/systems/network";
import { N, ROAD, TERRAIN, type OverlayKind } from "../../sim/types";
import { sim, useGame } from "../../store";
import { buildingGeometry } from "../geom/buildings";
import { useSimVersion } from "../useSimVersion";

const dummy = new THREE.Object3D();
const _c = new THREE.Color();
const CELLS = N * N;

const ZONE_COLOR = ["#000000", "#3fa06a", "#3d7ec4", "#d09a3a"];

/** Parcelas zonificadas sin edificar: rayado de color por uso y densidad. */
export function ZonePlates() {
  const rev = useSimVersion((s) => s.zonesVersion + s.buildingsVersion);
  const tool = useGame((s) => s.tool);
  const overlay = useGame((s) => s.overlay);
  const ref = useRef<THREE.InstancedMesh>(null);
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  // Las parcelas se ven a plena intensidad mientras se zonifica y se apagan el resto del
  // tiempo: la información aparece cuando sirve y el resto del rato el viewport queda limpio.
  const zoning = tool.startsWith("zone-") || tool === "bulldoze";
  useFrame(() => {
    const m = matRef.current;
    if (!m) return;
    const target = overlay !== "none" ? 0.1 : zoning ? 0.5 : 0.17;
    m.opacity += (target - m.opacity) * 0.14;
  });

  useEffect(() => {
    const mesh = ref.current;
    if (!mesh || !sim) return;
    const g = sim.grid;
    let n = 0;
    for (let i = 0; i < CELLS; i++) {
      const z = g.zone[i]!;
      if (!z || g.building[i]! >= 0 || g.road[i] !== ROAD.none) continue;
      const x = i % N;
      const zz = (i / N) | 0;
      dummy.position.set(x + 0.5, g.height[i]! + 0.05, zz + 0.5);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(n, dummy.matrix);
      _c.set(ZONE_COLOR[z]!);
      // La alta densidad se ve más saturada.
      if (g.density[i]) _c.multiplyScalar(1.25);
      else _c.multiplyScalar(0.8);
      mesh.setColorAt(n, _c);
      n++;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [rev]);

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, CELLS]} frustumCulled={false} renderOrder={2}>
      <boxGeometry args={[0.84, 0.02, 0.84]} />
      <meshBasicMaterial ref={matRef} transparent opacity={0.17} toneMapped={false} depthWrite={false} />
    </instancedMesh>
  );
}

interface Ramp {
  stops: Array<[number, string]>;
  label: string;
}

const RAMPS: Partial<Record<OverlayKind, Ramp>> = {
  pollution: { label: "Contaminación", stops: [[0, "#2f8f5b"], [0.35, "#d8c14a"], [0.7, "#d8722f"], [1, "#a33232"]] },
  noise: { label: "Ruido", stops: [[0, "#2f8f5b"], [0.4, "#d8c14a"], [1, "#8f3fa3"]] },
  landvalue: { label: "Valor del suelo", stops: [[0, "#7d5a3a"], [0.35, "#c9b76a"], [0.7, "#5fae7a"], [1, "#2f8f9e"]] },
  traffic: { label: "Tráfico", stops: [[0, "#3f9a5f"], [0.45, "#d8c14a"], [0.8, "#d8722f"], [1, "#a33232"]] },
  education: { label: "Educación", stops: [[0, "#6b4f7a"], [1, "#8fd0e8"]] },
  health: { label: "Sanidad", stops: [[0, "#6b4f7a"], [1, "#4fd0a8"]] },
  safety: { label: "Seguridad", stops: [[0, "#6b4f7a"], [1, "#5f9ae8"]] },
  garbage: { label: "Recogida", stops: [[0, "#6b4f7a"], [1, "#c9c14a"]] },
};

function rampColor(ramp: Ramp, t: number, out: THREE.Color) {
  const v = Math.max(0, Math.min(1, t));
  const s = ramp.stops;
  for (let i = 0; i < s.length - 1; i++) {
    const [a, ca] = s[i]!;
    const [b, cb] = s[i + 1]!;
    if (v <= b || i === s.length - 2) {
      const f = (v - a) / Math.max(1e-4, b - a);
      out.set(ca);
      const other = new THREE.Color(cb);
      return out.lerp(other, Math.max(0, Math.min(1, f)));
    }
  }
  return out.set(s[0]![1]);
}

function fieldValue(overlay: OverlayKind, i: number): number | null {
  if (!sim) return null;
  const g = sim.grid;
  switch (overlay) {
    case "power":
      return g.powered[i] ? 1 : 0;
    case "water":
      return g.watered[i] ? 1 : 0;
    case "pollution":
      return g.pollution[i]!;
    case "noise":
      return g.noise[i]!;
    case "landvalue":
      return g.landValue[i]!;
    case "traffic":
      return g.road[i] !== ROAD.none ? Math.min(1, g.traffic[i]!) : null;
    case "education":
      return g.service.education![i]!;
    case "health":
      return g.service.health![i]!;
    case "safety":
      return g.service.police![i]!;
    case "garbage":
      return g.service.garbage![i]!;
    default:
      return null;
  }
}

/** Mapa de datos sobre el terreno: luz, agua, humo, ruido, valor, tráfico, servicios. */
export function DataOverlay() {
  const overlay = useGame((s) => s.overlay);
  const rev = useSimVersion((s) => s.fieldsVersion + s.roadsVersion);
  const ref = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    const mesh = ref.current;
    if (!mesh || !sim || overlay === "none") return;
    const g = sim.grid;
    const ramp = RAMPS[overlay];
    let n = 0;
    for (let i = 0; i < CELLS; i++) {
      if (g.terrain[i] === TERRAIN.water) continue;
      const v = fieldValue(overlay, i);
      if (v === null) continue;
      if (overlay === "power" || overlay === "water") {
        const relevant = g.roadDist[i]! <= 4;
        if (!relevant) continue;
        _c.set(v > 0 ? (overlay === "power" ? "#e0c44a" : "#4aa7d4") : "#c0453a");
      } else if (ramp) {
        if (v < 0.015 && overlay !== "landvalue") continue;
        rampColor(ramp, v, _c);
      } else continue;

      const x = i % N;
      const z = (i / N) | 0;
      const y = g.road[i] !== ROAD.none ? roadSurface(g, i) + 0.07 : g.height[i]! + 0.07;
      dummy.position.set(x + 0.5, y, z + 0.5);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(n, dummy.matrix);
      mesh.setColorAt(n, _c);
      n++;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [overlay, rev]);

  if (overlay === "none") return null;
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, CELLS]} frustumCulled={false} renderOrder={4}>
      <boxGeometry args={[0.96, 0.02, 0.96]} />
      <meshBasicMaterial transparent opacity={0.55} toneMapped={false} depthWrite={false} />
    </instancedMesh>
  );
}

/** Previsualización de la herramienta bajo el cursor. */
export function Ghost() {
  const tool = useGame((s) => s.tool);
  const plate = useRef<THREE.Mesh>(null);
  const model = useRef<THREE.Mesh>(null);
  const plateMat = useRef<THREE.MeshBasicMaterial>(null);
  const modelMat = useRef<THREE.MeshBasicMaterial>(null);

  const kind = tool.startsWith("build:") ? tool.slice(6) : null;
  const geo = useMemo(() => (kind ? buildingGeometry(kind, 0) : null), [kind]);

  useFrame(() => {
    const p = plate.current;
    const m = model.current;
    if (!p || !sim || !sim.hover || tool === "select") {
      if (p) p.visible = false;
      if (m) m.visible = false;
      return;
    }
    const { x, z } = sim.hover;
    const check = sim.canPlace(tool, x, z);
    const g = sim.grid;
    let top = -99;
    for (let zz = 0; zz < check.d; zz++) {
      for (let xx = 0; xx < check.w; xx++) {
        const i = g.at(x + xx, z + zz);
        if (i >= 0) top = Math.max(top, g.height[i]!);
      }
    }
    if (top < -90) top = 0;
    p.visible = true;
    p.position.set(x + check.w / 2, top + 0.12, z + check.d / 2);
    p.scale.set(check.w, 1, check.d);
    if (plateMat.current) plateMat.current.color.set(check.ok ? "#4fd39a" : "#e0574a");
    if (m && geo) {
      m.visible = check.ok;
      m.position.set(x + check.w / 2, top + 0.02, z + check.d / 2);
      if (modelMat.current) modelMat.current.color.set("#7fe8c0");
    }
  });

  if (tool === "select") return null;
  return (
    <group>
      <mesh ref={plate} visible={false} renderOrder={5}>
        <boxGeometry args={[0.96, 0.04, 0.96]} />
        <meshBasicMaterial ref={plateMat} transparent opacity={0.5} toneMapped={false} depthWrite={false} />
      </mesh>
      {geo ? (
        <mesh ref={model} geometry={geo} visible={false} renderOrder={5}>
          <meshBasicMaterial ref={modelMat} transparent opacity={0.28} toneMapped={false} depthWrite={false} />
        </mesh>
      ) : null}
    </group>
  );
}

/** Marco alrededor de la parcela o el edificio seleccionado. */
export function Selection() {
  const selected = useGame((s) => s.selected);
  const ref = useRef<THREE.LineSegments>(null);

  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const p: number[] = [];
    const c = [
      [-0.5, -0.5],
      [0.5, -0.5],
      [0.5, 0.5],
      [-0.5, 0.5],
    ];
    for (let i = 0; i < 4; i++) {
      const a = c[i]!;
      const b = c[(i + 1) % 4]!;
      p.push(a[0]!, 0, a[1]!, b[0]!, 0, b[1]!);
      p.push(a[0]!, 0, a[1]!, a[0]!, 0.5, a[1]!);
    }
    g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
    return g;
  }, []);
  useEffect(() => () => geo.dispose(), [geo]);

  useFrame(({ clock }) => {
    const l = ref.current;
    if (!l || !sim || !selected) {
      if (l) l.visible = false;
      return;
    }
    const g = sim.grid;
    const b = sim.buildingAt(selected.x, selected.z);
    const x = b ? b.x : selected.x;
    const z = b ? b.z : selected.z;
    const w = b ? b.w : 1;
    const d = b ? b.d : 1;
    let top = -99;
    for (let zz = 0; zz < d; zz++) {
      for (let xx = 0; xx < w; xx++) {
        const i = g.at(x + xx, z + zz);
        if (i >= 0) top = Math.max(top, g.height[i]!);
      }
    }
    l.visible = true;
    l.position.set(x + w / 2, Math.max(0.05, top) + 0.08, z + d / 2);
    l.scale.set(w + 0.06, 1 + Math.sin(clock.elapsedTime * 3) * 0.12, d + 0.06);
  });

  if (!selected) return null;
  return (
    <lineSegments ref={ref} geometry={geo} renderOrder={6}>
      <lineBasicMaterial color="#ffd15c" transparent opacity={0.9} toneMapped={false} depthTest={false} />
    </lineSegments>
  );
}
