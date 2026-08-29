import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { MAX_HEIGHT, WATER_LEVEL } from "../../sim/generate";
import { hash2 } from "../../sim/rng";
import { N, TERRAIN, idx } from "../../sim/types";
import { sim } from "../../store";
import { skyFor } from "../daynight";
import { mergeParts, type Part } from "../geom/parts";
import { cityUniforms, createSkyMaterial, createTerrainMaterial, createWaterMaterial } from "../materials";
import { TERRAIN_COLORS } from "../palettes";
import { useSimVersion } from "../useSimVersion";
import { viewState, viewTarget } from "../viewTarget";

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
      const n2 = ((cx * 19 + cz * 53) % 9) / 9 - 0.5;
      c.setRGB(col[0] * (1 + n * 0.1 + n2 * 0.05), col[1] * (1 + n * 0.08), col[2] * (1 + n * 0.09));
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

const _shallowMix = new THREE.Color();
const _rainFog = new THREE.Color(0x6a7484);
const _lightDir = new THREE.Vector3();
const _rainSky = new THREE.Color(0x5a6472);

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
    uniforms.uShallow.value.copy(sky.waterTint).lerp(_shallowMix.setHex(0x6fb2c4), 0.45);
    uniforms.uDeep.value.copy(sky.waterTint).multiplyScalar(0.75);
    uniforms.uFogColor.value.copy(sky.fogColor);
    uniforms.uFogNear.value = sky.fogNear;
    uniforms.uFogFar.value = sky.fogFar;
    uniforms.uRain.value = sim?.rain ?? 0;
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
  const fillRef = useRef<THREE.DirectionalLight>(null);
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
    if (domeRef.current) domeRef.current.position.copy(camera.position);
    uniforms.uTop.value.copy(sky.skyTop);
    uniforms.uHorizon.value.copy(sky.skyHorizon);
    uniforms.uSun.value.copy(sky.sunDir);
    uniforms.uSunColor.value.copy(sky.sunColor);
    uniforms.uMoon.value.copy(sky.moonDir);
    uniforms.uNight.value = sky.night;
    uniforms.uTime.value = cityUniforms.uTime.value;
    const rain = sim?.rain ?? 0;
    uniforms.uRain.value = rain;
    if (rain > 0.04) {
      uniforms.uTop.value.lerp(_rainSky, rain * 0.5);
      uniforms.uHorizon.value.lerp(_rainFog, rain * 0.45);
      uniforms.uNight.value = Math.min(1, sky.night + rain * 0.12);
    }
    fog.color.copy(sky.fogColor).lerp(_rainFog, rain * 0.35);
    fog.near = sky.fogNear * (1 - rain * 0.22);
    fog.far = sky.fogFar * (1 - rain * 0.18);

    const sun = sunRef.current;
    if (sun) {
      const { x: tx, y: ty, z: tz } = viewTarget;
      sun.target.position.set(tx, ty, tz);
      sun.target.updateMatrixWorld();
      const reach = Math.max(120, viewState.distance * 2.6);
      // Mezcla continua sol→luna: un umbral duro hacía saltar posición, color e intensidad
      // de golpe al cruzar night=0.55 (se notaba como un parpadeo en el atardecer).
      const moonMix = THREE.MathUtils.smoothstep(sky.night, 0.35, 0.75);
      _lightDir.copy(sky.sunDir).lerp(sky.moonDir, moonMix).normalize();
      sun.position.set(tx + _lightDir.x * reach, ty + _lightDir.y * reach + 8, tz + _lightDir.z * reach);
      sun.color.copy(sky.sunColor).lerp(sky.moonColor, moonMix);
      sun.intensity = THREE.MathUtils.lerp(sky.sunIntensity, sky.moonIntensity, moonMix);
      sun.castShadow = _lightDir.y > 0.1;
      sun.shadow.radius = 2.4;
      sun.shadow.blurSamples = 8;
      const half = THREE.MathUtils.clamp(viewState.distance * 1.05, 26, 95);
      const cam = sun.shadow.camera;
      if (cam.left !== -half) {
        cam.left = -half;
        cam.right = half;
        cam.top = half;
        cam.bottom = -half;
        cam.near = 1;
        cam.far = reach * 2.4;
        cam.updateProjectionMatrix();
      }
    }
    if (fillRef.current) {
      const { x: tx, y: ty, z: tz } = viewTarget;
      const dir = sky.sunDir;
      fillRef.current.position.set(tx - dir.x * 80, ty + 46, tz - dir.z * 80);
      fillRef.current.color.copy(sky.skyHorizon);
      fillRef.current.intensity = 0.18 + sky.daylight * 0.32;
    }
    if (hemiRef.current) {
      hemiRef.current.color.copy(sky.skyHorizon).lerp(sky.ambientColor, 0.55);
      hemiRef.current.groundColor.copy(sky.groundColor);
      hemiRef.current.intensity = sky.ambientIntensity * (0.95 + rain * 0.08);
    }
    if (ambRef.current) {
      ambRef.current.color.copy(sky.ambientColor);
      // De noche este relleno debe ser mínimo: la legibilidad la dan la luna, las farolas
      // y las ventanas encendidas, no un ambiente plano que borra el contraste.
      ambRef.current.intensity = 0.22 + sky.night * 0.06;
    }
  });

  return (
    <>
      <mesh ref={domeRef} material={material} frustumCulled={false} renderOrder={-1}>
        <sphereGeometry args={[900, 48, 28]} />
      </mesh>
      <directionalLight
        ref={sunRef}
        castShadow
        intensity={2.2}
        position={[60, 90, 40]}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.00035}
        shadow-normalBias={0.035}
        shadow-radius={2.2}
      >
        <orthographicCamera attach="shadow-camera" args={[-50, 50, 50, -50, 1, 320]} />
      </directionalLight>
      <directionalLight ref={fillRef} intensity={0.28} position={[-40, 50, -30]} />
      <hemisphereLight ref={hemiRef} intensity={0.6} />
      <ambientLight ref={ambRef} intensity={0.25} />
    </>
  );
}

function buildHorizonGeometry(): THREE.BufferGeometry {
  const raw: Part[] = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2 + hash2(i, 11, 3) * 0.28;
    const r = 82 + hash2(i, 17, 5) * 32;
    const x = N / 2 + Math.cos(a) * r;
    const z = N / 2 + Math.sin(a) * r;
    const h = 4.2 + hash2(i, 23, 7) * 11;
    const w = 9 + hash2(i, 29, 9) * 16;
    const col = hash2(i, 31, 2) > 0.55 ? 0x5a6860 : 0x4e5c58;
    raw.push({ g: "cone", x, y: h * 0.22 - 1.8, z, sx: w * 0.72, sy: h * 0.85, sz: w * 0.72, color: col, seg: 7 });
    raw.push({
      g: "cone",
      x: x + (hash2(i, 41, 4) - 0.5) * w * 0.45,
      y: h * 0.12 - 1.5,
      z: z + (hash2(i, 43, 6) - 0.5) * w * 0.45,
      sx: w * 0.42,
      sy: h * 0.55,
      sz: w * 0.42,
      color: 0x3d4a48,
      seg: 6,
    });
  }
  return mergeParts(raw);
}

/** Silueta de montes fuera del mapa: el horizonte deja de ser un disco plano. */
export function Horizon() {
  const geo = useMemo(() => buildHorizonGeometry(), []);
  const mat = useMemo(
    () =>
      new THREE.MeshLambertMaterial({
        vertexColors: true,
        color: 0xffffff,
        fog: true,
      }),
    [],
  );
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat],
  );
  return <mesh geometry={geo} material={mat} receiveShadow={false} castShadow={false} frustumCulled={false} />;
}
