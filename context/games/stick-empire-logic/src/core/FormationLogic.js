import { ARCHER_STANDOFF_DISTANCE, FORMATION_ROLES, TEAM_IDS, UNIT_TYPES, WORLD_DIMENSIONS } from "../game/config.js";

function normalizeFacing(facing) {
  return facing >= 0 ? 1 : -1;
}

function getSelectionUnits(selection) {
  return Array.isArray(selection) ? selection : selection?.units ?? [];
}

function getSelectionTeam(selection, units) {
  return selection?.team ?? units[0]?.team ?? TEAM_IDS.PLAYER;
}

function makeAnchor(selection, worldState, anchorPoint) {
  if (anchorPoint) {
    return anchorPoint;
  }

  if (selection?.anchorPoint) {
    return selection.anchorPoint;
  }

  return {
    x: selection?.anchorPoint?.x ?? worldState?.frontLineX ?? WORLD_DIMENSIONS.frontLineX,
    y: worldState?.mineLaneY ?? WORLD_DIMENSIONS.mineLaneY,
  };
}

export function computeFrontlineSlots(units, facing, anchorPoint = { x: WORLD_DIMENSIONS.frontLineX, y: WORLD_DIMENSIONS.mineLaneY }) {
  const direction = normalizeFacing(facing);
  const columns = Math.max(1, Math.min(3, Math.ceil(Math.sqrt(Math.max(1, units.length)))));
  const spacingX = 56;
  const spacingY = 42;

  return units.map((unit, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const offsetX = 72 + row * spacingX;
    const centeredColumn = column - (columns - 1) * 0.5;
    const offsetY = centeredColumn * spacingY;

    return {
      unitId: unit.id,
      x: anchorPoint.x + offsetX * direction,
      y: anchorPoint.y + offsetY,
      role: FORMATION_ROLES.FRONTLINE,
      slotIndex: index,
    };
  });
}

export function computeArcherKiteTarget(unit, nearestEnemy, desiredRange = ARCHER_STANDOFF_DISTANCE) {
  if (!unit || !nearestEnemy) {
    return unit?.position ? { x: unit.position.x, y: unit.position.y } : null;
  }

  const dx = unit.position.x - nearestEnemy.position.x;
  const dy = unit.position.y - nearestEnemy.position.y;
  const distance = Math.hypot(dx, dy) || 1;
  if (distance >= desiredRange) {
    return { x: unit.position.x, y: unit.position.y };
  }

  const scale = desiredRange / distance;

  return {
    x: nearestEnemy.position.x + dx * scale,
    y: unit.position.y + dy * 0.25,
  };
}

export function applyFlockingOffsets(units, desiredTargets, dt) {
  const smoothing = Math.max(0, Math.min(1, dt * 8));

  for (const unit of units) {
    const target = desiredTargets.get(unit.id);
    if (!target) {
      continue;
    }

    unit.desiredPosition ??= { x: unit.position.x, y: unit.position.y };
    unit.desiredPosition.x += (target.x - unit.desiredPosition.x) * smoothing;
    unit.desiredPosition.y += (target.y - unit.desiredPosition.y) * smoothing;
    unit.formationRole = target.role ?? unit.formation?.role ?? FORMATION_ROLES.FRONTLINE;
    unit.formation ??= {};
    unit.formation.slotIndex = target.slotIndex ?? unit.formation.slotIndex ?? 0;
    unit.formation.offset = {
      x: unit.desiredPosition.x - unit.position.x,
      y: unit.desiredPosition.y - unit.position.y,
    };
  }

  return units;
}

export function computeFormationTargets(selection, worldState, anchorPoint) {
  const units = getSelectionUnits(selection).filter((unit) => unit && unit.entityType === "unit" && unit.alive !== false);
  if (!units.length) {
    return new Map();
  }

  const team = getSelectionTeam(selection, units);
  const anchor = makeAnchor(selection, worldState, anchorPoint);
  const frontline = units.filter((unit) => unit.unitType !== UNIT_TYPES.MINER && unit.formation?.role !== FORMATION_ROLES.RANGED);
  const miners = units.filter((unit) => unit.unitType === UNIT_TYPES.MINER);
  const archers = units.filter((unit) => unit.unitType === UNIT_TYPES.ARCHIDON);
  const desiredTargets = new Map();
  const allUnits = worldState?.units ?? [];
  const enemies = allUnits.filter((unit) => unit && unit.team !== team && unit.alive !== false);

  const facing = team === TEAM_IDS.PLAYER ? 1 : -1;
  const frontlineAnchor = {
    x: anchor.x + facing * 22,
    y: anchor.y,
  };
  const frontlineSlots = computeFrontlineSlots(frontline, facing, frontlineAnchor);

  for (const slot of frontlineSlots) {
    desiredTargets.set(slot.unitId, {
      x: slot.x,
      y: slot.y,
      role: slot.role,
      slotIndex: slot.slotIndex,
    });
  }

  miners.forEach((unit, index) => {
    const row = Math.floor(index / 2);
    desiredTargets.set(unit.id, {
      x: anchor.x - facing * (142 + row * 18),
      y: anchor.y + (index % 2 === 0 ? 46 : 86),
      role: FORMATION_ROLES.ECON,
      slotIndex: index,
    });
  });

  archers.forEach((unit, index) => {
    let nearestEnemy = null;
    let nearestDistance = Infinity;
    for (const enemy of enemies) {
      if (!enemy) {
        continue;
      }

      const distance = Math.hypot((enemy.position?.x ?? 0) - unit.position.x, (enemy.position?.y ?? 0) - unit.position.y);
      if (distance < nearestDistance) {
        nearestEnemy = enemy;
        nearestDistance = distance;
      }
    }

    const target = computeArcherKiteTarget(unit, nearestEnemy, unit.formation?.preferredDistance ?? ARCHER_STANDOFF_DISTANCE);
    const homeTarget = {
      x: anchor.x - facing * 110,
      y: anchor.y + (index - (archers.length - 1) * 0.5) * 40,
    };
    desiredTargets.set(unit.id, {
      x: nearestEnemy ? homeTarget.x * 0.35 + (target?.x ?? homeTarget.x) * 0.65 : homeTarget.x,
      y: nearestEnemy ? homeTarget.y * 0.45 + (target?.y ?? homeTarget.y) * 0.55 : homeTarget.y,
      role: FORMATION_ROLES.RANGED,
      slotIndex: index,
    });
  });

  applyFlockingOffsets(units, desiredTargets, worldState?.delta ?? 0);
  return desiredTargets;
}

export function createFormationLogic() {
  return {
    computeFormationTargets,
    computeFrontlineSlots,
    computeArcherKiteTarget,
    applyFlockingOffsets,
  };
}

export function updateFormationLogic(state, dt) {
  const units = state.references?.units?.map((id) => state.entities.get(id)).filter(Boolean) ?? [];
  const targets = new Map();

  for (const team of [TEAM_IDS.PLAYER, TEAM_IDS.ENEMY]) {
    const teamUnits = units.filter((unit) => unit.team === team);
    const nextTargets = computeFormationTargets(
      {
        units: teamUnits,
        team,
        anchorPoint: state.formations?.anchors?.[team],
      },
      { ...state.world, units, delta: dt },
      state.formations?.anchors?.[team],
    );
    for (const [unitId, target] of nextTargets) {
      targets.set(unitId, target);
    }
  }

  return targets;
}
