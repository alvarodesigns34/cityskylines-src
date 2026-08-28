# Skyline Mini

Constructor de ciudades 3D compacto, inspirado en *Cities: Skylines*. Repositorio: [alvarodesigns34/cityskylines-src](https://github.com/alvarodesigns34/cityskylines-src).

Bucle: construir calles → zonificar → dar luz y agua → ver crecer la ciudad → equilibrar presupuesto y demanda.

## Cómo jugar

1. **Fundar una ciudad** (o continuar la partida guardada en el navegador).
2. Arrastra una **calle** desde la autovía oeste.
3. Pinta **vivienda**, **comercio** e **industria** junto a las calles.
4. Coloca una **central** y un **depósito**. Los servicios viajan por la red viaria; las calles junto al río también captan agua.
5. Los edificios crecen solos si hay demanda, luz y agua.
6. Vigila el dinero, el ánimo y los avisos. Los parques ayudan; la industria paga y ensucia.

Controles: WASD pan, Q/E rotar, rueda o R/F zoom, clic derecho orbitar, 1–9 herramientas, espacio pausa.

## Desarrollo

```bash
npm install
npm run dev
```

La app queda en `http://localhost:8080`. Auth y base de datos van desactivados a propósito; la partida se guarda en `localStorage`.

```bash
npm run build
npm run typecheck
```

## Arquitectura

La simulación no conoce Three.js. El render solo lee el estado.

```
src/game/sim/     tipos, catálogo, mapa, CitySim, guardado
src/game/render/  escena R3F, geometría procedural, cámara
src/game/input.ts teclado unificado
src/game/store.ts UI Zustand + persistencia
src/components/hud/  overlay DOM
```

- Mapa 36×36, timestep fijo (20 Hz), tráfico visual por BFS en el grafo de calles.
- Edificios procedurales instanciados (sin modelos glTF).
- Guardado versionado en `localStorage` (`skyline-mini-save-v1`).

### Contratos

| Capa | Responsabilidad | No hace |
|------|-----------------|---------|
| `CitySim` | Tick, economía, servicios, crecimiento, herramientas | Dibujar |
| `CityScene` | Cámara, mallas instanciadas, overlays | Mutar reglas |
| `store` | Fase menú/juego, herramienta, snapshot para el HUD | Simular |
| HUD | Overlay en español, dock de herramientas | Conocer Three |

## MVP (hecho)

1. Mapa procedural con río, costa, bosque y autovía oeste.
2. Calles, puentes y conexión a la autovía.
3. Zonas R/C/I y edificios de servicio (central, depósito, parque).
4. Crecimiento autónomo (casa → bloque → torre, y equivalentes C/I).
5. Población, empleo, demanda y ánimo.
6. Presupuesto diario (impuestos − mantenimiento).
7. HUD con inspeccionar, avisos y mapas de luz/agua.
8. Cámara 3D (órbita, pan, zoom, táctil).
9. Bucle de decisiones: sin red no hay ciudad; sin luz/agua no crece; sin empleo baja el ánimo.

## Roadmap

| Fase | Estado | Siguiente palanca |
|------|--------|-------------------|
| 0 Análisis / arquitectura | Hecho | — |
| 1 Mapa y fundaciones | Hecho | Mapas más grandes / seeds nombradas |
| 2 Calles | Hecho | Autopistas, rotondas |
| 3 Zonas y edificios | Hecho | Parcelas 2×2, hitos |
| 4 Población | Hecho | Educación / salud simplificadas |
| 5 Economía | Hecho | Impuestos por zona, préstamos |
| 6 Servicios | Hecho | Basura, bomberos |
| 7 UI | Hecho | Gráficas de presupuesto |
| 8 Visual / rendimiento | Hecho (instancing, Lambert) | LOD, noche, humo GPU |
| 9 Estabilizar | En curso | Más partidas, balance |

## Stack

React 19, TanStack Start, Three.js r185, React Three Fiber, Zustand, Tailwind v4.
