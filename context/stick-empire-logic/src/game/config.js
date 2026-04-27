export const GAME_TITLE = "Stick War: Empire RTS";

export const TEAM_IDS = Object.freeze({
  PLAYER: "player",
  ENEMY: "enemy",
  NEUTRAL: "neutral",
});

export const ENTITY_TYPES = Object.freeze({
  UNIT: "unit",
  STRUCTURE: "structure",
  RESOURCE: "resource",
});

export const UNIT_TYPES = Object.freeze({
  MINER: "Miner",
  SWORDWRATH: "Swordwrath",
  ARCHIDON: "Archidon",
});

export const STRUCTURE_TYPES = Object.freeze({
  STATUE: "Statue",
});

export const RESOURCE_TYPES = Object.freeze({
  GOLD_VEIN: "Gold-Vein",
});

export const COMMAND_TYPES = Object.freeze({
  MOVE: "move",
  ATTACK_MOVE: "attack-move",
  HARVEST: "harvest",
  HOLD: "hold",
  RETREAT: "retreat",
  POSSESS: "possess",
});

export const DECISION_MODES = Object.freeze({
  DECISION_TREE: "decision-tree",
  USER_CONTROLLED: "user-controlled",
  HOLDING: "holding",
  IDLE: "idle",
});

export const FORMATION_ROLES = Object.freeze({
  ECON: "econ",
  FRONTLINE: "frontline",
  RANGED: "ranged",
});

export const WORLD_DIMENSIONS = Object.freeze({
  width: 1920,
  height: 1080,
  groundY: 760,
  frontLineX: 960,
  mineLaneY: 710,
});

export const CAMERA_BOUNDS = Object.freeze({
  minX: 0,
  maxX: WORLD_DIMENSIONS.width,
});

export const ARCHER_STANDOFF_DISTANCE = 300;
export const USER_CONTROLLED_ATTACK_SPEED_MULTIPLIER = 1.5;

export const MULTI_SELECT = Object.freeze({
  minDragDistance: 8,
});

export const ECONOMY_DEFAULTS = Object.freeze({
  startingGold: 425,
  goldRate: 1.5,
  population: 0,
  popCap: 18,
});

export const ECONOMY_COSTS = Object.freeze({
  popCapUpgrade: 150,
  popCapIncrease: 6,
});

export const TEAM_COLORS = Object.freeze({
  [TEAM_IDS.PLAYER]: Object.freeze({
    fill: "#e8f0ff",
    accent: "#7cd7eb",
    shadow: "rgba(124, 215, 235, 0.3)",
  }),
  [TEAM_IDS.ENEMY]: Object.freeze({
    fill: "#ffe5de",
    accent: "#ef7b6f",
    shadow: "rgba(239, 123, 111, 0.32)",
  }),
  [TEAM_IDS.NEUTRAL]: Object.freeze({
    fill: "#f8cb74",
    accent: "#dcc28a",
    shadow: "rgba(248, 203, 116, 0.28)",
  }),
});

export const UNIT_STATS = Object.freeze({
  [UNIT_TYPES.MINER]: Object.freeze({
    cost: 60,
    popCost: 1,
    trainTime: 4,
    hp: 65,
    damage: 6,
    attackSpeed: 1,
    speed: 92,
    range: 34,
    radius: 24,
    selectionRadius: 34,
    role: FORMATION_ROLES.ECON,
  }),
  [UNIT_TYPES.SWORDWRATH]: Object.freeze({
    cost: 125,
    popCost: 1,
    trainTime: 6.5,
    hp: 110,
    damage: 16,
    attackSpeed: 1.15,
    speed: 104,
    range: 42,
    radius: 28,
    selectionRadius: 38,
    role: FORMATION_ROLES.FRONTLINE,
  }),
  [UNIT_TYPES.ARCHIDON]: Object.freeze({
    cost: 160,
    popCost: 1,
    trainTime: 7.5,
    hp: 84,
    damage: 13,
    attackSpeed: 0.9,
    speed: 88,
    range: ARCHER_STANDOFF_DISTANCE,
    radius: 26,
    selectionRadius: 36,
    role: FORMATION_ROLES.RANGED,
  }),
});

export const HUD_BUILD_ACTIONS = Object.freeze([
  {
    id: "build-miner",
    label: "Train Miner",
    detail: "60 gold, 1 pop",
    unitType: UNIT_TYPES.MINER,
  },
  {
    id: "build-swordwrath",
    label: "Train Swordwrath",
    detail: "125 gold, 1 pop",
    unitType: UNIT_TYPES.SWORDWRATH,
  },
  {
    id: "build-archidon",
    label: "Train Archidon",
    detail: "160 gold, 1 pop",
    unitType: UNIT_TYPES.ARCHIDON,
  },
  {
    id: "upgrade-pop-cap",
    label: "Raise PopCap",
    detail: "150 gold, +6 cap",
  },
]);

export const HUD_COMMAND_ACTIONS = Object.freeze([
  {
    id: COMMAND_TYPES.MOVE,
    label: "Move",
    detail: "Stage rally target",
  },
  {
    id: COMMAND_TYPES.ATTACK_MOVE,
    label: "Attack-Move",
    detail: "Advance with threat scan",
  },
  {
    id: COMMAND_TYPES.HARVEST,
    label: "Harvest",
    detail: "Route miners to gold",
  },
  {
    id: COMMAND_TYPES.HOLD,
    label: "Hold",
    detail: "Freeze formation anchor",
  },
  {
    id: COMMAND_TYPES.POSSESS,
    label: "Possess",
    detail: "Direct keyboard control",
  },
]);

export const SYSTEM_MODULE_SPECS = Object.freeze({
  unitAI: Object.freeze({
    path: "./UnitAI.js",
    createExport: "createUnitAISystem",
    updateExport: "updateUnitAI",
  }),
  economySystem: Object.freeze({
    path: "./EconomySystem.js",
    createExport: "createEconomySystem",
    updateExport: "updateEconomySystem",
  }),
  commandDirector: Object.freeze({
    path: "./CommandDirector.js",
    createExport: "createCommandDirector",
    updateExport: "updateCommandDirector",
  }),
  formationLogic: Object.freeze({
    path: "./FormationLogic.js",
    createExport: "createFormationLogic",
    updateExport: "updateFormationLogic",
  }),
});

export const ASSET_SLOT_NOTES = Object.freeze({
  units: "Swap placeholder SVGs with transparent public-domain unit art by slot.",
  structures: "Replace statue placeholder independently from unit art.",
  resources: "Gold veins can stay code-native or switch to painted props.",
});
