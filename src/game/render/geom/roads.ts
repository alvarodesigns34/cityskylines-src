import * as THREE from "three";
import { ROADS } from "../../sim/catalog";
import { ASPHALT, ASPHALT_WORN, CURB, MARKING, MARKING_WARM, SIDEWALK } from "../palettes";
import { box, mergeParts, type Part } from "./parts";

/** Bits de conectividad: 1 = +x, 2 = −x, 4 = +z, 8 = −z. */
export const DIR_BITS = [1, 2, 4, 8] as const;
export const DIR_VEC: Array<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const cache = new Map<string, THREE.BufferGeometry>();

/**
 * Geometría de una casilla de calzada según su clase y sus conexiones.
 *
 * En vez de una losa negra por casilla, cada combinación (clase, máscara de vecinos) genera
 * asfalto + bordillo + acera + marcas viales. Son 3×16 geometrías como mucho, cacheadas y
 * dibujadas con instancing: el coste no crece con el tamaño de la ciudad.
 */
export function roadGeometry(cls: number, mask: number): THREE.BufferGeometry {
  const key = `${cls}:${mask}`;
  let g = cache.get(key);
  if (g) return g;

  const def = ROADS[cls] ?? ROADS[1]!;
  const w = def.width;
  const half = w / 2;
  const band = (1 - w) / 2;
  const y = 0;
  const th = 0.08;
  const out: Part[] = [];

  // Calzada: cuadrado central + un brazo por cada conexión.
  out.push(box(0, y, 0, w, th, w, ASPHALT));
  for (let d = 0; d < 4; d++) {
    if (!(mask & DIR_BITS[d]!)) continue;
    const [dx, dz] = DIR_VEC[d]!;
    const len = 0.5 - half;
    const cx = dx * (half + len / 2);
    const cz = dz * (half + len / 2);
    out.push(box(cx, y, cz, dx ? len : w, th, dz ? len : w, ASPHALT));
  }

  // Aceras y bordillos en los lados sin salida.
  for (let d = 0; d < 4; d++) {
    if (mask & DIR_BITS[d]!) continue;
    const [dx, dz] = DIR_VEC[d]!;
    const cx = dx * (half + band / 2);
    const cz = dz * (half + band / 2);
    const sx = dx ? band : 1;
    const sz = dz ? band : 1;
    out.push(box(cx, y + 0.035, cz, sx, th, sz, SIDEWALK));
    // Bordillo: filo hacia la calzada.
    const bx = dx * (half + 0.02);
    const bz = dz * (half + 0.02);
    out.push(box(bx, y + 0.045, bz, dx ? 0.05 : 1, th, dz ? 0.05 : 1, CURB));
  }

  // Marcas viales.
  const links = DIR_BITS.filter((b) => mask & b).length;
  const markY = y + th / 2 + 0.002;
  const markColor = cls >= 3 ? MARKING_WARM : MARKING;
  if (links <= 2) {
    for (let d = 0; d < 4; d++) {
      if (!(mask & DIR_BITS[d]!)) continue;
      const [dx, dz] = DIR_VEC[d]!;
      if (cls === 1) {
        // Calle: eje discontinuo.
        for (let k = 0; k < 2; k++) {
          const t = 0.14 + k * 0.22;
          out.push(box(dx * t, markY, dz * t, dx ? 0.14 : 0.035, 0.01, dz ? 0.14 : 0.035, markColor));
        }
      } else {
        // Avenida y autopista: doble línea continua.
        const len = 0.5;
        for (const s of [-1, 1]) {
          out.push(
            box(
              dx * (len / 2) + (dz ? s * 0.035 : 0),
              markY,
              dz * (len / 2) + (dx ? s * 0.035 : 0),
              dx ? len : 0.035,
              0.01,
              dz ? len : 0.035,
              markColor,
            ),
          );
        }
        // Líneas de borde.
        for (const s of [-1, 1]) {
          out.push(
            box(
              dx * (len / 2) + (dz ? s * (half - 0.05) : 0),
              markY,
              dz * (len / 2) + (dx ? s * (half - 0.05) : 0),
              dx ? len : 0.03,
              0.01,
              dz ? len : 0.03,
              MARKING,
            ),
          );
        }
      }
    }
  } else {
    // Cruce: pasos de peatones en cada boca.
    for (let d = 0; d < 4; d++) {
      if (!(mask & DIR_BITS[d]!)) continue;
      const [dx, dz] = DIR_VEC[d]!;
      const stripes = 4;
      for (let k = 0; k < stripes; k++) {
        const u = -half * 0.7 + ((half * 1.4) / (stripes - 1)) * k;
        const px = dx ? dx * (half + 0.07) : u;
        const pz = dz ? dz * (half + 0.07) : u;
        out.push(box(px, markY, pz, dx ? 0.1 : 0.06, 0.01, dz ? 0.1 : 0.06, MARKING));
      }
    }
    out.push(box(0, y + th / 2 - 0.004, 0, w * 0.94, 0.01, w * 0.94, ASPHALT_WORN));
  }

  g = mergeParts(out);
  cache.set(key, g);
  return g;
}

/** Puente: tablero elevado con pilas y barandilla. */
export function bridgeGeometry(cls: number, mask: number): THREE.BufferGeometry {
  const key = `bridge:${cls}:${mask}`;
  let g = cache.get(key);
  if (g) return g;
  const def = ROADS[cls] ?? ROADS[1]!;
  const w = def.width;
  const half = w / 2;
  const out: Part[] = [];
  out.push(box(0, 0, 0, w + 0.06, 0.12, w + 0.06, 0xb9b3a6));
  for (let d = 0; d < 4; d++) {
    if (!(mask & DIR_BITS[d]!)) continue;
    const [dx, dz] = DIR_VEC[d]!;
    const len = 0.5 - half;
    out.push(box(dx * (half + len / 2), 0, dz * (half + len / 2), dx ? len : w + 0.06, 0.12, dz ? len : w + 0.06, 0xb9b3a6));
  }
  out.push(box(0, 0.0, 0, w * 0.92, 0.14, w * 0.92, ASPHALT));
  // Barandillas en los lados abiertos.
  for (let d = 0; d < 4; d++) {
    if (mask & DIR_BITS[d]!) continue;
    const [dx, dz] = DIR_VEC[d]!;
    out.push(box(dx * (half + 0.03), 0.16, dz * (half + 0.03), dx ? 0.05 : 1, 0.22, dz ? 0.05 : 1, 0xd2ccbe));
  }
  // Pilas hasta el agua.
  for (const s of [-1, 1]) {
    out.push(box(s * half * 0.7, -0.5, 0, 0.14, 1.0, 0.14, 0xa8a294));
  }
  g = mergeParts(out);
  cache.set(key, g);
  return g;
}

export function disposeRoadGeometries() {
  for (const g of cache.values()) g.dispose();
  cache.clear();
}
