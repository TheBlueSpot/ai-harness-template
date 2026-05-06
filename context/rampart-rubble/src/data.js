export const GRID_COLS = 14;
export const GRID_ROWS = 7;
export const CELL_SIZE = 28;
export const GRID_X = 284;
export const GRID_Y = 286;
export const MAX_WAVES = 4;
export const REBUILD_SECONDS = 18;
export const DEFEND_SECONDS = 24;
export const CANNON_FIRE_RATE = 0.38;
export const ENEMY_FIRE_RATE = 2.2;
export const GRAVITY = 720;
export const PIECES = [
  {
    name: "Line",
    cells: [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0]
    ]
  },
  {
    name: "Corner",
    cells: [
      [0, 0],
      [0, 1],
      [1, 1],
      [2, 1]
    ]
  },
  {
    name: "Arch",
    cells: [
      [0, 1],
      [1, 0],
      [1, 1],
      [2, 1]
    ]
  },
  {
    name: "Block",
    cells: [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1]
    ]
  }
];

export const WAVES = [
  { ships: 3, shipHp: 3, shellRate: 2.3, shellSpeed: 250, materials: 18 },
  { ships: 4, shipHp: 4, shellRate: 1.9, shellSpeed: 280, materials: 18 },
  { ships: 5, shipHp: 5, shellRate: 1.65, shellSpeed: 300, materials: 20 },
  { ships: 6, shipHp: 6, shellRate: 1.45, shellSpeed: 325, materials: 22 }
];
