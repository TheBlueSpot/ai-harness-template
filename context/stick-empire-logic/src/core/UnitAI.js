import {
  DECISION_MODES,
  ENTITY_TYPES,
  RESOURCE_TYPES,
  STRUCTURE_TYPES,
  TEAM_IDS,
  UNIT_TYPES,
  WORLD_DIMENSIONS,
} from "../game/config.js";

function getEntityPosition(entity) {
  return entity?.position ?? { x: 0, y: 0 };
}

function distanceBetween(a, b) {
  const pa = getEntityPosition(a);
  const pb = getEntityPosition(b);
  return Math.hypot(pa.x - pb.x, pa.y - pb.y);
}

function isEnemy(unit, entity) {
  return Boolean(entity) && entity.team && entity.team !== unit.team && entity.team !== TEAM_IDS.NEUTRAL;
}

function getFrontLineX(state, team) {
  const hint = state?.formations?.anchors?.[team];
  if (hint && Number.isFinite(hint.x)) {
    return hint.x;
  }
  return WORLD_DIMENSIONS.frontLineX;
}

function getEnemyFrontLineX(state, unit) {
  return getFrontLineX(state, unit.team === TEAM_IDS.PLAYER ? TEAM_IDS.ENEMY : TEAM_IDS.PLAYER);
}

function getHomeFrontLineX(state, unit) {
  return getFrontLineX(state, unit.team);
}

function isPossessed(unit) {
  return Boolean(unit?.possession?.active) || unit?.ai?.mode === DECISION_MODES.USER_CONTROLLED || Boolean(unit?.isUserControlled);
}

function isStatue(entity) {
  return entity?.entityType === ENTITY_TYPES.STRUCTURE && entity?.structureType === STRUCTURE_TYPES.STATUE;
}

function isReachable(unit, target) {
  if (!unit || !target) {
    return false;
  }
  if (target.alive === false) {
    return false;
  }
  return true;
}

function setMoveIntent(unit, target) {
  unit.intent = "move";
  unit.moveTarget = target
    ? {
        x: target.position?.x ?? target.x ?? unit.position.x,
        y: target.position?.y ?? target.y ?? unit.position.y,
      }
    : null;
}

function setAttackIntent(unit, target) {
  unit.intent = "attack";
  unit.attackTargetId = target?.id ?? null;
  unit.targetId = target?.id ?? null;
  unit.moveTarget = target
    ? { x: target.position.x, y: target.position.y }
    : null;
}

function setIdleIntent(unit) {
  unit.intent = "idle";
  unit.targetId = null;
  unit.attackTargetId = null;
  unit.moveTarget = null;
}

export function selectNearestEnemy(unit, enemies) {
  let best = null;
  let bestDistance = Infinity;

  for (const enemy of enemies ?? []) {
    if (!isEnemy(unit, enemy) || enemy.alive === false) {
      continue;
    }

    const distance = distanceBetween(unit, enemy);
    if (distance < bestDistance) {
      best = enemy;
      bestDistance = distance;
    }
  }

  return best;
}

export function selectPriorityGoldVein(unit, resourceNodes) {
  let best = null;
  let bestDistance = Infinity;

  for (const node of resourceNodes ?? []) {
    if (node?.resourceType !== RESOURCE_TYPES.GOLD_VEIN || node.alive === false) {
      continue;
    }

    const distance = distanceBetween(unit, node);
    if (distance < bestDistance) {
      best = node;
      bestDistance = distance;
    }
  }

  return best;
}

export function isFrontlineClear(unit, state) {
  const enemyFrontLineX = getEnemyFrontLineX(state, unit);
  const allUnits = state?.entities ? [...state.entities.values()] : [];

  for (const entity of allUnits) {
    if (!entity || entity.entityType !== ENTITY_TYPES.UNIT || !isEnemy(unit, entity) || entity.alive === false) {
      continue;
    }

    if (unit.team === TEAM_IDS.PLAYER) {
      if (entity.position.x <= enemyFrontLineX) {
        return false;
      }
    } else if (entity.position.x >= enemyFrontLineX) {
      return false;
    }
  }

  return true;
}

export function buildDecisionTree(unitType) {
  if (unitType === UNIT_TYPES.MINER) {
    return {
      id: "MinerDecisionTree",
      evaluate: evaluateMinerDecision,
    };
  }
  if (unitType === UNIT_TYPES.ARCHIDON) {
    return {
      id: "ArchidonDecisionTree",
      evaluate: evaluateRangedDecision,
    };
  }
  return {
    id: `${unitType?.replaceAll(" ", "") ?? "Unit"}DecisionTree`,
    evaluate: evaluateFrontlineDecision,
  };
}

export function evaluateUnitDecision(unit, state, context = {}) {
  if (!unit || unit.alive === false) {
    return null;
  }

  if (isPossessed(unit)) {
    return {
      intent: unit.intent ?? "manual",
      targetId: unit.targetId ?? null,
      attackTargetId: unit.attackTargetId ?? null,
      moveTarget: unit.moveTarget ?? null,
      aiState: unit.aiState ?? "manual",
    };
  }

  const tree = buildDecisionTree(unit.unitType);
  const decision = tree.evaluate(unit, state, context) ?? {};

  unit.intent = decision.intent ?? unit.intent ?? "idle";
  unit.targetId = decision.targetId ?? null;
  unit.attackTargetId = decision.attackTargetId ?? null;
  unit.moveTarget = decision.moveTarget ?? null;
  unit.aiState = decision.aiState ?? "active";
  unit.ai = unit.ai ?? {};
  unit.ai.mode = DECISION_MODES.DECISION_TREE;
  unit.ai.lastDecisionAt = context.now ?? unit.ai.lastDecisionAt ?? 0;

  return decision;
}

function evaluateMinerDecision(unit, state, context) {
  const resourceNodes =
    context?.resourceNodes ??
    (state?.references?.resources?.map((id) => state.entities.get(id)).filter(Boolean) ?? []);
  const vein = selectPriorityGoldVein(unit, resourceNodes);

  if (vein && isReachable(unit, vein)) {
    unit.aiState = "mining";
    unit.mining ??= {};
    unit.mining.targetResourceId = vein.id;
    setMoveIntent(unit, vein);
    unit.targetId = vein.id;
    unit.attackTargetId = null;
    return {
      intent: unit.intent,
      targetId: unit.targetId,
      moveTarget: unit.moveTarget,
      aiState: unit.aiState,
    };
  }

  unit.aiState = "idle";
  unit.mining.targetResourceId = null;
  setIdleIntent(unit);
  return {
    intent: unit.intent,
    targetId: null,
    moveTarget: null,
    aiState: unit.aiState,
  };
}

function evaluateFrontlineDecision(unit, state, context) {
  const enemies = context.enemies ?? collectHostiles(unit, state);
  const nearestEnemy = selectNearestEnemy(unit, enemies);

  if (nearestEnemy) {
    const treeClear = isFrontlineClear(unit, state);
    const shouldTargetStatue = treeClear && isStatue(nearestEnemy);

    if (!treeClear && isStatue(nearestEnemy)) {
      const frontlineEnemy = selectNearestEnemy(unit, enemies.filter((entity) => !isStatue(entity)));
      if (frontlineEnemy) {
        setAttackIntent(unit, frontlineEnemy);
        unit.aiState = "engage-frontline";
        return decisionFromTarget(unit);
      }
    }

    if (shouldTargetStatue || !isStatue(nearestEnemy)) {
      setAttackIntent(unit, nearestEnemy);
      unit.aiState = isStatue(nearestEnemy) ? "siege" : "engage";
      return decisionFromTarget(unit);
    }
  }

  setMoveIntent(unit, {
    position: {
      x: getEnemyFrontLineX(state, unit),
      y: unit.position.y,
    },
    id: null,
  });
  unit.aiState = "advance";
  return decisionFromTarget(unit);
}

function evaluateRangedDecision(unit, state, context) {
  const enemies = context.enemies ?? collectHostiles(unit, state);
  const nearestEnemy = selectNearestEnemy(unit, enemies);
  if (nearestEnemy) {
    const frontlineClear = isFrontlineClear(unit, state);
    if (!frontlineClear && isStatue(nearestEnemy)) {
      const frontlineEnemy = selectNearestEnemy(unit, enemies.filter((entity) => !isStatue(entity)));
      if (frontlineEnemy) {
        setAttackIntent(unit, frontlineEnemy);
        unit.aiState = "cover-frontline";
        return decisionFromTarget(unit);
      }
    }

    if (isStatue(nearestEnemy) && !frontlineClear) {
      unit.aiState = "hold-range";
      return decisionFromTarget(unit);
    }

    setAttackIntent(unit, nearestEnemy);
    unit.aiState = "ranged-engage";
    return decisionFromTarget(unit);
  }

  setMoveIntent(unit, {
    position: {
      x: getEnemyFrontLineX(state, unit) - (unit.team === TEAM_IDS.PLAYER ? 140 : -140),
      y: unit.position.y,
    },
    id: null,
  });
  unit.aiState = "ranged-advance";
  return decisionFromTarget(unit);
}

function collectHostiles(unit, state) {
  return state?.entities
    ? [...state.entities.values()].filter((entity) => entity && (entity.entityType === ENTITY_TYPES.UNIT || entity.entityType === ENTITY_TYPES.STRUCTURE) && isEnemy(unit, entity))
    : [];
}

function decisionFromTarget(unit) {
  return {
    intent: unit.intent ?? "idle",
    targetId: unit.targetId ?? null,
    attackTargetId: unit.attackTargetId ?? null,
    moveTarget: unit.moveTarget ?? null,
    aiState: unit.aiState ?? "idle",
  };
}

export function tickUnitAI(units, state, dt) {
  const now = state?.clock?.elapsed ?? 0;
  for (const unit of units ?? []) {
    if (!unit || unit.alive === false) {
      continue;
    }

    evaluateUnitDecision(unit, state, {
      now,
      dt,
      enemies: collectHostiles(unit, state),
      resourceNodes: state?.references?.resources?.map((id) => state.entities.get(id)).filter(Boolean) ?? [],
      frontlineX: getEnemyFrontLineX(state, unit),
      homeFrontLineX: getHomeFrontLineX(state, unit),
    });
  }
}

export function createUnitAISystem() {
  return {
    update(state, unit, dt) {
      tickUnitAI([unit], state, dt);
    },
  };
}

export function updateUnitAI(state, unit, dt) {
  tickUnitAI([unit], state, dt);
}
