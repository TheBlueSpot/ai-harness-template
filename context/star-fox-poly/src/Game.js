import { clamp, projectPoint } from "./math.js";
import { BOSS_CORE, buildWaveState, createBossState, enemyProjectilePattern, enemySpeedForProgress, isBossCoreOpen } from "./enemies.js";
import { computeRailOffset, getObstacleWindow, laneToX, progressToStage, RAIL_LENGTH } from "./rail.js";

const PLAYER_FIRE_KEYS = ["Space", "KeyZ", "KeyX"];
const PLAYER_MAX_HEALTH = 100;
const PLAYER_BASE_SPEED = 78;
const PLAYER_BOSS_HOLD = BOSS_CORE.entryAt + 80;
const PLAYER_CLEAR_TARGET = RAIL_LENGTH;
const PLAYER_INTRO_DISTANCE = 1320;
const PLAYER_INTRO_SPEED = 44;
const PLAYER_LANE_SNAP_SPEED = 10.4;
const PLAYER_SHIP_SNAP_SPEED = 640;
const PLAYER_REPEAT_DELAY = 0.28;
const PLAYER_REPEAT_DELAY_HELD = 0.18;
const PLAYER_DODGE_GRACE = 0.18;

function isFireHeld(held) {
  return PLAYER_FIRE_KEYS.some((key) => Boolean(held[key]));
}

function approach(current, target, delta) {
  if (current < target) return Math.min(target, current + delta);
  if (current > target) return Math.max(target, current - delta);
  return target;
}

function normalizeSteer(held) {
  return (held.ArrowRight || held.KeyD ? 1 : 0) - (held.ArrowLeft || held.KeyA ? 1 : 0);
}

export class Game {
  constructor(options = {}) {
    this.options = options;
    this.width = options.width ?? 1280;
    this.height = options.height ?? 720;
    this.dpr = options.dpr ?? 1;
    this.starSeed = Array.from({ length: 96 }, (_, index) => ({
      x: ((index * 97) % 1000) / 1000,
      y: ((index * 57) % 1000) / 1000,
      s: 1 + (index % 3),
    }));
    this.restart();
  }

  start() {
    this.started = true;
    if (this.mode === "menu") {
      this.mode = "play";
      this.alert = "Squadron inbound";
    }
  }

  restart() {
    this.started = false;
    this.mode = "menu";
    this.time = 0;
    this.score = 0;
    this.health = PLAYER_MAX_HEALTH;
    this.progress = 0;
    this.clearProgress = 0;
    this.alert = "Mission ready";
    this.bossAlert = "";
    this.win = false;
    this.lose = false;
    this.player = {
      lane: 2,
      targetLane: 2,
      x: 0,
      y: 0,
      z: 0,
      bank: 0,
      fireCooldown: 0,
      invuln: 0,
      dodgeGrace: 0,
      steerHold: 0,
      steerRepeatCooldown: 0,
    };
    this.camera = { x: 0, y: 0, z: 0 };
    this.enemies = [];
    this.playerShots = [];
    this.enemyShots = [];
    this.effects = [];
    this.boss = createBossState();
    this.spawnedFormations = new Set();
    this.completed = false;
  }

  resize(width, height) {
    if (typeof width === "object" && width) {
      this.width = width.width ?? this.width;
      this.height = width.height ?? this.height;
      this.dpr = width.dpr ?? this.dpr;
      return;
    }
    this.width = width ?? this.width;
    this.height = height ?? this.height;
  }

  update(dt, input = {}) {
    const pressed = input.pressed || {};
    const held = input.held || {};
    this.time += dt;

    if (this.mode === "menu") {
      this.alert = "Press Start";
      if (pressed.Enter || pressed.Space) this.start();
      return;
    }

    if ((this.win || this.lose) && (pressed.Enter || pressed.Space)) {
      this.restart();
      this.start();
      return;
    }

    if (this.win || this.lose) {
      this.updateEffects(dt);
      return;
    }

    this.updatePlayer(dt, held, pressed, input.pointerLane, input.lastSource);
    this.updateProgress(dt);
    this.spawnEnemies();
    this.updateEnemies(dt);
    this.updateBoss(dt);
    this.updateShots(dt, held);
    this.resolveObstacles();
    this.resolveCollisions();
    this.updateEffects(dt);
    this.syncAlerts();

    if (this.health <= 0) {
      this.health = 0;
      this.lose = true;
      this.mode = "lose";
      this.alert = "Hull failed";
    }

    if (!this.completed && this.boss.hp <= 0) {
      this.completed = true;
      this.boss.phase = "down";
      this.bossAlert = "Core broken";
      this.alert = "Break formation";
    }

    if (this.completed) {
      this.clearProgress = clamp(this.clearProgress + dt * 180, 0, PLAYER_CLEAR_TARGET - BOSS_CORE.entryAt);
      this.progress = clamp(PLAYER_BOSS_HOLD + this.clearProgress, 0, PLAYER_CLEAR_TARGET);
      if (this.progress >= PLAYER_CLEAR_TARGET) {
        this.win = true;
        this.mode = "win";
      }
    }
  }

  stepPlayerLane(direction) {
    if (!direction) return;
    const nextLane = clamp(Math.round(this.player.targetLane + direction), 0, 4);
    if (nextLane === this.player.targetLane) return;
    this.player.targetLane = nextLane;
    this.player.dodgeGrace = PLAYER_DODGE_GRACE;
  }

  getPlayerLaneDistance(lane) {
    const currentDistance = Math.abs(lane - this.player.lane);
    const targetDistance = Math.abs(lane - this.player.targetLane);
    if (Math.abs(this.player.targetLane - this.player.lane) > 0.08) {
      const targetBias = this.player.dodgeGrace > 0 ? 0.38 : 0.28;
      return Math.min(currentDistance, Math.max(0, targetDistance - targetBias));
    }
    return currentDistance;
  }

  updatePlayer(dt, held, pressed, pointerLane = null, inputSource = "keyboard") {
    const steerHeld = normalizeSteer(held);
    const steerPressed = (pressed.ArrowRight || pressed.KeyD ? 1 : 0) - (pressed.ArrowLeft || pressed.KeyA ? 1 : 0);
    const usingPointer = Number.isFinite(pointerLane) && inputSource === "pointer";

    if (usingPointer) {
      const nextLane = clamp(Math.round(pointerLane), 0, 4);
      if (nextLane !== this.player.targetLane) {
        this.player.targetLane = nextLane;
        this.player.dodgeGrace = PLAYER_DODGE_GRACE;
      }
      this.player.steerHold = 0;
      this.player.steerRepeatCooldown = 0;
    } else if (steerPressed) {
      this.stepPlayerLane(steerPressed);
      this.player.steerRepeatCooldown = PLAYER_REPEAT_DELAY;
      this.player.steerHold = steerHeld;
    } else if (steerHeld) {
      if (this.player.steerHold !== steerHeld) {
        this.player.steerHold = steerHeld;
        this.player.steerRepeatCooldown = PLAYER_REPEAT_DELAY;
      } else {
        this.player.steerRepeatCooldown -= dt;
        if (this.player.steerRepeatCooldown <= 0 && Math.abs(this.player.targetLane - this.player.lane) <= 0.08) {
          this.stepPlayerLane(steerHeld);
          this.player.steerRepeatCooldown = PLAYER_REPEAT_DELAY_HELD;
        }
      }
    } else {
      this.player.steerHold = 0;
      this.player.steerRepeatCooldown = 0;
    }

    this.player.lane = approach(this.player.lane, this.player.targetLane, dt * PLAYER_LANE_SNAP_SPEED);
    const rail = computeRailOffset(this.progress);
    const laneX = laneToX(this.player.lane, rail.sway * 0.6);
    this.player.x = approach(this.player.x, laneX, dt * PLAYER_SHIP_SNAP_SPEED);
    this.player.y = Math.sin(this.time * 4.2) * 7 + rail.sway * 28;
    this.player.bank = approach(this.player.bank, (this.player.targetLane - this.player.lane) * 0.88 + steerHeld * 0.34, dt * 9.5);
    this.player.z = this.progress + 90;
    this.camera.x = this.player.x * 0.16;
    this.camera.y = this.player.y * 0.14;
    this.camera.z = this.progress - 40;
    this.player.fireCooldown = Math.max(0, this.player.fireCooldown - dt);
    this.player.invuln = Math.max(0, this.player.invuln - dt);
    this.player.dodgeGrace = Math.max(0, this.player.dodgeGrace - dt);
  }

  updateProgress(dt) {
    if (this.completed) return;
    if (this.progress < BOSS_CORE.entryAt - 160) {
      const stageProgress = progressToStage(this.progress);
      const introBlend = clamp(this.progress / PLAYER_INTRO_DISTANCE, 0, 1);
      const cruiseSpeed = PLAYER_BASE_SPEED + stageProgress * 40;
      const forwardSpeed = approach(PLAYER_INTRO_SPEED, cruiseSpeed, introBlend * (cruiseSpeed - PLAYER_INTRO_SPEED));
      this.progress = clamp(this.progress + dt * forwardSpeed, 0, BOSS_CORE.entryAt - 160);
      return;
    }
    if (!this.boss.spawned) {
      this.progress = clamp(this.progress + dt * 92, 0, PLAYER_BOSS_HOLD);
    } else {
      this.progress = approach(this.progress, PLAYER_BOSS_HOLD, dt * 120);
    }
  }

  spawnEnemies() {
    for (const formation of buildWaveState(this.progress)) {
      if (this.spawnedFormations.has(formation.at) || this.progress < formation.at - 520) continue;
      this.spawnedFormations.add(formation.at);
      const laneCenter = formation.lanes.reduce((sum, lane) => sum + lane, 0) / formation.lanes.length;
      formation.lanes.forEach((lane, index) => {
        this.enemies.push({
          id: `${formation.type}-${formation.at}-${index}`,
          kind: formation.type,
          lane,
          x: laneToX(lane),
          z: formation.at + 440 + index * 48,
          y: (index - (formation.lanes.length - 1) * 0.5) * 18,
          hp: formation.hp,
          seed: formation.at * 0.01 + index,
          age: 0,
          score: formation.score,
          aggression: formation.aggression,
          laneCenter,
        });
      });
    }

    if (this.progress >= BOSS_CORE.entryAt - 100 && !this.boss.spawned) {
      this.boss.spawned = true;
      this.boss.phase = "shield";
      this.alert = "Boss class target";
    }
  }

  updateEnemies(dt) {
    const stageProgress = progressToStage(this.progress);
    for (const enemy of this.enemies) {
      enemy.age += dt;
      const drift = Math.sin(enemy.age * 3.8 + enemy.seed) * 0.85;
      enemy.lane = clamp(enemy.lane + drift * dt * enemy.aggression, 0, 4);
      enemy.x = laneToX(enemy.lane);
      enemy.z -= enemySpeedForProgress(enemy.z, stageProgress) * dt;
      enemy.y = Math.sin(enemy.age * 5 + enemy.seed) * 22 + (enemy.lane - enemy.laneCenter) * 6;
      const shot = enemyProjectilePattern(enemy, enemy.age, stageProgress);
      if (shot && enemy.z > this.progress + 120) {
        this.enemyShots.push({
          lane: enemy.lane,
          x: enemy.x,
          y: enemy.y,
          z: enemy.z,
          speed: shot.speed,
          damage: shot.damage,
          color: "#ff8e66",
        });
      }
    }

    this.enemies = this.enemies.filter((enemy) => enemy.z > this.progress - 120 && enemy.hp > 0);
  }

  updateBoss(dt) {
    if (!this.boss.spawned || this.boss.hp <= 0) return;
    const coreOpen = isBossCoreOpen(this.boss);
    const coreWeakpoint = this.boss.weakpoints.find((weakpoint) => weakpoint.id === "core");
    this.boss.phase = coreOpen ? "core" : "shield";

    for (const weakpoint of this.boss.weakpoints) {
      if (weakpoint.id === "core") {
        weakpoint.open = coreOpen;
      } else {
        weakpoint.open = weakpoint.hp > 0;
      }
    }

    if (coreWeakpoint && coreWeakpoint.hp <= 0) {
      this.boss.hp = 0;
      return;
    }

    const bossAge = this.time - 4;
    if (bossAge > 0 && Math.floor(bossAge * (coreOpen ? 1.3 : 0.9)) !== Math.floor((bossAge - dt) * (coreOpen ? 1.3 : 0.9))) {
      const liveCannons = this.boss.weakpoints.filter((weakpoint) => weakpoint.id !== "core" && weakpoint.hp > 0);
      const firingPorts = liveCannons.length ? liveCannons : [this.boss.weakpoints.find((weakpoint) => weakpoint.id === "core")];
      for (const weakpoint of firingPorts) {
        this.enemyShots.push({
          lane: weakpoint.lane,
          x: laneToX(weakpoint.lane),
          y: weakpoint.id === "core" ? 18 : weakpoint.lane === 1 ? -42 : 42,
          z: this.progress + 320,
          speed: coreOpen ? 252 : 210,
          damage: coreOpen ? 6 : 5,
          color: coreOpen ? "#ff5c94" : "#ffd768",
        });
      }
    }
  }

  getAutoAimLane() {
    if (this.boss.spawned && this.boss.hp > 0) {
      const bossTarget = this.boss.weakpoints.find(
        (weakpoint) => weakpoint.open && weakpoint.hp > 0 && Math.abs(weakpoint.lane - this.player.targetLane) <= 1.35,
      );
      if (bossTarget) return bossTarget.lane;
    }

    const enemyTarget = this.enemies
      .filter((enemy) => enemy.z > this.progress + 120 && Math.abs(enemy.lane - this.player.targetLane) <= 1.35)
      .sort((a, b) => a.z - b.z)[0];
    return enemyTarget?.lane ?? this.player.targetLane;
  }

  updateShots(dt, held) {
    const fireHeld = isFireHeld(held);
    if (fireHeld && this.player.fireCooldown <= 0) {
      this.player.fireCooldown = this.completed ? 0.08 : this.boss.spawned ? 0.095 : 0.13;
      const shotLane = this.getAutoAimLane();
      this.playerShots.push({
        lane: shotLane,
        x: laneToX(shotLane),
        y: this.player.y,
        z: this.progress + 85,
        speed: this.boss.spawned ? 1040 : 920,
        damage: this.boss.spawned ? 2 : 1,
      });
    }

    for (const shot of this.playerShots) {
      shot.z += shot.speed * dt;
    }
    this.playerShots = this.playerShots.filter((shot) => !shot.dead && shot.z < this.progress + 1200);

    for (const shot of this.enemyShots) {
      shot.z -= shot.speed * dt;
    }
    this.enemyShots = this.enemyShots.filter((shot) => !shot.dead && shot.z > this.progress - 120);
  }

  resolveObstacles() {
    if (this.player.invuln > 0) return;
    for (const obstacle of getObstacleWindow(this.progress, 70)) {
      if (this.getPlayerLaneDistance(obstacle.lane) > 0.34) continue;
      if (obstacle.z > this.progress + 26) continue;
      this.health -= obstacle.kind === "turret" ? 12 : 8;
      this.player.invuln = 0.62;
      this.effects.push({ text: obstacle.kind === "turret" ? "turret hit" : "scrape", ttl: 0.45 });
      break;
    }
  }

  resolveCollisions() {
    for (const shot of this.playerShots) {
      for (const enemy of this.enemies) {
        if (Math.abs(shot.lane - enemy.lane) > 0.75) continue;
        if (Math.abs(shot.z - enemy.z) > 60) continue;
        enemy.hp -= shot.damage;
        shot.dead = true;
        if (enemy.hp <= 0) {
          this.score += enemy.score;
          this.effects.push({ text: `+${enemy.score}`, ttl: 0.5 });
        }
        break;
      }
      if (shot.dead || !this.boss.spawned || this.boss.hp <= 0) continue;
      for (const weakpoint of this.boss.weakpoints) {
        if (!weakpoint.open || weakpoint.hp <= 0) continue;
        if (Math.abs(shot.lane - weakpoint.lane) > 0.85) continue;
        if (Math.abs(shot.z - (this.progress + 320)) > 92) continue;
        weakpoint.hp = Math.max(0, weakpoint.hp - shot.damage);
        this.score += weakpoint.id === "core" ? 160 : 90;
        if (weakpoint.id === "core") {
          this.boss.hp = Math.max(0, this.boss.hp - shot.damage);
        }
        shot.dead = true;
        this.effects.push({ text: weakpoint.id === "core" ? "core hit" : "armor crack", ttl: 0.42 });
        break;
      }
    }
    this.playerShots = this.playerShots.filter((shot) => !shot.dead);

    if (this.player.invuln <= 0) {
      for (const shot of this.enemyShots) {
        if (this.getPlayerLaneDistance(shot.lane) > 0.34) continue;
        if (Math.abs(shot.z - this.progress) > 42) continue;
        this.health -= shot.damage;
        this.player.invuln = 0.62;
        shot.dead = true;
        this.effects.push({ text: "impact", ttl: 0.35 });
        break;
      }
    }
    this.enemyShots = this.enemyShots.filter((shot) => !shot.dead);

    if (this.player.invuln <= 0) {
      for (const enemy of this.enemies) {
        if (this.getPlayerLaneDistance(enemy.lane) > 0.4) continue;
        if (Math.abs(enemy.z - this.progress) > 48) continue;
        this.health -= 14;
        this.player.invuln = 0.74;
        enemy.hp = 0;
        this.effects.push({ text: "collision", ttl: 0.4 });
        break;
      }
      this.enemies = this.enemies.filter((enemy) => enemy.hp > 0);
    }
  }

  updateEffects(dt) {
    for (const effect of this.effects) effect.ttl -= dt;
    this.effects = this.effects.filter((effect) => effect.ttl > 0);
  }

  syncAlerts() {
    if (this.completed) {
      this.alert = "Return vector";
      this.bossAlert = "Core broken";
      return;
    }

    if (this.boss.spawned) {
      this.bossAlert = isBossCoreOpen(this.boss) ? "Core exposed" : "Break the side pods";
      this.alert = this.boss.phase === "core" ? "Finish the carrier" : "Shielded target";
      return;
    }

    const obstacles = getObstacleWindow(this.progress, 340);
    this.bossAlert = "";
    if (obstacles.length) {
      this.alert = `Shift to lane ${obstacles[0].lane + 1}`;
    } else if (this.enemies.length) {
      this.alert = "Hold lane, fire through";
    } else {
      this.alert = "Clear corridor";
    }
  }

  render(ctx) {
    const width = this.width;
    const height = this.height;
    ctx.clearRect(0, 0, width, height);

    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, "#051322");
    sky.addColorStop(0.62, "#081c32");
    sky.addColorStop(1, "#02060b");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    this.renderStars(ctx, width, height);
    this.renderRail(ctx, width, height);
    this.renderObstacles(ctx, width, height);
    this.renderEnemies(ctx, width, height);
    this.renderBoss(ctx, width, height);
    this.renderShots(ctx, width, height);
    this.renderPlayer(ctx, width, height);
    this.renderEffects(ctx, width, height);
  }

  renderStars(ctx, width, height) {
    for (const star of this.starSeed) {
      const shift = (this.time * 0.03 * star.s + star.x) % 1;
      const x = (shift * width + this.player.bank * 26) % width;
      const y = (star.y * height * 0.72 + this.time * 20 * star.s) % (height * 0.82);
      ctx.fillStyle = `rgba(255,255,255,${0.35 + star.s * 0.14})`;
      ctx.fillRect(x, y, star.s, star.s);
    }
  }

  renderRail(ctx, width, height) {
    const horizon = height * 0.32;
    const floorTop = height * 0.45;
    const railShift = this.player.bank * 32;
    ctx.fillStyle = "rgba(9, 25, 40, 0.95)";
    ctx.beginPath();
    ctx.moveTo(width * 0.38 + railShift, floorTop);
    ctx.lineTo(width * 0.62 + railShift, floorTop);
    ctx.lineTo(width * 0.94, height);
    ctx.lineTo(width * 0.06, height);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(122, 228, 255, 0.12)";
    ctx.fillRect(0, horizon, width, height - horizon);

    ctx.strokeStyle = "rgba(122, 228, 255, 0.18)";
    ctx.lineWidth = 2;
    for (let lane = 0; lane <= 4; lane++) {
      const t = lane / 4;
      ctx.beginPath();
      ctx.moveTo(width * (0.38 + t * 0.24) + railShift, floorTop);
      ctx.lineTo(width * (0.06 + t * 0.88), height);
      ctx.stroke();
    }
  }

  renderObstacles(ctx, width, height) {
    for (const obstacle of getObstacleWindow(this.progress, 900)) {
      const point = projectPoint(
        { x: laneToX(obstacle.lane), y: obstacle.kind === "turret" ? -8 : 20, z: obstacle.z },
        this.camera,
        width,
        height,
      );
      if (point.depth <= 0 || point.depth > 8) continue;
      const size = 90 * point.scale;
      ctx.fillStyle = obstacle.kind === "turret" ? "#f97171" : obstacle.kind === "drone" ? "#ffd768" : "#4ac6ff";
      ctx.fillRect(point.x - size * 0.5, point.y - size * 0.2, size, size * 0.35);
    }
  }

  renderEnemies(ctx, width, height) {
    for (const enemy of this.enemies) {
      const point = projectPoint(enemy, this.camera, width, height);
      if (point.depth <= 0 || point.depth > 8) continue;
      const size = 88 * point.scale;
      ctx.save();
      ctx.translate(point.x, point.y);
      ctx.fillStyle = "#ffd768";
      ctx.beginPath();
      ctx.moveTo(0, -size * 0.34);
      ctx.lineTo(size * 0.45, size * 0.16);
      ctx.lineTo(0, size * 0.28);
      ctx.lineTo(-size * 0.45, size * 0.16);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(6, 18, 37, 0.92)";
      ctx.lineWidth = Math.max(1, 2 * point.scale);
      ctx.stroke();
      ctx.restore();
    }
  }

  renderBoss(ctx, width, height) {
    if (!this.boss.spawned || this.boss.hp <= 0) return;
    const body = projectPoint({ x: 0, y: 0, z: this.progress + 320 }, this.camera, width, height);
    const bodyWidth = 290 * body.scale;
    const bodyHeight = 180 * body.scale;
    ctx.fillStyle = "#334b63";
    ctx.fillRect(body.x - bodyWidth * 0.5, body.y - bodyHeight * 0.4, bodyWidth, bodyHeight * 0.8);

    for (const weakpoint of this.boss.weakpoints) {
      const point = projectPoint(
        { x: laneToX(weakpoint.lane), y: weakpoint.id === "core" ? 18 : weakpoint.lane === 1 ? -44 : 44, z: this.progress + 320 },
        this.camera,
        width,
        height,
      );
      const size = weakpoint.id === "core" ? 72 * point.scale : 56 * point.scale;
      ctx.fillStyle = weakpoint.id === "core" ? (weakpoint.open ? "#ff5c94" : "#4c5f74") : weakpoint.hp > 0 ? "#ffd768" : "#2a3644";
      ctx.beginPath();
      ctx.arc(point.x, point.y, size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  renderShots(ctx, width, height) {
    for (const shot of this.playerShots) {
      const point = projectPoint({ x: shot.x, y: shot.y, z: shot.z }, this.camera, width, height);
      if (point.depth <= 0 || point.depth > 8) continue;
      ctx.fillStyle = "#7ae4ff";
      ctx.fillRect(point.x - 2, point.y - 8 * point.scale, 4, 16 * point.scale);
    }

    for (const shot of this.enemyShots) {
      const point = projectPoint({ x: shot.x, y: shot.y, z: shot.z }, this.camera, width, height);
      if (point.depth <= 0 || point.depth > 8) continue;
      ctx.fillStyle = shot.color || "#ff8e66";
      ctx.fillRect(point.x - 3, point.y - 7 * point.scale, 6, 14 * point.scale);
    }
  }

  renderPlayer(ctx, width, height) {
    const x = width * 0.5 + this.player.x * 0.55;
    const y = height * 0.78 + this.player.y * 0.5;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(this.player.bank * 0.28);
    ctx.fillStyle = this.player.invuln > 0 ? "rgba(122, 228, 255, 0.6)" : "#e8f4ff";
    ctx.beginPath();
    ctx.moveTo(0, -26);
    ctx.lineTo(22, 10);
    ctx.lineTo(0, 18);
    ctx.lineTo(-22, 10);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#ff6d7a";
    ctx.fillRect(-4, 8, 8, 20);
    ctx.restore();
  }

  renderEffects(ctx, width, height) {
    if (!this.effects.length) return;
    ctx.save();
    ctx.font = "600 18px Trebuchet MS";
    ctx.textAlign = "center";
    this.effects.forEach((effect, index) => {
      const alpha = clamp(effect.ttl / 0.5, 0, 1);
      ctx.fillStyle = `rgba(255, 206, 86, ${alpha})`;
      ctx.fillText(effect.text.toUpperCase(), width * 0.5, height * (0.24 + index * 0.04));
    });
    ctx.restore();
  }

  getFrameState() {
    const bossWeakpoints = this.boss.weakpoints.map((weakpoint) => ({
      id: weakpoint.id,
      hp: weakpoint.hp,
      open: weakpoint.open,
    }));

    return {
      mode: this.mode,
      health: this.health,
      score: this.score,
      progress: progressToStage(this.progress) * 100,
      alert: this.alert,
      bossAlert: this.bossAlert,
      bossStatus: {
        hp: this.boss.hp,
        open: isBossCoreOpen(this.boss),
        phase: this.boss.phase,
        weakpoints: bossWeakpoints,
      },
      overlayEyebrow: this.mode === "menu" ? "Mission" : this.win ? "Victory" : this.lose ? "Failure" : "Flight",
      overlayTitle: this.win ? "Sector Cleared" : this.lose ? "Ship Down" : "Star Fox Polygon Strike",
      overlayCopy:
        this.mode === "menu"
          ? "Tap anywhere or press Start to launch. Use mouse, A/D, or arrow keys to dodge lanes, then hold Space to auto-fire while the first wave eases you into the route."
          : this.win
            ? "Boss core broken. Press Start to run the route again."
            : this.lose
              ? "Hull failed. Tap anywhere or press Start to retry."
              : "",
      overlayButton: this.mode === "menu" ? "Start" : this.win || this.lose ? "Restart" : "Hide",
      showRestart: this.win || this.lose,
      showWin: this.win,
      showLose: this.lose,
    };
  }
}
