import * as THREE from "three";

/**
 * Texturas procedurales generadas en `<canvas>`, no ruido puro.
 *
 * El bump se calcula a partir de la luminancia de estas texturas (ver `bumpedNormal` en
 * materials.ts): cualquier variación de un solo píxel en el color se convierte directamente en
 * ruido de máxima frecuencia en la normal, y bajo muchas luces puntuales (ventanas, farolas) eso
 * se ve como purpurina parpadeante — la misma "estática de televisión" que ya se había
 * rechazado, solo que reintroducida por la vía del grano. Por eso aquí el ruido está limitado en
 * banda: se genera a baja resolución y se escala hacia arriba con suavizado, así que la variación
 * más fina siempre ocupa varios píxeles, nunca uno solo.
 *
 * Todas son en gris neutro (multiplican sobre el color de vértice, que sigue dando la paleta)
 * salvo la de hierba, que sí lleva tinte porque el terreno no usa esa mezcla de otro modo.
 * Se generan una vez y se cachean; siguen sin pedir nada por red.
 */

const SIZE = 512;

function ctx2d(size: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  return { canvas, ctx };
}

function toTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 4;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

let rngState = 1;
function rand(): number {
  rngState = (rngState * 1103515245 + 12345) & 0x7fffffff;
  return rngState / 0x7fffffff;
}
function seed(n: number) {
  rngState = n >>> 0 || 1;
}

/**
 * Ruido limitado en banda: se pinta a baja resolución (una celda cubre varios píxeles del
 * lienzo final) y se escala con suavizado, así el resultado son manchas suaves, nunca motas de
 * un solo píxel. `overlay` deja que aclare y oscurezca a la vez sobre lo que ya hay pintado.
 */
function paintSoftGrain(
  ctx: CanvasRenderingContext2D,
  size: number,
  cells: number,
  amp: number,
  alpha: number,
) {
  const off = document.createElement("canvas");
  off.width = cells;
  off.height = cells;
  const octx = off.getContext("2d")!;
  const img = octx.createImageData(cells, cells);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 128 + (rand() - 0.5) * amp * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  octx.putImageData(img, 0, 0);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = "overlay";
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(off, 0, 0, size, size);
  ctx.restore();
}

/** Panel de fachada: juntas horizontales regulares + relieve de placa suave. Gris neutro. */
function buildWallTexture(): THREE.CanvasTexture {
  const size = SIZE;
  const { canvas, ctx } = ctx2d(size);
  seed(101);
  ctx.fillStyle = "#b4b4b4";
  ctx.fillRect(0, 0, size, size);
  paintSoftGrain(ctx, size, 64, 0.16, 0.55);
  paintSoftGrain(ctx, size, 16, 0.1, 0.4);
  // Juntas horizontales de panel, con leve variación de altura (no todas iguales).
  const rows = 8;
  const rowH = size / rows;
  for (let r = 1; r < rows; r++) {
    const y = Math.round(r * rowH + (rand() - 0.5) * 5);
    ctx.strokeStyle = "rgba(70,70,70,0.5)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
    ctx.strokeStyle = "rgba(235,235,235,0.32)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, y + 3);
    ctx.lineTo(size, y + 3);
    ctx.stroke();
    // Sombra de contacto suave bajo cada junta: da volumen real a la placa sin depender solo
    // del bump.
    const shade = ctx.createLinearGradient(0, y + 4, 0, y + rowH * 0.35);
    shade.addColorStop(0, "rgba(40,40,40,0.14)");
    shade.addColorStop(1, "rgba(40,40,40,0)");
    ctx.fillStyle = shade;
    ctx.fillRect(0, y + 4, size, rowH * 0.35);
  }
  // Alguna junta vertical débil (despiece de placas).
  for (let c = 1; c < 4; c++) {
    const x = Math.round((c / 4) * size + (rand() - 0.5) * 6);
    ctx.strokeStyle = "rgba(70,70,70,0.22)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, size);
    ctx.stroke();
  }
  // Manchas de veta suave (desgaste): pocas, grandes y muy difusas — no chocan al repetir.
  for (let i = 0; i < 4; i++) {
    const x = rand() * size;
    const y = rand() * size * 0.5;
    const r = 60 + rand() * 90;
    const g = ctx.createRadialGradient(x, y, 0, x, y + r * 0.6, r);
    g.addColorStop(0, `rgba(55,55,55,${0.05 + rand() * 0.04})`);
    g.addColorStop(1, "rgba(55,55,55,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return toTexture(canvas);
}

/** Cubierta: filas de tejas/chapa con solape y sombreado por fila. Gris neutro. */
function buildRoofTexture(): THREE.CanvasTexture {
  const size = SIZE;
  const { canvas, ctx } = ctx2d(size);
  seed(202);
  ctx.fillStyle = "#8f8f8f";
  ctx.fillRect(0, 0, size, size);
  const rows = 14;
  const rowH = size / rows;
  for (let r = 0; r < rows; r++) {
    const y = r * rowH;
    const shade = 150 + Math.round((r % 2) * 10) + Math.round((rand() - 0.5) * 8);
    ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
    ctx.fillRect(0, y, size, rowH - 3);
    // Solape de teja: sombra en el borde inferior de cada fila.
    const overlap = ctx.createLinearGradient(0, y + rowH - 10, 0, y + rowH);
    overlap.addColorStop(0, "rgba(35,35,35,0)");
    overlap.addColorStop(1, "rgba(35,35,35,0.4)");
    ctx.fillStyle = overlap;
    ctx.fillRect(0, y + rowH - 10, size, 10);
    // Divisiones verticales alternadas (a hueso, como tejas individuales).
    const cols = 10;
    const offset = (r % 2) * (size / cols / 2);
    for (let c = 0; c <= cols; c++) {
      const x = (c / cols) * size + offset;
      ctx.strokeStyle = "rgba(30,30,30,0.16)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + rowH);
      ctx.stroke();
    }
  }
  paintSoftGrain(ctx, size, 96, 0.08, 0.35);
  return toTexture(canvas);
}

/** Asfalto: base oscura + áridos suaves + alguna grieta tenue. Gris neutro. */
function buildAsphaltTexture(): THREE.CanvasTexture {
  const size = SIZE;
  const { canvas, ctx } = ctx2d(size);
  seed(303);
  ctx.fillStyle = "#3c3c3e";
  ctx.fillRect(0, 0, size, size);
  paintSoftGrain(ctx, size, 80, 0.12, 0.6);
  paintSoftGrain(ctx, size, 24, 0.07, 0.4);
  // Áridos: motas con borde difuso (gradiente radial, no arco duro) para que no lean como
  // estática de un solo píxel al alimentar el bump.
  for (let i = 0; i < 480; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 1.8 + rand() * 2.6;
    const light = rand() > 0.5;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    if (light) {
      g.addColorStop(0, `rgba(185,185,185,${0.16 + rand() * 0.14})`);
    } else {
      g.addColorStop(0, `rgba(8,8,8,${0.2 + rand() * 0.16})`);
    }
    g.addColorStop(1, "rgba(128,128,128,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Un par de grietas capilares, muy tenues.
  for (let i = 0; i < 2; i++) {
    ctx.strokeStyle = "rgba(0,0,0,0.16)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    let x = rand() * size;
    let y = 0;
    ctx.moveTo(x, y);
    while (y < size) {
      x += (rand() - 0.5) * 30;
      y += 24 + rand() * 20;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  return toTexture(canvas);
}

/**
 * Detalle de terreno en gris neutro (como la de pared): briznas y variación de tierra, sin
 * tinte de color propio. El color de bioma (hierba, arena, roca) lo sigue dando la mezcla por
 * vértice del shader de terreno; esta textura solo aporta estructura y bump. Sin manchas
 * grandes: a la escala de un tile pequeño repetido por todo el mapa, un puñado de manchas
 * oscuras se ve como un patrón de moho al repetirse. La variación a gran escala ya la pone el
 * fbm del shader en espacio de mundo, que no se repite.
 */
function buildGroundTexture(): THREE.CanvasTexture {
  const size = SIZE;
  const { canvas, ctx } = ctx2d(size);
  seed(404);
  ctx.fillStyle = "#8c8c8c";
  ctx.fillRect(0, 0, size, size);
  paintSoftGrain(ctx, size, 56, 0.14, 0.55);
  paintSoftGrain(ctx, size, 18, 0.09, 0.4);
  // Briznas: trazos cortos con orientación aleatoria, claros y oscuros.
  for (let i = 0; i < 2600; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const len = 5 + rand() * 10;
    const a = rand() * Math.PI * 2;
    const dark = rand() > 0.55;
    ctx.strokeStyle = dark ? "rgba(60,60,60,0.4)" : "rgba(220,220,220,0.28)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
  return toTexture(canvas);
}

interface CityTextures {
  wall: THREE.CanvasTexture;
  roof: THREE.CanvasTexture;
  asphalt: THREE.CanvasTexture;
  ground: THREE.CanvasTexture;
}

let cache: CityTextures | null = null;

/** Genera (una vez) y devuelve el set de texturas compartido por toda la escena. */
export function getCityTextures(): CityTextures {
  if (cache) return cache;
  cache = {
    wall: buildWallTexture(),
    roof: buildRoofTexture(),
    asphalt: buildAsphaltTexture(),
    ground: buildGroundTexture(),
  };
  return cache;
}
