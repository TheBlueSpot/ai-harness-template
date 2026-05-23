export const WIDTH = 1280;
export const HEIGHT = 720;
export const FLOOR_Y = 656;
export const WRAP_MARGIN = 96;
export const PLAYER_MAX_HP = 4;
export const MAX_WAVE = 4;
export const HATCH_TIME = 6.5;

export const WAVES = [
  { enemies: ["drifter", "drifter", "diver"] },
  { enemies: ["drifter", "diver", "diver", "hunter"] },
  { enemies: ["drifter", "hunter", "diver", "hunter", "diver"] },
  { enemies: ["hunter", "hunter", "diver", "diver", "storm"] },
];

export const PERCHES = [
  { x: 250, y: 560, w: 220, h: 22 },
  { x: 685, y: 474, w: 240, h: 20 },
  { x: 1050, y: 596, w: 240, h: 22 },
];

export const ENEMY_TYPES = {
  drifter: {
    label: "Drifter",
    color: "#f7b267",
    speed: 120,
    liftBias: 0.8,
    diveRate: 0.16,
    surgeRate: 0.18,
    patience: 1.6,
  },
  diver: {
    label: "Diver",
    color: "#ff6f91",
    speed: 148,
    liftBias: 0.9,
    diveRate: 0.28,
    surgeRate: 0.26,
    patience: 1.25,
  },
  hunter: {
    label: "Hunter",
    color: "#7ce0ff",
    speed: 170,
    liftBias: 1,
    diveRate: 0.3,
    surgeRate: 0.38,
    patience: 1.05,
  },
  storm: {
    label: "Storm Ace",
    color: "#d1a6ff",
    speed: 190,
    liftBias: 1.1,
    diveRate: 0.36,
    surgeRate: 0.42,
    patience: 0.92,
  },
};

export const TIPS = [
  "Win clashes from above. Low lance loses the trade.",
  "Loose eggs hatch into new riders unless you grab them first.",
  "Surge after a flap to steal altitude back before the next dive.",
  "Enemy tells glow red before a hard dive. Move early, not late.",
];
