import {
  BASE_LOCATION,
  ENEMY_TYPES,
  FOLLOWER_TYPES,
  INTERACTABLE_TYPES,
  LEVEL_LAYOUT,
  PROGRESSION_CHECKPOINTS,
  WORLD_BOUNDS,
  createLevelConfig,
} from "./level-data.js";

export {
  BASE_LOCATION,
  ENEMY_TYPES,
  FOLLOWER_TYPES,
  INTERACTABLE_TYPES,
  LEVEL_LAYOUT,
  PROGRESSION_CHECKPOINTS,
  WORLD_BOUNDS,
  createLevelConfig,
};

export const WORLD = {
  width: WORLD_BOUNDS.width,
  height: WORLD_BOUNDS.height,
  groundY: 560,
  base: { x: BASE_LOCATION.x, y: BASE_LOCATION.y, radius: 44 },
  homeRadius: 64,
  commandRadius: 180,
  recruitRadius: 150,
  whistleRadius: 92,
  throwRadius: 220,
  enemySightRadius: 210,
  enemyAttackRadius: 38,
  maxSquad: 9,
  daySeconds: 120,
};

export const INITIAL_PIKMIN = LEVEL_LAYOUT.swarmStart.map((pikmin, index) => ({
  kind: index % 2 === 0 ? "red" : "yellow",
  x: pikmin.x,
  y: pikmin.y,
}));

export const ACTORS = {
  pikmin: Object.values(FOLLOWER_TYPES).map((follower) => ({
    kind: follower.id,
    color: follower.color,
  })),
  enemies: [
    {
      id: "bulborb",
      x: 940,
      y: 470,
      radius: 28,
      speed: ENEMY_TYPES.sproutling.speed,
      damage: ENEMY_TYPES.sproutling.damage,
      health: 10,
      sight: ENEMY_TYPES.sproutling.aggroRadius,
      color: "#b84b3e",
      telegraph: "Hunt the spotted brute from behind.",
    },
    {
      id: "dwelling",
      x: 1020,
      y: 325,
      radius: 22,
      speed: ENEMY_TYPES.burrower.speed,
      damage: ENEMY_TYPES.burrower.damage,
      health: 6,
      sight: ENEMY_TYPES.burrower.aggroRadius,
      color: "#6f8f44",
      telegraph: "Lure the skittering scout before it bites.",
    },
  ],
  tasks: [
    {
      id: "pellet-1",
      x: 570,
      y: 460,
      radius: 16,
      value: 4,
      required: 2,
      color: "#76c553",
      prompt: "Cluster on the pellet, then carry it home.",
    },
    {
      id: "pellet-2",
      x: 760,
      y: 310,
      radius: 16,
      value: 6,
      required: 3,
      color: "#77d36b",
      prompt: "More squad members can lift this faster.",
    },
    {
      id: "gate-1",
      x: 840,
      y: 560,
      radius: 32,
      progressNeeded: 100,
      color: "#8c6a3a",
      prompt: "Hold the squad on the gate to push it open.",
    },
  ],
};

export const CONTROLS = {
  move: "WASD or arrows",
  whistle: "Space",
  throw: "Enter",
  restart: "Enter",
};
