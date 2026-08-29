import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { hash2 } from "../../sim/rng";
import { roadSurface } from "../../sim/systems/network";
import { N, ROAD, TERRAIN, idx } from "../../sim/types";
import { sim } from "../../store";
import { buildingGeometry, lodGeometry, variantsFor } from "../geom/buildings";
import { grassGeometry, lampGeometry, rockGeometry, treeGeometry } from "../geom/props";
import { bridgeGeometry, roadGeometry } from "../geom/roads";
import { createCityMaterial, createFoliageMaterial, createRoadMaterial } from "../materials";
import { useSimVersion } from "../useSimVersion";
import { viewState, viewTarget } from "../viewTarget";

const dummy = new THREE.Object3D();
/** Ángulo por orientación: 0 = fachada al norte, 1 = este, 2 = sur, 3 = oeste. */
const ROT_Y = [0, -Math.PI / 2, Math.PI, Math.PI / 2];

function useCityMaterial() {
  const mat = useMemo(() => createCityMaterial(), []);
  useEffect(() => () => mat.dispose(), [mat]);
  return mat;
}

interface Bucket {
  key: string;
  geometry: THREE.BufferGeometry;
  items: Array<{ x: number; y: number; z: number; rot: number; scale?: number }>;
}

function InstancedBucket({
  bucket,
  material,
  castShadow = true,
  receiveShadow = true,
}: {
  bucket: Bucket;
  material: THREE.Material;
  castShadow?: boolean;
  receiveShadow?: boolean;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  // La capacidad crece a saltos para no recrear la malla con cada edificio nuevo.
  const capacity = useMemo(() => Math.max(16, 1 << Math.ceil(Math.log2(bucket.items.length + 1))), [
    bucket.items.length,
  ]);
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    bucket.items.forEach((it, i) => {
      dummy.position.set(it.x, it.y, it.z);
      dummy.rotation.set(0, ROT_Y[it.rot & 3]!, 0);
      const s = it.scale ?? 1;
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.count = bucket.items.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [bucket]);
  return (
    <instancedMesh
      ref={ref}
      args={[bucket.geometry, material, capacity]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      frustumCulled={false}
      visible={bucket.items.length > 0}
    />
  );
}

/* ------------------------------------------------------------------ vías */

export function Roads() {
  const rev = useSimVersion((s) => s.roadsVersion);
  const material = useMemo(() => createRoadMaterial(), []);
  useEffect(() => () => material.dispose(), [material]);

  const buckets = useMemo(() => {
    const map = new Map<string, Bucket>();
    if (!sim) return [] as Bucket[];
    const g = sim.grid;
    for (let z = 0; z < N; z++) {
      for (let x = 0; x < N; x++) {
        const i = idx(x, z);
        const cls = g.road[i]!;
        if (cls === ROAD.none) continue;
        let mask = 0;
        if (x < N - 1 && g.road[i + 1]) mask |= 1;
        if (x > 0 && g.road[i - 1]) mask |= 2;
        if (z < N - 1 && g.road[i + N]) mask |= 4;
        if (z > 0 && g.road[i - N]) mask |= 8;
        const bridge = g.terrain[i] === TERRAIN.water;
        const key = `${bridge ? "b" : "r"}${cls}:${mask}`;
        let b = map.get(key);
        if (!b) {
          b = { key, geometry: bridge ? bridgeGeometry(cls, mask) : roadGeometry(cls, mask), items: [] };
          map.set(key, b);
        }
        b.items.push({ x: x + 0.5, y: roadSurface(g, i), z: z + 0.5, rot: 0 });
      }
    }
    return [...map.values()];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rev]);

  return (
    <group>
      {buckets.map((b) => (
        <InstancedBucket key={b.key} bucket={b} material={material} castShadow={false} />
      ))}
    </group>
  );
}

/** Farolas repartidas por la red, encendidas de noche por `aEmis`. */
export function StreetLamps() {
  const rev = useSimVersion((s) => s.roadsVersion);
  const material = useCityMaterial();
  const bucket = useMemo<Bucket>(() => {
    const items: Bucket["items"] = [];
    if (sim) {
      const g = sim.grid;
      for (let z = 0; z < N; z++) {
        for (let x = 0; x < N; x++) {
          const i = idx(x, z);
          if (g.road[i] === ROAD.none) continue;
          if (g.terrain[i] === TERRAIN.water) continue;
          if ((x * 3 + z * 5) % 4 !== 0) continue;
          // Se coloca en un lado sin salida, es decir, sobre la acera.
          const openX = x < N - 1 && !g.road[i + 1] ? 1 : x > 0 && !g.road[i - 1] ? -1 : 0;
          const openZ = z < N - 1 && !g.road[i + N] ? 1 : z > 0 && !g.road[i - N] ? -1 : 0;
          if (!openX && !openZ) continue;
          const rot = openX ? (openX > 0 ? 3 : 1) : openZ > 0 ? 0 : 2;
          items.push({
            x: x + 0.5 + openX * 0.4,
            y: roadSurface(g, i) + 0.04,
            z: z + 0.5 + (openX ? 0 : openZ * 0.4),
            rot,
          });
        }
      }
    }
    return { key: "lamps", geometry: lampGeometry(), items };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rev]);
  return <InstancedBucket bucket={bucket} material={material} />;
}

/* ------------------------------------------------------------------ edificios */

export function Buildings() {
  const rev = useSimVersion((s) => s.buildingsVersion);
  const material = useCityMaterial();
  const [lodKey, setLodKey] = useState("0,0,0");
  const lodRef = useRef(lodKey);
  lodRef.current = lodKey;

  useFrame(() => {
    const qx = Math.round(viewTarget.x / 8);
    const qz = Math.round(viewTarget.z / 8);
    const band = viewState.distance > 72 ? 2 : viewState.distance > 38 ? 1 : 0;
    const key = `${qx},${qz},${band}`;
    if (key !== lodRef.current) setLodKey(key);
  });

  const buckets = useMemo(() => {
    const map = new Map<string, Bucket>();
    if (!sim) return [] as Bucket[];
    const g = sim.grid;
    const [qx, qz, band] = lodKey.split(",").map(Number);
    const cx = (qx ?? 0) * 8;
    const cz = (qz ?? 0) * 8;
    const radius = band === 2 ? 0 : band === 1 ? 18 : 28;
    const radius2 = radius * radius;
    for (const b of sim.buildings) {
      const x = b.x + b.w / 2;
      const z = b.z + b.d / 2;
      const dx = x - cx;
      const dz = z - cz;
      const far = radius === 0 || dx * dx + dz * dz > radius2;
      const v = b.variant % variantsFor(b.kind);
      const key = far ? `lod:${b.kind}` : `${b.kind}:${v}`;
      let bucket = map.get(key);
      if (!bucket) {
        bucket = {
          key,
          geometry: far ? lodGeometry(b.kind) : buildingGeometry(b.kind, v),
          items: [],
        };
        map.set(key, bucket);
      }
      // Se apoya en la cota más alta de la parcela: nada flota ni se hunde.
      let top = -99;
      for (let zz = 0; zz < b.d; zz++) {
        for (let xx = 0; xx < b.w; xx++) {
          const i = g.at(b.x + xx, b.z + zz);
          if (i >= 0) top = Math.max(top, g.height[i]!);
        }
      }
      bucket.items.push({
        x,
        y: Math.max(0.02, top),
        z,
        rot: b.rot,
      });
    }
    return [...map.values()];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rev, lodKey]);

  return (
    <group>
      {buckets.map((b) => (
        <InstancedBucket key={b.key} bucket={b} material={material} />
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ vegetación */

export function Vegetation() {
  const rev = useSimVersion((s) => s.treesVersion + s.terrainVersion);
  const material = useMemo(() => createFoliageMaterial(), []);
  const rockMat = useCityMaterial();
  useEffect(() => () => material.dispose(), [material]);

  const buckets = useMemo(() => {
    const species: Bucket[] = [0, 1, 2, 3, 4].map((s) => ({
      key: `tree${s}`,
      geometry: treeGeometry(s as 0 | 1 | 2 | 3 | 4),
      items: [],
    }));
    const rocks: Bucket[] = [0, 1].map((s) => ({
      key: `rock${s}`,
      geometry: rockGeometry(s as 0 | 1),
      items: [],
    }));
    if (!sim) return { species, rocks };
    const g = sim.grid;
    for (let z = 0; z < N; z++) {
      for (let x = 0; x < N; x++) {
        const i = idx(x, z);
        const h = g.height[i]!;
        if (g.tree[i]) {
          const count = 2 + (hash2(x, z, 3) > 0.55 ? 1 : 0) + (hash2(x, z, 4) > 0.82 ? 1 : 0);
          const moist = g.scenery[i]!;
          const elev = Math.max(0, Math.min(1, h / 7));
          for (let k = 0; k < count; k++) {
            const jx = hash2(x * 7 + k, z, 11) - 0.5;
            const jz = hash2(x, z * 7 + k, 13) - 0.5;
            const roll = hash2(x + k, z, 17);
            let sp = 0;
            if (elev > 0.55 + roll * 0.12) sp = 1;
            else if (moist > 0.55 && roll > 0.55) sp = 3;
            else if (elev < 0.22 && moist < 0.35) sp = 4;
            else if (roll > 0.72) sp = 2;
            else if (roll > 0.38) sp = 0;
            else sp = 1;
            species[sp]!.items.push({
              x: x + 0.5 + jx * 0.72,
              y: h,
              z: z + 0.5 + jz * 0.72,
              rot: (hash2(x + k, z + k, 23) * 4) | 0,
              scale: 0.82 + hash2(x, z + k, 29) * 0.7,
            });
          }
        } else if (g.terrain[i] === TERRAIN.rock && hash2(x, z, 31) > 0.55) {
          const v = hash2(x, z, 37) > 0.5 ? 1 : 0;
          rocks[v]!.items.push({
            x: x + 0.5 + (hash2(x, z, 41) - 0.5) * 0.6,
            y: h,
            z: z + 0.5 + (hash2(x, z, 43) - 0.5) * 0.6,
            rot: (hash2(x, z, 47) * 4) | 0,
            scale: 0.7 + hash2(x, z, 53) * 0.8,
          });
        }
      }
    }
    return { species, rocks };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rev]);

  return (
    <group>
      {buckets.species.map((b) => (
        <InstancedBucket key={b.key} bucket={b} material={material} receiveShadow={false} />
      ))}
      {buckets.rocks.map((b) => (
        <InstancedBucket key={b.key} bucket={b} material={rockMat} receiveShadow={false} />
      ))}
    </group>
  );
}

/** Mechones de hierba cerca de la cámara. Se ocultan al alejarse. */
export function Grass() {
  const rev = useSimVersion((s) => s.terrainVersion + s.buildingsVersion + s.roadsVersion + s.treesVersion);
  const material = useMemo(() => createFoliageMaterial({ roughness: 0.95 }), []);
  useEffect(() => () => material.dispose(), [material]);
  const ref = useRef<THREE.Group>(null);

  const bucket = useMemo<Bucket>(() => {
    const items: Bucket["items"] = [];
    if (sim) {
      const g = sim.grid;
      for (let z = 0; z < N; z++) {
        for (let x = 0; x < N; x++) {
          const i = idx(x, z);
          if (g.terrain[i] !== TERRAIN.grass) continue;
          if (g.road[i] !== ROAD.none) continue;
          if (g.building[i]! >= 0) continue;
          if (g.slope[i]! > 0.42) continue;
          if (hash2(x, z, 61) < 0.35) continue;
          const count = g.tree[i] ? 1 : 1 + (hash2(x, z, 67) > 0.6 ? 1 : 0);
          for (let k = 0; k < count; k++) {
            items.push({
              x: x + 0.2 + hash2(x + k, z, 71) * 0.6,
              y: g.height[i]!,
              z: z + 0.2 + hash2(x, z + k, 73) * 0.6,
              rot: (hash2(x + k, z, 79) * 4) | 0,
              scale: 0.7 + hash2(x, z + k, 83) * 0.9,
            });
          }
        }
      }
    }
    return { key: "grass", geometry: grassGeometry(), items };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rev]);

  useFrame(() => {
    if (ref.current) ref.current.visible = viewState.distance < 58;
  });

  return (
    <group ref={ref}>
      <InstancedBucket bucket={bucket} material={material} castShadow={false} receiveShadow={false} />
    </group>
  );
}
