import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { BuildingKind } from "../sim/types";

export type Part = {
  g: "box" | "cyl" | "cone";
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  color: number;
  ry?: number;
  rx?: number;
};

function tint(hex: number, v: number): number {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, (v - 0.5) * 0.08);
  return c.getHex();
}

export function partsFor(kind: BuildingKind, variant: number): Part[] {
  const v = variant % 4;
  switch (kind) {
    case "house":
      return house(v);
    case "apartments":
      return apartments(v);
    case "tower":
      return tower(v);
    case "shop":
      return shop(v);
    case "market":
      return market(v);
    case "office":
      return office(v);
    case "warehouse":
      return warehouse(v);
    case "factory":
      return factory(v);
    case "works":
      return works(v);
    case "power":
      return powerPlant();
    case "water-tower":
      return waterTower();
    case "park":
      return park();
  }
}

function house(v: number): Part[] {
  const wall = tint([0xe7d5bc, 0xf0e6d8, 0xd9c3a6, 0xe4d0c4][v]!, v);
  const roof = [0xa33b32, 0x6e4a38, 0x4d5d6c, 0x8a3e2f][v]!;
  const h = 0.42 + (v % 2) * 0.06;
  return [
    { g: "box", x: 0, y: h / 2, z: 0, sx: 0.72, sy: h, sz: 0.62, color: wall },
    { g: "box", x: 0, y: h + 0.16, z: 0, sx: 0.84, sy: 0.18, sz: 0.74, color: roof },
    { g: "box", x: 0.22, y: h + 0.28, z: -0.1, sx: 0.1, sy: 0.22, sz: 0.1, color: 0x8a7564 },
    { g: "box", x: 0, y: 0.16, z: 0.32, sx: 0.12, sy: 0.22, sz: 0.04, color: 0x5b4032 },
    { g: "box", x: -0.18, y: 0.26, z: 0.32, sx: 0.16, sy: 0.14, sz: 0.03, color: 0x8fd0e8 },
  ];
}

function apartments(v: number): Part[] {
  const wall = tint([0xcfc6bb, 0xb9c3c8, 0xd8cbb8, 0x9aa7a3][v]!, v);
  const h = 1.15;
  const parts: Part[] = [
    { g: "box", x: 0, y: h / 2, z: 0, sx: 0.84, sy: h, sz: 0.74, color: wall },
    { g: "box", x: 0, y: h + 0.04, z: 0, sx: 0.88, sy: 0.08, sz: 0.78, color: 0x5c5550 },
  ];
  for (let i = 0; i < 3; i++) {
    parts.push({
      g: "box",
      x: 0,
      y: 0.28 + i * 0.32,
      z: 0.38,
      sx: 0.7,
      sy: 0.12,
      sz: 0.04,
      color: 0x7ec8e0,
    });
  }
  return parts;
}

function tower(v: number): Part[] {
  const wall = tint([0xdde4ea, 0xcfd5dc, 0xe8e2d8, 0xb9c6d0][v]!, v);
  const h = 2.35 + v * 0.15;
  return [
    { g: "box", x: 0, y: h / 2, z: 0, sx: 0.72, sy: h, sz: 0.72, color: wall },
    { g: "box", x: 0, y: h * 0.55, z: 0.37, sx: 0.58, sy: h * 0.7, sz: 0.05, color: 0x8fd4ea },
    { g: "box", x: 0, y: h + 0.18, z: 0, sx: 0.5, sy: 0.36, sz: 0.5, color: tint(wall, 0.7) },
    { g: "cyl", x: 0, y: h + 0.5, z: 0, sx: 0.03, sy: 0.28, sz: 0.03, color: 0x888 },
  ];
}

function shop(v: number): Part[] {
  const wall = tint([0xefeee8, 0xe6dcc8, 0xdfe7ea, 0xf2ebe0][v]!, v);
  const accent = [0x3d7ec4, 0x2f9e8f, 0xc45b4a, 0xc48a3a][v]!;
  return [
    { g: "box", x: 0, y: 0.28, z: 0, sx: 0.86, sy: 0.56, sz: 0.7, color: wall },
    { g: "box", x: 0, y: 0.62, z: 0.2, sx: 0.92, sy: 0.08, sz: 0.5, color: accent },
    { g: "box", x: 0, y: 0.3, z: 0.36, sx: 0.7, sy: 0.22, sz: 0.04, color: 0x7ec8e0 },
    { g: "box", x: 0, y: 0.62, z: 0, sx: 0.9, sy: 0.1, sz: 0.74, color: 0x6a655c },
  ];
}

function market(v: number): Part[] {
  const wall = tint(0xe7e2d6, v);
  return [
    { g: "box", x: 0, y: 0.45, z: 0, sx: 0.9, sy: 0.9, sz: 0.78, color: wall },
    { g: "box", x: 0, y: 0.96, z: 0, sx: 0.96, sy: 0.12, sz: 0.84, color: 0x3d7ec4 },
    { g: "box", x: 0, y: 0.38, z: 0.4, sx: 0.78, sy: 0.28, sz: 0.05, color: 0x9ad2e8 },
    { g: "box", x: 0, y: 1.12, z: 0, sx: 0.4, sy: 0.2, sz: 0.4, color: 0xd8d2c6 },
  ];
}

function office(v: number): Part[] {
  const wall = tint(0xd5dee6, v);
  const h = 2.1;
  return [
    { g: "box", x: 0, y: h / 2, z: 0, sx: 0.8, sy: h, sz: 0.76, color: wall },
    { g: "box", x: 0.41, y: h / 2, z: 0, sx: 0.05, sy: h * 0.88, sz: 0.62, color: 0x8fd0e6 },
    { g: "box", x: 0, y: h / 2, z: 0.39, sx: 0.62, sy: h * 0.88, sz: 0.05, color: 0x8fd0e6 },
    { g: "box", x: 0, y: h + 0.08, z: 0, sx: 0.84, sy: 0.1, sz: 0.8, color: 0x4a5560 },
  ];
}

function warehouse(v: number): Part[] {
  const wall = tint(0xb7a48a, v);
  return [
    { g: "box", x: 0, y: 0.32, z: 0, sx: 0.9, sy: 0.64, sz: 0.78, color: wall },
    { g: "box", x: 0, y: 0.7, z: 0, sx: 0.94, sy: 0.1, sz: 0.82, color: 0x6d5b45 },
    { g: "box", x: 0.28, y: 0.22, z: 0.4, sx: 0.22, sy: 0.28, sz: 0.04, color: 0x4a4036 },
  ];
}

function factory(v: number): Part[] {
  const wall = tint(0x9a8b78, v);
  return [
    { g: "box", x: -0.08, y: 0.38, z: 0, sx: 0.7, sy: 0.76, sz: 0.7, color: wall },
    { g: "cyl", x: 0.32, y: 0.55, z: 0.1, sx: 0.16, sy: 1.1, sz: 0.16, color: 0x6a6258 },
    { g: "box", x: 0.1, y: 0.18, z: 0.28, sx: 0.4, sy: 0.28, sz: 0.3, color: tint(wall, 0.4) },
  ];
}

function works(v: number): Part[] {
  const wall = tint(0x8a7b68, v);
  return [
    { g: "box", x: 0, y: 0.48, z: 0, sx: 0.88, sy: 0.96, sz: 0.78, color: wall },
    { g: "cyl", x: -0.22, y: 1.15, z: 0.1, sx: 0.1, sy: 0.7, sz: 0.1, color: 0x5c564c },
    { g: "cyl", x: 0.18, y: 1.05, z: -0.12, sx: 0.12, sy: 0.55, sz: 0.12, color: 0x5c564c },
    { g: "cyl", x: 0.28, y: 0.28, z: 0.22, sx: 0.16, sy: 0.4, sz: 0.16, color: 0x6a8a9a },
  ];
}

function powerPlant(): Part[] {
  return [
    { g: "box", x: -0.35, y: 0.28, z: 0, sx: 0.9, sy: 0.56, sz: 1.4, color: 0x8d8578 },
    { g: "cyl", x: 0.45, y: 0.7, z: -0.35, sx: 0.32, sy: 1.2, sz: 0.32, color: 0xc9c2b6 },
    { g: "cyl", x: 0.45, y: 0.7, z: 0.35, sx: 0.32, sy: 1.2, sz: 0.32, color: 0xc9c2b6 },
    { g: "box", x: -0.15, y: 0.62, z: 0, sx: 0.5, sy: 0.16, sz: 0.7, color: 0x5c5550 },
    { g: "cyl", x: -0.55, y: 0.85, z: 0.4, sx: 0.08, sy: 0.7, sz: 0.08, color: 0x4a453e },
  ];
}

function waterTower(): Part[] {
  return [
    { g: "cyl", x: 0, y: 0.35, z: 0, sx: 0.08, sy: 0.7, sz: 0.08, color: 0x8a9096 },
    { g: "cyl", x: 0, y: 0.85, z: 0, sx: 0.28, sy: 0.38, sz: 0.28, color: 0x6a9bb0 },
    { g: "cone", x: 0, y: 1.12, z: 0, sx: 0.3, sy: 0.16, sz: 0.3, color: 0x4d6670 },
  ];
}

function park(): Part[] {
  return [
    { g: "box", x: 0, y: 0.03, z: 0, sx: 0.92, sy: 0.05, sz: 0.92, color: 0x3d8a58 },
    { g: "box", x: 0, y: 0.05, z: 0, sx: 0.22, sy: 0.03, sz: 0.92, color: 0xc4b496 },
    { g: "box", x: -0.28, y: 0.08, z: 0.22, sx: 0.18, sy: 0.06, sz: 0.08, color: 0x6b5344 },
    { g: "cone", x: 0.26, y: 0.38, z: -0.18, sx: 0.18, sy: 0.42, sz: 0.18, color: 0x2f7a48 },
    { g: "cone", x: -0.22, y: 0.32, z: -0.26, sx: 0.14, sy: 0.34, sz: 0.14, color: 0x3a8a52 },
  ];
}

export function mergeParts(parts: Part[]): THREE.BufferGeometry {
  const geos: THREE.BufferGeometry[] = [];
  for (const p of parts) {
    let g: THREE.BufferGeometry;
    if (p.g === "box") g = new THREE.BoxGeometry(p.sx, p.sy, p.sz);
    else if (p.g === "cyl") g = new THREE.CylinderGeometry(p.sx, p.sx * 0.92, p.sy, 8);
    else g = new THREE.ConeGeometry(p.sx, p.sy, 8);
    if (p.rx) g.rotateX(p.rx);
    if (p.ry) g.rotateY(p.ry);
    g.translate(p.x, p.y, p.z);
    const n = g.getAttribute("position")!.count;
    const col = new Float32Array(n * 3);
    const c = new THREE.Color(p.color);
    for (let i = 0; i < n; i++) {
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    geos.push(g);
  }
  const merged = mergeGeometries(geos, false);
  geos.forEach((g) => g.dispose());
  if (!merged) return new THREE.BoxGeometry(0.6, 0.6, 0.6);
  merged.computeVertexNormals();
  return merged;
}

const cache = new Map<string, THREE.BufferGeometry>();

export function geometryFor(kind: BuildingKind, variant: number): THREE.BufferGeometry {
  const key = `${kind}:${variant % 4}`;
  let g = cache.get(key);
  if (!g) {
    g = mergeParts(partsFor(kind, variant));
    cache.set(key, g);
  }
  return g;
}

export function disposeGeometries() {
  for (const g of cache.values()) g.dispose();
  cache.clear();
}
