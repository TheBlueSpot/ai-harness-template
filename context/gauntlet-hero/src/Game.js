import {
  DOOR_HEIGHT,
  DOOR_WIDTH,
  ENEMY_RADIUS,
  FLOOR_PALETTES,
  GENERATOR_RADIUS,
  HEIGHT,
  HERO_CLASSES,
  PLAYER_RADIUS,
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
    this.kills = 0;
    this.generatorsCleared = 0;
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

  start() {
    this.floorNumber = 1;
    this.score = 0;
    this.kills = 0;
    this.generatorsCleared = 0;
    this.totalTime = 0;
    this.result = null;
    this.mode = "playing";
    this.resetRunState();
    this.statusText = "Floor 1. Break generators.";
  }

  restartRun() {
    this.mode = "menu";
    this.result = null;
    this.statusText = "Pick hero. Push deeper.";
    this.resetRunState();
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
    const generatorCount = Math.min(3 + Math.floor(difficulty / 2), 6);

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
    const startingGhosts = 4 + difficulty * 2;
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
  }

  spawnEnemy(source = null) {
    const difficulty = this.floorNumber - 1;
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
      hp: 24 + difficulty * 7,
      maxHp: 24 + difficulty * 7,
      speed: 84 + difficulty * 8 + Math.random() * 18,
      damage: 8 + Math.floor(difficulty * 1.2),
      touchCooldown: 0,
      phase: Math.random() * Math.PI * 2,
      drift: 0.5 + Math.random() * 1.2,
      radius: ENEMY_RADIUS,
    });
  }

  update(dt) {
    const step = Math.min(dt, 0.033);
    this.tickParticles(step);

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
      this.projectiles.push({
        id: makeId("shot"),
        x: hero.x + hero.aimX * 26,
        y: hero.y + hero.aimY * 26,
        vx: hero.aimX * hero.projectileSpeed,
        vy: hero.aimY * hero.projectileSpeed,
        damage: hero.damage,
        radius: hero.projectileRadius,
        life: 1.6,
        pierce: hero.pierce,
        color: hero.color,
      });
      this.particles.push(makeParticle(hero.x + hero.aimX * 20, hero.y + hero.aimY * 20, hero.color, 14, 0.12));
      return;
    }

    let hitSomething = false;
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
    }

    if (!hitSomething) {
      this.particles.push(makeParticle(hero.x + hero.aimX * hero.range * 0.7, hero.y + hero.aimY * hero.range * 0.7, hero.color, 10, 0.08));
    }
  }

  updateGenerators(dt) {
    const difficulty = this.floorNumber - 1;
    for (const generator of this.generators) {
      generator.pulse += dt * 4;
      generator.spawnTimer -= dt;
      if (generator.spawnTimer <= 0) {
        this.spawnEnemy(generator);
        generator.spawnTimer = Math.max(0.55, 2.4 - difficulty * 0.08 + Math.random() * 1.1);
        this.particles.push(makeParticle(generator.x, generator.y, "#9be7ff", 22, 0.25));
      }
    }

    const survivors = [];
    for (const generator of this.generators) {
      if (generator.hp > 0) {
        survivors.push(generator);
        continue;
      }
      this.generatorsCleared += 1;
      this.score += 140;
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
          this.particles.push(makeParticle(this.hero.x, this.hero.y, "#ff8f8f", 24, 0.2, -dirX * 80, -dirY * 80));
        }
      }

      if (enemy.hp > 0) {
        survivors.push(enemy);
      } else {
        this.kills += 1;
        this.score += 35;
        this.particles.push(makeParticle(enemy.x, enemy.y, "#d8fbff", 20, 0.18, dirX * 60, dirY * 60));
      }
    }
    this.enemies = survivors;

    if (this.hero.hp <= 0) {
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
        this.score += 120;
        this.statusText = "Key taken. Reach exit door.";
        this.particles.push(makeParticle(this.key.x, this.key.y, "#ffe77a", 28, 0.25));
      }
    }

    const insideDoor =
      Math.abs(this.hero.x - this.door.x) <= this.door.width * 0.5 &&
      Math.abs(this.hero.y - this.door.y) <= this.door.threshold;
    if (!this.door.locked && insideDoor) {
      this.floorNumber += 1;
      this.score += 250;
      this.statusText = `Floor ${this.floorNumber}. Generators active.`;
      this.spawnFloor(this.floorNumber);
    }
  }

  updateCamera() {
    this.camera.x = clamp(this.hero.x, WIDTH * 0.5 - VIEW_MARGIN, ROOM_WIDTH - WIDTH * 0.5 + VIEW_MARGIN);
    this.camera.y = clamp(this.hero.y, HEIGHT * 0.5 - VIEW_MARGIN, ROOM_HEIGHT - HEIGHT * 0.5 + VIEW_MARGIN);
  }

  resolveFloorState() {
    if (this.generators.length > 0) {
      this.statusText = `Floor ${this.floorNumber}. ${this.generators.length} generators left.`;
    } else if (this.key && !this.key.collected) {
      this.statusText = "Floor clear. Grab key.";
    } else if (!this.door.locked) {
      this.statusText = "Door open. Move through top gate.";
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

    return null;
  }

  getFrameState() {
    return {
      mode: this.mode,
      heroId: this.selectedHeroId,
      heroName: this.hero.name,
      heroDescription: this.hero.description,
      heroHp: this.hero.hp,
      heroMaxHp: this.hero.maxHp,
      heroX: this.hero.x,
      heroY: this.hero.y,
      heroRadius: PLAYER_RADIUS,
      heroFacing: this.hero.facing,
      heroColor: this.hero.color,
      heroHurt: this.hero.hurtCooldown > 0,
      floorNumber: this.floorNumber,
      score: this.score,
      kills: this.kills,
      generatorsLeft: this.generators.length,
      doorLocked: this.door.locked,
      statusText: this.statusText,
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
      overlay: this.getOverlay(),
    };
  }
}
