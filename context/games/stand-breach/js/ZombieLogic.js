(() => {
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const ZOMBIE_TYPES = [
  { id: "shambler", label: "Shambler", speed: 52, hp: 62, reward: 8, weight: 0.5, width: 42, height: 70, color: "#76e79a" },
  { id: "runner", label: "Runner", speed: 86, hp: 38, reward: 10, weight: 0.26, width: 34, height: 60, color: "#b5f27a" },
  { id: "brute", label: "Brute", speed: 34, hp: 126, reward: 16, weight: 0.16, width: 54, height: 88, color: "#7fd3ff" },
  { id: "alpha", label: "Alpha", speed: 66, hp: 90, reward: 20, weight: 0.08, width: 46, height: 78, color: "#ffb86b" }
];

function normalize(x, y) {
  const length = Math.hypot(x, y);
  if (!length) {
    return { x: 0, y: 0, length: 0 };
  }
  return { x: x / length, y: y / length, length };
}

function resolveSegments(barricade) {
  if (!barricade) {
    return [];
  }
  if (Array.isArray(barricade)) {
    return barricade;
  }
  if (typeof barricade.getSegments === "function") {
    const segments = barricade.getSegments();
    return Array.isArray(segments) ? segments : [];
  }
  if (Array.isArray(barricade.segments)) {
    return barricade.segments;
  }
  return [];
}

function applySegmentDamage(barricade, segment, amount) {
  if (!segment) {
    return false;
  }
  if (typeof barricade?.damageSegment === "function") {
    barricade.damageSegment(segment, amount);
    return true;
  }
  if (typeof barricade?.applyDamage === "function") {
    barricade.applyDamage(segment.id, amount);
    return true;
  }
  if (typeof segment.hp === "number") {
    segment.hp = clamp(segment.hp - amount, 0, segment.maxHp ?? segment.hp);
    segment.broken = segment.hp <= 0;
    return true;
  }
  return false;
}

function segmentCenter(segment) {
  return {
    x: (segment.x ?? 0) + (segment.width ?? 0) / 2,
    y: (segment.y ?? 0) + (segment.height ?? 0) / 2
  };
}

class ZombieLogic {
  constructor(options = {}) {
    this.options = {
      separationRadius: options.separationRadius ?? 92,
      cohesionRadius: options.cohesionRadius ?? 150,
      maxZombies: options.maxZombies ?? 120,
      attackRange: options.attackRange ?? 26,
      attackInterval: options.attackInterval ?? 0.55,
      targetLerp: options.targetLerp ?? 0.12,
      baseSpawn: options.baseSpawn ?? 1.65,
      minSpawn: options.minSpawn ?? 0.42
    };
    this.zombies = [];
    this.waveIndex = 0;
    this.nextId = 0;
  }

  clear() {
    this.zombies.length = 0;
    this.waveIndex = 0;
    this.nextId = 0;
  }

  getZombies() {
    return this.zombies;
  }

  getDamagePulse(zombie) {
    if (!zombie || !zombie.maxHp) {
      return 0;
    }
    return clamp(1 - zombie.hp / zombie.maxHp, 0, 1);
  }

  _pickType(difficulty = 1) {
    const weights = ZOMBIE_TYPES.map((entry) => {
      const bias = entry.id === "runner" ? difficulty * 0.05 : 0;
      const heavyBias = (entry.id === "brute" || entry.id === "alpha") ? Math.max(0, difficulty - 1) * 0.08 : 0;
      return { ...entry, weight: Math.max(0.01, entry.weight + bias + heavyBias) };
    });
    const total = weights.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = Math.random() * total;
    for (const entry of weights) {
      roll -= entry.weight;
      if (roll <= 0) {
        return entry;
      }
    }
    return weights[0];
  }

  _createZombie(position = {}, difficulty = 1, lane = 0) {
    const type = position.type
      ? (ZOMBIE_TYPES.find((entry) => entry.id === position.type) ?? this._pickType(difficulty))
      : this._pickType(difficulty);
    const scale = Math.max(0.7, difficulty);
    const nightScale = 1 + Math.max(0, difficulty - 1) * 0.22;
    const maxHp = Math.round(type.hp * scale * nightScale);
    return {
      id: `z-${++this.nextId}`,
      type: type.id,
      label: type.label,
      x: position.x ?? 0,
      y: position.y ?? 0,
      vx: position.vx ?? -type.speed,
      vy: position.vy ?? 0,
      lane,
      width: type.width,
      height: type.height,
      baseSpeed: type.speed,
      speed: type.speed * (0.92 + scale * 0.08) * (1 + Math.max(0, difficulty - 1) * 0.18),
      hp: maxHp,
      maxHp,
      reward: Math.round(type.reward * (1 + Math.max(0, difficulty - 1) * 0.25)),
      attack: 8 + Math.round(scale * 1.5) + (type.id === "brute" ? 6 : 0),
      attackInterval: clamp(this.options.attackInterval - Math.max(0, difficulty - 1) * 0.07, 0.2, 1),
      attackTimer: 0,
      aggression: clamp(0.5 + Math.max(0, difficulty - 1) * 0.22, 0.5, 2.4),
      separation: 0,
      cohesion: 0,
      alignment: 0,
      wobble: Math.random() * Math.PI * 2,
      rage: 0,
      blocked: false,
      dead: false,
      deathReward: 0,
      state: "alive",
      lastHitAt: 0,
      lastAttackAt: 0
    };
  }

  spawnWave(count, difficulty = 1) {
    const created = [];
    const waveSize = Math.max(0, Math.floor(count));
    if (!waveSize) {
      return created;
    }
    for (let index = 0; index < waveSize && this.zombies.length < this.options.maxZombies; index += 1) {
      const type = this._pickType(difficulty);
      const offset = index - (waveSize - 1) / 2;
      const x = 1320 + this.waveIndex * 36 + index * 24 + Math.random() * 50;
      const y = 360 + offset * 22 + Math.random() * 26;
      const zombie = this._createZombie({ x, y, vx: -type.speed * (0.9 + Math.random() * 0.14), type: type.id }, difficulty, index % 3);
      this.zombies.push(zombie);
      created.push(zombie);
    }
    this.waveIndex += 1;
    return created;
  }

  createZombie(options = {}) {
    const difficulty = options.difficulty ?? 1;
    const zombie = this._createZombie(options, difficulty, options.lane ?? 0);
    this.zombies.push(zombie);
    return zombie;
  }

  getSpawnInterval({ day = 1, night = 0, pressure = 0 } = {}) {
    const dayFactor = Math.pow(0.93, Math.max(0, day - 1));
    const nightFactor = 1 + night * 0.68;
    const pressureFactor = 1 + clamp(pressure * 0.03, 0, 0.75);
    return clamp(this.options.baseSpawn * dayFactor * pressureFactor / nightFactor, this.options.minSpawn, 2.8);
  }

  _resolveDifficulty(dayCycle) {
    if (dayCycle && typeof dayCycle.getDifficultyMultiplier === "function") {
      return Math.max(1, dayCycle.getDifficultyMultiplier());
    }
    if (dayCycle && typeof dayCycle.night === "number") {
      return 1 + dayCycle.night * 0.7;
    }
    return 1;
  }

  _resolveTarget(player, barricade, zombie) {
    const segments = resolveSegments(barricade);
    const liveSegments = segments.filter((segment) => !segment.broken);
    if (!liveSegments.length) {
      return player ?? { x: zombie.x - 100, y: zombie.y };
    }

    let closest = liveSegments[0];
    let closestDistance = Infinity;
    for (const segment of liveSegments) {
      const center = segmentCenter(segment);
      const distance = Math.abs(center.x - zombie.x) + Math.abs(center.y - zombie.y) * 0.45;
      if (distance < closestDistance) {
        closestDistance = distance;
        closest = segment;
      }
    }
    return segmentCenter(closest);
  }

  _barricadeBlocked(zombie, barricade, target) {
    const segments = resolveSegments(barricade);
    for (const segment of segments) {
      if (!segment || segment.broken) {
        continue;
      }
      const left = segment.x ?? 0;
      const right = left + (segment.width ?? 0);
      const top = segment.y ?? 0;
      const bottom = top + (segment.height ?? 0);
      const inLane = zombie.y >= top - zombie.height * 0.2 && zombie.y <= bottom + zombie.height * 0.2;
      if (inLane && zombie.x <= right + this.options.attackRange && zombie.x >= left - 60) {
        return segment;
      }
      if (target && Math.abs(target.x - zombie.x) < 40 && zombie.x <= right + 10) {
        return segment;
      }
    }
    return null;
  }

  _separationAndAlignment(zombie, index, zombies, difficulty) {
    const separationRadius = this.options.separationRadius + difficulty * 8;
    const cohesionRadius = this.options.cohesionRadius + difficulty * 12;
    let separationX = 0;
    let separationY = 0;
    let cohesionX = 0;
    let cohesionY = 0;
    let alignmentX = 0;
    let alignmentY = 0;
    let count = 0;

    for (let otherIndex = 0; otherIndex < zombies.length; otherIndex += 1) {
      if (otherIndex === index) {
        continue;
      }
      const other = zombies[otherIndex];
      if (other.dead) {
        continue;
      }
      const dx = zombie.x - other.x;
      const dy = zombie.y - other.y;
      const distance = Math.hypot(dx, dy);
      if (!distance || distance > cohesionRadius) {
        continue;
      }
      count += 1;
      cohesionX += other.x;
      cohesionY += other.y;
      alignmentX += other.vx ?? 0;
      alignmentY += other.vy ?? 0;
      if (distance < separationRadius) {
        const scale = 1 / Math.max(1, distance * distance);
        separationX += dx * scale * 2200;
        separationY += dy * scale * 2200;
      }
    }

    if (!count) {
      return {
        separationX: 0,
        separationY: 0,
        cohesionX: 0,
        cohesionY: 0,
        alignmentX: 0,
        alignmentY: 0
      };
    }

    return {
      separationX,
      separationY,
      cohesionX: cohesionX / count,
      cohesionY: cohesionY / count,
      alignmentX: alignmentX / count,
      alignmentY: alignmentY / count
    };
  }

  applyDamage(zombieId, amount) {
    const zombie = this.zombies.find((entry) => entry.id === zombieId && !entry.dead);
    if (!zombie) {
      return { zombie: null, hit: false, killed: false, reward: 0 };
    }
    const damage = Math.max(0, amount ?? 0);
    zombie.hp = clamp(zombie.hp - damage, 0, zombie.maxHp);
    zombie.lastHitAt += 1;
    zombie.rage = clamp(zombie.rage + damage / Math.max(20, zombie.maxHp), 0, 2.5);
    if (zombie.hp <= 0) {
      zombie.dead = true;
      zombie.state = "dead";
      zombie.deathReward = zombie.reward;
      return { zombie, hit: true, killed: true, reward: zombie.reward };
    }
    return { zombie, hit: true, killed: false, reward: 0 };
  }

  update(dt, player = {}, barricade, dayCycle) {
    const difficulty = this._resolveDifficulty(dayCycle);
    const now = typeof dayCycle?.time === "number" ? dayCycle.time : 0;
    const attacks = [];
    const deaths = [];
    const rewards = [];
    const aliveZombies = [];
    const playerTarget = {
      x: player.x ?? 0,
      y: player.y ?? 0
    };

    for (let index = 0; index < this.zombies.length; index += 1) {
      const zombie = this.zombies[index];
      if (zombie.dead) {
        if (zombie.deathReward > 0) {
          rewards.push({ zombieId: zombie.id, reward: zombie.deathReward });
          zombie.deathReward = 0;
        }
        continue;
      }

      const target = this._resolveTarget(playerTarget, barricade, zombie);
      const blockedSegment = this._barricadeBlocked(zombie, barricade, target);
      const neighborhood = this._separationAndAlignment(zombie, index, this.zombies, difficulty);
      const toTarget = normalize(target.x - zombie.x, target.y - zombie.y);
      const cohesion = normalize(neighborhood.cohesionX - zombie.x, neighborhood.cohesionY - zombie.y);
      const alignment = normalize(neighborhood.alignmentX, neighborhood.alignmentY);

      const aggressionBoost = 1 + Math.max(0, difficulty - 1) * 0.28 + zombie.rage * 0.12;
      const desiredSpeed = zombie.speed * aggressionBoost;
      const steerX = toTarget.x * 1.2 + cohesion.x * 0.28 + alignment.x * 0.12 + neighborhood.separationX * 0.0005;
      const steerY = toTarget.y * 1.2 + cohesion.y * 0.28 + alignment.y * 0.12 + neighborhood.separationY * 0.0005;
      const steering = normalize(steerX, steerY);

      zombie.blocked = Boolean(blockedSegment);
      zombie.attackTimer = Math.max(0, zombie.attackTimer - dt * 0.15);
      zombie.wobble += dt * (2.2 + zombie.aggression * 0.4);

      if (blockedSegment) {
        const center = segmentCenter(blockedSegment);
        const dx = center.x - zombie.x;
        const dy = center.y - zombie.y;
        const blockedDirection = normalize(dx, dy);
        zombie.vx += (blockedDirection.x * desiredSpeed * 0.1 - zombie.vx) * 0.12;
        zombie.vy += (blockedDirection.y * desiredSpeed * 0.1 - zombie.vy) * 0.12;
        zombie.attackTimer += dt * (1 + zombie.aggression * 0.3);
        if (zombie.attackTimer >= zombie.attackInterval) {
          zombie.attackTimer = 0;
          const damage = zombie.attack * (0.9 + (difficulty - 1) * 0.35);
          applySegmentDamage(barricade, blockedSegment, damage);
          attacks.push({
            zombieId: zombie.id,
            segmentId: blockedSegment.id ?? null,
            damage,
            time: now
          });
        }
      } else {
        zombie.vx += (steering.x * desiredSpeed - zombie.vx) * this.options.targetLerp;
        zombie.vy += (steering.y * desiredSpeed * 0.18 - zombie.vy) * this.options.targetLerp;
      }

      zombie.x += zombie.vx * dt;
      zombie.y += (zombie.vy + Math.sin(zombie.wobble) * (3 + zombie.rage * 2)) * dt;
      zombie.separation = Math.abs(neighborhood.separationX) + Math.abs(neighborhood.separationY);
      zombie.cohesion = Math.hypot(neighborhood.cohesionX - zombie.x, neighborhood.cohesionY - zombie.y);
      zombie.alignment = Math.hypot(neighborhood.alignmentX, neighborhood.alignmentY);

      if (player && typeof player.x === "number") {
        const playerDistance = Math.hypot(player.x - zombie.x, (player.y ?? zombie.y) - zombie.y);
        if (playerDistance < 52) {
          zombie.rage = clamp(zombie.rage + dt * 0.18, 0, 3);
        }
      }

      if (zombie.hp <= 0) {
        zombie.dead = true;
        zombie.state = "dead";
        zombie.deathReward = zombie.reward;
        deaths.push({
          zombieId: zombie.id,
          reward: zombie.reward,
          type: zombie.type
        });
        rewards.push({ zombieId: zombie.id, reward: zombie.reward });
        continue;
      }

      if (zombie.x > -200 && zombie.y > -120 && zombie.y < 1400) {
        aliveZombies.push(zombie);
      }
    }

    this.zombies = aliveZombies.concat(this.zombies.filter((zombie) => zombie.dead));
    return {
      zombies: this.zombies,
      alive: aliveZombies.length,
      deaths,
      attacks,
      rewards,
      difficulty
    };
  }

  draw(ctx) {
    if (!ctx) {
      return;
    }
    for (const zombie of this.zombies) {
      if (zombie.dead) {
        continue;
      }
      const pulse = this.getDamagePulse(zombie);
      ctx.save();
      ctx.translate(zombie.x, zombie.y);
      ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
      ctx.beginPath();
      ctx.ellipse(0, zombie.height * 0.25, zombie.width * 0.34, zombie.height * 0.15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = zombie.color;
      ctx.globalAlpha = 0.92;
      ctx.fillRect(-zombie.width / 2, -zombie.height / 2, zombie.width, zombie.height);
      ctx.fillStyle = "rgba(10, 16, 22, 0.82)";
      ctx.fillRect(-zombie.width / 2 + 6, -zombie.height / 2 + 10, zombie.width - 12, zombie.height - 20);
      ctx.fillStyle = `rgba(255, 255, 255, ${0.08 + pulse * 0.12})`;
      ctx.fillRect(-zombie.width / 2, zombie.height / 2 - 10, zombie.width * pulse, 4);
      ctx.fillStyle = `rgba(255, 110, 92, ${0.22 + zombie.rage * 0.45})`;
      ctx.fillRect(-zombie.width / 2 + 8, -zombie.height / 2 + 6, zombie.width - 16, 4);
      ctx.restore();
    }
  }
}

window.StandBreach = window.StandBreach || {};
window.StandBreach.ZombieLogic = ZombieLogic;
})();
