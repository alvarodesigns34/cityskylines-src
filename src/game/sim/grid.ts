import { N, ROAD, SERVICES, TERRAIN, ZONE_OF_ID, idx, inBounds, type RoadClass, type Zone } from "./types";

const CELLS = N * N;

/**
 * Estado espacial de la ciudad en struct-of-arrays.
 *
 * Antes era un array de 1.296 objetos `Tile`. Con typed arrays el mapa escala a 64×64 (4.096
 * casillas) sin coste de memoria por objeto, los campos de difusión (contaminación, ruido, valor
 * del suelo, cobertura de servicios) son sumas sobre buffers contiguos, y el guardado se
 * comprime a base64 en vez de serializar miles de objetos JSON.
 */
export class Grid {
  readonly n = N;

  // --- estáticos del mapa ---
  terrain = new Uint8Array(CELLS);
  height = new Float32Array(CELLS);
  /** Pendiente local 0..1, precalculada por el generador. */
  slope = new Float32Array(CELLS);
  tree = new Uint8Array(CELLS);
  /** Recurso escénico natural (orilla, bosque, altura) 0..1. */
  scenery = new Float32Array(CELLS);

  // --- construido por el jugador ---
  road = new Uint8Array(CELLS);
  zone = new Uint8Array(CELLS);
  /** 0 baja densidad · 1 alta densidad. */
  density = new Uint8Array(CELLS);
  building = new Int32Array(CELLS).fill(-1);

  // --- derivados (nunca se guardan) ---
  connected = new Uint8Array(CELLS);
  powered = new Uint8Array(CELLS);
  watered = new Uint8Array(CELLS);
  /** Distancia en casillas a la calle transitable más cercana (255 = inalcanzable). */
  roadDist = new Uint8Array(CELLS).fill(255);
  /** Tráfico normalizado 0..1 en la casilla de vía. */
  traffic = new Float32Array(CELLS);
  pollution = new Float32Array(CELLS);
  noise = new Float32Array(CELLS);
  landValue = new Float32Array(CELLS);
  service: Record<string, Float32Array> = Object.fromEntries(
    SERVICES.map((s) => [s, new Float32Array(CELLS)]),
  );

  at(x: number, z: number): number {
    return inBounds(x, z) ? idx(x, z) : -1;
  }

  isWater(i: number): boolean {
    return this.terrain[i] === TERRAIN.water;
  }

  isRoad(i: number): boolean {
    return this.road[i] !== ROAD.none;
  }

  /** Vía por la que circulan vehículos y viajan los servicios. */
  isDrivable(i: number): boolean {
    return this.road[i] !== ROAD.none;
  }

  zoneOf(i: number): Zone {
    return ZONE_OF_ID[this.zone[i]!] ?? "none";
  }

  roadClass(i: number): RoadClass {
    return this.road[i] as RoadClass;
  }

  /** ¿La casilla puede recibir un edificio de zona? */
  buildable(i: number): boolean {
    return (
      this.terrain[i] !== TERRAIN.water &&
      this.road[i] === ROAD.none &&
      this.building[i]! < 0 &&
      this.slope[i]! < 0.55
    );
  }

  serialize(): Record<string, string | number> {
    return {
      n: N,
      terrain: encode(this.terrain),
      height: encodeF32(this.height),
      tree: encode(this.tree),
      road: encode(this.road),
      zone: encode(this.zone),
      density: encode(this.density),
      building: encodeI32(this.building),
    };
  }

  static deserialize(blob: Record<string, string | number>): Grid | null {
    if (blob.n !== N) return null;
    const g = new Grid();
    try {
      g.terrain = decode(blob.terrain as string, CELLS);
      g.height = decodeF32(blob.height as string, CELLS);
      g.tree = decode(blob.tree as string, CELLS);
      g.road = decode(blob.road as string, CELLS);
      g.zone = decode(blob.zone as string, CELLS);
      g.density = decode(blob.density as string, CELLS);
      g.building = decodeI32(blob.building as string, CELLS);
    } catch {
      return null;
    }
    g.recomputeSlope();
    return g;
  }

  recomputeSlope() {
    for (let z = 0; z < N; z++) {
      for (let x = 0; x < N; x++) {
        const i = idx(x, z);
        const h = this.height[i]!;
        let max = 0;
        if (x > 0) max = Math.max(max, Math.abs(h - this.height[i - 1]!));
        if (x < N - 1) max = Math.max(max, Math.abs(h - this.height[i + 1]!));
        if (z > 0) max = Math.max(max, Math.abs(h - this.height[i - N]!));
        if (z < N - 1) max = Math.max(max, Math.abs(h - this.height[i + N]!));
        this.slope[i] = Math.min(1, max / 1.2);
      }
    }
  }
}

// --- codificación base64 de typed arrays (guardado compacto) ---

function bytesToB64(bytes: Uint8Array): string {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return typeof btoa === "function" ? btoa(s) : Buffer.from(s, "binary").toString("base64");
}

function b64ToBytes(s: string): Uint8Array<ArrayBuffer> {
  const bin = typeof atob === "function" ? atob(s) : Buffer.from(s, "base64").toString("binary");
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function encode(a: Uint8Array): string {
  return bytesToB64(a);
}

function decode(s: string, len: number): Uint8Array<ArrayBuffer> {
  const b = b64ToBytes(s);
  if (b.length !== len) throw new Error("bad length");
  const out = new Uint8Array(len);
  out.set(b);
  return out;
}

function encodeF32(a: Float32Array): string {
  return bytesToB64(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
}

function decodeF32(s: string, len: number): Float32Array<ArrayBuffer> {
  const b = b64ToBytes(s);
  if (b.length !== len * 4) throw new Error("bad length");
  const out = new Float32Array(len);
  new Uint8Array(out.buffer).set(b);
  return out;
}

function encodeI32(a: Int32Array): string {
  return bytesToB64(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
}

function decodeI32(s: string, len: number): Int32Array<ArrayBuffer> {
  const b = b64ToBytes(s);
  if (b.length !== len * 4) throw new Error("bad length");
  const out = new Int32Array(len);
  new Uint8Array(out.buffer).set(b);
  return out;
}
