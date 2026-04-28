import {
  BLOON_TYPES,
  HEIGHT,
  INTERMISSION_TIME,
  PATH_POINTS,
  PLACEMENT_MARGIN,
  STARTING_CASH,
  STARTING_LIVES,
  TOWER_DEFS,
  TOWER_SPACING,
  WAVES,
  WIDTH,
} from "./data.js";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function buildPathData() {
  const segments = [];
  let totalLength = 0;
  for (let i = 0; i < PATH_POINTS.length - 1; i += 1) {
    const start = PATH_POINTS[i];
    const end = PATH_POINTS[i + 1];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    segments.push({
      start,
      end,
      dx,
      dy,
      length,
      startDistance: totalLength,
    });
    totalLength += length;
  }
  return { segments, totalLength };
}

const PATH = buildPathData();

function pointAtDistance(distance) {
  const capped = clamp(distance, 0, PATH.totalLength);
  for (const segment of PATH.segments) {
    if (capped <= segment.startDistance + segment.length) {
      const t = segment.length === 0 ? 0 : (capped - segment.startDistance) / segment.length;
      return {
        x: segment.start.x + segment.dx * t,
        y: segment.start.y + segment.dy * t,
        dx: segment.length === 0 ? 0 : segment.dx / segment.length,
        dy: segment.length === 0 ? 0 : segment.dy / segment.length,
      };
    }
  }
  const last = PATH.segments[PATH.segments.length - 1];
  return {
    x: last.end.x,
    y: last.end.y,
    dx: last.length === 0 ? 0 : last.dx / last.length,
    dy: last.length === 0 ? 0 : last.dy / last.length,
  };
}

function distanceToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }
  const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy), 0, 1);
  const px = start.x + dx * t;
  const py = start.y + dy * t;
  return Math.hypot(point.x - px, point.y - py);
}

function distanceToPath(point) {
  let best = Number.POSITIVE_INFINITY;
  for (const segment of PATH.segments) {
    best = Math.min(best, distanceToSegment(point, segment.start, segment.end));
  }
  return best;
}

function makeTower(defId, x, y) {
  const def = TOWER_DEFS[defId];
  return {
    id: `${defId}-${Math.random().toString(36).slice(2, 8)}`,
    type: defId,
    x,
    y,
    cooldown: 0,
  };
}

function makeBloon(typeId) {
  const def = BLOON_TYPES[typeId];
  const point = pointAtDistance(0);
  return {
    id: `bloon-${Math.random().toString(36).slice(2, 8)}`,
    type: typeId,
    x: point.x,
    y: point.y,
    dirX: point.dx,
    dirY: point.dy,
    distance: 0,
    hp: def.hp,
    maxHp: def.hp,
    slowedUntil: 0,
    dead: false,
  };
}

function makeProjectile(tower, target, intercept) {
  const def = TOWER_DEFS[tower.type];
  const dx = intercept.x - tower.x;
  const dy = intercept.y - tower.y;
  const length = Math.hypot(dx, dy) || 1;
  return {
    x: tower.x,
    y: tower.y,
    vx: (dx / length) * def.projectileSpeed,
    vy: (dy / length) * def.projectileSpeed,
    type: tower.type,
    damage: def.damage,
    splash: def.splash || 0,
    slowFactor: def.slowFactor || 1,
    slowDuration: def.slowDuration || 0,
    radius: def.projectileRadius,
    color: def.projectileColor,
    targetId: target.id,
    ttl: 2.4,
  };
}

export class Game {
  constructor() {
    this.restart();
  }

  restart() {
    this.mode = "menu";
    this.cash = STARTING_CASH;
    this.lives = STARTING_LIVES;
    this.waveIndex = 0;
    this.pops = 0;
    this.time = 0;
    this.towers = [];
    this.bloons = [];
    this.projectiles = [];
    this.effects = [];
    this.selectedTowerId = "dart";
    this.preview = { x: WIDTH * 0.5, y: HEIGHT * 0.5, valid: false, reason: "Move over grass." };
    this.wavePlan = [];
    this.waveCursor = 0;
    this.spawnCooldown = 0;
    this.waveActive = false;
    this.intermission = INTERMISSION_TIME;
    this.speedIndex = 0;
    this.speedMultipliers = [1, 2, 3];
    this.status = "Build your lane before releasing the first bloons.";
  }

  start() {
    if (this.mode === "menu") {
      this.mode = "playing";
    }
  }

  toggleSpeed() {
    this.speedIndex = (this.speedIndex + 1) % this.speedMultipliers.length;
  }

  requestNextWave() {
    if (this.mode !== "playing" || this.waveActive || this.waveIndex >= WAVES.length) {
      return;
    }
    this.launchWave();
  }

  selectTower(id) {
    if (TOWER_DEFS[id]) {
      this.selectedTowerId = id;
      this.updatePreview(this.preview.x, this.preview.y);
    }
  }

  updatePreview(x, y) {
    const placement = this.getPlacementState(x, y, this.selectedTowerId);
    this.preview = { x, y, valid: placement.valid, reason: placement.reason };
  }

  tryPlaceSelectedTower(x, y) {
    if (this.mode !== "playing") {
      return;
    }
    const placement = this.getPlacementState(x, y, this.selectedTowerId);
    if (!placement.valid) {
      this.status = placement.reason;
      return;
    }
    const def = TOWER_DEFS[this.selectedTowerId];
    this.cash -= def.cost;
    this.towers.push(makeTower(this.selectedTowerId, x, y));
    this.status = `${def.name} placed.`;
    this.updatePreview(x, y);
  }

  getPlacementState(x, y, towerId) {
    const def = TOWER_DEFS[towerId];
    if (!def) {
      return { valid: false, reason: "Unknown tower." };
    }
    if (x < 52 || x > WIDTH - 52 || y < 52 || y > HEIGHT - 52) {
      return { valid: false, reason: "Stay inside the field." };
    }
    if (this.cash < def.cost) {
      return { valid: false, reason: "Not enough cash." };
    }
    if (distanceToPath({ x, y }) < PLACEMENT_MARGIN) {
      return { valid: false, reason: "Too close to the track." };
    }
    for (const tower of this.towers) {
      if (Math.hypot(tower.x - x, tower.y - y) < TOWER_SPACING) {
        return { valid: false, reason: "Need more tower spacing." };
      }
    }
    return { valid: true, reason: `${def.name} ready.` };
  }

  update(dt) {
    const speed = this.speedMultipliers[this.speedIndex];
    const scaledDt = dt * speed;
    this.time += scaledDt;

    if (this.mode !== "playing") {
      this.tickEffects(scaledDt);
      return;
    }

    if (!this.waveActive && this.waveIndex < WAVES.length) {
      this.intermission = Math.max(0, this.intermission - scaledDt);
      if (this.intermission === 0) {
        this.launchWave();
      }
    }

    this.tickEffects(scaledDt);
    this.spawnBloons(scaledDt);
    this.updateBloons(scaledDt);
    this.updateTowers(scaledDt);
    this.updateProjectiles(scaledDt);
    this.cleanup();
    this.resolveProgress();
  }

  launchWave() {
    const wave = WAVES[this.waveIndex];
    this.wavePlan = [];
    for (const entry of wave.entries) {
      for (let i = 0; i < entry.count; i += 1) {
        this.wavePlan.push({ type: entry.type, delay: entry.spacing });
      }
    }
    this.waveCursor = 0;
    this.spawnCooldown = 0;
    this.waveActive = true;
    this.intermission = 0;
    this.status = `Wave ${this.waveIndex + 1} launched: ${wave.label}.`;
  }

  spawnBloons(dt) {
    if (!this.waveActive) {
      return;
    }
    this.spawnCooldown -= dt;
    while (this.waveCursor < this.wavePlan.length && this.spawnCooldown <= 0) {
      const entry = this.wavePlan[this.waveCursor];
      this.bloons.push(makeBloon(entry.type));
      this.waveCursor += 1;
      this.spawnCooldown += entry.delay;
    }
  }

  updateBloons(dt) {
    for (const bloon of this.bloons) {
      const def = BLOON_TYPES[bloon.type];
      const slowMultiplier = this.time < bloon.slowedUntil ? TOWER_DEFS.glue.slowFactor : 1;
      bloon.distance += def.speed * slowMultiplier * dt;
      if (bloon.distance >= PATH.totalLength) {
        bloon.dead = true;
        this.lives -= def.leak;
        this.status = `${def.id} bloon slipped through.`;
        this.effects.push({
          x: PATH_POINTS[PATH_POINTS.length - 1].x,
          y: PATH_POINTS[PATH_POINTS.length - 1].y,
          radius: 28,
          color: "rgba(255,255,255,0.3)",
          life: 0.3,
          maxLife: 0.3,
        });
        continue;
      }
      const point = pointAtDistance(bloon.distance);
      bloon.x = point.x;
      bloon.y = point.y;
      bloon.dirX = point.dx;
      bloon.dirY = point.dy;
    }
  }

  updateTowers(dt) {
    for (const tower of this.towers) {
      const def = TOWER_DEFS[tower.type];
      tower.cooldown = Math.max(0, tower.cooldown - dt);
      if (tower.cooldown > 0) {
        continue;
      }

      let best = null;
      for (const bloon of this.bloons) {
        if (bloon.dead) {
          continue;
        }
        const dist = Math.hypot(bloon.x - tower.x, bloon.y - tower.y);
        if (dist > def.range) {
          continue;
        }
        if (!best || bloon.distance > best.distance) {
          best = bloon;
        }
      }
      if (!best) {
        continue;
      }

      const estimate = Math.hypot(best.x - tower.x, best.y - tower.y) / def.projectileSpeed;
      const future = pointAtDistance(best.distance + BLOON_TYPES[best.type].speed * estimate);
      this.projectiles.push(makeProjectile(tower, best, future));
      tower.cooldown = def.fireRate;
      this.effects.push({
        x: tower.x,
        y: tower.y,
        radius: 12,
        color: "rgba(255,255,255,0.18)",
        life: 0.16,
        maxLife: 0.16,
      });
    }
  }

  updateProjectiles(dt) {
    for (const projectile of this.projectiles) {
      projectile.x += projectile.vx * dt;
      projectile.y += projectile.vy * dt;
      projectile.ttl -= dt;
      const hit = this.bloons.find(
        (bloon) => !bloon.dead && Math.hypot(bloon.x - projectile.x, bloon.y - projectile.y) <= BLOON_TYPES[bloon.type].radius + projectile.radius
      );
      if (!hit) {
        continue;
      }
      projectile.ttl = 0;
      this.damageBloon(hit, projectile.damage, { x: projectile.x, y: projectile.y });
      if (projectile.splash > 0) {
        this.damageNearby(projectile.x, projectile.y, projectile.splash, projectile.damage);
      }
      if (projectile.slowDuration > 0) {
        hit.slowedUntil = Math.max(hit.slowedUntil, this.time + projectile.slowDuration);
      }
      this.effects.push({
        x: projectile.x,
        y: projectile.y,
        radius: projectile.splash > 0 ? projectile.splash * 0.6 : 20,
        color: projectile.color,
        life: 0.22,
        maxLife: 0.22,
      });
    }
  }

  damageNearby(x, y, radius, damage) {
    for (const bloon of this.bloons) {
      if (bloon.dead) {
        continue;
      }
      if (Math.hypot(bloon.x - x, bloon.y - y) <= radius + BLOON_TYPES[bloon.type].radius) {
        this.damageBloon(bloon, damage, { x, y });
      }
    }
  }

  damageBloon(bloon, damage, source) {
    if (bloon.dead) {
      return;
    }
    bloon.hp -= damage;
    if (bloon.hp > 0) {
      return;
    }
    bloon.dead = true;
    const def = BLOON_TYPES[bloon.type];
    this.cash += def.reward;
    this.pops += 1;
    this.effects.push({
      x: source.x,
      y: source.y,
      radius: def.radius * 1.3,
      color: def.color,
      life: 0.2,
      maxLife: 0.2,
    });
    if (def.volatile) {
      this.status = "Volatile bloon popped. Chain reaction spreading.";
      this.effects.push({
        x: bloon.x,
        y: bloon.y,
        radius: def.blastRadius,
        color: "rgba(255,160,80,0.34)",
        life: 0.34,
        maxLife: 0.34,
      });
      this.damageNearby(bloon.x, bloon.y, def.blastRadius, def.blastDamage);
      return;
    }
    this.status = `${def.id} bloon popped.`;
  }

  cleanup() {
    this.projectiles = this.projectiles.filter(
      (projectile) =>
        projectile.ttl > 0 &&
        projectile.x > -40 &&
        projectile.x < WIDTH + 40 &&
        projectile.y > -40 &&
        projectile.y < HEIGHT + 40
    );
    this.bloons = this.bloons.filter((bloon) => !bloon.dead);
  }

  resolveProgress() {
    if (this.lives <= 0 && this.mode === "playing") {
      this.mode = "lose";
      this.status = "Track collapsed. Press restart and tighten your intercepts.";
      return;
    }

    if (
      this.waveActive &&
      this.waveCursor >= this.wavePlan.length &&
      this.bloons.length === 0
    ) {
      const wave = WAVES[this.waveIndex];
      this.cash += wave.reward;
      this.status = `Wave ${this.waveIndex + 1} cleared. Early payout banked.`;
      this.waveIndex += 1;
      this.waveActive = false;
      this.wavePlan = [];
      this.intermission = INTERMISSION_TIME;
      if (this.waveIndex >= WAVES.length) {
        this.mode = "win";
        this.status = "All waves cleared. The lane stayed sealed.";
      }
    }
  }

  tickEffects(dt) {
    for (const effect of this.effects) {
      effect.life -= dt;
    }
    this.effects = this.effects.filter((effect) => effect.life > 0);
  }

  getFrameState() {
    return {
      mode: this.mode,
      cash: this.cash,
      lives: Math.max(0, this.lives),
      waveNumber: Math.min(this.waveIndex + (this.waveActive ? 1 : 0), WAVES.length),
      waveTotal: WAVES.length,
      pops: this.pops,
      towers: this.towers.map((tower) => ({ ...tower, ...TOWER_DEFS[tower.type] })),
      bloons: this.bloons.map((bloon) => ({ ...bloon, ...BLOON_TYPES[bloon.type] })),
      projectiles: this.projectiles.map((projectile) => ({ ...projectile })),
      effects: this.effects.map((effect) => ({ ...effect })),
      pathPoints: PATH_POINTS.map((point) => ({ ...point })),
      selectedTowerId: this.selectedTowerId,
      preview: {
        ...this.preview,
        range: TOWER_DEFS[this.selectedTowerId].range,
      },
      speedLabel: `${this.speedMultipliers[this.speedIndex]}x`,
      status: this.status,
      nextWaveReady: this.mode === "playing" && !this.waveActive && this.waveIndex < WAVES.length,
      towerDefs: Object.values(TOWER_DEFS).map((tower) => ({ ...tower })),
      overlay: this.getOverlay(),
    };
  }

  getOverlay() {
    if (this.mode === "menu") {
      return {
        eyebrow: "tower defense",
        title: "Bloons Pop-Physics",
        copy: "Intercept the lane with dart, bomb, and glue towers. Chain volatile pops before the leaks reach the gate.",
        button: "Start Run",
      };
    }
    if (this.mode === "win") {
      return {
        eyebrow: "all clear",
        title: "The lane held.",
        copy: "Your chain pops kept the rush under control. Restart for another defense.",
        button: "Restart Run",
      };
    }
    if (this.mode === "lose") {
      return {
        eyebrow: "breach",
        title: "The bloons got through.",
        copy: "Place farther forward, glue fast targets, and use bomb towers around the volatile clusters.",
        button: "Restart Run",
      };
    }
    return null;
  }
}
