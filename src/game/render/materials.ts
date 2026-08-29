import * as THREE from "three";

/** Uniformes compartidos por todos los materiales de ciudad. */
export const cityUniforms = {
  uNight: { value: 0 },
  uLampColor: { value: new THREE.Color(0xffd9a0) },
  uTime: { value: 0 },
  uRain: { value: 0 },
};

/**
 * Material estándar con dos añadidos:
 *  - `aEmis` por vértice: qué partes se encienden de noche (ventanas, farolas, faros).
 *  - `uNight`: mezcla global día/noche que las apaga durante el día.
 *
 * Meter la emisión en la misma malla evita duplicar cada edificio en una segunda pasada,
 * que es lo que costaría hacer ventanas iluminadas con materiales separados.
 */
export function createCityMaterial(params: THREE.MeshStandardMaterialParameters = {}) {
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.78,
    metalness: 0.04,
    ...params,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = cityUniforms.uNight;
    shader.uniforms.uLampColor = cityUniforms.uLampColor;
    shader.uniforms.uRain = cityUniforms.uRain;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
         attribute float aEmis;
         varying float vEmis;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
         vEmis = aEmis;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
         uniform float uNight;
         uniform vec3 uLampColor;
         uniform float uRain;
         varying float vEmis;`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
         roughnessFactor = mix(roughnessFactor, 0.22, clamp(uRain * 0.7 + uNight * 0.12, 0.0, 0.75));`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
         float lit = vEmis * uNight;
         totalEmissiveRadiance += uLampColor * lit * 1.85;
         diffuseColor.rgb = mix(diffuseColor.rgb, uLampColor * 0.5, lit * 0.42);`,
      );
  };
  mat.customProgramCacheKey = () => "city-emissive-rain";
  return mat;
}

/** Terreno: sin emisión, muy rugoso, con leve variación por pendiente. */
export function createTerrainMaterial() {
  return new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.97,
    metalness: 0,
    flatShading: false,
  });
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
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  varying vec3 vWorld;

  void main() {
    vec2 cell = vWorld.xz / uGrid;
    // Fuera del mapa el fondo es mar abierto.
    float inside = step(0.0, cell.x) * step(cell.x, 1.0) * step(0.0, cell.y) * step(cell.y, 1.0);
    float bed = texture2D(uDepth, clamp(cell, 0.0, 1.0)).r;
    float depth = mix(1.0, clamp(bed, 0.0, 1.0), inside);

    float dist = length(cameraPosition - vWorld);
    // El oleaje es solo sombreado: se perturba la normal, no la geometría. Así una única
    // lámina cubre hasta el horizonte sin teselar ni provocar artefactos de transparencia.
    float detail = smoothstep(240.0, 40.0, dist);
    float dx = cos(vWorld.x * 0.55 + uTime * 0.9) * 0.02
             + cos((vWorld.x + vWorld.z) * 0.23 + uTime * 0.45) * 0.012
             + cos(vWorld.x * 1.7 - uTime * 1.4) * 0.008;
    float dz = -cos(vWorld.z * 0.41 - uTime * 0.7) * 0.018
             + cos((vWorld.x + vWorld.z) * 0.23 + uTime * 0.45) * 0.012
             + cos(vWorld.z * 1.9 + uTime * 1.1) * 0.007;
    vec3 n = normalize(vec3(-dx * detail, 1.0, -dz * detail));

    vec3 viewDir = normalize(cameraPosition - vWorld);
    float fres = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);

    vec3 base = mix(uShallow, uDeep, depth);
    vec3 col = mix(base, uSkyColor, fres * 0.6);

    vec3 h = normalize(uSun + viewDir);
    float spec = pow(max(dot(n, h), 0.0), 80.0);
    col += uSunColor * spec * 1.4 * (1.0 - uNight * 0.6) * detail;

    float foam = smoothstep(0.13, 0.0, depth) * inside
               * (0.45 + 0.55 * sin(vWorld.x * 3.1 + vWorld.z * 2.7 + uTime * 1.8));
    // La espuma se apaga de noche: si no, la orilla brilla como si fuera de día.
    vec3 foamColor = mix(vec3(0.92, 0.95, 0.96), vec3(0.34, 0.42, 0.5), uNight);
    col = mix(col, foamColor, foam * 0.4 * detail);

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
    uFogColor: { value: new THREE.Color(0xbdd8ea) },
    uFogNear: { value: 70 },
    uFogFar: { value: 230 },
  };
  // Opaco a propósito: el agua tapa el lecho y no compite en el pase de transparencias.
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
  varying vec3 vDir;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  void main() {
    vec3 d = normalize(vDir);
    float t = clamp(d.y * 1.15 + 0.08, 0.0, 1.0);
    vec3 col = mix(uHorizon, uTop, pow(t, 0.72));

    float sun = max(dot(d, normalize(uSun)), 0.0);
    col += uSunColor * pow(sun, 26.0) * 0.9 * (1.0 - uNight * 0.85);
    col += uSunColor * pow(sun, 4.0) * 0.16 * (1.0 - uNight);

    vec3 md = normalize(uMoon);
    float moon = max(dot(d, md), 0.0);
    col += vec3(0.86, 0.91, 1.0) * pow(moon, 90.0) * uNight * 1.6;
    col += vec3(0.45, 0.55, 0.75) * pow(moon, 8.0) * uNight * 0.28;

    if (uNight > 0.05 && d.y > 0.02) {
      vec3 q = floor(d * 190.0);
      float s = step(0.9975, hash(q));
      col += vec3(s) * uNight * (0.55 + 0.45 * hash(q + 3.0));
    }
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
