import { Grid } from "./grid";
import { CITY_NAMES, fbm, hash2, mulberry32, ridged } from "./rng";
import { N, ROAD, TERRAIN, idx } from "./types";

export interface MapGen {
  grid: Grid;
  name: string;
  /** Casilla por la que entra la autovía; la cámara arranca mirando ahí. */
  entry: { x: number; z: number };
}

export const WATER_LEVEL = 0;
/** Altura máxima del terreno en unidades de mundo (1 unidad = 1 casilla). */
export const MAX_HEIGHT = 7;

function smoothstep(a: number, b: number, t: number): number {
  const x = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
}

/**
 * Genera un mapa 64×64 con relieve real: valle central habitable, colinas al norte,
 * sierra en una esquina, río meandriforme con afluente, lago y costa al sur.
 * El relieve no es solo decorativo: `slope` bloquea la construcción, encarece las vías
 * y alimenta el valor del suelo a través de `scenery`.
 */
export function generateMap(seed: number): MapGen {
  const rand = mulberry32(seed);
  const name = CITY_NAMES[Math.floor(rand() * CITY_NAMES.length)] ?? "Riverside";
  const g = new Grid();

  const s = seed & 0xffff;
  // Orientación del relieve: qué esquina lleva la sierra.
  const ridgeX = rand() < 0.5 ? 0.12 : 0.88;
  const ridgeZ = 0.14 + rand() * 0.18;
  const riverBase = 0.34 + rand() * 0.32;
  const riverAmp = 4 + rand() * 5;
  const riverPhase = rand() * 6.28;
  const lakeX = 0.16 + rand() * 0.2;
  const lakeZ = 0.62 + rand() * 0.2;
  const lakeR = 3.4 + rand() * 2.4;

  const riverCenter = (z: number) =>
    riverBase * N + Math.sin(z * 0.09 + riverPhase) * riverAmp + Math.sin(z * 0.031 + 1.7) * (riverAmp * 0.5);

  const elevation = (x: number, z: number): number => {
    const nx = x / N;
    const nz = z / N;
    // Landform amplio.
    let e = fbm(x / 26, z / 26, s, 4) * 0.85 + fbm(x / 9, z / 9, s + 31, 3) * 0.15;
    e = Math.pow(e, 1.35);
    // Sierra en una esquina.
    const ridgeMask = smoothstep(0.42, 0.0, Math.hypot(nx - ridgeX, nz - ridgeZ) * 1.5);
    e += ridged(x / 13, z / 13, s + 77, 4) * ridgeMask * 0.85;
    // Caída hacia la costa sur.
    e *= smoothstep(0.0, 0.22, 1 - nz) * 0.55 + 0.45;
    e -= smoothstep(0.74, 1.0, nz) * 0.55;
    // Bordes del mapa ligeramente bajos, para que la costa se lea.
    const edge = Math.min(nx, 1 - nx, nz, 1 - nz);
    e -= smoothstep(0.06, 0.0, edge) * 0.12;
    return e * MAX_HEIGHT - 0.9;
  };

  for (let z = 0; z < N; z++) {
    for (let x = 0; x < N; x++) {
      const i = idx(x, z);
      let e = elevation(x, z);

      // Cauce principal.
      const cx = riverCenter(z);
      const halfW = 1.5 + Math.sin(z * 0.14 + 0.6) * 0.5 + (z / N) * 1.6;
      const dRiver = Math.abs(x - cx);
      if (dRiver < halfW + 3.5) {
        const carve = smoothstep(halfW + 3.5, halfW * 0.4, dRiver);
        e = e * (1 - carve) + (WATER_LEVEL - 1.1) * carve;
      }
      // Afluente que baja desde la sierra.
      const tribZ = ridgeZ * N + (x - ridgeX * N) * 0.55;
      const dTrib = Math.abs(z - tribZ);
      if (x > Math.min(ridgeX * N, cx) - 2 && x < Math.max(ridgeX * N, cx) + 2 && dTrib < 4) {
        const carve = smoothstep(4, 0.8, dTrib) * 0.75;
        e = e * (1 - carve) + (WATER_LEVEL - 0.7) * carve;
      }
      // Lago.
      const dLake = Math.hypot(x - lakeX * N, z - lakeZ * N);
      if (dLake < lakeR + 3) {
        const carve = smoothstep(lakeR + 3, lakeR * 0.5, dLake);
        e = e * (1 - carve) + (WATER_LEVEL - 1.4) * carve;
      }

      g.height[i] = e;
    }
  }

  g.recomputeSlope();

  for (let z = 0; z < N; z++) {
    for (let x = 0; x < N; x++) {
      const i = idx(x, z);
      const e = g.height[i]!;
      const slope = g.slope[i]!;
      let terrain: number = TERRAIN.grass;
      if (e < WATER_LEVEL) terrain = TERRAIN.water;
      else if (e < WATER_LEVEL + 0.38) terrain = TERRAIN.sand;
      else if (e > MAX_HEIGHT * 0.58 && slope > 0.3) terrain = TERRAIN.rock;
      g.terrain[i] = terrain;

      // Bosques: masa de ruido, evitando roca desnuda y cotas altas.
      const forest = fbm(x / 11, z / 11, s + 211, 3);
      const dense = forest > 0.56 && terrain === TERRAIN.grass && e < MAX_HEIGHT * 0.72;
      g.tree[i] = dense && hash2(x, z, s + 5) > 0.42 ? 1 : 0;
    }
  }

  // Valor escénico: cerca del agua, arbolado y con vistas.
  for (let z = 0; z < N; z++) {
    for (let x = 0; x < N; x++) {
      const i = idx(x, z);
      if (g.terrain[i] === TERRAIN.water) continue;
      let nearWater = 0;
      for (let r = 1; r <= 5 && !nearWater; r++) {
        for (const [dx, dz] of [
          [r, 0],
          [-r, 0],
          [0, r],
          [0, -r],
          [r, r],
          [-r, -r],
          [r, -r],
          [-r, r],
        ] as const) {
          const j = g.at(x + dx, z + dz);
          if (j >= 0 && g.terrain[j] === TERRAIN.water) {
            nearWater = 1 - (r - 1) / 5;
            break;
          }
        }
      }
      const trees = g.tree[i] ? 0.25 : 0;
      const view = Math.min(0.3, (g.height[i]! / MAX_HEIGHT) * 0.45);
      g.scenery[i] = Math.min(1, nearWater * 0.55 + trees + view);
    }
  }

  // Entrada de autovía: por el borde oeste, a la altura más llana disponible.
  let bestZ = Math.floor(N / 2);
  let bestScore = -Infinity;
  for (let z = 6; z < N - 6; z++) {
    let score = 0;
    for (let x = 0; x < 10; x++) {
      const i = idx(x, z);
      if (g.terrain[i] === TERRAIN.water) score -= 10;
      score -= g.slope[i]! * 6;
      score += Math.min(g.height[i]!, 2);
    }
    if (score > bestScore) {
      bestScore = score;
      bestZ = z;
    }
  }
  const hz = bestZ;
  const runway = 10;
  // Explanada ancha bajo la autovía. La pendiente de cada casilla se calcula con los
  // vecinos, así que hay que aplanar un bermón, no solo las dos filas de asfalto:
  // si no, en semillas con sierra o río cerca la entrada queda impracticable.
  let base = 0;
  for (let x = 0; x < runway; x++) base += Math.max(g.height[idx(x, hz)]!, WATER_LEVEL + 0.55);
  base /= runway;
  base = Math.max(WATER_LEVEL + 0.5, Math.min(base, WATER_LEVEL + 2.4));
  for (let x = 0; x < runway + 5; x++) {
    for (let dz = -4; dz <= 5; dz++) {
      const z = hz + dz;
      const i = g.at(x, z);
      if (i < 0) continue;
      const radial = Math.max(Math.abs(dz) / 4.2, Math.max(0, x - (runway - 1)) / 5);
      const blend = smoothstep(1.05, 0.12, radial);
      g.height[i] = g.height[i]! * (1 - blend) + base * blend;
      if (blend > 0.4 && g.terrain[i] === TERRAIN.water) g.terrain[i] = TERRAIN.sand;
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
  // Segunda pasada: si algún vecino todavía tira de la pendiente, se aplana más.
  for (let x = 0; x < runway; x++) {
    for (const z of [hz, hz + 1]) {
      const i = g.at(x, z);
      if (i < 0) continue;
      if (g.slope[i]! > 0.38) {
        for (let dz = -2; dz <= 3; dz++) {
          const j = g.at(x, z + dz);
          if (j >= 0) g.height[j] = g.height[j]! * 0.25 + base * 0.75;
        }
        g.height[i] = base;
      }
    }
  }
  g.recomputeSlope();

  return { grid: g, name, entry: { x: runway, z: hz } };
}
