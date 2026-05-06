export const PHASE = Object.freeze({
  MENU: "menu",
  PLAY: "play",
  WIN: "win",
  LOSE: "lose",
});

export const MONSTER = Object.freeze({
  maxHealth: 100,
  climbSpeed: 110,
  hopSpeed: 40,
  punchDamage: 24,
  kickDamage: 34,
  slamDamage: 42,
  pickupHeal: 22,
});

export const STAGE = Object.freeze({
  worldWidth: 1920,
  groundY: 760,
  climbCeiling: 120,
  targetScore: 1000,
  collapseBonus: 80,
  civilianSaveBonus: 25,
  maxTime: 240,
  startDelay: 1.1,
});

export const BUILDING_SEGMENT_TYPES = Object.freeze([
  { key: "foundation", durability: 42, score: 18, reward: 20, width: 88, height: 22, color: "#5b6373" },
  { key: "floor", durability: 28, score: 12, reward: 14, width: 88, height: 28, color: "#4f596d" },
  { key: "window", durability: 20, score: 8, reward: 10, width: 88, height: 30, color: "#70809b" },
  { key: "roof", durability: 18, score: 16, reward: 18, width: 96, height: 20, color: "#3f4755" },
]);

export const BUILDINGS = Object.freeze([
  { id: "alpha", x: 120, segments: [8, 8, 7, 1] },
  { id: "bravo", x: 360, segments: [7, 7, 6, 1] },
  { id: "charlie", x: 620, segments: [9, 9, 8, 1] },
  { id: "delta", x: 920, segments: [6, 7, 6, 1] },
  { id: "echo", x: 1170, segments: [8, 8, 7, 1] },
  { id: "foxtrot", x: 1440, segments: [7, 6, 6, 1] },
]);

export const ENEMY_WAVES = Object.freeze([
  { time: 4, type: "helicopter", count: 1, hp: 40, speed: 92, attack: 10, spacing: 0 },
  { time: 10, type: "tank", count: 2, hp: 56, speed: 50, attack: 14, spacing: 130 },
  { time: 20, type: "helicopter", count: 2, hp: 44, speed: 105, attack: 12, spacing: 90 },
  { time: 32, type: "tank", count: 2, hp: 64, speed: 58, attack: 18, spacing: 150 },
]);

export const PICKUPS = Object.freeze({
  health: { heal: 25, score: 35 },
  civilian: { heal: 14, score: 50 },
});

export const RUN_TIMING = Object.freeze({
  enemyShotInterval: 1.7,
  tankShotInterval: 2.2,
  buildingCollapseDelay: 0.8,
  pickupSpawnInterval: 9,
});
