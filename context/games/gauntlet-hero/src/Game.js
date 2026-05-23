import {
  DOOR_HEIGHT,
  DOOR_WIDTH,
  ENEMY_RADIUS,
  FLOOR_PALETTES,
  GENERATOR_RADIUS,
  HEIGHT,
  HERO_CLASSES,
  PLAYER_RADIUS,
  RELIC_DEFS,
  ROOM_HEIGHT,
  ROOM_WIDTH,
  VIEW_MARGIN,
  WIDTH,
} from "./data.js";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function makeId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function length(x, y) {
  return Math.hypot(x, y);
}

function normalize(x, y) {
  const len = Math.hypot(x, y) || 1;
  return { x: x / len, y: y / len };
}

function angleBetween(ax, ay, bx, by) {
  const dot = ax * bx + ay * by;
  const mag = Math.max(0.0001, Math.hypot(ax, ay) * Math.hypot(bx, by));
  return Math.acos(clamp(dot / mag, -1, 1));
}

function makeParticle(x, y, color, size, life, vx = 0, vy = 0) {
  return { id: makeId("p"), x, y, color, size, life, maxLife: life, vx, vy };
}

function panFromX(x) {
  return clamp((x / ROOM_WIDTH) * 1.6 - 0.8, -0.8, 0.8);
}

function getHero(classId) {
  return HERO_CLASSES.find((hero) => hero.id === classId) ?? HERO_CLASSES[0];
}

function randomRoomPoint(margin = 120) {
  return {
    x: margin + Math.random() * (ROOM_WIDTH - margin * 2),
    y: margin + Math.random() * (ROOM_HEIGHT - margin * 2),
  };
}

function farFrom(points, candidate, minDistance) {
  return points.every((point) => length(candidate.x - point.x, candidate.y - point.y) >= minDistance);
}

function pickSpawn(points, minDistance, margin = 120) {
  for (let attempts = 0; attempts < 80; attempts += 1) {
    const candidate = randomRoomPoint(margin);
    if (farFrom(points, candidate, minDistance)) {
      return candidate;
    }
  }
  return randomRoomPoint(margin);
}

function pickRelicOptions(takenRelics, floorNumber) {
  const unlocked = RELIC_DEFS.filter((relic) => !takenRelics.some((taken) => taken.id === relic.id));
  const pool = unlocked.length >= 3 ? unlocked : RELIC_DEFS;
  return [...pool]
    .sort(() => Math.random() - 0.5)
    .slice(0, 3)
    .map((relic, index) => ({
      ...relic,
      previewFloor: floorNumber,
      slot: index,
    }));
}

function formatCooldown(value) {
  return `${value.toFixed(2)}s`;
}

function formatScoreMultiplier(value) {
  return `x${value.toFixed(2)}`;
}

function getHeroStatSummary(hero) {
  const parts = [`DMG ${hero.damage}`, `SPD ${hero.speed}`, `CD ${formatCooldown(hero.cooldown)}`];
  if (hero.projectile) {
    parts.push(`PCE ${hero.pierce}`);
  } else {
    parts.push(`RNG ${hero.range}`);
  }
  return parts.join(" | ");
}

function getHeroStatGuide(hero) {
  const attackGuide = hero.projectile
    ? "Damage breaks ghosts and generators faster. Pierce carries shots through packed lanes."
    : "Damage breaks ghosts and generators faster. Range widens safe melee checks.";
  return `${attackGuide} Speed helps kiting. Cooldown lowers time between attacks.`;
}

function getRelicPreviewSummary(relic, hero, game) {
  switch (relic.id) {
    case "iron-bastion":
      return `HP ${hero.maxHp} -> ${hero.maxHp + 40} | heal +40 now`;
    case "ember-core":
      return hero.projectile
        ? `DMG ${hero.damage} -> ${hero.damage + 7} | shot size +3`
        : `DMG ${hero.damage} -> ${hero.damage + 7}`;
    case "wind-sandals":
      return `SPD ${hero.speed} -> ${hero.speed + 26} | CD ${formatCooldown(hero.cooldown)} -> ${formatCooldown(
        Math.max(0.06, hero.cooldown * 0.9)
      )}`;
    case "moon-quiver":
      return hero.projectile
        ? `PCE ${hero.pierce} -> ${hero.pierce + 1}`
        : `RNG ${hero.range} -> ${hero.range + 18}`;
    case "grave-spice":
      return `DMG ${hero.damage} -> ${hero.damage + 3} | gen break heal ${game.generatorBreakHeal} -> ${
        game.generatorBreakHeal + 18
      }`;
    case "oracle-map":
      return `Score ${formatScoreMultiplier(game.scoreMultiplier)} -> ${formatScoreMultiplier(game.scoreMultiplier + 0.18)} | next floor heal +24`;
    default:
      return relic.effectText;
  }
}

function getRelicPickReason(relic, hero) {
  switch (relic.id) {
    case "iron-bastion":
      return "Pick if swarms keep touching you and you need a larger mistake buffer right now.";
    case "ember-core":
      return hero.projectile
        ? "Pick if you want fewer shots per ghost pack and chunkier generator breaks from a safer lane."
        : "Pick if your current melee route feels slow and you want cleaner generator and ghost deletes.";
    case "wind-sandals":
      return "Pick if you want faster kiting, tighter doorway escapes, and more attacks during a chase.";
    case "moon-quiver":
      return hero.projectile
        ? "Pick if ghost packs are stacking and you want one shot to solve a whole lane."
        : "Pick if you want safer melee tags before a swarm can touch you.";
    case "grave-spice":
      return "Pick if generator dives are costing health and you want those commits to pay you back.";
    case "oracle-map":
      return "Pick if the run feels stable and you want score plus a safer next-floor handoff.";
    default:
      return "Pick for the floor plan that matches your current pressure.";
  }
}

export class Game {
  constructor() {
    this.restart();
  }

  restart() {
    this.mode = "menu";
    this.selectedHeroId = HERO_CLASSES[0].id;
    this.totalTime = 0;
    this.floorNumber = 1;
    this.score = 0;
    this.scoreMultiplier = 1;
    this.kills = 0;
    this.generatorsCleared = 0;
    this.activeRelics = [];
    this.currentRelic = null;
    this.chapterTitle = "";
    this.chapterLore = "";
    this.floorOmen = "";
    this.intermission = null;
    this.generatorBreakHeal = 0;
    this.projectileSizeBonus = 0;
    this.nextFloorHeal = 0;
    this.events = [];
    this.screenFx = {
      flash: 0,
      flashColor: "#ffffff",
      shake: 0,
      pulse: 0,
      driftPhase: Math.random() * Math.PI * 2,
    };
    this.statusText = "Pick hero. Clear generators. Find key.";
    this.input = {
      moveX: 0,
      moveY: 0,
      pointerX: WIDTH * 0.5,
      pointerY: HEIGHT * 0.5,
      pointerDown: false,
      attackHeld: false,
    };
    this.camera = { x: ROOM_WIDTH * 0.5, y: ROOM_HEIGHT * 0.5 };
    this.result = null;
    this.resetRunState();
  }

  resetRunState() {
    const hero = getHero(this.selectedHeroId);
    this.hero = {
      ...hero,
      x: ROOM_WIDTH * 0.5,
      y: ROOM_HEIGHT - 140,
      vx: 0,
      vy: 0,
      aimX: 0,
      aimY: -1,
      attackCooldown: 0,
      hurtCooldown: 0,
      hp: hero.hp,
      maxHp: hero.hp,
      facing: -Math.PI * 0.5,
    };
    this.projectiles = [];
    this.enemies = [];
    this.generators = [];
    this.particles = [];
    this.key = null;
    this.door = null;
    this.floorClearAnnounced = false;
    this.spawnFloor(this.floorNumber);
  }

  selectHero(classId) {
    this.selectedHeroId = getHero(classId).id;
    if (this.mode === "menu") {
      this.resetRunState();
    }
  }

  emit(type, extra = {}) {
    this.events.push({ type, ...extra });
  }

  consumeEvents() {
    const events = this.events;
    this.events = [];
    return events;
  }

  flash(color, amount = 0.2) {
    this.screenFx.flash = Math.max(this.screenFx.flash, amount);
    this.screenFx.flashColor = color;
  }

  shake(amount = 1) {
    this.screenFx.shake = Math.max(this.screenFx.shake, amount);
  }

  start() {
    this.floorNumber = 1;
    this.score = 0;
    this.scoreMultiplier = 1;
    this.kills = 0;
    this.generatorsCleared = 0;
    this.totalTime = 0;
    this.activeRelics = [];
    this.currentRelic = null;
    this.intermission = null;
    this.generatorBreakHeal = 0;
    this.projectileSizeBonus = 0;
    this.nextFloorHeal = 0;
    this.result = null;
    this.mode = "playing";
    this.resetRunState();
    this.statusText = "Floor 1. Break generators.";
  }

  restartRun() {
    this.mode = "menu";
    this.result = null;
    this.scoreMultiplier = 1;
    this.activeRelics = [];
    this.currentRelic = null;
    this.intermission = null;
    this.generatorBreakHeal = 0;
    this.projectileSizeBonus = 0;
    this.nextFloorHeal = 0;
    this.statusText = "Pick hero. Push deeper.";
    this.resetRunState();
  }

  chooseRelic(relicId) {
    if (this.mode !== "intermission" || !this.intermission) {
      return;
    }
    const relic = this.intermission.options.find((option) => option.id === relicId);
    if (!relic) {
      return;
    }

    this.applyRelic(relic);
    this.activeRelics.push(relic);
    this.currentRelic = relic;
    this.floorNumber = this.intermission.nextFloorNumber;
    this.mode = "playing";
    this.intermission = null;
    this.flash(this.floorTheme?.accent ?? "#6be0ff", 0.16);
    this.emit("relic-pick", { pan: 0, relicId: relic.id });
    this.spawnFloor(this.floorNumber);
    this.statusText = `${this.chapterTitle}. ${this.floorOmen}`;
  }

  setMove(x, y) {
    this.input.moveX = x;
    this.input.moveY = y;
  }

  setPointer(x, y) {
    this.input.pointerX = x;
    this.input.pointerY = y;
  }

  setPointerDown(active) {
    this.input.pointerDown = active;
  }

  setAttackHeld(active) {
    this.input.attackHeld = active;
  }

  spawnFloor(floorNumber) {
    const palette = FLOOR_PALETTES[(floorNumber - 1) % FLOOR_PALETTES.length];
    const modifier = palette.modifier ?? {};
    const difficulty = floorNumber - 1;
    const playerSpawn = { x: ROOM_WIDTH * 0.5, y: ROOM_HEIGHT - 140 };
    this.hero.x = playerSpawn.x;
    this.hero.y = playerSpawn.y;
    this.hero.vx = 0;
    this.hero.vy = 0;
    this.hero.attackCooldown = 0;
    this.hero.hurtCooldown = 0;

    const anchorPoints = [
      playerSpawn,
      { x: ROOM_WIDTH * 0.5, y: 90 },
      { x: ROOM_WIDTH * 0.5, y: ROOM_HEIGHT * 0.5 },
    ];
    const generatorCount = Math.min(3 + Math.floor(difficulty / 2) + (modifier.extraGenerators ?? 0), 7);
    this.chapterTitle = `${palette.name} - Floor ${floorNumber}`;
    this.chapterLore = palette.lore;
    this.floorOmen = palette.omen;

    this.generators = [];
    for (let i = 0; i < generatorCount; i += 1) {
      const point = pickSpawn(anchorPoints, 210);
      anchorPoints.push(point);
      this.generators.push({
        id: makeId("gen"),
        x: point.x,
        y: point.y,
        hp: 70 + difficulty * 18,
        maxHp: 70 + difficulty * 18,
        spawnTimer: 1 + Math.random() * 1.8,
        pulse: Math.random() * Math.PI * 2,
      });
    }

    this.enemies = [];
    const startingGhosts = 4 + difficulty * 2 + (modifier.startingGhostBonus ?? 0);
    for (let i = 0; i < startingGhosts; i += 1) {
      this.spawnEnemy();
    }

    this.projectiles = [];
    this.particles = [];
    this.key = null;
    this.door = {
      x: ROOM_WIDTH * 0.5,
      y: 62,
      width: DOOR_WIDTH,
      height: DOOR_HEIGHT,
      locked: true,
      threshold: 56,
    };
    this.floorTheme = palette;
    this.floorClearAnnounced = false;
    if (this.nextFloorHeal > 0) {
      this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + this.nextFloorHeal);
      this.nextFloorHeal = 0;
    }
  }

  spawnEnemy(source = null) {
    const difficulty = this.floorNumber - 1;
    const modifier = this.floorTheme?.modifier ?? {};
    const ghostCount = this.enemies.length;
    const maxGhosts = 18 + difficulty * 3;
    if (ghostCount >= maxGhosts) {
      return;
    }

    let point;
    if (source) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 44 + Math.random() * 34;
      point = {
        x: source.x + Math.cos(angle) * radius,
        y: source.y + Math.sin(angle) * radius,
      };
    } else {
      const candidates = [
        { x: 80 + Math.random() * (ROOM_WIDTH - 160), y: 90 },
        { x: 80 + Math.random() * (ROOM_WIDTH - 160), y: ROOM_HEIGHT - 90 },
        { x: 90, y: 80 + Math.random() * (ROOM_HEIGHT - 160) },
        { x: ROOM_WIDTH - 90, y: 80 + Math.random() * (ROOM_HEIGHT - 160) },
      ];
      point = candidates[Math.floor(Math.random() * candidates.length)];
    }

    point.x = clamp(point.x, 40, ROOM_WIDTH - 40);
    point.y = clamp(point.y, 40, ROOM_HEIGHT - 40);

    this.enemies.push({
      id: makeId("ghost"),
      x: point.x,
      y: point.y,
      hp: (24 + difficulty * 7) * (modifier.enemyHpMultiplier ?? 1),
      maxHp: (24 + difficulty * 7) * (modifier.enemyHpMultiplier ?? 1),
      speed: (84 + difficulty * 8 + Math.random() * 18) * (modifier.enemySpeedMultiplier ?? 1),
      damage: 8 + Math.floor(difficulty * 1.2) + (modifier.enemyDamageBonus ?? 0),
      touchCooldown: 0,
      phase: Math.random() * Math.PI * 2,
      drift: 0.5 + Math.random() * 1.2,
      radius: ENEMY_RADIUS,
    });
  }

  update(dt) {
    const step = Math.min(dt, 0.033);
    this.tickParticles(step);
    this.tickEffects(step);

    if (this.mode !== "playing") {
      return;
    }

    this.totalTime += step;
    this.updateHero(step);
    this.updateGenerators(step);
    this.updateEnemies(step);
    this.updateProjectiles(step);
    this.updateKeyAndDoor(step);
    this.updateCamera();
    this.resolveFloorState();
  }

  updateHero(dt) {
    const hero = this.hero;
    const move = normalize(this.input.moveX, this.input.moveY);
    const targetVx = move.x * hero.speed;
    const targetVy = move.y * hero.speed;
    const blend = 1 - Math.exp(-dt * 14);
    hero.vx += (targetVx - hero.vx) * blend;
    hero.vy += (targetVy - hero.vy) * blend;
    hero.x = clamp(hero.x + hero.vx * dt, PLAYER_RADIUS + 12, ROOM_WIDTH - PLAYER_RADIUS - 12);
    hero.y = clamp(hero.y + hero.vy * dt, PLAYER_RADIUS + 12, ROOM_HEIGHT - PLAYER_RADIUS - 12);
    hero.attackCooldown = Math.max(0, hero.attackCooldown - dt);
    hero.hurtCooldown = Math.max(0, hero.hurtCooldown - dt);

    const worldPointerX = this.camera.x - WIDTH * 0.5 + this.input.pointerX;
    const worldPointerY = this.camera.y - HEIGHT * 0.5 + this.input.pointerY;
    const aim = normalize(worldPointerX - hero.x, worldPointerY - hero.y);
    hero.aimX = aim.x;
    hero.aimY = aim.y;
    hero.facing = Math.atan2(aim.y, aim.x);

    if ((this.input.pointerDown || this.input.attackHeld) && hero.attackCooldown === 0) {
      this.performAttack();
      hero.attackCooldown = hero.cooldown;
    }
  }

  performAttack() {
    const hero = this.hero;
    if (hero.projectile) {
      this.emit("attack-shot", { pan: panFromX(hero.x), heroId: hero.id });
      this.projectiles.push({
        id: makeId("shot"),
        x: hero.x + hero.aimX * 26,
        y: hero.y + hero.aimY * 26,
        vx: hero.aimX * hero.projectileSpeed,
        vy: hero.aimY * hero.projectileSpeed,
        damage: hero.damage,
        radius: hero.projectileRadius + this.projectileSizeBonus,
        life: 1.6,
        pierce: hero.pierce,
        color: hero.color,
      });
      this.particles.push(makeParticle(hero.x + hero.aimX * 20, hero.y + hero.aimY * 20, hero.color, 14, 0.12));
      this.particles.push(makeParticle(hero.x + hero.aimX * 28, hero.y + hero.aimY * 28, "#ffffff", 8, 0.08, hero.aimX * 60, hero.aimY * 60));
      return;
    }

    let hitSomething = false;
    this.emit("attack-swing", { pan: panFromX(hero.x), heroId: hero.id });
    for (const enemy of this.enemies) {
      const dx = enemy.x - hero.x;
      const dy = enemy.y - hero.y;
      const dist = Math.hypot(dx, dy);
      if (dist > hero.range + enemy.radius) {
        continue;
      }
      if (angleBetween(hero.aimX, hero.aimY, dx, dy) > hero.arc) {
        continue;
      }
      enemy.hp -= hero.damage;
      enemy.phase += 0.8;
      hitSomething = true;
      this.particles.push(makeParticle(enemy.x, enemy.y, "#f5f0d8", 18, 0.15, dx * 0.2, dy * 0.2));
      this.particles.push(makeParticle(enemy.x, enemy.y, hero.color, 10, 0.12, dx * 0.12, dy * 0.12));
    }

    for (const generator of this.generators) {
      const dx = generator.x - hero.x;
      const dy = generator.y - hero.y;
      const dist = Math.hypot(dx, dy);
      if (dist > hero.range + GENERATOR_RADIUS) {
        continue;
      }
      if (angleBetween(hero.aimX, hero.aimY, dx, dy) > hero.arc) {
        continue;
      }
      generator.hp -= hero.damage;
      hitSomething = true;
      this.particles.push(makeParticle(generator.x, generator.y, hero.color, 20, 0.18, dx * 0.04, dy * 0.04));
      this.particles.push(makeParticle(generator.x, generator.y, "#ffffff", 10, 0.12, dx * 0.08, dy * 0.08));
    }

    if (!hitSomething) {
      this.particles.push(makeParticle(hero.x + hero.aimX * hero.range * 0.7, hero.y + hero.aimY * hero.range * 0.7, hero.color, 10, 0.08));
    } else {
      this.screenFx.pulse = Math.max(this.screenFx.pulse, 0.3);
      this.emit("attack-hit", { pan: panFromX(hero.x), heroId: hero.id });
    }
  }

  updateGenerators(dt) {
    const difficulty = this.floorNumber - 1;
    for (const generator of this.generators) {
      generator.pulse += dt * 4;
      generator.spawnTimer -= dt;
      if (generator.spawnTimer <= 0) {
        this.spawnEnemy(generator);
        generator.spawnTimer = Math.max(
          0.55,
          (2.4 - difficulty * 0.08 + Math.random() * 1.1) / (this.floorTheme?.modifier?.generatorSpeedMultiplier ?? 1)
        );
        this.particles.push(makeParticle(generator.x, generator.y, "#9be7ff", 22, 0.25));
        this.emit("generator-pulse", { pan: panFromX(generator.x) });
      }
    }

    const survivors = [];
    for (const generator of this.generators) {
      if (generator.hp > 0) {
        survivors.push(generator);
        continue;
      }
      this.generatorsCleared += 1;
      this.score += Math.round(140 * this.scoreMultiplier);
      if (this.generatorBreakHeal > 0) {
        this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + this.generatorBreakHeal);
      }
      this.flash("#8ef3ff", 0.18);
      this.shake(0.5);
      this.screenFx.pulse = 0.9;
      this.emit("generator-break", { pan: panFromX(generator.x) });
      this.particles.push(makeParticle(generator.x, generator.y, "#ffffff", 34, 0.45));
      for (let i = 0; i < 6; i += 1) {
        const angle = (Math.PI * 2 * i) / 6;
        this.particles.push(
          makeParticle(generator.x, generator.y, "#7ae8ff", 12, 0.32, Math.cos(angle) * 90, Math.sin(angle) * 90)
        );
      }
    }
    this.generators = survivors;

    if (this.generators.length === 0 && !this.key) {
      this.key = {
        x: ROOM_WIDTH * 0.5,
        y: ROOM_HEIGHT * 0.5,
        radius: 18,
        bob: 0,
        collected: false,
      };
      this.statusText = "Generators down. Grab key.";
    }
  }

  updateEnemies(dt) {
    const survivors = [];
    for (const enemy of this.enemies) {
      enemy.touchCooldown = Math.max(0, enemy.touchCooldown - dt);
      enemy.phase += dt * enemy.drift;
      const dx = this.hero.x - enemy.x;
      const dy = this.hero.y - enemy.y;
      const dist = Math.hypot(dx, dy) || 1;
      const dirX = dx / dist;
      const dirY = dy / dist;
      const orbitX = -dirY * Math.sin(enemy.phase) * 0.45;
      const orbitY = dirX * Math.sin(enemy.phase) * 0.45;
      enemy.x = clamp(enemy.x + (dirX + orbitX) * enemy.speed * dt, enemy.radius, ROOM_WIDTH - enemy.radius);
      enemy.y = clamp(enemy.y + (dirY + orbitY) * enemy.speed * dt, enemy.radius, ROOM_HEIGHT - enemy.radius);

      if (dist < PLAYER_RADIUS + enemy.radius + 6 && enemy.touchCooldown === 0) {
        enemy.touchCooldown = 0.9;
        if (this.hero.hurtCooldown === 0) {
          this.hero.hp -= enemy.damage;
          this.hero.hurtCooldown = 0.4;
          this.statusText = "Ghosts swarming. Keep moving.";
          this.flash("#ff8f8f", 0.22);
          this.shake(0.85);
          this.emit("hero-hurt", { pan: panFromX(this.hero.x) });
          this.particles.push(makeParticle(this.hero.x, this.hero.y, "#ff8f8f", 24, 0.2, -dirX * 80, -dirY * 80));
        }
      }

      if (enemy.hp > 0) {
        survivors.push(enemy);
      } else {
        this.kills += 1;
        this.score += Math.round(35 * this.scoreMultiplier);
        this.screenFx.pulse = Math.max(this.screenFx.pulse, 0.42);
        this.emit("enemy-down", { pan: panFromX(enemy.x) });
        this.particles.push(makeParticle(enemy.x, enemy.y, "#d8fbff", 20, 0.18, dirX * 60, dirY * 60));
      }
    }
    this.enemies = survivors;

    if (this.hero.hp <= 0) {
      this.flash("#fff4f2", 0.32);
      this.shake(1.1);
      this.emit("hero-down", { pan: panFromX(this.hero.x) });
      this.mode = "result";
      this.result = {
        floor: this.floorNumber,
        score: this.score,
        kills: this.kills,
        generators: this.generatorsCleared,
        time: this.totalTime,
      };
    }
  }

  updateProjectiles(dt) {
    const alive = [];
    for (const projectile of this.projectiles) {
      projectile.life -= dt;
      projectile.x += projectile.vx * dt;
      projectile.y += projectile.vy * dt;

      let spent = projectile.life <= 0;

      if (
        projectile.x < -40 ||
        projectile.y < -40 ||
        projectile.x > ROOM_WIDTH + 40 ||
        projectile.y > ROOM_HEIGHT + 40
      ) {
        spent = true;
      }

      for (const enemy of this.enemies) {
        if (projectile.pierce <= 0) {
          break;
        }
        const dist = Math.hypot(projectile.x - enemy.x, projectile.y - enemy.y);
        if (dist <= projectile.radius + enemy.radius) {
          enemy.hp -= projectile.damage;
          projectile.pierce -= 1;
          this.emit("projectile-hit", { pan: panFromX(enemy.x), heroId: this.hero.id });
          this.particles.push(makeParticle(enemy.x, enemy.y, projectile.color, 12, 0.12));
          if (projectile.pierce <= 0) {
            spent = true;
          }
        }
      }

      for (const generator of this.generators) {
        const dist = Math.hypot(projectile.x - generator.x, projectile.y - generator.y);
        if (dist <= projectile.radius + GENERATOR_RADIUS) {
          generator.hp -= projectile.damage;
          this.emit("projectile-hit", { pan: panFromX(generator.x), heroId: this.hero.id });
          this.particles.push(makeParticle(generator.x, generator.y, projectile.color, 14, 0.14));
          spent = true;
          break;
        }
      }

      if (!spent) {
        alive.push(projectile);
      }
    }
    this.projectiles = alive;
  }

  updateKeyAndDoor(dt) {
    if (this.key && !this.key.collected) {
      this.key.bob += dt * 4;
      if (Math.hypot(this.hero.x - this.key.x, this.hero.y - this.key.y) <= PLAYER_RADIUS + this.key.radius) {
        this.key.collected = true;
        this.door.locked = false;
        this.score += Math.round(120 * this.scoreMultiplier);
        this.statusText = "Key taken. Reach exit door.";
        this.flash("#ffe77a", 0.18);
        this.emit("key-grab", { pan: panFromX(this.key.x) });
        this.emit("door-open", { pan: panFromX(this.door.x) });
        this.particles.push(makeParticle(this.key.x, this.key.y, "#ffe77a", 28, 0.25));
      }
    }

    const insideDoor =
      Math.abs(this.hero.x - this.door.x) <= this.door.width * 0.5 &&
      Math.abs(this.hero.y - this.door.y) <= this.door.threshold;
    if (!this.door.locked && insideDoor) {
      this.score += Math.round(250 * this.scoreMultiplier);
      this.beginIntermission();
    }
  }

  updateCamera() {
    this.camera.x = clamp(this.hero.x, WIDTH * 0.5 - VIEW_MARGIN, ROOM_WIDTH - WIDTH * 0.5 + VIEW_MARGIN);
    this.camera.y = clamp(this.hero.y, HEIGHT * 0.5 - VIEW_MARGIN, ROOM_HEIGHT - HEIGHT * 0.5 + VIEW_MARGIN);
  }

  resolveFloorState() {
    if (this.generators.length > 0) {
      this.statusText = `${this.chapterTitle}. ${this.generators.length} generators left.`;
    } else if (this.key && !this.key.collected) {
      this.statusText = "Floor clear. Grab key.";
    } else if (!this.door.locked) {
      this.statusText = "Door open. Move through top gate.";
    }
  }

  beginIntermission() {
    const nextFloorNumber = this.floorNumber + 1;
    const nextPalette = FLOOR_PALETTES[(nextFloorNumber - 1) % FLOOR_PALETTES.length];
    this.mode = "intermission";
    this.intermission = {
      nextFloorNumber,
      chapterTitle: `${nextPalette.name} - Floor ${nextFloorNumber}`,
      lore: nextPalette.lore,
      omen: nextPalette.omen,
      options: pickRelicOptions(this.activeRelics, nextFloorNumber).map((relic) => ({
        ...relic,
        pickReason: getRelicPickReason(relic, this.hero),
        previewText: getRelicPreviewSummary(relic, this.hero, this),
      })),
    };
    this.flash(this.floorTheme?.accent ?? "#6be0ff", 0.2);
    this.emit("floor-clear", { pan: panFromX(this.door.x), floor: this.floorNumber });
  }

  applyRelic(relic) {
    switch (relic.id) {
      case "iron-bastion":
        this.hero.maxHp += 40;
        this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + 40);
        break;
      case "ember-core":
        this.hero.damage += 7;
        this.projectileSizeBonus += 3;
        break;
      case "wind-sandals":
        this.hero.speed += 26;
        this.hero.cooldown = Math.max(0.06, this.hero.cooldown * 0.9);
        break;
      case "moon-quiver":
        if (this.hero.projectile) {
          this.hero.pierce += 1;
        } else {
          this.hero.range += 18;
        }
        break;
      case "grave-spice":
        this.generatorBreakHeal += 18;
        this.hero.damage += 3;
        break;
      case "oracle-map":
        this.scoreMultiplier += 0.18;
        this.nextFloorHeal += 24;
        break;
      default:
        break;
    }
  }

  tickParticles(dt) {
    const alive = [];
    for (const particle of this.particles) {
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= 0.96;
      particle.vy *= 0.96;
      if (particle.life > 0) {
        alive.push(particle);
      }
    }
    this.particles = alive;
  }

  tickEffects(dt) {
    this.screenFx.flash = Math.max(0, this.screenFx.flash - dt * 1.8);
    this.screenFx.shake = Math.max(0, this.screenFx.shake - dt * 2.6);
    this.screenFx.pulse = Math.max(0, this.screenFx.pulse - dt * 1.5);
    this.screenFx.driftPhase += dt * (0.8 + this.screenFx.shake * 3.2);
  }

  getOverlay() {
    if (this.mode === "menu") {
      return {
        type: "menu",
        eyebrow: "hero select",
        title: "Gauntlet Hero-Crawl",
        copy: "Pick class. Break generators. Grab key. Survive as many floors as possible.",
      };
    }

    if (this.mode === "result" && this.result) {
      return {
        type: "result",
        eyebrow: "endless run result",
        title: `Fell on floor ${this.result.floor}.`,
        copy: `Score ${this.result.score} | Kills ${this.result.kills} | Generators ${this.result.generators} | Time ${this.result.time.toFixed(
          1
        )}s`,
      };
    }

    if (this.mode === "intermission" && this.intermission) {
      return {
        type: "intermission",
        eyebrow: "camp between floors",
        title: this.intermission.chapterTitle,
        copy: `${this.intermission.lore} ${this.intermission.omen}`,
        relicOptions: this.intermission.options,
      };
    }

    return null;
  }

  getFrameState() {
    const dangerLevel = clamp(
      this.enemies.length / 18 + (1 - this.hero.hp / Math.max(1, this.hero.maxHp)) * 0.75 + (this.door.locked ? 0.12 : 0),
      0,
      1
    );
    return {
      mode: this.mode,
      heroId: this.selectedHeroId,
      heroName: this.hero.name,
      heroDescription: this.hero.description,
      heroHp: this.hero.hp,
      heroMaxHp: this.hero.maxHp,
      heroDamage: this.hero.damage,
      heroSpeed: this.hero.speed,
      heroCooldown: this.hero.cooldown,
      heroStatSummary: getHeroStatSummary(this.hero),
      heroStatGuide: getHeroStatGuide(this.hero),
      heroX: this.hero.x,
      heroY: this.hero.y,
      heroRadius: PLAYER_RADIUS,
      heroFacing: this.hero.facing,
      heroColor: this.hero.color,
      heroHurt: this.hero.hurtCooldown > 0,
      floorNumber: this.floorNumber,
      score: this.score,
      scoreMultiplier: this.scoreMultiplier,
      kills: this.kills,
      generatorsLeft: this.generators.length,
      doorLocked: this.door.locked,
      statusText: this.statusText,
      chapterTitle: this.chapterTitle,
      chapterLore: this.chapterLore,
      floorOmen: this.floorOmen,
      currentRelic: this.currentRelic
        ? {
            name: this.currentRelic.name,
            effectText: this.currentRelic.effectText,
          }
        : null,
      activeRelics: this.activeRelics.map((relic) => ({
        id: relic.id,
        name: relic.name,
        effectText: relic.effectText,
      })),
      totalTime: this.totalTime,
      roomWidth: ROOM_WIDTH,
      roomHeight: ROOM_HEIGHT,
      width: WIDTH,
      height: HEIGHT,
      cameraX: this.camera.x,
      cameraY: this.camera.y,
      theme: this.floorTheme,
      door: this.door,
      key: this.key,
      heroClassList: HERO_CLASSES.map((hero) => ({
        id: hero.id,
        name: hero.name,
        description: hero.description,
        color: hero.color,
      })),
      enemies: this.enemies.map((enemy) => ({
        x: enemy.x,
        y: enemy.y,
        hp: enemy.hp,
        maxHp: enemy.maxHp,
        radius: enemy.radius,
      })),
      generators: this.generators.map((generator) => ({
        x: generator.x,
        y: generator.y,
        hp: generator.hp,
        maxHp: generator.maxHp,
        radius: GENERATOR_RADIUS,
        pulse: generator.pulse,
      })),
      projectiles: this.projectiles.map((projectile) => ({
        x: projectile.x,
        y: projectile.y,
        radius: projectile.radius,
        color: projectile.color,
      })),
      particles: this.particles.map((particle) => ({
        x: particle.x,
        y: particle.y,
        size: particle.size,
        color: particle.color,
        alpha: particle.life / particle.maxLife,
      })),
      dangerLevel,
      screenFx: {
        flash: this.screenFx.flash,
        flashColor: this.screenFx.flashColor,
        shake: this.screenFx.shake,
        pulse: this.screenFx.pulse,
        driftPhase: this.screenFx.driftPhase,
      },
      overlay: this.getOverlay(),
    };
  }
}
