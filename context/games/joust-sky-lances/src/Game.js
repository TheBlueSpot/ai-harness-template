import {
  ENEMY_TYPES,
  FLOOR_Y,
  HATCH_TIME,
  HEIGHT,
  MAX_WAVE,
  PERCHES,
  PLAYER_MAX_HP,
  TIPS,
  WAVES,
  WIDTH,
  WRAP_MARGIN,
} from "./data.js";

const TAU = Math.PI * 2;
const BEST_KEY = "joust-sky-lances-best";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

function wrapX(value) {
  if (value < -WRAP_MARGIN) {
    return WIDTH + WRAP_MARGIN;
  }
  if (value > WIDTH + WRAP_MARGIN) {
    return -WRAP_MARGIN;
  }
  return value;
}

function rectsOverlap(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function platformTopAt(entity) {
  for (const perch of PERCHES) {
    const onBand = entity.x > perch.x - perch.w * 0.5 - 34 && entity.x < perch.x + perch.w * 0.5 + 34;
    const fallingThrough = entity.y <= perch.y && entity.y + entity.vy * 0.016 >= perch.y - 24;
    if (onBand && fallingThrough) {
      return perch.y - 10;
    }
  }
  return FLOOR_Y;
}

function makeBirdBase(x, y, options = {}) {
  return {
    x,
    y,
    vx: options.vx ?? 0,
    vy: options.vy ?? 0,
    facing: options.facing ?? 1,
    flapCooldown: 0,
    surgeCooldown: 0,
    invuln: 0,
    stun: 0,
    grounded: false,
    bob: Math.random() * TAU,
    wing: Math.random() * TAU,
    trail: [],
  };
}

function makePlayer() {
  return {
    kind: "player",
    ...makeBirdBase(250, 300),
    hp: PLAYER_MAX_HP,
    maxHp: PLAYER_MAX_HP,
    surgeMeter: 1,
    score: 0,
    eggsSaved: 0,
  };
}

function makeEnemy(typeId, wave, spawnSide) {
  const type = ENEMY_TYPES[typeId];
  const yBand = [220, 280, 360, 440];
  return {
    kind: "enemy",
    ...makeBirdBase(spawnSide === "left" ? -48 : WIDTH + 48, yBand[(wave + Math.floor(Math.random() * yBand.length)) % yBand.length], {
      facing: spawnSide === "left" ? 1 : -1,
    }),
    typeId,
    label: type.label,
    color: type.color,
    speed: type.speed,
    liftBias: type.liftBias,
    diveRate: type.diveRate,
    surgeRate: type.surgeRate,
    patience: type.patience,
    aiClock: randomRange(0.2, 1.2),
    state: "patrol",
    tell: 0,
    lunge: 0,
    targetY: randomRange(220, 500),
  };
}

function makeEgg(x, y, typeId) {
  return {
    x,
    y,
    vy: -80,
    wobble: Math.random() * TAU,
    timer: HATCH_TIME,
    typeId,
  };
}

export class Game {
  constructor() {
    this.mode = "menu";
    this.time = 0;
    this.waveIndex = 0;
    this.best = Number.parseInt(globalThis.localStorage?.getItem(BEST_KEY) ?? "0", 10) || 0;
    this.player = makePlayer();
    this.enemies = [];
    this.eggs = [];
    this.particles = [];
    this.message = "Hover above riders. Grab every egg before it hatches.";
    this.tip = TIPS[0];
    this.tipTimer = 0;
    this.roundClearTimer = 0;
    this.flash = 0;
    this.spawnWave();
  }

  start() {
    this.resetRun();
    this.mode = "playing";
  }

  restart() {
    this.start();
  }

  resetRun() {
    this.time = 0;
    this.waveIndex = 0;
    this.player = makePlayer();
    this.enemies = [];
    this.eggs = [];
    this.particles = [];
    this.message = "Hover above riders. Grab every egg before it hatches.";
    this.tip = TIPS[0];
    this.tipTimer = 0;
    this.flash = 0;
    this.roundClearTimer = 0;
    this.spawnWave();
  }

  spawnWave() {
    const wave = WAVES[this.waveIndex];
    this.enemies = wave.enemies.map((typeId, index) => makeEnemy(typeId, this.waveIndex, index % 2 === 0 ? "left" : "right"));
    this.message = `Wave ${this.waveIndex + 1}. ${wave.enemies.length} riders incoming.`;
    this.tip = TIPS[this.waveIndex % TIPS.length];
    this.tipTimer = 3;
  }

  update(dt, input) {
    const step = Math.min(dt, 1 / 30);
    this.time += step;
    this.flash = Math.max(0, this.flash - step * 2.2);
    this.tipTimer = Math.max(0, this.tipTimer - step);

    if (input.restartPressed) {
      this.restart();
      return;
    }

    if (this.mode === "menu") {
      if (input.startPressed) {
        this.start();
      }
      this.updateAmbient(step);
      return;
    }

    if (this.mode === "win" || this.mode === "lose") {
      if (input.startPressed) {
        this.start();
      }
      this.updateAmbient(step);
      return;
    }

    if (this.mode === "round-clear") {
      this.updateAmbient(step);
      this.roundClearTimer -= step;
      if (this.roundClearTimer <= 0) {
        if (this.waveIndex >= MAX_WAVE) {
          this.finishRun("win");
        } else {
          this.mode = "playing";
          this.spawnWave();
        }
      }
      return;
    }

    this.updatePlayer(step, input);
    this.updateEnemies(step);
    this.updateEggs(step);
    this.resolveCollisions();
    this.updateParticles(step);
    this.cleanup();
    this.checkProgress();
  }

  updateAmbient(dt) {
    this.player.bob += dt * 1.6;
    this.player.wing += dt * 7.5;
    this.player.y = 300 + Math.sin(this.player.bob) * 12;
  }

  updatePlayer(dt, input) {
    const player = this.player;
    const moveX = (input.left ? -1 : 0) + (input.right ? 1 : 0);
    const moveY = (input.up ? -1 : 0) + (input.down ? 1 : 0);
    const flap = input.flap;
    const surge = input.surge;

    player.bob += dt * 4.5;
    player.wing += dt * (flap ? 18 : 11);
    player.flapCooldown = Math.max(0, player.flapCooldown - dt);
    player.surgeCooldown = Math.max(0, player.surgeCooldown - dt);
    player.invuln = Math.max(0, player.invuln - dt);
    player.stun = Math.max(0, player.stun - dt);
    player.surgeMeter = clamp(player.surgeMeter + dt * 0.18, 0, 1);

    if (player.stun <= 0) {
      player.vx += moveX * 760 * dt;
      player.vy += 440 * dt;
      if (moveY < 0) {
        player.vy -= 240 * dt;
      } else if (moveY > 0) {
        player.vy += 160 * dt;
      }

      if (flap && player.flapCooldown <= 0) {
        player.vy -= 230;
        player.flapCooldown = 0.16;
        this.emitBurst(player.x - player.facing * 20, player.y + 18, "#fff2a8", 5);
      }

      if (surge && player.surgeCooldown <= 0 && player.surgeMeter >= 0.35) {
        player.surgeMeter = Math.max(0, player.surgeMeter - 0.35);
        player.vx += player.facing * 240;
        player.vy -= 120;
        player.surgeCooldown = 0.35;
        this.message = "Surge used. Reclaim altitude before the next tell.";
        this.emitBurst(player.x, player.y, "#8af3ff", 12);
      }
    } else {
      player.vy += 520 * dt;
    }

    if (moveX !== 0) {
      player.facing = Math.sign(moveX);
    }

    player.vx *= Math.pow(0.92, dt * 60);
    player.vy *= Math.pow(0.985, dt * 60);
    player.vx = clamp(player.vx, -280, 280);
    player.vy = clamp(player.vy, -360, 420);

    player.x = wrapX(player.x + player.vx * dt);
    player.y += player.vy * dt;
    this.resolveGround(player);
    this.recordTrail(player, "#fff6bf");
  }

  updateEnemies(dt) {
    for (const enemy of this.enemies) {
      enemy.bob += dt * 4;
      enemy.wing += dt * 10;
      enemy.flapCooldown = Math.max(0, enemy.flapCooldown - dt);
      enemy.surgeCooldown = Math.max(0, enemy.surgeCooldown - dt);
      enemy.invuln = Math.max(0, enemy.invuln - dt);
      enemy.stun = Math.max(0, enemy.stun - dt);

      const dx = this.player.x - enemy.x;
      const dy = this.player.y - enemy.y;
      const wrappedDx = Math.abs(dx) < WIDTH * 0.5 ? dx : dx - Math.sign(dx) * WIDTH;
      enemy.aiClock -= dt;
      enemy.tell = Math.max(0, enemy.tell - dt);
      enemy.lunge = Math.max(0, enemy.lunge - dt);

      if (enemy.stun > 0) {
        enemy.vy += 540 * dt;
      } else if (enemy.lunge > 0) {
        enemy.vx += enemy.facing * enemy.speed * 3.4 * dt;
        enemy.vy += Math.sign(dy + 28) * 240 * dt;
      } else {
        const altitudeError = enemy.targetY - enemy.y;
        enemy.vy += clamp(altitudeError * 1.4, -120, 120) * dt * 4;
        enemy.vx += Math.sign(wrappedDx) * enemy.speed * dt;

        if (enemy.aiClock <= 0) {
          enemy.aiClock = enemy.patience + randomRange(0.1, 0.8);
          enemy.targetY = clamp(this.player.y + randomRange(-110, 150), 180, 560);

          if (this.player.y < enemy.y - 18 && Math.random() < enemy.liftBias * 0.35) {
            enemy.vy -= 140;
          }

          const wantsDive = this.player.y > enemy.y - 24 && Math.abs(wrappedDx) < 180 && Math.random() < enemy.diveRate;
          const wantsSurge = Math.abs(wrappedDx) < 220 && Math.random() < enemy.surgeRate;
          if (wantsDive || wantsSurge) {
            enemy.tell = wantsDive ? 0.54 : 0.36;
            enemy.facing = Math.sign(wrappedDx || enemy.facing || 1);
            enemy.state = wantsDive ? "dive" : "surge";
          }
        }

        if (enemy.tell > 0 && enemy.tell < 0.08) {
          enemy.lunge = enemy.state === "dive" ? 0.45 : 0.28;
          enemy.aiClock = enemy.patience + randomRange(0.35, 0.8);
          if (enemy.state === "dive") {
            enemy.vy += 170;
            enemy.vx += enemy.facing * 120;
          } else {
            enemy.vx += enemy.facing * 240;
            enemy.vy -= 120;
          }
          enemy.state = "patrol";
        }
      }

      if (enemy.flapCooldown <= 0 && enemy.vy > 50 && Math.random() < 0.08) {
        enemy.vy -= 170;
        enemy.flapCooldown = 0.18;
      }

      enemy.vx *= Math.pow(0.935, dt * 60);
      enemy.vy *= Math.pow(0.988, dt * 60);
      enemy.vx = clamp(enemy.vx, -enemy.speed * 1.9, enemy.speed * 1.9);
      enemy.vy = clamp(enemy.vy, -320, 430);
      enemy.x = wrapX(enemy.x + enemy.vx * dt);
      enemy.y += enemy.vy * dt;
      this.resolveGround(enemy);
      this.recordTrail(enemy, enemy.color);
    }
  }

  updateEggs(dt) {
    for (const egg of this.eggs) {
      egg.wobble += dt * 5.5;
      egg.timer -= dt;
      egg.vy += 340 * dt;
      egg.y += egg.vy * dt;
      const floor = platformTopAt(egg);
      if (egg.y > floor) {
        egg.y = floor;
        egg.vy = -Math.abs(egg.vy) * 0.38;
      }

      if (egg.timer <= 0) {
        const spawnSide = egg.x < WIDTH * 0.5 ? "left" : "right";
        this.enemies.push(makeEnemy(egg.typeId, this.waveIndex, spawnSide));
        const spawned = this.enemies[this.enemies.length - 1];
        spawned.x = egg.x;
        spawned.y = egg.y - 24;
        spawned.invuln = 0.5;
        this.emitBurst(egg.x, egg.y, "#ffd5f5", 14);
        this.message = "Egg hatched. Deny the nest faster.";
        egg.timer = -999;
      }
    }
  }

  resolveGround(entity) {
    const floor = platformTopAt(entity);
    if (entity.y > floor) {
      entity.y = floor;
      entity.vy = 0;
      entity.grounded = true;
    } else {
      entity.grounded = false;
    }
  }

  resolveCollisions() {
    const playerHitbox = this.getBirdHitbox(this.player);
    for (const enemy of this.enemies) {
      if (enemy.invuln > 0) {
        continue;
      }
      const enemyHitbox = this.getBirdHitbox(enemy);
      if (!rectsOverlap(playerHitbox, enemyHitbox)) {
        continue;
      }

      const playerWins = this.player.y + 8 < enemy.y || this.player.vy < enemy.vy - 24;
      if (playerWins) {
        this.scoreEnemy(enemy);
        enemy.invuln = 0.35;
      } else if (this.player.invuln <= 0) {
        this.damagePlayer(enemy);
      }
    }

    const playerEggGrab = {
      left: this.player.x - 34,
      right: this.player.x + 34,
      top: this.player.y - 30,
      bottom: this.player.y + 34,
    };
    for (const egg of this.eggs) {
      if (egg.timer <= 0) {
        continue;
      }
      const eggBox = {
        left: egg.x - 16,
        right: egg.x + 16,
        top: egg.y - 18,
        bottom: egg.y + 18,
      };
      if (rectsOverlap(playerEggGrab, eggBox)) {
        egg.timer = -999;
        this.player.eggsSaved += 1;
        this.player.score += 125;
        this.message = "Egg secured. No free rematch.";
        this.emitBurst(egg.x, egg.y, "#b6ff9a", 10);
      }
    }
  }

  scoreEnemy(enemy) {
    enemy.stun = 1.2;
    enemy.vy = -260;
    enemy.vx = this.player.facing * 180;
    enemy.invuln = 999;
    this.player.score += 220;
    this.message = `${enemy.label} dismounted. Grab the egg before hatch.`;
    this.flash = 0.45;
    this.emitBurst(enemy.x, enemy.y, "#ffe484", 16);
    this.eggs.push(makeEgg(enemy.x, enemy.y + 6, enemy.typeId));
    enemy.remove = true;
  }

  damagePlayer(enemy) {
    this.player.hp -= 1;
    this.player.invuln = 1.4;
    this.player.stun = 0.42;
    this.player.vx = -enemy.facing * 180;
    this.player.vy = -180;
    this.player.surgeMeter = Math.max(0.2, this.player.surgeMeter - 0.25);
    this.message = "Bad angle. Reset above the next tell.";
    this.flash = 0.65;
    this.emitBurst(this.player.x, this.player.y, "#ff9d9d", 18);
    if (this.player.hp <= 0) {
      this.finishRun("lose");
    }
  }

  updateParticles(dt) {
    for (const particle of this.particles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += particle.gravity * dt;
      particle.life -= dt;
      particle.alpha = particle.life / particle.maxLife;
    }
  }

  cleanup() {
    this.enemies = this.enemies.filter((enemy) => !enemy.remove);
    this.eggs = this.eggs.filter((egg) => egg.timer > -1);
    this.particles = this.particles.filter((particle) => particle.life > 0);
  }

  checkProgress() {
    if (this.mode !== "playing") {
      return;
    }

    if (this.enemies.length === 0 && this.eggs.length === 0) {
      this.waveIndex += 1;
      if (this.waveIndex >= MAX_WAVE) {
        this.finishRun("win");
        return;
      }
      this.mode = "round-clear";
      this.roundClearTimer = 2.3;
      this.message = `Sky lane clear. Wave ${this.waveIndex + 1} forms above.`;
      this.tip = TIPS[this.waveIndex % TIPS.length];
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 1);
      this.player.surgeMeter = 1;
      this.emitBurst(this.player.x, this.player.y, "#d8ffe2", 18);
    }
  }

  finishRun(mode) {
    this.mode = mode;
    this.best = Math.max(this.best, this.player.score);
    globalThis.localStorage?.setItem(BEST_KEY, String(this.best));
    this.message = mode === "win"
      ? "Circuit cleared. Every nest denied."
      : "Knight down. The circuit resets fast.";
  }

  emitBurst(x, y, color, count) {
    for (let i = 0; i < count; i += 1) {
      const angle = randomRange(0, TAU);
      const speed = randomRange(30, 180);
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        gravity: 140,
        life: randomRange(0.25, 0.75),
        maxLife: 0.75,
        alpha: 1,
        color,
        size: randomRange(2, 6),
      });
    }
  }

  recordTrail(entity, color) {
    entity.trail.push({ x: entity.x, y: entity.y, color });
    if (entity.trail.length > 8) {
      entity.trail.shift();
    }
  }

  getBirdHitbox(entity) {
    return {
      left: entity.x - 34,
      right: entity.x + 34,
      top: entity.y - 22,
      bottom: entity.y + 22,
    };
  }

  getFrameState() {
    return {
      mode: this.mode,
      width: WIDTH,
      height: HEIGHT,
      floorY: FLOOR_Y,
      perches: PERCHES,
      player: structuredClone(this.player),
      enemies: this.enemies.map((enemy) => structuredClone(enemy)),
      eggs: this.eggs.map((egg) => structuredClone(egg)),
      particles: this.particles.map((particle) => structuredClone(particle)),
      wave: this.waveIndex + (this.mode === "win" ? 0 : 1),
      maxWave: MAX_WAVE,
      best: this.best,
      message: this.message,
      tip: this.tipTimer > 0 ? this.tip : "",
      flash: this.flash,
    };
  }
}
