import { DEFAULT_WAVES, ENEMY_TYPES } from "./enemy-data.js";

function clonePoint(point) {
  return { x: point.x, y: point.y };
}

function getKindDefinition(kind) {
  return ENEMY_TYPES[kind] ?? ENEMY_TYPES.scout;
}

function buildResistanceProfile(kind, traits = {}) {
  const profile = {
    splash: 1,
    slow: 1,
    burn: 1,
    needle: 1,
    relay: 1,
    disrupt: 1,
  };

  if (Number.isFinite(traits.splashResistance)) {
    profile.splash = Math.max(0.15, Math.min(2.5, traits.splashResistance));
  }

  if (traits.burnWeak) {
    profile.burn = Math.max(0.25, 1 / traits.burnWeak);
  }

  if (traits.slowWeak) {
    profile.slow = Math.max(0.25, 1 / traits.slowWeak);
  }

  if (traits.slowResistance) {
    profile.slow = Math.max(0.25, Math.min(2.5, traits.slowResistance));
  }

  if (traits.burnResistance) {
    profile.burn = Math.max(0.25, Math.min(2.5, traits.burnResistance));
  }

  if (traits.disruptWeak) {
    profile.disrupt = Math.max(0.25, traits.disruptWeak);
  }

  return profile;
}

function deriveShield(kind, data, traits = {}) {
  if (Number.isFinite(data.shield)) {
    return data.shield;
  }

  if (traits.shieldProjector) {
    return 28;
  }

  if (traits.shielded) {
    return 36;
  }

  if (kind === "shell") {
    return 22;
  }

  if (kind === "warden") {
    return 42;
  }

  if (kind === "overseer") {
    return 70;
  }

  if (kind === "projector") {
    return 30;
  }

  if (kind === "lattice_overseer") {
    return 88;
  }

  if (kind === "mirror_archon") {
    return 64;
  }

  return 0;
}

function deriveTraits(data) {
  const traits = data.traits ?? {};
  const list = [];
  if (traits.hidden) {
    list.push("hidden");
  }
  if (traits.flicker) {
    list.push("flicker");
  }
  if (traits.scanRequired) {
    list.push("scan");
  }
  if (traits.carrier) {
    list.push("carrier");
  }
  if (traits.phaseShift) {
    list.push("phase");
  }
  if (traits.mirrorCaster) {
    list.push("mirror");
  }
  if (traits.shieldProjector) {
    list.push("projector");
  }
  if (traits.shieldbreakerPriority) {
    list.push("breaker");
  }
  if (traits.boss || data.boss) {
    list.push("boss");
  }
  return list;
}

function getSpawnAnchor(pathfinder) {
  const layout = pathfinder?.layout ?? null;
  if (layout && Number.isFinite(layout.originX) && Number.isFinite(layout.originY) && Number.isFinite(layout.width) && Number.isFinite(layout.height)) {
    return layout;
  }

  return {
    originX: 0,
    originY: 0,
    width: Number.isFinite(pathfinder?.width) ? Number(pathfinder.width) : 900,
    height: Number.isFinite(pathfinder?.height) ? Number(pathfinder.height) : 540,
  };
}

function distanceBetween(a, b) {
  if (!a || !b) {
    return 0;
  }

  return Math.hypot(a.x - b.x, a.y - b.y);
}

function resolveSpawnPoint(pathfinder, spawnPointName) {
  const layout = getSpawnAnchor(pathfinder);
  const padX = Math.max(24, layout.width * 0.06);
  const padY = Math.max(24, layout.height * 0.08);
  const leftX = layout.originX + padX;
  const rightX = layout.originX + layout.width - padX;
  const centerX = layout.originX + layout.width * 0.5;
  const upperY = layout.originY + layout.height * 0.24;
  const midY = layout.originY + layout.height * 0.5;
  const lowerY = layout.originY + layout.height * 0.76;
  const laneOffsetY = layout.height * 0.18;
  const topY = layout.originY + padY;
  const bottomY = layout.originY + layout.height - padY;
  const goal = pathfinder?.goalPoint ?? { x: rightX, y: midY };
  const minGoalDistance = Math.min(
    Math.max(750, layout.width * 0.68),
    Math.max(750, layout.width - padX * 2),
  );

  const presets = {
    "left-upper": { x: leftX, y: upperY },
    "left-mid": { x: leftX, y: midY },
    "left-lower": { x: leftX, y: lowerY },
    "right-upper": { x: rightX, y: upperY },
    "right-mid": { x: rightX, y: midY },
    "right-lower": { x: rightX, y: lowerY },
    "center-left": { x: leftX, y: Math.max(topY, midY - laneOffsetY) },
    "center-right": { x: rightX, y: Math.min(bottomY, midY + laneOffsetY) },
    "top-mid": { x: centerX, y: topY },
    "bottom-mid": { x: centerX, y: bottomY },
  };

  const fallbackAliases = {
    "right-upper": "left-upper",
    "right-mid": "left-mid",
    "right-lower": "left-lower",
    "center-right": "center-left",
    "top-mid": "left-upper",
    "bottom-mid": "left-lower",
  };

  const spawn = presets[spawnPointName] ?? null;
  if (!spawn) {
    return null;
  }

  if (distanceBetween(spawn, goal) >= minGoalDistance) {
    return spawn;
  }

  const fallbackName = fallbackAliases[spawnPointName] ?? "left-mid";
  return presets[fallbackName] ?? presets["left-mid"];
}

function collectWaveSpawnPoints(actions = []) {
  const points = [];
  for (const action of actions) {
    if (!action || action.type === "wait") {
      continue;
    }

    if (action.type === "mix") {
      const basePoint = action.spawnPoint ?? "left-mid";
      for (const group of action.groups ?? []) {
        points.push(group.spawnPoint ?? basePoint);
      }
      continue;
    }

    points.push(action.spawnPoint ?? "left-mid");
  }

  return [...new Set(points.filter(Boolean))];
}

function isBossKind(kind) {
  return Boolean(kind && ENEMY_TYPES[kind]?.boss);
}

function findWaveBossAction(wave) {
  if (!wave) {
    return null;
  }

  return (wave.actions ?? []).find((action) => isBossKind(action.kind)) ?? null;
}

function buildBossFields(pathfinder, source, boss, waveTimer) {
  if (!source || (!boss && !source.kind)) {
    return [];
  }

  const layout = getSpawnAnchor(pathfinder);
  const phaseSeconds = Math.max(1, source.pulseSeconds ?? 2.5);
  const phase = Math.floor(waveTimer / phaseSeconds) % 4;
  const midX = layout.originX + layout.width * 0.5;
  const leftX = layout.originX + layout.width * 0.32;
  const rightX = layout.originX + layout.width * 0.68;
  const upperY = layout.originY + layout.height * 0.28;
  const midY = layout.originY + layout.height * 0.5;
  const lowerY = layout.originY + layout.height * 0.72;
  const softWeight = source.softFieldWeight ?? 12;
  const hardWeight = source.hardFieldWeight ?? 18;
  const bossRadius = boss?.radius ?? 24;

  const fields = [
    {
      x: boss?.x ?? midX,
      y: boss?.y ?? midY,
      radius: Math.max(42, bossRadius * 2),
      margin: 0,
      weight: softWeight * 0.4,
      hard: false,
      kind: "boss-aura",
    },
  ];

  if (phase === 0) {
    fields.push({ x: midX, y: midY, radius: layout.height * 0.16, margin: 0, weight: softWeight, hard: false, kind: "phase-gate" });
    fields.push({ x: leftX, y: upperY, radius: layout.height * 0.1, margin: 8, weight: hardWeight, hard: true, kind: "false-wall" });
  } else if (phase === 1) {
    fields.push({ x: midX, y: upperY, radius: layout.height * 0.13, margin: 0, weight: softWeight + 4, hard: false, kind: "phase-gate" });
    fields.push({ x: rightX, y: lowerY, radius: layout.height * 0.1, margin: 8, weight: hardWeight, hard: true, kind: "false-wall" });
  } else if (phase === 2) {
    fields.push({ x: midX, y: lowerY, radius: layout.height * 0.14, margin: 0, weight: softWeight + 2, hard: false, kind: "phase-gate" });
    fields.push({ x: midX, y: midY, radius: layout.height * 0.09, margin: 10, weight: hardWeight + 4, hard: true, kind: "false-wall" });
  } else {
    fields.push({ x: leftX, y: midY, radius: layout.height * 0.12, margin: 0, weight: softWeight + 1, hard: false, kind: "phase-gate" });
    fields.push({ x: rightX, y: midY, radius: layout.height * 0.12, margin: 0, weight: softWeight + 1, hard: false, kind: "phase-gate" });
    fields.push({ x: midX, y: upperY, radius: layout.height * 0.08, margin: 10, weight: hardWeight + 4, hard: true, kind: "false-wall" });
  }

  return fields;
}

function makeEnemy(kind) {
  const data = getKindDefinition(kind);
  const traits = data.traits ?? {};
  return {
    id: `${kind}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    label: data.label,
    maxHealth: data.maxHealth,
    health: data.maxHealth,
    speedCells: data.speedCells,
    radius: data.radius,
    tint: data.tint,
    reward: data.reward,
    shardEnergy: data.shardEnergy ?? (data.boss ? 4 : data.reward >= 20 ? 2 : 0),
    isBoss: Boolean(data.boss),
    shield: deriveShield(kind, data, traits),
    maxShield: deriveShield(kind, data, traits),
    resistances: buildResistanceProfile(kind, traits),
    immuneFamilies: [
      ...(traits.slowImmune ? ["slow"] : []),
      ...(traits.burnImmune ? ["burn"] : []),
    ],
    traits: { ...traits },
    traitTags: deriveTraits(data),
    deathSpawn: Array.isArray(data.deathSpawn) ? data.deathSpawn.map((entry) => ({ ...entry })) : [],
    shieldAuraRadius: data.shieldAuraRadius ?? 0,
    shieldAuraStrength: data.shieldAuraStrength ?? 0,
    disruption: data.disruption ? { ...data.disruption } : null,
    x: 0,
    y: 0,
    path: [],
    pathIndex: 0,
    pathRevision: -1,
    pathAge: 0,
    slowTimer: 0,
    slowFactor: 1,
    burnTimer: 0,
    burnDps: 0,
    markTimer: 0,
    exposedTimer: 0,
    hitFlash: 0,
    dead: false,
  };
}

function queueAction(queue, action, waveIndex, cursor) {
  if (!action) {
    return cursor;
  }

  if (action.type === "wait") {
    return cursor + Math.max(0, action.duration ?? 0);
  }

  if (action.type === "burst") {
    const count = Math.max(1, action.count ?? 1);
    const cadence = Math.max(0.06, action.every ?? Math.max(0.08, 0.18 - waveIndex * 0.005));
    for (let index = 0; index < count; index += 1) {
      queue.push({
        kind: action.kind,
        spawnPoint: action.spawnPoint ?? "left-mid",
        at: cursor + index * cadence,
        cadence,
      });
    }
    return cursor + count * cadence;
  }

  if (action.type === "interval") {
    const count = Math.max(1, action.count ?? 1);
    const every = Math.max(0.04, action.every ?? 0.2);
    for (let index = 0; index < count; index += 1) {
      queue.push({
        kind: action.kind,
        spawnPoint: action.spawnPoint ?? "left-mid",
        at: cursor + index * every,
        cadence: every,
      });
    }
    return cursor + count * every;
  }

  if (action.type === "mix") {
    const basePoint = action.spawnPoint ?? "left-mid";
    for (const group of action.groups ?? []) {
      const count = Math.max(1, group.count ?? 1);
      const every = Math.max(0.05, group.every ?? 0.2);
      for (let index = 0; index < count; index += 1) {
        queue.push({
          kind: group.kind,
          spawnPoint: group.spawnPoint ?? basePoint,
          at: cursor + index * every,
          cadence: every,
        });
      }
    }
    return cursor + Math.max(...(action.groups ?? []).map((group) => (group.count ?? 1) * Math.max(0.05, group.every ?? 0.2)), 0);
  }

  return cursor;
}

function buildSpawnQueue(wave, waveIndex) {
  const queue = [];
  let cursor = 0.4;
  for (const action of wave.actions ?? []) {
    cursor = queueAction(queue, action, waveIndex, cursor);
  }

  queue.sort((a, b) => a.at - b.at || a.kind.localeCompare(b.kind));
  return queue;
}

function isEnemyActive(enemy) {
  return Boolean(enemy) && !enemy.dead && enemy.health > 0;
}

function pathPointAtSpawn(pathfinder, spawnPointName) {
  const spawn = pathfinder?.spawn ?? pathfinder?.start ?? { x: 0, y: 0 };
  const goal = pathfinder?.goalPoint ?? pathfinder?.goal ?? spawn;
  if (typeof spawnPointName === "string") {
    const point = resolveSpawnPoint(pathfinder, spawnPointName);
    if (point) {
      return { spawn: point, goal };
    }
  }

  return { spawn: clonePoint(spawn), goal };
}

export class WaveManager {
  constructor({ waves = DEFAULT_WAVES, lives = 10 } = {}) {
    this.waves = waves.map((wave) => ({
      ...wave,
      actions: Array.isArray(wave.actions) ? wave.actions.map((action) => ({ ...action })) : [],
    }));
    this.maxLives = lives;
    this.reset();
  }

  reset() {
    this.running = false;
    this.complete = false;
    this.failed = false;
    this.lives = this.maxLives;
    this.waveIndex = 0;
    this.waveTimer = 0;
    this.spawnIndex = 0;
    this.spawnQueue = [];
    this.enemies = [];
    this.kills = 0;
    this.clearedWaves = 0;
    this.waveCountdown = 0;
    this.pendingWaveIndex = null;
    this.waveState = "idle";
    this.bossWaveActive = false;
    this.waveLeakCount = 0;
    this.waveClearBonus = 0;
    this.spawnedThisWave = 0;
    this.disruptionPhase = -1;
  }

  start() {
    this.reset();
    this.running = true;
    this._primeWave(0);
  }

  _primeWave(index) {
    const wave = this.waves[index];
    if (!wave) {
      this.complete = true;
      this.running = false;
      this.waveState = "complete";
      return;
    }

    this.waveIndex = index;
    this.spawnQueue = buildSpawnQueue(wave, index);
    this.spawnIndex = 0;
    this.waveTimer = 0;
    this.waveCountdown = 0;
    this.pendingWaveIndex = null;
    this.waveState = "spawning";
    this.bossWaveActive = false;
    this.waveLeakCount = 0;
    this.waveClearBonus = 0;
    this.spawnedThisWave = 0;
    this.disruptionPhase = -1;
  }

  _spawnEnemy(pathfinder, command) {
    const enemy = makeEnemy(command.kind);
    const entry = pathPointAtSpawn(pathfinder, command.spawnPoint);
    const path = pathfinder.findPath(entry.spawn, entry.goal);
    if (!path.length) {
      return null;
    }

    const first = path[0];
    enemy.x = first.x;
    enemy.y = first.y;
    enemy.path = path;
    enemy.pathIndex = 0;
    enemy.pathRevision = pathfinder.getRevision();
    enemy.pathAge = 0;
    enemy.spawnPoint = command.spawnPoint ?? "left-mid";
    enemy.currentCell = first.cell ? { ...first.cell } : null;
    this.enemies.push(enemy);
    return enemy;
  }

  _repathEnemy(enemy, pathfinder) {
    const path = pathfinder.findPathFromPoint({ x: enemy.x, y: enemy.y }, pathfinder.goal);
    if (!path.length) {
      return false;
    }

    enemy.path = path;
    enemy.pathRevision = pathfinder.getRevision();
    enemy.pathIndex = 0;
    enemy.pathAge = 0;
    enemy.currentCell = path[0].cell ? { ...path[0].cell } : null;
    return true;
  }

  _moveEnemy(enemy, dt, pathfinder) {
    const speedPx = enemy.speedCells * pathfinder.getCellSize();
    const slowFactor = enemy.slowTimer > 0 ? enemy.slowFactor : 1;
    let remaining = speedPx * slowFactor * dt;

    while (remaining > 0 && !enemy.dead) {
      const nextPoint = enemy.path[enemy.pathIndex + 1];
      if (!nextPoint) {
        enemy.dead = true;
        this.lives = Math.max(0, this.lives - 1);
        break;
      }

      const dx = nextPoint.x - enemy.x;
      const dy = nextPoint.y - enemy.y;
      const distance = Math.hypot(dx, dy);

      if (distance <= remaining) {
        enemy.x = nextPoint.x;
        enemy.y = nextPoint.y;
        enemy.pathIndex += 1;
        remaining -= distance;
        continue;
      }

      const scale = remaining / (distance || 1);
      enemy.x += dx * scale;
      enemy.y += dy * scale;
      remaining = 0;
    }
  }

  update(dt, pathfinder) {
    const events = {
      spawned: 0,
      destroyed: 0,
      leaked: 0,
      energyGain: 0,
      waveComplete: false,
      waveAdvanced: false,
      spawnedEnemies: [],
      destroyedEnemies: [],
      leakedEnemies: [],
      waveCountdown: this.waveCountdown,
      waveState: this.waveState,
      bossActive: this.bossWaveActive,
      waveClearBonus: this.waveClearBonus,
      bossPulse: false,
    };

    if (this.waveState === "countdown") {
      this.waveCountdown = Math.max(0, this.waveCountdown - dt);
      events.waveCountdown = this.waveCountdown;
      if (this.waveCountdown <= 0) {
        const nextIndex = this.pendingWaveIndex ?? this.waveIndex + 1;
        this._primeWave(nextIndex);
        events.waveAdvanced = true;
        events.waveState = this.waveState;
      }
      return events;
    }

    if (!this.running || this.complete || this.failed) {
      return events;
    }

    this.waveTimer += dt;
    const bossEnemy = this.enemies.find((enemy) => !enemy.dead && enemy.isBoss) ?? null;
    const currentWave = this.waves[this.waveIndex] ?? null;
    const disruptionSource = bossEnemy?.disruption ?? findWaveBossAction(currentWave)?.disruption ?? null;
    const bossFields = buildBossFields(pathfinder, disruptionSource, bossEnemy, this.waveTimer);
    if (pathfinder?.setTransientFields) {
      pathfinder.setTransientFields(bossFields);
    }
    this.bossWaveActive = Boolean(bossEnemy);
    if (bossEnemy && disruptionSource) {
      const phaseSeconds = Math.max(1, disruptionSource.pulseSeconds ?? 2.5);
      const phase = Math.floor(this.waveTimer / phaseSeconds) % 4;
      if (this.disruptionPhase !== phase) {
        events.bossPulse = this.disruptionPhase >= 0;
        this.disruptionPhase = phase;
      }
    } else {
      this.disruptionPhase = -1;
    }

    while (this.spawnQueue.length > 0 && this.spawnQueue[0].at <= this.waveTimer + 1e-6) {
      const command = this.spawnQueue.shift();
      const spawned = this._spawnEnemy(pathfinder, command);
      if (spawned) {
        events.spawned += 1;
        events.spawnedEnemies.push(spawned);
        this.spawnedThisWave += 1;
      }
    }

    for (const enemy of this.enemies) {
      enemy.auraShield = 0;
    }

    const projectors = this.enemies.filter((enemy) => !enemy.dead && enemy.shieldAuraRadius > 0);
    for (const projector of projectors) {
      for (const enemy of this.enemies) {
        if (enemy.dead) {
          continue;
        }

        const distance = Math.hypot(projector.x - enemy.x, projector.y - enemy.y);
        if (distance > projector.shieldAuraRadius) {
          continue;
        }

        const falloff = Math.max(0.15, 1 - distance / projector.shieldAuraRadius);
        const aura = (projector.shieldAuraStrength ?? 0) * 40 * falloff;
        enemy.auraShield = Math.max(enemy.auraShield ?? 0, aura);
      }
    }

    for (const enemy of this.enemies) {
      if (enemy.dead) {
        continue;
      }

      enemy.pathAge += dt;
      enemy.hitFlash = Math.max(0, enemy.hitFlash - dt * 4);

      if (enemy.markTimer > 0) {
        enemy.markTimer = Math.max(0, enemy.markTimer - dt);
        if (enemy.markTimer === 0 && enemy.effects?.mark) {
          enemy.effects.mark = null;
        }
      }

      if (enemy.exposedTimer > 0) {
        enemy.exposedTimer = Math.max(0, enemy.exposedTimer - dt);
        if (enemy.exposedTimer === 0 && enemy.effects?.exposed) {
          enemy.effects.exposed = null;
        }
      }

      if (enemy.slowTimer > 0) {
        enemy.slowTimer = Math.max(0, enemy.slowTimer - dt);
        if (enemy.slowTimer === 0) {
          enemy.slowFactor = 1;
        }
      }

      if (enemy.burnTimer > 0) {
        const tick = Math.min(enemy.burnTimer, dt);
        enemy.burnTimer = Math.max(0, enemy.burnTimer - dt);
        enemy.health -= enemy.burnDps * tick;
        enemy.hitFlash = Math.max(enemy.hitFlash, 0.1);
      }

      if (enemy.shield > 0 && enemy.exposedTimer > 0) {
        enemy.shield = Math.max(0, enemy.shield - dt * 2.5);
      }

      if (enemy.health <= 0) {
        enemy.dead = true;
        this.kills += 1;
        events.destroyed += 1;
        events.destroyedEnemies.push(enemy);
        events.energyGain += enemy.reward ?? 0;
        events.energyGain += enemy.shardEnergy ?? 0;
        if (Array.isArray(enemy.deathSpawn) && enemy.deathSpawn.length > 0) {
          let orbitIndex = 0;
          for (const entry of enemy.deathSpawn) {
            const count = Math.max(0, entry.count ?? 0);
            for (let index = 0; index < count; index += 1) {
              const angle = ((orbitIndex + index) / Math.max(1, count)) * Math.PI * 2;
              const radius = 8 + index * 1.4;
              const childPoint = {
                x: enemy.x + Math.cos(angle) * radius,
                y: enemy.y + Math.sin(angle) * radius,
              };
              const spawned = this._spawnEnemy(pathfinder, {
                kind: entry.kind,
                spawnPoint: null,
              });
              if (spawned) {
                spawned.x = childPoint.x;
                spawned.y = childPoint.y;
                spawned.path = pathfinder.findPathFromPoint(childPoint, pathfinder.goal);
                if (spawned.path.length > 0) {
                  spawned.pathRevision = pathfinder.getRevision();
                  spawned.pathIndex = 0;
                  spawned.pathAge = 0;
                  spawned.currentCell = spawned.path[0].cell ? { ...spawned.path[0].cell } : null;
                  events.spawned += 1;
                  events.spawnedEnemies.push(spawned);
                } else {
                  spawned.dead = true;
                }
              }
            }
            orbitIndex += count;
          }
        }
        continue;
      }

      if (enemy.pathRevision !== pathfinder.getRevision() || enemy.pathAge > 1.35 || enemy.pathIndex >= enemy.path.length - 1) {
        this._repathEnemy(enemy, pathfinder);
      }

      this._moveEnemy(enemy, dt, pathfinder);

      if (!enemy.dead && enemy.pathIndex >= enemy.path.length - 1) {
        const endPoint = enemy.path[enemy.path.length - 1];
        const distanceToEnd = Math.hypot(enemy.x - endPoint.x, enemy.y - endPoint.y);
        if (distanceToEnd <= pathfinder.getCellSize() * 0.1) {
          enemy.dead = true;
          this.lives = Math.max(0, this.lives - 1);
          this.waveLeakCount += 1;
          events.leaked += 1;
          events.leakedEnemies.push(enemy);
        }
      }
    }

    this.enemies = this.enemies.filter((enemy) => !enemy.dead);

    const waveFinished = this.spawnQueue.length === 0 && this.enemies.length === 0;
    if (waveFinished) {
      events.waveComplete = true;
      this.clearedWaves = Math.max(this.clearedWaves, this.waveIndex + 1);
      if (this.waveLeakCount === 0) {
        const clearBonus = 10 + this.waveIndex * 2;
        this.waveClearBonus = clearBonus;
        events.energyGain += clearBonus;
      }

      const nextIndex = this.waveIndex + 1;
      if (nextIndex >= this.waves.length) {
        this.complete = true;
        this.running = false;
        this.waveState = "complete";
      } else {
        this.pendingWaveIndex = nextIndex;
        this.waveCountdown = 5;
        this.waveState = "countdown";
        events.waveCountdown = this.waveCountdown;
      }
    }

    events.waveState = this.waveState;
    events.bossActive = Boolean(bossEnemy);
    events.waveClearBonus = this.waveClearBonus;
    return events;
  }

  draw(ctx, assets) {
    for (const enemy of this.enemies) {
      const size = enemy.radius * 2;
      const drawX = enemy.x - enemy.radius;
      const drawY = enemy.y - enemy.radius;

      ctx.save();
      ctx.translate(enemy.x, enemy.y);

      ctx.fillStyle = enemy.tint;
      ctx.globalAlpha = enemy.isBoss ? 0.28 : 0.2;
      ctx.beginPath();
      ctx.arc(0, 0, enemy.radius * (enemy.isBoss ? 2.1 : 1.65), 0, Math.PI * 2);
      ctx.fill();

      if (enemy.shield > 0) {
        const shieldRatio = enemy.maxShield > 0 ? enemy.shield / enemy.maxShield : 1;
        ctx.strokeStyle = `rgba(255, 223, 122, ${0.25 + shieldRatio * 0.5})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, enemy.radius + 8 + shieldRatio * 8, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (enemy.isBoss) {
        ctx.strokeStyle = "rgba(191, 252, 255, 0.8)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, enemy.radius + 14, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (enemy.traits?.phaseShift) {
        ctx.strokeStyle = "rgba(156, 230, 255, 0.72)";
        ctx.lineWidth = enemy.isBoss ? 2.4 : 1.5;
        ctx.setLineDash(enemy.isBoss ? [12, 8] : [8, 6]);
        ctx.beginPath();
        ctx.arc(0, 0, enemy.radius + (enemy.isBoss ? 20 : 11), 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      if (enemy.traits?.mirrorCaster) {
        ctx.strokeStyle = "rgba(215, 247, 255, 0.56)";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(0, -enemy.radius - 7);
        ctx.lineTo(enemy.radius + 7, 0);
        ctx.lineTo(0, enemy.radius + 7);
        ctx.lineTo(-enemy.radius - 7, 0);
        ctx.closePath();
        ctx.stroke();
      }

      if (assets?.hologramCore) {
        ctx.globalAlpha = 0.95;
        ctx.drawImage(assets.hologramCore, -size * 0.45, -size * 0.45, size * 0.9, size * 0.9);
      } else {
        ctx.globalAlpha = 1;
        ctx.fillStyle = "rgba(255, 255, 255, 0.88)";
        ctx.beginPath();
        ctx.arc(0, 0, enemy.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      if (enemy.burnTimer > 0) {
        ctx.strokeStyle = "rgba(255, 174, 87, 0.95)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, enemy.radius + (enemy.isBoss ? 8 : 4), 0, Math.PI * 2);
        ctx.stroke();
      }

      if (enemy.slowTimer > 0) {
        ctx.strokeStyle = "rgba(125, 141, 255, 0.95)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, enemy.radius + (enemy.isBoss ? 12 : 8), 0, Math.PI * 2);
        ctx.stroke();
      }

      if (enemy.effects?.mark) {
        ctx.strokeStyle = "rgba(255, 223, 122, 0.82)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, enemy.radius + 4, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (enemy.exposedTimer > 0) {
        ctx.strokeStyle = "rgba(211, 140, 255, 0.9)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, enemy.radius + 2, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (enemy.hitFlash > 0) {
        ctx.globalAlpha = Math.min(1, enemy.hitFlash * 4);
        ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
        ctx.beginPath();
        ctx.arc(0, 0, enemy.radius * 0.65, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();

      const barWidth = enemy.radius * 2.2;
      const barHeight = 5;
      const healthRatio = Math.max(0, enemy.health) / enemy.maxHealth;
      ctx.save();
      ctx.translate(drawX, drawY - 12);
      ctx.fillStyle = "rgba(4, 10, 18, 0.72)";
      ctx.fillRect(0, 0, barWidth, barHeight);
      ctx.fillStyle = healthRatio > 0.5 ? "#7df3ff" : healthRatio > 0.25 ? "#ffae57" : "#ff6f7d";
      ctx.fillRect(0, 0, barWidth * healthRatio, barHeight);
      ctx.restore();
    }
  }

  getEnemies() {
    return this.enemies;
  }

  isComplete() {
    return this.complete;
  }

  getWaveInfo() {
    const currentWave = this.waves[this.waveIndex] ?? null;
    const nextWave = this.waves[this.waveIndex + 1] ?? null;
    const bossActive = this.enemies.some((enemy) => enemy.isBoss);
    const previewWave = this.waveState === "countdown" ? nextWave : currentWave;
    const enemyTraits = [...new Set([
      ...this.enemies.map((enemy) => enemy.label),
      ...(previewWave?.actions ?? []).flatMap((action) => {
        if (action.type === "mix") {
          return (action.groups ?? []).map((group) => getKindDefinition(group.kind).label ?? group.kind);
        }
        if (action.kind) {
          return [getKindDefinition(action.kind).label ?? action.kind];
        }
        return [];
      }),
    ])].slice(0, 5);

    return {
      wave: Math.min(this.waveIndex + 1, this.waves.length),
      totalWaves: this.waves.length,
      waveName: currentWave?.name ?? "Complete",
      nextWaveName: nextWave?.name ?? null,
      remainingInWave: this.spawnQueue.length + this.enemies.length,
      spawnedThisWave: this.spawnedThisWave,
      lives: this.lives,
      maxLives: this.maxLives,
      clearedWaves: this.clearedWaves,
      kills: this.kills,
      complete: this.complete,
      waveState: this.waveState,
      countdown: this.waveState === "countdown" ? this.waveCountdown : 0,
      bossActive,
      bossWave: Boolean(currentWave?.boss || (currentWave?.actions ?? []).some((action) => isBossKind(action.kind))),
      briefing: currentWave?.briefing ?? null,
      nextBriefing: nextWave?.briefing ?? null,
      enemyTraits,
      spawnPoints: collectWaveSpawnPoints(previewWave?.actions ?? []),
      waveClearBonus: this.waveClearBonus,
    };
  }

  getPreviewPaths(pathfinder) {
    const previewWave = this.waveState === "countdown"
      ? this.waves[this.pendingWaveIndex ?? this.waveIndex + 1] ?? null
      : this.waves[this.waveIndex] ?? null;

    return collectWaveSpawnPoints(previewWave?.actions ?? []).map((spawnPoint) => {
      const entry = pathPointAtSpawn(pathfinder, spawnPoint);
      return {
        spawnPoint,
        spawn: entry.spawn,
        path: pathfinder.findPath(entry.spawn, entry.goal),
      };
    }).filter((entry) => entry.path.length > 0);
  }
}
