# Skyline Mini

Constructor de ciudades 3D para navegador, inspirado en *Cities: Skylines*.
Repositorio: [alvarodesigns34/cityskylines-src](https://github.com/alvarodesigns34/cityskylines-src).

**Jugar: https://alvarodesigns34.github.io/cityskylines-src/**

Bucle: trazar la red → zonificar junto a ella → dar luz y agua → subir el valor del suelo con
servicios → ver crecer y densificarse la ciudad → equilibrar presupuesto, humo y atascos.

## Cómo jugar

1. **Fundar una ciudad** (o continuar la partida guardada en el navegador).
2. Arrastra **calles** desde la autovía del oeste. Sin conexión a la autovía la ciudad no existe.
3. Pinta **vivienda**, **comercio** e **industria**. Una parcela crece si tiene calle a **4 casillas
   o menos**, luz y agua: la manzana entera se llena, no solo el borde que toca el asfalto.
4. Coloca una **central** y un **depósito**, y engánchalos a la red. Ojo a la capacidad: por
   debajo del suministro hay apagones parciales que frenan toda la ciudad.
5. El **valor del suelo** es el nudo del juego. Lo suben parques, colegios, sanidad y seguridad;
   lo hunden el humo, el ruido y la congestión. Cuando sube, los edificios suben de nivel solos.
6. Los **colegios** elevan el nivel formativo, y sin él las oficinas no encuentran trabajadores
   cualificados. Sin **bomberos**, los edificios arden de verdad.

Controles: `WASD` mover · `Q`/`E` girar · `T`/`G` inclinar · rueda o `R`/`F` zoom · botón derecho
orbitar · `1`–`9` herramientas · `Espacio` pausa · `Esc` inspeccionar.

## Desarrollo

```bash
npm install
npm run dev        # http://localhost:8080
npm run typecheck
npm run lint
npm test           # incluye 13 pruebas de simulación
npm run build      # app con servidor (TanStack Start + Nitro)
npm run build:pages  # SPA estática que se publica en GitHub Pages
```

Cada push a `main` publica la versión estática automáticamente
(`.github/workflows/pages.yml`), previo typecheck y pruebas de simulación. Esa build es
independiente de la de servidor: el juego no toca backend en ningún momento (la partida vive en
`localStorage`), así que `vite.pages.config.ts` monta el mismo `GameShell` sin router ni Nitro y
no puede romper el entorno de desarrollo.

Auth y base de datos están desactivados a propósito; la partida se guarda en `localStorage`.

## Arquitectura

La simulación no conoce Three.js. El render solo lee estado y contadores de versión.

```
src/game/sim/          reglas y estado
  grid.ts              mapa 64×64 en typed arrays (struct-of-arrays)
  catalog.ts           34 edificios en familias, vías, hitos
  generate.ts          relieve, río, lago, costa, bosques, entrada de autovía
  fields.ts            estampado y difusión de campos rasterizados
  city.ts              estado + orquestación del tick + herramientas
  systems/             network · services · environment · population
                       zoning · economy · traffic
src/game/render/       escena R3F
  geom/                generador paramétrico de edificios, vías y props
  layers/              terreno, agua, cielo, ciudad, efectos, capas de datos
  materials.ts         material de ciudad con emisión por vértice, agua, cielo, humo
  daynight.ts          curva de luz, cielo y niebla por hora del simulador
src/game/store.ts      Zustand: fase, herramienta, snapshot y persistencia
src/components/hud/    HUD en español
```

| Capa | Responsabilidad | No hace |
|------|-----------------|---------|
| `CitySim` | Tick, herramientas, snapshot | Dibujar |
| `sim/systems/*` | Una regla de juego cada uno | Conocer React |
| `render/*` | Cámara, mallas instanciadas, materiales | Mutar reglas |
| `store` | Fase, herramienta, snapshot para el HUD | Simular |
| HUD | Overlay DOM, paneles, dock | Conocer Three |

### Sistemas y cómo se conectan

```
calles ──► conectividad y distancia a la vía ──► luz / agua ──► crecimiento
                    │                                              │
                    └──► tráfico (A* + carga) ──► congestión ◄──────┘
                                   │                    │
   parques, colegios, sanidad,     ▼                    ▼
   seguridad, recogida ──► VALOR DEL SUELO ◄── contaminación y ruido
                                   │
              ┌────────────────────┼────────────────────┐
              ▼                    ▼                    ▼
        nivel de edificio     recaudación            ánimo ──► demanda
              │                                             (y cumplimiento fiscal)
              ▼
        empleo cualificado ◄── nivel formativo ◄── colegios e institutos
```

Decisiones técnicas relevantes:

- **El grid se conserva**; las vías ganan clase (calle/avenida/autopista) con capacidad y
  velocidad propias, y encima se enruta con A*. Ese grafo es el punto de migración futuro a
  curvas y rotondas, sin reescribir servicios ni zonificación. Ver `AUDIT.md`.
- **Struct-of-arrays** para el mapa: escala a 64×64, permite campos de difusión baratos y
  reduce el guardado a base64 (~100 kB para una ciudad de 500 habitantes).
- **Tráfico agregado**: se muestrean pares casa→trabajo, se enrutan y se acumula carga por
  casilla. Los coches visibles recorren esas mismas rutas, así que el atasco que se ve y el
  que penaliza el ánimo son el mismo.
- **Emisión por vértice** (`aEmis`) en el material de ciudad: las ventanas, las farolas y los
  faros se encienden de noche sin duplicar ninguna malla.
- **Instancing por familia y variante**, con geometrías cacheadas: añadir edificios no añade
  llamadas de dibujo (una ciudad de 500 habitantes ronda las 55).
- **Guardado v2** con clave nueva; el mapa pasó de 36×36 a 64×64 y una partida v1 no es
  migrable de forma honesta, así que su clave se deja intacta en vez de corromperla.

### Puente de QA

`window.__skyline` expone `newCity(seed)`, `setTool`, `apply`, `canPlace`, `select`, `inspect`,
`snapshot`, `tick(n)`, `grant`, `setTier` y `sim`, para pilotar una partida desde el navegador
sin tocar la interfaz.

## Estado

Hecho: mapa procedural con relieve, río, lago y costa · vías con aceras, marcas y puentes ·
zonas R/C/I en dos densidades y tres niveles · luz, agua y basura con capacidad · contaminación,
ruido y valor del suelo · educación, sanidad, seguridad, bomberos, ocio · tráfico con congestión ·
economía con impuestos y deuda · seis niveles de ciudad con desbloqueos · ciclo día/noche ·
guardado y carga · HUD con capas de datos, gráficas y paneles.

Siguientes pasos naturales: transporte público sobre el grafo viario, red de agua residual,
políticas por distrito, y migración progresiva de las vías a nodos y segmentos con curvas.
