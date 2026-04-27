import {
  ARCHER_STANDOFF_DISTANCE,
  DECISION_MODES,
  ENTITY_TYPES,
  FORMATION_ROLES,
  RESOURCE_TYPES,
  STRUCTURE_TYPES,
  TEAM_IDS,
  UNIT_STATS,
  UNIT_TYPES,
  USER_CONTROLLED_ATTACK_SPEED_MULTIPLIER,
  WORLD_DIMENSIONS,
} from "./config.js";
import { createEntityId } from "./GameState.js";

function createVector(x, y) {
  return { x, y };
}

function resolveFormationRole(unitType) {
  return UNIT_STATS[unitType]?.role ?? FORMATION_ROLES.FRONTLINE;
}

function resolveDecisionTreeId(unitType) {
  return `${unitType.replaceAll(" ", "")}DecisionTree`;
}

export function createUnitEntity({
  id = createEntityId("unit"),
  team = TEAM_IDS.PLAYER,
  unitType = UNIT_TYPES.SWORDWRATH,
  x = 0,
  y = WORLD_DIMENSIONS.mineLaneY,
} = {}) {
  const statBlock = UNIT_STATS[unitType];
  if (!statBlock) {
    throw new Error(`Unknown unit type: ${unitType}`);
  }

  return {
    id,
    entityType: ENTITY_TYPES.UNIT,
    team,
    unitType,
    position: createVector(x, y),
    velocity: createVector(0, 0),
    render: {
      width: 92,
      height: 128,
      facing: team === TEAM_IDS.PLAYER ? 1 : -1,
      bobPhase: Math.random() * Math.PI * 2,
    },
    collision: {
      radius: statBlock.radius,
      selectionRadius: statBlock.selectionRadius,
    },
    stats: {
      maxHp: statBlock.hp,
      hp: statBlock.hp,
      damage: statBlock.damage,
      attackSpeed: statBlock.attackSpeed,
      speed: statBlock.speed,
      range: statBlock.range,
      populationCost: statBlock.popCost,
      goldCost: statBlock.cost,
    },
    command: {
      type: "move",
      target: null,
      targetEntityId: null,
      queued: [],
    },
    ai: {
      mode: DECISION_MODES.DECISION_TREE,
      decisionTreeId: resolveDecisionTreeId(unitType),
      targetEntityId: null,
      targetTag: null,
      lastDecisionAt: 0,
    },
    formation: {
      role: resolveFormationRole(unitType),
      slotIndex: 0,
      offset: createVector(0, 0),
      preferredDistance:
        unitType === UNIT_TYPES.ARCHIDON ? ARCHER_STANDOFF_DISTANCE : statBlock.range,
    },
    mining: {
      carriedGold: 0,
      preferredResourceType: RESOURCE_TYPES.GOLD_VEIN,
    },
    combat: {
      cooldown: 0,
      attackSpeedMultiplier: 1,
    },
    possession: {
      active: false,
      bonusAttackSpeedMultiplier: USER_CONTROLLED_ATTACK_SPEED_MULTIPLIER,
      movementVector: createVector(0, 0),
    },
    desiredPosition: createVector(x, y),
    formationRole: resolveFormationRole(unitType),
    intent: "idle",
    targetId: null,
    attackTargetId: null,
    moveTarget: null,
    aiState: "idle",
    alive: true,
  };
}

export function createStatueEntity({
  id,
  team = TEAM_IDS.PLAYER,
  x = 0,
  y = WORLD_DIMENSIONS.mineLaneY,
} = {}) {
  return {
    id: id ?? `${team}-statue`,
    entityType: ENTITY_TYPES.STRUCTURE,
    structureType: STRUCTURE_TYPES.STATUE,
    team,
    position: createVector(x, y),
    render: {
      width: 164,
      height: 220,
      facing: team === TEAM_IDS.PLAYER ? 1 : -1,
    },
    collision: {
      radius: 74,
      selectionRadius: 92,
    },
    stats: {
      maxHp: 1200,
      hp: 1200,
    },
    alive: true,
  };
}

export function createGoldVeinEntity({
  id = createEntityId("gold-vein"),
  x = 0,
  y = WORLD_DIMENSIONS.mineLaneY + 34,
  amount = 900,
} = {}) {
  return {
    id,
    entityType: ENTITY_TYPES.RESOURCE,
    resourceType: RESOURCE_TYPES.GOLD_VEIN,
    team: TEAM_IDS.NEUTRAL,
    position: createVector(x, y),
    render: {
      width: 104,
      height: 104,
      facing: 1,
    },
    collision: {
      radius: 44,
      selectionRadius: 44,
    },
    resource: {
      amount,
      maxAmount: amount,
    },
    alive: true,
  };
}

export function createSkirmishSeed() {
  return [
    createStatueEntity({
      id: "player-statue",
      team: TEAM_IDS.PLAYER,
      x: 180,
      y: WORLD_DIMENSIONS.mineLaneY - 14,
    }),
    createStatueEntity({
      id: "enemy-statue",
      team: TEAM_IDS.ENEMY,
      x: WORLD_DIMENSIONS.width - 180,
      y: WORLD_DIMENSIONS.mineLaneY - 14,
    }),
    createGoldVeinEntity({ id: "gold-vein-alpha", x: 590 }),
    createGoldVeinEntity({ id: "gold-vein-beta", x: 825 }),
    createGoldVeinEntity({ id: "gold-vein-gamma", x: 1070 }),
    createUnitEntity({
      id: "player-miner-alpha",
      team: TEAM_IDS.PLAYER,
      unitType: UNIT_TYPES.MINER,
      x: 320,
    }),
    createUnitEntity({
      id: "player-swordwrath-alpha",
      team: TEAM_IDS.PLAYER,
      unitType: UNIT_TYPES.SWORDWRATH,
      x: 390,
    }),
    createUnitEntity({
      id: "player-archidon-alpha",
      team: TEAM_IDS.PLAYER,
      unitType: UNIT_TYPES.ARCHIDON,
      x: 450,
    }),
    createUnitEntity({
      id: "enemy-swordwrath-alpha",
      team: TEAM_IDS.ENEMY,
      unitType: UNIT_TYPES.SWORDWRATH,
      x: 1450,
    }),
    createUnitEntity({
      id: "enemy-archidon-alpha",
      team: TEAM_IDS.ENEMY,
      unitType: UNIT_TYPES.ARCHIDON,
      x: 1520,
    }),
  ];
}
