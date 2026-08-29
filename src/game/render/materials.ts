import * as THREE from "three";
import { getCityTextures } from "./textures";

/** Uniformes compartidos por todos los materiales de ciudad. */
export const cityUniforms = {
  uNight: { value: 0 },
  uLampColor: { value: new THREE.Color(0xffd9a0) },
  uTime: { value: 0 },
  uRain: { value: 0 },
};

const CITY_GLSL = {
  vertexCommon: `#include <common>
         attribute float aEmis;
         varying float vEmis;
         varying vec3 vWorldPos;
         varying vec3 vWorldN;`,
  beginVertex: `#include <begin_vertex>
         vEmis = aEmis;`,
  defaultNormal: `#include <defaultnormal_vertex>
         vWorldN = inverseTransformDirection(transformedNormal, viewMatrix);`,
  projectVertex: `#include <project_vertex>
         vec4 wp = vec4(transformed, 1.0);
         #ifdef USE_INSTANCING
           wp = instanceMatrix * wp;
         #endif
         vWorldPos = (modelMatrix * wp).xyz;`,
  fragCommon: `#include <common>
         uniform float uNight;
         uniform vec3 uLampColor;
         uniform float uRain;
         uniform float uTime;
         uniform sampler2D uWallTex;
         uniform sampler2D uRoofTex;
         varying float vEmis;
         varying vec3 vWorldPos;
         varying vec3 vWorldN;
         vec3 gTriColor;
         float gTriLum;
         // Proyección triplanar: cada textura se pega sobre el eje al que mejor mira la cara
         // (paredes en las dos proyecciones verticales, tejado/planta en la horizontal) y se
         // funden por lo alineada que esté la normal con cada eje. Sin UV, funciona igual en
         // una caja que en un tejado a dos aguas.
         vec3 triplanar(sampler2D wallTex, sampler2D roofTex, vec3 p, vec3 n, float scale) {
           vec3 bw = abs(n);
           bw = bw / max(bw.x + bw.y + bw.z, 1e-4);
           vec3 cx = texture2D(wallTex, p.zy * scale).rgb;
           vec3 cz = texture2D(wallTex, p.xy * scale).rgb;
           vec3 cy = texture2D(roofTex, p.xz * scale).rgb;
           return cx * bw.x + cy * bw.y + cz * bw.z;
         }
         // Bump sin UV ni tangentes (Mikkelsen, "Bump Mapping Unparametrized Surfaces on
         // the GPU"): la altura sale de la luminancia de la textura real (juntas de panel,
         // solapes de teja), no de ruido aislado, así que el relieve tiene la misma
         // estructura que se ve en el color en vez de parecer estática de televisión. El
         // gradiente se mide en espacio de vista, que es donde ya vive la normal aquí.
         vec3 bumpedNormal(vec3 N, vec3 viewPos, float hx, float hy, float faceDir, float strength) {
           vec3 sigmaX = dFdx(viewPos);
           vec3 sigmaY = dFdy(viewPos);
           vec3 r1 = cross(sigmaY, N);
           vec3 r2 = cross(N, sigmaX);
           float det = dot(sigmaX, r1) * faceDir;
           vec3 grad = sign(det) * (hx * strength * r1 + hy * strength * r2);
           return normalize(abs(det) * N - grad);
         }`,
  colorFrag: `#include <color_fragment>
         // La muestra triplanar se calcula aquí, no en normal_fragment_maps: ese chunk se
         // ejecuta DESPUÉS de color_fragment en el shader estándar de three.js, así que si se
         // calculaba allí, este multiplicador de color leía gTriLum sin inicializar (0.0) y la
         // textura nunca llegaba al color — todo lo que se veía era el brillo especular sobre
         // el bump, de ahí el aspecto de estática. Se calcula una vez aquí y se reutiliza abajo.
         gTriColor = triplanar(uWallTex, uRoofTex, vWorldPos, vWorldN, 0.62);
         gTriLum = dot(gTriColor, vec3(0.333));
         float ao = mix(0.58, 1.0, pow(clamp(vWorldN.y * 0.55 + 0.45, 0.0, 1.0), 0.75));
         // La textura ya trae su propio contraste (juntas, tejas, áridos): se aplica como
         // multiplicador de valor sobre el color de vértice, que sigue dando la paleta.
         // Los cristales (vEmis alto) se quedan sin ella para que el vidrio siga liso.
         float texAmt = 1.0 - smoothstep(0.15, 0.7, vEmis);
         diffuseColor.rgb *= ao * mix(1.0, 0.62 + gTriLum * 0.66, texAmt);
         float wet = clamp(uRain * 0.7 + uNight * 0.1, 0.0, 0.75);
         diffuseColor.rgb *= 1.0 - wet * 0.18;
         vec3 viewDir = normalize(cameraPosition - vWorldPos);
         float ndv = max(dot(normalize(vWorldN), viewDir), 0.0);
         float rim = pow(1.0 - ndv, 2.8);
         diffuseColor.rgb += vec3(0.55, 0.62, 0.78) * rim * (0.05 + uNight * 0.08);`,
  roughnessFrag: `#include <roughnessmap_fragment>
         roughnessFactor -= (gTriLum - 0.5) * 0.1;
         roughnessFactor = mix(roughnessFactor, 0.14, clamp(uRain * 0.72 + uNight * 0.1, 0.0, 0.78));
         roughnessFactor = mix(roughnessFactor, 0.16, smoothstep(0.12, 0.7, vEmis));`,
  metalFrag: `#include <metalnessmap_fragment>
         metalnessFactor = mix(metalnessFactor, 0.42, smoothstep(0.18, 0.75, vEmis) * (1.0 - uNight * 0.25));`,
  emisFrag: `#include <emissivemap_fragment>
         float flicker = 1.0;
         if (vEmis > 0.88) flicker = 0.86 + 0.14 * sin(uTime * 5.4 + vWorldPos.x * 9.0);
         float lit = vEmis * uNight * flicker;
         vec3 warm = vec3(1.0, 0.82, 0.52);
         totalEmissiveRadiance += mix(uLampColor, warm, 0.45) * lit * 2.35;
         diffuseColor.rgb = mix(diffuseColor.rgb, warm * 0.55, lit * 0.38);`,
};

interface CityShaderTex {
  wall: THREE.Texture;
  roof: THREE.Texture;
}

function patchCityShader(
  shader: THREE.WebGLProgramParametersWithUniforms,
  wind = false,
  tex: CityShaderTex = getCityTextures(),
) {
  shader.uniforms.uNight = cityUniforms.uNight;
  shader.uniforms.uLampColor = cityUniforms.uLampColor;
  shader.uniforms.uRain = cityUniforms.uRain;
  shader.uniforms.uTime = cityUniforms.uTime;
  shader.uniforms.uWallTex = { value: tex.wall };
  shader.uniforms.uRoofTex = { value: tex.roof };
  const begin = wind
    ? `#include <begin_vertex>
         vEmis = aEmis;
         float wAmt = smoothstep(0.16, 0.85, transformed.y);
         float gust = sin(uTime * 1.15 + transformed.x * 2.2 + transformed.z * 1.6);
         transformed.x += gust * 0.038 * wAmt;
         transformed.z += cos(uTime * 0.92 + transformed.z * 1.4) * 0.026 * wAmt;`
    : CITY_GLSL.beginVertex;
  const common = wind
    ? CITY_GLSL.vertexCommon.replace(
        "varying vec3 vWorldN;",
        `varying vec3 vWorldN;
         uniform float uTime;`,
      )
    : CITY_GLSL.vertexCommon;
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", common)
    .replace("#include <begin_vertex>", begin)
    .replace("#include <defaultnormal_vertex>", CITY_GLSL.defaultNormal)
    .replace("#include <project_vertex>", CITY_GLSL.projectVertex);
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", CITY_GLSL.fragCommon)
    .replace(
      "#include <normal_fragment_maps>",
      `#include <normal_fragment_maps>
         {
           // gTriColor/gTriLum ya se calcularon en color_fragment (ver colorFrag arriba);
           // reutilizarlos aquí evita una segunda muestra triplanar.
           float bhx = dFdx(gTriLum);
           float bhy = dFdy(gTriLum);
           // Los cristales quedan lisos (vEmis alto): un vidrio rugoso no parece vidrio.
           float bumpAmt = mix(1.05, 0.12, smoothstep(0.15, 0.7, vEmis));
           normal = bumpedNormal(normal, -vViewPosition, bhx, bhy, faceDirection, bumpAmt);
         }`,
    )
    .replace("#include <color_fragment>", CITY_GLSL.colorFrag)
    .replace("#include <roughnessmap_fragment>", CITY_GLSL.roughnessFrag)
    .replace("#include <metalnessmap_fragment>", CITY_GLSL.metalFrag)
    .replace("#include <emissivemap_fragment>", CITY_GLSL.emisFrag);
}

/**
 * Material estándar con dos añadidos:
 *  - `aEmis` por vértice: qué partes se encienden de noche (ventanas, farolas, faros).
 *  - `uNight`: mezcla global día/noche que las apaga durante el día.
 *
 * AO falso, ruido de mundo y mojado viven aquí para que edificios, calles y coches
 * compartan el mismo look sin un segundo pase.
 */
export function createCityMaterial(params: THREE.MeshStandardMaterialParameters = {}) {
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.72,
    metalness: 0.06,
    ...params,
  });
  mat.onBeforeCompile = (shader) => patchCityShader(shader, false);
  mat.customProgramCacheKey = () => "city-pbr-v3";
  return mat;
}

/** Calzada: la misma base PBR pero con textura de asfalto en vez de fachada. */
export function createRoadMaterial(params: THREE.MeshStandardMaterialParameters = {}) {
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.82,
    metalness: 0.02,
    ...params,
  });
  const tex = getCityTextures();
  mat.onBeforeCompile = (shader) => patchCityShader(shader, false, { wall: tex.asphalt, roof: tex.asphalt });
  mat.customProgramCacheKey = () => "road-pbr-v1";
  return mat;
}

/** Copas y hierba: el mismo material de ciudad más un vaivén de viento. */
export function createFoliageMaterial(params: THREE.MeshStandardMaterialParameters = {}) {
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.88,
    metalness: 0,
    ...params,
  });
  mat.onBeforeCompile = (shader) => patchCityShader(shader, true);
  mat.customProgramCacheKey = () => "city-foliage-v1";
  return mat;
}

/** Terreno: ruido de hierba, parches secos y suelo mojado con la lluvia. */
export function createTerrainMaterial() {
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.94,
    metalness: 0,
    flatShading: false,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = cityUniforms.uNight;
    shader.uniforms.uRain = cityUniforms.uRain;
    shader.uniforms.uGroundTex = { value: getCityTextures().ground };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
         varying vec3 vWorldPos;
         varying vec3 vWorldN;`,
      )
      .replace(
        "#include <defaultnormal_vertex>",
        `#include <defaultnormal_vertex>
         vWorldN = inverseTransformDirection(transformedNormal, viewMatrix);`,
      )
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
         vec4 wp = vec4(transformed, 1.0);
         vWorldPos = (modelMatrix * wp).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
         uniform float uNight;
         uniform float uRain;
         uniform sampler2D uGroundTex;
         varying vec3 vWorldPos;
         varying vec3 vWorldN;
         float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
         float noise(vec2 p) {
           vec2 i = floor(p); vec2 f = fract(p);
           float a = hash(i);
           float b = hash(i + vec2(1.0, 0.0));
           float c = hash(i + vec2(0.0, 1.0));
           float d = hash(i + vec2(1.0, 1.0));
           vec2 u = f * f * (3.0 - 2.0 * f);
           return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
         }
         float fbm(vec2 p) {
           float v = 0.0; float a = 0.5;
           for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.07 + 11.3; a *= 0.5; }
           return v;
         }
         vec3 gGroundTex;
         float gGroundLum;
         // Proyección triplanar (igual que en el material de ciudad): imprescindible aquí
         // porque el terreno no es solo horizontal — un talud o una pendiente pronunciada
         // con textura plana en XZ se ve estirada y con muaré, como una alfombra mal puesta.
         vec3 triGround(sampler2D tex, vec3 p, vec3 n, float scale) {
           vec3 bw = abs(n);
           bw = bw / max(bw.x + bw.y + bw.z, 1e-4);
           vec3 cx = texture2D(tex, p.zy * scale).rgb;
           vec3 cz = texture2D(tex, p.xy * scale).rgb;
           vec3 cy = texture2D(tex, p.xz * scale).rgb;
           return cx * bw.x + cy * bw.y + cz * bw.z;
         }
         // Mismo bump por gradiente de superficie que el material de ciudad (ver
         // bumpedNormal ahí), pero con la altura sacada de la textura de tierra real en vez
         // de ruido aislado: sin estructura reconocible, de cerca se leía como estática.
         vec3 terrainBump(vec3 N, vec3 viewPos, float hx, float hy, float faceDir, float strength) {
           vec3 sigmaX = dFdx(viewPos);
           vec3 sigmaY = dFdy(viewPos);
           vec3 r1 = cross(sigmaY, N);
           vec3 r2 = cross(N, sigmaX);
           float det = dot(sigmaX, r1) * faceDir;
           vec3 grad = sign(det) * (hx * strength * r1 + hy * strength * r2);
           return normalize(abs(det) * N - grad);
         }`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
         {
           // gGroundTex/gGroundLum ya se calcularon en color_fragment (ver más abajo);
           // color_fragment se ejecuta antes que este chunk en el shader estándar de three.js,
           // así que calcularlo aquí por primera vez lo dejaría sin inicializar en el color.
           float thx = dFdx(gGroundLum);
           float thy = dFdy(gGroundLum);
           normal = terrainBump(normal, -vViewPosition, thx, thy, faceDirection, 0.9);
         }`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
         // Dos escalas de la misma textura (mancha grande + brizna fina) evitan el
         // patrón repetido que delata a una textura tileada de cerca.
         gGroundTex = triGround(uGroundTex, vWorldPos, vWorldN, 0.9) * 0.6
                    + triGround(uGroundTex, vWorldPos + 0.5, vWorldN, 3.1) * 0.4;
         gGroundLum = dot(gGroundTex, vec3(0.333));
         float n = fbm(vWorldPos.xz * 1.55);
         float n2 = fbm(vWorldPos.xz * 7.4 + 9.0);
         vec3 lush = vec3(0.24, 0.45, 0.17);
         vec3 dry = vec3(0.52, 0.49, 0.25);
         vec3 clover = vec3(0.2, 0.39, 0.19);
         float dryness = smoothstep(0.34, 0.76, n);
         diffuseColor.rgb = mix(diffuseColor.rgb, mix(mix(lush, clover, n2), dry, dryness), 0.34);
         diffuseColor.rgb *= 0.6 + gGroundLum * 0.75;
         float ao = mix(0.68, 1.0, clamp(vWorldN.y, 0.0, 1.0));
         diffuseColor.rgb *= ao;
         float wet = clamp(uRain, 0.0, 1.0);
         diffuseColor.rgb *= 1.0 - wet * 0.32;
         diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.78, 0.82, 0.9), uNight * 0.18);`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
         roughnessFactor = mix(roughnessFactor, 0.32, clamp(uRain * 0.6, 0.0, 0.6));
         roughnessFactor -= (gGroundLum - 0.5) * 0.16;`,
      );
  };
  mat.customProgramCacheKey = () => "terrain-tex-v1";
  return mat;
}

const waterVertex = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const waterFragment = /* glsl */ `
  uniform float uTime;
  uniform vec3 uShallow;
  uniform vec3 uDeep;
  uniform vec3 uSun;
  uniform vec3 uSunColor;
  uniform vec3 uSkyColor;
  uniform sampler2D uDepth;
  uniform float uGrid;
  uniform float uNight;
  uniform float uRain;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  varying vec3 vWorld;

  float hashW(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noiseW(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    float a = hashW(i), b = hashW(i + vec2(1.0, 0.0)), c = hashW(i + vec2(0.0, 1.0)), d = hashW(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  float fbmW(vec2 p) {
    float v = 0.0; float a = 0.55;
    for (int i = 0; i < 4; i++) { v += a * noiseW(p); p = p * 2.05 + 17.0; a *= 0.52; }
    return v;
  }

  void main() {
    vec2 cell = vWorld.xz / uGrid;
    float inside = step(0.0, cell.x) * step(cell.x, 1.0) * step(0.0, cell.y) * step(cell.y, 1.0);
    float bed = texture2D(uDepth, clamp(cell, 0.0, 1.0)).r;
    float depth = mix(1.0, clamp(bed, 0.0, 1.0), inside);

    float dist = length(cameraPosition - vWorld);
    float detail = smoothstep(280.0, 36.0, dist);
    // Bandas y manchas a gran escala (corrientes, bajíos, reflejo difuso del cielo): sin esto
    // el mar es un relleno plano en cuanto la cámara se aleja un poco.
    float swell = fbmW(vWorld.xz * 0.028 + uTime * 0.015) * 0.6 + fbmW(vWorld.xz * 0.07 - uTime * 0.01) * 0.4;
    float t = uTime;
    float dx = cos(vWorld.x * 0.55 + t * 0.9) * 0.022
             + cos((vWorld.x + vWorld.z) * 0.23 + t * 0.45) * 0.014
             + cos(vWorld.x * 1.9 - t * 1.5) * 0.01;
    float dz = -cos(vWorld.z * 0.41 - t * 0.7) * 0.02
             + cos((vWorld.x + vWorld.z) * 0.23 + t * 0.45) * 0.012
             + cos(vWorld.z * 2.1 + t * 1.15) * 0.008;
    dx += uRain * cos(vWorld.x * 9.0 + vWorld.z * 8.0 + t * 6.0) * 0.018 * detail;
    dz += uRain * sin(vWorld.z * 8.5 - vWorld.x * 7.0 + t * 5.4) * 0.016 * detail;
    vec3 n = normalize(vec3(-dx * detail, 1.0, -dz * detail));

    vec3 viewDir = normalize(cameraPosition - vWorld);
    float fres = pow(1.0 - max(dot(n, viewDir), 0.0), 3.2);

    vec3 base = mix(uShallow, uDeep, depth);
    base *= (0.88 + swell * 0.24) * (1.0 - uRain * 0.18);
    vec3 col = mix(base, uSkyColor, fres * 0.68);
    // Reflejo difuso del cielo, más fuerte donde el mar se ve más "liso" a lo lejos.
    col = mix(col, uSkyColor, (1.0 - detail) * 0.22);

    vec3 h = normalize(uSun + viewDir);
    float spec = pow(max(dot(n, h), 0.0), mix(90.0, 28.0, uRain));
    col += uSunColor * spec * (1.55 + uRain * 0.6) * (1.0 - uNight * 0.55) * detail;
    // Destellos dispersos (glitter): sin esto el brillo del sol es un único punto y el resto
    // del mar, lejos de ese punto, se ve muerto.
    float glitter = smoothstep(0.82, 1.0, fract(noiseW(vWorld.xz * 6.0 + uTime * 0.3)));
    col += uSunColor * glitter * spec * 2.2 * (1.0 - uNight * 0.7);

    float foam = smoothstep(0.13, 0.0, depth) * inside
               * (0.45 + 0.55 * sin(vWorld.x * 3.1 + vWorld.z * 2.7 + t * 1.8));
    vec3 foamColor = mix(vec3(0.92, 0.95, 0.96), vec3(0.34, 0.42, 0.5), uNight);
    col = mix(col, foamColor, foam * 0.42 * detail);

    float fogFactor = smoothstep(uFogNear, uFogFar, dist);
    col = mix(col, uFogColor, fogFactor);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

export interface WaterUniforms {
  uTime: { value: number };
  uShallow: { value: THREE.Color };
  uDeep: { value: THREE.Color };
  uSun: { value: THREE.Vector3 };
  uSunColor: { value: THREE.Color };
  uSkyColor: { value: THREE.Color };
  uDepth: { value: THREE.Texture };
  uGrid: { value: number };
  uNight: { value: number };
  uRain: { value: number };
  uFogColor: { value: THREE.Color };
  uFogNear: { value: number };
  uFogFar: { value: number };
}

export function createWaterMaterial(depthTexture: THREE.Texture, grid: number) {
  const uniforms: WaterUniforms = {
    uTime: { value: 0 },
    uShallow: { value: new THREE.Color(0x4f9ab5) },
    uDeep: { value: new THREE.Color(0x16455f) },
    uSun: { value: new THREE.Vector3(0.4, 0.8, 0.4) },
    uSunColor: { value: new THREE.Color(0xfff0d6) },
    uSkyColor: { value: new THREE.Color(0xbdd8ea) },
    uDepth: { value: depthTexture },
    uGrid: { value: grid },
    uNight: { value: 0 },
    uRain: { value: 0 },
    uFogColor: { value: new THREE.Color(0xbdd8ea) },
    uFogNear: { value: 70 },
    uFogFar: { value: 230 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: uniforms as unknown as Record<string, THREE.IUniform>,
    vertexShader: waterVertex,
    fragmentShader: waterFragment,
  });
  return { material: mat, uniforms };
}

const skyVertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const skyFragment = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uSun;
  uniform vec3 uSunColor;
  uniform vec3 uMoon;
  uniform float uNight;
  uniform float uTime;
  uniform float uRain;
  varying vec3 vDir;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise2(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    float a = hash2(i);
    float b = hash2(i + vec2(1.0, 0.0));
    float c = hash2(i + vec2(0.0, 1.0));
    float d = hash2(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0; float a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise2(p); p = p * 2.11 + vec2(11.7, 3.1); a *= 0.5; }
    return v;
  }

  void main() {
    vec3 d = normalize(vDir);
    float t = clamp(d.y * 1.15 + 0.08, 0.0, 1.0);
    vec3 col = mix(uHorizon, uTop, pow(t, 0.72));

    float sun = max(dot(d, normalize(uSun)), 0.0);
    float sunVis = 1.0 - uNight;
    col += uSunColor * pow(sun, 220.0) * 1.8 * sunVis;
    col += uSunColor * pow(sun, 28.0) * 0.95 * sunVis;
    col += uSunColor * pow(sun, 4.0) * 0.22 * sunVis;
    col += uSunColor * vec3(1.0, 0.78, 0.55) * pow(sun, 1.6) * 0.12 * sunVis;

    vec3 md = normalize(uMoon);
    float moon = max(dot(d, md), 0.0);
    col += vec3(0.9, 0.93, 1.0) * pow(moon, 280.0) * uNight * 2.2;
    col += vec3(0.55, 0.64, 0.82) * pow(moon, 12.0) * uNight * 0.34;
    col += vec3(0.35, 0.42, 0.6) * pow(moon, 3.0) * uNight * 0.12;

    float cloudH = smoothstep(0.02, 0.22, d.y) * smoothstep(0.78, 0.32, d.y);
    vec2 cuv = d.xz / max(0.08, d.y + 0.18);
    float clouds = fbm(cuv * 1.35 + vec2(uTime * 0.007, uTime * 0.004));
    clouds = smoothstep(0.42, 0.78, clouds) * cloudH;
    clouds = mix(clouds, clouds * 1.35, uRain);
    vec3 cloudCol = mix(vec3(0.96, 0.97, 0.98), vec3(0.55, 0.58, 0.64), uRain);
    cloudCol = mix(cloudCol, vec3(0.22, 0.26, 0.36), uNight);
    col = mix(col, cloudCol, clouds * (0.42 + uRain * 0.22) * (1.0 - uNight * 0.25));

    if (uNight > 0.08 && d.y > 0.04) {
      vec3 q = floor(d * 220.0);
      float s = step(0.9972, hash(q));
      col += vec3(s) * uNight * (0.55 + 0.45 * hash(q + 3.0)) * (1.0 - clouds);
    }
    col = mix(col, mix(uHorizon, vec3(0.45, 0.48, 0.52), 0.4), uRain * 0.28);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

export function createSkyMaterial() {
  const uniforms = {
    uTop: { value: new THREE.Color(0x4b8ed0) },
    uHorizon: { value: new THREE.Color(0xc3dced) },
    uSun: { value: new THREE.Vector3(0.4, 0.8, 0.4) },
    uSunColor: { value: new THREE.Color(0xfffaf0) },
    uMoon: { value: new THREE.Vector3(0.3, 0.7, -0.4) },
    uNight: { value: 0 },
    uTime: { value: 0 },
    uRain: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: skyVertex,
    fragmentShader: skyFragment,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  return { material, uniforms };
}

const smokeVertex = /* glsl */ `
  uniform float uTime;
  attribute vec3 aOrigin;
  attribute vec2 aCorner;
  attribute float aSeed;
  attribute float aScale;
  varying float vLife;
  varying vec2 vCorner;
  void main() {
    vCorner = aCorner;
    float life = fract(uTime * 0.16 + aSeed);
    vLife = life;
    float rise = life * (2.6 + aSeed * 1.6);
    float drift = life * life * 1.6;
    vec3 center = aOrigin + vec3(sin(aSeed * 31.0) * drift, rise, cos(aSeed * 17.0) * drift);
    vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 camUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    float s = aScale * (0.3 + life * 1.9);
    vec3 p = center + camRight * aCorner.x * s + camUp * aCorner.y * s;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }
`;

const smokeFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vLife;
  varying vec2 vCorner;
  void main() {
    float r = length(vCorner);
    float alpha = smoothstep(1.0, 0.15, r) * (1.0 - vLife) * uOpacity * 0.42;
    if (alpha < 0.005) discard;
    gl_FragColor = vec4(uColor, alpha);
    #include <colorspace_fragment>
  }
`;

export function createSmokeMaterial() {
  const uniforms = {
    uTime: { value: 0 },
    uColor: { value: new THREE.Color(0xb8b4ad) },
    uOpacity: { value: 1 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: smokeVertex,
    fragmentShader: smokeFragment,
    transparent: true,
    depthWrite: false,
  });
  return { material, uniforms };
}

/**
 * Billboards orientados a cámara con silueta de nube por ruido: varios lóbulos ovalados que se
 * funden con una caída de alfa muy suave. Sustituye a las esferas instanciadas de baja
 * poligonización (visibles como blobs facetados con bordes duros al superponerse sin
 * profundidad) por algo que de verdad parece una nube esponjosa desde cualquier ángulo.
 */
const cloudVertex = /* glsl */ `
  attribute float aSeed;
  varying vec2 vUv;
  varying float vSeed;
  void main() {
    // Plano de 1×1: se usa como billboard, no como malla real, así que su posición local
    // (−0.5..0.5) es directamente la coordenada de forma de la nube.
    vUv = position.xy * 2.0;
    vSeed = aSeed;
    vec4 center = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 camUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    mat4 m = instanceMatrix;
    float sx = length(vec3(m[0][0], m[0][1], m[0][2]));
    float sy = length(vec3(m[1][0], m[1][1], m[1][2]));
    vec3 pos = center.xyz + camRight * position.x * sx + camUp * position.y * sy;
    gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
  }
`;

const cloudFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uNight;
  varying vec2 vUv;
  varying float vSeed;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    float a = hash(i), b = hash(i + vec2(1.0, 0.0)), c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  void main() {
    // Varios lóbulos redondeados desplazados: la silueta deja de ser una elipse perfecta.
    vec2 p = vUv;
    float base = 1.0 - length(p);
    float lobes = 0.0;
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      vec2 off = vec2(sin(vSeed * 6.0 + fi * 2.1), cos(vSeed * 4.0 + fi * 1.7)) * 0.32;
      lobes = max(lobes, 1.0 - length((p - off) * vec2(1.0, 1.35)));
    }
    float shape = max(base * 0.6, lobes);
    float n = noise(p * 3.2 + vSeed * 11.0) * 0.5 + noise(p * 7.0 + vSeed * 5.0) * 0.5;
    shape += (n - 0.5) * 0.22;
    float alpha = smoothstep(0.02, 0.62, shape) * uOpacity;
    if (alpha < 0.01) discard;
    vec3 col = mix(uColor, uColor * 0.4, uNight);
    // Sombra propia leve en la base del lóbulo para dar volumen sin luz real.
    col *= 0.86 + 0.14 * smoothstep(-0.3, 0.5, p.y);
    gl_FragColor = vec4(col, alpha);
    #include <colorspace_fragment>
  }
`;

export function createCloudMaterial() {
  const uniforms = {
    uColor: { value: new THREE.Color(0xf2f4f7) },
    uOpacity: { value: 0.7 },
    uNight: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: cloudVertex,
    fragmentShader: cloudFragment,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  return { material, uniforms };
}
