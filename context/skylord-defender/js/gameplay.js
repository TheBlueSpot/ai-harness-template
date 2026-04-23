import { HEIGHT, WIDTH } from "./config.js";
import { clamp, distanceSq, lerp, normalize, randInt, randRange } from "./math.js";
import { CommandLog } from "./command-log.js";
import { ParticleSystem } from "./particle-system.js";
import { UnitAI } from "./unit-ai.js";
import { Terrain } from "./world.js";

const TAU = Math.PI * 2;
const PLAYER_RADIUS = 20;
const TURRET_RADIUS = 15;
const CIVILIAN_RADIUS = 10;
const ENEMY_RADIUS = 18;
const BULLET_RADIUS = 4;
const BOMB_RADIUS = 7;

const PLAYER_MAX_HEALTH = 100;
const PLAYER_MAX_SPEED = 380;
const PLAYER_ACCEL = 960;
const PLAYER_FRICTION = 0.88;
const PLAYER_FIRE_DELAY = 0.13;
const PLAYER_TURRET_COST = 1;

const TURRET_SCAN_RADIUS = 360;
const TURRET_FIRE_DELAY = 0.42;
const TURRET_MAX_HEALTH = 80;

const CIVILIAN_SPAWN_MARGIN = 120;
const MAX_WAVES = 5;

const makeBullet = ({ owner, x, y, vx, vy, damage, radius = BULLET_RADIUS, life = 1.8, color = "player", explosive = false }) => ({
  owner,
  x,
  y,
  vx,
  vy,
  damage,
  radius,
  life,
  color,
  explosive,
});

const circleHit = (ax, ay, ar, bx, by, br) => distanceSq(ax, ay, bx, by) <= (ar + br) * (ar + br);

class Civilian {
  constructor(x, terrain, id) {
    this.id = id;
    this.x = x;
    this.radius = CIVILIAN_RADIUS;
    this.state = "alive";
    this.hover = randRange(0, TAU);
    this.y = terrain.heightAt(this.x) - this.radius;
  }

  update(dt, terrain) {
    if (this.state !== "alive") {
      return;
    }

    this.hover += dt * 5.5;
    this.y = terrain.heightAt(this.x) - this.radius + Math.sin(this.hover) * 2.5;
  }
}

class Turret {
  constructor(x, terrain, id) {
    this.id = id;
    this.x = x;
    this.radius = TURRET_RADIUS;
    this.health = TURRET_MAX_HEALTH;
    this.fireCooldown = randRange(0, 0.12);
    this.spin = randRange(0, TAU);
    this.y = terrain.heightAt(this.x) - this.radius;
  }

  update(dt, session) {
    this.spin += dt * 2.2;
    this.y = session.terrain.heightAt(this.x) - this.radius;
    this.fireCooldown -= dt;

    const target = session.findNearestEnemy(this.x, this.y, TURRET_SCAN_RADIUS);
    if (!target || this.fireCooldown > 0) {
      return;
    }

    const aim = normalize(target.x - this.x, target.y - this.y);
    session.projectiles.push(
      makeBullet({
        owner: "turret",
        x: this.x + aim.x * 20,
        y: this.y + aim.y * 20,
        vx: aim.x * 740,
        vy: aim.y * 740,
        damage: 18,
        radius: 4,
        life: 1.5,
        color: "turret",
      })
    );
    session.audio?.playSfx("sfx-laser", { volume: 0.14, rate: randRange(0.92, 1.04) });
    this.fireCooldown = TURRET_FIRE_DELAY;
    session.score += 1;
    session.particles.emitImpact(this.x + aim.x * 18, this.y + aim.y * 18, aim.x, aim.y, 0.45, "#9ef39d");
  }
}

class Enemy {
  constructor(type, x, y, direction, wave) {
    this.id = `${type}-${wave}-${Math.random().toString(16).slice(2)}`;
    this.type = type;
    this.x = x;
    this.y = y;
    this.vx = direction * randRange(120, 180);
    this.vy = randRange(-20, 20);
    this.radius = ENEMY_RADIUS + (type === "bomber" ? 4 : 0);
    this.health = type === "bomber" ? 42 + wave * 3 : 30 + wave * 2;
    this.maxHealth = this.health;
    this.turnRate = type === "bomber" ? 0.55 : 0.85;
    this.speed = type === "bomber" ? 150 + wave * 10 : 210 + wave * 14;
    this.mode = "hunt";
    this.grabbed = null;
    this.dropCooldown = randRange(0.55, 1.2);
    this.escapeTimer = 0;
    this.wobble = randRange(0, TAU);
  }

  takeDamage(amount) {
    this.health -= amount;
    return this.health <= 0;
  }
}

class Bomb {
  constructor(x, y, vx, vy, damage) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.radius = BOMB_RADIUS;
    this.damage = damage;
    this.life = 4.0;
  }
}

export class GameSession {
  constructor(audio = null) {
    this.audio = audio;
    this.reset();
  }

  reset() {
    this.time = 0;
    this.elapsed = 0;
    this.score = 0;
    this.wave = 1;
    this.maxWaves = MAX_WAVES;
    this.status = "running";
    this.finishReason = "";
    this.phaseLabel = "drop";
    this.waveState = "deploy";
    this.waveTimer = 0;
    this.intermissionTimer = 0;
    this.player = this.createPlayer();
    this.terrain = new Terrain(WIDTH, HEIGHT);
    this.particles = new ParticleSystem();
    this.commandLog = new CommandLog();
    this.unitAI = new UnitAI();
    this.bullets = [];
    this.projectiles = [];
    this.bombs = [];
    this.enemies = [];
    this.turrets = [];
    this.civilians = [];
    this.rescuedThisWave = 0;
    this.rescuedTotal = 0;
    this.lostTotal = 0;
    this.enemiesDestroyed = 0;
    this.turretsBuilt = 0;
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.waveEnemyTotal = 0;
    this.waveEnemiesSpawned = 0;
    this.turretCharges = 0;
    this.waveFlash = 0;
    this.bonusBanner = "";
    this.setWave(1);
  }

  createPlayer() {
    return {
      x: WIDTH * 0.48,
      y: HEIGHT * 0.58,
      vx: 0,
      vy: 0,
      radius: PLAYER_RADIUS,
      health: PLAYER_MAX_HEALTH,
      maxHealth: PLAYER_MAX_HEALTH,
      fireCooldown: 0,
      invuln: 0,
      facing: 1,
      turretCharges: 0,
    };
  }

  setWave(wave) {
    this.wave = wave;
    this.waveState = "deploy";
    this.waveTimer = 0;
    this.intermissionTimer = 0;
    this.waveFlash = 1.2;
    this.bonusBanner = "";
    this.turretCharges = 2 + Math.floor(wave / 2);
    this.player.turretCharges = this.turretCharges;
    this.player.health = clamp(this.player.health + 16, 28, this.player.maxHealth);
    this.player.x = WIDTH * 0.48;
    this.player.y = HEIGHT * 0.58;
    this.player.vx = 0;
    this.player.vy = 0;
    this.projectiles = [];
    this.bombs = [];
    this.enemies = [];
    this.spawnCiviliansForWave(wave);
    this.buildSpawnQueue(wave);
    this.spawnTimer = 0.9;
    this.waveEnemyTotal = this.spawnQueue.length;
    this.waveEnemiesSpawned = 0;
    this.rescuedThisWave = 0;
    this.phaseLabel = wave === this.maxWaves ? "final wave" : "wave ready";
  }

  spawnCiviliansForWave(wave) {
    this.civilians = [];
    const count = 4 + Math.min(3, Math.floor((wave - 1) / 2));
    const slots = count + 1;
    for (let index = 0; index < count; index += 1) {
      const t = (index + 1) / slots;
      const x = clamp(
        WIDTH * (0.14 + t * 0.72) + randRange(-55, 55),
        CIVILIAN_SPAWN_MARGIN,
        WIDTH - CIVILIAN_SPAWN_MARGIN
      );
      this.civilians.push(new Civilian(x, this.terrain, `${wave}-${index}`));
    }
  }

  buildSpawnQueue(wave) {
    const enemyCount = 6 + wave * 3;
    const bomberCount = Math.max(1, Math.floor(enemyCount * (0.18 + wave * 0.06)));
    const raiderCount = enemyCount - bomberCount;
    this.spawnQueue = [];
    for (let index = 0; index < raiderCount; index += 1) {
      this.spawnQueue.push(index % 3 === 0 ? "raider" : "raider");
    }
    for (let index = 0; index < bomberCount; index += 1) {
      this.spawnQueue.push("bomber");
    }

    for (let index = this.spawnQueue.length - 1; index > 0; index -= 1) {
      const swap = randInt(0, index);
      [this.spawnQueue[index], this.spawnQueue[swap]] = [this.spawnQueue[swap], this.spawnQueue[index]];
    }
  }

  get civiliansAlive() {
    return this.civilians.filter((civilian) => civilian.state === "alive").length;
  }

  get civiliansLost() {
    return this.lostTotal + this.civilians.filter((civilian) => civilian.state === "lost").length;
  }

  get enemiesAlive() {
    return this.enemies.length;
  }

  get progressLabel() {
    return `${this.wave}/${this.maxWaves}`;
  }

  update(dt, input) {
    if (this.status !== "running") {
      return;
    }

    this.time += dt;
    this.elapsed += dt;
    this.waveTimer += dt;
    this.waveFlash = Math.max(0, this.waveFlash - dt);
    this.terrain.settle(dt);
    this.particles.update(dt);
    this.commandLog.update(dt);

    if (this.waveState === "deploy") {
      this.phaseLabel = "drop incoming";
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.waveState = "active";
        this.phaseLabel = "active";
        this.spawnTimer = Math.max(0.36, 0.98 - this.wave * 0.08);
      }
    }

    this.updatePlayer(dt, input);
    this.updateTurrets(dt);
    this.updateEnemies(dt);
    this.updateBombs(dt);
    this.updateProjectiles(dt);
    this.updateCivilians(dt);
    this.checkWaveFlow(dt);

    if (this.player.health <= 0) {
      this.finish("lose", "ship destroyed");
      return;
    }

    if (this.civilians.length > 0 && this.civiliansAlive <= 0) {
      this.finish("lose", "all civilians lost");
    }
  }

  updatePlayer(dt, input) {
    const player = this.player;
    player.fireCooldown = Math.max(0, player.fireCooldown - dt);
    player.invuln = Math.max(0, player.invuln - dt);

    const axisX =
      (input.isDown("ArrowRight", "KeyD") ? 1 : 0) -
      (input.isDown("ArrowLeft", "KeyA") ? 1 : 0);
    const axisY =
      (input.isDown("ArrowDown", "KeyS") ? 1 : 0) -
      (input.isDown("ArrowUp", "KeyW") ? 1 : 0);

    let moveX = axisX;
    let moveY = axisY;
    if (input.pointer.down || input.pointer.pressed) {
      moveX += clamp((input.pointer.x - player.x) / 120, -1, 1);
      moveY += clamp((input.pointer.y - player.y) / 120, -1, 1);
    }

    const move = normalize(moveX, moveY);
    const moveStrength = Math.hypot(moveX, moveY);
    if (moveStrength > 0.05) {
      player.vx += move.x * PLAYER_ACCEL * dt;
      player.vy += move.y * PLAYER_ACCEL * dt;
      player.facing = move.x === 0 ? player.facing : Math.sign(move.x) || player.facing;
    } else {
      player.vx *= Math.pow(PLAYER_FRICTION, dt * 60);
      player.vy *= Math.pow(PLAYER_FRICTION, dt * 60);
    }

    const maxSpeed = input.isDown("ShiftLeft", "ShiftRight") ? PLAYER_MAX_SPEED * 1.25 : PLAYER_MAX_SPEED;
    const speed = Math.hypot(player.vx, player.vy);
    if (speed > maxSpeed) {
      const scale = maxSpeed / speed;
      player.vx *= scale;
      player.vy *= scale;
    }

    player.x = clamp(player.x + player.vx * dt, 18, WIDTH - 18);
    player.y = clamp(player.y + player.vy * dt, 60, HEIGHT - 120);

    const terrainY = this.terrain.heightAt(player.x);
    const minY = terrainY - player.radius;
    if (player.y > minY) {
      const impact = Math.max(0, player.vy);
      player.y = minY;
      player.vy *= -0.18;
      if (impact > 140) {
        this.damagePlayer((impact - 140) * 0.06);
      }
    }

    if (moveStrength > 0.05) {
      this.particles.emitThrust(
        player.x - move.x * 14,
        player.y - move.y * 14,
        move.x,
        move.y,
        clamp(moveStrength, 0.2, 1),
        "#76d7ff"
      );
    }

    if (input.wasPressed("KeyT")) {
      this.deployTurret();
    }

    const shouldFire = input.isDown("Space") || input.pointer.pressed;
    if (shouldFire && player.fireCooldown <= 0) {
      this.firePlayerWeapon(input);
      player.fireCooldown = PLAYER_FIRE_DELAY;
    }

    if ((input.pointer.down || input.pointer.pressed) && input.isDown("Space")) {
      player.facing = input.pointer.x >= player.x ? 1 : -1;
    }
  }

  firePlayerWeapon(input) {
    const player = this.player;
    const targetX = input.pointer.x;
    const targetY = input.pointer.y;
    const aim = normalize(targetX - player.x, targetY - player.y);
    const power = input.isDown("ShiftLeft", "ShiftRight") ? 860 : 820;
    this.projectiles.push(
      makeBullet({
        owner: "player",
        x: player.x + aim.x * 24,
        y: player.y + aim.y * 24,
        vx: aim.x * power + player.vx * 0.18,
        vy: aim.y * power + player.vy * 0.18,
        damage: 22,
        radius: 4,
        life: 1.2,
        color: "player",
      })
    );
    this.score += 1;
    this.particles.emitImpact(player.x + aim.x * 18, player.y + aim.y * 18, aim.x, aim.y, 0.35, "#76d7ff");
    this.audio?.playSfx("sfx-laser", { volume: 0.22, rate: randRange(0.95, 1.08) });
  }

  deployTurret() {
    if (this.player.turretCharges <= 0) {
      return;
    }

    const x = clamp(this.player.x + this.player.facing * 36, 70, WIDTH - 70);
    const terrainY = this.terrain.heightAt(x);
    const y = terrainY - TURRET_RADIUS;

    if (this.turrets.some((turret) => Math.abs(turret.x - x) < 48)) {
      this.bonusBanner = "deployment blocked";
      return;
    }

    this.turrets.push(new Turret(x, this.terrain, `${this.wave}-${this.turrets.length}`));
    this.turrets[this.turrets.length - 1].y = y;
    this.player.turretCharges -= 1;
    this.turretCharges = this.player.turretCharges;
    this.turretsBuilt += 1;
    this.commandLog.recordTurretDeployment(this.player.turretCharges);
    this.score += 75;
    this.waveFlash = 0.6;
    this.bonusBanner = "turret deployed";
    this.particles.emitImpact(x, y, 0, -1, 0.7, "#9ef39d");
    this.audio?.playSfx("sfx-laser", { volume: 0.12, rate: 0.85 });
  }

  updateTurrets(dt) {
    for (const turret of this.turrets) {
      turret.update(dt, this);
    }
  }

  updateEnemies(dt) {
    for (const enemy of this.enemies) {
      enemy.wobble += dt * (enemy.type === "bomber" ? 1.5 : 2.4);
      enemy.vx *= Math.pow(0.995, dt * 60);
      enemy.vy *= Math.pow(0.997, dt * 60);

      if (enemy.type === "bomber") {
        this.updateBomber(enemy, dt);
      } else {
        this.updateRaider(enemy, dt);
      }

      enemy.x += enemy.vx * dt;
      enemy.y += enemy.vy * dt;

      if (enemy.grabbed) {
        enemy.grabbed.x = enemy.x;
        enemy.grabbed.y = enemy.y + 18 + Math.sin(this.time * 7 + enemy.wobble) * 2;
      }

      const terrainY = this.terrain.heightAt(enemy.x);
      if (enemy.y + enemy.radius >= terrainY) {
        this.hitEnemyTerrain(enemy);
      }

      if (enemy.x < -80 || enemy.x > WIDTH + 80 || enemy.y < -120 || enemy.y > HEIGHT + 120) {
        if (enemy.grabbed) {
          this.failCivilian(enemy.grabbed, "escaped");
          enemy.grabbed = null;
        }
        enemy.health = 0;
      }

      if (circleHit(enemy.x, enemy.y, enemy.radius, this.player.x, this.player.y, this.player.radius) && this.player.invuln <= 0) {
        this.damagePlayer(enemy.type === "bomber" ? 18 : 12);
        this.burst(enemy.x, enemy.y, 24, 10, "#ff8f7c", "hit");
      }
    }

    this.enemies = this.enemies.filter((enemy) => enemy.health > 0);
  }

  updateRaider(enemy, dt) {
    this.unitAI.updateDogfighter(enemy, this, dt);

    if (!enemy.grabbed) {
      const civilian = this.findNearestCivilian(enemy.x, enemy.y, 48, true);
      if (civilian) {
        enemy.grabbed = civilian;
        civilian.state = "grabbed";
        enemy.escapeTimer = 0;
      }
    } else {
      enemy.escapeTimer += dt;
      enemy.vy -= 20 * dt;
      if (enemy.escapeTimer > 4.5) {
        this.failCivilian(enemy.grabbed, "lost");
        enemy.grabbed = null;
      }
    }
  }

  updateBomber(enemy, dt) {
    this.unitAI.updateBomber(enemy, this, dt);
  }

  hitEnemyTerrain(enemy) {
    if (enemy.grabbed) {
      this.failCivilian(enemy.grabbed, "lost");
      enemy.grabbed = null;
    }

    this.burst(enemy.x, enemy.y, enemy.type === "bomber" ? 34 : 24, enemy.type === "bomber" ? 16 : 12, "#ff8f7c", "terrain");
    this.commandLog.recordCombat(`${enemy.type} wrecked on terrain`, "loss");
    enemy.health = 0;
  }

  updateBombs(dt) {
    for (const bomb of this.bombs) {
      bomb.life -= dt;
      bomb.vy += 320 * dt;
      bomb.x += bomb.vx * dt;
      bomb.y += bomb.vy * dt;

      const terrainY = this.terrain.heightAt(bomb.x);
      if (bomb.y + bomb.radius >= terrainY || bomb.life <= 0) {
        this.explodeAt(bomb.x, terrainY, bomb.damage * 1.4, 36, 26, "#ff8f7c", "bomb");
        this.commandLog.recordCombat("bomb impact", "combat");
        this.audio?.playSfx("sfx-explosion", { volume: 0.18, rate: randRange(0.9, 1.04) });
        bomb.life = 0;
      }
    }
    this.bombs = this.bombs.filter((bomb) => bomb.life > 0);
  }

  updateProjectiles(dt) {
    for (const projectile of this.projectiles) {
      projectile.life -= dt;
      projectile.x += projectile.vx * dt;
      projectile.y += projectile.vy * dt;

      if (projectile.x < -50 || projectile.x > WIDTH + 50 || projectile.y < -50 || projectile.y > HEIGHT + 50) {
        projectile.life = 0;
        continue;
      }

      const terrainY = this.terrain.heightAt(projectile.x);
      if (projectile.y + projectile.radius >= terrainY) {
        this.terrain.deform(projectile.x, projectile.explosive ? 20 : 12, projectile.explosive ? 12 : 7);
        this.burst(projectile.x, terrainY, projectile.explosive ? 26 : 16, 10, "#76d7ff", "impact");
        this.particles.emitTerrainDebris(projectile.x, terrainY, projectile.explosive ? 1.2 : 0.8);
        this.audio?.playSfx("sfx-explosion", { volume: 0.12, rate: randRange(0.92, 1.12) });
        projectile.life = 0;
        continue;
      }

      if (projectile.owner === "player" || projectile.owner === "turret") {
        const hitEnemy = this.enemies.find((enemy) => circleHit(projectile.x, projectile.y, projectile.radius, enemy.x, enemy.y, enemy.radius));
        if (hitEnemy) {
          this.damageEnemy(hitEnemy, projectile.damage, projectile.owner);
          this.particles.emitImpact(projectile.x, projectile.y, projectile.vx, projectile.vy, 0.75, projectile.color === "turret" ? "#9ef39d" : "#76d7ff");
          this.audio?.playSfx("sfx-explosion", { volume: 0.16, rate: randRange(0.92, 1.08) });
          projectile.life = 0;
          continue;
        }

        const hitCivilian = this.civilians.find((civilian) => civilian.state === "alive" && circleHit(projectile.x, projectile.y, projectile.radius, civilian.x, civilian.y, civilian.radius));
        if (hitCivilian) {
          this.failCivilian(hitCivilian, "friendly fire");
          this.particles.emitImpact(projectile.x, projectile.y, projectile.vx, projectile.vy, 0.65, "#ff8f7c");
          this.audio?.playSfx("sfx-explosion", { volume: 0.1, rate: 0.85 });
          projectile.life = 0;
        }
      }
    }

    this.projectiles = this.projectiles.filter((projectile) => projectile.life > 0);
  }

  updateCivilians(dt) {
    for (const civilian of this.civilians) {
      civilian.update(dt, this.terrain);
      if (civilian.state === "grabbed") {
        civilian.y = Math.min(civilian.y, HEIGHT - 60);
      }
    }
  }

  updateParticles(dt) {
    this.particles.update(dt);
  }

  checkWaveFlow(dt) {
    if (this.waveState === "active") {
      this.spawnTimer -= dt;
      if (this.spawnQueue.length > 0 && this.spawnTimer <= 0) {
        this.spawnEnemy(this.spawnQueue.shift());
        this.waveEnemiesSpawned += 1;
        this.spawnTimer = Math.max(0.28, 0.88 - this.wave * 0.08);
      }

      if (this.spawnQueue.length === 0 && this.enemies.length === 0) {
        this.waveState = "clearing";
        this.intermissionTimer = 0;
        this.rescueSurvivors();
        this.phaseLabel = "clear";
        this.score += 250 * Math.max(1, this.rescuedThisWave);
        this.bonusBanner = `${this.rescuedThisWave} civilians rescued`;
      } else if (this.civiliansAlive <= 2) {
        this.phaseLabel = "critical";
      } else {
        this.phaseLabel = `wave ${this.wave}/${this.maxWaves}`;
      }
    }

    if (this.waveState === "clearing") {
      this.intermissionTimer += dt;
      if (this.intermissionTimer >= 1.65) {
        if (this.wave >= this.maxWaves) {
          this.finish("win", "final wave cleared");
          return;
        }
        this.setWave(this.wave + 1);
      }
    }
  }

  rescueSurvivors() {
    const survivors = this.civilians.filter((civilian) => civilian.state === "alive");
    for (const civilian of survivors) {
      civilian.state = "rescued";
    }
    this.rescuedThisWave = survivors.length;
    this.rescuedTotal += survivors.length;
    this.score += survivors.length * 180;
    if (survivors.length === 0) {
      this.bonusBanner = "no survivors";
    } else {
      this.commandLog.recordSupport(`${survivors.length} civilians rescued`);
    }
  }

  spawnEnemy(type) {
    const side = Math.random() < 0.5 ? -1 : 1;
    const x = side < 0 ? -60 : WIDTH + 60;
    const y = type === "bomber" ? randRange(110, 220) : randRange(70, 320);
    this.enemies.push(new Enemy(type, x, y, side, this.wave));
  }

  damageEnemy(enemy, amount, source) {
    if (enemy.takeDamage(amount)) {
      if (enemy.grabbed) {
        enemy.grabbed.state = "alive";
        enemy.grabbed.x = clamp(enemy.x, CIVILIAN_SPAWN_MARGIN, WIDTH - CIVILIAN_SPAWN_MARGIN);
        enemy.grabbed.y = this.terrain.heightAt(enemy.grabbed.x) - enemy.grabbed.radius;
        enemy.grabbed = null;
      }
      this.enemiesDestroyed += 1;
      this.score += enemy.type === "bomber" ? 180 : 120;
      this.burst(enemy.x, enemy.y, enemy.type === "bomber" ? 38 : 30, enemy.type === "bomber" ? 18 : 12, "#ff8f7c", source === "turret" ? "turret-hit" : "hit");
      this.commandLog.recordCombat(`${source === "turret" ? "turret" : "ship"} destroyed ${enemy.type}`, "combat");
      this.audio?.playSfx("sfx-explosion", { volume: enemy.type === "bomber" ? 0.22 : 0.16, rate: randRange(0.9, 1.06) });
    }
  }

  damagePlayer(amount) {
    this.player.health = clamp(this.player.health - amount, 0, this.player.maxHealth);
    this.player.invuln = 0.65;
    this.score = Math.max(0, this.score - 35);
    this.burst(this.player.x, this.player.y, 24, 12, "#76d7ff", "player-hit");
    this.commandLog.recordCombat("ship shield struck", "combat");
    this.audio?.playSfx("sfx-explosion", { volume: 0.08, rate: 0.8 });
  }

  failCivilian(civilian, reason) {
    if (civilian.state === "lost" || civilian.state === "rescued") {
      return;
    }
    civilian.state = "lost";
    this.lostTotal += 1;
    this.score = Math.max(0, this.score - 80);
    this.burst(civilian.x, civilian.y, 22, 8, "#ff8f7c", reason);
    this.commandLog.recordLoss(`civilian lost - ${reason}`);
  }

  burst(x, y, radius, duration, color, kind) {
    const intensity = clamp(radius / 28, 0.4, 2);
    if (kind === "terrain" || kind === "bomb") {
      this.particles.emitExplosion(x, y, radius, color, intensity, kind);
      this.particles.emitTerrainDebris(x, y, intensity, "rgba(120, 100, 75, 0.96)");
      return;
    }

    if (kind === "player-hit" || kind === "hit" || kind === "turret-hit") {
      this.particles.emitImpact(x, y, 0, -1, intensity, color);
      return;
    }

    this.particles.emitExplosion(x, y, radius, color, intensity, kind);
  }

  explodeAt(x, y, damage, terrainRadius, terrainDepth, color, kind) {
    this.terrain.deform(x, terrainRadius, terrainDepth);
    this.burst(x, y, terrainRadius * 1.1, 0.72, color, kind);
    this.applyAreaDamage(x, y, damage, terrainRadius);
    this.particles.emitTerrainDebris(x, y, clamp(terrainRadius / 20, 0.8, 2));
  }

  applyAreaDamage(x, y, damage, radius) {
    for (const enemy of this.enemies) {
      const falloff = 1 - clamp(Math.sqrt(distanceSq(x, y, enemy.x, enemy.y)) / radius, 0, 1);
      if (falloff > 0) {
        this.damageEnemy(enemy, damage * falloff, "blast");
      }
    }

    for (const turret of this.turrets) {
      const falloff = 1 - clamp(Math.sqrt(distanceSq(x, y, turret.x, turret.y)) / radius, 0, 1);
      if (falloff > 0) {
        turret.health -= damage * falloff * 0.8;
      }
    }
    this.turrets = this.turrets.filter((turret) => turret.health > 0);

    const playerFalloff = 1 - clamp(Math.sqrt(distanceSq(x, y, this.player.x, this.player.y)) / radius, 0, 1);
    if (playerFalloff > 0) {
      this.damagePlayer(damage * playerFalloff * 0.55);
    }

    for (const civilian of this.civilians) {
      if (civilian.state !== "alive") {
        continue;
      }
      const falloff = 1 - clamp(Math.sqrt(distanceSq(x, y, civilian.x, civilian.y)) / radius, 0, 1);
      if (falloff > 0.2) {
        this.failCivilian(civilian, "blast");
      }
    }
  }

  finish(status, reason) {
    this.status = status;
    this.finishReason = reason;
    this.phaseLabel = status === "win" ? "mission complete" : "mission failed";
    this.commandLog.recordSupport(status === "win" ? "mission complete" : `mission failed - ${reason}`);
  }

  findNearestEnemy(x, y, radius) {
    let best = null;
    let bestDistance = radius * radius;
    for (const enemy of this.enemies) {
      const dist = distanceSq(x, y, enemy.x, enemy.y);
      if (dist < bestDistance) {
        best = enemy;
        bestDistance = dist;
      }
    }
    return best;
  }

  findNearestCivilian(x, y, radius, requireAlive = false) {
    let best = null;
    let bestDistance = radius * radius;
    for (const civilian of this.civilians) {
      if (requireAlive && civilian.state !== "alive") {
        continue;
      }
      const dist = distanceSq(x, y, civilian.x, civilian.y);
      if (dist < bestDistance) {
        best = civilian;
        bestDistance = dist;
      }
    }
    return best;
  }

  launchBomb(enemy, target) {
    const aim = normalize(target.x - enemy.x, target.y - enemy.y);
    this.bombs.push(new Bomb(enemy.x + aim.x * 18, enemy.y + 16, aim.x * 80, 240 + Math.max(0, aim.y * 90), 22));
  }
}
