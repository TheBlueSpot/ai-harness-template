export const LANES = [
  { id: 0, y: 164, name: "North Wall" },
  { id: 1, y: 278, name: "East Gate" },
  { id: 2, y: 392, name: "South Breach" },
  { id: 3, y: 506, name: "River Steps" },
];

export const VOCABULARY = {
  easy: [
    "ash", "bone", "claw", "crypt", "dusk", "fang", "fog", "grave",
    "gloom", "moan", "rot", "skull", "slime", "spore", "torch", "wail",
  ],
  medium: [
    "barricade", "crawler", "feral", "howling", "lantern", "lurking",
    "maggot", "plague", "ravenous", "scarlet", "shambler", "stalking",
  ],
  hard: [
    "abomination", "catacomb", "contagion", "detonation", "graveborn",
    "hemorrhage", "nightfall", "obliterate", "quarantine", "reclamation",
  ],
};

export const SCORE_VALUES = {
  easy: 100,
  medium: 180,
  hard: 280,
  perfectSubmit: 40,
};

export const DIFFICULTY = {
  spawnX: 1180,
  barricadeX: 168,
  laneWidth: 920,
  breachDamage: 14,
  baseSpeed: 32,
  comboWindow: 2.6,
  staggerDuration: 0.24,
};

export const WAVES = [
  { count: 8, interval: 1.5, speed: 0.95, tiers: ["easy"], laneBias: [0, 1, 2, 3] },
  { count: 10, interval: 1.18, speed: 1.08, tiers: ["easy", "medium"], laneBias: [1, 2, 3, 2, 1, 0] },
  { count: 12, interval: 0.98, speed: 1.18, tiers: ["medium"], laneBias: [0, 2, 1, 3, 2, 1] },
  { count: 14, interval: 0.82, speed: 1.28, tiers: ["easy", "medium", "hard"], laneBias: [3, 2, 1, 0, 1, 2, 3] },
  { count: 16, interval: 0.7, speed: 1.42, tiers: ["medium", "hard"], laneBias: [0, 1, 2, 3, 3, 2, 1, 0] },
];
