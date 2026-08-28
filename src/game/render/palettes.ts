/** Paletas de fachada. Cada familia de edificios elige una; las variantes mezclan dentro de ella. */
export interface Palette {
  wall: number[];
  trim: number;
  roof: number;
  base: number;
  window: number;
  accent: number;
}

export const PALETTES: Record<string, Palette> = {
  suburb: {
    wall: [0xe6d9c4, 0xefe6d6, 0xd9c6ab, 0xe2cfc2, 0xd6ddd4],
    trim: 0xf5efe4,
    roof: 0x8d4438,
    base: 0xb9ab97,
    window: 0x4f6a78,
    accent: 0x6e5442,
  },
  townhouse: {
    wall: [0xd8c3ab, 0xc9ae95, 0xe3d4bd, 0xbfae9c],
    trim: 0xf2ece0,
    roof: 0x6d4133,
    base: 0x9a8a76,
    window: 0x4a6472,
    accent: 0x8a5a3c,
  },
  block: {
    wall: [0xd2cdc4, 0xc2c8c9, 0xdcd4c6, 0xb4b9b8],
    trim: 0xeae6dd,
    roof: 0x565a5c,
    base: 0x8f9291,
    window: 0x47606e,
    accent: 0x7f8a8e,
  },
  modern: {
    wall: [0xe4e7ea, 0xd6dade, 0xcdd6db, 0xeceae4],
    trim: 0xf6f7f8,
    roof: 0x4a5157,
    base: 0x9aa1a6,
    window: 0x44606f,
    accent: 0x5b7f96,
  },
  retail: {
    wall: [0xefe9dc, 0xe4d7c0, 0xdde6e8, 0xf1e6d3],
    trim: 0xfbf6ec,
    roof: 0x5f5a52,
    base: 0xa79c8c,
    window: 0x4c6675,
    accent: 0xc4553f,
  },
  mall: {
    wall: [0xe8e3d8, 0xd9d3c6],
    trim: 0xf4f0e6,
    roof: 0x6a6258,
    base: 0x9d9689,
    window: 0x4a6472,
    accent: 0x3d7ec4,
  },
  office: {
    wall: [0xcfd6db, 0xdde2e6, 0xc4ccd2, 0xe3e6e8],
    trim: 0xeef1f3,
    roof: 0x474e54,
    base: 0x8e969c,
    window: 0x42606f,
    accent: 0x4f7d99,
  },
  glass: {
    wall: [0x9fb6c4, 0x8fa9ba, 0xb2c4ce, 0x7d97a8],
    trim: 0xd8e3e9,
    roof: 0x3d474e,
    base: 0x77848c,
    window: 0x3f5f70,
    accent: 0xbcd2dd,
  },
  industry: {
    wall: [0xb3a894, 0xa39781, 0xc0b6a2, 0x97a09b],
    trim: 0xcfc7b6,
    roof: 0x6b6154,
    base: 0x7d7466,
    window: 0x4d6270,
    accent: 0xc08a3a,
  },
  logistics: {
    wall: [0xc9c6bd, 0xb8b7ae, 0xd3d0c6],
    trim: 0xe2e0d8,
    roof: 0x5f6266,
    base: 0x86867f,
    window: 0x4d6270,
    accent: 0x3f6f9e,
  },
  heavy: {
    wall: [0x8d857a, 0x7d766b, 0x9b9184, 0x6f6a63],
    trim: 0xa8a094,
    roof: 0x4d4943,
    base: 0x5f5b55,
    window: 0x4a5b66,
    accent: 0xb4642f,
  },
  clean: {
    wall: [0xe7ece9, 0xd8e2dd, 0xf0f2ee],
    trim: 0xf7f9f7,
    roof: 0x4f5d58,
    base: 0x93a09a,
    window: 0x223038,
    accent: 0x3f9a7a,
  },
  civic: {
    wall: [0xe9e2d2, 0xdcd3c0, 0xf1ece0],
    trim: 0xfaf6ec,
    roof: 0x4c5b63,
    base: 0x9e9484,
    window: 0x4b6573,
    accent: 0x2f6f8a,
  },
  health: {
    wall: [0xf0f2f0, 0xe2e8e8, 0xf6f7f5],
    trim: 0xfbfcfa,
    roof: 0x53656b,
    base: 0xa4adad,
    window: 0x4a6673,
    accent: 0x3f9a8a,
  },
  police: {
    wall: [0xd8dee4, 0xc7d0d8, 0xe4e9ee],
    trim: 0xf0f3f6,
    roof: 0x3c4a5a,
    base: 0x8d97a2,
    window: 0x445f70,
    accent: 0x2b4f80,
  },
  fire: {
    wall: [0xdcd6cd, 0xcfc7bc, 0xe6e1d8],
    trim: 0xf3efe7,
    roof: 0x6a4038,
    base: 0x998f84,
    window: 0x4a6474,
    accent: 0xb8342a,
  },
  hall: {
    wall: [0xece4d2, 0xe0d6c0, 0xf4eee0],
    trim: 0xfcf8ee,
    roof: 0x4d5a55,
    base: 0xa89c85,
    window: 0x4d6674,
    accent: 0xb99a4a,
  },
  park: {
    wall: [0x4f8f56, 0x5d9a5f, 0x468050],
    trim: 0xc9bb96,
    roof: 0x3d7a48,
    base: 0x6b7f52,
    window: 0x4f6a78,
    accent: 0xc2b184,
  },
  dirt: {
    wall: [0x8d8371, 0x7d7566, 0x9a9080],
    trim: 0xa89d89,
    roof: 0x6a6154,
    base: 0x6f6759,
    window: 0x4d6270,
    accent: 0x5d5a4e,
  },
};

/** Colores del terreno y del entorno. */
export const TERRAIN_COLORS = {
  grassLow: [0.33, 0.46, 0.24] as const,
  grassHigh: [0.42, 0.5, 0.29] as const,
  grassDry: [0.52, 0.52, 0.31] as const,
  sand: [0.79, 0.71, 0.55] as const,
  rock: [0.44, 0.42, 0.4] as const,
  cliff: [0.36, 0.34, 0.32] as const,
  snow: [0.86, 0.87, 0.88] as const,
};

export const ASPHALT = 0x33373d;
export const ASPHALT_WORN = 0x3d424a;
export const SIDEWALK = 0x9a978f;
export const CURB = 0x807d76;
export const MARKING = 0xd8d2be;
export const MARKING_WARM = 0xd8b455;
