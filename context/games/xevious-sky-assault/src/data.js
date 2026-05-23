export const GAME_CONFIG = {
  width: 1280,
  height: 720,
  playerSpeedX: 390,
  playerSpeedY: 300,
  fireCooldown: 0.16,
  shotLife: 1.3,
  bombLife: 3,
  scrollSpeed: 120,
  trenchTopRatio: 0.56,
  baseGroundYRatio: 0.66,
  winRadarThreshold: 0.98,
};

export const WAVE_TYPES = {
  air: {
    kind: "air",
    hp: 1,
    score: 100,
    yMin: 120,
    yMax: 300,
    driftMin: -1,
    driftMax: 1,
  },
  ground: {
    kind: "ground",
    hp: 2,
    score: 150,
    yMin: 0.64,
    yMax: 0.76,
  },
};

export const WAVES = [
  {
    afterRadar: 0.1,
    interval: 0.72,
    airChance: 0.42,
    maxActive: 4,
  },
  {
    afterRadar: 0.45,
    interval: 0.62,
    airChance: 0.36,
    maxActive: 5,
  },
  {
    afterRadar: 0.75,
    interval: 0.54,
    airChance: 0.28,
    maxActive: 6,
  },
];

