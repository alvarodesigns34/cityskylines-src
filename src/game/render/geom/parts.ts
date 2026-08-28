import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export type PartShape = "box" | "cyl" | "cone" | "gable" | "hip" | "sphere" | "torus";

export interface Part {
  g: PartShape;
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  color: number;
  /** Rotación en radianes. */
  ry?: number;
  rx?: number;
  rz?: number;
  /** 0..1 · cuánto se ilumina de noche (ventanas, farolas, faros). */
  emis?: number;
  /** Segmentos para cilindros y conos. */
  seg?: number;
}

export function box(
  x: number, y: number, z: number,
  sx: number, sy: number, sz: number,
  color: number, extra: Partial<Part> = {},
): Part {
  return { g: "box", x, y, z, sx, sy, sz, color, ...extra };
}

export function cyl(
  x: number, y: number, z: number,
  r: number, h: number, color: number, extra: Partial<Part> = {},
): Part {
  return { g: "cyl", x, y, z, sx: r, sy: h, sz: r, color, seg: 8, ...extra };
}

/** Prisma triangular: tejado a dos aguas. `ry` gira la cumbrera. */
function gableGeometry(sx: number, sy: number, sz: number): THREE.BufferGeometry {
  const hx = sx / 2;
  const hz = sz / 2;
  const verts = new Float32Array([
    // frente
    -hx, 0, hz, hx, 0, hz, 0, sy, hz,
    // trasera
    hx, 0, -hz, -hx, 0, -hz, 0, sy, -hz,
    // faldón izquierdo
    -hx, 0, -hz, 0, sy, -hz, 0, sy, hz,
    -hx, 0, -hz, 0, sy, hz, -hx, 0, hz,
    // faldón derecho
    hx, 0, hz, 0, sy, hz, 0, sy, -hz,
    hx, 0, hz, 0, sy, -hz, hx, 0, -hz,
    // base
    -hx, 0, -hz, -hx, 0, hz, hx, 0, hz,
    -hx, 0, -hz, hx, 0, hz, hx, 0, -hz,
  ]);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(verts, 3));
  g.computeVertexNormals();
  return g;
}

/** Tejado a cuatro aguas. */
function hipGeometry(sx: number, sy: number, sz: number): THREE.BufferGeometry {
  const hx = sx / 2;
  const hz = sz / 2;
  const rx = hx * 0.28;
  const v: number[] = [];
  const A = [-hx, 0, -hz];
  const B = [hx, 0, -hz];
  const C = [hx, 0, hz];
  const D = [-hx, 0, hz];
  const R1 = [-rx, sy, 0];
  const R2 = [rx, sy, 0];
  const push = (...pts: number[][]) => pts.forEach((p) => v.push(p[0]!, p[1]!, p[2]!));
  push(D, C, R2);
  push(D, R2, R1);
  push(B, A, R1);
  push(B, R1, R2);
  push(A, D, R1);
  push(C, B, R2);
  push(A, B, C);
  push(A, C, D);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

const _color = new THREE.Color();

/**
 * Funde una lista de piezas en una única geometría con atributos `color` y `aEmis`.
 *
 * `aEmis` viaja hasta el material de ciudad, que de noche enciende exactamente esos vértices
 * (ventanas, farolas, faros). Así una torre iluminada no necesita una segunda malla.
 */
export function mergeParts(parts: Part[]): THREE.BufferGeometry {
  const geos: THREE.BufferGeometry[] = [];
  for (const p of parts) {
    let g: THREE.BufferGeometry;
    switch (p.g) {
      case "cyl":
        g = new THREE.CylinderGeometry(p.sx, p.sz, p.sy, p.seg ?? 8, 1);
        break;
      case "cone":
        g = new THREE.ConeGeometry(p.sx, p.sy, p.seg ?? 7);
        break;
      case "sphere":
        g = new THREE.SphereGeometry(p.sx, p.seg ?? 8, (p.seg ?? 8) >> 1);
        break;
      case "torus":
        g = new THREE.TorusGeometry(p.sx, p.sy, 6, p.seg ?? 10);
        break;
      case "gable":
        g = gableGeometry(p.sx, p.sy, p.sz);
        break;
      case "hip":
        g = hipGeometry(p.sx, p.sy, p.sz);
        break;
      default:
        g = new THREE.BoxGeometry(p.sx, p.sy, p.sz);
    }
    if (p.rx) g.rotateX(p.rx);
    if (p.ry) g.rotateY(p.ry);
    if (p.rz) g.rotateZ(p.rz);
    g.translate(p.x, p.y, p.z);

    const n = g.getAttribute("position").count;
    const col = new Float32Array(n * 3);
    const emis = new Float32Array(n);
    _color.setHex(p.color, THREE.SRGBColorSpace);
    const e = p.emis ?? 0;
    for (let i = 0; i < n; i++) {
      col[i * 3] = _color.r;
      col[i * 3 + 1] = _color.g;
      col[i * 3 + 2] = _color.b;
      emis[i] = e;
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.setAttribute("aEmis", new THREE.BufferAttribute(emis, 1));
    if (g.index) g.deleteAttribute("uv");
    else g.deleteAttribute("uv");
    geos.push(g.index ? g.toNonIndexed() : g);
  }
  const merged = mergeGeometries(geos, false);
  geos.forEach((g) => g.dispose());
  if (!merged) return new THREE.BoxGeometry(0.4, 0.4, 0.4);
  merged.computeVertexNormals();
  merged.computeBoundingSphere();
  return merged;
}

/** Mezcla un color hacia blanco/negro; para variantes de una misma paleta. */
export function shade(hex: number, amount: number): number {
  _color.setHex(hex, THREE.SRGBColorSpace);
  _color.offsetHSL(0, 0, amount);
  return _color.getHex(THREE.SRGBColorSpace);
}

export function tintHue(hex: number, hue: number, sat = 0): number {
  _color.setHex(hex, THREE.SRGBColorSpace);
  _color.offsetHSL(hue, sat, 0);
  return _color.getHex(THREE.SRGBColorSpace);
}
