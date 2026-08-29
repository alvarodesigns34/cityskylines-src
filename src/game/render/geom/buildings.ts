import { DEFS, type BuildingDef, type StyleDef } from "../../sim/catalog";
import { hash2 } from "../../sim/rng";
import { PALETTES, type Palette } from "../palettes";
import { box, cyl, mergeParts, shade, type Part } from "./parts";
import * as THREE from "three";

/** La fachada principal de todos los modelos mira a −Z; la capa de render los gira hacia la calle. */
type Facing = "z-" | "z+" | "x-" | "x+";

interface Ctx {
  p: Palette;
  wall: number;
  variant: number;
  rnd: (n: number) => number;
  w: number;
  d: number;
  style: StyleDef;
}

function ctxFor(def: BuildingDef, variant: number): Ctx {
  const p = PALETTES[def.style.palette] ?? PALETTES.block!;
  const rnd = (n: number) => hash2(variant * 31 + n, n * 7 + 3, variant + 11);
  const wall = p.wall[Math.floor(rnd(0) * p.wall.length) % p.wall.length]!;
  return { p, wall, variant, rnd, w: def.w, d: def.d, style: def.style };
}

/* ------------------------------------------------------------------ ventanas */

interface FacadeOpts {
  out: Part[];
  ctx: Ctx;
  face: Facing;
  /** Centro de la fachada en el plano horizontal. */
  cx: number;
  cz: number;
  /** Semiancho del edificio en el eje de la fachada. */
  half: number;
  /** Distancia del centro a la fachada. */
  depth: number;
  y0: number;
  floors: number;
  floorH: number;
  style: StyleDef["windows"];
  /** Planta baja comercial. */
  shopFront?: boolean;
}

function facade(o: FacadeOpts) {
  const { out, ctx } = o;
  if (o.style === "none" || o.floors <= 0) return;
  const along = o.face === "z-" || o.face === "z+" ? "x" : "z";
  const sign = o.face === "z-" || o.face === "x-" ? -1 : 1;
  const wallW = o.half * 2;
  const t = 0.04;

  const put = (u: number, y: number, uw: number, h: number, color: number, emis: number, thick = t) => {
    const x = along === "x" ? o.cx + u : o.cx + sign * (o.depth + thick / 2);
    const z = along === "x" ? o.cz + sign * (o.depth + thick / 2) : o.cz + u;
    const sx = along === "x" ? uw : thick;
    const sz = along === "x" ? thick : uw;
    out.push(box(x, y, z, sx, h, sz, color, { emis }));
  };

  const glass = ctx.p.window;
  // Muchas plantas ⇒ bandas horizontales: mucho más barato y más creíble en altura.
  const ribbon = o.style === "ribbon" || o.floors > 7;

  for (let f = 0; f < o.floors; f++) {
    const y = o.y0 + f * o.floorH + o.floorH * 0.55;
    const groundShop = o.shopFront && f === 0;
    if (groundShop) {
      put(0, o.y0 + o.floorH * 0.45, wallW * 0.86, o.floorH * 0.6, glass, 0.85);
      // Toldo o rótulo.
      out.push(
        box(
          along === "x" ? o.cx : o.cx + sign * (o.depth + 0.06),
          o.y0 + o.floorH * 0.86,
          along === "x" ? o.cz + sign * (o.depth + 0.06) : o.cz,
          along === "x" ? wallW * 0.9 : 0.14,
          0.08,
          along === "x" ? 0.14 : wallW * 0.9,
          ctx.p.accent,
        ),
      );
      continue;
    }
    if (ribbon) {
      // Banda de vidrio con antepecho: la fachada sigue leyéndose clara desde lejos.
      const lit = 0.3 + ctx.rnd(f * 3 + 5) * 0.6;
      put(0, y, wallW * 0.74, o.floorH * 0.34, glass, lit);
      put(0, y - o.floorH * 0.3, wallW * 0.78, o.floorH * 0.1, ctx.p.trim, 0, t * 0.7);
      continue;
    }
    const cols = Math.max(1, Math.round(wallW / 0.58));
    const winW = Math.min(0.26, (wallW * 0.62) / cols);
    const shutters = o.style === "grid" && o.floors <= 3 && wallW < 2.2;
    for (let c = 0; c < cols; c++) {
      const u = -wallW / 2 + (wallW / cols) * (c + 0.5);
      const seed = f * 13 + c * 7;
      const lit = ctx.rnd(seed) > 0.45 ? 0.5 + ctx.rnd(seed + 1) * 0.5 : 0.05;
      put(u, y, winW, o.floorH * 0.34, glass, lit);
      put(u, y + o.floorH * 0.22, winW * 1.24, o.floorH * 0.05, ctx.p.trim, 0, t * 0.6);
      put(u, y - o.floorH * 0.2, winW * 1.18, o.floorH * 0.04, shade(ctx.p.trim, -0.08), 0, t * 0.5);
      if (shutters) {
        put(u - winW * 0.72, y, winW * 0.26, o.floorH * 0.32, ctx.p.accent, 0, t * 0.7);
        put(u + winW * 0.72, y, winW * 0.26, o.floorH * 0.32, ctx.p.accent, 0, t * 0.7);
      }
    }
  }
}

function allFacades(
  out: Part[],
  ctx: Ctx,
  hw: number,
  hd: number,
  y0: number,
  floors: number,
  floorH: number,
  style: StyleDef["windows"],
  shopFront = false,
) {
  facade({ out, ctx, face: "z-", cx: 0, cz: 0, half: hw, depth: hd, y0, floors, floorH, style, shopFront });
  facade({ out, ctx, face: "z+", cx: 0, cz: 0, half: hw, depth: hd, y0, floors, floorH, style });
  facade({ out, ctx, face: "x-", cx: 0, cz: 0, half: hd, depth: hw, y0, floors, floorH, style });
  facade({ out, ctx, face: "x+", cx: 0, cz: 0, half: hd, depth: hw, y0, floors, floorH, style });
}

/* ------------------------------------------------------------------ remates */

function roofFurniture(out: Part[], ctx: Ctx, hw: number, hd: number, y: number, count = 2) {
  for (let i = 0; i < count; i++) {
    const rx = (ctx.rnd(i * 5 + 20) - 0.5) * hw * 1.2;
    const rz = (ctx.rnd(i * 5 + 21) - 0.5) * hd * 1.2;
    const s = 0.16 + ctx.rnd(i * 5 + 22) * 0.2;
    out.push(box(rx, y + s * 0.5, rz, s, s, s * 0.8, shade(ctx.p.base, -0.06)));
  }
}

function parapet(out: Part[], ctx: Ctx, hw: number, hd: number, y: number) {
  const t = 0.06;
  const h = 0.16;
  out.push(box(0, y + h / 2, -hd, hw * 2 + t, h, t, ctx.p.trim));
  out.push(box(0, y + h / 2, hd, hw * 2 + t, h, t, ctx.p.trim));
  out.push(box(-hw, y + h / 2, 0, t, h, hd * 2, ctx.p.trim));
  out.push(box(hw, y + h / 2, 0, t, h, hd * 2, ctx.p.trim));
}

/* ------------------------------------------------------------------ formas */

function house(ctx: Ctx): Part[] {
  const out: Part[] = [];
  const fill = (ctx.style.fill ?? 0.65) * (0.92 + ctx.rnd(8) * 0.16);
  const hw = (ctx.w * fill) / 2;
  const hd = (ctx.d * fill) / 2;
  const floors = ctx.style.floors;
  const fh = ctx.style.floorH;
  const bodyH = floors * fh;
  const roofKind = ctx.rnd(1) > 0.62 ? ctx.style.roof : ctx.rnd(2) > 0.55 ? "hip" : "gable";

  out.push(box(0, 0.04, 0, hw * 2 + 0.16, 0.08, hd * 2 + 0.16, ctx.p.base));
  out.push(box(0, bodyH / 2 + 0.06, 0, hw * 2, bodyH, hd * 2, ctx.wall));
  allFacades(out, ctx, hw, hd, 0.06, floors, fh, "grid");

  const roofY = bodyH + 0.06;
  if (roofKind === "gable") {
    out.push({ g: "gable", x: 0, y: roofY, z: 0, sx: hw * 2 + 0.34, sy: 0.46 + ctx.rnd(3) * 0.22, sz: hd * 2 + 0.28, color: ctx.p.roof, ry: ctx.rnd(4) > 0.5 ? Math.PI / 2 : 0 });
  } else if (roofKind === "hip") {
    out.push({ g: "hip", x: 0, y: roofY, z: 0, sx: hw * 2 + 0.3, sy: 0.4 + ctx.rnd(3) * 0.16, sz: hd * 2 + 0.28, color: ctx.p.roof });
  } else {
    out.push(box(0, roofY + 0.05, 0, hw * 2 + 0.2, 0.1, hd * 2 + 0.2, ctx.p.roof));
  }
  out.push(box(hw * (ctx.rnd(6) - 0.5), roofY + 0.36, -hd * 0.3, 0.12, 0.44, 0.12, shade(ctx.p.roof, -0.08)));
  out.push(box(0, 0.06 + fh * 0.34, -hd - 0.02, 0.2, fh * 0.62, 0.05, ctx.p.accent));
  const hedge = 0.9;
  out.push(box(0, 0.12, -ctx.d / 2 + 0.08, ctx.w * hedge, 0.16, 0.1, 0x3d7a38));
  out.push(box(0, 0.045, -ctx.d / 2 + 0.2, 0.18, 0.03, 0.32, 0x9a9080));
  if (ctx.rnd(16) > 0.35) {
    out.push(box(hw * 0.45, 0.08 + fh * 0.18, -hd - 0.05, 0.22, 0.05, 0.06, 0x6b5344));
    out.push(box(hw * 0.45, 0.12 + fh * 0.18, -hd - 0.05, 0.2, 0.05, 0.05, 0x3f8a40));
  }
  if (roofKind === "gable" && ctx.rnd(17) > 0.42) {
    const dx = (ctx.rnd(18) - 0.5) * hw * 0.7;
    out.push(box(dx, roofY + 0.2, -hd * 0.12, 0.24, 0.3, 0.3, ctx.wall));
    out.push(box(dx, roofY + 0.22, -hd * 0.28, 0.12, 0.14, 0.04, ctx.p.window, { emis: 0.45 }));
    out.push({ g: "gable", x: dx, y: roofY + 0.35, z: -hd * 0.12, sx: 0.28, sy: 0.16, sz: 0.34, color: ctx.p.roof });
  }
  if (ctx.rnd(12) > 0.38 && ctx.w >= 1) {
    const gx = hw + 0.18;
    const gh = fh * (0.55 + ctx.rnd(13) * 0.25);
    out.push(box(gx, gh / 2 + 0.06, 0.05, 0.34, gh, hd * 1.15, shade(ctx.wall, -0.05)));
    out.push(box(gx, 0.06 + gh * 0.42, -hd * 0.55, 0.26, gh * 0.7, 0.04, 0x3a3f46));
    out.push(box(gx, gh + 0.1, 0.05, 0.38, 0.08, hd * 1.2, ctx.p.roof));
  }
  return out;
}

function row(ctx: Ctx): Part[] {
  const out: Part[] = [];
  const fill = ctx.style.fill ?? 0.8;
  const totalW = ctx.w * fill;
  const hd = (ctx.d * fill) / 2;
  const units = Math.max(2, Math.round(totalW / 0.5));
  const uw = totalW / units;
  const floors = ctx.style.floors;
  const fh = ctx.style.floorH;

  out.push(box(0, 0.04, 0, totalW + 0.12, 0.08, hd * 2 + 0.12, ctx.p.base));
  for (let i = 0; i < units; i++) {
    const x = -totalW / 2 + uw * (i + 0.5);
    const f = floors + (ctx.rnd(i) > 0.72 ? 1 : 0);
    const h = f * fh;
    const wall = ctx.p.wall[(i + ctx.variant) % ctx.p.wall.length]!;
    out.push(box(x, h / 2 + 0.06, 0, uw * 0.97, h, hd * 2, wall));
    facade({
      out, ctx, face: "z-", cx: x, cz: 0, half: (uw * 0.97) / 2, depth: hd,
      y0: 0.06, floors: f, floorH: fh, style: ctx.style.windows,
      shopFront: ctx.style.windows === "shop",
    });
    facade({
      out, ctx, face: "z+", cx: x, cz: 0, half: (uw * 0.97) / 2, depth: hd,
      y0: 0.06, floors: f, floorH: fh, style: ctx.style.windows,
    });
    if (ctx.style.roof === "gable") {
      out.push({ g: "gable", x, y: h + 0.06, z: 0, sx: uw, sy: 0.26, sz: hd * 2 + 0.14, color: ctx.p.roof, ry: Math.PI / 2 });
    } else {
      out.push(box(x, h + 0.11, 0, uw * 1.0, 0.1, hd * 2 + 0.12, ctx.p.roof));
    }
  }
  return out;
}

function blockShape(ctx: Ctx): Part[] {
  const out: Part[] = [];
  const fill = ctx.style.fill ?? 0.84;
  const hw = (ctx.w * fill) / 2;
  const hd = (ctx.d * fill) / 2;
  const floors = ctx.style.floors + Math.round((ctx.rnd(2) - 0.5) * 2);
  const fh = ctx.style.floorH;
  const h = Math.max(2, floors) * fh;

  out.push(box(0, 0.05, 0, hw * 2 + 0.14, 0.1, hd * 2 + 0.14, ctx.p.base));
  out.push(box(0, h / 2 + 0.1, 0, hw * 2, h, hd * 2, ctx.wall));
  out.push(box(0, 0.1 + fh * 0.5, 0, hw * 2 + 0.05, fh, hd * 2 + 0.05, shade(ctx.wall, -0.07)));
  allFacades(out, ctx, hw, hd, 0.1, Math.max(2, floors), fh, ctx.style.windows, ctx.style.windows === "shop");
  for (let f = 2; f < Math.max(2, floors); f += 3) {
    const y = 0.1 + f * fh;
    out.push(box(0, y, 0, hw * 2 + 0.05, 0.06, hd * 2 + 0.05, ctx.p.trim));
  }
  out.push(box(-hw, h / 2 + 0.1, -hd, 0.07, h, 0.07, shade(ctx.p.trim, -0.04)));
  out.push(box(hw, h / 2 + 0.1, -hd, 0.07, h, 0.07, shade(ctx.p.trim, -0.04)));

  if (ctx.style.balconies) {
    for (let f = 1; f < Math.max(2, floors); f++) {
      const y = 0.1 + f * fh + fh * 0.25;
      out.push(box(0, y, -hd - 0.11, hw * 1.5, 0.05, 0.2, ctx.p.trim));
      out.push(box(0, y + 0.11, -hd - 0.2, hw * 1.5, 0.18, 0.03, shade(ctx.p.trim, -0.12)));
    }
  }
  const top = h + 0.1;
  if (ctx.style.roof === "parapet") parapet(out, ctx, hw, hd, top);
  else out.push(box(0, top + 0.05, 0, hw * 2 + 0.1, 0.1, hd * 2 + 0.1, ctx.p.roof));
  roofFurniture(out, ctx, hw, hd, top, 3);
  return out;
}

function tower(ctx: Ctx): Part[] {
  const out: Part[] = [];
  const fill = ctx.style.fill ?? 0.75;
  const setback = ctx.style.setback ?? 0.15;
  const fh = ctx.style.floorH;
  const floors = ctx.style.floors + Math.round((ctx.rnd(2) - 0.5) * 6);
  const podiumFloors = 2;
  const shaftFloors = Math.max(4, floors - podiumFloors);

  const phw = (ctx.w * Math.min(0.94, fill + 0.16)) / 2;
  const phd = (ctx.d * Math.min(0.94, fill + 0.16)) / 2;
  const podiumH = podiumFloors * fh;
  out.push(box(0, 0.05, 0, phw * 2 + 0.14, 0.1, phd * 2 + 0.14, ctx.p.base));
  out.push(box(0, podiumH / 2 + 0.1, 0, phw * 2, podiumH, phd * 2, shade(ctx.wall, -0.05)));
  allFacades(out, ctx, phw, phd, 0.1, podiumFloors, fh, "shop", true);
  out.push(box(0, podiumH + 0.14, 0, phw * 2 + 0.1, 0.08, phd * 2 + 0.1, ctx.p.trim));

  // Cuerpo principal, con uno o dos retranqueos.
  let hw = (ctx.w * fill) / 2;
  let hd = (ctx.d * fill) / 2;
  let y = podiumH + 0.18;
  const stages = shaftFloors > 14 ? 3 : 2;
  let remaining = shaftFloors;
  for (let s = 0; s < stages; s++) {
    const f = s === stages - 1 ? remaining : Math.ceil(remaining / (stages - s) * (0.9 + ctx.rnd(s) * 0.2));
    const fClamped = Math.max(2, Math.min(remaining, f));
    remaining -= fClamped;
    const h = fClamped * fh;
    out.push(box(0, y + h / 2, 0, hw * 2, h, hd * 2, ctx.wall));
    allFacades(out, ctx, hw, hd, y, fClamped, fh, ctx.style.windows);
    // Nervios verticales que rompen la caja.
    out.push(box(-hw, y + h / 2, 0, 0.06, h, hd * 2 + 0.04, ctx.p.trim));
    out.push(box(hw, y + h / 2, 0, 0.06, h, hd * 2 + 0.04, ctx.p.trim));
    y += h;
    if (remaining <= 0) break;
    out.push(box(0, y + 0.04, 0, hw * 2 + 0.08, 0.08, hd * 2 + 0.08, ctx.p.trim));
    y += 0.08;
    hw *= 1 - setback;
    hd *= 1 - setback;
  }
  parapet(out, ctx, hw, hd, y);
  out.push(box(0, y + 0.22, 0, hw * 1.1, 0.36, hd * 1.1, shade(ctx.wall, -0.08)));
  out.push(box(0, y + 0.42, 0, hw * 0.7, 0.08, hd * 0.7, ctx.p.roof));
  roofFurniture(out, ctx, hw, hd, y + 0.42, 3);
  if (ctx.style.antenna) {
    out.push(cyl(0, y + 0.9, 0, 0.035, 1.8, 0x9aa0a6));
    out.push({ g: "sphere", x: 0, y: y + 1.82, z: 0, sx: 0.07, sy: 0.07, sz: 0.07, color: 0xff5a4a, emis: 1, seg: 6 });
  }
  return out;
}

function shed(ctx: Ctx): Part[] {
  const out: Part[] = [];
  const fill = ctx.style.fill ?? 0.88;
  const hw = (ctx.w * fill) / 2;
  const hd = (ctx.d * fill) / 2;
  const h = ctx.style.floors * ctx.style.floorH;

  out.push(box(0, 0.05, 0, hw * 2 + 0.2, 0.1, hd * 2 + 0.2, ctx.p.base));
  out.push(box(0, h / 2 + 0.1, 0, hw * 2, h, hd * 2, ctx.wall));
  // Banda de ventanas alta.
  if (ctx.style.windows !== "none") {
    allFacades(out, ctx, hw, hd, 0.1, 1, h, ctx.style.windows, ctx.style.windows === "shop");
  }
  // Portones de carga en la fachada principal.
  const doors = Math.max(1, Math.round(hw));
  for (let i = 0; i < doors; i++) {
    const x = -hw + ((hw * 2) / doors) * (i + 0.5);
    out.push(box(x, 0.1 + h * 0.26, -hd - 0.03, Math.min(0.42, (hw * 1.6) / doors), h * 0.5, 0.06, shade(ctx.p.base, -0.1)));
  }
  const top = h + 0.1;
  if (ctx.style.roof === "saw") {
    const bays = Math.max(2, Math.round(hd * 2 / 0.55));
    for (let i = 0; i < bays; i++) {
      const z = -hd + ((hd * 2) / bays) * (i + 0.5);
      out.push(box(0, top + 0.16, z, hw * 2, 0.32, (hd * 2) / bays * 0.55, ctx.p.roof, { rx: -0.5 }));
      out.push(box(0, top + 0.2, z + 0.09, hw * 1.9, 0.2, 0.03, ctx.p.window, { emis: 0.35 }));
    }
  } else if (ctx.style.roof === "gable") {
    out.push({ g: "gable", x: 0, y: top, z: 0, sx: hw * 2 + 0.16, sy: 0.4, sz: hd * 2 + 0.16, color: ctx.p.roof, ry: Math.PI / 2 });
  } else {
    out.push(box(0, top + 0.06, 0, hw * 2 + 0.14, 0.12, hd * 2 + 0.14, ctx.p.roof));
  }
  addChimneys(out, ctx, hw, hd, top);
  return out;
}

function civic(ctx: Ctx): Part[] {
  const out: Part[] = [];
  const fill = ctx.style.fill ?? 0.82;
  const hw = (ctx.w * fill) / 2;
  const hd = (ctx.d * fill) / 2;
  const floors = ctx.style.floors;
  const fh = ctx.style.floorH;
  const h = floors * fh;

  // Zócalo con escalinata.
  out.push(box(0, 0.06, 0, hw * 2 + 0.3, 0.12, hd * 2 + 0.3, ctx.p.base));
  out.push(box(0, 0.16, -hd - 0.16, hw * 1.1, 0.08, 0.3, shade(ctx.p.base, 0.06)));
  out.push(box(0, h / 2 + 0.12, 0, hw * 2, h, hd * 2, ctx.wall));
  allFacades(out, ctx, hw, hd, 0.12, floors, fh, ctx.style.windows);

  // Pórtico de entrada con columnas.
  const cols = Math.max(3, Math.round(hw * 2.6));
  const porchZ = -hd - 0.22;
  for (let i = 0; i < cols; i++) {
    const x = -hw * 0.85 + ((hw * 1.7) / (cols - 1)) * i;
    out.push(cyl(x, 0.12 + fh * 0.85, porchZ, 0.06, fh * 1.7, ctx.p.trim, { seg: 7 }));
  }
  out.push(box(0, 0.12 + fh * 1.78, porchZ, hw * 1.95, 0.16, 0.42, ctx.p.trim));
  out.push(box(0, 0.12 + fh * 0.75, -hd - 0.02, hw * 0.6, fh * 1.3, 0.06, ctx.p.window, { emis: 0.6 }));

  const top = h + 0.12;
  if (ctx.style.roof === "hip") {
    out.push({ g: "hip", x: 0, y: top, z: 0, sx: hw * 2 + 0.2, sy: 0.5, sz: hd * 2 + 0.2, color: ctx.p.roof });
    out.push(cyl(0, top + 0.75, 0, 0.09, 0.5, ctx.p.accent, { seg: 8 }));
    out.push({ g: "sphere", x: 0, y: top + 1.02, z: 0, sx: 0.1, sy: 0.1, sz: 0.1, color: ctx.p.accent, seg: 8 });
  } else {
    out.push(box(0, top + 0.06, 0, hw * 2 + 0.16, 0.12, hd * 2 + 0.16, ctx.p.roof));
    parapet(out, ctx, hw, hd, top + 0.12);
  }
  // Bandera / rótulo.
  out.push(box(-hw * 0.75, top + 0.3, -hd * 0.6, 0.04, 0.6, 0.04, 0x8a9095));
  out.push(box(-hw * 0.75 + 0.13, top + 0.5, -hd * 0.6, 0.24, 0.16, 0.02, ctx.p.accent));
  return out;
}

function plant(ctx: Ctx): Part[] {
  const out: Part[] = [];
  const fill = ctx.style.fill ?? 0.92;
  const hw = (ctx.w * fill) / 2;
  const hd = (ctx.d * fill) / 2;
  const fh = ctx.style.floorH;
  const h = ctx.style.floors * fh;
  const flip = ctx.rnd(40) > 0.5 ? 1 : -1;

  out.push(box(0, 0.05, 0, ctx.w * 0.98, 0.1, ctx.d * 0.98, shade(ctx.p.base, -0.08)));
  // Nave principal desplazada, para que no sea una caja centrada.
  const bodyW = hw * 1.25;
  const bodyD = hd * 1.5;
  out.push(box(-hw * 0.35 * flip, h / 2 + 0.1, 0, bodyW, h, bodyD, ctx.wall));
  facade({
    out,
    ctx,
    face: "z-",
    cx: -hw * 0.35 * flip,
    cz: 0,
    half: bodyW / 2,
    depth: bodyD / 2,
    y0: 0.1,
    floors: ctx.style.floors,
    floorH: fh,
    style: ctx.style.windows,
  });
  out.push(box(-hw * 0.35 * flip, h + 0.16, 0, bodyW + 0.12, 0.12, bodyD + 0.12, ctx.p.roof));

  // Depósitos cilíndricos al otro lado de la nave. El lado cambia con la variante.
  const tanks = 2 + (ctx.rnd(41) > 0.65 ? 1 : 0);
  for (let i = 0; i < tanks; i++) {
    const x = hw * 0.55 * flip;
    const z = -hd * 0.55 + i * ((hd * 1.1) / Math.max(1, tanks - 1));
    const r = Math.min(0.34, hw * (0.26 + ctx.rnd(42 + i) * 0.08));
    const hh = h * (0.7 + ctx.rnd(43 + i) * 0.35);
    out.push(cyl(x, 0.1 + hh * 0.5, z, r, hh, shade(ctx.p.trim, -0.04), { seg: 10 }));
    out.push(cyl(x, 0.1 + hh, z, r * 1.06, 0.08, ctx.p.accent, { seg: 10 }));
  }
  // Anejo bajo en algunas variantes: rompe la silueta de "dos silos y una caja".
  if (ctx.rnd(44) > 0.4) {
    const ax = hw * 0.15 * flip;
    const ah = h * 0.42;
    out.push(box(ax, ah / 2 + 0.08, hd * 0.55, hw * 0.7, ah, hd * 0.45, shade(ctx.wall, 0.06)));
    out.push(box(ax, ah + 0.12, hd * 0.55, hw * 0.74, 0.08, hd * 0.48, ctx.p.roof));
  }
  out.push(box(hw * 0.1 * flip, 0.1 + h * 0.78, 0, hw * 0.9, 0.07, 0.12, 0x8a9095));
  out.push(box(-hw * 0.35 * flip, 0.1 + h * 0.5, -bodyD / 2 - 0.06, bodyW * 0.9, 0.05, 0.1, 0x8a9095));
  addChimneys(out, ctx, hw, hd, h + 0.2);
  return out;
}

function addChimneys(out: Part[], ctx: Ctx, hw: number, hd: number, y: number) {
  const n = ctx.style.chimneys ?? 0;
  for (let i = 0; i < n; i++) {
    const x = -hw * 0.5 + (hw / Math.max(1, n - 1 || 1)) * i * 1.4;
    const z = hd * (0.2 + ctx.rnd(i + 30) * 0.5);
    const hh = 1.1 + ctx.rnd(i + 31) * 1.5;
    const r = 0.09 + ctx.rnd(i + 32) * 0.06;
    out.push(cyl(x, y + hh / 2, z, r, hh, shade(ctx.p.base, -0.05), { seg: 8 }));
    out.push(cyl(x, y + hh - 0.05, z, r * 1.16, 0.12, shade(ctx.p.accent, -0.1), { seg: 8 }));
    // Baliza roja.
    out.push({ g: "sphere", x, y: y + hh + 0.06, z, sx: r * 0.42, sy: 0, sz: 0, color: 0xff4a3a, emis: 1, seg: 6 });
  }
}

/** Composiciones a ras de suelo: parques, solar, vertedero, eólica. */
function flat(ctx: Ctx, kind: string): Part[] {
  const out: Part[] = [];
  const W = ctx.w;
  const D = ctx.d;
  const fill = ctx.style.fill ?? 0.95;

  if (kind === "power_solar") {
    out.push(box(0, 0.03, 0, W * fill, 0.06, D * fill, 0x4a4d4a));
    const rows = Math.max(2, Math.round(D * 1.6));
    for (let r = 0; r < rows; r++) {
      const z = -D * fill * 0.5 + (D * fill / rows) * (r + 0.5);
      out.push(box(0, 0.22, z, W * fill * 0.92, 0.04, (D * fill) / rows * 0.6, 0x1f3350, { rx: -0.42 }));
      out.push(box(0, 0.1, z, W * fill * 0.9, 0.12, 0.03, 0x8a9095));
    }
    return out;
  }
  if (kind === "power_wind") {
    out.push(box(0, 0.03, 0, W * 0.96, 0.06, D * 0.96, 0x5d7a4a));
    for (let i = 0; i < 3; i++) {
      const x = (ctx.rnd(i) - 0.5) * W * 0.6;
      const z = (ctx.rnd(i + 5) - 0.5) * D * 0.6;
      const hh = 2.1 + ctx.rnd(i + 9) * 0.7;
      out.push(cyl(x, hh / 2, z, 0.05, hh, 0xeceae4, { seg: 7 }));
      out.push(box(x, hh + 0.05, z, 0.16, 0.13, 0.24, 0xdedad2));
      for (let b = 0; b < 3; b++) {
        const a = (b / 3) * Math.PI * 2 + ctx.rnd(i + 2) * 3;
        out.push(box(x + Math.cos(a) * 0.42, hh + 0.05 + Math.sin(a) * 0.42, z + 0.14, 0.86, 0.07, 0.03, 0xf2f0ea, { rz: a }));
      }
    }
    return out;
  }
  if (kind === "landfill") {
    out.push(box(0, 0.04, 0, W * 0.98, 0.08, D * 0.98, 0x6b6152));
    for (let i = 0; i < 7; i++) {
      const x = (ctx.rnd(i) - 0.5) * W * 0.72;
      const z = (ctx.rnd(i + 11) - 0.5) * D * 0.72;
      const s = 0.3 + ctx.rnd(i + 21) * 0.55;
      out.push({ g: "cone", x, y: s * 0.4, z, sx: s * 0.75, sy: s * 0.8, sz: s * 0.75, color: i % 2 ? 0x7d7566 : 0x6a6a58, seg: 6 });
    }
    out.push(box(0, 0.22, -D / 2 + 0.1, W * 0.9, 0.36, 0.05, 0x8a8f7a));
    return out;
  }
  // Parques y plazas.
  const green = ctx.p.wall[0]!;
  out.push(box(0, 0.04, 0, W * fill, 0.08, D * fill, green));
  out.push(box(0, 0.06, 0, W * fill * 0.24, 0.05, D * fill, ctx.p.trim));
  out.push(box(0, 0.06, 0, W * fill, 0.05, D * fill * 0.24, ctx.p.trim));
  const trees = Math.round(W * D * 1.6);
  for (let i = 0; i < trees; i++) {
    const x = (ctx.rnd(i) - 0.5) * W * 0.82;
    const z = (ctx.rnd(i + 40) - 0.5) * D * 0.82;
    if (Math.abs(x) < W * 0.14 || Math.abs(z) < D * 0.14) continue;
    const s = 0.72 + ctx.rnd(i + 60) * 0.5;
    out.push(cyl(x, 0.16 * s, z, 0.035, 0.32 * s, 0x6b5344, { seg: 5 }));
    out.push({ g: "sphere", x, y: 0.44 * s, z, sx: 0.2 * s, sy: 0, sz: 0, color: i % 3 ? 0x3f7f45 : 0x4d8c46, seg: 7 });
  }
  if (W >= 2) {
    // Estanque y bancos.
    out.push(box(-W * 0.26, 0.07, D * 0.26, W * 0.34, 0.05, D * 0.28, 0x3f7f9a));
    for (let i = 0; i < 3; i++) {
      out.push(box(W * 0.2, 0.13, -D * 0.3 + i * 0.34, 0.26, 0.06, 0.09, ctx.p.accent));
    }
    out.push(cyl(0, 0.2, 0, 0.05, 0.42, 0x8a9095, { seg: 6 }));
    out.push({ g: "sphere", x: 0, y: 0.46, z: 0, sx: 0.08, sy: 0, sz: 0, color: 0xfff2cc, emis: 1, seg: 6 });
  }
  return out;
}

function waterTower(ctx: Ctx): Part[] {
  const out: Part[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    out.push(cyl(Math.cos(a) * 0.16, 0.42, Math.sin(a) * 0.16, 0.028, 0.84, 0x8a9095, { seg: 5 }));
  }
  out.push(cyl(0, 0.86, 0, 0.3, 0.14, 0x8a9095, { seg: 12 }));
  out.push(cyl(0, 1.14, 0, 0.3, 0.44, ctx.p.accent, { seg: 12 }));
  out.push({ g: "cone", x: 0, y: 1.5, z: 0, sx: 0.33, sy: 0.24, sz: 0.33, color: shade(ctx.p.accent, -0.12), seg: 12 });
  out.push({ g: "sphere", x: 0, y: 1.66, z: 0, sx: 0.05, sy: 0, sz: 0, color: 0xff4a3a, emis: 1, seg: 6 });
  return out;
}

/* ------------------------------------------------------------------ API */

export function partsForBuilding(kind: string, variant: number): Part[] {
  const def = DEFS[kind];
  if (!def) return [box(0, 0.3, 0, 0.6, 0.6, 0.6, 0x888888)];
  const ctx = ctxFor(def, variant);
  if (kind === "water_tower") return waterTower(ctx);
  switch (def.style.shape) {
    case "house":
      return house(ctx);
    case "row":
      return row(ctx);
    case "block":
      return blockShape(ctx);
    case "tower":
      return tower(ctx);
    case "shed":
      return shed(ctx);
    case "civic":
      return civic(ctx);
    case "plant":
      return plant(ctx);
    default:
      return flat(ctx, kind);
  }
}

/** Cuántas variantes visuales tiene cada familia. */
export function variantsFor(kind: string): number {
  const def = DEFS[kind];
  if (!def) return 1;
  if (def.style.shape === "house" || def.style.shape === "row") return 8;
  if (def.zone !== "none") return 5;
  return 2;
}

/** Caja simplificada para edificios lejos de la cámara. */
export function lodGeometry(kind: string): THREE.BufferGeometry {
  const def = DEFS[kind];
  const key = `lod:${kind}`;
  let g = cache.get(key);
  if (g) return g;
  if (!def) {
    g = mergeParts([box(0, 0.3, 0, 0.6, 0.6, 0.6, 0x888888)]);
    cache.set(key, g);
    return g;
  }
  const ctx = ctxFor(def, 0);
  const fill = ctx.style.fill ?? 0.8;
  const hw = (ctx.w * fill) / 2;
  const hd = (ctx.d * fill) / 2;
  if (ctx.style.shape === "flat") {
    g = mergeParts([box(0, 0.07, 0, hw * 2, 0.14, hd * 2, ctx.wall)]);
  } else {
    const h = Math.max(0.7, ctx.style.floors * ctx.style.floorH);
    g = mergeParts([
      box(0, h / 2 + 0.05, 0, hw * 2, h, hd * 2, ctx.wall),
      box(0, h + 0.1, 0, hw * 2 + 0.08, 0.1, hd * 2 + 0.08, ctx.p.roof),
    ]);
  }
  cache.set(key, g);
  return g;
}

const cache = new Map<string, THREE.BufferGeometry>();

export function buildingGeometry(kind: string, variant: number): THREE.BufferGeometry {
  const v = variant % variantsFor(kind);
  const key = `${kind}:${v}`;
  let g = cache.get(key);
  if (!g) {
    g = mergeParts(partsForBuilding(kind, v));
    cache.set(key, g);
  }
  return g;
}

/** Puntos de emisión de humo (chimeneas) en coordenadas locales del modelo. */
export function chimneysFor(kind: string, variant: number): Array<[number, number, number]> {
  const def = DEFS[kind];
  if (!def || !def.style.chimneys) return [];
  const parts = partsForBuilding(kind, variant % variantsFor(kind));
  const out: Array<[number, number, number]> = [];
  for (const p of parts) {
    if (p.g === "cyl" && p.color === 0xff4a3a) continue;
    if (p.g === "sphere" && p.emis === 1 && p.sx < 0.09) out.push([p.x, p.y, p.z]);
  }
  return out.slice(0, def.style.chimneys);
}

export function disposeBuildingGeometries() {
  for (const g of cache.values()) g.dispose();
  cache.clear();
}
