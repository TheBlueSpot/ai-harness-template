const DEFAULT_ATTACK_FRAME = 0.28;
const DEFAULT_ATTACK_WINDUP = 0.16;
const DEFAULT_ATTACK_RECOVERY = 0.22;
const DEFAULT_STACK_GAP = 16;
const DEFAULT_CASTLE_GAP = 12;
const DEFAULT_UNIT_SPEED = 42;
const DEFAULT_UNIT_RANGE = 24;
const FRAME_EPSILON = 1e-6;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function laneDirection(side) {
  return side === "player" ? 1 : -1;
}

function laneUnitsForSide(laneUnits, side) {
  return laneUnits.filter((unit) => unit.side === side && unit.alive !== false && (unit.hp ?? 1) > 0);
}

function frontUnit(laneUnits, side) {
  const units = laneUnitsForSide(laneUnits, side);
  if (units.length === 0) {
    return null;
  }
  return units.reduce((best, unit) => {
    if (!best) return unit;
    return side === "player"
      ? unit.progress > best.progress ? unit : best
      : unit.progress < best.progress ? unit : best;
  }, null);
}

function hasCollisionOverlap(unit, other, range) {
  return Math.abs((unit.progress ?? unit.x ?? 0) - (other.progress ?? other.x ?? 0)) <= range;
}

export function acquireCollisionEntity(unit, laneUnits, enemyCastle) {
  const enemies = laneUnits.filter((candidate) => candidate.side !== unit.side && candidate.alive !== false && (candidate.hp ?? 1) > 0);
  const collisionRange = Math.max(unit.range ?? DEFAULT_UNIT_RANGE, DEFAULT_UNIT_RANGE);
  let best = null;

  for (const enemy of enemies) {
    if (!hasCollisionOverlap(unit, enemy, collisionRange)) {
      continue;
    }
    if (!best) {
      best = enemy;
      continue;
    }
    const unitPos = unit.progress ?? unit.x ?? 0;
    const enemyPos = enemy.progress ?? enemy.x ?? 0;
    const bestPos = best.progress ?? best.x ?? 0;
    if (unit.side === "player") {
      if (enemyPos < bestPos || Math.abs(enemyPos - unitPos) < Math.abs(bestPos - unitPos)) {
        best = enemy;
      }
    } else if (enemyPos > bestPos || Math.abs(enemyPos - unitPos) < Math.abs(bestPos - unitPos)) {
      best = enemy;
    }
  }

  if (best) {
    return best;
  }

  const castlePos = enemyCastle?.progress ?? (unit.side === "player" ? enemyCastle?.laneLength ?? 0 : 0);
  const castleDistance = Math.abs((unit.progress ?? unit.x ?? 0) - castlePos);
  const castleRange = Math.max(unit.range ?? DEFAULT_UNIT_RANGE, DEFAULT_CASTLE_GAP);
  if (castleDistance <= castleRange) {
    return enemyCastle
      ? {
          kind: "castle",
          id: enemyCastle.id ?? `${unit.side === "player" ? "enemy" : "player"}-castle`,
          progress: castlePos,
          ref: enemyCastle,
        }
      : null;
  }
  return null;
}

export function resolveUnitStacking(laneUnits) {
  const bySide = new Map();
  for (const unit of laneUnits) {
    if (unit.alive === false || (unit.hp ?? 1) <= 0) {
      continue;
    }
    const sideUnits = bySide.get(unit.side) ?? [];
    sideUnits.push(unit);
    bySide.set(unit.side, sideUnits);
  }

  for (const sideUnits of bySide.values()) {
    const isPlayerSide = sideUnits[0]?.side === "player";
    sideUnits.sort((a, b) =>
      isPlayerSide ? (b.progress ?? 0) - (a.progress ?? 0) : (a.progress ?? 0) - (b.progress ?? 0),
    );
    for (let i = 0; i < sideUnits.length; i += 1) {
      const unit = sideUnits[i];
      const forwardNeighbor = sideUnits[i - 1];
      if (forwardNeighbor) {
        if (unit.side === "player") {
          unit.progress = Math.min(unit.progress ?? 0, (forwardNeighbor.progress ?? 0) - DEFAULT_STACK_GAP);
        } else {
          unit.progress = Math.max(unit.progress ?? 0, (forwardNeighbor.progress ?? 0) + DEFAULT_STACK_GAP);
        }
      }
      unit.x = unit.progress;
      unit.stackOffset = (i % 3) * 4 - 4;
    }
  }

  return laneUnits;
}

function startAttackCycle(unit, target, now) {
  unit.targetId = target?.id ?? null;
  unit.targetRef = target ?? null;
  unit.state = "attack";
  unit.attackStartedAt = now;
  unit.attackTimer = DEFAULT_ATTACK_WINDUP + DEFAULT_ATTACK_RECOVERY;
  unit.attackFrameFired = false;
}

function canStrike(unit, target) {
  if (!target) return false;
  const range = Math.max(unit.range ?? DEFAULT_UNIT_RANGE, DEFAULT_UNIT_RANGE);
  return hasCollisionOverlap(unit, target, range);
}

function applyDamage(target, damage) {
  if (!target) return;
  target.hp = Math.max(0, (target.hp ?? 0) - damage);
  if (target.hp <= 0) {
    target.alive = false;
  }
}

export function updateLaneUnits(laneState, dt, battleState) {
  const laneUnits = [...(laneState.playerUnits ?? []), ...(laneState.enemyUnits ?? [])];
  resolveUnitStacking(laneUnits);

  const laneLength = battleState?.laneLength ?? battleState?.baseLaneLength ?? 820;
  const enemyCastle = battleState?.enemyCastle ?? { hp: 0, laneLength };
  const playerCastle = battleState?.playerCastle ?? { hp: 0, laneLength: 0 };

  for (const unit of laneUnits) {
    if (unit.alive === false || (unit.hp ?? 1) <= 0) {
      continue;
    }

    unit.speed = unit.speed ?? DEFAULT_UNIT_SPEED;
    unit.range = unit.range ?? DEFAULT_UNIT_RANGE;
    unit.attackTimer = Math.max(0, (unit.attackTimer ?? 0) - dt);

    const collisionEntity = acquireCollisionEntity(unit, laneUnits, unit.side === "player" ? enemyCastle : playerCastle);
    const atCollision = collisionEntity && collisionEntity.kind !== "castle" ? canStrike(unit, collisionEntity) : !!collisionEntity;

    if (atCollision) {
      if (unit.state !== "attack") {
        startAttackCycle(unit, collisionEntity, battleState?.time ?? 0);
      } else {
        unit.targetRef = collisionEntity;
      }

      const attackFrame = unit.attackFrame ?? DEFAULT_ATTACK_FRAME;
      const elapsed = (battleState?.time ?? 0) - (unit.attackStartedAt ?? 0);
      if (!unit.attackFrameFired && elapsed + FRAME_EPSILON >= attackFrame) {
        const damage = unit.damage ?? 0;
        if (collisionEntity.kind === "castle") {
          if (unit.side === "player") {
            collisionEntity.ref.hp = Math.max(0, (collisionEntity.ref.hp ?? 0) - damage);
          } else {
            collisionEntity.ref.hp = Math.max(0, (collisionEntity.ref.hp ?? 0) - damage);
          }
        } else {
          applyDamage(collisionEntity, damage);
        }
        unit.attackFrameFired = true;
      }

      if (unit.attackTimer <= 0) {
        unit.state = "move";
        unit.attackFrameFired = false;
      }
      continue;
    }

    unit.state = "move";
    const direction = laneDirection(unit.side);
    const rallyBonus = battleState?.rallyUntil && battleState.time < battleState.rallyUntil && unit.side === "player" ? 1.25 : 1;
    const nextProgress = (unit.progress ?? 0) + direction * (unit.speed ?? DEFAULT_UNIT_SPEED) * dt * rallyBonus;
    const bounded = clamp(nextProgress, 0, laneLength);
    unit.progress = bounded;
    unit.x = bounded;
  }

  laneState.playerUnits = laneUnitsForSide(laneUnits, "player");
  laneState.enemyUnits = laneUnitsForSide(laneUnits, "enemy");
  return laneState;
}
