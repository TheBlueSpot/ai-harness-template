(() => {
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const ENEMY_BASES = {
  grunt: { health: 24, moveSpeed: 88, attackPower: 5, radius: 17, bounty: 3, targetOffset: 170 },
  rusher: { health: 18, moveSpeed: 118, attackPower: 4, radius: 15, bounty: 4, targetOffset: 180 },
  brute: { health: 62, moveSpeed: 58, attackPower: 11, radius: 23, bounty: 7, targetOffset: 192 },
};

const makeSeed = (waveNumber, modifiers = {}) => {
  const serial = JSON.stringify({ waveNumber, modifiers });
  let seed = 2166136261;
  for (let index = 0; index < serial.length; index += 1) {
    seed ^= serial.charCodeAt(index);
    seed = Math.imul(seed, 16777619);
  }
  return seed >>> 0;
};

const nextRandom = (state) => {
  state.value = (state.value * 1664525 + 1013904223) >>> 0;
  return state.value / 4294967296;
};

const laneToY = (lane) => 174 + lane * 108;

const createEnemyEntity = (spawn, waveNumber, modifiers = {}, index) => {
  const base = ENEMY_BASES[spawn.type] ?? ENEMY_BASES.grunt;
  const healthScale = (modifiers.enemyHealthMultiplier ?? 1) * (1 + (waveNumber - 1) * 0.14);
  const speedScale = (modifiers.enemySpeedMultiplier ?? 1) * (1 + (waveNumber - 1) * 0.05);
  const attackScale = (modifiers.enemyAttackMultiplier ?? 1) * (1 + (waveNumber - 1) * 0.08);
  return {
    id: `enemy-${waveNumber}-${index}`,
    kind: "enemy",
    type: spawn.type,
    lane: spawn.lane,
    x: -72 - spawn.lane * 18,
    y: laneToY(spawn.lane),
    radius: base.radius,
    health: Math.round(base.health * healthScale),
    maxHealth: Math.round(base.health * healthScale),
    moveSpeed: base.moveSpeed * speedScale,
    attackPower: base.attackPower * attackScale,
    bounty: Math.round(base.bounty * (1 + (waveNumber - 1) * 0.1)),
    targetOffset: base.targetOffset,
    state: "MOVE",
    attackTimer: 0,
    alive: true,
  };
};

function updateEnemyFSM(entity, runtimeState = {}) {
  if (!entity || !entity.alive) return entity;

  const dt = clamp((runtimeState.deltaMs ?? 0) / 1000, 0, 0.05);
  const houseX = runtimeState.house?.x ?? runtimeState.houseX ?? 1120;
  const attackInterval = runtimeState.enemyAttackInterval ?? 0.55;
  const targetX = houseX - (entity.targetOffset ?? 170);

  if (entity.state === "MOVE") {
    entity.x += entity.moveSpeed * dt;
    if (entity.x >= targetX) {
      entity.x = targetX;
      entity.state = "ATTACK_WALL";
      entity.attackTimer = 0;
    }
  }

  if (entity.state === "ATTACK_WALL") {
    entity.attackTimer += dt;
    if (entity.attackTimer >= attackInterval) {
      entity.attackTimer = 0;
      runtimeState.queueDamage?.("house", entity.attackPower);
    }
  }

  return entity;
}

function updateSniperFSM(entity, runtimeState = {}) {
  if (!entity || !entity.alive) return entity;

  const dt = clamp((runtimeState.deltaMs ?? 0) / 1000, 0, 0.05);
  entity.cooldown = Math.max(0, (entity.cooldown ?? 0) - dt);
  entity.fsmState = "SCAN";

  const houseX = runtimeState.house?.x ?? 1120;
  let target = null;
  for (const enemy of runtimeState.enemies ?? []) {
    if (!enemy.alive) continue;
    if (!target) {
      target = enemy;
      continue;
    }
    const targetDistance = houseX - target.x;
    const enemyDistance = houseX - enemy.x;
    if (enemyDistance < targetDistance || (enemyDistance === targetDistance && enemy.health < target.health)) {
      target = enemy;
    }
  }

  entity.targetId = target?.id ?? null;
  if (!target) return entity;

  entity.fsmState = entity.cooldown > 0 ? "TRACK" : "FIRE";
  if (entity.cooldown === 0) {
    entity.cooldown = entity.reloadTime ?? runtimeState.sniperReloadTime ?? 1.05;
    runtimeState.queueDamage?.(target.id, entity.damage ?? runtimeState.sniperDamage ?? 18);
  }

  return entity;
}

function updateCraftsmanFSM(entity, runtimeState = {}) {
  if (!entity || !entity.alive) return entity;

  const dt = clamp((runtimeState.deltaMs ?? 0) / 1000, 0, 0.05);
  const house = runtimeState.house;
  const repairRate = entity.repairRate ?? runtimeState.repairRate ?? 5.5;

  entity.fsmState = "IDLE";
  if (house && house.health < house.maxHealth) {
    entity.fsmState = "REPAIR";
    house.health = Math.min(house.maxHealth, house.health + repairRate * dt);
    entity.repairedTotal = (entity.repairedTotal ?? 0) + repairRate * dt;
  }

  return entity;
}

class EnemySpawner {
  constructor() {
    this.reset();
  }

  reset() {
    this.wave = 0;
    this.seed = 0;
    this.elapsed = 0;
    this.pendingSpawns = [];
    this.totalSpawns = 0;
    this.spawned = 0;
    this.intermissionReady = false;
  }

  startWave(waveNumber, modifiers = {}) {
    this.wave = Math.max(1, Math.floor(Number(waveNumber) || 1));
    this.seed = makeSeed(this.wave, modifiers);
    this.elapsed = 0;
    this.spawned = 0;
    this.intermissionReady = false;

    const rng = { value: this.seed };
    const count = Math.max(7, 7 + this.wave * 3 + Math.floor(modifiers.enemyCountBonus ?? 0));
    const cadence = Math.max(0.2, 0.85 - this.wave * 0.025 - (modifiers.spawnCadenceBonus ?? 0));
    this.pendingSpawns = [];

    for (let index = 0; index < count; index += 1) {
      const roll = nextRandom(rng);
      let type = "grunt";
      if (this.wave >= 2 && roll > 0.58) type = "rusher";
      if (this.wave >= 3 && roll > 0.82) type = "brute";
      this.pendingSpawns.push({
        at: Number((index * cadence + nextRandom(rng) * 0.2).toFixed(3)),
        type,
        lane: Math.floor(nextRandom(rng) * 4),
      });
    }

    this.totalSpawns = this.pendingSpawns.length;
    return this.getWaveSnapshot();
  }

  buildWave(waveNumber, modifiers = {}) {
    return this.startWave(waveNumber, modifiers);
  }

  update(deltaMs, runtimeState = {}) {
    const dt = clamp((deltaMs ?? 0) / 1000, 0, 0.05);
    const nextElapsed = this.elapsed + dt;
    const enemies = runtimeState.enemies ?? [];
    const allies = runtimeState.allies ?? [];
    const spawnedNow = [];

    while (this.pendingSpawns.length && this.pendingSpawns[0].at <= nextElapsed) {
      const definition = this.pendingSpawns.shift();
      const enemy = createEnemyEntity(definition, this.wave, runtimeState.modifiers ?? {}, this.spawned + 1);
      enemies.push(enemy);
      spawnedNow.push(enemy);
      this.spawned += 1;
    }

    for (const enemy of enemies) {
      updateEnemyFSM(enemy, {
        deltaMs,
        house: runtimeState.house,
        houseX: runtimeState.houseX,
        queueDamage: runtimeState.queueDamage,
        enemyAttackInterval: runtimeState.enemyAttackInterval,
      });
    }

    for (const ally of allies) {
      if (ally.role === "sniper") {
        updateSniperFSM(ally, {
          deltaMs,
          enemies,
          house: runtimeState.house,
          queueDamage: runtimeState.queueDamage,
          sniperReloadTime: runtimeState.sniperReloadTime,
          sniperDamage: runtimeState.sniperDamage,
        });
      } else if (ally.role === "craftsman") {
        updateCraftsmanFSM(ally, {
          deltaMs,
          house: runtimeState.house,
          repairRate: ally.repairRate,
        });
      }
    }

    this.elapsed = nextElapsed;
    this.intermissionReady = this.pendingSpawns.length === 0 && enemies.every((enemy) => !enemy.alive);

    return {
      spawned: spawnedNow,
      snapshot: this.getWaveSnapshot({ activeEnemies: enemies }),
    };
  }

  getWaveSnapshot({ activeEnemies = [] } = {}) {
    return {
      wave: this.wave,
      queued: this.pendingSpawns.length,
      totalSpawns: this.totalSpawns,
      spawned: this.spawned,
      active: activeEnemies.filter((enemy) => enemy.alive).length,
      intermissionReady: this.intermissionReady,
      seed: this.seed,
    };
  }

  shouldEnterIntermission(activeEnemies = []) {
    return this.pendingSpawns.length === 0 && activeEnemies.every((enemy) => !enemy.alive);
  }
}

globalThis.updateEnemyFSM = updateEnemyFSM;
globalThis.updateSniperFSM = updateSniperFSM;
globalThis.updateCraftsmanFSM = updateCraftsmanFSM;
globalThis.EnemySpawner = EnemySpawner;
})();
