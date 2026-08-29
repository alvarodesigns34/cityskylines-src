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

/** Cinco especies: frondoso, conífera, matorral, abedul y olivo. */
export function treeGeometry(species: 0 | 1 | 2 | 3 | 4): THREE.BufferGeometry {
  return memo(`tree${species}`, () => {
    const out: Part[] = [];
    if (species === 0) {
      // Frondoso.
      out.push(cyl(0, 0.17, 0, 0.045, 0.34, 0x6b5344, { seg: 5 }));
      out.push({ g: "sphere", x: 0, y: 0.48, z: 0, sx: 0.24, sy: 0, sz: 0, color: 0x3d7a45, seg: 7 });
      out.push({ g: "sphere", x: 0.11, y: 0.4, z: 0.08, sx: 0.16, sy: 0, sz: 0, color: 0x468050, seg: 6 });
      out.push({ g: "sphere", x: -0.1, y: 0.42, z: -0.07, sx: 0.14, sy: 0, sz: 0, color: 0x35703e, seg: 6 });
    } else if (species === 1) {
      // Conífera.
      out.push(cyl(0, 0.12, 0, 0.04, 0.24, 0x5c463a, { seg: 5 }));
      out.push({ g: "cone", x: 0, y: 0.42, z: 0, sx: 0.22, sy: 0.44, sz: 0.22, color: 0x2f6b3f, seg: 7 });
      out.push({ g: "cone", x: 0, y: 0.66, z: 0, sx: 0.16, sy: 0.34, sz: 0.16, color: 0x35743f, seg: 7 });
    } else if (species === 2) {
      // Arbusto / matorral mediterráneo.
      out.push(cyl(0, 0.08, 0, 0.03, 0.16, 0x6b5344, { seg: 4 }));
      out.push({ g: "sphere", x: 0, y: 0.24, z: 0, sx: 0.19, sy: 0, sz: 0, color: 0x54803f, seg: 6 });
      out.push({ g: "sphere", x: 0.09, y: 0.19, z: 0.06, sx: 0.12, sy: 0, sz: 0, color: 0x5f8a45, seg: 5 });
    } else if (species === 3) {
      // Abedul: tronco claro, copa alta y rala. Orillas y valles húmedos.
      out.push(cyl(0, 0.22, 0, 0.032, 0.44, 0xe8e2d4, { seg: 5 }));
      out.push({ g: "sphere", x: 0.02, y: 0.58, z: 0, sx: 0.18, sy: 0, sz: 0, color: 0x5a9a4a, seg: 6 });
      out.push({ g: "sphere", x: -0.08, y: 0.5, z: 0.05, sx: 0.13, sy: 0, sz: 0, color: 0x6aad55, seg: 5 });
      out.push({ g: "sphere", x: 0.07, y: 0.66, z: -0.04, sx: 0.11, sy: 0, sz: 0, color: 0x4e8c42, seg: 5 });
    } else {
      // Olivo / acebuche: copa achatada, tronco torcido. Sotobosque seco.
      out.push(cyl(0.02, 0.12, 0, 0.038, 0.22, 0x6a5a48, { seg: 5 }));
      out.push({ g: "sphere", x: 0, y: 0.32, z: 0, sx: 0.22, sy: 0, sz: 0, color: 0x6b8a4a, seg: 6 });
      out.push({ g: "sphere", x: 0.1, y: 0.28, z: 0.06, sx: 0.14, sy: 0, sz: 0, color: 0x7a9654, seg: 5 });
      out.push({ g: "sphere", x: -0.09, y: 0.26, z: -0.05, sx: 0.12, sy: 0, sz: 0, color: 0x5e7c40, seg: 5 });
    }
    return out;
  });
}

/** Farola: de noche el globo se enciende (aEmis = 1). */
export function lampGeometry(): THREE.BufferGeometry {
  return memo("lamp", () => [
    cyl(0, 0.03, 0, 0.055, 0.06, 0x6a6a66, { seg: 6 }),
    cyl(0, 0.36, 0, 0.022, 0.66, 0x8d9298, { seg: 5 }),
    box(0.06, 0.68, 0, 0.13, 0.025, 0.025, 0x8d9298),
    box(0.13, 0.655, 0, 0.1, 0.045, 0.07, 0x9aa0a6),
    box(0.13, 0.632, 0, 0.085, 0.02, 0.055, 0xfff0c8, { emis: 1 }),
    // Charco de luz sobre el asfalto: de noche la calle se lee sin cientos de luces reales.
    { g: "cyl", x: 0.13, y: 0.012, z: 0, sx: 0.34, sy: 0.005, sz: 0.34, color: 0xffe0b0, emis: 0.1, seg: 10 },
    { g: "cyl", x: 0.13, y: 0.014, z: 0, sx: 0.17, sy: 0.005, sz: 0.17, color: 0xffe8c4, emis: 0.16, seg: 10 },
  ]);
}

/** Roca suelta para las laderas. */
export function rockGeometry(v: 0 | 1): THREE.BufferGeometry {
  return memo(`rock${v}`, () =>
    v === 0
      ? [
          { g: "sphere", x: 0, y: 0.1, z: 0, sx: 0.22, sy: 0, sz: 0, color: 0x6e6a64, seg: 5 },
          { g: "sphere", x: 0.14, y: 0.06, z: 0.1, sx: 0.13, sy: 0, sz: 0, color: 0x7a766e, seg: 5 },
        ]
      : [
          box(0, 0.09, 0, 0.3, 0.18, 0.26, 0x74706a, { ry: 0.6 }),
          box(0.1, 0.05, -0.12, 0.16, 0.1, 0.14, 0x6a665f, { ry: 1.1 }),
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
      out.push(box(0, 0.155, -0.02, 0.17, 0.07, 0.2, 0x2a3440));
      out.push(box(0, 0.06, -0.21, 0.14, 0.04, 0.02, 0xfff0c8, { emis: 1 }));
      out.push(box(0, 0.08, 0.21, 0.13, 0.03, 0.02, 0xff4436, { emis: 0.9 }));
    } else if (kind === 1) {
      out.push(box(0, 0.11, 0.02, 0.22, 0.16, 0.34, 0xffffff));
      out.push(box(0, 0.09, -0.22, 0.21, 0.12, 0.14, 0xf0f0ea));
      out.push(box(0, 0.11, -0.2, 0.17, 0.06, 0.02, 0x2a3440));
      out.push(box(0, 0.05, -0.29, 0.15, 0.04, 0.02, 0xfff0c8, { emis: 1 }));
    } else if (kind === 2) {
      out.push(box(0, 0.16, 0.08, 0.26, 0.26, 0.42, 0xffffff));
      out.push(box(0, 0.11, -0.24, 0.24, 0.17, 0.2, 0x4a5158));
      out.push(box(0, 0.14, -0.33, 0.19, 0.07, 0.02, 0x2a3440));
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
