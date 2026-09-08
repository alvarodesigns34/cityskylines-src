import * as THREE from "three";

/**
 * Albedos tileables en canvas. No hay UV de malla: el shader las muestra en
 * espacio-mundo, así que tienen que ser cíclicas y sin iluminación horneada.
 */
export interface CityTextures {
  brick: THREE.CanvasTexture;
  concrete: THREE.CanvasTexture;
  plaster: THREE.CanvasTexture;
  roof: THREE.CanvasTexture;
  asphalt: THREE.CanvasTexture;
  grass: THREE.CanvasTexture;
}

let cache: CityTextures | null = null;

function hash(i: number, j: number, s: number) {
  const n = Math.sin(i * 127.1 + j * 311.7 + s * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

function wrapFill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  size: number,
) {
  for (const ox of [0, -size, size]) {
    for (const oy of [0, -size, size]) {
      const xx = x + ox;
      const yy = y + oy;
      if (xx + w < 0 || yy + h < 0 || xx > size || yy > size) continue;
      ctx.fillRect(xx, yy, w, h);
    }
  }
}

function toTex(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

function dummyTex(): THREE.CanvasTexture {
  const c = typeof document !== "undefined" ? document.createElement("canvas") : ({ width: 1, height: 1, getContext: () => null } as unknown as HTMLCanvasElement);
  if (typeof document !== "undefined") {
    c.width = 1;
    c.height = 1;
  }
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

function makeCanvas(size: number): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  return c;
}

function brickCanvas(size = 512): HTMLCanvasElement | null {
  const c = makeCanvas(size);
  if (!c) return null;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#d8cbb8";
  ctx.fillRect(0, 0, size, size);
  const rows = 12;
  const cols = 6;
  const bh = size / rows;
  const bw = size / cols;
  const joint = Math.max(2, size / 128);
  for (let r = 0; r < rows; r++) {
    const off = (r % 2) * (bw * 0.5);
    for (let col = -1; col <= cols; col++) {
      const n = hash(r, col, 3);
      const n2 = hash(r, col, 9);
      const rd = 102 + n * 48;
      const g = 48 + n2 * 32;
      const b = 36 + n * 18;
      ctx.fillStyle = `rgb(${rd | 0},${g | 0},${b | 0})`;
      const x = col * bw + off + joint * 0.5;
      const y = r * bh + joint * 0.5;
      wrapFill(ctx, x, y, bw - joint, bh - joint, size);
      ctx.fillStyle = `rgba(40,18,12,${0.12 + n2 * 0.12})`;
      wrapFill(ctx, x, y + bh - joint * 2.2, bw - joint, joint * 0.9, size);
      ctx.fillStyle = `rgba(255,230,200,${0.08 + n * 0.08})`;
      wrapFill(ctx, x, y, bw - joint, joint * 0.55, size);
    }
  }
  return c;
}

function concreteCanvas(size = 512): HTMLCanvasElement | null {
  const c = makeCanvas(size);
  if (!c) return null;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#c5c3bc";
  ctx.fillRect(0, 0, size, size);
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const n = hash(x >> 1, y >> 1, 1);
      const n2 = hash(x, y, 4);
      const panel = (((x / size) * 4) | 0) + (((y / size) * 4) | 0) * 7;
      const grooveX = Math.min(x % (size / 4), size / 4 - (x % (size / 4)));
      const grooveY = Math.min(y % (size / 4), size / 4 - (y % (size / 4)));
      const groove = grooveX < 3 || grooveY < 3 ? 0.78 : 1;
      const speck = 0.9 + n * 0.12 + (n2 - 0.5) * 0.08;
      const tint = 0.96 + (panel % 3) * 0.02;
      const v = 197 * groove * speck * tint;
      d[i] = v;
      d[i + 1] = v * 0.99;
      d[i + 2] = v * 0.96;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function plasterCanvas(size = 512): HTMLCanvasElement | null {
  const c = makeCanvas(size);
  if (!c) return null;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#efe6d4";
  ctx.fillRect(0, 0, size, size);
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const n = hash(x >> 2, y >> 2, 2);
      const n2 = hash(x, y, 6);
      const stain = 0.94 + n * 0.1 + (n2 - 0.5) * 0.05;
      d[i] = 239 * stain;
      d[i + 1] = 230 * stain;
      d[i + 2] = 212 * stain;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function roofCanvas(size = 512): HTMLCanvasElement | null {
  const c = makeCanvas(size);
  if (!c) return null;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#5a2e28";
  ctx.fillRect(0, 0, size, size);
  const rows = 16;
  const cols = 10;
  const th = size / rows;
  const tw = size / cols;
  for (let r = 0; r < rows; r++) {
    const off = (r % 2) * (tw * 0.5);
    for (let col = -1; col <= cols; col++) {
      const n = hash(r, col, 5);
      const rd = 130 + n * 40;
      const g = 52 + n * 18;
      const b = 42 + n * 12;
      ctx.fillStyle = `rgb(${rd | 0},${g | 0},${b | 0})`;
      const x = col * tw + off;
      const y = r * th;
      wrapFill(ctx, x + 1, y + 1, tw - 2, th * 0.78, size);
      ctx.fillStyle = `rgba(255,180,140,${0.1 + n * 0.08})`;
      wrapFill(ctx, x + 2, y + 1, tw - 4, th * 0.18, size);
      ctx.fillStyle = "rgba(40,10,8,0.28)";
      wrapFill(ctx, x + 1, y + th * 0.7, tw - 2, th * 0.12, size);
    }
  }
  return c;
}

function asphaltCanvas(size = 512): HTMLCanvasElement | null {
  const c = makeCanvas(size);
  if (!c) return null;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const n = hash(x, y, 1);
      const n2 = hash(x >> 2, y >> 2, 3);
      const crack = hash(x >> 3, y, 8) > 0.985 ? 0.55 : 1;
      const v = (48 + n * 22 + n2 * 10) * crack;
      d[i] = v;
      d[i + 1] = v * 1.02;
      d[i + 2] = v * 1.05;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function grassCanvas(size = 512): HTMLCanvasElement | null {
  const c = makeCanvas(size);
  if (!c) return null;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#3d7a32";
  ctx.fillRect(0, 0, size, size);
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const n = hash(x, y, 2);
      const n2 = hash(x >> 3, y >> 3, 5);
      const blade = 0.75 + n * 0.4;
      const patch = 0.88 + n2 * 0.22;
      d[i] = 48 * blade * patch;
      d[i + 1] = 110 * blade * patch;
      d[i + 2] = 40 * blade * patch;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export function getCityTextures(): CityTextures {
  if (cache) return cache;
  const brick = brickCanvas();
  const concrete = concreteCanvas();
  const plaster = plasterCanvas();
  const roof = roofCanvas();
  const asphalt = asphaltCanvas();
  const grass = grassCanvas();
  cache = {
    brick: brick ? toTex(brick) : dummyTex(),
    concrete: concrete ? toTex(concrete) : dummyTex(),
    plaster: plaster ? toTex(plaster) : dummyTex(),
    roof: roof ? toTex(roof) : dummyTex(),
    asphalt: asphalt ? toTex(asphalt) : dummyTex(),
    grass: grass ? toTex(grass) : dummyTex(),
  };
  return cache;
}
