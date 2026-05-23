export const WIDTH = 1280;
export const HEIGHT = 720;
export const ROOM_WIDTH = 1680;
export const ROOM_HEIGHT = 1080;
export const VIEW_MARGIN = 140;
export const PLAYER_RADIUS = 20;
export const ENEMY_RADIUS = 18;
export const GENERATOR_RADIUS = 34;
export const DOOR_WIDTH = 110;
export const DOOR_HEIGHT = 28;

export const HERO_CLASSES = [
  {
    id: "warrior",
    name: "Warrior",
    color: "#d07a3f",
    hp: 220,
    speed: 220,
    cooldown: 0.42,
    damage: 34,
    range: 94,
    arc: 1.35,
    projectile: false,
    description: "Wide axe sweep, big health pool, room-clearing melee arcs.",
  },
  {
    id: "valkyrie",
    name: "Valkyrie",
    color: "#dfd268",
    hp: 180,
    speed: 250,
    cooldown: 0.28,
    damage: 24,
    range: 118,
    arc: 0.72,
    projectile: false,
    description: "Fast spear thrusts, longest melee reach, best mobility.",
  },
  {
    id: "wizard",
    name: "Wizard",
    color: "#71c7ff",
    hp: 150,
    speed: 205,
    cooldown: 0.24,
    damage: 18,
    range: 0,
    arc: 0,
    projectile: true,
    projectileSpeed: 560,
    projectileRadius: 10,
    pierce: 2,
    description: "Arcane bolts pierce clustered ghosts and chip generators from range.",
  },
  {
    id: "elf",
    name: "Elf",
    color: "#8ae38d",
    hp: 165,
    speed: 275,
    cooldown: 0.12,
    damage: 11,
    range: 0,
    arc: 0,
    projectile: true,
    projectileSpeed: 760,
    projectileRadius: 7,
    pierce: 1,
    description: "Rapid bow fire and top speed for constant kiting.",
  },
];

export const FLOOR_PALETTES = [
  {
    floor: "#1d2238",
    line: "#2e3552",
    accent: "#6be0ff",
    name: "Sunken Hall",
    lore: "Old moat seep through stone. First ghosts rise from flooded vault.",
    omen: "Ghosts surge faster from generators.",
    modifier: { generatorSpeedMultiplier: 1.16 },
  },
  {
    floor: "#221a2f",
    line: "#342349",
    accent: "#e175ff",
    name: "Violet Archive",
    lore: "Hero pass cracked library. Names of dead kings whisper from walls.",
    omen: "Wardens arrive tougher but drop bigger score.",
    modifier: { enemyHpMultiplier: 1.22, scoreMultiplier: 1.18 },
  },
  {
    floor: "#1d2f22",
    line: "#294332",
    accent: "#9dff7b",
    name: "Root Crypt",
    lore: "Tree roots break through tomb ceiling. Living maze close around crawl.",
    omen: "Extra generator guarded by thicker swarm.",
    modifier: { extraGenerators: 1, startingGhostBonus: 2 },
  },
  {
    floor: "#2b2119",
    line: "#503423",
    accent: "#ffb36b",
    name: "Ash Foundry",
    lore: "Forge below catacomb still burn. Cinders mark path toward deeper gate.",
    omen: "Hunters move faster and hit harder.",
    modifier: { enemySpeedMultiplier: 1.14, enemyDamageBonus: 2 },
  },
];

export const RELIC_DEFS = [
  {
    id: "iron-bastion",
    name: "Iron Bastion",
    flavor: "Tower shield shard from first gate captain.",
    effectText: "+40 max HP. Heal 40 now.",
  },
  {
    id: "ember-core",
    name: "Ember Core",
    flavor: "Forge heart still hot from siege below.",
    effectText: "+7 damage. Projectiles grow larger.",
  },
  {
    id: "wind-sandals",
    name: "Wind Sandals",
    flavor: "Ash-marked straps made for running circles around doom.",
    effectText: "+26 move speed. -10% attack cooldown.",
  },
  {
    id: "moon-quiver",
    name: "Moon Quiver",
    flavor: "Moon-silver fletching bends shots through packed ghosts.",
    effectText: "Ranged heroes +1 pierce. Melee heroes +18 range.",
  },
  {
    id: "grave-spice",
    name: "Grave Spice",
    flavor: "Dust vial. Bitter. Hero breath turn battle-hot.",
    effectText: "Break generator -> heal 18. Kill streaks burst harder.",
  },
  {
    id: "oracle-map",
    name: "Oracle Map",
    flavor: "Ink redraws future rooms while hero looks away.",
    effectText: "+18% score value. Next floor start heal 24.",
  },
];
