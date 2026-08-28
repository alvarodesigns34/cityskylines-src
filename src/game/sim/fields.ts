import { N, clamp01, idx } from "./types";

const CELLS = N * N;
const scratch = new Float32Array(CELLS);

/** Suma un disco con caída suave sobre un campo. */
export function stamp(
  field: Float32Array,
  cx: number,
  cz: number,
  radius: number,
  strength: number,
) {
  if (strength === 0 || radius <= 0) return;
  const r = Math.ceil(radius);
  const x0 = Math.max(0, Math.floor(cx) - r);
  const x1 = Math.min(N - 1, Math.ceil(cx) + r);
  const z0 = Math.max(0, Math.floor(cz) - r);
  const z1 = Math.min(N - 1, Math.ceil(cz) + r);
  const inv = 1 / radius;
  for (let z = z0; z <= z1; z++) {
    const dz = z - cz;
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      const d = Math.sqrt(dx * dx + dz * dz) * inv;
      if (d >= 1) continue;
      // Caída suave (1 - d²)²: fuerte en el centro, colita larga en el borde.
      const f = (1 - d * d) * (1 - d * d);
      field[idx(x, z)] += strength * f;
    }
  }
}

/** Desenfoque separable de radio 1, `passes` veces. Difunde humo, ruido y valor. */
export function blur(field: Float32Array, passes = 1) {
  for (let p = 0; p < passes; p++) {
    for (let z = 0; z < N; z++) {
      const row = z * N;
      for (let x = 0; x < N; x++) {
        const i = row + x;
        const a = x > 0 ? field[i - 1]! : field[i]!;
        const b = field[i]!;
        const c = x < N - 1 ? field[i + 1]! : field[i]!;
        scratch[i] = a * 0.25 + b * 0.5 + c * 0.25;
      }
    }
    for (let x = 0; x < N; x++) {
      for (let z = 0; z < N; z++) {
        const i = z * N + x;
        const a = z > 0 ? scratch[i - N]! : scratch[i]!;
        const b = scratch[i]!;
        const c = z < N - 1 ? scratch[i + N]! : scratch[i]!;
        field[i] = a * 0.25 + b * 0.5 + c * 0.25;
      }
    }
  }
}

/** Desplaza un campo en una dirección (viento). */
export function advect(field: Float32Array, dx: number, dz: number, amount: number) {
  scratch.set(field);
  for (let z = 0; z < N; z++) {
    for (let x = 0; x < N; x++) {
      const sx = Math.max(0, Math.min(N - 1, x - dx));
      const sz = Math.max(0, Math.min(N - 1, z - dz));
      const i = idx(x, z);
      field[i] = field[i]! * (1 - amount) + scratch[idx(sx, sz)]! * amount;
    }
  }
}

export function clampField(field: Float32Array, lo = 0, hi = 1) {
  for (let i = 0; i < CELLS; i++) {
    const v = field[i]!;
    field[i] = v < lo ? lo : v > hi ? hi : v;
  }
}

export function decay(field: Float32Array, keep: number) {
  for (let i = 0; i < CELLS; i++) field[i] *= keep;
}

export function averageOver(field: Float32Array, mask: Uint8Array | null): number {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < CELLS; i++) {
    if (mask && !mask[i]) continue;
    sum += field[i]!;
    n++;
  }
  return n ? sum / n : 0;
}

export function sample(field: Float32Array, x: number, z: number): number {
  const i = idx(Math.max(0, Math.min(N - 1, x | 0)), Math.max(0, Math.min(N - 1, z | 0)));
  return field[i]!;
}

export function normalized(field: Float32Array, i: number): number {
  return clamp01(field[i]!);
}
