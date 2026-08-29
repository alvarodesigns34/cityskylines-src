import * as THREE from "three";
import { box, cyl, mergeParts, type Part } from "./parts";

const cache = new Map<string, THREE.BufferGeometry>();

function memo(key: string, make: () => Part[]): THREE.BufferGeometry {
  let g = cache.get(key);
  if (!g) {
    g = mergeParts(make());
    cache.set(key, g);
  }
  return g;
}

/** Cinco especies: frondoso, conífera, matorral, abedul y olivo. Copas más densas. */
export function treeGeometry(species: 0 | 1 | 2 | 3 | 4): THREE.BufferGeometry {
  return memo(`tree${species}`, () => {
    const out: Part[] = [];
    if (species === 0) {
      out.push(cyl(0, 0.2, 0, 0.048, 0.4, 0x6b5344, { seg: 6 }));
      out.push({ g: "sphere", x: 0, y: 0.58, z: 0, sx: 0.28, sy: 0, sz: 0, color: 0x2f6e38, seg: 8 });
      out.push({ g: "sphere", x: 0.14, y: 0.46, z: 0.1, sx: 0.18, sy: 0, sz: 0, color: 0x3d8244, seg: 7 });
      out.push({ g: "sphere", x: -0.13, y: 0.5, z: -0.09, sx: 0.16, sy: 0, sz: 0, color: 0x276332, seg: 7 });
      out.push({ g: "sphere", x: 0.06, y: 0.7, z: -0.08, sx: 0.14, sy: 0, sz: 0, color: 0x45884a, seg: 6 });
      out.push({ g: "sphere", x: -0.08, y: 0.38, z: 0.12, sx: 0.13, sy: 0, sz: 0, color: 0x356f3c, seg: 6 });
    } else if (species === 1) {
      out.push(cyl(0, 0.16, 0, 0.042, 0.32, 0x5c463a, { seg: 6 }));
      out.push({ g: "cone", x: 0, y: 0.38, z: 0, sx: 0.26, sy: 0.4, sz: 0.26, color: 0x245834, seg: 8 });
      out.push({ g: "cone", x: 0, y: 0.58, z: 0, sx: 0.2, sy: 0.36, sz: 0.2, color: 0x2d6a3c, seg: 8 });
      out.push({ g: "cone", x: 0, y: 0.78, z: 0, sx: 0.13, sy: 0.3, sz: 0.13, color: 0x347544, seg: 7 });
    } else if (species === 2) {
      out.push(cyl(0, 0.09, 0, 0.032, 0.18, 0x6b5344, { seg: 5 }));
      out.push({ g: "sphere", x: 0, y: 0.26, z: 0, sx: 0.2, sy: 0, sz: 0, color: 0x4a7838, seg: 7 });
      out.push({ g: "sphere", x: 0.1, y: 0.2, z: 0.07, sx: 0.13, sy: 0, sz: 0, color: 0x5a8840, seg: 6 });
      out.push({ g: "sphere", x: -0.08, y: 0.18, z: -0.06, sx: 0.11, sy: 0, sz: 0, color: 0x3f6c30, seg: 5 });
    } else if (species === 3) {
      out.push(cyl(0, 0.26, 0, 0.034, 0.52, 0xe8e2d4, { seg: 6 }));
      out.push(cyl(0, 0.18, 0, 0.038, 0.08, 0x2a2a28, { seg: 6 }));
      out.push({ g: "sphere", x: 0.04, y: 0.66, z: 0, sx: 0.2, sy: 0, sz: 0, color: 0x4e9240, seg: 7 });
      out.push({ g: "sphere", x: -0.1, y: 0.56, z: 0.06, sx: 0.14, sy: 0, sz: 0, color: 0x62a84c, seg: 6 });
      out.push({ g: "sphere", x: 0.09, y: 0.76, z: -0.05, sx: 0.12, sy: 0, sz: 0, color: 0x447c38, seg: 6 });
    } else {
      out.push(cyl(0.02, 0.14, 0, 0.04, 0.26, 0x6a5a48, { seg: 6 }));
      out.push({ g: "sphere", x: 0, y: 0.36, z: 0, sx: 0.24, sy: 0, sz: 0, color: 0x628046, seg: 7 });
      out.push({ g: "sphere", x: 0.12, y: 0.3, z: 0.07, sx: 0.15, sy: 0, sz: 0, color: 0x749454, seg: 6 });
      out.push({ g: "sphere", x: -0.1, y: 0.28, z: -0.06, sx: 0.13, sy: 0, sz: 0, color: 0x547238, seg: 6 });
      out.push({ g: "sphere", x: 0.02, y: 0.22, z: 0.1, sx: 0.1, sy: 0, sz: 0, color: 0x6a8a48, seg: 5 });
    }
    return out;
  });
}

/** Mechón de hierba: tres hojas para prados cerca de la cámara. */
export function grassGeometry(): THREE.BufferGeometry {
  return memo("grass", () => [
    box(0, 0.07, 0, 0.016, 0.14, 0.01, 0x3d8a38, { rz: 0.18 }),
    box(0.03, 0.055, 0.012, 0.012, 0.11, 0.008, 0x2f6e30, { rz: -0.28 }),
    box(-0.025, 0.05, -0.01, 0.012, 0.1, 0.008, 0x4a943c, { rz: 0.4 }),
    box(0.01, 0.04, 0.028, 0.01, 0.08, 0.007, 0x356e32, { rz: -0.12 }),
  ]);
}

/** Farola: de noche el globo se enciende (aEmis = 1). */
export function lampGeometry(): THREE.BufferGeometry {
  return memo("lamp", () => [
    cyl(0, 0.03, 0, 0.055, 0.06, 0x6a6a66, { seg: 6 }),
    cyl(0, 0.4, 0, 0.022, 0.74, 0x8d9298, { seg: 6 }),
    box(0.07, 0.76, 0, 0.16, 0.028, 0.028, 0x8d9298),
    box(0.16, 0.735, 0, 0.11, 0.05, 0.08, 0x9aa0a6),
    box(0.16, 0.708, 0, 0.09, 0.024, 0.06, 0xfff0c8, { emis: 1 }),
    { g: "cyl", x: 0.16, y: 0.012, z: 0, sx: 0.42, sy: 0.006, sz: 0.42, color: 0xffe0b0, emis: 0.14, seg: 12 },
    { g: "cyl", x: 0.16, y: 0.015, z: 0, sx: 0.2, sy: 0.006, sz: 0.2, color: 0xffe8c4, emis: 0.22, seg: 10 },
  ]);
}

/** Roca suelta para las laderas. */
export function rockGeometry(v: 0 | 1): THREE.BufferGeometry {
  return memo(`rock${v}`, () =>
    v === 0
      ? [
          { g: "sphere", x: 0, y: 0.11, z: 0, sx: 0.24, sy: 0, sz: 0, color: 0x6e6a64, seg: 6 },
          { g: "sphere", x: 0.15, y: 0.07, z: 0.1, sx: 0.14, sy: 0, sz: 0, color: 0x7a766e, seg: 5 },
          { g: "sphere", x: -0.1, y: 0.05, z: -0.08, sx: 0.1, sy: 0, sz: 0, color: 0x62605a, seg: 5 },
        ]
      : [
          box(0, 0.1, 0, 0.32, 0.2, 0.28, 0x74706a, { ry: 0.6 }),
          box(0.1, 0.055, -0.12, 0.18, 0.11, 0.15, 0x6a665f, { ry: 1.1 }),
          box(-0.08, 0.04, 0.1, 0.12, 0.08, 0.1, 0x5e5c56, { ry: 0.3 }),
        ],
  );
}

/** Vehículos: cuatro siluetas distintas con faros y pilotos emisivos. */
export function vehicleGeometry(kind: 0 | 1 | 2 | 3): THREE.BufferGeometry {
  return memo(`veh${kind}`, () => {
    const out: Part[] = [];
    const wheel = 0x1c1e21;
    if (kind === 0) {
      out.push(box(0, 0.08, 0, 0.2, 0.09, 0.42, 0xffffff));
      out.push(box(0, 0.16, -0.02, 0.17, 0.08, 0.2, 0x1a2834));
      out.push(box(0, 0.155, -0.12, 0.16, 0.05, 0.02, 0x8eb0c4, { emis: 0.15 }));
      out.push(box(0, 0.06, -0.21, 0.14, 0.04, 0.02, 0xfff0c8, { emis: 1 }));
      out.push(box(0, 0.08, 0.21, 0.13, 0.03, 0.02, 0xff4436, { emis: 0.9 }));
    } else if (kind === 1) {
      out.push(box(0, 0.11, 0.02, 0.22, 0.16, 0.34, 0xffffff));
      out.push(box(0, 0.09, -0.22, 0.21, 0.12, 0.14, 0xf0f0ea));
      out.push(box(0, 0.14, -0.14, 0.18, 0.07, 0.02, 0x8eb0c4, { emis: 0.12 }));
      out.push(box(0, 0.05, -0.29, 0.15, 0.04, 0.02, 0xfff0c8, { emis: 1 }));
    } else if (kind === 2) {
      out.push(box(0, 0.16, 0.08, 0.26, 0.26, 0.42, 0xffffff));
      out.push(box(0, 0.11, -0.24, 0.24, 0.17, 0.2, 0x4a5158));
      out.push(box(0, 0.18, -0.28, 0.2, 0.08, 0.02, 0x8eb0c4, { emis: 0.1 }));
      out.push(box(0, 0.06, -0.35, 0.18, 0.04, 0.02, 0xfff0c8, { emis: 1 }));
    } else {
      out.push(box(0, 0.11, 0, 0.22, 0.14, 0.44, 0xffffff));
      out.push(box(0, 0.19, 0.02, 0.19, 0.08, 0.22, 0xf2f2ee));
      out.push(box(-0.05, 0.25, -0.02, 0.06, 0.04, 0.1, 0x3d6ee8, { emis: 1 }));
      out.push(box(0.05, 0.25, -0.02, 0.06, 0.04, 0.1, 0xe83d3d, { emis: 1 }));
      out.push(box(0, 0.05, -0.23, 0.15, 0.04, 0.02, 0xfff0c8, { emis: 1 }));
    }
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        out.push(cyl(sx * 0.1, 0.04, sz * 0.13, 0.045, 0.04, wheel, { seg: 6, rz: Math.PI / 2 }));
      }
    }
    return out;
  });
}

export function disposePropGeometries() {
  for (const g of cache.values()) g.dispose();
  cache.clear();
}
