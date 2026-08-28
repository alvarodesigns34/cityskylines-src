import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { MAX_HEIGHT, WATER_LEVEL } from "../../sim/generate";
import { N, TERRAIN, idx } from "../../sim/types";
import { sim } from "../../store";
import { skyFor } from "../daynight";
import { createSkyMaterial, createTerrainMaterial, createWaterMaterial } from "../materials";
import { TERRAIN_COLORS } from "../palettes";
import { useSimVersion } from "../useSimVersion";

/** Cuánto sobresale el faldón del mapa hacia el mar. */
const SKIRT = 14;

function cornerHeight(x: number, z: number): number {
  if (!sim) return 0;
  const g = sim.grid;
  let sum = 0;
  let n = 0;
  for (const [dx, dz] of [
    [-1, -1],
    [0, -1],
    [-1, 0],
    [0, 0],
  ] as const) {
    const cx = x + dx;
    const cz = z + dz;
    if (cx < 0 || cz < 0 || cx >= N || cz >= N) continue;
    sum += g.height[idx(cx, cz)]!;
    n++;
  }
  return n ? sum / n : -1.5;
}

/**
 * Malla del terreno con faldón hacia el mar.
 *
 * El color se decide por altura, pendiente y tipo de suelo: playa en la orilla, hierba seca en
 * cotas medias, roca en las pendientes fuertes y nieve en las cumbres. La pendiente es la misma
 * que bloquea la construcción, así que lo que se ve gris y escarpado también lo es al construir.
 */
function buildTerrainGeometry(): THREE.BufferGeometry {
  const size = N + 3; // anillo exterior + N+1 esquinas
  const positions = new Float32Array(size * size * 3);
  const colors = new Float32Array(size * size * 3);
  const c = new THREE.Color();

  const coord = (i: number) => (i === 0 ? -SKIRT : i === size - 1 ? N + SKIRT : i - 1);

  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const k = j * size + i;
      const x = coord(i);
      const z = coord(j);
      const outer = i === 0 || j === 0 || i === size - 1 || j === size - 1;
      const h = outer ? -3.2 : cornerHeight(i - 1, j - 1);
      positions[k * 3] = x;
      positions[k * 3 + 1] = h;
      positions[k * 3 + 2] = z;

      const cx = Math.min(N - 1, Math.max(0, i - 1));
      const cz = Math.min(N - 1, Math.max(0, j - 1));
      const ti = idx(cx, cz);
      const terrain = sim ? sim.grid.terrain[ti]! : TERRAIN.grass;
      const slope = sim ? sim.grid.slope[ti]! : 0;
      const rel = Math.max(0, h) / MAX_HEIGHT;

      let col: readonly [number, number, number];
      if (outer || terrain === TERRAIN.water) col = [0.16, 0.2, 0.18];
      else if (h < WATER_LEVEL + 0.42) col = TERRAIN_COLORS.sand;
      else if (slope > 0.42 || terrain === TERRAIN.rock) col = rel > 0.78 ? TERRAIN_COLORS.snow : TERRAIN_COLORS.cliff;
      else if (rel > 0.68) col = TERRAIN_COLORS.rock;
      else if (rel > 0.4) col = TERRAIN_COLORS.grassDry;
      else col = rel > 0.18 ? TERRAIN_COLORS.grassHigh : TERRAIN_COLORS.grassLow;

      // Ruido suave para que no se vea el damero.
      const n = ((cx * 37 + cz * 71) % 13) / 13 - 0.5;
      c.setRGB(col[0] * (1 + n * 0.08), col[1] * (1 + n * 0.07), col[2] * (1 + n * 0.09));
      colors[k * 3] = c.r;
      colors[k * 3 + 1] = c.g;
      colors[k * 3 + 2] = c.b;
    }
  }

  const indices: number[] = [];
  for (let j = 0; j < size - 1; j++) {
    for (let i = 0; i < size - 1; i++) {
      const a = j * size + i;
      const b = a + 1;
      const d = a + size;
      const e = d + 1;
      indices.push(a, d, b, b, d, e);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

export function Terrain() {
  const rev = useSimVersion((s) => s.terrainVersion);
  // `rev` es el token de invalidación: cambia cuando el simulador toca el terreno.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const geo = useMemo(() => buildTerrainGeometry(), [rev]);
  const mat = useMemo(() => createTerrainMaterial(), []);
  useEffect(() => () => geo.dispose(), [geo]);
  useEffect(() => () => mat.dispose(), [mat]);
  return <mesh geometry={geo} material={mat} receiveShadow castShadow={false} />;
}

/** Textura de profundidad del lecho: la usa el agua para teñir según el fondo. */
function buildDepthTexture(): THREE.DataTexture {
  const data = new Uint8Array(N * N * 4);
  for (let z = 0; z < N; z++) {
    for (let x = 0; x < N; x++) {
      const h = sim ? sim.grid.height[idx(x, z)]! : -2;
      const depth = Math.max(0, Math.min(1, (WATER_LEVEL - h) / 2.6));
      const k = (z * N + x) * 4;
      data[k] = Math.round(depth * 255);
      data[k + 1] = data[k]!;
      data[k + 2] = data[k]!;
      data[k + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

export function Water() {
  const ref = useRef<THREE.Mesh>(null);
  const rev = useSimVersion((s) => s.terrainVersion);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const depth = useMemo(() => buildDepthTexture(), [rev]);
  const { material, uniforms } = useMemo(() => createWaterMaterial(depth, N), [depth]);
  useEffect(() => {
    return () => {
      depth.dispose();
      material.dispose();
    };
  }, [depth, material]);

  useFrame(({ camera }, dt) => {
    uniforms.uTime.value += dt;
    // El mar acompaña a la cámara: así su borde nunca entra en pantalla.
    if (ref.current) {
      ref.current.position.x = Math.round(camera.position.x);
      ref.current.position.z = Math.round(camera.position.z);
    }
    const sky = skyFor(sim?.hour ?? 12);
    uniforms.uSun.value.copy(sky.sunDir);
    uniforms.uSunColor.value.copy(sky.sunColor);
    uniforms.uSkyColor.value.copy(sky.skyHorizon);
    uniforms.uNight.value = sky.night;
    uniforms.uShallow.value.copy(sky.waterTint).lerp(new THREE.Color(0x6fb2c4), 0.45);
    uniforms.uDeep.value.copy(sky.waterTint).multiplyScalar(0.75);
    uniforms.uFogColor.value.copy(sky.fogColor);
    uniforms.uFogNear.value = sky.fogNear;
    uniforms.uFogFar.value = sky.fogFar;
  });

  return (
    <mesh
      ref={ref}
      material={material}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[N / 2, WATER_LEVEL, N / 2]}
      frustumCulled={false}
    >
      <planeGeometry args={[1800, 1800, 8, 8]} />
    </mesh>
  );
}

export function Sky() {
  const { scene } = useThree();
  const { material, uniforms } = useMemo(() => createSkyMaterial(), []);
  const domeRef = useRef<THREE.Mesh>(null);
  const sunRef = useRef<THREE.DirectionalLight>(null);
  const hemiRef = useRef<THREE.HemisphereLight>(null);
  const ambRef = useRef<THREE.AmbientLight>(null);
  const fog = useMemo(() => new THREE.Fog(0xbdd8ea, 70, 230), []);

  useEffect(() => {
    scene.fog = fog;
    return () => {
      scene.fog = null;
      material.dispose();
    };
  }, [scene, fog, material]);

  useFrame(({ camera }) => {
    const sky = skyFor(sim?.hour ?? 12);
    // La cúpula viaja con la cámara: si no, el horizonte se ve torcido al alejarse del centro.
    if (domeRef.current) domeRef.current.position.copy(camera.position);
    uniforms.uTop.value.copy(sky.skyTop);
    uniforms.uHorizon.value.copy(sky.skyHorizon);
    uniforms.uSun.value.copy(sky.sunDir);
    uniforms.uSunColor.value.copy(sky.sunColor);
    uniforms.uNight.value = sky.night;
    fog.color.copy(sky.fogColor);
    fog.near = sky.fogNear;
    fog.far = sky.fogFar;

    const sun = sunRef.current;
    if (sun) {
      // La sombra sigue al objetivo de cámara para mantener resolución donde se mira.
      const tx = camera.position.x;
      const tz = camera.position.z;
      sun.target.position.set(tx, 0, tz);
      sun.target.updateMatrixWorld();
      sun.position.set(tx + sky.sunDir.x * 90, sky.sunDir.y * 90 + 6, tz + sky.sunDir.z * 90);
      sun.color.copy(sky.sunColor);
      sun.intensity = sky.sunIntensity;
      sun.castShadow = sky.sunIntensity > 0.35;
    }
    if (hemiRef.current) {
      hemiRef.current.color.copy(sky.skyHorizon);
      hemiRef.current.groundColor.copy(sky.groundColor);
      hemiRef.current.intensity = sky.ambientIntensity;
    }
    if (ambRef.current) {
      ambRef.current.color.copy(sky.ambientColor);
      ambRef.current.intensity = 0.22 + sky.night * 0.16;
    }
  });

  return (
    <>
      <mesh ref={domeRef} material={material} frustumCulled={false} renderOrder={-1}>
        <sphereGeometry args={[900, 32, 20]} />
      </mesh>
      <directionalLight ref={sunRef} castShadow intensity={2.2} position={[60, 90, 40]}>
        <orthographicCamera attach="shadow-camera" args={[-46, 46, 46, -46, 1, 260]} />
      </directionalLight>
      <hemisphereLight ref={hemiRef} intensity={0.6} />
      <ambientLight ref={ambRef} intensity={0.25} />
    </>
  );
}
