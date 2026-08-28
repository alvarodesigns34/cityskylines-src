import { CITY_NAMES, hash2, mulberry32 } from "./rng";
import { N, type Tile, idx } from "./types";

export interface MapGen {
  tiles: Tile[];
  name: string;
}

export function generateMap(seed: number): MapGen {
  const rand = mulberry32(seed);
  const name = CITY_NAMES[Math.floor(rand() * CITY_NAMES.length)] ?? "Riverside";
  const tiles: Tile[] = new Array(N * N);

  const riverX0 = N * (0.52 + (rand() - 0.5) * 0.08);

  for (let z = 0; z < N; z++) {
    for (let x = 0; x < N; x++) {
      const nx = x / (N - 1);
      const nz = z / (N - 1);
      const h =
        0.18 +
        Math.sin(nx * 4.2 + seed * 0.01) * 0.12 +
        Math.cos(nz * 3.4) * 0.1 +
        Math.sin((nx + nz) * 7.1) * 0.06 +
        (hash2(x, z, seed) - 0.5) * 0.05;

      const meander = Math.sin(z * 0.28 + seed) * 3.2 + Math.sin(z * 0.07) * 1.4;
      const riverCx = riverX0 + meander;
      const riverW = 1.35 + Math.sin(z * 0.2) * 0.35;
      const river = Math.abs(x - riverCx) < riverW && z > 1 && z < N - 1;
      const coast = z > N - 3 && h < 0.28;
      const pond = Math.hypot(x - N * 0.22, z - N * 0.78) < 2.2;

      let terrain: Tile["terrain"] = "grass";
      if (river || coast || pond) terrain = "water";
      else if (Math.abs(x - riverCx) < riverW + 1.2 || z > N - 4) terrain = "sand";

      const height = terrain === "water" ? 0.02 : Math.max(0.04, h);
      const tree =
        terrain === "grass" &&
        hash2(x, z, seed + 9) > 0.78 &&
        !(z > 12 && z < 20 && x < 12);

      tiles[idx(x, z)] = {
        x,
        z,
        terrain,
        height,
        road: false,
        highway: false,
        zone: "none",
        tree,
        building: -1,
        powered: false,
        watered: false,
        connected: false,
      };
    }
  }

  const hz = 16;
  for (let x = 0; x <= 7; x++) {
    for (const zz of [hz, hz + 1]) {
      const t = tiles[idx(x, zz)];
      if (!t) continue;
      t.road = true;
      t.highway = true;
      t.tree = false;
      t.zone = "none";
    }
  }

  return { tiles, name };
}
