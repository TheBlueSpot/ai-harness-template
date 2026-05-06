import { GRID_HEIGHT, GRID_WIDTH, UNIT_TYPES } from "./data.js";

const TERRAIN_COST = {
  plain: 1,
  road: 1,
  city: 1,
  base: 1,
  hq: 1,
  forest: 2,
};

const DEFENSE_BONUS = {
  plain: 0,
  road: 0,
  forest: 1,
  city: 2,
  base: 2,
  hq: 3,
};

function key(x, y) {
  return `${x},${y}`;
}

export function inBounds(x, y) {
  return x >= 0 && x < GRID_WIDTH && y >= 0 && y < GRID_HEIGHT;
}

export function manhattan(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function terrainCost(map, x, y) {
  const terrain = map[y]?.[x] ?? "plain";
  return TERRAIN_COST[terrain] ?? 1;
}

export function getUnitAt(units, x, y) {
  return units.find((unit) => unit.hp > 0 && unit.x === x && unit.y === y) ?? null;
}

export function getMoveTiles(map, unit, units) {
  const frontier = [{ x: unit.x, y: unit.y, cost: 0 }];
  const bestCost = new Map([[key(unit.x, unit.y), 0]]);
  const results = [];
  const blockers = new Set(
    units
      .filter((candidate) => candidate.hp > 0 && candidate.id !== unit.id)
      .map((candidate) => key(candidate.x, candidate.y)),
  );

  while (frontier.length > 0) {
    const current = frontier.shift();
    const currentKey = key(current.x, current.y);
    const knownCost = bestCost.get(currentKey);
    if (knownCost !== current.cost) continue;

    results.push({ x: current.x, y: current.y, cost: current.cost });

    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nextX = current.x + dx;
      const nextY = current.y + dy;
      if (!inBounds(nextX, nextY)) continue;

      const nextKey = key(nextX, nextY);
      if (blockers.has(nextKey)) continue;

      const nextCost = current.cost + terrainCost(map, nextX, nextY);
      if (nextCost > UNIT_TYPES[unit.type].move) continue;

      const best = bestCost.get(nextKey);
      if (best !== undefined && best <= nextCost) continue;

      bestCost.set(nextKey, nextCost);
      frontier.push({ x: nextX, y: nextY, cost: nextCost });
    }
  }

  return results;
}

export function getAttackTiles(unit, origin = unit) {
  const spec = UNIT_TYPES[unit.type];
  const tiles = [];

  for (let y = 0; y < GRID_HEIGHT; y += 1) {
    for (let x = 0; x < GRID_WIDTH; x += 1) {
      const distance = Math.abs(origin.x - x) + Math.abs(origin.y - y);
      if (distance >= spec.minRange && distance <= spec.maxRange) {
        tiles.push({ x, y, distance });
      }
    }
  }

  return tiles;
}

export function getAttackTargets(unit, units, origin = unit) {
  return getAttackTiles(unit, origin)
    .map((tile) => getUnitAt(units, tile.x, tile.y))
    .filter((target) => target && target.side !== unit.side);
}

export function resolveCombat(attacker, defender, map) {
  const attackerSpec = UNIT_TYPES[attacker.type];
  const defenderSpec = UNIT_TYPES[defender.type];
  const terrain = map[defender.y]?.[defender.x] ?? "plain";
  const defense = DEFENSE_BONUS[terrain] ?? 0;
  const scaledAttack = attackerSpec.attack * (attacker.hp / attackerSpec.maxHp);
  const damage = Math.max(1, Math.round(scaledAttack - defense));
  const defenderHp = Math.max(0, defender.hp - damage);

  let counterDamage = 0;
  let attackerHp = attacker.hp;
  if (defenderHp > 0) {
    const distance = manhattan(attacker, defender);
    if (defender.ammo > 0 && distance >= defenderSpec.minRange && distance <= defenderSpec.maxRange) {
      const counterScaledAttack = defenderSpec.attack * (defenderHp / defenderSpec.maxHp);
      counterDamage = Math.max(1, Math.round(counterScaledAttack - (DEFENSE_BONUS[map[attacker.y]?.[attacker.x] ?? "plain"] ?? 0)));
      attackerHp = Math.max(0, attacker.hp - counterDamage);
    }
  }

  return {
    attackerHp,
    defenderHp,
    damage,
    counterDamage,
    ammoCost: 1,
    counterAmmoCost: counterDamage > 0 ? 1 : 0,
  };
}

export function updateCaptureProgress(unit, structure) {
  const progress = (unit.capture ?? 0) + Math.max(1, Math.ceil(unit.hp / 2));
  return {
    capture: progress,
    captured: progress >= 20,
    structureId: structure.id,
  };
}

export function incomeForTurn(structures) {
  return structures.reduce((total, structure) => {
    if (!structure.owner) return total;
    if (structure.type === "city" || structure.type === "base" || structure.type === "hq") {
      return total + 1000;
    }
    return total;
  }, 0);
}

function chooseBestMove(unit, moveTiles, goal) {
  const sorted = moveTiles
    .filter((tile) => !(tile.x === unit.x && tile.y === unit.y))
    .slice()
    .sort((a, b) => {
      const distanceA = Math.abs(goal.x - a.x) + Math.abs(goal.y - a.y);
      const distanceB = Math.abs(goal.x - b.x) + Math.abs(goal.y - b.y);
      if (distanceA !== distanceB) return distanceA - distanceB;
      if (a.cost !== b.cost) return a.cost - b.cost;
      if (a.y !== b.y) return a.y - b.y;
      return a.x - b.x;
    });
  return sorted[0] ?? { x: unit.x, y: unit.y };
}

export function chooseEnemyActions({ units, structures, map }) {
  const playerUnits = units.filter((unit) => unit.side === "player" && unit.hp > 0);
  const enemies = units
    .filter((unit) => unit.side === "enemy" && unit.hp > 0)
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id));
  const enemyHQTarget = structures.find((structure) => structure.id === "p-hq") ?? { x: 0, y: 0 };
  const actions = [];
  const reserved = new Set(enemies.map((unit) => key(unit.x, unit.y)));

  for (const unit of enemies) {
    reserved.delete(key(unit.x, unit.y));
    const movableUnits = units.filter((candidate) => candidate.id !== unit.id);
    const moveTiles = getMoveTiles(map, unit, movableUnits).filter((tile) => !reserved.has(key(tile.x, tile.y)));

    const capturable = structures
      .filter((structure) => structure.owner !== "enemy")
      .sort((a, b) => manhattan(unit, a) - manhattan(unit, b))[0];

    if (unit.type === "infantry" && capturable) {
      const captureMove = moveTiles.find((tile) => tile.x === capturable.x && tile.y === capturable.y);
      if (captureMove) {
        actions.push({ unitId: unit.id, type: "move-capture", x: captureMove.x, y: captureMove.y });
        reserved.add(key(captureMove.x, captureMove.y));
        continue;
      }
    }

    const attackPlans = [];
    for (const tile of moveTiles) {
      const targets = getAttackTargets(unit, playerUnits, tile);
      for (const target of targets) {
        attackPlans.push({
          unitId: unit.id,
          type: tile.x === unit.x && tile.y === unit.y ? "attack" : "move-attack",
          x: tile.x,
          y: tile.y,
          targetId: target.id,
          score: target.hp + manhattan(target, enemyHQTarget),
        });
      }
    }
    attackPlans.sort((a, b) => a.score - b.score || a.y - b.y || a.x - b.x);
    if (attackPlans[0]) {
      const action = attackPlans[0];
      actions.push(action);
      reserved.add(key(action.x, action.y));
      continue;
    }

    const goal = capturable ?? playerUnits.slice().sort((a, b) => manhattan(unit, a) - manhattan(unit, b))[0] ?? enemyHQTarget;
    const move = chooseBestMove(unit, moveTiles, goal);
    actions.push({ unitId: unit.id, type: "move", x: move.x, y: move.y });
    reserved.add(key(move.x, move.y));
  }

  return actions;
}
