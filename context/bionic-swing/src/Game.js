import { createLevel } from "./level.js";

const GRAVITY = 972;
const MOVE_SPEED = 352;
const GROUND_ACCEL = 2100;
const GROUND_FRICTION = 1100;
const AIR_ACCEL = 900;
const JUMP_SPEED = 620;
const MAX_FALL = 1100;
const MAX_HEALTH = 5;
const PLAYER_W = 28;
const PLAYER_H = 54;
const GRAPPLE_SCREEN_PAD = 120;
const EFFECT_LIFE = 0.35;
const BOUNCE_MIN_SPEED = 180;
const SWING_PUMP_ACCEL = 1200;
const GRAPPLE_CAST_SPEED = 1000;
const GRAPPLE_RELEASE_BOOST = 110;
const GRAPPLE_LATCH_SLACK_MIN = 22;
const GRAPPLE_LATCH_SLACK_MAX = 160;
const GRAPPLE_LATCH_SLACK_FACTOR = 0.16;
const SAFE_TURRET_GRACE = 0.22;
const HIT_TURRET_BREATHER = 0.7;
const HIT_TURRET_RESET_RADIUS = 760;
const INVULN_TIME = 2.5;
const HIT_SLOW_TIME = 0.12;
const HIT_SLOW_SCALE = 0.35;
const FLASH_DECAY = 2.6;
const FLOW_SPEED_THRESHOLD = 540;
const FLOW_SPEED_MAX = 1220;
const FLOW_MAX_DURATION = 1.35;
const FLOW_GRAVITY_REDUCTION = 0.18;
const FLOW_AIR_ACCEL_BONUS = 0.18;

export class Game {
  constructor() {
    this.level = createLevel();
    this.width = 1280;
    this.height = 720;
    this.mode = "menu";
    this.message = "Swing through the wall line.";
    this.bullets = [];
    this.effects = [];
    this.input = null;
    this.hitSlowLeft = 0;
    this.lastCheckpointIndex = 0;
    this.previousGrappleHeld = false;
    this.time = 0;
    this.cameraTrauma = 0;
    this.screenFlash = null;
    this.flow = {
      active: false,
      strength: 0,
      timeLeft: 0,
    };
    this.pendingEvents = [];
    this.pickupSweepStart = {
      x: this.level.start.x,
      y: this.level.start.y - 18,
    };
    this.player = this.createPlayer();
    this.checkpoints = this.level.checkpoints.map((point, index) => ({
      ...point,
      active: index === 0,
    }));
    this.batteries = this.level.batteries.map((battery) => ({
      ...battery,
      collected: false,
    }));
    this.medkits = this.level.medkits.map((medkit) => ({
      ...medkit,
      collected: false,
    }));
    this.turrets = this.level.turrets.map((turret) => ({
      ...turret,
      charge: 0,
      flash: 0,
      angle: 0,
      lockedAngle: 0,
      safeTimeLeft: 0,
      warningBeat: 0,
    }));
    this.boostRings = this.level.boostRings.map((ring) => ({
      ...ring,
      cooldownLeft: 0,
      flash: 0,
    }));
    this.drones = this.level.drones.map((drone) => ({
      ...drone,
      baseY: drone.y,
      direction: 1,
      travel: 0,
    }));
    this.stageIndex = 0;
  }

  createPlayer() {
    return {
      x: this.level.start.x,
      y: this.level.start.y,
      vx: 0,
      vy: 0,
      facing: 1,
      onGround: false,
      health: MAX_HEALTH,
      batteries: 0,
      hurt: 0,
      invuln: 0,
      flashTimer: 0,
      angle: 0,
      coyoteLeft: 0,
      grapple: {
        active: false,
        traveling: false,
        anchorX: 0,
        anchorY: 0,
        ropeLength: 0,
        x: 0,
        y: 0,
        targetX: 0,
        targetY: 0,
      },
    };
  }

  start() {
    if (this.mode === "menu") {
      this.mode = "playing";
      this.message = this.level.stages[0].hint;
      this.emitEvent("start");
    }
  }

  restart(fullReset = false) {
    this.resetEncounters();
    if (fullReset) {
      this.mode = "playing";
      this.previousGrappleHeld = false;
      this.checkpoints.forEach((checkpoint, index) => {
        checkpoint.active = index === 0;
      });
      this.batteries.forEach((battery) => {
        battery.collected = false;
      });
      this.medkits.forEach((medkit) => {
        medkit.collected = false;
      });
      this.lastCheckpointIndex = 0;
      this.player = this.createPlayer();
      this.pickupSweepStart = {
        x: this.player.x,
        y: this.player.y - 18,
      };
      this.stageIndex = 0;
      this.message = this.level.stages[0].hint;
      this.cameraTrauma = 0;
      this.screenFlash = null;
      this.flow.active = false;
      this.flow.strength = 0;
      this.flow.timeLeft = 0;
      this.emitEvent("restart", { fullReset: true });
      return;
    }

    const checkpoint = this.checkpoints[this.lastCheckpointIndex];
    this.player.x = checkpoint.x;
    this.player.y = checkpoint.y;
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.facing = 1;
    this.player.onGround = false;
    this.player.health = MAX_HEALTH;
    this.player.hurt = 0;
    this.player.invuln = 0;
    this.player.flashTimer = 0;
    this.player.coyoteLeft = 0;
    this.player.grapple.active = false;
    this.player.grapple.traveling = false;
    this.pickupSweepStart = {
      x: this.player.x,
      y: this.player.y - 18,
    };
    this.previousGrappleHeld = false;
    this.stageIndex = this.getStageIndex(this.player.x);
    this.mode = "playing";
    this.message = this.level.stages[this.stageIndex].hint;
    this.cameraTrauma = 0;
    this.screenFlash = null;
    this.flow.active = false;
    this.flow.strength = 0;
    this.flow.timeLeft = 0;
    this.emitEvent("restart", { checkpoint: this.lastCheckpointIndex + 1, fullReset: false });
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
  }

  update(dt, input) {
    this.input = input;
    this.time += dt;

    if (input.restartPressed) {
      this.restart(this.mode === "menu" || this.mode === "win");
    }

    this.player.invuln = Math.max(0, this.player.invuln - dt);
    this.player.flashTimer = this.player.invuln > 0 ? this.player.flashTimer + dt : 0;
    this.hitSlowLeft = Math.max(0, this.hitSlowLeft - dt);
    this.cameraTrauma = Math.max(0, this.cameraTrauma - dt * 2.2);
    this.updateFlow(dt);
    if (this.screenFlash) {
      this.screenFlash.strength = Math.max(0, this.screenFlash.strength - dt * FLASH_DECAY);
      if (this.screenFlash.strength <= 0.001) {
        this.screenFlash = null;
      }
    }

    if (this.mode === "menu") {
      return;
    }

    if (this.mode === "win") {
      return;
    }

    const simDt = this.hitSlowLeft > 0 ? dt * HIT_SLOW_SCALE : dt;

    this.updateEffects(simDt);
    this.updateTurrets(simDt);
    this.updateDrones(simDt);

    if (this.mode !== "playing") {
      return;
    }

    this.updatePlayer(simDt, input);
    this.updateBoostRings(simDt);
    this.updateBullets(simDt);
    this.updatePickups();
    this.updateCheckpoints();
    this.updateStageProgress();
    this.checkGoal();
  }

  resetEncounters() {
    this.turrets.forEach((turret, index) => {
      turret.timer = this.level.turrets[index].timer;
      turret.charge = 0;
      turret.flash = 0;
      turret.lockedAngle = 0;
      turret.safeTimeLeft = 0;
      turret.warningBeat = 0;
    });
    this.boostRings.forEach((ring) => {
      ring.cooldownLeft = 0;
      ring.flash = 0;
    });
    this.drones.forEach((drone, index) => {
      const source = this.level.drones[index];
      drone.x = source.x;
      drone.y = source.y;
      drone.baseY = source.y;
      drone.direction = 1;
      drone.travel = 0;
    });
    this.hitSlowLeft = 0;
    this.bullets = [];
    this.effects = [];
    this.flow.active = false;
    this.flow.strength = 0;
    this.flow.timeLeft = 0;
  }

  updateEffects(dt) {
    const next = [];
    for (const effect of this.effects) {
      const nextLife = effect.life - dt;
      if (nextLife <= 0) {
        continue;
      }

      const drag = effect.drag ?? 1;
      const nextVx = (effect.vx + (effect.ax ?? 0) * dt) * Math.pow(drag, dt * 60);
      const nextVy = (effect.vy + (effect.ay ?? 0) * dt) * Math.pow(drag, dt * 60);

      next.push({
        ...effect,
        x: effect.x + nextVx * dt,
        y: effect.y + nextVy * dt,
        vx: nextVx,
        vy: nextVy,
        radius: Math.max(0.4, effect.radius + (effect.growth ?? 0) * dt),
        life: nextLife,
        alpha: clamp((nextLife / effect.maxLife) * (effect.fade ?? 1), 0, 1),
      });
    }
    this.effects = next;
  }

  updateTurrets(dt) {
    for (const turret of this.turrets) {
      const wasCharging = turret.charge > 0;
      turret.flash = Math.max(0, turret.flash - dt * 3);
      turret.timer -= dt;
      turret.charge = Math.max(0, turret.charge - dt);
      turret.safeTimeLeft = Math.max(0, turret.safeTimeLeft - dt);
      turret.angle = Math.atan2(this.player.y - turret.y - 18, this.player.x - turret.x);

      if (this.mode !== "playing") {
        continue;
      }

      const dx = this.player.x - turret.x;
      const dy = this.player.y - turret.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 560) {
        turret.charge = 0;
        turret.warningBeat = 0;
        continue;
      }

      const playerSpeed = Math.hypot(this.player.vx, this.player.vy);
      const safeBypass =
        this.player.x > turret.x + 52 && playerSpeed >= 440 && Math.abs(this.player.y - turret.y) <= 110;
      if (safeBypass) {
        turret.charge = 0;
        turret.timer = Math.max(turret.timer, turret.cooldown * 0.45);
        turret.safeTimeLeft = SAFE_TURRET_GRACE;
        turret.warningBeat = 0;
        continue;
      }

      if (turret.safeTimeLeft > 0) {
        turret.charge = 0;
        turret.timer = Math.max(turret.timer, turret.cooldown * 0.38);
        turret.warningBeat = 0;
        continue;
      }

      if (wasCharging) {
        this.advanceTurretWarningBeats(turret);
        this.spawnTurretWarning(turret, dt);

        if (turret.charge <= 0.0001) {
          turret.timer = turret.cooldown;
          turret.flash = 1;
          turret.warningBeat = 0;
          const speed = 420;
          const muzzleX = turret.x + Math.cos(turret.lockedAngle) * 28;
          const muzzleY = turret.y + Math.sin(turret.lockedAngle) * 28;
          this.addTrauma(0.04);
          this.emitEvent("turret-fire", { x: muzzleX, y: muzzleY });
          this.spawnBurst(muzzleX, muzzleY, {
            palette: ["#fff1b0", "#fb7185", "#f97316", "#fca5a5"],
            count: 16,
            speedMin: 120,
            speedMax: 240,
            radiusMin: 1.4,
            radiusMax: 3.6,
            life: 0.28,
          });
          this.bullets.push({
            x: muzzleX,
            y: muzzleY,
            vx: Math.cos(turret.lockedAngle) * speed,
            vy: Math.sin(turret.lockedAngle) * speed,
            friendly: false,
          });
        }
        continue;
      }

      if (turret.timer > 0) {
        turret.warningBeat = 0;
        continue;
      }

      turret.charge = turret.windup;
      turret.lockedAngle = turret.angle;
      turret.flash = 0.45;
      turret.warningBeat = 0;
      this.emitEvent("turret-windup", { x: turret.x, y: turret.y });
    }
  }

  advanceTurretWarningBeats(turret) {
    const progress = clamp(1 - turret.charge / turret.windup, 0, 1);
    const beatThresholds = [0.34, 0.72];
    while (turret.warningBeat < beatThresholds.length && progress >= beatThresholds[turret.warningBeat]) {
      turret.warningBeat += 1;
      this.emitEvent("turret-ping", {
        progress,
        x: turret.x,
        y: turret.y,
      });
    }
  }

  updateDrones(dt) {
    for (const drone of this.drones) {
      drone.travel += dt;
      drone.x += drone.direction * drone.speed * dt;
      if (drone.x <= drone.minX) {
        drone.x = drone.minX;
        drone.direction = 1;
      } else if (drone.x >= drone.maxX) {
        drone.x = drone.maxX;
        drone.direction = -1;
      }
      drone.y = drone.baseY + Math.sin((drone.phase + drone.travel) * 2.6) * drone.bob;

      if (this.mode !== "playing") {
        continue;
      }

      const dx = drone.x - this.player.x;
      const dy = drone.y - (this.player.y - 18);
      const hitRange = drone.radius + 18;
      if (dx * dx + dy * dy <= hitRange * hitRange) {
        this.damagePlayer(1, "Patrol drone clipped you.", "enemy");
      }
    }
  }

  updateBoostRings(dt) {
    for (const ring of this.boostRings) {
      ring.cooldownLeft = Math.max(0, ring.cooldownLeft - dt);
      ring.flash = Math.max(0, ring.flash - dt * 2.4);

      if (this.mode !== "playing" || ring.cooldownLeft > 0) {
        continue;
      }

      const dx = this.player.x - ring.x;
      const dy = (this.player.y - 18) - ring.y;
      if (dx * dx + dy * dy > ring.radius * ring.radius) {
        continue;
      }

      this.player.vx = clamp(this.player.vx + ring.vx, -920, 920);
      this.player.vy = clamp(this.player.vy + ring.vy, -1220, 980);
      this.player.grapple.active = false;
      ring.cooldownLeft = ring.cooldown;
      ring.flash = 1;
      this.message = ring.message;
      this.addTrauma(0.08);
      this.setScreenFlash("#fde68a", 0.16);
      this.triggerFlow(Math.hypot(this.player.vx, this.player.vy), { source: "boost" });
      this.emitEvent("boost", { x: ring.x, y: ring.y });
      this.spawnBurst(ring.x, ring.y, {
        palette: ["#fef08a", "#facc15", "#f59e0b", "#ffffff"],
        count: 16,
        speedMin: 120,
        speedMax: 230,
        radiusMin: 1.6,
        radiusMax: 4.2,
        life: 0.42,
      });
    }
  }

  updatePlayer(dt, input) {
    const player = this.player;
    this.pickupSweepStart = {
      x: player.x,
      y: player.y - 18,
    };
    const move = (input.left ? -1 : 0) + (input.right ? 1 : 0);
    const grappleReleased = this.previousGrappleHeld && !input.grappleHeld && player.grapple.active;
    const jumpQueued = input.jumpPressed;

    player.coyoteLeft = player.onGround ? 0.1 : Math.max(0, player.coyoteLeft - dt);

    if (move !== 0) {
      player.facing = move;
    }

    if (player.onGround) {
      if (move === 0) {
        player.vx = approach(player.vx, 0, GROUND_FRICTION * dt);
      } else {
        const sameDirection = Math.sign(player.vx) === move || player.vx === 0;
        const targetSpeed = move * MOVE_SPEED;
        if (sameDirection && Math.abs(player.vx) > Math.abs(targetSpeed)) {
          player.vx = approach(player.vx, move * Math.max(Math.abs(player.vx), MOVE_SPEED), GROUND_ACCEL * 0.3 * dt);
        } else {
          player.vx = approach(player.vx, targetSpeed, GROUND_ACCEL * dt);
        }
      }
      if (jumpQueued) {
        player.vy = -JUMP_SPEED;
        player.onGround = false;
        player.coyoteLeft = 0;
      }
    } else {
      const airAccel = AIR_ACCEL * (1 + this.flow.strength * FLOW_AIR_ACCEL_BONUS);
      player.vx += move * airAccel * dt;
      player.vx = clamp(player.vx, -MOVE_SPEED * 1.45, MOVE_SPEED * 1.45);
      if (jumpQueued && player.coyoteLeft > 0) {
        player.vy = -JUMP_SPEED;
        player.coyoteLeft = 0;
      }
    }

    const wantsGrapple = input.grappleHeld;
    if (wantsGrapple && !player.grapple.active) {
      if (player.grapple.traveling) {
        this.updateTravelingGrapple(dt);
      } else {
        this.beginGrappleCast(input);
      }
    } else if (!wantsGrapple) {
      if (grappleReleased) {
        this.applyGrappleReleaseBoost(move);
      }
      player.grapple.active = false;
      player.grapple.traveling = false;
    }

    const gravityScale = player.grapple.active ? 1 : 1 - this.flow.strength * FLOW_GRAVITY_REDUCTION;
    player.vy += GRAVITY * gravityScale * dt;
    player.vy = Math.min(player.vy, MAX_FALL);

    const previousY = player.y;
    player.x += player.vx * dt;
    player.y += player.vy * dt;

    if (player.grapple.active) {
      this.applyGrappleConstraint(dt);
      player.vx = clamp(player.vx, -980, 980);
      player.vy = clamp(player.vy, -1280, MAX_FALL);
    }

    player.x = clamp(player.x, 20, this.level.worldWidth - 20);
    this.resolvePlatforms(previousY);

    if (player.y > this.level.worldHeight + 80) {
      this.damagePlayer(5, "You fell.", "fall");
    }

    player.hurt = Math.max(0, player.hurt - dt * 4);
    player.angle = player.grapple.active ? clamp(player.vx / 500, -0.8, 0.8) : clamp(player.vx / 900, -0.25, 0.25);
    this.previousGrappleHeld = input.grappleHeld;
  }

  applyGrappleConstraint(dt) {
    const player = this.player;
    const dx = player.x - player.grapple.anchorX;
    const dy = (player.y - 18) - player.grapple.anchorY;
    const dist = Math.hypot(dx, dy) || 0.0001;

    if (dist < 24) {
      return;
    }

    const nx = dx / dist;
    const ny = dy / dist;
    const tangent = getGrappleTangent(nx, ny);

    const move = (this.input.left ? -1 : 0) + (this.input.right ? 1 : 0);
    if (move !== 0) {
      player.vx += tangent.x * move * SWING_PUMP_ACCEL * dt;
      player.vy += tangent.y * move * SWING_PUMP_ACCEL * dt * 0.92;
    }

    if (dist > player.grapple.ropeLength) {
      const pull = dist - player.grapple.ropeLength;
      player.x -= nx * pull;
      player.y -= ny * pull;

      const radialVelocity = player.vx * nx + player.vy * ny;
      if (radialVelocity > 0) {
        player.vx -= radialVelocity * nx;
        player.vy -= radialVelocity * ny;
      }
    } else {
      const tighten = 260 * dt;
      player.grapple.ropeLength = Math.max(80, player.grapple.ropeLength - tighten);
    }
  }

  applyGrappleReleaseBoost(move) {
    const player = this.player;
    const dx = player.x - player.grapple.anchorX;
    const dy = (player.y - 18) - player.grapple.anchorY;
    const dist = Math.hypot(dx, dy) || 0.0001;
    const nx = dx / dist;
    const ny = dy / dist;
    const tangent = getGrappleTangent(nx, ny);
    const tangentVelocity = player.vx * tangent.x + player.vy * tangent.y;
    const releaseDirection =
      move !== 0
        ? move
        : tangentVelocity === 0
          ? player.facing || 1
          : Math.sign(tangentVelocity);

    player.vx += tangent.x * releaseDirection * GRAPPLE_RELEASE_BOOST;
    player.vy += tangent.y * releaseDirection * GRAPPLE_RELEASE_BOOST * 0.7;
    const releaseSpeed = Math.hypot(player.vx, player.vy);
    this.triggerFlow(releaseSpeed, { source: "release" });
    this.emitEvent("grapple-release", {
      speed: releaseSpeed,
      x: player.x,
      y: player.y - 18,
    });
    this.spawnBurst(player.x, player.y - 18, {
      palette: ["#a5f3fc", "#67e8f9", "#f8fafc"],
      count: 9,
      speedMin: 70,
      speedMax: 180,
      radiusMin: 1.2,
      radiusMax: 3.4,
      life: 0.24,
      angle: Math.atan2(tangent.y, tangent.x),
      spread: Math.PI * 0.65,
    });
  }

  beginGrappleCast(input) {
    const anchor = this.findAnchor(input);
    if (!anchor) {
      return;
    }

    this.player.grapple.traveling = true;
    this.player.grapple.active = false;
    this.player.grapple.anchorX = anchor.x;
    this.player.grapple.anchorY = anchor.y;
    this.player.grapple.targetX = anchor.x;
    this.player.grapple.targetY = anchor.y;
    this.player.grapple.x = this.player.x;
    this.player.grapple.y = this.player.y - 18;
    this.message = "Hook out.";
    this.emitEvent("grapple-cast", { x: this.player.grapple.x, y: this.player.grapple.y });
    this.spawnBurst(this.player.grapple.x, this.player.grapple.y, {
      palette: ["#67e8f9", "#a5f3fc", "#f8fafc"],
      count: 5,
      speedMin: 90,
      speedMax: 170,
      radiusMin: 1,
      radiusMax: 2.6,
      life: 0.18,
      angle: Math.atan2(anchor.y - this.player.grapple.y, anchor.x - this.player.grapple.x),
      spread: Math.PI * 0.22,
    });
  }

  updateTravelingGrapple(dt) {
    const grapple = this.player.grapple;
    const dx = grapple.targetX - grapple.x;
    const dy = grapple.targetY - grapple.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= 0.0001) {
      this.finishGrappleCast();
      return;
    }

    const step = Math.min(distance, GRAPPLE_CAST_SPEED * dt);
    const nx = dx / distance;
    const ny = dy / distance;
    grapple.x += nx * step;
    grapple.y += ny * step;

    this.spawnEffect({
      x: grapple.x,
      y: grapple.y,
      vx: -nx * 70 + (Math.random() - 0.5) * 24,
      vy: -ny * 70 + (Math.random() - 0.5) * 24,
      radius: 1.2 + Math.random() * 1.2,
      growth: 6,
      drag: 0.84,
      fade: 0.9,
      life: 0.12,
      kind: "trail",
      layer: "under",
      color: pickRandom(["#67e8f9", "#a5f3fc", "#e0f2fe"]),
    });

    if (step >= distance - 0.0001) {
      this.finishGrappleCast();
    }
  }

  finishGrappleCast() {
    const player = this.player;
    const dx = player.grapple.targetX - player.x;
    const dy = player.grapple.targetY - (player.y - 18);
    const distance = Math.hypot(dx, dy);
    const nx = distance > 0.0001 ? dx / distance : 0;
    const ny = distance > 0.0001 ? dy / distance : -1;
    const outwardSpeed = Math.max(0, player.vx * -nx + player.vy * -ny);
    const latchSlack =
      outwardSpeed > 0
        ? clamp(outwardSpeed * GRAPPLE_LATCH_SLACK_FACTOR, GRAPPLE_LATCH_SLACK_MIN, GRAPPLE_LATCH_SLACK_MAX)
        : 0;

    player.grapple.traveling = false;
    player.grapple.active = true;
    player.grapple.x = player.grapple.targetX;
    player.grapple.y = player.grapple.targetY;
    player.grapple.anchorX = player.grapple.targetX;
    player.grapple.anchorY = player.grapple.targetY;
    player.grapple.ropeLength = Math.max(80, distance + latchSlack);
    this.message = latchSlack > 0 ? "Latch and swing through." : "Latch.";
    this.addTrauma(0.03);
    this.emitEvent("grapple-latch", { x: player.grapple.anchorX, y: player.grapple.anchorY });
    this.spawnBurst(player.grapple.anchorX, player.grapple.anchorY, {
      palette: ["#67e8f9", "#a5f3fc", "#e0f2fe"],
      count: latchSlack > 0 ? 12 : 8,
      speedMin: 60,
      speedMax: latchSlack > 0 ? 210 : 150,
      radiusMin: 1.2,
      radiusMax: latchSlack > 0 ? 4.2 : 3,
      life: latchSlack > 0 ? 0.34 : 0.26,
    });
  }

  resolvePlatforms(previousY) {
    const player = this.player;
    player.onGround = false;

    for (const platform of this.level.platforms) {
      const insideX = player.x + PLAYER_W * 0.5 > platform.x && player.x - PLAYER_W * 0.5 < platform.x + platform.w;
      const feet = player.y;
      const head = player.y - PLAYER_H;

      if (!insideX) {
        continue;
      }

      const previousFeet = previousY;
      const landed = feet >= platform.y && previousFeet <= platform.y;
      if (player.vy >= 0 && landed && head < platform.y) {
        player.y = platform.y;
        const bouncePad = this.findBouncePad(player.x, platform.y);
        if (bouncePad && player.vy >= BOUNCE_MIN_SPEED) {
          player.vy = -bouncePad.boost;
          const forwardDirection = Math.sign(player.vx) || player.facing || 1;
          player.vx = clamp(player.vx + forwardDirection * bouncePad.forwardBoost, -MOVE_SPEED * 1.8, MOVE_SPEED * 2.1);
          player.grapple.active = false;
          this.message = "Bounce lane live.";
          this.addTrauma(0.06);
          this.setScreenFlash("#67e8f9", 0.09);
          this.triggerFlow(Math.hypot(player.vx, player.vy), { source: "bounce" });
          this.emitEvent("bounce", { x: player.x, y: platform.y });
          this.spawnBurst(player.x, platform.y - 10, {
            palette: ["#a5f3fc", "#67e8f9", "#22d3ee", "#ffffff"],
            count: 14,
            speedMin: 110,
            speedMax: 220,
            radiusMin: 1.5,
            radiusMax: 4,
            life: 0.38,
          });
          continue;
        }

        player.vy = 0;
        player.onGround = true;
        if (!this.input.grappleHeld) {
          player.grapple.active = false;
        }
      }
    }
  }

  findBouncePad(x, y) {
    return this.level.bouncePads.find(
      (pad) => Math.abs(pad.y - y) < 0.001 && x >= pad.x && x <= pad.x + pad.w,
    );
  }

  updateBullets(dt) {
    const next = [];
    for (const bullet of this.bullets) {
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;

      if (!bullet.friendly) {
        this.spawnBulletTrail(bullet);
      }

      if (bullet.x < 0 || bullet.x > this.level.worldWidth || bullet.y < -40 || bullet.y > this.level.worldHeight + 40) {
        continue;
      }

      if (!bullet.friendly && hitPlayer(bullet, this.player)) {
        this.damagePlayer(1, "Turret hit.", "enemy");
        continue;
      }
      next.push(bullet);
    }
    this.bullets = next;
  }

  updatePickups() {
    const pickupStart = this.pickupSweepStart ?? {
      x: this.player.x,
      y: this.player.y - 18,
    };
    const pickupEnd = {
      x: this.player.x,
      y: this.player.y - 18,
    };

    for (const battery of this.batteries) {
      if (battery.collected) {
        continue;
      }
      if (intersectsPickupSweep(pickupStart, pickupEnd, battery, 34)) {
        battery.collected = true;
        this.player.batteries += 1;
        const remaining = this.batteries.length - this.player.batteries;
        this.message =
          remaining <= 0
            ? "All batteries secured. Exit gate unlocked."
            : remaining <= 3
              ? `Battery secured. ${remaining} left in the wall line.`
              : "Battery secured.";
        this.emitEvent("battery", { count: this.player.batteries, x: battery.x, y: battery.y });
        this.spawnBurst(battery.x, battery.y, {
          palette: ["#d9f99d", "#bef264", "#84cc16", "#ffffff"],
          count: remaining <= 3 ? 20 : 12,
          speedMin: 90,
          speedMax: remaining <= 3 ? 250 : 180,
          radiusMin: 1.5,
          radiusMax: remaining <= 3 ? 4.8 : 3.8,
          growth: remaining <= 3 ? 6 : 2,
          life: remaining <= 3 ? 0.54 : 0.36,
        });
        if (remaining <= 3) {
          this.setScreenFlash("#bef264", 0.12);
          this.addTrauma(0.04);
          this.spawnBurst(battery.x, battery.y, {
            palette: ["#fef08a", "#67e8f9", "#ffffff"],
            count: 10,
            speedMin: 80,
            speedMax: 170,
            radiusMin: 2.2,
            radiusMax: 7.2,
            life: 0.62,
            kind: "ring",
            growth: 38,
            fade: 0.82,
            layer: "under",
          });
        }
      }
    }

    for (const medkit of this.medkits) {
      if (medkit.collected) {
        continue;
      }
      if (intersectsPickupSweep(pickupStart, pickupEnd, medkit, 28)) {
        medkit.collected = true;
        this.player.health = Math.min(MAX_HEALTH, this.player.health + 1);
        this.message = "Recovery cache secured.";
        this.emitEvent("medkit", { health: this.player.health, x: medkit.x, y: medkit.y });
        this.spawnBurst(medkit.x, medkit.y, {
          palette: ["#86efac", "#34d399", "#10b981", "#ecfdf5"],
          count: 12,
          speedMin: 90,
          speedMax: 180,
          radiusMin: 1.4,
          radiusMax: 3.6,
          life: 0.36,
        });
      }
    }
  }

  updateCheckpoints() {
    for (let i = 0; i < this.checkpoints.length; i += 1) {
      const checkpoint = this.checkpoints[i];
      if (Math.abs(this.player.x - checkpoint.x) < 28 && Math.abs(this.player.y - checkpoint.y) < 54 && i > this.lastCheckpointIndex) {
        this.lastCheckpointIndex = i;
        this.checkpoints.forEach((point, index) => {
          point.active = index === i;
        });
        this.message = `Checkpoint ${i + 1} live.`;
        this.addTrauma(0.05);
        this.setScreenFlash("#f59e0b", 0.12);
        this.emitEvent("checkpoint", { checkpoint: i + 1, x: checkpoint.x, y: checkpoint.y });
        this.spawnBurst(checkpoint.x, checkpoint.y - 28, {
          palette: ["#fde68a", "#f59e0b", "#f97316", "#ffffff"],
          count: 18,
          speedMin: 120,
          speedMax: 240,
          radiusMin: 1.6,
          radiusMax: 4.4,
          life: 0.46,
        });
      }
    }
  }

  updateStageProgress() {
    const nextStageIndex = this.getStageIndex(this.player.x);
    if (nextStageIndex === this.stageIndex) {
      return;
    }

    this.stageIndex = nextStageIndex;
    this.message = this.level.stages[nextStageIndex].hint;
    this.spawnBurst(this.player.x, this.player.y - 36, {
      palette: ["#7dd3fc", "#38bdf8", "#67e8f9", "#ffffff"],
      count: 16,
      speedMin: 110,
      speedMax: 210,
      radiusMin: 1.5,
      radiusMax: 4,
      life: 0.4,
    });
  }

  getStageIndex(x) {
    for (let i = 0; i < this.level.stages.length; i += 1) {
      const stage = this.level.stages[i];
      if (x >= stage.start && x < stage.end) {
        return i;
      }
    }

    return this.level.stages.length - 1;
  }

  checkGoal() {
    const goal = this.level.goal;
    const batteriesNeeded = this.batteries.length;
    const insideGoal =
      this.player.x + PLAYER_W * 0.5 > goal.x &&
      this.player.x - PLAYER_W * 0.5 < goal.x + goal.w &&
      this.player.y > goal.y &&
      this.player.y - PLAYER_H < goal.y + goal.h;

    if (insideGoal && this.player.batteries >= batteriesNeeded) {
      this.mode = "win";
      this.message = "Wall line breached.";
      this.player.grapple.active = false;
      this.addTrauma(0.12);
      this.setScreenFlash("#86efac", 0.18);
      this.emitEvent("win");
      this.spawnBurst(goal.x + goal.w * 0.5, goal.y + goal.h * 0.4, {
        palette: ["#ffffff", "#86efac", "#67e8f9", "#fde68a"],
        count: 32,
        speedMin: 110,
        speedMax: 280,
        radiusMin: 1.6,
        radiusMax: 4.8,
        life: 0.6,
      });
    } else if (insideGoal) {
      this.message = `Exit locked. ${batteriesNeeded - this.player.batteries} batteries still missing.`;
    }
  }

  damagePlayer(amount, message, source = "enemy") {
    if (this.mode !== "playing") {
      return false;
    }

    const enemyHit = source === "enemy";
    if (enemyHit && this.player.invuln > 0) {
      return false;
    }

    this.player.health -= amount;
    this.player.hurt = enemyHit ? 1 : 0.7;
    this.player.grapple.active = false;
    this.message = message;

    if (enemyHit) {
      this.player.invuln = INVULN_TIME;
      this.player.flashTimer = 0;
      this.hitSlowLeft = HIT_SLOW_TIME;
      this.addTrauma(0.14);
      this.setScreenFlash("#fb7185", 0.2);
      this.emitEvent("hit", { health: this.player.health, source });
      this.resetNearbyTurrets();
      this.spawnBurst(this.player.x, this.player.y - 24, {
        palette: ["#ffffff", "#fb7185", "#f59e0b", "#67e8f9"],
        count: 22,
        speedMin: 140,
        speedMax: 280,
        radiusMin: 1.8,
        radiusMax: 4.8,
        life: 0.48,
        kind: "spark",
        spread: Math.PI * 2,
      });
      this.spawnEffect({
        x: this.player.x,
        y: this.player.y - 24,
        radius: 14,
        growth: 72,
        fade: 0.84,
        life: 0.24,
        kind: "ring",
        layer: "over",
        color: "#ffffff",
      });
    } else {
      this.addTrauma(0.1);
      this.setScreenFlash("#7f1d1d", 0.16);
      this.emitEvent("fall", { health: this.player.health, source });
      this.spawnBurst(this.player.x, this.player.y - 24, {
        palette: ["#7f1d1d", "#b91c1c", "#fb7185"],
        count: 16,
        speedMin: 110,
        speedMax: 220,
        radiusMin: 1.8,
        radiusMax: 4.6,
        life: 0.42,
        kind: "spark",
      });
    }

    if (this.player.health <= 0) {
      this.mode = "down";
      this.message = "Down. Tap R for instant checkpoint retry.";
      this.emitEvent("lose");
    }
    return true;
  }

  resetNearbyTurrets() {
    for (const turret of this.turrets) {
      if (Math.abs(turret.x - this.player.x) > HIT_TURRET_RESET_RADIUS) {
        continue;
      }

      turret.charge = 0;
      turret.timer = Math.max(turret.timer, turret.cooldown * 0.7);
      turret.safeTimeLeft = Math.max(turret.safeTimeLeft, HIT_TURRET_BREATHER);
    }
  }

  spawnBurst(x, y, options = {}) {
    const config = normalizeBurstOptions(options);
    for (let i = 0; i < config.count; i += 1) {
      const angle = config.angle + (Math.random() - 0.5) * config.spread;
      const speed = lerp(config.speedMin, config.speedMax, Math.random());
      const life = lerp(config.life * 0.68, config.life, Math.random());
      this.spawnEffect({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: lerp(config.radiusMin, config.radiusMax, Math.random()),
        growth: config.growth,
        drag: config.drag,
        fade: config.fade,
        life,
        kind: config.kind,
        layer: config.layer,
        color: pickRandom(config.palette),
      });
    }
  }

  spawnEffect(effect) {
    const life = effect.life ?? EFFECT_LIFE;
    this.effects.push({
      kind: "burst",
      layer: "over",
      alpha: 1,
      drag: 0.92,
      growth: 0,
      fade: 1,
      ax: 0,
      ay: 0,
      ...effect,
      life,
      maxLife: effect.maxLife ?? life,
    });
  }

  spawnTurretWarning(turret, dt) {
    const intensity = clamp(1 - turret.charge / turret.windup, 0.2, 1);
    const dirX = Math.cos(turret.lockedAngle);
    const dirY = Math.sin(turret.lockedAngle);
    const sideX = -dirY;
    const sideY = dirX;
    const muzzleX = turret.x + dirX * 28;
    const muzzleY = turret.y + dirY * 28;
    const count = Math.max(1, Math.round((1.2 + intensity * 2.2) * Math.max(1, dt * 60)));

    for (let i = 0; i < count; i += 1) {
      const along = 18 + Math.random() * (80 + intensity * 220);
      const jitter = (Math.random() - 0.5) * (6 + intensity * 6);
      const x = muzzleX + dirX * along + sideX * jitter;
      const y = muzzleY + dirY * along + sideY * jitter;
      const life = 0.14 + Math.random() * 0.18;

      this.spawnEffect({
        x,
        y,
        vx: dirX * (70 + intensity * 170) + sideX * jitter * 2.8,
        vy: dirY * (70 + intensity * 170) + sideY * jitter * 2.8,
        radius: 1.2 + Math.random() * 1.5,
        growth: 5 + intensity * 10,
        drag: 0.88,
        fade: 1.15,
        life,
        kind: "warning",
        layer: "under",
        color: pickRandom(["#fff1b0", "#fb7185", "#fca5a5"]),
      });
    }
  }

  spawnBulletTrail(bullet) {
    const tailX = bullet.x - bullet.vx * 0.02;
    const tailY = bullet.y - bullet.vy * 0.02;
    const life = 0.12 + Math.random() * 0.08;
    this.spawnEffect({
      x: tailX,
      y: tailY,
      vx: -bullet.vx * 0.1 + (Math.random() - 0.5) * 18,
      vy: -bullet.vy * 0.1 + (Math.random() - 0.5) * 18,
      radius: 1.2 + Math.random() * 1.2,
      growth: 7,
      drag: 0.85,
      fade: 1,
      life,
      kind: "trail",
      layer: "under",
      color: pickRandom(["#fda4af", "#fb7185", "#ffe4e6"]),
    });
  }

  getThreatState(cameraX) {
    const playerCenterY = this.player.y - 18;
    const visiblePadding = 64;
    let bestThreat = null;
    let bestScore = -Infinity;

    for (const turret of this.turrets) {
      if (turret.charge <= 0) {
        continue;
      }

      const chargeProgress = clamp(1 - turret.charge / turret.windup, 0, 1);
      const distance = Math.hypot(turret.x - this.player.x, turret.y - playerCenterY);
      const onScreen = turret.x >= cameraX - visiblePadding && turret.x <= cameraX + this.width + visiblePadding;
      const score = chargeProgress * 4 + (onScreen ? 1.3 : 0.3) + (1 - clamp(distance / 760, 0, 1)) * 2.2;
      if (score <= bestScore) {
        continue;
      }

      bestScore = score;
      bestThreat = {
        kind: "turret",
        label: chargeProgress >= 0.72 ? "Turret lock" : "Turret lining up",
        x: turret.x,
        y: turret.y,
        screenX: turret.x - cameraX,
        screenY: turret.y,
        direction: turret.x >= this.player.x ? "right" : "left",
        onScreen,
        distance,
        urgent: chargeProgress >= 0.58 || distance <= 220,
        intensity: chargeProgress,
      };
    }

    for (const bullet of this.bullets) {
      if (bullet.friendly) {
        continue;
      }

      const distance = Math.hypot(bullet.x - this.player.x, bullet.y - playerCenterY);
      if (distance > 240) {
        continue;
      }

      const speed = Math.hypot(bullet.vx, bullet.vy) || 1;
      const timeToImpact = distance / speed;
      const score = 3.1 + (1 - clamp(timeToImpact / 0.55, 0, 1)) * 3.2;
      if (score <= bestScore) {
        continue;
      }

      bestScore = score;
      bestThreat = {
        kind: "bullet",
        label: "Incoming shot",
        x: bullet.x,
        y: bullet.y,
        screenX: bullet.x - cameraX,
        screenY: bullet.y,
        direction: bullet.x >= this.player.x ? "right" : "left",
        onScreen: bullet.x >= cameraX - visiblePadding && bullet.x <= cameraX + this.width + visiblePadding,
        distance,
        urgent: true,
        intensity: 1 - clamp(timeToImpact / 0.55, 0, 1),
      };
    }

    return bestThreat;
  }

  findAnchor(input) {
    const cameraX = this.getCameraX();
    const targetX = cameraX + clamp(input.aimScreenX, 0, this.width);
    const targetY = clamp(input.aimScreenY, 0, this.height);
    let best = null;
    let bestScore = Infinity;

    for (const anchor of this.level.anchors) {
      const screenX = anchor.x - cameraX;
      const visibleAnchor =
        screenX >= -GRAPPLE_SCREEN_PAD &&
        screenX <= this.width + GRAPPLE_SCREEN_PAD &&
        anchor.y >= -GRAPPLE_SCREEN_PAD &&
        anchor.y <= this.height + GRAPPLE_SCREEN_PAD;
      if (!visibleAnchor) {
        continue;
      }

      const aimDistance = Math.hypot(anchor.x - targetX, anchor.y - targetY);
      const toPlayer = Math.hypot(anchor.x - this.player.x, anchor.y - (this.player.y - 18));
      const forwardBias = this.player.facing >= 0 ? Math.max(0, this.player.x - anchor.x) : Math.max(0, anchor.x - this.player.x);
      const score = aimDistance + forwardBias * 1.25 + Math.max(0, toPlayer - this.width * 0.8) * 0.08;
      if (score < bestScore) {
        bestScore = score;
        best = anchor;
      }
    }

    return best;
  }

  addTrauma(amount) {
    this.cameraTrauma = clamp(this.cameraTrauma + amount, 0, 1);
  }

  setScreenFlash(color, strength) {
    const nextStrength = clamp(strength, 0, 1);
    if (!this.screenFlash || nextStrength >= this.screenFlash.strength) {
      this.screenFlash = { color, strength: nextStrength };
      return;
    }

    this.screenFlash.color = color;
  }

  emitEvent(type, payload = {}) {
    this.pendingEvents.push({
      time: this.time,
      type,
      ...payload,
    });
  }

  consumeEvents() {
    const events = this.pendingEvents;
    this.pendingEvents = [];
    return events;
  }

  updateFlow(dt) {
    if (this.flow.timeLeft <= 0) {
      this.flow.active = false;
      this.flow.strength = 0;
      this.flow.timeLeft = 0;
      return;
    }

    const decay = this.player.onGround ? 1.9 : 1;
    this.flow.timeLeft = Math.max(0, this.flow.timeLeft - dt * decay);
    const normalized = clamp(this.flow.timeLeft / FLOW_MAX_DURATION, 0, 1);
    this.flow.strength = Math.min(this.flow.strength, normalized);
    this.flow.active = this.flow.timeLeft > 0.001 && this.flow.strength > 0.02;
    if (!this.flow.active) {
      this.flow.strength = 0;
    }
  }

  triggerFlow(speed, { source = "release" } = {}) {
    const normalized = clamp((speed - FLOW_SPEED_THRESHOLD) / (FLOW_SPEED_MAX - FLOW_SPEED_THRESHOLD), 0, 1);
    if (normalized <= 0) {
      return;
    }

    const nextTime = lerp(0.48, FLOW_MAX_DURATION, normalized);
    const wasActive = this.flow.active;
    const strengthened = normalized > this.flow.strength + 0.08;
    this.flow.timeLeft = Math.max(this.flow.timeLeft, nextTime);
    this.flow.strength = Math.max(this.flow.strength, normalized);
    this.flow.active = true;
    if (!wasActive || strengthened) {
      this.emitEvent("flow-enter", { strength: normalized, source });
    }
  }

  getFrameState() {
    const cameraX = this.getCameraX();
    const remainingBatteries = this.batteries.filter((battery) => !battery.collected);
    const guideBattery = remainingBatteries
      .map((battery) => ({
        ...battery,
        distance: Math.hypot(battery.x - this.player.x, battery.y - (this.player.y - 18)),
      }))
      .sort((left, right) => left.distance - right.distance)[0] ?? null;
    const gateProgress = this.batteries.length > 0 ? this.player.batteries / this.batteries.length : 1;
    const threat = this.getThreatState(cameraX);
    const targetAnchor = this.player.grapple.traveling
      ? { x: this.player.grapple.targetX, y: this.player.grapple.targetY }
      : this.input
        ? this.findAnchor(this.input)
        : null;
    return {
      width: this.width,
      height: this.height,
      cameraX,
      time: this.time,
      mode: this.mode,
      message: this.message,
      cameraTrauma: this.cameraTrauma,
      screenFlash: this.screenFlash ? { ...this.screenFlash } : null,
      health: this.player.health,
      maxHealth: MAX_HEALTH,
      batteryCount: this.player.batteries,
      batteryTotal: this.batteries.length,
      batteriesRemaining: remainingBatteries.length,
      batteryGuide: guideBattery,
      threat,
      checkpoint: this.lastCheckpointIndex + 1,
      stageName: this.level.stages[this.stageIndex].name,
      stageIndex: this.stageIndex + 1,
      stageTotal: this.level.stages.length,
      gateProgress,
      gateReady: remainingBatteries.length === 0,
      dangerLevel: 1 - clamp(this.player.health / MAX_HEALTH, 0, 1),
      targetAnchor:
        this.input?.grappleHeld && (!this.player.grapple.active || this.player.grapple.traveling) && targetAnchor
          ? { ...targetAnchor }
          : null,
      flow: {
        active: this.flow.active,
        strength: this.flow.strength,
        timeLeft: this.flow.timeLeft,
      },
      playerSpeed: Math.hypot(this.player.vx, this.player.vy),
      player: {
        ...this.player,
        grapple: { ...this.player.grapple },
      },
      platforms: this.level.platforms,
      anchors: this.level.anchors,
      checkpoints: this.checkpoints,
      batteries: this.batteries,
      medkits: this.medkits,
      turrets: this.turrets,
      drones: this.drones,
      bullets: this.bullets,
      effects: this.effects,
      goal: {
        ...this.level.goal,
        progress: gateProgress,
        ready: remainingBatteries.length === 0,
      },
      bouncePads: this.level.bouncePads,
      boostRings: this.boostRings,
      stageBands: this.level.stageBands,
    };
  }

  getCameraX() {
    return clamp(this.player.x - this.width * 0.34, 0, this.level.worldWidth - this.width);
  }
}

function normalizeBurstOptions(options) {
  if (typeof options === "string") {
    return normalizeBurstOptions({ palette: [options] });
  }

  const palette = Array.isArray(options.palette) && options.palette.length > 0
    ? options.palette
    : [options.color ?? "#f8fafc"];

  return {
    palette,
    count: options.count ?? 8,
    speedMin: options.speedMin ?? 70,
    speedMax: options.speedMax ?? 130,
    radiusMin: options.radiusMin ?? 1.6,
    radiusMax: options.radiusMax ?? 4,
    life: options.life ?? EFFECT_LIFE,
    drag: options.drag ?? 0.92,
    growth: options.growth ?? 0,
    fade: options.fade ?? 1,
    kind: options.kind ?? "burst",
    layer: options.layer ?? "over",
    angle: options.angle ?? 0,
    spread: options.spread ?? Math.PI * 2,
  };
}

function hitPlayer(bullet, player) {
  return Math.abs(bullet.x - player.x) < 18 && Math.abs(bullet.y - (player.y - 24)) < 30;
}

function getGrappleTangent(nx, ny) {
  return {
    x: ny,
    y: -nx,
  };
}

function intersectsPickupSweep(start, end, pickup, radius) {
  if (Math.abs(end.x - pickup.x) < radius && Math.abs(end.y - pickup.y) < radius) {
    return true;
  }

  return segmentDistanceToPoint(start, end, pickup.x, pickup.y) <= radius;
}

function segmentDistanceToPoint(start, end, pointX, pointY) {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;
  if (lengthSquared <= 0.0001) {
    return Math.hypot(pointX - end.x, pointY - end.y);
  }

  const projection = clamp(
    ((pointX - start.x) * deltaX + (pointY - start.y) * deltaY) / lengthSquared,
    0,
    1,
  );
  const closestX = start.x + deltaX * projection;
  const closestY = start.y + deltaY * projection;
  return Math.hypot(pointX - closestX, pointY - closestY);
}

function pickRandom(values) {
  return values[Math.floor(Math.random() * values.length)] ?? values[0];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function approach(value, target, step) {
  if (value < target) {
    return Math.min(value + step, target);
  }

  return Math.max(value - step, target);
}
