import { ROADS } from "../catalog";
import type { Grid } from "../grid";
import { DIRS, N, ROAD, clamp01, idx } from "../types";

const CELLS = N * N;
/** Hasta dónde llega una parcela desde la calle. Es la profundidad de zonificación. */
export const ZONE_DEPTH = 4;

// Buffers reutilizados: ninguna ruta reserva memoria en caliente.
const queue = new Int32Array(CELLS);
const gScore = new Float32Array(CELLS);
const cameFrom = new Int32Array(CELLS);
const closed = new Uint8Array(CELLS);
const heapNodes = new Int32Array(CELLS + 1);
const heapCost = new Float32Array(CELLS + 1);
let heapSize = 0;

function heapClear() {
  heapSize = 0;
}

function heapPush(node: number, cost: number) {
  let i = ++heapSize;
  heapNodes[i] = node;
  heapCost[i] = cost;
  while (i > 1) {
    const p = i >> 1;
    if (heapCost[p]! <= heapCost[i]!) break;
    const tn = heapNodes[p]!;
    const tc = heapCost[p]!;
    heapNodes[p] = heapNodes[i]!;
    heapCost[p] = heapCost[i]!;
    heapNodes[i] = tn;
    heapCost[i] = tc;
    i = p;
  }
}

function heapPop(): number {
  if (heapSize === 0) return -1;
  const top = heapNodes[1]!;
  heapNodes[1] = heapNodes[heapSize]!;
  heapCost[1] = heapCost[heapSize]!;
  heapSize--;
  let i = 1;
  for (;;) {
    const l = i << 1;
    const r = l + 1;
    let m = i;
    if (l <= heapSize && heapCost[l]! < heapCost[m]!) m = l;
    if (r <= heapSize && heapCost[r]! < heapCost[m]!) m = r;
    if (m === i) break;
    const tn = heapNodes[m]!;
    const tc = heapCost[m]!;
    heapNodes[m] = heapNodes[i]!;
    heapCost[m] = heapCost[i]!;
    heapNodes[i] = tn;
    heapCost[i] = tc;
    i = m;
  }
  return top;
}

/**
 * Conectividad de la red viaria a partir de la autovía y distancia de cada parcela
 * a la calle más cercana. `roadDist` es lo que permite zonificar en profundidad:
 * una manzana entera crece, no solo el borde que toca el asfalto.
 */
export function rebuildNetwork(g: Grid): { roadCount: number; connected: boolean } {
  g.connected.fill(0);
  let head = 0;
  let tail = 0;
  let roadCount = 0;

  for (let i = 0; i < CELLS; i++) {
    if (g.road[i] === ROAD.none) continue;
    roadCount++;
    if (g.road[i] === ROAD.highway) {
      g.connected[i] = 1;
      queue[tail++] = i;
    }
  }
  while (head < tail) {
    const cur = queue[head++]!;
    const x = cur % N;
    const z = (cur / N) | 0;
    for (const [dx, dz] of DIRS) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
      const j = idx(nx, nz);
      if (g.road[j] === ROAD.none || g.connected[j]) continue;
      g.connected[j] = 1;
      queue[tail++] = j;
    }
  }
  const connected = tail > 0;

  // Distancia a la red desde cada parcela (BFS multi-origen limitado).
  g.roadDist.fill(255);
  head = 0;
  tail = 0;
  for (let i = 0; i < CELLS; i++) {
    if (g.connected[i]) {
      g.roadDist[i] = 0;
      queue[tail++] = i;
    }
  }
  while (head < tail) {
    const cur = queue[head++]!;
    const d = g.roadDist[cur]!;
    if (d >= ZONE_DEPTH) continue;
    const x = cur % N;
    const z = (cur / N) | 0;
    for (const [dx, dz] of DIRS) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
      const j = idx(nx, nz);
      if (g.roadDist[j]! <= d + 1) continue;
      // La distancia se propaga por suelo edificable, no por agua ni por otras vías.
      if (d > 0 && (g.road[j] !== ROAD.none || g.terrain[j] === 1)) continue;
      g.roadDist[j] = d + 1;
      queue[tail++] = j;
    }
  }

  return { roadCount, connected };
}

/** Coste de recorrer una casilla de vía, en "minutos". Sube con la congestión. */
export function travelCost(g: Grid, i: number): number {
  const cls = g.road[i]!;
  if (cls === ROAD.none) return Infinity;
  const def = ROADS[cls]!;
  const jam = g.traffic[i]!;
  // Coste base por velocidad, penalizado de forma no lineal al saturarse.
  return (1 / def.speed) * (1 + jam * jam * 2.6);
}

/** Casilla de vía conectada más cercana a un edificio (o -1). */
export function nearestRoad(g: Grid, x: number, z: number, w = 1, d = 1): number {
  let best = -1;
  let bestD = 99;
  for (let r = 0; r <= ZONE_DEPTH + 1; r++) {
    for (let zz = -r; zz <= d - 1 + r; zz++) {
      for (let xx = -r; xx <= w - 1 + r; xx++) {
        if (Math.max(Math.abs(xx < 0 ? xx : xx - (w - 1)), Math.abs(zz < 0 ? zz : zz - (d - 1))) !== r) continue;
        const i = g.at(x + xx, z + zz);
        if (i < 0 || !g.connected[i]) continue;
        const dist = Math.abs(xx) + Math.abs(zz);
        if (dist < bestD) {
          bestD = dist;
          best = i;
        }
      }
    }
    if (best >= 0) return best;
  }
  return best;
}

/** Orientación (0..3) que mira hacia la calle más cercana. */
export function facingRoad(g: Grid, x: number, z: number, w: number, d: number): number {
  const road = nearestRoad(g, x, z, w, d);
  if (road < 0) return 0;
  const rx = road % N;
  const rz = (road / N) | 0;
  const cx = x + (w - 1) / 2;
  const cz = z + (d - 1) / 2;
  const dx = rx - cx;
  const dz = rz - cz;
  if (Math.abs(dx) > Math.abs(dz)) return dx > 0 ? 1 : 3;
  return dz > 0 ? 2 : 0;
}

export interface PathResult {
  path: Int32Array | null;
  cost: number;
}

/**
 * A* sobre casillas de vía con coste dependiente de la clase y de la congestión.
 * Usa buffers de módulo: no reserva memoria por llamada.
 */
export function findPath(g: Grid, start: number, goal: number, limit = CELLS): PathResult {
  if (start < 0 || goal < 0) return { path: null, cost: Infinity };
  if (start === goal) return { path: Int32Array.of(start), cost: 0 };
  if (g.road[start] === ROAD.none || g.road[goal] === ROAD.none) return { path: null, cost: Infinity };

  closed.fill(0);
  gScore.fill(Infinity);
  heapClear();
  gScore[start] = 0;
  cameFrom[start] = -1;
  const gx = goal % N;
  const gz = (goal / N) | 0;
  heapPush(start, 0);
  let expanded = 0;

  while (heapSize > 0) {
    const cur = heapPop();
    if (cur === goal) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    if (++expanded > limit) return { path: null, cost: Infinity };
    const x = cur % N;
    const z = (cur / N) | 0;
    const base = gScore[cur]!;
    for (const [dx, dz] of DIRS) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
      const j = idx(nx, nz);
      if (g.road[j] === ROAD.none || closed[j]) continue;
      const step = base + travelCost(g, j);
      if (step >= gScore[j]!) continue;
      gScore[j] = step;
      cameFrom[j] = cur;
      // Heurística admisible: la vía más rápida posible es la autopista.
      const h = (Math.abs(nx - gx) + Math.abs(nz - gz)) / ROADS[3]!.speed;
      heapPush(j, step + h);
    }
  }

  if (!isFinite(gScore[goal]!)) return { path: null, cost: Infinity };
  let len = 0;
  for (let c = goal; c >= 0; c = cameFrom[c]!) len++;
  const path = new Int32Array(len);
  let c = goal;
  for (let k = len - 1; k >= 0; k--) {
    path[k] = c;
    c = cameFrom[c]!;
  }
  return { path, cost: gScore[goal]! };
}

/** Capacidad diaria de una casilla de vía. */
export function capacityOf(g: Grid, i: number): number {
  const cls = g.road[i]!;
  return cls === ROAD.none ? 0 : ROADS[cls]!.capacity;
}

export function congestionAt(g: Grid, i: number): number {
  return clamp01(g.traffic[i]!);
}

/** Altura de la calzada: sobre el terreno, o cota de puente si cruza el agua. */
export function roadSurface(g: Grid, i: number): number {
  const h = g.height[i]!;
  return h < 0.15 ? 0.55 : h + 0.06;
}
