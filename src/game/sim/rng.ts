export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2(x: number, z: number, salt = 0): number {
  let n = Math.imul(x + salt * 13, 374761393) ^ Math.imul(z + salt * 7, 668265263);
  n = (n ^ (n >>> 13)) >>> 0;
  return (Math.imul(n, 1274126177) >>> 0) / 4294967296;
}

export const CITY_NAMES = [
  "Riverside",
  "Oakford",
  "Harborline",
  "Elmstead",
  "Northwick",
  "Fairbrook",
  "Stonehaven",
  "Maplewick",
  "Ashmere",
  "Larkfield",
];
