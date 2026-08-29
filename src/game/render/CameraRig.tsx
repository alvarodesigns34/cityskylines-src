import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { input } from "../input";
import { N, clamp, idx, inBounds } from "../sim/types";
import { sim, useGame } from "../store";
import { viewState, viewTarget } from "./viewTarget";

type ControlsProbe = {
  getYaw: () => number;
  getSpeed: () => number;
  getTarget: () => { x: number; z: number };
  setKeys?: (codes: string[]) => void;
  setSteer?: (v: number) => void;
};

declare global {
  interface Window {
    __controlsTest?: ControlsProbe;
  }
}

/**
 * Cámara orbital con encuadre, giro, zoom y pintado por arrastre.
 *
 * El picking tiene en cuenta el relieve: se corta primero contra un plano a la altura media y
 * después se refina con la altura real de la casilla, de modo que en una ladera el cursor cae
 * donde el jugador ve el suelo y no varias casillas más allá.
 */
export function CameraRig({ interactive }: { interactive: boolean }) {
  const { camera, gl } = useThree();
  const yaw = useRef(0.65);
  const pitch = useRef(0.85);
  const dist = useRef(46);
  const tx = useRef(N * 0.3);
  const tz = useRef(N * 0.5);
  const mode = useRef<"orbit" | "pan" | "paint" | null>(null);
  const last = useRef({ x: 0, y: 0 });
  const lastCell = useRef<{ x: number; z: number } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef(0);
  const panVel = useRef(0);
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const ray = useMemo(() => new THREE.Raycaster(), []);
  const ndc = useMemo(() => new THREE.Vector2(), []);
  const hit = useMemo(() => new THREE.Vector3(), []);

  // Encuadre inicial: la partida arranca sobre la entrada de la autovía; la portada,
  // sobre el centro de masas de la ciudad de muestra.
  useEffect(() => {
    if (!sim) return;
    if (!interactive && sim.buildings.length > 8) {
      let sx = 0;
      let sz = 0;
      for (const b of sim.buildings) {
        sx += b.x;
        sz += b.z;
      }
      tx.current = clamp(sx / sim.buildings.length, 4, N - 4);
      tz.current = clamp(sz / sim.buildings.length, 4, N - 4);
      dist.current = 62;
      pitch.current = 0.72;
      return;
    }
    tx.current = clamp(sim.entry.x + 6, 4, N - 4);
    tz.current = clamp(sim.entry.z, 4, N - 4);
  }, [interactive]);

  useEffect(() => {
    const el = gl.domElement;

    const cellAt = (cx: number, cy: number) => {
      const r = el.getBoundingClientRect();
      ndc.x = ((cx - r.left) / r.width) * 2 - 1;
      ndc.y = -((cy - r.top) / r.height) * 2 + 1;
      ray.setFromCamera(ndc, camera);
      let h = 0.4;
      for (let iter = 0; iter < 3; iter++) {
        plane.constant = -h;
        const p = ray.ray.intersectPlane(plane, hit);
        if (!p) return null;
        const gx = Math.floor(p.x);
        const gz = Math.floor(p.z);
        if (!inBounds(gx, gz)) {
          h = Math.max(0, h * 0.5);
          continue;
        }
        const th = sim ? Math.max(0, sim.grid.height[idx(gx, gz)]!) : 0;
        if (Math.abs(th - h) < 0.08) return { x: gx, z: gz };
        h = th;
      }
      const gx = Math.floor(hit.x);
      const gz = Math.floor(hit.z);
      return inBounds(gx, gz) ? { x: gx, z: gz } : null;
    };

    /** Pinta también las casillas intermedias: un arrastre rápido no deja huecos. */
    const paintLine = (from: { x: number; z: number } | null, to: { x: number; z: number }) => {
      const tool = useGame.getState().tool;
      if (!sim || tool === "select") return;
      let changed = false;
      if (from && (Math.abs(to.x - from.x) > 1 || Math.abs(to.z - from.z) > 1)) {
        const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.z - from.z));
        for (let s = 1; s <= steps; s++) {
          const px = Math.round(from.x + ((to.x - from.x) * s) / steps);
          const pz = Math.round(from.z + ((to.z - from.z) * s) / steps);
          changed = sim.applyTool(tool, px, pz) || changed;
        }
      } else {
        changed = sim.applyTool(tool, to.x, to.z);
      }
      if (changed) useGame.getState().pullSnapshot();
    };

    const onDown = (e: PointerEvent) => {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      last.current = { x: e.clientX, y: e.clientY };
      if (pointers.current.size === 2) {
        const [a, b] = [...pointers.current.values()];
        pinch.current = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        mode.current = "orbit";
        return;
      }
      if (!interactive || e.button === 2 || e.button === 1 || e.shiftKey) {
        mode.current = e.button === 1 || e.shiftKey ? "pan" : "orbit";
        return;
      }
      const tool = useGame.getState().tool;
      const cell = cellAt(e.clientX, e.clientY);
      if (tool === "select") {
        mode.current = "pan";
        // Selecciona la parcela, o limpia si se ha pulsado fuera del mapa. (No se usa
        // `onPointerMissed` de R3F: ninguna malla tiene manejadores de puntero, así que se
        // dispara en *todos* los clics y borraba la selección recién hecha.)
        useGame.getState().setSelected(cell);
        return;
      }
      mode.current = "paint";
      lastCell.current = cell;
      if (cell && sim) {
        sim.hover = cell;
        paintLine(null, cell);
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
        if (pinch.current > 0) dist.current = clamp(dist.current * (pinch.current / d), 9, 110);
        pinch.current = d;
        yaw.current -= dx * 0.004;
        return;
      }
      if (mode.current === "orbit") {
        yaw.current -= dx * 0.005;
        pitch.current = clamp(pitch.current + dy * 0.0035, 0.22, 1.35);
        return;
      }
      if (mode.current === "pan") {
        const sp = dist.current * 0.0022;
        const fx = -Math.sin(yaw.current);
        const fz = -Math.cos(yaw.current);
        const rx = Math.cos(yaw.current);
        const rz = -Math.sin(yaw.current);
        tx.current -= rx * dx * sp + fx * -dy * sp;
        tz.current -= rz * dx * sp + fz * -dy * sp;
        return;
      }

      const cell = cellAt(e.clientX, e.clientY);
      if (sim) sim.hover = cell;
      if (mode.current === "paint" && cell && interactive) {
        if (!lastCell.current || lastCell.current.x !== cell.x || lastCell.current.z !== cell.z) {
          paintLine(lastCell.current, cell);
          lastCell.current = cell;
        }
      }
    };

    const onUp = (e: PointerEvent) => {
      pointers.current.delete(e.pointerId);
      if (pointers.current.size === 0) {
        mode.current = null;
        lastCell.current = null;
      }
    };

    const onLeave = () => {
      if (sim) sim.hover = null;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      dist.current = clamp(dist.current * (1 + Math.sign(e.deltaY) * 0.12), 9, 110);
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("pointerleave", onLeave);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("wheel", onWheel);
    };
  }, [camera, gl, hit, interactive, ndc, plane, ray]);

  useFrame((_, dt) => {
    const d = Math.min(dt, 0.1);
    input.sample();
    if (!interactive) {
      // Órbita lenta para la portada.
      yaw.current += d * 0.045;
    } else {
      const panSpeed = dist.current * 0.55;
      const fx = -Math.sin(yaw.current);
      const fz = -Math.cos(yaw.current);
      const rx = Math.cos(yaw.current);
      const rz = -Math.sin(yaw.current);
      tx.current += (rx * input.panX + fx * input.panZ) * panSpeed * d;
      tz.current += (rz * input.panX + fz * input.panZ) * panSpeed * d;
      yaw.current += input.rotate * 1.1 * d;
      pitch.current = clamp(pitch.current + input.tilt * 0.9 * d, 0.22, 1.35);
      dist.current = clamp(dist.current + input.zoom * 26 * d, 9, 110);
      panVel.current = Math.hypot(input.panX, input.panZ) * panSpeed;
    }
    tx.current = clamp(tx.current, -6, N + 6);
    tz.current = clamp(tz.current, -6, N + 6);

    const groundY = sim
      ? Math.max(
          0,
          sim.grid.height[
            idx(clamp(Math.floor(tx.current), 0, N - 1), clamp(Math.floor(tz.current), 0, N - 1))
          ]!,
        )
      : 0;
    const cr = Math.cos(pitch.current) * dist.current;
    camera.position.set(
      tx.current + Math.sin(yaw.current) * cr,
      groundY + Math.sin(pitch.current) * dist.current + 0.6,
      tz.current + Math.cos(yaw.current) * cr,
    );
    camera.lookAt(tx.current, groundY + 0.4, tz.current);
    viewTarget.set(tx.current, groundY, tz.current);
    viewState.distance = dist.current;

    if (typeof window !== "undefined") {
      window.__controlsTest = {
        getYaw: () => yaw.current,
        getSpeed: () => panVel.current,
        getTarget: () => ({ x: tx.current, z: tz.current }),
        setKeys: (codes) => input.setKeys(codes),
        setSteer: (v) => {
          input.injected.clear();
          if (v > 0.2) input.injected.add("KeyQ");
          if (v < -0.2) input.injected.add("KeyE");
        },
      };
    }
  });

  return null;
}
