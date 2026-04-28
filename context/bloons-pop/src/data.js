export const WIDTH = 1280;
export const HEIGHT = 720;

export const PATH_POINTS = [
  { x: 76, y: 612 },
  { x: 214, y: 612 },
  { x: 214, y: 472 },
  { x: 452, y: 472 },
  { x: 452, y: 598 },
  { x: 756, y: 598 },
  { x: 756, y: 312 },
  { x: 1022, y: 312 },
  { x: 1022, y: 154 },
  { x: 1196, y: 154 },
];

export const TOWER_DEFS = {
  dart: {
    id: "dart",
    name: "Dart Tower",
    cost: 65,
    range: 136,
    fireRate: 0.52,
    projectileSpeed: 480,
    damage: 1,
    color: "#ffbc42",
    projectileColor: "#fff4bf",
    projectileRadius: 6,
    splash: 0,
  },
  bomb: {
    id: "bomb",
    name: "Bomb Tower",
    cost: 130,
    range: 164,
    fireRate: 1.05,
    projectileSpeed: 330,
    damage: 2,
    color: "#ff6b6b",
    projectileColor: "#ff8f8f",
    projectileRadius: 8,
    splash: 54,
  },
  glue: {
    id: "glue",
    name: "Glue Tower",
    cost: 95,
    range: 144,
    fireRate: 0.82,
    projectileSpeed: 360,
    damage: 1,
    color: "#6bcB77",
    projectileColor: "#d4ff8b",
    projectileRadius: 7,
    splash: 0,
    slowFactor: 0.55,
    slowDuration: 2.2,
  },
};

export const BLOON_TYPES = {
  red: {
    id: "red",
    hp: 1,
    speed: 56,
    reward: 1,
    leak: 1,
    radius: 16,
    color: "#ff5252",
    volatile: false,
  },
  blue: {
    id: "blue",
    hp: 2,
    speed: 72,
    reward: 2,
    leak: 1,
    radius: 17,
    color: "#4dabf7",
    volatile: false,
  },
  green: {
    id: "green",
    hp: 3,
    speed: 84,
    reward: 3,
    leak: 1,
    radius: 18,
    color: "#51cf66",
    volatile: false,
  },
  yellow: {
    id: "yellow",
    hp: 4,
    speed: 98,
    reward: 4,
    leak: 2,
    radius: 19,
    color: "#ffd43b",
    volatile: false,
  },
  black: {
    id: "black",
    hp: 2,
    speed: 68,
    reward: 5,
    leak: 2,
    radius: 18,
    color: "#343a40",
    volatile: true,
    blastRadius: 72,
    blastDamage: 2,
  },
};

export const WAVES = [
  {
    label: "Warmup",
    reward: 24,
    entries: [{ type: "red", count: 12, spacing: 0.6 }],
  },
  {
    label: "Blue Curve",
    reward: 34,
    entries: [
      { type: "red", count: 10, spacing: 0.52 },
      { type: "blue", count: 8, spacing: 0.64 },
    ],
  },
  {
    label: "Green Push",
    reward: 42,
    entries: [
      { type: "blue", count: 10, spacing: 0.48 },
      { type: "green", count: 8, spacing: 0.58 },
    ],
  },
  {
    label: "Volatile Chain",
    reward: 52,
    entries: [
      { type: "green", count: 8, spacing: 0.42 },
      { type: "black", count: 6, spacing: 0.74 },
      { type: "yellow", count: 6, spacing: 0.62 },
    ],
  },
  {
    label: "Fast Scatter",
    reward: 64,
    entries: [
      { type: "yellow", count: 12, spacing: 0.38 },
      { type: "black", count: 8, spacing: 0.58 },
    ],
  },
  {
    label: "Pop Storm",
    reward: 90,
    entries: [
      { type: "green", count: 10, spacing: 0.32 },
      { type: "yellow", count: 10, spacing: 0.38 },
      { type: "black", count: 10, spacing: 0.46 },
    ],
  },
];

export const STARTING_CASH = 220;
export const STARTING_LIVES = 25;
export const PLACEMENT_MARGIN = 58;
export const TOWER_SPACING = 54;
export const INTERMISSION_TIME = 7;
