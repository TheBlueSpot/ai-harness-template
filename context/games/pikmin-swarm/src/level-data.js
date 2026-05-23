export const WORLD_BOUNDS = {
  width: 1280,
  height: 720,
};

export const BASE_LOCATION = {
  x: 170,
  y: 470,
};

export const FOLLOWER_TYPES = {
  red: { id: "red", label: "Red Sprout", color: "#d94a3b", speed: 330, carryRadius: 28 },
  yellow: { id: "yellow", label: "Yellow Sprout", color: "#efe05b", speed: 330, carryRadius: 28 },
  blue: { id: "blue", label: "Blue Sprout", color: "#63c7da", speed: 330, carryRadius: 28 },
  purple: { id: "purple", label: "Purple Sprout", color: "#d88be0", speed: 330, carryRadius: 28 },
};

export const ENEMY_TYPES = {
  sproutling: {
    id: "sproutling",
    label: "Sproutling",
    hp: 1,
    damage: 1,
    speed: 140,
    aggroRadius: 220,
  },
  burrower: {
    id: "burrower",
    label: "Burrower",
    hp: 3,
    damage: 2,
    speed: 110,
    aggroRadius: 280,
  },
};

export const INTERACTABLE_TYPES = {
  pellet: { id: "pellet", label: "Pellet", pickupRadius: 28, carryValue: 4 },
  gate: { id: "gate", label: "Gate", progressNeeded: 100 },
  base: { id: "base", label: "Onion Base", depositRadius: 64 },
};

export const LEVEL_LAYOUT = {
  spawnCursor: {
    x: BASE_LOCATION.x + 120,
    y: BASE_LOCATION.y - 40,
  },
  swarmStart: [
    { kind: "red", x: 136, y: 480 },
    { kind: "yellow", x: 124, y: 492 },
    { kind: "red", x: 150, y: 500 },
  ],
  interactables: [
    { id: "pellet-1", type: "pellet", x: 570, y: 460, value: 4, required: 2 },
    { id: "pellet-2", type: "pellet", x: 760, y: 310, value: 6, required: 3 },
    { id: "gate-1", type: "gate", x: 840, y: 560, progressNeeded: 100 },
  ],
  enemies: [
    { id: "bulborb", type: "sproutling", x: 940, y: 470 },
    { id: "dwelling", type: "burrower", x: 1020, y: 325 },
  ],
};

export const PROGRESSION_CHECKPOINTS = [
  {
    id: "launch",
    label: "Launch",
    objective: "Guide the leader, whistle the idle squad, and move to the first pellet.",
  },
  {
    id: "harvest",
    label: "Harvest",
    objective: "Cluster on the pellet, then carry it home.",
  },
  {
    id: "gate",
    label: "Return",
    objective: "Hold the squad on the gate to push it open.",
  },
];

export function createLevelConfig() {
  return {
    world: { ...WORLD_BOUNDS, base: { ...BASE_LOCATION } },
    followerTypes: { ...FOLLOWER_TYPES },
    enemyTypes: { ...ENEMY_TYPES },
    interactableTypes: { ...INTERACTABLE_TYPES },
    layout: {
      spawnCursor: { ...LEVEL_LAYOUT.spawnCursor },
      swarmStart: LEVEL_LAYOUT.swarmStart.map((unit) => ({ ...unit })),
      interactables: LEVEL_LAYOUT.interactables.map((item) => ({ ...item })),
      enemies: LEVEL_LAYOUT.enemies.map((enemy) => ({ ...enemy })),
    },
    checkpoints: PROGRESSION_CHECKPOINTS.map((checkpoint) => ({ ...checkpoint })),
  };
}
