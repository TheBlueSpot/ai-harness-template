import { COMMAND_TYPES, DECISION_MODES, TEAM_IDS, USER_CONTROLLED_ATTACK_SPEED_MULTIPLIER } from "../game/config.js";
import { getEntityById, selectEntityIds } from "../game/GameState.js";

const POSSESSION_INPUT_KEYS = new Set(["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"]);

export class CommandDirector {
  constructor() {
    this.state = {
      selection: {
        active: false,
        start: null,
        current: null,
      },
    };
  }

  beginSelection(screenPoint) {
    this.state.selection.active = true;
    this.state.selection.start = normalizePoint(screenPoint);
    this.state.selection.current = normalizePoint(screenPoint);
  }

  updateSelection(screenPoint) {
    if (!this.state.selection.active) {
      return;
    }

    this.state.selection.current = normalizePoint(screenPoint);
  }

  finalizeSelection(worldState, projection) {
    if (!this.state.selection.active || !this.state.selection.start || !this.state.selection.current) {
      return [];
    }

    const start = this.state.selection.start;
    const current = this.state.selection.current;
    const left = Math.min(start.x, current.x);
    const right = Math.max(start.x, current.x);
    const top = Math.min(start.y, current.y);
    const bottom = Math.max(start.y, current.y);

    const selectedIds = [];
    for (const unit of listUnits(worldState)) {
      if (unit.team !== TEAM_IDS.PLAYER) {
        continue;
      }

      const screenPoint = projectEntityToScreen(unit, projection);
      const radius = unit.collision?.selectionRadius ?? 0;
      if (
        screenPoint.x >= left - radius &&
        screenPoint.x <= right + radius &&
        screenPoint.y >= top - radius &&
        screenPoint.y <= bottom + radius
      ) {
        selectedIds.push(unit.id);
      }
    }

    if (worldState.selection?.possessionTargetId && !selectedIds.includes(worldState.selection.possessionTargetId)) {
      this.releasePossession(worldState);
    }

    selectEntityIds(worldState, selectedIds);
    worldState.selection.box = null;

    this.state.selection.active = false;
    this.state.selection.start = null;
    this.state.selection.current = null;

    return selectedIds;
  }

  clearSelection(worldState) {
    selectEntityIds(worldState, []);
    worldState.selection.box = null;
    this.releasePossession(worldState);
  }

  issueMove(worldState, worldPoint) {
    return queueCommand(worldState, {
      type: COMMAND_TYPES.MOVE,
      target: normalizePoint(worldPoint),
    });
  }

  issueAttackMove(worldState, worldPoint) {
    return queueCommand(worldState, {
      type: COMMAND_TYPES.ATTACK_MOVE,
      target: normalizePoint(worldPoint),
    });
  }

  issueHarvest(worldState, targetNodeId) {
    return queueCommand(worldState, {
      type: COMMAND_TYPES.HARVEST,
      targetEntityId: targetNodeId,
    });
  }

  possessUnit(worldState, unitId) {
    const unit = getEntityById(worldState, unitId);
    if (!unit || unit.entityType !== "unit" || unit.team !== TEAM_IDS.PLAYER) {
      return null;
    }

    if (worldState.selection.possessionTargetId && worldState.selection.possessionTargetId !== unitId) {
      const previous = getEntityById(worldState, worldState.selection.possessionTargetId);
      if (previous) {
        releaseUnitControl(previous);
      }
    }

    worldState.selection.possessionTargetId = unitId;
    unit.possession.active = true;
    unit.possession.movementVector.x = 0;
    unit.possession.movementVector.y = 0;
    unit.ai.mode = DECISION_MODES.USER_CONTROLLED;
    unit.ai.targetEntityId = null;
    unit.ai.targetTag = null;
    unit.command.type = COMMAND_TYPES.MOVE;
    unit.command.target = null;
    unit.command.targetEntityId = null;
    unit.command.queued = [];
    unit.combat.attackSpeedMultiplier = USER_CONTROLLED_ATTACK_SPEED_MULTIPLIER;
    unit.stats.userControlBonus = USER_CONTROLLED_ATTACK_SPEED_MULTIPLIER;
    unit.isUserControlled = true;

    return unit;
  }

  releasePossession(worldState) {
    const unit = getEntityById(worldState, worldState.selection.possessionTargetId);
    if (unit) {
      releaseUnitControl(unit);
    }

    worldState.selection.possessionTargetId = null;
    return unit;
  }

  applyKeyboardControl(worldState, inputState, dt) {
    const unit = getEntityById(worldState, worldState.selection.possessionTargetId);
    if (!unit || unit.entityType !== "unit") {
      return null;
    }

    const keys = inputState?.keyboard ?? {};
    const moveX = (pressed(keys, "arrowright") || pressed(keys, "d") ? 1 : 0) - (pressed(keys, "arrowleft") || pressed(keys, "a") ? 1 : 0);
    const moveY = (pressed(keys, "arrowdown") || pressed(keys, "s") ? 1 : 0) - (pressed(keys, "arrowup") || pressed(keys, "w") ? 1 : 0);
    const attack = Boolean(keys.space || keys[" "]);

    unit.possession.active = true;
    unit.ai.mode = DECISION_MODES.USER_CONTROLLED;
    unit.isUserControlled = true;
    unit.combat.attackSpeedMultiplier = USER_CONTROLLED_ATTACK_SPEED_MULTIPLIER;
    unit.stats.userControlBonus = USER_CONTROLLED_ATTACK_SPEED_MULTIPLIER;
    unit.possession.movementVector.x = moveX;
    unit.possession.movementVector.y = moveY;
    unit.intent = "manual";
    unit.moveTarget = moveX || moveY
      ? {
          x: unit.position.x + moveX * 120,
          y: unit.position.y + moveY * 120,
        }
      : null;
    unit.attackTargetId = null;

    if (attack) {
      unit.command.type = COMMAND_TYPES.ATTACK_MOVE;
      unit.command.target = {
        x: unit.position.x + moveX * 48,
        y: unit.position.y + moveY * 48,
      };
    }

    if (moveX === 0 && moveY === 0) {
      return unit;
    }

    const magnitude = Math.hypot(moveX, moveY) || 1;
    const speed = unit.stats.speed ?? 0;
    unit.position.x += (moveX / magnitude) * speed * dt;
    unit.position.y += (moveY / magnitude) * speed * 0.75 * dt;

    return unit;
  }
}

function queueCommand(worldState, command) {
  worldState.commandState ??= {};
  if (!Array.isArray(worldState.commandState.orderQueue)) {
    worldState.commandState.orderQueue = [];
  }

  const queuedCommand = {
    ...command,
    team: TEAM_IDS.PLAYER,
    unitIds: [...(worldState.selection?.selectedIds ?? [])],
    issuedAt: worldState.clock?.elapsed ?? 0,
  };

  worldState.commandState.orderQueue.push(queuedCommand);
  worldState.commandState.lastIssuedAt = queuedCommand.issuedAt;
  return queuedCommand;
}

function releaseUnitControl(unit) {
  unit.possession.active = false;
  unit.possession.movementVector.x = 0;
  unit.possession.movementVector.y = 0;
  unit.ai.mode = DECISION_MODES.DECISION_TREE;
  unit.combat.attackSpeedMultiplier = 1;
  unit.stats.userControlBonus = 1;
  unit.isUserControlled = false;
  unit.intent = "idle";
  unit.moveTarget = null;
  unit.attackTargetId = null;
  unit.command.type = COMMAND_TYPES.MOVE;
  unit.command.target = unit.desiredPosition ?? null;
  unit.command.targetEntityId = null;
}

function normalizePoint(point) {
  return {
    x: Number(point?.x ?? point?.screenX ?? 0),
    y: Number(point?.y ?? point?.screenY ?? 0),
  };
}

function projectEntityToScreen(entity, projection) {
  if (typeof projection === "function") {
    return normalizePoint(projection(entity));
  }

  if (projection && typeof projection.worldToScreen === "function") {
    return normalizePoint(projection.worldToScreen(entity.position));
  }

  const camera = projection?.camera ?? { x: 0, y: 0, zoom: 1 };
  return {
    x: (entity.position.x - camera.x) * camera.zoom,
    y: (entity.position.y - camera.y) * camera.zoom,
  };
}

function listUnits(worldState) {
  if (!worldState?.entities || !worldState.entityIds) {
    return [];
  }

  return worldState.entityIds
    .map((id) => worldState.entities.get(id))
    .filter((entity) => entity && entity.entityType === "unit");
}

function pressed(keys, key) {
  return Boolean(keys[key]) || Boolean(keys[key.toUpperCase()]) || (POSSESSION_INPUT_KEYS.has(key) && Boolean(keys[key.toLowerCase()]));
}

export function createCommandDirector() {
  return new CommandDirector();
}

export function updateCommandDirector() {
  return null;
}
