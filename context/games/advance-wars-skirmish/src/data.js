export const GRID_WIDTH = 10;
export const GRID_HEIGHT = 8;

export const UNIT_TYPES = {
  infantry: { move: 3, minRange: 1, maxRange: 1, ammo: 99, fuel: 99, attack: 3, maxHp: 10, capture: 10, cost: 1000, symbol: "I" },
  tank: { move: 5, minRange: 1, maxRange: 1, ammo: 6, fuel: 50, attack: 7, maxHp: 10, capture: 0, cost: 7000, symbol: "T" },
  artillery: { move: 3, minRange: 2, maxRange: 3, ammo: 6, fuel: 40, attack: 5, maxHp: 10, capture: 0, cost: 6000, symbol: "A" },
};

export const MAP = [
  ["hq", "road", "plain", "plain", "forest", "road", "plain", "plain", "road", "plain"],
  ["road", "road", "plain", "forest", "road", "road", "plain", "forest", "road", "road"],
  ["plain", "plain", "road", "road", "plain", "forest", "road", "plain", "plain", "plain"],
  ["plain", "city", "road", "plain", "road", "road", "plain", "plain", "base", "plain"],
  ["plain", "city", "base", "forest", "road", "road", "forest", "city", "base", "plain"],
  ["plain", "plain", "road", "plain", "forest", "road", "plain", "plain", "road", "plain"],
  ["road", "forest", "road", "plain", "road", "road", "plain", "forest", "road", "road"],
  ["plain", "road", "plain", "plain", "forest", "road", "plain", "plain", "road", "hq"],
];

export const STRUCTURES = [
  { id: "p-hq", type: "hq", owner: "player", x: 0, y: 0 },
  { id: "p-city", type: "city", owner: "player", x: 1, y: 3 },
  { id: "p-base", type: "base", owner: "player", x: 2, y: 4 },
  { id: "mid-city", type: "city", owner: null, x: 1, y: 4 },
  { id: "mid-base", type: "base", owner: null, x: 8, y: 4 },
  { id: "e-base", type: "base", owner: "enemy", x: 8, y: 3 },
  { id: "e-city", type: "city", owner: "enemy", x: 7, y: 4 },
  { id: "e-hq", type: "hq", owner: "enemy", x: 9, y: 7 },
];

export const SCENARIO_SETUP = {
  funds: { player: 5000, enemy: 5000 },
  cursor: { x: 1, y: 6 },
  units: [
    { id: "p-inf-1", side: "player", type: "infantry", x: 1, y: 6 },
    { id: "p-tank-1", side: "player", type: "tank", x: 2, y: 6 },
    { id: "p-art-1", side: "player", type: "artillery", x: 0, y: 7 },
    { id: "e-inf-1", side: "enemy", type: "infantry", x: 8, y: 1 },
    { id: "e-tank-1", side: "enemy", type: "tank", x: 7, y: 1 },
    { id: "e-art-1", side: "enemy", type: "artillery", x: 9, y: 0 },
  ],
};

export const CONTROL_TEXT = {
  menu: "Select a unit, then move, attack, or capture.",
  playerPhase: "Player phase. Move units, then end turn.",
  objective: "Take the enemy HQ or wipe the army.",
};
