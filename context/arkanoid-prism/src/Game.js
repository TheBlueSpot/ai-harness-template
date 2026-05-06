import {
  BALL_MAX_SPEED,
  BALL_RADIUS,
  BALL_SPEED,
  BRICK_COLS,
  BRICK_GAP,
  BRICK_HEIGHT,
  BRICK_OFFSET_X,
  BRICK_OFFSET_Y,
  BRICK_ROWS,
  BRICK_TYPES,
  BRICK_WIDTH,
  HEIGHT,
  LASER_SPEED,
  LEVELS,
  PADDLE_HEIGHT,
  PADDLE_SPEED,
  PADDLE_WIDTH,
  PADDLE_Y,
  POWERUP_SPEED,
  POWERUP_TYPES,
  WIDTH,
} from "./data.js";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const MAX_BALLS = 6;
const FOCUS_PADDLE_BONUS = 34;
const FOCUS_PADDLE_BONUS_MAX = 68;
const BURST_TIME = 8;
const MIN_VERTICAL_SPEED = 150;
const MIN_VERTICAL_RATIO = 0.24;

function randId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function rotateVelocity(vx, vy, radians) {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    vx: vx * cos - vy * sin,
    vy: vx * sin + vy * cos,
  };
}

function scaleVelocity(vx, vy, targetSpeed) {
  const length = Math.hypot(vx, vy) || 1;
  return {
    vx: (vx / length) * targetSpeed,
    vy: (vy / length) * targetSpeed,
  };
}

function clampBallVelocity(vx, vy, preferredVerticalSign = -1) {
  const speed = clamp(Math.hypot(vx, vy) || BALL_SPEED, BALL_SPEED, BALL_MAX_SPEED);
  const verticalSign = Math.sign(vy) || preferredVerticalSign || -1;
  const minimumVertical = Math.min(speed * 0.9, Math.max(MIN_VERTICAL_SPEED, speed * MIN_VERTICAL_RATIO));
  let nextVy = vy;

  if (Math.abs(nextVy) < minimumVertical) {
    nextVy = verticalSign * minimumVertical;
  }

  const horizontalMagnitude = Math.sqrt(Math.max(0, speed * speed - nextVy * nextVy));
  const horizontalSign = Math.sign(vx) || (Math.random() < 0.5 ? -1 : 1);
  return {
    vx: horizontalMagnitude * horizontalSign,
    vy: nextVy,
  };
}

function createBall(x, y, vx = 0, vy = -BALL_SPEED) {
  return {
    id: randId("ball"),
    x,
    y,
    vx,
    vy,
    radius: BALL_RADIUS,
    trail: [],
  };
}

function makeBrick(typeKey, row, col) {
  const type = BRICK_TYPES[typeKey];
  if (!type) {
    return null;
  }
  return {
    id: randId("brick"),
    x: BRICK_OFFSET_X + col * (BRICK_WIDTH + BRICK_GAP),
    y: BRICK_OFFSET_Y + row * (BRICK_HEIGHT + BRICK_GAP),
    width: BRICK_WIDTH,
    height: BRICK_HEIGHT,
    hp: type.hp,
    maxHp: type.hp,
    score: type.score,
    color: type.color,
    kind: type.kind,
    splitDone: false,
  };
}

export class Game {
  constructor() {
    this.restart();
  }

  restart() {
    this.mode = "menu";
    this.score = 0;
    this.lives = 3;
    this.levelIndex = 0;
    this.time = 0;
    this.serveTimer = 0;
    this.serveReleaseStatus = null;
    this.phaseTimer = 0;
    this.burstTimer = 0;
    this.status = "Shape the first rebound.";
    this.paddle = {
      x: WIDTH * 0.5,
      y: PADDLE_Y,
      width: PADDLE_WIDTH,
      height: PADDLE_HEIGHT,
      vx: 0,
      laserTimer: 0,
      laserCooldown: 0,
    };
    this.balls = [];
    this.bricks = [];
    this.lasers = [];
    this.powerups = [];
    this.particles = [];
    this.loadLevel(this.levelIndex);
    this.resetBallOnPaddle();
    this.input = {
      move: 0,
      pointerX: WIDTH * 0.5,
      pointerActive: false,
      fire: false,
    };
  }

  start() {
    if (this.mode === "menu") {
      this.mode = "playing";
      this.queueServe(this.currentLevel.startStatus, 0.85);
    }
  }

  loadLevel(index) {
    const level = LEVELS[index];
    const layout = level.layout;
    this.currentLevel = level;
    this.basePaddleWidth = Math.round(PADDLE_WIDTH * level.paddleScale);
    this.focusPaddleBonus = 0;
    this.bricks = [];
    for (let row = 0; row < BRICK_ROWS; row += 1) {
      const line = layout[row];
      for (let col = 0; col < BRICK_COLS; col += 1) {
        const brick = makeBrick(line[col], row, col);
        if (brick) {
          this.bricks.push(brick);
        }
      }
    }
    this.lasers = [];
    this.powerups = [];
    this.particles = [];
    this.levelBrickCount = this.bricks.length;
    this.levelBricksCleared = 0;
    this.levelPowerDrops = {
      multiball: 0,
      focus: 0,
      laser: 0,
      phase: 0,
      burst: 0,
    };
    this.surgeActive = false;
    this.phaseTimer = 0;
    this.burstTimer = 0;
    this.syncPaddleWidth();
  }

  resetBallOnPaddle() {
    this.balls = [createBall(this.paddle.x, this.paddle.y - 24, 0, 0)];
  }

  queueServe(status, duration = 0.75, releaseStatus = status) {
    this.status = status;
    this.serveTimer = duration;
    this.serveReleaseStatus = releaseStatus;
    this.resetBallOnPaddle();
  }

  syncHeldBall() {
    const ball = this.balls[0];
    if (!ball) {
      return;
    }
    ball.x = this.paddle.x;
    ball.y = this.paddle.y - 24;
    ball.vx = 0;
    ball.vy = 0;
    ball.trail.length = 0;
  }

  releaseHeldBall() {
    const ball = this.balls[0];
    if (!ball) {
      return;
    }
    ball.x = this.paddle.x;
    ball.y = this.paddle.y - 24;
    Object.assign(
      ball,
      clampBallVelocity(clamp(this.paddle.vx * 0.18, -180, 180), -this.currentLevel.ballSpeed, -1),
    );
  }

  setMoveDirection(direction) {
    this.input.move = direction;
  }

  setPointer(x) {
    this.input.pointerX = clamp(x, 32, WIDTH - 32);
    this.input.pointerActive = true;
  }

  clearPointer() {
    this.input.pointerActive = false;
  }

  setFire(active) {
    this.input.fire = active;
  }

  syncPaddleWidth() {
    const surgeScale = this.surgeActive ? this.currentLevel.surgePaddleScale : 1;
    this.paddle.width = Math.max(88, Math.round((this.basePaddleWidth + this.focusPaddleBonus) * surgeScale));
  }

  restartRound() {
    if (this.mode === "lose" || this.mode === "win") {
      this.restart();
      this.start();
    }
  }

  update(dt) {
    const step = Math.min(0.033, dt);
    this.time += step;
    this.updatePaddle(step);
    this.tickParticles(step);

    if (this.mode !== "playing") {
      return;
    }

    this.paddle.laserTimer = Math.max(0, this.paddle.laserTimer - step);
    this.paddle.laserCooldown = Math.max(0, this.paddle.laserCooldown - step);
    this.phaseTimer = Math.max(0, this.phaseTimer - step);
    this.burstTimer = Math.max(0, this.burstTimer - step);

    if (this.serveTimer > 0) {
      this.serveTimer = Math.max(0, this.serveTimer - step);
      this.syncHeldBall();
      if (this.serveTimer === 0) {
        this.status = this.serveReleaseStatus || this.status;
        this.serveReleaseStatus = null;
        this.releaseHeldBall();
      }
      return;
    }

    if (this.input.fire && this.paddle.laserTimer > 0 && this.paddle.laserCooldown === 0) {
      this.fireLasers();
      this.paddle.laserCooldown = 0.18;
    }

    this.updateBalls(step);
    this.updateLasers(step);
    this.updatePowerups(step);
    this.cleanup();
    this.resolveLevelState();
  }

  updatePaddle(dt) {
    const previousX = this.paddle.x;
    if (this.input.pointerActive) {
      const diff = this.input.pointerX - this.paddle.x;
      const maxStep = PADDLE_SPEED * dt;
      this.paddle.x += clamp(diff, -maxStep, maxStep);
    } else if (this.input.move !== 0) {
      this.paddle.x += this.input.move * PADDLE_SPEED * dt;
    }
    this.paddle.x = clamp(this.paddle.x, 100, WIDTH - 100);
    this.paddle.vx = (this.paddle.x - previousX) / Math.max(dt, 0.0001);
  }

  updateBalls(dt) {
    for (const ball of this.balls) {
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      ball.trail.unshift({ x: ball.x, y: ball.y });
      ball.trail.length = Math.min(ball.trail.length, 8);

      if (ball.x - ball.radius <= 0) {
        ball.x = ball.radius;
        ball.vx = Math.abs(ball.vx);
        Object.assign(ball, clampBallVelocity(ball.vx, ball.vy));
      } else if (ball.x + ball.radius >= WIDTH) {
        ball.x = WIDTH - ball.radius;
        ball.vx = -Math.abs(ball.vx);
        Object.assign(ball, clampBallVelocity(ball.vx, ball.vy));
      }

      if (ball.y - ball.radius <= 0) {
        ball.y = ball.radius;
        ball.vy = Math.abs(ball.vy);
        Object.assign(ball, clampBallVelocity(ball.vx, ball.vy, 1));
      }

      if (this.hitPaddle(ball)) {
        this.reflectOffPaddle(ball);
      }

      this.hitBrick(ball);
    }

    const alive = [];
    for (const ball of this.balls) {
      if (ball.y - ball.radius <= HEIGHT + 20) {
        alive.push(ball);
      }
    }
    this.balls = alive;

    if (this.balls.length === 0) {
      this.lives -= 1;
      if (this.lives <= 0) {
        this.mode = "lose";
        this.status = "The prism wall held.";
      } else {
        this.queueServe("Ball lost. Line up the next rebound.");
      }
    }
  }

  hitPaddle(ball) {
    const paddle = this.paddle;
    return (
      ball.vy > 0 &&
      ball.x + ball.radius >= paddle.x - paddle.width * 0.5 &&
      ball.x - ball.radius <= paddle.x + paddle.width * 0.5 &&
      ball.y + ball.radius >= paddle.y - paddle.height * 0.5 &&
      ball.y - ball.radius <= paddle.y + paddle.height * 0.5
    );
  }

  reflectOffPaddle(ball) {
    const paddle = this.paddle;
    const contact = clamp((ball.x - paddle.x) / (paddle.width * 0.5), -1, 1);
    const speed = clamp(Math.hypot(ball.vx, ball.vy) * 1.02, BALL_SPEED, BALL_MAX_SPEED);
    const angle = contact * 1.12 - (Math.PI / 2 + 0.02);
    ball.vx = Math.cos(angle) * speed + paddle.vx * 0.18;
    ball.vy = Math.sin(angle) * speed;
    if (ball.vy > -260) {
      ball.vy = -260;
    }
    Object.assign(ball, clampBallVelocity(ball.vx, ball.vy, -1));
    ball.y = paddle.y - paddle.height * 0.5 - ball.radius - 1;
    this.emitBurst(ball.x, ball.y, "#ffffff", 6);
    this.status = Math.abs(contact) > 0.72 ? "Sharp angle rebound." : "Clean center rebound.";
  }

  hitBrick(ball) {
    for (const brick of this.bricks) {
      if (brick.destroyed) {
        continue;
      }
      if (
        ball.x + ball.radius < brick.x ||
        ball.x - ball.radius > brick.x + brick.width ||
        ball.y + ball.radius < brick.y ||
        ball.y - ball.radius > brick.y + brick.height
      ) {
        continue;
      }

      const overlapLeft = ball.x + ball.radius - brick.x;
      const overlapRight = brick.x + brick.width - (ball.x - ball.radius);
      const overlapTop = ball.y + ball.radius - brick.y;
      const overlapBottom = brick.y + brick.height - (ball.y - ball.radius);
      const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);
      const phasePierce = this.phaseTimer > 0 && brick.kind === "standard";

      if (!phasePierce) {
        if (minOverlap === overlapLeft || minOverlap === overlapRight) {
          ball.vx *= -1;
        } else {
          ball.vy *= -1;
        }
        Object.assign(ball, clampBallVelocity(ball.vx, ball.vy));
      }

      this.damageBrick(brick, ball);
      if (phasePierce) {
        this.emitBurst(ball.x, ball.y, "#ffd970", 4);
        this.status = "Phase lane open.";
      }
      break;
    }
  }

  damageBrick(brick, source) {
    if (brick.destroyed) {
      return;
    }
    brick.hp -= 1;
    if (this.burstTimer > 0 && brick.hp > 0 && brick.kind === "standard") {
      brick.hp -= 1;
      this.emitBurst(source.x, source.y, "#ffb56f", 5);
      this.status = "Burst shot cracked through.";
    }
    this.score += brick.hp <= 0 ? brick.score : Math.round(brick.score * 0.35);
    this.emitBurst(source.x, source.y, brick.color, brick.kind === "prism" ? 10 : 6);

    if (brick.kind === "prism" && !brick.splitDone) {
      brick.splitDone = true;
      this.splitBall(source);
      this.status = "Prism split triggered.";
    }

    if (brick.hp <= 0) {
      brick.destroyed = true;
      this.levelBricksCleared += 1;
      this.rollPowerup(brick);
      this.updateLevelPressure();
    }
  }

  splitBall(source) {
    if (this.balls.length >= MAX_BALLS) {
      return;
    }
    const additions = [];
    const baseSpeed = clamp(Math.hypot(source.vx, source.vy), BALL_SPEED, BALL_MAX_SPEED);
    for (const angle of [-0.55, 0.55]) {
      if (this.balls.length + additions.length >= MAX_BALLS) {
        break;
      }
      const rotated = rotateVelocity(source.vx || 0, source.vy || -baseSpeed, angle);
      const length = Math.hypot(rotated.vx, rotated.vy) || 1;
      const nextVelocity = clampBallVelocity(
        (rotated.vx / length) * baseSpeed,
        (rotated.vy / length) * baseSpeed,
      );
      additions.push(
        createBall(
          source.x,
          source.y,
          nextVelocity.vx,
          nextVelocity.vy,
        ),
      );
    }
    this.balls.push(...additions);
  }

  rollPowerup(brick) {
    const clearRatio = this.getLevelClearRatio();
    if (clearRatio < this.currentLevel.powerUnlockRatio) {
      return;
    }

    const roll = Math.random();
    const availableTypes = [];
    if (
      roll < this.currentLevel.multiballChance &&
      this.levelPowerDrops.multiball < this.currentLevel.multiballCap
    ) {
      availableTypes.push("multiball");
    }
    if (
      roll < this.currentLevel.multiballChance + this.currentLevel.focusChance &&
      this.levelPowerDrops.focus < this.currentLevel.focusCap
    ) {
      availableTypes.push("focus");
    }
    if (
      roll < this.currentLevel.multiballChance + this.currentLevel.focusChance + this.currentLevel.laserChance &&
      this.levelPowerDrops.laser < this.currentLevel.laserCap
    ) {
      availableTypes.push("laser");
    }
    if (
      roll <
        this.currentLevel.multiballChance +
          this.currentLevel.focusChance +
          this.currentLevel.laserChance +
          this.currentLevel.phaseChance &&
      this.levelPowerDrops.phase < this.currentLevel.phaseCap
    ) {
      availableTypes.push("phase");
    }
    if (
      roll <
        this.currentLevel.multiballChance +
          this.currentLevel.focusChance +
          this.currentLevel.laserChance +
          this.currentLevel.phaseChance +
          this.currentLevel.burstChance &&
      this.levelPowerDrops.burst < this.currentLevel.burstCap
    ) {
      availableTypes.push("burst");
    }

    const type = availableTypes[Math.floor(Math.random() * availableTypes.length)];
    if (!type) {
      return;
    }

    this.levelPowerDrops[type] += 1;

    this.powerups.push({
      id: randId("powerup"),
      type,
      x: brick.x + brick.width * 0.5,
      y: brick.y + brick.height * 0.5,
      vy: POWERUP_SPEED,
      radius: 18,
    });
  }

  updatePowerups(dt) {
    for (const powerup of this.powerups) {
      powerup.y += powerup.vy * dt;
      const paddle = this.paddle;
      const caught =
        powerup.x >= paddle.x - paddle.width * 0.5 &&
        powerup.x <= paddle.x + paddle.width * 0.5 &&
        powerup.y + powerup.radius >= paddle.y - paddle.height;

      if (caught) {
        powerup.collected = true;
        this.applyPowerup(powerup.type);
      } else if (powerup.y - powerup.radius > HEIGHT + 20) {
        powerup.dead = true;
      }
    }
  }

  getLevelClearRatio() {
    if (this.levelBrickCount <= 0) {
      return 1;
    }
    return this.levelBricksCleared / this.levelBrickCount;
  }

  updateLevelPressure() {
    if (this.surgeActive || this.getLevelClearRatio() < this.currentLevel.surgeRatio) {
      return;
    }

    this.surgeActive = true;
    this.paddle.width = Math.max(
      88,
      Math.round((this.basePaddleWidth + this.focusPaddleBonus) * this.currentLevel.surgePaddleScale),
    );
    for (const ball of this.balls) {
      const nextSpeed = clamp(
        Math.hypot(ball.vx, ball.vy) * this.currentLevel.surgeBallSpeedBonus,
        BALL_SPEED,
        BALL_MAX_SPEED,
      );
      Object.assign(ball, scaleVelocity(ball.vx || 0, ball.vy || -nextSpeed, nextSpeed));
      Object.assign(ball, clampBallVelocity(ball.vx, ball.vy));
    }
    this.status = this.currentLevel.surgeStatus;
  }

  applyPowerup(type) {
    if (type === "multiball") {
      const sourceBalls = [...this.balls];
      for (const ball of sourceBalls) {
        if (this.balls.length >= MAX_BALLS) {
          break;
        }
        this.splitBall(ball);
      }
      this.status = "Multi-ball online.";
    } else if (type === "focus") {
      this.focusPaddleBonus = clamp(this.focusPaddleBonus + FOCUS_PADDLE_BONUS, 0, FOCUS_PADDLE_BONUS_MAX);
      this.syncPaddleWidth();
      this.status =
        this.focusPaddleBonus >= FOCUS_PADDLE_BONUS_MAX
          ? "Focus cradle maxed for this layer."
          : "Focus cradle widened.";
    } else if (type === "laser") {
      this.paddle.laserTimer = 12;
      this.status = "Laser cannons armed.";
    } else if (type === "phase") {
      this.phaseTimer = 9;
      for (const ball of this.balls) {
        Object.assign(ball, clampBallVelocity(ball.vx, ball.vy));
      }
      this.status = "Phase shots online.";
    } else if (type === "burst") {
      this.burstTimer = BURST_TIME;
      for (const ball of this.balls) {
        const nextSpeed = clamp(Math.hypot(ball.vx, ball.vy) * 1.08, BALL_SPEED, BALL_MAX_SPEED);
        Object.assign(ball, scaleVelocity(ball.vx || 0, ball.vy || -nextSpeed, nextSpeed));
        Object.assign(ball, clampBallVelocity(ball.vx, ball.vy));
      }
      this.status = "Burst rounds online.";
    }
  }

  fireLasers() {
    const leftX = this.paddle.x - this.paddle.width * 0.28;
    const rightX = this.paddle.x + this.paddle.width * 0.28;
    this.lasers.push(
      { id: randId("laser"), x: leftX, y: this.paddle.y - 18, vy: -LASER_SPEED },
      { id: randId("laser"), x: rightX, y: this.paddle.y - 18, vy: -LASER_SPEED },
    );
    this.emitBurst(leftX, this.paddle.y - 18, "#ff99b8", 4);
    this.emitBurst(rightX, this.paddle.y - 18, "#ff99b8", 4);
  }

  updateLasers(dt) {
    for (const laser of this.lasers) {
      laser.y += laser.vy * dt;
      for (const brick of this.bricks) {
        if (brick.destroyed) {
          continue;
        }
        if (
          laser.x >= brick.x &&
          laser.x <= brick.x + brick.width &&
          laser.y >= brick.y &&
          laser.y <= brick.y + brick.height
        ) {
          laser.dead = true;
          this.damageBrick(brick, laser);
          break;
        }
      }
      if (laser.y < -20) {
        laser.dead = true;
      }
    }
  }

  resolveLevelState() {
    this.bricks = this.bricks.filter((brick) => !brick.destroyed);
    if (this.mode !== "playing") {
      return;
    }
    if (this.bricks.length > 0) {
      return;
    }

    const clearedLevel = this.currentLevel;
    this.levelIndex += 1;
    if (this.levelIndex >= LEVELS.length) {
      this.mode = "win";
      this.status = "Prism matrix collapsed.";
      return;
    }

    this.loadLevel(this.levelIndex);
    this.queueServe(clearedLevel.clearStatus, 1, this.currentLevel.startStatus);
  }

  cleanup() {
    this.powerups = this.powerups.filter((powerup) => !powerup.dead && !powerup.collected);
    this.lasers = this.lasers.filter((laser) => !laser.dead);
    this.particles = this.particles.filter((particle) => particle.life > 0);
  }

  emitBurst(x, y, color, count) {
    for (let i = 0; i < count; i += 1) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.35;
      const speed = 60 + Math.random() * 120;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.45 + Math.random() * 0.2,
        maxLife: 0.65,
        color,
      });
    }
  }

  tickParticles(dt) {
    for (const particle of this.particles) {
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= 0.97;
      particle.vy *= 0.97;
    }
  }

  getOverlay() {
    if (this.mode === "menu") {
      return {
        eyebrow: "prism breaker",
        title: "Arkanoid Prism-Strike",
        copy: "Start the run, cut angles off the paddle, and use split bricks to snowball the field.",
        button: "Start Run",
      };
    }
    if (this.mode === "lose") {
      return {
        eyebrow: "run lost",
        title: "The wall reset the room.",
        copy: "Restart and try a cleaner rebound chain.",
        button: "Restart Run",
      };
    }
    if (this.mode === "win") {
      return {
        eyebrow: "matrix cleared",
        title: "Every prism layer shattered.",
        copy: "Restart to route a faster clear with cleaner power-up timing.",
        button: "Play Again",
      };
    }
    return null;
  }

  getFrameState() {
    return {
      mode: this.mode,
      score: this.score,
      lives: this.lives,
      level: this.levelIndex + 1,
      levelCount: LEVELS.length,
      ballCount: this.balls.length,
      burstTime: this.burstTimer,
      burstActive: this.burstTimer > 0,
      laserTime: this.paddle.laserTimer,
      laserActive: this.paddle.laserTimer > 0,
      phaseTime: this.phaseTimer,
      phaseActive: this.phaseTimer > 0,
      status: this.status,
      paddle: {
        x: this.paddle.x,
        y: this.paddle.y,
        width: this.paddle.width,
        height: this.paddle.height,
      },
      balls: this.balls.map((ball) => ({
        x: ball.x,
        y: ball.y,
        radius: ball.radius,
        trail: ball.trail,
      })),
      bricks: this.bricks.map((brick) => ({
        x: brick.x,
        y: brick.y,
        width: brick.width,
        height: brick.height,
        hp: brick.hp,
        maxHp: brick.maxHp,
        color: brick.color,
        kind: brick.kind,
      })),
      lasers: this.lasers.map((laser) => ({ x: laser.x, y: laser.y })),
      powerups: this.powerups.map((powerup) => ({
        x: powerup.x,
        y: powerup.y,
        radius: powerup.radius,
        type: powerup.type,
      })),
      particles: this.particles.map((particle) => ({
        x: particle.x,
        y: particle.y,
        life: particle.life,
        maxLife: particle.maxLife,
        color: particle.color,
      })),
      overlay: this.getOverlay(),
    };
  }
}
