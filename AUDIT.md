# Auditoría técnica — Skyline Mini (estado heredado)

Revisión del prototipo existente antes de la segunda etapa de desarrollo.
Commit auditado: `bccced7`.

## 1. Qué había

~3.000 líneas de juego repartidas así:

| Archivo | Líneas | Rol |
|---|---|---|
| `src/game/sim/city.ts` | 909 | `CitySim` monolítico: tick, servicios, crecimiento, economía, tráfico, herramientas |
| `src/game/render/CityScene.tsx` | 658 | Canvas R3F, cámara, todas las capas instanciadas |
| `src/components/hud/GameShell.tsx` | 359 | HUD completo en un componente |
| `src/game/sim/catalog.ts` | 262 | 12 definiciones de edificio |
| `src/game/render/geom.ts` | 231 | Geometría procedural por tipo, hardcodeada |
| `src/game/sim/generate.ts` | 74 | Mapa 36×36 |
| resto | ~450 | store, input, save, rng, types |

## 2. Aciertos que conviene conservar

- **Separación sim / render.** `CitySim` no importa Three. El render solo lee. Es la decisión
  más valiosa del prototipo y se mantiene intacta.
- **Timestep fijo** (`SIM_DT`) con acumulador y guard anti-espiral.
- **Versionado por capas** (`buildingsVersion`, `roadsVersion`, `treesVersion`) para invalidar
  mallas instanciadas sin diffing. Buena idea; se generaliza.
- **Instancing desde el principio** y caché de geometrías fusionadas por `(kind, variant)`.
- **Snapshot inmutable** hacia Zustand: el HUD nunca toca el simulador.
- **Guardado versionado con backup** en `localStorage`.
- **Hook `window.__skyline`** para QA sin navegador.

## 3. Problemas encontrados (verificados ejecutando la simulación en headless)

### 3.1 Bloqueante: el bucle de juego se atasca

Partida instrumentada (carreteras + central + zonas R/C/I, 400 días simulados):

```
day 34  pop 26 jobs 22 buildings 10
day 401 pop 26 jobs 22 buildings 10   <- congelado
```

Causas encadenadas:

1. **Profundidad de zonificación = 1.** `tickGrowth` exige `roadAccess()`, que solo mira los
   4 vecinos ortogonales. En un bloque zonificado de 5×4 solo crecen los bordes: 15 de 31
   parcelas. El resto queda muerto para siempre.
2. **Los niveles 2 y 3 nunca se desbloquean.** La subida de nivel exige `milestoneIndex >= 2`
   (pob. 120), pero la población se estanca en ~26 por el punto anterior. El catálogo de
   `apartments`, `tower`, `market`, `office`, `factory`, `works` es código inalcanzable en
   una partida normal.
3. **La demanda comercial colapsa.** `demandC` cae a 0.01 con la fórmula actual y el comercio
   deja de aparecer.

### 3.2 Reloj roto

`this.hour = 8 + (this.tick % 24)` produce horas de 8 a 31. El snapshot muestra `hour: 24`.
El ciclo día/noche era, por tanto, inutilizable en el render.

### 3.3 Los servicios no tienen capacidad real

`powerSupply` / `powerNeed` se calculan y se muestran en el HUD, pero **no se aplican**:
la inundación de `powered` por la red viaria ignora por completo la capacidad. Una central
alimenta una ciudad infinita. Igual con el agua. La única consecuencia es un aviso de texto.

### 3.4 Agua gratis e infinita

Cada casilla de calle junto al río añade `0.35` de suministro y se marca `watered` sin coste.
Con un puente sobre el río el depósito de agua deja de tener sentido.

### 3.5 Rendimiento

- `recomputeServices()` recorre las 1.296 casillas varias veces (limpieza + BFS conectividad +
  BFS luz + BFS agua + bucle de edificios + `reduce` para contar calles) y se llama **cada 2
  ticks** y **en cada casilla pintada durante un arrastre**. Pintar una avenida de 30 casillas
  dispara 30 recomputaciones completas.
- `bfsPath` reserva `Int32Array(N*N) + Uint8Array(N*N)` en cada spawn de vehículo (cada 3 ticks).
- Las capas del render hacen `tiles.filter(...)` completo en cada cambio de versión, es decir
  en cada `pointermove` mientras se dibuja.
- `InstancedKind` incluye `items.length` en la `key` de React: cada edificio nuevo desmonta y
  recrea el `InstancedMesh` entero de esa familia.

### 3.6 Render

- `<Canvas shadows={false}>` pero `castShadow` / `receiveShadow` repartidos por toda la escena:
  props muertas, cero sombras en pantalla.
- El sol gira con `clock.elapsedTime`, sin ninguna relación con la hora del simulador.
- Todo es `meshLambertMaterial`: sin rugosidad, sin especular, sin reflejos. El agua es una caja
  azul plana translúcida.
- Las calles son losas negras de 1×1 sin aceras, marcas, bordillos ni farolas.
- Los edificios no se orientan hacia la calle; todos miran al norte.
- El terreno es un plano de 140×140 unidades bajo un grid de 36 casillas, con relieve de ±0,2.

### 3.7 Deuda menor

- `rebuildSnapshotCache()` es un cuerpo vacío llamado en cada tick.
- `tickOccupancy` usa `this.jobs` / `this.workers` del tick anterior para decidir el objetivo
  del tick actual (retardo de un frame en la realimentación).
- `maybeAdvice` tiene una rama muerta (`powerSupply < 1 && buildings.length === 0`: la propia
  central cuenta como edificio).
- Índices de edificio guardados en `tile.building` con borrado por *swap-remove*: correcto hoy,
  pero frágil; cualquier código que guarde un índice entre ticks se rompe.
- 6 warnings de `react-hooks/exhaustive-deps` por usar `rev` como dependencia fantasma.
- El grid de casillas se serializa como 1.296 objetos JSON completos cada 12 s.

## 4. Decisiones de la segunda etapa

| Decisión | Motivo |
|---|---|
| **Conservar el grid**, no migrar a nodos/segmentos todavía | Servicios, zonificación, terreno y ráster de campos son todos de casilla. Una reescritura a spline no aporta jugabilidad hoy y rompe todo. En su lugar: **clases de vía** (calle / avenida / autopista) con capacidad y velocidad propias, más un **grafo derivado** de segmentos e intersecciones para enrutar tráfico. Ese grafo es el punto de migración futuro a curvas y rotondas. |
| **Struct-of-arrays** (`Grid` con typed arrays) en vez de 4.096 objetos `Tile` | Escala a mapas grandes, permite campos de difusión baratos y reduce el guardado a base64 compacto. |
| **Trocear `CitySim`** en subsistemas (`network`, `services`, `environment`, `zoning`, `population`, `economy`, `traffic`, `progression`) | `CitySim` pasa a ser contenedor de estado + orquestador del tick. |
| **Generador paramétrico de edificios** en vez de una función por tipo | Familias, variantes, plantas, tejados y paletas se combinan; añadir contenido deja de ser copiar geometría. |
| **Geometría de ventanas separada** por familia | Permite un `InstancedMesh` emisivo aparte para la iluminación nocturna, sin duplicar el edificio. |
| **Guardado v2 con clave nueva** | El mapa pasa de 36×36 a 64×64: un guardado v1 no es migrable de forma honesta. La clave v1 se deja intacta en vez de corromperla. |

## 5. Verificación tras la reescritura

Medido con la simulación ejecutada en headless y con la partida pilotada en Chromium.

### Rendimiento (ciudad de 4.100 habitantes, 545 edificios, 1.406 casillas de vía)

| | antes de optimizar | después |
|---|---|---|
| Coste medio del tick | 784 µs | **640 µs** |
| Pico de un solo frame | 6,9 ms (asignación de tráfico) | **0,7 ms** (se reparte en 9 ticks) |
| Llamadas de dibujo | 163 | **106** |
| Guardado | 145 kB en 7 ms | igual |

Desglose por subsistema en esa misma ciudad: `rebuildNetwork` 0,34 ms · `updateServices`
1,6 ms (cada 6 ticks, y la rasterización de cobertura solo cuando cambia el parque de
equipamientos) · `updateEnvironment` 0,86 ms (cada 14 ticks) · `updatePopulation` 0,15 ms.

Las 106 llamadas incluyen el pase de sombras. La caída de 163 a 106 vino de centrar la cámara
de sombras en el punto que mira el jugador en vez de en la posición de la cámara: la mitad de
la ciudad visible caía fuera del mapa de sombras y se dibujaba en sombra.

### Regresión de las funcionalidades heredadas

22 comprobaciones automatizadas sobre el navegador, todas en verde: menú → partida, dock por
categorías, bloqueos por hito, trazado por arrastre, colocación de central/depósito/vertedero,
zonificación, crecimiento, población y empleo, progresión, selección e inspección, las diez
capas de datos, los tres paneles, impuestos, crédito, pausa, velocidades, guardado, carga y
demolición.

### Errores reales encontrados y corregidos por el camino

1. `onPointerMissed` del Canvas se disparaba en **todos** los clics (ninguna malla tiene
   manejadores de puntero de R3F) y borraba la selección recién hecha: inspeccionar no
   funcionaba.
2. La cámara de sombras se centraba en la posición de la cámara, no en su objetivo.
3. Los edificios del jugador se podían colocar aislados de la red, sin dar servicio y sin
   ningún aviso.
4. `roadDist` solo se recalculaba en el tick, así que con el juego en pausa no se podía
   construir junto a una calle recién trazada.
5. El ánimo podía quedarse clavado en 3 sin ninguna consecuencia: ahora una ciudad infeliz
   pierde vecinos y deja de atraer demanda, y la basura sin tratar cuesta dinero.
