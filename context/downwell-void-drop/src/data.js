export const VIEW_WIDTH = 960;
export const VIEW_HEIGHT = 540;
export const SHAFT_WIDTH = 480;
export const WORLD_DEPTH = 7600;
export const MAX_AMMO = 10;
export const START_HEALTH = 5;
export const PLAYER_WIDTH = 24;
export const PLAYER_HEIGHT = 34;
export const REQUIRED_RELAYS = 3;

export const BIOMES = [
  { name: "Surface", depth: 0, sky: "#0f1726", haze: "#13233f", accent: "#86efac" },
  { name: "Pump Works", depth: 1200, sky: "#111827", haze: "#1d3557", accent: "#7dd3fc" },
  { name: "Furnace Vein", depth: 2800, sky: "#1b1120", haze: "#4c1d1d", accent: "#fb923c" },
  { name: "Abyss Gate", depth: 4300, sky: "#12091c", haze: "#33104d", accent: "#f9a8d4" },
];

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function getBiome(depth) {
  let current = BIOMES[0];
  for (const biome of BIOMES) {
    if (depth >= biome.depth) {
      current = biome;
    }
  }
  return current;
}
