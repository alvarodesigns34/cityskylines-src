import * as THREE from "three";

export interface SkyState {
  /** 0 = noche cerrada, 1 = pleno día. */
  daylight: number;
  /** 0 = día, 1 = noche (para ventanas y farolas). */
  night: number;
  sunDir: THREE.Vector3;
  sunColor: THREE.Color;
  sunIntensity: number;
  moonDir: THREE.Vector3;
  moonColor: THREE.Color;
  moonIntensity: number;
  ambientColor: THREE.Color;
  ambientIntensity: number;
  groundColor: THREE.Color;
  skyTop: THREE.Color;
  skyHorizon: THREE.Color;
  fogColor: THREE.Color;
  fogNear: number;
  fogFar: number;
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
  // Noche azulada, no un pozo negro: se tiene que leer el relieve y las farolas.
  { h: 0, skyTop: 0x1c2c4e, skyHorizon: 0x3a4c6e, sun: 0xc5d4ee, sunI: 0.72, amb: 0x6a7ca0, ambI: 0.92, ground: 0x3a4556, water: 0x243a52 },
  { h: 5, skyTop: 0x243658, skyHorizon: 0x5a4e72, sun: 0xb8a8d0, sunI: 0.78, amb: 0x6e7898, ambI: 0.9, ground: 0x3e4854, water: 0x2c4258 },
  { h: 6.6, skyTop: 0x3d6390, skyHorizon: 0xe0a184, sun: 0xffc9a0, sunI: 0.95, amb: 0x7d8fae, ambI: 0.68, ground: 0x4a4c46, water: 0x40607c },
  { h: 9, skyTop: 0x5b93c9, skyHorizon: 0xb9d4e6, sun: 0xfff0d6, sunI: 2.15, amb: 0x9fbcd8, ambI: 0.6, ground: 0x59634a, water: 0x33769b },
  { h: 13, skyTop: 0x4b8ed0, skyHorizon: 0xc3dced, sun: 0xfffaf0, sunI: 2.55, amb: 0xaecbe4, ambI: 0.64, ground: 0x5e6a4d, water: 0x2f7ea8 },
  { h: 17, skyTop: 0x5590c8, skyHorizon: 0xd0d6dd, sun: 0xffeecb, sunI: 2.05, amb: 0xa6c0d6, ambI: 0.58, ground: 0x5b6448, water: 0x33769b },
  { h: 19.4, skyTop: 0x3a5a88, skyHorizon: 0xe89a70, sun: 0xffbb92, sunI: 0.88, amb: 0x8490ae, ambI: 0.7, ground: 0x4a4e52, water: 0x3d5570 },
  { h: 21, skyTop: 0x223050, skyHorizon: 0x45506c, sun: 0xa8bbe0, sunI: 0.74, amb: 0x657494, ambI: 0.9, ground: 0x384250, water: 0x263848 },
  { h: 24, skyTop: 0x1c2c4e, skyHorizon: 0x3a4c6e, sun: 0xc5d4ee, sunI: 0.72, amb: 0x6a7ca0, ambI: 0.92, ground: 0x3a4556, water: 0x243a52 },
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
  moonDir: new THREE.Vector3(0.3, 0.7, -0.4),
  moonColor: new THREE.Color(0xd4e2f5),
  moonIntensity: 0,
  ambientColor: new THREE.Color(),
  ambientIntensity: 0.6,
  groundColor: new THREE.Color(),
  skyTop: new THREE.Color(),
  skyHorizon: new THREE.Color(),
  fogColor: new THREE.Color(),
  fogNear: 70,
  fogFar: 230,
  waterTint: new THREE.Color(),
};

/**
 * Estado de cielo e iluminación para una hora del día del simulador.
 *
 * De noche la luz principal pasa a ser la luna (Y positiva): si se dejaba el sol bajo el
 * horizonte, toda la ciudad se pintaba casi negra.
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

  const dayT = (h - 6.25) / 13.5;
  const elev = Math.sin(Math.PI * Math.min(1, Math.max(0, dayT)));
  const azim = (h / 24) * Math.PI * 2 - Math.PI * 0.5;
  const above = h > 6.25 && h < 19.75;
  const y = above ? 0.12 + elev * 0.95 : -0.25;
  state.sunDir.set(Math.cos(azim) * 0.9, y, Math.sin(azim) * 0.55).normalize();

  state.daylight = Math.max(0, Math.min(1, above ? 0.25 + elev * 0.85 : 0));
  state.night = Math.max(0, Math.min(1, 1 - state.daylight * 1.35));

  // Luna al otro lado del cielo, siempre por encima del horizonte.
  const maz = azim + Math.PI;
  state.moonDir.set(Math.cos(maz) * 0.75, 0.38 + state.night * 0.28, Math.sin(maz) * 0.5).normalize();
  state.moonColor.setHex(0xd8e6f8, THREE.SRGBColorSpace);
  state.moonIntensity = 0.15 + state.night * 0.7;

  state.fogColor.copy(state.skyHorizon);
  state.fogNear = 78 - state.night * 8;
  state.fogFar = 250 - state.night * 40;
  return state;
}

/** Hora legible para el HUD. Con el día lento, el minuto de 5 en 5 se lee. */
export function formatHour(hour: number): string {
  const h = Math.floor(hour) % 24;
  const m = Math.floor((hour - Math.floor(hour)) * 60);
  return `${String(h).padStart(2, "0")}:${String(Math.floor(m / 5) * 5).padStart(2, "0")}`;
}
