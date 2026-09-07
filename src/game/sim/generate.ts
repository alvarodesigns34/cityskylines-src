import { Grid } from "./grid";
import { CITY_NAMES, fbm, hash2, mulberry32 } from "./rng";
import { N, ROAD, TERRAIN, idx } from "./types";

export interface MapGen {
  grid: Grid;
  name: string;
  /** Casilla por la que entra la autovía; la cámara arranca mirando ahí. */
  entry: { x: number; z: number };
}

export const WATER_LEVEL = 0;
/** Altura máxima del terreno. El mapa es una llanura suave: se construye en casi todas partes. */
export const MAX_HEIGHT = 1.45;

function smoothstep(a: number, b: number, t: number): number {
  const x = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
}

/**
 * Llanura jugable 64×64: ondulaciones suaves, un lago (a veces un estanque extra) y arboledas.
 * El relieve ya no bloquea manzanas enteras; las orillas se rampa para que la pendiente
 * junto al agua siga siendo zonificable un par de casillas más adentro.
 */
export function generateMap(seed: number): MapGen {
  const rand = mulberry32(seed);
  const name = CITY_NAMES[Math.floor(rand() * CITY_NAMES.length)] ?? "Riverside";
  const g = new Grid();
  const s = seed & 0xffff;

  // El lago se aleja del borde oeste (autovía) para no comerse la entrada.
  const lakeX = 18 + rand() * 28;
  const lakeZ = 14 + rand() * 36;
  const lakeR = 5.2 + rand() * 2.4;
  const pond = rand() > 0.4;
  const pondX = 10 + rand() * 44;
  const pondZ = 8 + rand() * 48;
  const pondR = 2.2 + rand() * 1.1;

  for (let z = 0; z < N; z++) {
    for (let x = 0; x < N; x++) {
      const i = idx(x, z);
      const nx = x / N;
      const nz = z / N;
      const rolls = fbm(x / 42, z / 42, s, 3) * 0.7 + fbm(x / 16, z / 16, s + 31, 2) * 0.3;
      const edge = Math.min(nx, 1 - nx, nz, 1 - nz);
      const inland = smoothstep(0.03, 0.1, edge);
      let e = WATER_LEVEL + 0.38 + rolls * 0.55 * inland;

      const dLake = Math.hypot(x - lakeX, z - lakeZ);
      if (dLake < lakeR + 4.2) {
        const carve = smoothstep(lakeR + 4.2, lakeR * 0.55, dLake);
        e = e * (1 - carve) + (WATER_LEVEL - 0.85) * carve;
      }
      if (pond) {
        const dPond = Math.hypot(x - pondX, z - pondZ);
        if (dPond < pondR + 2.4) {
          const carve = smoothstep(pondR + 2.4, pondR * 0.5, dPond);
          e = e * (1 - carve) + (WATER_LEVEL - 0.55) * carve;
        }
      }
      g.height[i] = e;
    }
  }

  // Dos pasadas de suavizado: las orillas quedan en playa, no en acantilado.
  blurLand(g, 2);

  g.recomputeSlope();

  for (let z = 0; z < N; z++) {
    for (let x = 0; x < N; x++) {
      const i = idx(x, z);
      const e = g.height[i]!;
      let terrain: number = TERRAIN.grass;
      if (e < WATER_LEVEL) terrain = TERRAIN.water;
      else if (e < WATER_LEVEL + 0.28) terrain = TERRAIN.sand;
      g.terrain[i] = terrain;

      const grove = fbm(x / 13, z / 13, s + 211, 3);
      const inGrove = grove > 0.6 && terrain === TERRAIN.grass;
      g.tree[i] = inGrove && hash2(x, z, s + 5) > 0.55 ? 1 : 0;
    }
  }

  g.recomputeScenery();

  // Autovía por el oeste, en la franja más seca y llana.
  let bestZ = Math.floor(N / 2);
  let bestScore = -Infinity;
  for (let z = 8; z < N - 8; z++) {
    let score = 0;
    for (let x = 0; x < 12; x++) {
      const i = idx(x, z);
      if (g.terrain[i] === TERRAIN.water) score -= 14;
      score -= g.slope[i]! * 4;
      score += Math.min(g.height[i]!, 1.2);
    }
    if (score > bestScore) {
      bestScore = score;
      bestZ = z;
    }
  }
  const hz = bestZ;
  const runway = 10;
  let base = 0;
  for (let x = 0; x < runway; x++) base += Math.max(g.height[idx(x, hz)]!, WATER_LEVEL + 0.4);
  base /= runway;
  base = Math.max(WATER_LEVEL + 0.4, Math.min(base, WATER_LEVEL + 0.85));
  for (let x = 0; x < runway + 3; x++) {
    for (let dz = -3; dz <= 4; dz++) {
      const z = hz + dz;
      const i = g.at(x, z);
      if (i < 0) continue;
      const radial = Math.max(Math.abs(dz) / 3.4, Math.max(0, x - (runway - 1)) / 3);
      const blend = smoothstep(1.0, 0.1, radial);
      g.height[i] = g.height[i]! * (1 - blend) + base * blend;
      if (blend > 0.35 && g.terrain[i] === TERRAIN.water) {
        g.terrain[i] = TERRAIN.sand;
        g.tree[i] = 0;
      }
    }
  }
  for (let x = 0; x < runway; x++) {
    for (const z of [hz, hz + 1]) {
      const i = g.at(x, z);
      if (i < 0) continue;
      g.height[i] = base;
      g.road[i] = ROAD.highway;
      g.tree[i] = 0;
      g.terrain[i] = g.terrain[i] === TERRAIN.water ? TERRAIN.sand : g.terrain[i]!;
    }
  }
  g.recomputeSlope();

  return { grid: g, name, entry: { x: runway, z: hz } };
}

/** Media con vecinos: aplana saltos locales sin borrar el vaso del lago. */
function blurLand(g: Grid, passes: number) {
  const tmp = new Float32Array(g.height);
  for (let p = 0; p < passes; p++) {
    const src = p % 2 === 0 ? g.height : tmp;
    const dst = p % 2 === 0 ? tmp : g.height;
    for (let z = 0; z < N; z++) {
      for (let x = 0; x < N; x++) {
        const i = idx(x, z);
        if (src[i]! < WATER_LEVEL - 0.15) {
          dst[i] = src[i]!;
          continue;
        }
        let sum = src[i]! * 2;
        let w = 2;
        if (x > 0) {
          sum += src[i - 1]!;
          w++;
        }
        if (x < N - 1) {
          sum += src[i + 1]!;
          w++;
        }
        if (z > 0) {
          sum += src[i - N]!;
          w++;
        }
        if (z < N - 1) {
          sum += src[i + N]!;
          w++;
        }
        dst[i] = sum / w;
      }
    }
  }
  if (passes % 2 === 1) g.height.set(tmp);
}
