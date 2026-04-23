import { TOWER_TYPES, TOWER_UPGRADES } from "./tower-data.js";
export { TOWER_TYPES, TOWER_UPGRADES };
import { triggerScreenFlash } from "./effects.js";
import { ENEMY_TYPES } from "./enemy-data.js";

const DEFAULT_CELL_SIZE = 64;
const EPSILON = 0.0001;

function keyOf(cell) {
  return `${cell.x},${cell.y}`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function hypot(dx, dy) {
  return Math.hypot(dx, dy);
}

function isLayoutLike(value) {
  return Boolean(value && typeof value === "object" && Number.isFinite(value.cellSize));
}

function getLayoutCellSize(layout) {
  return isLayoutLike(layout) ? layout.cellSize : DEFAULT_CELL_SIZE;
}

function getCenterFromCell(cell, layout) {
  const cellSize = getLayoutCellSize(layout);
  const originX = layout?.originX ?? 0;
  const originY = layout?.originY ?? 0;
  return {
    x: originX + (cell.x + 0.5) * cellSize,
    y: originY + (cell.y + 0.5) * cellSize,
  };
}

function normalizePointLike(x, y, layout) {
  if (typeof x === "object" && x !== null) {
    if ("cell" in x && x.cell && Number.isFinite(x.cell.x) && Number.isFinite(x.cell.y)) {
      return {
        cell: { x: x.cell.x, y: x.cell.y },
        x: x.x,
        y: x.y,
        cellSize: x.cellSize ?? getLayoutCellSize(layout),
      };
    }

    if (Number.isFinite(x.x) && Number.isFinite(x.y)) {
      return {
        cell: { x: x.x, y: x.y },
        ...getCenterFromCell(x, layout),
        cellSize: getLayoutCellSize(layout),
      };
    }
  }

  if (Number.isFinite(x) && Number.isFinite(y)) {
    return {
      x,
      y,
      cell: null,
      cellSize: getLayoutCellSize(layout),
    };
  }

  return {
    x: 0,
    y: 0,
    cell: null,
    cellSize: getLayoutCellSize(layout),
  };
}

function lookupTowerDefinition(type) {
  return TOWER_TYPES[type] ?? TOWER_TYPES.splash;
}

function lookupTowerUpgradeTree(type) {
  return TOWER_UPGRADES[type] ?? null;
}

function getEnemyDefinition(enemy) {
  return enemy?.kind ? ENEMY_TYPES[enemy.kind] ?? null : null;
}

function getEnemyTraits(enemy) {
  return enemy?.traits ?? getEnemyDefinition(enemy)?.traits ?? {};
}

function canTowerDetectEnemy(definition, enemy) {
  if (!enemy) {
    return false;
  }

  if (!getEnemyTraits(enemy).hidden) {
    return true;
  }

  return Boolean(definition?.revealHidden || definition?.scanRadiusCells > 0);
}

function enemyTargetPriority(enemy) {
  const traits = getEnemyTraits(enemy);
  if (traits.shieldbreakerPriority) {
    return 4;
  }

  return Number.isFinite(traits.targetPriority) ? Number(traits.targetPriority) : 0;
}

function applyDamageModifiers(enemy, damage, family) {
  const traits = getEnemyTraits(enemy);
  let next = damage;

  if (Number.isFinite(enemy?.shieldPower) && enemy.shieldPower > 0) {
    next *= Math.max(0.25, 1 - Math.min(0.7, enemy.shieldPower));
  }

  if (family === "splash" && Number.isFinite(traits.splashResistance)) {
    next *= clamp(traits.splashResistance, 0.15, 1);
  }

  if (family === "burn" && Number.isFinite(traits.burnWeak)) {
    next *= Math.max(1, traits.burnWeak);
  }

  return next;
}

function getBaseType(type) {
  if (typeof type !== "string") {
    return "splash";
  }

  return type.split("_")[0] || type;
}

function getTowerFamily(type) {
  return lookupTowerDefinition(type).family ?? getBaseType(type);
}

function getEnemyTraitValue(enemy, family) {
  const traits = enemy?.traits ?? enemy?.profile?.traits ?? null;
  if (traits && typeof traits === "object") {
    if (family === "slow" && traits.slowImmune) {
      return 1;
    }

    if (family === "burn" && Number.isFinite(traits.burnWeak)) {
      return clamp(traits.burnWeak, 0, 2.5);
    }

    if (family === "splash" && Number.isFinite(traits.splashResistance)) {
      return clamp(traits.splashResistance, 0, 2.5);
    }

    if (family === "disrupt" && traits.shieldbreakerPriority) {
      return 1.2;
    }
  }

  const profile = enemy?.profile ?? enemy?.traitsProfile ?? null;
  if (!profile || typeof profile !== "object") {
    return 1;
  }

  const resistances = profile.resistances ?? enemy?.resistances ?? null;
  if (resistances && Number.isFinite(resistances[family])) {
    return clamp(resistances[family], 0, 2.5);
  }

  const weakness = profile.weaknesses ?? enemy?.weaknesses ?? null;
  if (weakness && Number.isFinite(weakness[family])) {
    return clamp(weakness[family], 0, 2.5);
  }

  return 1;
}

function isEffectImmune(enemy, family) {
  const traits = enemy?.traits ?? null;
  if (family === "slow" && traits?.slowImmune) {
    return true;
  }

  if (family === "burn" && traits?.burnImmune) {
    return true;
  }

  const immuneFamilies = enemy?.immuneFamilies ?? enemy?.profile?.immuneFamilies ?? [];
  if (Array.isArray(immuneFamilies) && immuneFamilies.includes(family)) {
    return true;
  }

  if (family === "slow" && enemy?.slowImmune) {
    return true;
  }

  if (family === "burn" && enemy?.burnImmune) {
    return true;
  }

  return false;
}

function getShieldValue(enemy) {
  const shield = Number.isFinite(enemy?.shield) ? enemy.shield : 0;
  const auraShield = Number.isFinite(enemy?.auraShield) ? enemy.auraShield : 0;
  return Math.max(0, shield + auraShield);
}

function setShieldValue(enemy, nextShield) {
  if (!Number.isFinite(enemy?.shield)) {
    enemy.shield = Math.max(0, nextShield);
    enemy.maxShield = Math.max(enemy.maxShield ?? 0, enemy.shield);
    return;
  }

  enemy.shield = Math.max(0, nextShield);
  enemy.maxShield = Math.max(enemy.maxShield ?? 0, enemy.shield);
}

function applyExposed(enemy, duration, sourceId) {
  const effects = ensureEnemyEffects(enemy);
  const current = effects.exposed;
  const next = {
    type: "exposed",
    sourceId,
    duration,
    timeLeft: duration,
  };

  if (!current) {
    effects.exposed = next;
  } else {
    current.duration = Math.max(current.duration, next.duration);
    current.timeLeft = Math.max(current.timeLeft, next.timeLeft);
    current.sourceId = sourceId;
  }

  enemy.exposedTimer = Math.max(enemy.exposedTimer ?? 0, effects.exposed.timeLeft);
}

function applyMark(enemy, definition, sourceId, context = {}) {
  const effects = ensureEnemyEffects(enemy);
  const current = effects.mark;
  const markDuration = definition.markDuration ?? 0;
  const next = {
    type: "mark",
    sourceId,
    duration: markDuration,
    timeLeft: markDuration,
    scanHits: 0,
  };

  if (!current) {
    effects.mark = next;
  } else {
    current.duration = Math.max(current.duration, next.duration);
    current.timeLeft = Math.max(current.timeLeft, next.timeLeft);
    current.sourceId = sourceId;
  }

  enemy.markTimer = Math.max(enemy.markTimer ?? 0, effects.mark.timeLeft);
  if (definition.markEnergy > 0 && context?.onEnergyGain) {
    context.onEnergyGain(definition.markEnergy * 0.35);
  }
}

function registerScanHit(enemy, definition, context = {}) {
  const effects = ensureEnemyEffects(enemy);
  const mark = effects.mark;
  if (!mark || mark.timeLeft <= 0) {
    return;
  }

  mark.scanHits += 1;
  const chainThreshold = definition.scanThreshold ?? 2;
  if (mark.scanHits >= chainThreshold) {
    mark.scanHits = 0;
    const energyGain = definition.scanReward ?? 1;
    if (context?.onEnergyGain) {
      context.onEnergyGain(energyGain);
    }
    if (context?.effects) {
      triggerScreenFlash(context.effects, "energy", 0.18 + energyGain * 0.08);
    }
  }
}

function getCombatMultiplier(enemy, definition, family) {
  let multiplier = getEnemyTraitValue(enemy, family);
  if (multiplier <= 0) {
    return 0;
  }

  const effects = enemy?.effects ?? {};
  const mark = effects.mark;
  const exposed = effects.exposed;

  if (mark?.timeLeft > 0) {
    if (family === "burn") {
      multiplier *= definition.burnAmplify ?? 1.18;
    } else if (family === "splash") {
      multiplier *= 1.08;
    } else if (family === "needle") {
      multiplier *= definition.critBonus ?? 1.18;
    } else if (family === "relay") {
      multiplier *= 1.05;
    }
  }

  if (exposed?.timeLeft > 0) {
    multiplier *= family === "disrupt" ? 1.1 : 1.15;
  }

  if (enemy?.shield > 0 && family === "disrupt") {
    multiplier *= 1.6;
  }

  return multiplier;
}

function getBurnTickDamage(enemy, definition, context = {}) {
  let burnDps = definition.burnDps ?? 0;
  if (burnDps <= 0) {
    return 0;
  }

  if (enemy?.effects?.mark?.timeLeft > 0) {
    burnDps *= definition.burnAmplify ?? 1.18;
  }

  if (enemy?.effects?.exposed?.timeLeft > 0) {
    burnDps *= 1.08;
  }

  if (context?.onEnergyGain && burnDps > 20 && enemy?.effects?.mark?.timeLeft > 0) {
    context.onEnergyGain(0.15);
  }

  return burnDps;
}

function inflictShieldDamage(enemy, amount, family) {
  if (!(amount > 0)) {
    return 0;
  }

  const auraShield = Number.isFinite(enemy?.auraShield) ? enemy.auraShield : 0;
  const shield = Math.max(0, getShieldValue(enemy) - auraShield);
  if (shield <= 0) {
    return amount;
  }

  const shieldEfficiency = family === "disrupt" ? 1.5 : family === "splash" ? 0.5 : 0.25;
  const damageToShield = Math.min(shield, amount * shieldEfficiency);
  setShieldValue(enemy, shield - damageToShield);

  const remaining = amount - damageToShield / Math.max(0.001, shieldEfficiency);
  return Math.max(0, remaining);
}

function getTowerCenter(tower, layout) {
  if (tower?.cell) {
    return getCenterFromCell(tower.cell, layout ?? { cellSize: tower.cellSize ?? DEFAULT_CELL_SIZE });
  }

  return {
    x: tower?.x ?? 0,
    y: tower?.y ?? 0,
  };
}

function ensureEnemyEffects(enemy) {
  if (!enemy.effects || typeof enemy.effects !== "object") {
    enemy.effects = {};
  }

  if (!enemy.effects.slow) {
    enemy.effects.slow = null;
  }

  if (!enemy.effects.burn) {
    enemy.effects.burn = null;
  }

  if (!enemy.effects.mark) {
    enemy.effects.mark = null;
  }

  if (!enemy.effects.exposed) {
    enemy.effects.exposed = null;
  }

  return enemy.effects;
}

function enemyIsActive(enemy) {
  return Boolean(enemy) && !enemy.dead && (enemy.alive !== false) && (enemy.reachedGoal !== true);
}

function enemyPosition(enemy) {
  return {
    x: Number.isFinite(enemy?.x) ? enemy.x : 0,
    y: Number.isFinite(enemy?.y) ? enemy.y : 0,
  };
}

function enemyRadius(enemy) {
  return Number.isFinite(enemy?.radius) ? enemy.radius : 12;
}

function enemyHealthValue(enemy) {
  if (Number.isFinite(enemy?.health)) {
    return enemy.health;
  }

  if (Number.isFinite(enemy?.hp)) {
    return enemy.hp;
  }

  return 0;
}

function setEnemyHealth(enemy, nextHealth) {
  const value = Math.max(0, nextHealth);
  if (Number.isFinite(enemy.health)) {
    enemy.health = value;
  }

  if (Number.isFinite(enemy.hp)) {
    enemy.hp = value;
  }

  if (!Number.isFinite(enemy.health) && !Number.isFinite(enemy.hp)) {
    enemy.health = value;
  }
}

function dealDamage(enemy, amount, context = {}) {
  if (!enemyIsActive(enemy) || !(amount > 0)) {
    return 0;
  }

  const before = enemyHealthValue(enemy);
  const after = before - amount;
  setEnemyHealth(enemy, after);
  enemy.hitFlash = Math.max(enemy.hitFlash ?? 0, 0.18);
  const dealt = before - Math.max(0, after);
  const overkill = Math.max(0, amount - dealt);

  if (overkill > 0 && context?.onEnergyGain) {
    context.onEnergyGain(overkill * 0.2);
  }

  if (dealt > 0 && enemy.effects?.mark?.timeLeft > 0 && context?.onEnergyGain) {
    const chainEnergy = (context.chainEnergy ?? 0) > 0 ? context.chainEnergy : 0.5;
    if (chainEnergy > 0) {
      context.onEnergyGain(chainEnergy * 0.15);
    }
  }

  return dealt;
}

function setSlowEffect(enemy, definition, sourceId) {
  const effects = ensureEnemyEffects(enemy);
  if (isEffectImmune(enemy, "slow")) {
    enemy.slowTimer = 0;
    return;
  }

  const resistant = getEnemyTraitValue(enemy, "slow");
  const adjustedDuration = Math.max(0.3, definition.slowDuration * resistant);
  const adjustedFactor = Math.min(0.98, definition.slowFactor + (1 - resistant) * 0.08);
  const current = effects.slow;
  const next = {
    type: "slow",
    sourceId,
    multiplier: adjustedFactor,
    duration: adjustedDuration,
    timeLeft: adjustedDuration,
  };

  if (!current) {
    effects.slow = next;
  } else {
    current.multiplier = Math.min(current.multiplier, next.multiplier);
    current.duration = Math.max(current.duration, next.duration);
    current.timeLeft = Math.max(current.timeLeft, next.timeLeft);
    current.sourceId = sourceId;
  }

  enemy.slowFactor = effects.slow.multiplier;
  enemy.slowTimer = Math.max(enemy.slowTimer ?? 0, effects.slow.timeLeft);
}

function setBurnEffect(enemy, definition, sourceId) {
  const effects = ensureEnemyEffects(enemy);
  if (isEffectImmune(enemy, "burn")) {
    enemy.burnTimer = 0;
    return;
  }

  const resist = getEnemyTraitValue(enemy, "burn");
  const burnAmplify = enemy?.effects?.mark?.timeLeft > 0 ? definition.burnAmplify ?? 1.18 : 1;
  const current = effects.burn;
  const next = {
    type: "burn",
    sourceId,
    dps: definition.burnDps * resist * burnAmplify,
    duration: Math.max(0.4, definition.burnDuration * resist),
    timeLeft: Math.max(0.4, definition.burnDuration * resist),
    tickInterval: definition.burnTickInterval,
    tickCarry: 0,
  };

  if (!current) {
    effects.burn = next;
  } else {
    current.dps = Math.max(current.dps, next.dps);
    current.duration = Math.max(current.duration, next.duration);
    current.timeLeft = Math.max(current.timeLeft, next.timeLeft);
    current.tickInterval = Math.min(current.tickInterval, next.tickInterval);
    current.sourceId = sourceId;
  }

  enemy.burnTimer = Math.max(enemy.burnTimer ?? 0, effects.burn.timeLeft);
  enemy.burnDps = Math.max(enemy.burnDps ?? 0, effects.burn.dps);
}

function pickTarget(enemies, tower, layout) {
  const definition = lookupTowerDefinition(tower.type);
  const family = getTowerFamily(tower.type);
  const cellSize = tower.cellSize ?? getLayoutCellSize(layout);
  const maxRange = definition.rangeCells * cellSize;
  let bestEnemy = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const enemy of enemies) {
    if (!enemyIsActive(enemy)) {
      continue;
    }

    if (!canTowerDetectEnemy(definition, enemy)) {
      continue;
    }

    const { x, y } = enemyPosition(enemy);
    const distance = hypot(x - tower.x, y - tower.y);
    if (distance > maxRange) {
      continue;
    }

    let score = distance - enemyTargetPriority(enemy) * cellSize * 0.6;
    if (enemy?.traits?.hidden && definition.scanRadiusCells > 0) {
      score -= cellSize * 0.4;
    }

    if (distance <= maxRange) {
      if (family === "needle" && enemy.effects?.mark?.timeLeft > 0) {
        score -= cellSize * 0.28;
      }
      if (family === "relay" && enemy.effects?.mark?.timeLeft > 0) {
        score -= cellSize * 0.34;
      }
      if (family === "disrupt" && getShieldValue(enemy) > 0) {
        score -= cellSize * 0.26;
      }
      if (family === "burn" && enemy.effects?.burn?.timeLeft > 0) {
        score -= cellSize * 0.14;
      }

      if (score < bestScore) {
        bestEnemy = enemy;
        bestScore = score;
      }
    }
  }

  return bestEnemy;
}

function createProjectile(tower, target, layout) {
  const definition = lookupTowerDefinition(tower.type);
  const family = definition.family ?? tower.type.split("_")[0];
  const towerCenter = getTowerCenter(tower, layout);
  const targetPos = enemyPosition(target);
  const dx = targetPos.x - towerCenter.x;
  const dy = targetPos.y - towerCenter.y;
  const distance = hypot(dx, dy);
  const speed = definition.projectileSpeed;
  const dirX = distance > EPSILON ? dx / distance : 0;
  const dirY = distance > EPSILON ? dy / distance : 0;
  const travelTime = distance > EPSILON ? distance / speed : 0.15;

  return {
    id: `${tower.id}-shot-${tower.shotsFired + 1}`,
    type: tower.type,
    family,
    effectType: family,
    towerId: tower.id,
    targetId: target.id,
    x: towerCenter.x,
    y: towerCenter.y,
    prevX: towerCenter.x,
    prevY: towerCenter.y,
    vx: dirX * speed,
    vy: dirY * speed,
    speed,
    age: 0,
    travelTime,
    maxAge: travelTime + 0.85,
    targetX: targetPos.x,
    targetY: targetPos.y,
    impactRadius: definition.impactRadiusCells * getLayoutCellSize(layout),
    damage: definition.damage,
    color: definition.color,
    glow: definition.glow,
    trail: definition.trail,
    arcHeight: definition.arcHeight ?? 0,
    markDuration: definition.markDuration ?? 0,
    markEnergy: definition.markEnergy ?? 0,
    energyPulse: definition.energyPulse ?? 0,
    scanReward: definition.scanReward ?? 0,
    shieldBreak: definition.shieldBreak ?? 0,
    exposeDuration: definition.exposeDuration ?? 0,
    burnAmplify: definition.burnAmplify ?? 1,
    alive: true,
    resolved: false,
    spawnedAt: 0,
  };
}

function applyImpact(projectile, enemies, context = {}) {
  const definition = lookupTowerDefinition(projectile.type);
  const family = projectile.family ?? definition.family ?? projectile.type.split("_")[0];
  const target = enemies.find((enemy) => enemy.id === projectile.targetId && enemyIsActive(enemy));
  const impactPoint = target
    ? enemyPosition(target)
    : { x: projectile.x, y: projectile.y };
  const bursts = [];

  if (family === "splash") {
    for (const enemy of enemies) {
      if (!enemyIsActive(enemy)) {
        continue;
      }

      const { x, y } = enemyPosition(enemy);
      const distance = hypot(x - impactPoint.x, y - impactPoint.y);
      if (distance <= projectile.impactRadius + enemyRadius(enemy)) {
        const falloff = clamp(1 - distance / (projectile.impactRadius || 1), 0.45, 1);
        const amount = projectile.damage * falloff * getCombatMultiplier(enemy, definition, family);
        const resolved = inflictShieldDamage(enemy, amount, family);
        dealDamage(enemy, resolved, context);
        bursts.push(enemy.id);
      }
    }
  } else if (target) {
    let damage = projectile.damage * getCombatMultiplier(target, definition, family);

    if (family === "disrupt") {
      const shieldBreak = projectile.shieldBreak ?? definition.shieldBreak ?? 0;
      if (shieldBreak > 0) {
        setShieldValue(target, getShieldValue(target) - shieldBreak);
        applyExposed(target, projectile.exposeDuration ?? definition.exposeDuration ?? 0, projectile.id);
        registerScanHit(target, definition, context);
      }
    }

    if (family === "relay" || family === "needle") {
      applyMark(target, definition, projectile.id, context);
      registerScanHit(target, definition, context);
    }

    if (family === "burn" && target.effects?.mark?.timeLeft > 0) {
      damage *= projectile.burnAmplify ?? definition.burnAmplify ?? 1.18;
    }

    const resolved = inflictShieldDamage(target, damage, family);
    const dealt = dealDamage(target, resolved, context);
    if (dealt > 0 && family === "relay") {
      const pulse = projectile.energyPulse ?? definition.energyPulse ?? 0;
      if (pulse > 0 && context?.onEnergyGain) {
        context.onEnergyGain(pulse * 0.5);
      }
    }

    if (family === "slow") {
      setSlowEffect(target, definition, projectile.id);
    }

    if (family === "burn") {
      setBurnEffect(target, definition, projectile.id);
    }

    if (family === "disrupt" && projectile.exposeDuration > 0) {
      applyExposed(target, projectile.exposeDuration, projectile.id);
    }

    if (family === "needle") {
      registerScanHit(target, definition, context);
    }

    bursts.push(target.id);
  }

  projectile.resolved = true;

  return {
    x: impactPoint.x,
    y: impactPoint.y,
    color: definition.color,
    type: family,
    radius: projectile.impactRadius,
    effects: bursts,
  };
}

function pointProjectileAtTarget(projectile, target, dt) {
  const targetPos = enemyPosition(target);
  projectile.targetX = targetPos.x;
  projectile.targetY = targetPos.y;

  const dx = projectile.targetX - projectile.x;
  const dy = projectile.targetY - projectile.y;
  const distance = hypot(dx, dy);
  if (distance <= EPSILON) {
    projectile.vx = 0;
    projectile.vy = 0;
    return distance;
  }

  const speed = projectile.speed;
  projectile.vx = (dx / distance) * speed;
  projectile.vy = (dy / distance) * speed;
  projectile.prevX = projectile.x;
  projectile.prevY = projectile.y;
  projectile.x += projectile.vx * dt;
  projectile.y += projectile.vy * dt;
  return distance;
}

export function getTowerDefinition(type) {
  return lookupTowerDefinition(type);
}

export function getTowerUpgradeTree(type) {
  return lookupTowerUpgradeTree(type);
}

export function getUpgradeOptions(tower) {
  const baseType = getBaseType(tower?.baseType ?? tower?.type);
  const tree = lookupTowerUpgradeTree(baseType);
  if (!tree || tower?.upgradeStage >= 1) {
    return [];
  }

  return tree.branches.map((branch) => ({
    ...branch,
    definition: getTowerDefinition(branch.type),
  }));
}

export function canUpgradeTower(state, tower, branchId = null) {
  if (!state || !tower) {
    return false;
  }

  if (tower.upgradeStage >= 1) {
    return false;
  }

  const options = getUpgradeOptions(tower);
  if (branchId) {
    const branch = options.find((item) => item.id === branchId || item.type === branchId);
    return Boolean(branch && state.energy >= branch.cost);
  }

  return options.some((branch) => state.energy >= branch.cost);
}

export function upgradeTower(state, tower, branchId) {
  if (!canUpgradeTower(state, tower, branchId)) {
    return null;
  }

  const branch = getUpgradeOptions(tower).find((item) => item.id === branchId || item.type === branchId);
  if (!branch) {
    return null;
  }

  const nextDefinition = getTowerDefinition(branch.type);
  state.energy -= branch.cost;
  tower.type = branch.type;
  tower.definition = nextDefinition;
  tower.upgradeBranch = branch.id;
  tower.upgradeStage = 1;
  tower.roleLabel = nextDefinition.roleLabel ?? branch.finalRole ?? nextDefinition.label;
  tower.baseType = getBaseType(tower.baseType ?? tower.type);
  tower.cooldown = Math.min(tower.cooldown ?? 0, 0.1);
  return {
    tower,
    branch,
    definition: nextDefinition,
    spent: branch.cost,
  };
}

export function createTower(type, x, y, layout) {
  const definition = lookupTowerDefinition(type);
  const point = normalizePointLike(x, y, layout);
  const tower = {
    id: `${type}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    baseType: getBaseType(type),
    cell: point.cell ? { ...point.cell } : null,
    x: point.x,
    y: point.y,
    cellSize: point.cellSize ?? getLayoutCellSize(layout),
    cooldown: 0,
    shotsFired: 0,
    pulse: Math.random() * Math.PI * 2,
    selected: false,
    definition,
    upgradeStage: 0,
    upgradeBranch: null,
    roleLabel: definition.roleLabel ?? definition.label,
  };

  return tower;
}

export function syncTowerPosition(tower, layout) {
  if (!tower?.cell) {
    return;
  }

  const center = getCenterFromCell(tower.cell, layout);
  tower.x = center.x;
  tower.y = center.y;
  tower.cellSize = getLayoutCellSize(layout);
}

export function serializeTowerCell(tower) {
  return tower?.cell ? keyOf(tower.cell) : "";
}

export function updateTowers(towers, enemies, projectiles, dt, assets = {}, context = {}) {
  const layout = assets?.layout ?? null;
  const spawned = [];

  for (const tower of towers) {
    const definition = lookupTowerDefinition(tower.type);
    tower.definition = definition;
    tower.cooldown = Math.max(0, (tower.cooldown ?? 0) - dt);
    tower.pulse = (tower.pulse ?? 0) + dt * 2.6;

    if (tower.cooldown > 0) {
      continue;
    }

    const target = pickTarget(enemies, tower, layout);
    if (!target) {
      continue;
    }

    const projectile = createProjectile(tower, target, layout);
    spawned.push(projectile);
    if (Array.isArray(projectiles)) {
      projectiles.push(projectile);
    }

    tower.shotsFired = (tower.shotsFired ?? 0) + 1;
    tower.cooldown = 1 / definition.fireRate;

    if (context?.onTowerFire && projectile) {
      context.onTowerFire(tower, projectile);
    }
  }

  return spawned;
}

export function updateProjectiles(projectiles, enemies, dt, layout = null, context = {}) {
  const bursts = [];
  const enemyById = new Map();
  for (const enemy of enemies) {
    enemyById.set(enemy.id, enemy);
  }

  for (const projectile of projectiles) {
    if (!projectile.alive) {
      continue;
    }

    projectile.age = (projectile.age ?? 0) + dt;
    projectile.prevX = projectile.x;
    projectile.prevY = projectile.y;

    const target = enemyById.get(projectile.targetId);
    const hasLiveTarget = enemyIsActive(target);
    const targetX = hasLiveTarget ? target.x : projectile.targetX;
    const targetY = hasLiveTarget ? target.y : projectile.targetY;
    const dx = targetX - projectile.x;
    const dy = targetY - projectile.y;
    const distance = hypot(dx, dy);
    const step = projectile.speed * dt;
    const directHitRadius = projectile.impactRadius * 0.42 + enemyRadius(target) * 0.35;
    const reachedTarget = hasLiveTarget && distance <= step + directHitRadius;
    const expired = projectile.age >= projectile.maxAge;

    if (distance <= EPSILON) {
      projectile.vx = 0;
      projectile.vy = 0;
    } else {
      projectile.vx = (dx / distance) * projectile.speed;
      projectile.vy = (dy / distance) * projectile.speed;
      projectile.x += projectile.vx * dt;
      projectile.y += projectile.vy * dt;
    }

    if (reachedTarget) {
      projectile.x = targetX;
      projectile.y = targetY;
    }

    if (reachedTarget || expired) {
      projectile.alive = false;
      if (projectile.type === "splash" || reachedTarget) {
        bursts.push(applyImpact(projectile, enemies, context));
      }
    }
  }

  return bursts;
}

export function drawTowers(ctx, towers, assetsOrLayout = null) {
  const layout = isLayoutLike(assetsOrLayout) ? assetsOrLayout : assetsOrLayout?.layout ?? null;
  const hologramCore = assetsOrLayout?.hologramCore ?? null;

  for (const tower of towers) {
    const definition = lookupTowerDefinition(tower.type);
    const cellSize = tower.cellSize ?? getLayoutCellSize(layout);
    const center = getTowerCenter(tower, layout);
    const pulse = tower.pulse ?? 0;
    const glowRadius = cellSize * 0.42;
    const ringRadius = cellSize * 0.28 + Math.sin(pulse) * 1.5;

    ctx.save();
    ctx.translate(center.x, center.y + Math.sin(pulse * 1.6) * 2.2);

    ctx.fillStyle = definition.glow;
    ctx.beginPath();
    ctx.arc(0, 0, glowRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = definition.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, ringRadius + 9, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "rgba(5, 12, 22, 0.92)";
    ctx.beginPath();
    ctx.arc(0, 0, ringRadius + 2, 0, Math.PI * 2);
    ctx.fill();

    if (hologramCore) {
      ctx.globalAlpha = 0.88;
      const coreSize = cellSize * 0.42;
      ctx.drawImage(hologramCore, -coreSize * 0.5, -coreSize * 0.5, coreSize, coreSize);
    } else {
      ctx.fillStyle = definition.color;
      ctx.beginPath();
      ctx.arc(0, 0, ringRadius - 2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = "rgba(255, 255, 255, 0.32)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, ringRadius - 2, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }
}

function drawProjectileTrail(ctx, projectile) {
  const dx = projectile.x - projectile.prevX;
  const dy = projectile.y - projectile.prevY;
  const distance = hypot(dx, dy);
  const normalX = distance > EPSILON ? -dy / distance : 0;
  const normalY = distance > EPSILON ? dx / distance : 0;
  const arc = projectile.arcHeight * Math.sin(Math.min(1, projectile.age / projectile.travelTime) * Math.PI);
  const controlX = (projectile.prevX + projectile.x) * 0.5 + normalX * arc * 44;
  const controlY = (projectile.prevY + projectile.y) * 0.5 + normalY * arc * 44 - arc * 10;

  ctx.beginPath();
  ctx.moveTo(projectile.prevX, projectile.prevY);
  ctx.quadraticCurveTo(controlX, controlY, projectile.x, projectile.y);
  ctx.stroke();
}

export function drawProjectiles(ctx, projectiles, assets = null) {
  for (const projectile of projectiles) {
    if (!projectile.alive) {
      continue;
    }

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.strokeStyle = projectile.trail;
    ctx.lineWidth = projectile.family === "splash" ? 6 : 5;
    ctx.shadowColor = projectile.glow;
    ctx.shadowBlur = 12;
    drawProjectileTrail(ctx, projectile);

    ctx.shadowBlur = 0;
    ctx.fillStyle = projectile.color;
    ctx.beginPath();
    ctx.arc(projectile.x, projectile.y, projectile.type === "splash" ? 4.8 : 4.2, 0, Math.PI * 2);
    ctx.fill();

    if (projectile.family === "splash") {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.42)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(projectile.x, projectile.y, 8, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }
}

export function drawImpactBursts(ctx, bursts, age = 0) {
  for (const burst of bursts) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - age / 0.22);
    ctx.strokeStyle = burst.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(burst.x, burst.y, 16 + age * 120, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

export function updateTowerFire(dt, towers, enemies, layout, context = {}) {
  return updateTowers(towers, enemies, [], dt, { layout }, context);
}

export function advanceProjectiles(dt, projectiles, enemies, layout = null, context = {}) {
  return updateProjectiles(projectiles, enemies, dt, layout, context);
}
