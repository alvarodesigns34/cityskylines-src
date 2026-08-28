import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { input } from "../input";
import { sim, useGame } from "../store";
import type { BuildingKind } from "../sim/types";
import { N, idx, inBounds } from "../sim/types";
import { geometryFor } from "./geom";

const ZONE_COLOR = { R: "#3d9a6c", C: "#3d7ec4", I: "#c48a3a" } as const;
const dummy = new THREE.Object3D();
const _color = new THREE.Color();

type ControlsProbe = {
  getYaw: () => number;
  getSpeed: () => number;
  setKeys?: (codes: string[]) => void;
  setSteer?: (v: number) => void;
};

declare global {
  interface Window {
    __controlsTest?: ControlsProbe;
  }
}

export function CityCanvas({ interactive }: { interactive: boolean }) {
  const worldId = useGame((s) => s.worldId);
  return (
    <Canvas
      className="absolute inset-0"
      shadows={false}
      dpr={[1, 1.5]}
      camera={{ fov: 40, near: 0.15, far: 180, position: [28, 26, 44] }}
      gl={{ antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: true, alpha: false }}
      onPointerMissed={() => {
        if (interactive) useGame.getState().setSelected(null);
      }}
      onCreated={({ gl }) => {
        gl.setClearColor("#8ec4e3", 1);
        gl.domElement.addEventListener("contextmenu", (e) => e.preventDefault());
      }}
    >
      <color attach="background" args={["#8ec4e3"]} />
      <fog attach="fog" args={["#b7d6ea", 55, 110]} />
      <hemisphereLight args={["#e7f2ff", "#6e8f55", 0.85]} />
      <ambientLight intensity={0.28} />
      <Sun />
      <WorldMesh />
      <CameraRig interactive={interactive} />
      <SimTicker interactive={interactive} />
      {sim ? <CityLayers key={worldId} interactive={interactive} /> : null}
    </Canvas>
  );
}

function Sun() {
  const ref = useRef<THREE.DirectionalLight>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 0.015;
    const x = Math.cos(t) * 28;
    const z = Math.sin(t) * 18 + 8;
    if (ref.current) {
      ref.current.position.set(N / 2 + x, 26, N / 2 + z);
    }
  });
  return (
    <directionalLight
      ref={ref}
      position={[N / 2 + 18, 28, N / 2 + 10]}
      intensity={1.35}
      color="#fff3dd"
    />
  );
}

function WorldMesh() {
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[N / 2, -0.06, N / 2]} receiveShadow>
        <planeGeometry args={[140, 140]} />
        <meshLambertMaterial color="#6b9a5e" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[N / 2, -0.08, N / 2 + 40]}>
        <planeGeometry args={[160, 70]} />
        <meshLambertMaterial color="#3d7ea3" />
      </mesh>
    </>
  );
}

function SimTicker({ interactive }: { interactive: boolean }) {
  const acc = useRef(0);
  const saveAcc = useRef(0);
  const frames = useRef(0);
  const { gl } = useThree();
  const pull = useGame((s) => s.pullSnapshot);
  const persist = useGame((s) => s.persistNow);
  useFrame((_, dt) => {
    frames.current += 1;
    if (typeof window !== "undefined") {
      (window as Window & { __r3f?: { frames: number; calls: number } }).__r3f = {
        frames: frames.current,
        calls: gl.info.render.calls,
      };
    }
    if (!sim) return;
    sim.step(interactive ? dt : dt * 0.15);
    acc.current += dt;
    if (acc.current > 0.28) {
      acc.current = 0;
      if (interactive) pull();
    }
    if (interactive) {
      saveAcc.current += dt;
      if (saveAcc.current > 12) {
        saveAcc.current = 0;
        persist();
      }
    }
  });
  return null;
}

function CameraRig({ interactive }: { interactive: boolean }) {
  const { camera, gl } = useThree();
  const yaw = useRef(0.72);
  const pitch = useRef(0.92);
  const dist = useRef(34);
  const tx = useRef(N * 0.52);
  const tz = useRef(N * 0.5);
  const mode = useRef<"orbit" | "pan" | "paint" | null>(null);
  const last = useRef({ x: 0, y: 0 });
  const origin = useRef({ x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef(0);
  const panVel = useRef(0);
  const ground = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const ray = useMemo(() => new THREE.Raycaster(), []);
  const ndc = useMemo(() => new THREE.Vector2(), []);
  const hit = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    const el = gl.domElement;
    const cellAt = (cx: number, cy: number) => {
      const r = el.getBoundingClientRect();
      ndc.x = ((cx - r.left) / r.width) * 2 - 1;
      ndc.y = -((cy - r.top) / r.height) * 2 + 1;
      ray.setFromCamera(ndc, camera);
      const p = ray.ray.intersectPlane(ground, hit);
      if (!p) return null;
      const x = Math.floor(p.x);
      const z = Math.floor(p.z);
      if (!inBounds(x, z)) return null;
      return { x, z };
    };

    const onDown = (e: PointerEvent) => {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      last.current = { x: e.clientX, y: e.clientY };
      origin.current = { x: e.clientX, y: e.clientY };
      if (pointers.current.size === 2) {
        const [a, b] = [...pointers.current.values()];
        pinch.current = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        mode.current = "orbit";
        return;
      }
      if (!interactive) {
        mode.current = "orbit";
        return;
      }
      if (e.button === 2 || e.button === 1) {
        mode.current = "orbit";
        return;
      }
      const tool = useGame.getState().tool;
      if (e.shiftKey) {
        mode.current = "pan";
        return;
      }
      if (tool === "select") {
        mode.current = "pan";
        const cell = cellAt(e.clientX, e.clientY);
        if (cell) useGame.getState().setSelected(cell);
        return;
      }
      mode.current = "paint";
      const cell = cellAt(e.clientX, e.clientY);
      if (cell && sim) {
        sim.hover = cell;
        sim.applyTool(tool, cell.x, cell.z);
        useGame.getState().pullSnapshot();
      }
    };

    const onMove = (e: PointerEvent) => {
      if (pointers.current.has(e.pointerId)) {
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }
      const dx = e.clientX - last.current.x;
      const dy = e.clientY - last.current.y;
      last.current = { x: e.clientX, y: e.clientY };

      if (pointers.current.size === 2) {
        const [a, b] = [...pointers.current.values()];
        const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        if (pinch.current > 0) dist.current = THREE.MathUtils.clamp(dist.current * (pinch.current / d), 8, 64);
        pinch.current = d;
        yaw.current -= dx * 0.004;
        return;
      }

      if (mode.current === "orbit") {
        yaw.current -= dx * 0.005;
        pitch.current = THREE.MathUtils.clamp(pitch.current + dy * 0.0035, 0.38, 1.25);
        return;
      }
      if (mode.current === "pan") {
        const sp = dist.current * 0.0024;
        const fy = -Math.sin(yaw.current);
        const fz = -Math.cos(yaw.current);
        const rx = Math.cos(yaw.current);
        const rz = -Math.sin(yaw.current);
        tx.current -= rx * dx * sp + fy * -dy * sp;
        tz.current -= rz * dx * sp + fz * -dy * sp;
        return;
      }

      const cell = cellAt(e.clientX, e.clientY);
      if (sim) sim.hover = cell;
      if (mode.current === "paint" && cell && sim && interactive) {
        const tool = useGame.getState().tool;
        if (tool !== "select") {
          sim.applyTool(tool, cell.x, cell.z);
          useGame.getState().pullSnapshot();
        }
      }
    };

    const onUp = (e: PointerEvent) => {
      pointers.current.delete(e.pointerId);
      if (pointers.current.size === 0) mode.current = null;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      dist.current = THREE.MathUtils.clamp(dist.current + e.deltaY * 0.03, 8, 64);
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("wheel", onWheel);
    };
  }, [camera, gl, ground, hit, interactive, ndc, ray]);

  useFrame((_, dt) => {
    const d = Math.min(dt, 0.1);
    input.sample();
    if (!interactive) {
      yaw.current += d * 0.08;
    } else {
      const panSpeed = dist.current * 0.62;
      const fy = -Math.sin(yaw.current);
      const fz = -Math.cos(yaw.current);
      const rx = Math.cos(yaw.current);
      const rz = -Math.sin(yaw.current);
      tx.current += (rx * input.panX + fy * input.panZ) * panSpeed * d;
      tz.current += (rz * input.panX + fz * input.panZ) * panSpeed * d;
      yaw.current += input.rotate * 1.15 * d;
      dist.current = THREE.MathUtils.clamp(dist.current + input.zoom * 14 * d, 8, 64);
      panVel.current = Math.hypot(input.panX, input.panZ) * panSpeed;
    }
    tx.current = THREE.MathUtils.clamp(tx.current, -2, N + 2);
    tz.current = THREE.MathUtils.clamp(tz.current, -2, N + 2);
    const cr = Math.cos(pitch.current) * dist.current;
    camera.position.set(
      tx.current + Math.sin(yaw.current) * cr,
      Math.sin(pitch.current) * dist.current + 0.5,
      tz.current + Math.cos(yaw.current) * cr,
    );
    camera.lookAt(tx.current, 0.15, tz.current);

    if (typeof window !== "undefined") {
      window.__controlsTest = {
        getYaw: () => yaw.current,
        getSpeed: () => panVel.current,
        setKeys: (codes) => input.setKeys(codes),
        setSteer: (v) => {
          input.injected.clear();
          if (v > 0.2) input.injected.add("KeyQ");
          if (v < -0.2) input.injected.add("KeyE");
        },
        getTarget: () => ({ x: tx.current, z: tz.current }),
      } as ControlsProbe & { getTarget: () => { x: number; z: number } };
    }
  });
  return null;
}

function CityLayers({ interactive }: { interactive: boolean }) {
  const [rev, setRev] = useState(0);
  const last = useRef({ b: 0, r: 0, t: 0 });
  useFrame(() => {
    if (!sim) return;
    if (
      sim.buildingsVersion !== last.current.b ||
      sim.roadsVersion !== last.current.r ||
      sim.treesVersion !== last.current.t
    ) {
      last.current = {
        b: sim.buildingsVersion,
        r: sim.roadsVersion,
        t: sim.treesVersion,
      };
      setRev((n) => n + 1);
    }
  });
  if (!sim) return null;
  return (
    <group>
      <Terrain key={`t-${sim.seed}`} />
      <Water />
      <Roads rev={rev} />
      <Zones rev={rev} />
      <Trees rev={rev} />
      <Buildings rev={rev} />
      <Cars />
      {interactive ? <Ghost /> : null}
      {interactive ? <ServiceOverlay /> : null}
    </group>
  );
}

function Terrain() {
  const geo = useMemo(() => {
    if (!sim) return new THREE.PlaneGeometry(1, 1);
    const g = new THREE.PlaneGeometry(N, N, N, N);
    g.rotateX(-Math.PI / 2);
    g.translate(N / 2, 0, N / 2);
    const pos = g.attributes.position!;
    const col = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const cx = Math.min(N - 1, Math.max(0, Math.floor(x)));
      const cz = Math.min(N - 1, Math.max(0, Math.floor(z)));
      const t = sim.tiles[idx(cx, cz)]!;
      const water = t.terrain === "water";
      pos.setY(i, water ? 0.02 : t.height * 1.15);
      if (water) c.set("#2f6f8a");
      else if (t.terrain === "sand") c.set("#cbb896");
      else c.setRGB(0.3 + t.height * 0.12, 0.5 + t.height * 0.22, 0.24 + t.height * 0.05);
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
  }, []);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh geometry={geo} receiveShadow>
      <meshLambertMaterial vertexColors />
    </mesh>
  );
}

function Water() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const cells = useMemo(() => {
    if (!sim) return [];
    return sim.tiles.filter((t) => t.terrain === "water");
  }, []);
  useEffect(() => {
    if (!mesh.current) return;
    cells.forEach((t, i) => {
      dummy.position.set(t.x + 0.5, 0.07, t.z + 0.5);
      dummy.scale.set(1, 1, 1);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.current!.setMatrixAt(i, dummy.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    mesh.current.count = cells.length;
  }, [cells]);
  if (!cells.length) return null;
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, cells.length]} frustumCulled={false}>
      <boxGeometry args={[1.02, 0.1, 1.02]} />
      <meshLambertMaterial color="#3a86ad" transparent opacity={0.92} />
    </instancedMesh>
  );
}

function Roads({ rev }: { rev: number }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const cells = useMemo(() => (sim ? sim.tiles.filter((t) => t.road) : []), [rev]);
  useEffect(() => {
    if (!mesh.current) return;
    cells.forEach((t, i) => {
      dummy.position.set(t.x + 0.5, t.height + 0.045, t.z + 0.5);
      dummy.scale.set(1, 1, 1);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.current!.setMatrixAt(i, dummy.matrix);
    });
    mesh.current.count = cells.length;
    mesh.current.instanceMatrix.needsUpdate = true;
  }, [cells]);
  const n = Math.max(cells.length, 1);
  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, n]}
      receiveShadow
      frustumCulled={false}
      visible={cells.length > 0}
    >
      <boxGeometry args={[1, 0.05, 1]} />
      <meshLambertMaterial color="#3a3f46" />
    </instancedMesh>
  );
}

function Zones({ rev }: { rev: number }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const cells = useMemo(
    () => (sim ? sim.tiles.filter((t) => t.zone !== "none" && t.building < 0 && !t.road) : []),
    [rev],
  );
  useEffect(() => {
    if (!mesh.current) return;
    cells.forEach((t, i) => {
      dummy.position.set(t.x + 0.5, t.height + 0.03, t.z + 0.5);
      dummy.scale.set(1, 1, 1);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.current!.setMatrixAt(i, dummy.matrix);
      _color.set(ZONE_COLOR[t.zone as "R" | "C" | "I"]);
      mesh.current!.setColorAt(i, _color);
    });
    mesh.current.count = cells.length;
    mesh.current.instanceMatrix.needsUpdate = true;
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
  }, [cells]);
  const n = Math.max(cells.length, 1);
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, n]} visible={cells.length > 0} frustumCulled={false}>
      <boxGeometry args={[0.92, 0.025, 0.92]} />
      <meshLambertMaterial transparent opacity={0.55} />
    </instancedMesh>
  );
}

function Trees({ rev }: { rev: number }) {
  const trunk = useRef<THREE.InstancedMesh>(null);
  const leaf = useRef<THREE.InstancedMesh>(null);
  const cells = useMemo(() => (sim ? sim.tiles.filter((t) => t.tree) : []), [rev]);
  useEffect(() => {
    if (!trunk.current || !leaf.current) return;
    cells.forEach((t, i) => {
      dummy.position.set(t.x + 0.5, t.height + 0.16, t.z + 0.5);
      dummy.scale.set(1, 1, 1);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      trunk.current!.setMatrixAt(i, dummy.matrix);
      dummy.position.y = t.height + 0.48;
      dummy.scale.set(0.85 + (t.x % 3) * 0.08, 1 + (t.z % 2) * 0.15, 0.85);
      dummy.updateMatrix();
      leaf.current!.setMatrixAt(i, dummy.matrix);
    });
    trunk.current.count = cells.length;
    leaf.current.count = cells.length;
    trunk.current.instanceMatrix.needsUpdate = true;
    leaf.current.instanceMatrix.needsUpdate = true;
  }, [cells]);
  const n = Math.max(cells.length, 1);
  return (
    <group visible={cells.length > 0}>
      <instancedMesh ref={trunk} args={[undefined, undefined, n]} castShadow frustumCulled={false}>
        <cylinderGeometry args={[0.045, 0.06, 0.28, 5]} />
        <meshLambertMaterial color="#6b5344" />
      </instancedMesh>
      <instancedMesh ref={leaf} args={[undefined, undefined, n]} castShadow frustumCulled={false}>
        <coneGeometry args={[0.22, 0.48, 6]} />
        <meshLambertMaterial color="#2f7a48" />
      </instancedMesh>
    </group>
  );
}

function Buildings({ rev }: { rev: number }) {
  const groups = useMemo(() => {
    const map = new Map<string, { kind: BuildingKind; variant: number; items: Array<{ x: number; z: number; h: number; w: number; d: number }> }>();
    if (!sim) return map;
    for (const b of sim.buildings) {
      const key = `${b.kind}:${b.variant % 4}`;
      let g = map.get(key);
      if (!g) {
        g = { kind: b.kind, variant: b.variant % 4, items: [] };
        map.set(key, g);
      }
      const t = sim.tile(b.x, b.z);
      g.items.push({ x: b.x, z: b.z, h: t?.height ?? 0.08, w: b.w, d: b.d });
    }
    return map;
  }, [rev]);

  return (
    <group>
      {[...groups.values()].map((g) => (
        <InstancedKind key={`${g.kind}-${g.variant}-${g.items.length}`} kind={g.kind} variant={g.variant} items={g.items} />
      ))}
    </group>
  );
}

function InstancedKind({
  kind,
  variant,
  items,
}: {
  kind: BuildingKind;
  variant: number;
  items: Array<{ x: number; z: number; h: number; w: number; d: number }>;
}) {
  const geo = useMemo(() => geometryFor(kind, variant), [kind, variant]);
  const mesh = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    if (!mesh.current) return;
    items.forEach((it, i) => {
      dummy.position.set(it.x + it.w / 2, it.h, it.z + it.d / 2);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.current!.setMatrixAt(i, dummy.matrix);
    });
    mesh.current.count = items.length;
    mesh.current.instanceMatrix.needsUpdate = true;
  }, [items]);
  const n = Math.max(items.length, 1);
  return (
    <instancedMesh
      ref={mesh}
      args={[geo, undefined, n]}
      castShadow
      receiveShadow
      visible={items.length > 0}
      frustumCulled={false}
    >
      <meshLambertMaterial vertexColors />
    </instancedMesh>
  );
}

function Cars() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    if (mesh.current) mesh.current.count = 0;
  }, []);
  useFrame(() => {
    if (!mesh.current || !sim) return;
    const n = sim.vehicles.length;
    mesh.current.count = n;
    for (let i = 0; i < n; i++) {
      const v = sim.vehicles[i]!;
      dummy.position.set(v.x, v.y, v.z);
      dummy.rotation.set(0, v.yaw, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.current.setMatrixAt(i, dummy.matrix);
      _color.setHex(v.color);
      mesh.current.setColorAt(i, _color);
    }
    mesh.current.instanceMatrix.needsUpdate = true;
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, 48]} frustumCulled={false} castShadow>
      <boxGeometry args={[0.22, 0.1, 0.38]} />
      <meshLambertMaterial />
    </instancedMesh>
  );
}

function Ghost() {
  const mesh = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshLambertMaterial>(null);
  const tool = useGame((s) => s.tool);
  useFrame(() => {
    if (!mesh.current || !sim || !sim.hover) {
      if (mesh.current) mesh.current.visible = false;
      return;
    }
    const { x, z } = sim.hover;
    const t = sim.tile(x, z);
    if (!t) {
      mesh.current.visible = false;
      return;
    }
    const check = sim.canPlace(tool, x, z);
    const w = tool === "power" ? 2 : 1;
    mesh.current.position.set(x + w / 2, t.height + 0.12, z + w / 2);
    mesh.current.scale.set(w, 1, w);
    mesh.current.visible = tool !== "select";
    if (mat.current) {
      mat.current.color.set(check.ok ? "#2f9e8f" : "#d15b4c");
    }
  });
  return (
    <mesh ref={mesh} visible={false}>
      <boxGeometry args={[0.92, 0.08, 0.92]} />
      <meshLambertMaterial ref={mat} transparent opacity={0.45} />
    </mesh>
  );
}

function ServiceOverlay() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const overlay = useGame((s) => s.overlay);
  const snapTick = useGame((s) => s.snapshot?.hour);
  useEffect(() => {
    if (!mesh.current || !sim || overlay === "none") return;
    let n = 0;
    for (const t of sim.tiles) {
      const on = overlay === "power" ? t.powered : t.watered;
      if (!on && !t.road) continue;
      dummy.position.set(t.x + 0.5, t.height + 0.08, t.z + 0.5);
      dummy.scale.set(1, 1, 1);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.current.setMatrixAt(n, dummy.matrix);
      _color.set(on ? (overlay === "power" ? "#d4c45a" : "#4aa7d4") : "#d15b4c");
      mesh.current.setColorAt(n, _color);
      n++;
    }
    mesh.current.count = n;
    mesh.current.instanceMatrix.needsUpdate = true;
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
  }, [overlay, snapTick]);
  if (overlay === "none") return null;
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, N * N]} frustumCulled={false}>
      <boxGeometry args={[0.9, 0.02, 0.9]} />
      <meshLambertMaterial transparent opacity={0.42} />
    </instancedMesh>
  );
}
