import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { DEFS } from "../../sim/catalog";
import { hash2 } from "../../sim/rng";
import { N } from "../../sim/types";
import { sim } from "../../store";
import { skyFor } from "../daynight";
import { chimneysFor, variantsFor } from "../geom/buildings";
import { vehicleGeometry } from "../geom/props";
import { createCityMaterial, createSmokeMaterial } from "../materials";
import { useSimVersion } from "../useSimVersion";
import { viewTarget } from "../viewTarget";

const dummy = new THREE.Object3D();
const _color = new THREE.Color();
const MAX_VEHICLES = 200;

/** Coches, furgonetas, camiones y emergencias recorriendo las rutas reales del tráfico. */
export function Vehicles() {
  const material = useMemo(() => createCityMaterial({ roughness: 0.45, metalness: 0.15 }), []);
  const refs = [
    useRef<THREE.InstancedMesh>(null),
    useRef<THREE.InstancedMesh>(null),
    useRef<THREE.InstancedMesh>(null),
    useRef<THREE.InstancedMesh>(null),
  ];
  useEffect(() => () => material.dispose(), [material]);

  useFrame(() => {
    if (!sim) return;
    const counts = [0, 0, 0, 0];
    for (const v of sim.vehicles) {
      const mesh = refs[v.kind]?.current;
      if (!mesh) continue;
      const i = counts[v.kind]!;
      if (i >= MAX_VEHICLES) continue;
      dummy.position.set(v.x, v.y, v.z);
      dummy.rotation.set(0, v.yaw, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      _color.setHex(v.color, THREE.SRGBColorSpace);
      mesh.setColorAt(i, _color);
      counts[v.kind] = i + 1;
    }
    for (let k = 0; k < 4; k++) {
      const mesh = refs[k]!.current;
      if (!mesh) continue;
      mesh.count = counts[k]!;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  });

  return (
    <group>
      {[0, 1, 2, 3].map((k) => (
        <instancedMesh
          key={k}
          ref={refs[k]}
          args={[vehicleGeometry(k as 0 | 1 | 2 | 3), material, MAX_VEHICLES]}
          castShadow
          frustumCulled={false}
        />
      ))}
    </group>
  );
}

/** Penachos de humo sobre chimeneas industriales y centrales. */
export function Smoke() {
  const rev = useSimVersion((s) => s.buildingsVersion);
  const { material, uniforms } = useMemo(() => createSmokeMaterial(), []);

  const geometry = useMemo(() => {
    const origins: number[] = [];
    const corners: number[] = [];
    const seeds: number[] = [];
    const scales: number[] = [];
    const positions: number[] = [];
    if (sim) {
      const g = sim.grid;
      let sources = 0;
      for (const b of sim.buildings) {
        const def = DEFS[b.kind]!;
        if (!def.style.chimneys || b.occupancy < 0.2) continue;
        if (sources > 60) break;
        const v = b.variant % variantsFor(b.kind);
        const stacks = chimneysFor(b.kind, v);
        if (!stacks.length) continue;
        let top = 0;
        for (let zz = 0; zz < b.d; zz++) {
          for (let xx = 0; xx < b.w; xx++) {
            const i = g.at(b.x + xx, b.z + zz);
            if (i >= 0) top = Math.max(top, g.height[i]!);
          }
        }
        const ang = [0, -Math.PI / 2, Math.PI, Math.PI / 2][b.rot & 3]!;
        const cos = Math.cos(ang);
        const sin = Math.sin(ang);
        for (const [lx, ly, lz] of stacks) {
          const wx = b.x + b.w / 2 + (lx * cos + lz * sin);
          const wz = b.z + b.d / 2 + (-lx * sin + lz * cos);
          const wy = Math.max(0.02, top) + ly;
          const puffs = 5;
          for (let p = 0; p < puffs; p++) {
            const seed = hash2(b.id * 13 + p, Math.round(lx * 100), 71);
            const scale = 0.32 + hash2(b.id + p, p, 73) * 0.35 + def.pollution * 0.12;
            for (const [ux, uy] of [
              [-1, -1],
              [1, -1],
              [1, 1],
              [-1, -1],
              [1, 1],
              [-1, 1],
            ] as const) {
              positions.push(0, 0, 0);
              origins.push(wx, wy, wz);
              corners.push(ux, uy);
              seeds.push(seed);
              scales.push(scale);
            }
          }
          sources++;
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions.length ? positions : [0, 0, 0], 3));
    geo.setAttribute("aOrigin", new THREE.Float32BufferAttribute(origins.length ? origins : [0, -99, 0], 3));
    geo.setAttribute("aCorner", new THREE.Float32BufferAttribute(corners.length ? corners : [0, 0], 2));
    geo.setAttribute("aSeed", new THREE.Float32BufferAttribute(seeds.length ? seeds : [0], 1));
    geo.setAttribute("aScale", new THREE.Float32BufferAttribute(scales.length ? scales : [0], 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(N / 2, 4, N / 2), 200);
    return geo;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rev]);

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  useFrame((_, dt) => {
    uniforms.uTime.value += dt;
    const sky = skyFor(sim?.hour ?? 12);
    uniforms.uOpacity.value = 0.55 + sky.daylight * 0.5;
    uniforms.uColor.value.setRGB(
      0.72 - sky.night * 0.42,
      0.71 - sky.night * 0.42,
      0.68 - sky.night * 0.4,
    );
  });

  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={3} />;
}

const RAIN_COUNT = 280;
const _rainDummy = new THREE.Object3D();

/** Ráfagas de lluvia ancladas a la cámara: no llueve fuera de lo que se ve. */
export function Rain() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const seeds = useMemo(() => {
    const s = new Float32Array(RAIN_COUNT * 4);
    for (let i = 0; i < RAIN_COUNT; i++) {
      s[i * 4] = (Math.random() - 0.5) * 52;
      s[i * 4 + 1] = (Math.random() - 0.5) * 52;
      s[i * 4 + 2] = 12 + Math.random() * 16;
      s[i * 4 + 3] = Math.random() * 22;
    }
    return s;
  }, []);
  const geometry = useMemo(() => new THREE.BoxGeometry(0.028, 0.62, 0.028), []);
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: 0xc5d4e6,
        transparent: true,
        opacity: 0.38,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh || !sim) return;
    const rain = sim.rain;
    mesh.visible = rain > 0.08;
    if (!mesh.visible) return;
    material.opacity = 0.16 + rain * 0.38;
    const t = clock.elapsedTime;
    const tx = viewTarget.x;
    const ty = viewTarget.y;
    const tz = viewTarget.z;
    for (let i = 0; i < RAIN_COUNT; i++) {
      const ox = seeds[i * 4]!;
      const oz = seeds[i * 4 + 1]!;
      const spd = seeds[i * 4 + 2]!;
      const off = seeds[i * 4 + 3]!;
      const y = 16 - ((t * spd + off) % 20);
      _rainDummy.position.set(tx + ox, Math.max(0.15, ty + y), tz + oz);
      _rainDummy.rotation.set(0.22, 0, 0.06);
      _rainDummy.scale.set(1, 0.7 + rain, 1);
      _rainDummy.updateMatrix();
      mesh.setMatrixAt(i, _rainDummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, RAIN_COUNT]}
      frustumCulled={false}
      renderOrder={6}
      visible={false}
    />
  );
}
