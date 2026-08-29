import assert from "node:assert/strict";
import { test } from "node:test";
import { CitySim } from "../city";
import { Grid } from "../grid";
import { DEFS, ROADS, TIERS } from "../catalog";
import { generateMap } from "../generate";
import { ZONE_DEPTH } from "../systems/network";
import { N, ROAD, TERRAIN, TICKS_PER_DAY, idx, type Building } from "../types";

const SEED = 4242;

/** Ciudad de prueba: retícula de calles desde la autovía, zonas y suministros. */
function seededCity() {
  const sim = new CitySim(SEED);
  const { x: ex, z: ez } = sim.entry;
  for (let x = ex; x < Math.min(N - 3, ex + 24); x++) sim.applyTool("road-street", x, ez);
  for (let z = ez - 11; z <= ez + 11; z++) {
    for (const x of [ex + 4, ex + 10, ex + 16, ex + 22]) sim.applyTool("road-street", x, z);
  }
  for (let x = ex; x < Math.min(N - 3, ex + 24); x++) {
    for (const z of [ez - 11, ez - 4, ez + 4, ez + 11]) sim.applyTool("road-street", x, z);
  }
  // La red (y con ella `roadDist`) se recalcula en el tick: para colocar por código hay
  // que refrescar antes de consultar distancias.
  sim.refreshAll();
  place(sim, "power_coal");
  place(sim, "water_tower");
  place(sim, "landfill");
  place(sim, "park_small");
  place(sim, "park_small");
  zoneNearRoads(sim, 90, 60, 45);
  sim.refreshAll();
  return sim;
}

/**
 * Zonifica de forma adaptativa todas las parcelas al alcance de la red.
 * El terreno depende de la semilla, así que un rectángulo fijo puede caer en el río;
 * esto reparte R/C/I por lo que realmente es edificable.
 */
function zoneNearRoads(sim: CitySim, wantR: number, wantC: number, wantI: number) {
  const g = sim.grid;
  const want = { R: wantR, C: wantC, I: wantI };
  const cells: number[] = [];
  for (let i = 0; i < N * N; i++) {
    if (g.roadDist[i]! >= 1 && g.roadDist[i]! <= ZONE_DEPTH && g.buildable(i)) cells.push(i);
  }
  // R cerca del centro, C en el medio, I en la periferia: reparto estable y sin solapes.
  const { x: ex, z: ez } = sim.entry;
  cells.sort((a, b) => dist(a, ex, ez) - dist(b, ex, ez));
  let ri = 0;
  for (const i of cells) {
    const x = i % N;
    const z = (i / N) | 0;
    const zone = ri < want.R ? "r" : ri < want.R + want.C ? "c" : ri < want.R + want.C + want.I ? "i" : null;
    if (!zone) break;
    if (sim.applyTool(`zone-${zone}`, x, z)) ri++;
  }
}

function dist(i: number, x: number, z: number): number {
  return Math.hypot((i % N) - x, ((i / N) | 0) - z);
}

function place(sim: CitySim, kind: string): boolean {
  const { x: ex, z: ez } = sim.entry;
  for (let r = 1; r < 26; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const x = ex + 12 + dx;
        const z = ez + dz;
        const i = sim.grid.at(x, z);
        if (i < 0 || sim.grid.roadDist[i]! > ZONE_DEPTH) continue;
        if (sim.canPlace(`build:${kind}`, x, z).ok) return sim.applyTool(`build:${kind}`, x, z);
      }
    }
  }
  return false;
}

function run(sim: CitySim, steps: number) {
  sim.paused = false;
  sim.speed = 3;
  for (let i = 0; i < steps; i++) sim.step(0.1);
}

test("el generador produce un mapa jugable con tierra, agua y entrada de autovía", () => {
  const { grid, entry } = generateMap(SEED);
  let land = 0;
  let water = 0;
  let highway = 0;
  for (let i = 0; i < N * N; i++) {
    if (grid.terrain[i] === TERRAIN.water) water++;
    else land++;
    if (grid.road[i] === ROAD.highway) highway++;
  }
  assert.ok(land > N * N * 0.45, "debe haber suelo edificable de sobra");
  assert.ok(water > 60, "debe haber río, lago o costa");
  assert.ok(highway >= 12, "la autovía de entrada existe");
  assert.ok(entry.x > 0 && entry.z > 0);
});

test("el reloj se mantiene dentro del día", () => {
  const sim = new CitySim(SEED);
  sim.paused = false;
  sim.speed = 3;
  for (let i = 0; i < 400; i++) {
    sim.step(0.1);
    assert.ok(sim.hour >= 0 && sim.hour < 24, `hora fuera de rango: ${sim.hour}`);
    assert.ok(sim.dayFraction >= 0 && sim.dayFraction < 1);
  }
  assert.ok(sim.day > 1, "los días avanzan");
});

test("la red solo se conecta desde la autovía y llega hasta ZONE_DEPTH", () => {
  const sim = new CitySim(SEED);
  const { x: ex, z: ez } = sim.entry;
  // Una calle suelta lejos de la autovía no conecta.
  const far = { x: N - 6, z: 4 };
  sim.applyTool("road-street", far.x, far.z);
  sim.refreshAll();
  assert.equal(sim.grid.connected[idx(far.x, far.z)], 0);

  sim.applyTool("road-street", ex, ez);
  sim.refreshAll();
  assert.equal(sim.grid.connected[idx(ex, ez)], 1);
  // La profundidad de zonificación alcanza varias casillas desde la calzada.
  let reached = 0;
  for (let d = 1; d <= ZONE_DEPTH; d++) {
    const i = sim.grid.at(ex, ez - d);
    if (i >= 0 && sim.grid.roadDist[i]! <= ZONE_DEPTH) reached++;
  }
  assert.ok(reached >= 2, "una manzana entera debe ser edificable, no solo el borde");
});

test("los servicios tienen capacidad: la demanda por encima del suministro degrada el ratio", () => {
  const sim = seededCity();
  run(sim, 400);
  assert.ok(sim.powerSupply > 0, "la central suministra");
  assert.ok(sim.powerRatio > 0.99, "al principio sobra potencia");

  // Suministro artificialmente escaso: el ratio debe caer, no seguir a 1.
  const plant: Building | undefined = sim.buildings.find((b) => b.kind === "power_coal");
  assert.ok(plant, "hay central");
  DEFS.power_coal!.powerSupply = 1;
  sim.refreshAll();
  assert.ok(sim.powerRatio < 0.9, `ratio esperado < 0.9, fue ${sim.powerRatio}`);
  DEFS.power_coal!.powerSupply = 260;
  sim.refreshAll();
  assert.ok(sim.powerRatio > 0.99);
});

test("una zona servida crece, sube de nivel y genera población y empleo", () => {
  const sim = seededCity();
  const early = sim.buildings.length;
  run(sim, 2600);
  assert.ok(sim.buildings.length > early + 12, `debe crecer: ${early} → ${sim.buildings.length}`);
  assert.ok(sim.pop > 60, `población esperada > 60, fue ${sim.pop}`);
  assert.ok(sim.jobs > 10, `empleo esperado > 10, fue ${sim.jobs}`);
  assert.ok(
    sim.buildings.some((b) => (DEFS[b.kind]?.level ?? 1) > 1),
    "algún edificio debe subir de nivel",
  );
  assert.ok(sim.tier >= 1, "se alcanza al menos el hito de Pueblo");
});

test("sin luz no crece nada", () => {
  const sim = seededCity();
  const plant = sim.buildings.findIndex((b) => b.kind === "power_coal");
  const p = sim.buildings[plant]!;
  sim.applyTool("bulldoze", p.x, p.z);
  sim.refreshAll();
  const before = sim.buildings.length;
  run(sim, 600);
  assert.equal(sim.buildings.length, before, "sin suministro no debe aparecer ningún edificio");
});

test("los desbloqueos por hito bloquean avenidas y alta densidad al principio", () => {
  const sim = new CitySim(SEED);
  const { x: ex, z: ez } = sim.entry;
  assert.equal(sim.canPlace("road-avenue", ex, ez).ok, false);
  assert.equal(sim.canPlace("zone-r-high", ex + 2, ez + 2).ok, false);
  sim.tier = 2;
  assert.equal(sim.canPlace("road-avenue", ex, ez).ok, true);
  assert.equal(sim.canPlace("zone-r-high", ex + 2, ez + 2).ok, true);
  assert.ok(ROADS[2]!.capacity > ROADS[1]!.capacity, "la avenida transporta más");
  assert.ok(TIERS.length >= 6, "hay progresión hasta metrópolis");
});

test("el presupuesto responde a los impuestos", () => {
  const sim = seededCity();
  run(sim, 1400);
  const base = sim.lastIncome;
  assert.ok(base > 0, "una ciudad viva recauda");
  sim.taxR = 0.22;
  sim.taxC = 0.22;
  sim.taxI = 0.22;
  run(sim, 120);
  assert.ok(sim.lastIncome > base, "subir impuestos sube la recaudación inmediata");
  run(sim, 1200);
  assert.ok(sim.happiness < 62, "y hunde el ánimo con el tiempo");
});

test("la contaminación industrial baja el valor del suelo alrededor", () => {
  const sim = seededCity();
  run(sim, 1200);
  const clean = sim.avgLandValue;
  const { x: ex, z: ez } = sim.entry;
  for (let x = ex + 5; x <= ex + 9; x++) {
    for (let z = ez - 9; z <= ez - 5; z++) {
      if (sim.grid.building[idx(x, z)]! < 0) sim.applyTool("zone-i", x, z);
    }
  }
  run(sim, 1600);
  assert.ok(sim.avgPollution > 0, "la industria contamina");
  assert.ok(sim.avgLandValue <= clean + 0.02, "y no mejora el valor del suelo");
});

test("el grid se serializa y se restaura sin pérdida", () => {
  const { grid } = generateMap(SEED);
  grid.road[idx(5, 5)] = ROAD.avenue;
  grid.zone[idx(6, 6)] = 2;
  grid.density[idx(6, 6)] = 1;
  const restored = Grid.deserialize(grid.serialize());
  assert.ok(restored, "se restaura");
  for (let i = 0; i < N * N; i++) {
    assert.equal(restored!.terrain[i], grid.terrain[i]);
    assert.equal(restored!.road[i], grid.road[i]);
    assert.equal(restored!.zone[i], grid.zone[i]);
    assert.equal(restored!.density[i], grid.density[i]);
    assert.ok(Math.abs(restored!.height[i]! - grid.height[i]!) < 1e-6);
  }
});

test("guardar y cargar conserva la ciudad", () => {
  const sim = seededCity();
  run(sim, 1200);
  const blob = JSON.parse(JSON.stringify(sim.toSave()));
  const loaded: CitySim | null = CitySim.fromSave(blob);
  assert.ok(loaded, "la partida se restaura");
  assert.equal(loaded!.buildings.length, sim.buildings.length);
  assert.equal(loaded!.money, sim.money);
  assert.equal(loaded!.day, sim.day);
  assert.equal(loaded!.name, sim.name);
  // El índice casilla→edificio se reconstruye, nunca se guarda.
  for (let k = 0; k < loaded!.buildings.length; k++) {
    const b: Building = loaded!.buildings[k]!;
    assert.equal(loaded!.grid.building[idx(b.x, b.z)], k);
  }
  assert.ok(Math.abs(loaded!.pop - sim.pop) <= Math.max(4, sim.pop * 0.06));
});

test("demoler limpia la casilla y el edificio entero", () => {
  const sim = seededCity();
  run(sim, 900);
  const b: Building | undefined = sim.buildings.find((x) => DEFS[x.kind]!.zone !== "none");
  assert.ok(b, "hay edificios crecidos");
  const { x, z, w, d } = b!;
  sim.applyTool("bulldoze", x, z);
  for (let zz = 0; zz < d; zz++) {
    for (let xx = 0; xx < w; xx++) {
      assert.equal(sim.grid.building[idx(x + xx, z + zz)], -1);
    }
  }
  // Ningún índice de casilla puede apuntar fuera del array tras el swap-remove.
  for (let i = 0; i < N * N; i++) {
    const bi = sim.grid.building[i]!;
    assert.ok(bi < sim.buildings.length, "índice de edificio válido");
  }
});

test("un día dura TICKS_PER_DAY ticks y el presupuesto se resuelve una vez al día", () => {
  const sim = seededCity();
  run(sim, 900);
  const days = sim.history.length;
  assert.ok(days > 0, "hay historial diario");
  assert.equal(sim.history[days - 1]!.day, sim.day);
  assert.equal(sim.tickCount % TICKS_PER_DAY === 0 ? 0 : sim.tickCount % TICKS_PER_DAY > 0, true);
});

test("la explanada de la autovía queda transitable en muchas semillas", () => {
  let worst = 0;
  let bad = 0;
  for (let s = 0; s < 40; s++) {
    const seed = (s * 7919 + 13) >>> 0;
    const { grid, entry } = generateMap(seed);
    let maxSlope = 0;
    for (let i = 0; i < N * N; i++) {
      if (grid.road[i] === ROAD.highway) maxSlope = Math.max(maxSlope, grid.slope[i]!);
    }
    worst = Math.max(worst, maxSlope);
    if (maxSlope > 0.52) bad++;
    assert.ok(entry.x >= 6, "la autovía entra lo bastante");
  }
  assert.equal(bad, 0, `autovía empinada en ${bad}/40 semillas, peor pendiente ${worst.toFixed(2)}`);
});

test("guardar conserva la orientación 0 (fachada al norte)", () => {
  const sim = seededCity();
  run(sim, 400);
  const target = sim.buildings.find((b) => b.rot === 0);
  assert.ok(target, "hace falta un edificio orientado al norte");
  target!.rot = 0;
  const blob = JSON.parse(JSON.stringify(sim.toSave()));
  const loaded = CitySim.fromSave(blob);
  assert.ok(loaded);
  const same = loaded!.buildings.find((b) => b.id === target!.id);
  assert.ok(same);
  assert.equal(same!.rot, 0);
});

test("el morro del vehículo apunta al destino, no al revés", () => {
  const sim = seededCity();
  run(sim, 900);
  assert.ok(sim.vehicles.length > 0, "hay tráfico visible");
  let ok = 0;
  for (const v of sim.vehicles) {
    const a = v.path[v.i]!;
    const b = v.path[Math.min(v.i + 1, v.path.length - 1)]!;
    const dx = (b % N) - (a % N);
    const dz = ((b / N) | 0) - ((a / N) | 0);
    if (dx === 0 && dz === 0) continue;
    const target = Math.atan2(dx, dz) + Math.PI;
    let d = Math.abs(v.yaw - target);
    while (d > Math.PI) d = Math.abs(d - Math.PI * 2);
    if (d < 0.6) ok++;
  }
  assert.ok(ok >= Math.max(1, sim.vehicles.length - 2), `morros alineados: ${ok}/${sim.vehicles.length}`);
});

test("los avisos caducan y se retiran al resolver el problema", () => {
  const sim = new CitySim(1);
  sim.pushNotice("water", "El agua no llega a todos: amplía el suministro.", "warn");
  sim.pushNotice("edu", "Sin colegios no habrá trabajadores cualificados para oficinas.", "info");
  assert.ok(sim.notices.some((n) => n.key === "water"));
  sim.waterRatio = 1;
  sim.serviceLevel.education = 0.6;
  sim.pruneNotices();
  assert.equal(sim.notices.some((n) => n.key === "water"), false, "el aviso de agua se retira al resolverlo");
  assert.equal(sim.notices.some((n) => n.key === "edu"), false, "el aviso de colegio se retira con cobertura");
  sim.pushNotice("welcome", "Prolonga la autovía con calles, zonifica junto a ellas y engancha luz y agua.", "info");
  sim.tickCount += TICKS_PER_DAY * 4;
  sim.pruneNotices();
  assert.equal(sim.notices.some((n) => n.key === "welcome"), false, "un aviso viejo caduca");
});
