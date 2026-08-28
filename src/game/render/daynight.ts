import * as THREE from "three";

export interface SkyState {
  /** 0 = noche cerrada, 1 = pleno día. */
  daylight: number;
  /** 0 = día, 1 = noche (para ventanas y farolas). */
  night: number;
  sunDir: THREE.Vector3;
  sunColor: THREE.Color;
  sunIntensity: number;
  ambientColor: THREE.Color;
  ambientIntensity: number;
  groundColor: THREE.Color;
  skyTop: THREE.Color;
  skyHorizon: THREE.Color;
  fogColor: THREE.Color;
  fogNear: number;
  fogFar: number;
  /** Color del agua, que también cambia con la luz. */
  waterTint: THREE.Color;
}

const KEYFRAMES: Array<{
  h: number;
  skyTop: number;
  skyHorizon: number;
  sun: number;
  sunI: number;
  amb: number;
  ambI: number;
  ground: number;
  water: number;
}> = [
  { h: 0, skyTop: 0x080d1c, skyHorizon: 0x141d33, sun: 0x2a3d66, sunI: 0.1, amb: 0x1b2740, ambI: 0.34, ground: 0x151c26, water: 0x0d1826 },
  { h: 5, skyTop: 0x16233f, skyHorizon: 0x3d3350, sun: 0x6b5a80, sunI: 0.18, amb: 0x2b3450, ambI: 0.4, ground: 0x232a33, water: 0x18293c },
  { h: 6.6, skyTop: 0x3d6390, skyHorizon: 0xe0906a, sun: 0xffb079, sunI: 1.1, amb: 0x6d7fa0, ambI: 0.5, ground: 0x4a4438, water: 0x40607c },
  { h: 9, skyTop: 0x5b93c9, skyHorizon: 0xb9d4e6, sun: 0xfff0d6, sunI: 2.1, amb: 0x9fbcd8, ambI: 0.58, ground: 0x59634a, water: 0x33769b },
  { h: 13, skyTop: 0x4b8ed0, skyHorizon: 0xc3dced, sun: 0xfffaf0, sunI: 2.5, amb: 0xaecbe4, ambI: 0.62, ground: 0x5e6a4d, water: 0x2f7ea8 },
  { h: 17, skyTop: 0x5590c8, skyHorizon: 0xd0d6dd, sun: 0xffeecb, sunI: 2.0, amb: 0xa6c0d6, ambI: 0.56, ground: 0x5b6448, water: 0x33769b },
  { h: 19.4, skyTop: 0x2f4a7a, skyHorizon: 0xe8834f, sun: 0xff9a5c, sunI: 1.0, amb: 0x6d6a86, ambI: 0.48, ground: 0x453c34, water: 0x3d5570 },
  { h: 21, skyTop: 0x121c36, skyHorizon: 0x2e2c4a, sun: 0x3d4a72, sunI: 0.2, amb: 0x252f4a, ambI: 0.38, ground: 0x1c222c, water: 0x152238 },
  { h: 24, skyTop: 0x080d1c, skyHorizon: 0x141d33, sun: 0x2a3d66, sunI: 0.1, amb: 0x1b2740, ambI: 0.34, ground: 0x151c26, water: 0x0d1826 },
];

const cA = new THREE.Color();
const cB = new THREE.Color();

function mixHex(a: number, b: number, t: number, out: THREE.Color): THREE.Color {
  cA.setHex(a, THREE.SRGBColorSpace);
  cB.setHex(b, THREE.SRGBColorSpace);
  return out.copy(cA).lerp(cB, t);
}

const state: SkyState = {
  daylight: 1,
  night: 0,
  sunDir: new THREE.Vector3(),
  sunColor: new THREE.Color(),
  sunIntensity: 2,
  ambientColor: new THREE.Color(),
  ambientIntensity: 0.6,
  groundColor: new THREE.Color(),
  skyTop: new THREE.Color(),
  skyHorizon: new THREE.Color(),
  fogColor: new THREE.Color(),
  fogNear: 60,
  fogFar: 190,
  waterTint: new THREE.Color(),
};

/**
 * Estado de cielo e iluminación para una hora del día del simulador.
 *
 * Interpola una curva de keyframes (amanecer cálido, mediodía frío, atardecer naranja, noche
 * azul). El sol describe un arco real y su altura decide la mezcla día/noche que encienden las
 * ventanas y las farolas.
 */
export function skyFor(hour: number): SkyState {
  const h = ((hour % 24) + 24) % 24;
  let i = 0;
  while (i < KEYFRAMES.length - 2 && KEYFRAMES[i + 1]!.h <= h) i++;
  const a = KEYFRAMES[i]!;
  const b = KEYFRAMES[i + 1]!;
  const t = (h - a.h) / Math.max(0.001, b.h - a.h);

  mixHex(a.skyTop, b.skyTop, t, state.skyTop);
  mixHex(a.skyHorizon, b.skyHorizon, t, state.skyHorizon);
  mixHex(a.sun, b.sun, t, state.sunColor);
  mixHex(a.amb, b.amb, t, state.ambientColor);
  mixHex(a.ground, b.ground, t, state.groundColor);
  mixHex(a.water, b.water, t, state.waterTint);
  state.sunIntensity = a.sunI + (b.sunI - a.sunI) * t;
  state.ambientIntensity = a.ambI + (b.ambI - a.ambI) * t;

  // Arco solar: sale a las 6:15, se pone a las 19:45.
  const dayT = (h - 6.25) / 13.5;
  const elev = Math.sin(Math.PI * Math.min(1, Math.max(0, dayT)));
  const azim = (h / 24) * Math.PI * 2 - Math.PI * 0.5;
  const above = h > 6.25 && h < 19.75;
  const y = above ? 0.12 + elev * 0.95 : -0.25;
  state.sunDir.set(Math.cos(azim) * 0.9, y, Math.sin(azim) * 0.55).normalize();

  state.daylight = Math.max(0, Math.min(1, above ? 0.25 + elev * 0.85 : 0));
  state.night = Math.max(0, Math.min(1, 1 - state.daylight * 1.35));

  state.fogColor.copy(state.skyHorizon);
  state.fogNear = 70 - state.night * 18;
  state.fogFar = 230 - state.night * 70;
  return state;
}

/** Hora legible para el HUD. */
export function formatHour(hour: number): string {
  const h = Math.floor(hour) % 24;
  const m = Math.floor((hour - Math.floor(hour)) * 60);
  return `${String(h).padStart(2, "0")}:${String(Math.floor(m / 15) * 15).padStart(2, "0")}`;
}
