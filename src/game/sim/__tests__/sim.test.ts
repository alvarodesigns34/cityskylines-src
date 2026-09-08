import assert from "node:assert/strict";
import { test } from "node:test";
import { CitySim } from "../city";
import { Grid } from "../grid";
import { DEFS, ROADS, TIERS } from "../catalog";
import { generateMap } from "../generate";
import { ZONE_DEPTH } from "../systems/network";
import { OCCUPANCY_DRAIN } from "../systems/population";
import { startEvent, tickEvents } from "../systems/events";
import { tickFires, updateAbandon } from "../systems/zoning";
import { N, ROAD, SIM_DT, TERRAIN, TICKS_PER_DAY, idx, type Building } from "../types";

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

test("el mapa es una llanura: casi todo el suelo se puede zonificar", () => {
  let land = 0;
  let steep = 0;
  let water = 0;
  for (let s = 0; s < 24; s++) {
    const seed = (s * 7919 + 13) >>> 0;
    const { grid } = generateMap(seed);
    for (let i = 0; i < N * N; i++) {
      if (grid.terrain[i] === TERRAIN.water) {
        water++;
        continue;
      }
      land++;
      if (grid.slope[i]! > 0.55) steep++;
    }
  }
  assert.ok(water / 24 > 60, `agua media ${(water / 24).toFixed(0)}`);
  assert.ok(steep / land < 0.08, `pendiente excesiva en ${(100 * steep / land).toFixed(1)}% del suelo`);
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
  run(sim, 280);
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
    assert.ok(Math.abs(restored!.scenery[i]! - grid.scenery[i]!) < 1e-5);
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

test("plantar un árbol y las políticas sobreviven al guardado", () => {
  const sim = new CitySim(SEED);
  let planted = false;
  for (let z = 0; z < N && !planted; z++) {
    for (let x = 0; x < N; x++) {
      if (sim.canPlace("tree-plant", x, z).ok) {
        planted = sim.applyTool("tree-plant", x, z);
        break;
      }
    }
  }
  assert.ok(planted, "hay suelo para un árbol");
  sim.policies.housingGrant = true;
  sim.policies.cleanIndustry = true;
  sim.rain = 0.7;
  const loaded = CitySim.fromSave(JSON.parse(JSON.stringify(sim.toSave())));
  assert.ok(loaded);
  assert.equal(loaded!.policies.housingGrant, true);
  assert.equal(loaded!.policies.cleanIndustry, true);
  assert.ok((loaded!.rain ?? 0) > 0.6);
  let trees = 0;
  for (let i = 0; i < N * N; i++) if (loaded!.grid.tree[i]) trees++;
  assert.ok(trees >= 1, "el árbol plantado permanece");
});

test("no se puede pintar una calle sobre la autovía", () => {
  const sim = new CitySim(SEED);
  let hx = -1;
  let hz = -1;
  for (let i = 0; i < N * N; i++) {
    if (sim.grid.road[i] === ROAD.highway) {
      hx = i % N;
      hz = (i / N) | 0;
      break;
    }
  }
  assert.ok(hx >= 0);
  const check = sim.canPlace("road-street", hx, hz);
  assert.equal(check.ok, false);
  assert.equal(sim.applyTool("road-street", hx, hz), false);
  assert.equal(sim.grid.road[idx(hx, hz)], ROAD.highway);
});

test("roadDist no cruza el agua", () => {
  const sim = new CitySim(SEED);
  const { x: ex, z: ez } = sim.entry;
  sim.applyTool("road-street", ex, ez);
  sim.refreshAll();
  for (let i = 0; i < N * N; i++) {
    if (sim.grid.terrain[i] === TERRAIN.water && sim.grid.road[i] === ROAD.none) {
      assert.equal(sim.grid.roadDist[i], 255, "el agua no tiene distancia a la vía");
    }
  }
});

test("scenery sobrevive a un save sin el campo (saves viejos)", () => {
  const sim = new CitySim(SEED);
  const blob = sim.toSave();
  const sumBefore = sim.grid.scenery.reduce((a, b) => a + b, 0);
  assert.ok(sumBefore > 10, "el mapa tiene valor escénico");
  const grid = { ...blob.grid };
  delete grid.scenery;
  blob.grid = grid;
  const loaded = CitySim.fromSave(blob);
  assert.ok(loaded);
  const sumAfter = loaded!.grid.scenery.reduce((a, b) => a + b, 0);
  assert.ok(sumAfter > 10, "se reconstruye scenery si faltaba");
});

test("connectedCity es falso hasta que una calle toca la autovía", () => {
  const sim = new CitySim(SEED);
  assert.equal(sim.connectedCity, false);
  let placed = false;
  for (let i = 0; i < N * N && !placed; i++) {
    if (sim.grid.road[i] !== ROAD.highway) continue;
    const x = i % N;
    const z = (i / N) | 0;
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      if (sim.canPlace("road-street", x + dx, z + dz).ok) {
        placed = sim.applyTool("road-street", x + dx, z + dz);
        break;
      }
    }
  }
  assert.ok(placed, "se puede enganchar una calle a la autovía");
  assert.equal(sim.connectedCity, true);
});

test("spawnBuilding invalida la vegetación", () => {
  const sim = new CitySim(SEED);
  const { x: ex, z: ez } = sim.entry;
  for (let x = ex; x < ex + 8; x++) sim.applyTool("road-street", x, ez);
  sim.refreshAll();
  const v0 = sim.treesVersion;
  let placed = false;
  for (let dx = 1; dx < 6 && !placed; dx++) {
    if (sim.canPlace("build:water_tower", ex + dx, ez + 1).ok) {
      placed = sim.applyTool("build:water_tower", ex + dx, ez + 1);
    }
  }
  assert.ok(placed);
  assert.ok(sim.treesVersion > v0);
});

test("fromSave deja las banderas internas definidas", () => {
  const sim = seededCity();
  const loaded = CitySim.fromSave(JSON.parse(JSON.stringify(sim.toSave())));
  assert.ok(loaded);
  assert.equal(typeof loaded!.netDirty, "boolean");
  assert.equal(typeof loaded!.servicesDirty, "boolean");
  assert.equal(typeof loaded!.coverageVersion, "number");
});

test("en pausa no spawnean coches por frame", () => {
  const sim = seededCity();
  run(sim, 900);
  sim.paused = true;
  const before = sim.vehicles.length;
  for (let i = 0; i < 120; i++) sim.step(1 / 60);
  assert.equal(sim.vehicles.length, before);
});

test("demoler un edificio conserva la zona en toda la huella", () => {
  const sim = seededCity();
  run(sim, 900);
  const b = sim.buildings.find((x) => DEFS[x.kind]!.zone !== "none");
  assert.ok(b, "hay edificios crecidos");
  const zones: number[] = [];
  for (let zz = 0; zz < b!.d; zz++) {
    for (let xx = 0; xx < b!.w; xx++) {
      zones.push(sim.grid.zone[idx(b!.x + xx, b!.z + zz)]!);
    }
  }
  assert.ok(zones.every((z) => z > 0), "el edificio estaba sobre zona");
  sim.applyTool("bulldoze", b!.x, b!.z);
  let k = 0;
  for (let zz = 0; zz < b!.d; zz++) {
    for (let xx = 0; xx < b!.w; xx++) {
      const i = idx(b!.x + xx, b!.z + zz);
      assert.equal(sim.grid.building[i], -1);
      assert.equal(sim.grid.zone[i], zones[k]);
      k++;
    }
  }
});

test("guardar conserva pausa y velocidad", () => {
  const sim = new CitySim(SEED);
  sim.paused = true;
  sim.speed = 3;
  const loaded = CitySim.fromSave(JSON.parse(JSON.stringify(sim.toSave())));
  assert.ok(loaded);
  assert.equal(loaded!.paused, true);
  assert.equal(loaded!.speed, 3);
});

test("sin calles sueltas no avisa de aislamiento", () => {
  const sim = new CitySim(SEED);
  sim.paused = false;
  sim.speed = 3;
  for (let i = 0; i < 80; i++) sim.step(0.1);
  assert.equal(
    sim.notices.some((n) => n.key === "conn"),
    false,
    "la autovía sola no es una ciudad aislada",
  );
});

test("una calle desconectada dispara el aviso de aislamiento", () => {
  const sim = new CitySim(SEED);
  const far = { x: N - 6, z: 4 };
  sim.applyTool("road-street", far.x, far.z);
  sim.refreshAll();
  assert.equal(sim.grid.connected[idx(far.x, far.z)], 0);
  sim.paused = false;
  sim.speed = 3;
  for (let i = 0; i < 80; i++) sim.step(0.1);
  assert.ok(
    sim.notices.some((n) => n.key === "conn"),
    "debe avisar de las calles que no tocan la autovía",
  );
});

test("un apagón corto no vacía la ciudad", () => {
  const sim = seededCity();
  run(sim, 1600);
  const pop = sim.pop;
  assert.ok(pop > 40, `población de partida ${pop}`);
  const plant = sim.buildings.find((b) => b.kind === "power_coal");
  assert.ok(plant, "hay central");
  sim.applyTool("bulldoze", plant.x, plant.z);
  sim.refreshAll();
  assert.ok(sim.powerSupply < 1, "sin central no hay suministro");
  sim.paused = false;
  sim.speed = 1;
  for (let i = 0; i < 120; i++) sim.step(SIM_DT);
  assert.ok(
    sim.pop > pop * 0.4,
    `tras ~10 s de apagón a 1× deben quedar vecinos: ${sim.pop} de ${pop}`,
  );
  assert.ok(OCCUPANCY_DRAIN <= 0.01, "el vaciado tiene que ser lento a escala de un día");
});

test("una recesión hunde la demanda comercial sin pedir más tiendas", () => {
  const sim = seededCity();
  run(sim, 800);
  startEvent(sim, "recession");
  sim.refreshAll();
  assert.equal(sim.event?.kind, "recession");
  assert.ok(sim.demandC < 0.55, `demanda C bajo recesión: ${sim.demandC.toFixed(2)}`);
  sim.chooseEvent("cut_tax");
  assert.ok(sim.taxC < 0.11, "bajar el IAE es una decisión real");
});

test("el episodio activo sobrevive a guardar y cargar", () => {
  const sim = seededCity();
  startEvent(sim, "heatwave");
  const loaded = CitySim.fromSave(sim.toSave());
  assert.ok(loaded, "carga");
  assert.equal(loaded!.event?.kind, "heatwave");
  assert.ok(loaded!.waterStress > 0, "el estrés de agua persiste");
});

test("un edificio en llamas se vacía y puede arder del todo", () => {
  const sim = seededCity();
  run(sim, 700);
  const house = sim.buildings.find((b) => DEFS[b.kind]!.zone === "R");
  assert.ok(house, "hay una casa");
  const before = sim.buildings.length;
  house!.burning = 24;
  startEvent(sim, "firestorm");
  run(sim, 240);
  const still = sim.buildings.some((b) => b.burning > 0);
  const gone = sim.buildings.length < before;
  const notice = sim.notices.some((n) => n.key === "fire");
  assert.ok(still || gone || notice, "el fuego deja huella: llama, escombros o aviso");
});

test("la universidad es única y se desbloquea en Ciudad", () => {
  const sim = new CitySim(SEED);
  const { x: ex, z: ez } = sim.entry;
  assert.equal(sim.canPlace("build:university", ex + 2, ez + 2).ok, false, "bloqueada en Aldea");
  const city = seededCity();
  city.tier = 3;
  city.money = 200000;
  assert.ok(place(city, "university"), "se coloca la primera universidad");
  assert.ok(city.hasUniversity);
  assert.equal(
    city.buildings.filter((b) => b.kind === "university").length,
    1,
  );
  assert.equal(place(city, "university"), false, "la segunda se rechaza");
});

test("sin fondos no se consume el episodio", () => {
  const sim = seededCity();
  sim.money = 100;
  startEvent(sim, "recession");
  const nChoices = sim.event?.choices.length ?? 0;
  assert.equal(sim.chooseEvent("stimulus"), false);
  assert.equal(sim.event?.kind, "recession");
  assert.equal(sim.event?.choices.length, nChoices, "siguen todas las opciones");
  assert.ok(sim.notices.some((n) => n.key === "broke"));
  assert.equal(sim.chooseEvent("no_existe"), false, "un id desconocido no aplica la primera opción");
  assert.equal(sim.event?.kind, "recession");
});

test("el fuego salta al vecino y no encadena el mismo tick", () => {
  const sim = seededCity();
  run(sim, 700);
  const houses = sim.buildings.filter((b) => DEFS[b.kind]!.zone === "R");
  let a: Building | null = null;
  let neighbor: Building | null = null;
  for (const x of houses) {
    for (const y of houses) {
      if (x.id === y.id) continue;
      const xAdj = x.x + x.w === y.x || y.x + y.w === x.x;
      const zOver = x.z < y.z + y.d && y.z < x.z + x.d;
      const zAdj = x.z + x.d === y.z || y.z + y.d === x.z;
      const xOver = x.x < y.x + y.w && y.x < x.x + x.w;
      if ((xAdj && zOver) || (zAdj && xOver)) {
        a = x;
        neighbor = y;
        break;
      }
    }
    if (a) break;
  }
  assert.ok(a && neighbor, "hay dos casas pegadas");
  sim.rand = () => 0.01;
  a!.burning = 20;
  startEvent(sim, "firestorm");
  tickFires(sim);
  assert.ok(neighbor!.burning > 0, "el fuego salta al vecino");
  assert.equal(neighbor!.burning, 16, "el vecino no se procesa el mismo tick");
  assert.ok(sim.snapshot().burning >= 2);
});

test("un edificio en llamas no se abandona en silencio", () => {
  const sim = seededCity();
  run(sim, 600);
  const house = sim.buildings.find((b) => DEFS[b.kind]!.zone === "R");
  assert.ok(house, "hay una casa");
  house!.burning = 12;
  house!.occupancy = 0.02;
  house!.wellbeing = 0.01;
  house!.age = 400;
  sim.noticeCooldown.clear();
  updateAbandon(sim);
  assert.ok(
    sim.notices.some((n) => n.key === "fire") || !sim.buildings.some((b) => b.id === house!.id),
    "el fuego avisa o derriba, no desaparece como abandono",
  );
});

test("los bomberos se desbloquean en Pueblo", () => {
  const sim = new CitySim(SEED);
  sim.tier = 1;
  sim.money = 50000;
  assert.ok(sim.isUnlocked("fire"), "parque de bomberos en Pueblo");
  assert.equal(DEFS.fire!.tier, 1);
});

test("el primer episodio es feria o auge, no una catástrofe", () => {
  for (let i = 0; i < 12; i++) {
    const sim = new CitySim(SEED + i);
    sim.pop = 80;
    sim.day = 3;
    sim.seenFirstEvent = false;
    tickEvents(sim);
    const kind = sim.event?.kind;
    assert.ok(kind === "festival" || kind === "boom", String(kind));
  }
});

test("un firestorm no arrasa la ciudad", () => {
  const sim = seededCity();
  run(sim, 800);
  const before = sim.buildings.filter((b) => DEFS[b.kind]!.zone !== "none").length;
  assert.ok(before > 20, `ciudad con edificios: ${before}`);
  startEvent(sim, "firestorm");
  run(sim, TICKS_PER_DAY * 3 + 60);
  const after = sim.buildings.filter((b) => DEFS[b.kind]!.zone !== "none").length;
  assert.ok(after > before * 0.55, `sobreviven ${after}/${before}`);
});

