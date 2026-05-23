export const VIEW = {
  tankWidth: 0.72,
  tankHeight: 0.68,
  tankTop: 0.18,
};

export const GAME = {
  startFood: 3,
  maxFood: 24,
  maxShots: 14,
  foodCost: 5,
  shotCost: 12,
  startSun: 40,
  sunFromFood: 3,
  sunFromCoin: 15,
  winSun: 220,
  loseFish: 0,
  tick: 1 / 60,
  spawnFishEvery: 9,
  spawnCoinEvery: 8,
  spawnAlienEvery: 22,
  eggProgress: 100,
};

export const FISH_TYPES = [
  {
    id: "common",
    label: "Common",
    cost: 20,
    speed: 0.18,
    hungerRate: 0.058,
    eatTime: 0.8,
    eatRadius: 0.022,
    color: "#ffb35a",
    finColor: "#ff8e4e",
    support: 0.06,
  },
  {
    id: "swift",
    label: "Swift",
    cost: 28,
    speed: 0.24,
    hungerRate: 0.07,
    eatTime: 0.68,
    eatRadius: 0.024,
    color: "#7ddfff",
    finColor: "#4fc4f1",
    support: 0.08,
  },
  {
    id: "guardian",
    label: "Guardian",
    cost: 36,
    speed: 0.16,
    hungerRate: 0.045,
    eatTime: 0.92,
    eatRadius: 0.03,
    color: "#ff8bb7",
    finColor: "#d5648f",
    support: 0.12,
  },
];

export const ALIEN_TYPES = [
  {
    id: "scout",
    label: "Scout",
    speed: 0.14,
    damage: 1,
    stun: 1.4,
    color: "#b9ff6e",
  },
  {
    id: "snatcher",
    label: "Snatcher",
    speed: 0.11,
    damage: 2,
    stun: 1.8,
    color: "#8fdc5c",
  },
];

export const WAVE_DEFS = [
  { at: 0, fish: 3, aliens: 0, eggs: 0 },
  { at: 22, fish: 4, aliens: 1, eggs: 0 },
  { at: 48, fish: 5, aliens: 1, eggs: 1 },
  { at: 80, fish: 6, aliens: 2, eggs: 2 },
];
