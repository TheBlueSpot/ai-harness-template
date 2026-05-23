export const WIDTH = 1280;
export const HEIGHT = 720;
export const FLOOR_TOP = 210;
export const FLOOR_BOTTOM = 520;
export const FLOOR_LEFT = 120;
export const FLOOR_RIGHT = 1180;
export const PLAYER_SPEED = 4.6;
export const MOUNT_SPEED = 6.5;
export const PLAYER_RANGE_X = 90;
export const PLAYER_RANGE_Y = 42;
export const PLAYER_DAMAGE = 18;
export const MOUNT_DAMAGE = 30;
export const ATTACK_COOLDOWN = 30;
export const MAGIC_MAX = 100;
export const MAX_HEALTH = 100;
export const STAGES = [
  {
    name: "Turtle Village Raid",
    enemies: 5,
    spawnRate: 100,
    riderAt: 3,
    backdrop: ["#173033", "#32524f", "#9eb37b"],
  },
  {
    name: "Bridge of Bones",
    enemies: 7,
    spawnRate: 88,
    riderAt: 2,
    backdrop: ["#221b28", "#3d2b49", "#d89f56"],
  },
  {
    name: "Death Adder Gate",
    enemies: 9,
    spawnRate: 74,
    riderAt: 4,
    backdrop: ["#2d1820", "#5a2432", "#f0c76b"],
  },
];
