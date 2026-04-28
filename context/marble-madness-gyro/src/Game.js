import { LEVELS } from "./levels.js";

const BOARD_TILT = 540;
const FRICTION = 0.986;
const MAX_SPEED = 520;
const MARBLE_RADIUS = 16;
const PIT_PULL = 280;
const PIT_RESET_TIME = 1.1;
const CHECKPOINT_FLASH = 0.55;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function length(x, y) {
  return Math.hypot(x, y);
}

function normalize(x, y, fallbackX = 1, fallbackY = 0) {
  const len = Math.hypot(x, y);
  if (len < 0.0001) {
    return { x: fallbackX, y: fallbackY };
  }
  return { x: x / len, y: y / len };
}

function circleRectPush(circle, rect) {
  const nearestX = clamp(circle.x, rect.x, rect.x + rect.w);
  const nearestY = clamp(circle.y, rect.y, rect.y + rect.h);
  const dx = circle.x - nearestX;
  const dy = circle.y - nearestY;
  const distSq = dx * dx + dy * dy;

  if (distSq >= circle.r * circle.r) {
    return null;
  }

  if (distSq > 0.0001) {
    const dist = Math.sqrt(distSq);
    return {
      nx: dx / dist,
      ny: dy / dist,
      depth: circle.r - dist,
    };
  }

  const left = Math.abs(circle.x - rect.x);
  const right = Math.abs(rect.x + rect.w - circle.x);
  const top = Math.abs(circle.y - rect.y);
  const bottom = Math.abs(rect.y + rect.h - circle.y);
  const minPen = Math.min(left, right, top, bottom);

  if (minPen === left) {
    return { nx: -1, ny: 0, depth: circle.r };
  }
  if (minPen === right) {
    return { nx: 1, ny: 0, depth: circle.r };
  }
  if (minPen === top) {
    return { nx: 0, ny: -1, depth: circle.r };
  }
  return { nx: 0, ny: 1, depth: circle.r };
}

function circleSegmentDistance(point, a, b) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abLenSq = abx * abx + aby * aby;
  const t = abLenSq <= 0.0001
    ? 0
    : clamp(((point.x - a.x) * abx + (point.y - a.y) * aby) / abLenSq, 0, 1);
  const closestX = a.x + abx * t;
  const closestY = a.y + aby * t;
  const dx = point.x - closestX;
  const dy = point.y - closestY;
  return {
    x: closestX,
    y: closestY,
    dx,
    dy,
    distance: Math.hypot(dx, dy),
  };
}

function createLevelState(level) {
  return {
    timeLeft: level.parTime,
    gemsCollected: 0,
    checkpointsCleared: 0,
    checkpointFlash: 0,
    message: `Reach checkpoint 1`,
    marble: {
      x: level.start.x,
      y: level.start.y,
      vx: 0,
      vy: 0,
      r: MARBLE_RADIUS,
    },
    respawn: { x: level.start.x, y: level.start.y },
    gyros: level.gyros.map((gyro) => ({ ...gyro })),
    gems: level.gems.map((gem) => ({ ...gem, collected: false })),
    resetting: 0,
  };
}

export class Game {
  constructor() {
    this.levelIndex = 0;
    this.mode = "menu";
    this.levelState = createLevelState(LEVELS[0]);
    this.falls = 0;
    this.totalTime = 0;
    this.totalGems = 0;
    this.camera = { x: LEVELS[0].camera.x, y: LEVELS[0].camera.y };
    this.messageTimer = 0;
    this.message = "Tilt into the first ring.";
    this.score = 0;
  }

  start() {
    this.levelIndex = 0;
    this.mode = "playing";
    this.levelState = createLevelState(LEVELS[0]);
    this.falls = 0;
    this.totalTime = 0;
    this.totalGems = 0;
    this.score = 0;
    this.messageTimer = 2.2;
    this.message = "Tilt into the first ring.";
    this.camera = { x: LEVELS[0].camera.x, y: LEVELS[0].camera.y };
  }

  restart() {
    this.start();
  }

  update(dt, input) {
    if (this.mode !== "playing") {
      return;
    }

    const level = LEVELS[this.levelIndex];
    const state = this.levelState;
    const marble = state.marble;

    this.totalTime += dt;
    state.timeLeft = Math.max(0, state.timeLeft - dt);
    if (state.timeLeft <= 0) {
      this.mode = "lose";
      this.message = "Out of time. Keep the marble moving.";
      return;
    }

    for (const gyro of state.gyros) {
      gyro.angle += gyro.speed * dt;
    }

    if (state.resetting > 0) {
      state.resetting = Math.max(0, state.resetting - dt);
      marble.vx *= 0.9;
      marble.vy *= 0.9;
      if (state.resetting === 0) {
        marble.x = state.respawn.x;
        marble.y = state.respawn.y;
        marble.vx = 0;
        marble.vy = 0;
        this.messageTimer = 1.2;
        this.message = "Back to checkpoint.";
      }
      return;
    }

    const tiltX = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const tiltY = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    marble.vx += tiltX * BOARD_TILT * dt;
    marble.vy += tiltY * BOARD_TILT * dt;
    marble.vx *= FRICTION;
    marble.vy *= FRICTION;

    const speed = length(marble.vx, marble.vy);
    if (speed > MAX_SPEED) {
      const scale = MAX_SPEED / speed;
      marble.vx *= scale;
      marble.vy *= scale;
    }

    marble.x += marble.vx * dt;
    marble.y += marble.vy * dt;

    for (const wall of level.walls) {
      const hit = circleRectPush(marble, wall);
      if (!hit) {
        continue;
      }
      marble.x += hit.nx * hit.depth;
      marble.y += hit.ny * hit.depth;
      const dot = marble.vx * hit.nx + marble.vy * hit.ny;
      if (dot < 0) {
        marble.vx -= hit.nx * dot * 1.55;
        marble.vy -= hit.ny * dot * 1.55;
      }
    }

    for (const bumper of level.bumpers) {
      const dx = marble.x - bumper.x;
      const dy = marble.y - bumper.y;
      const dist = Math.hypot(dx, dy);
      const minDist = marble.r + bumper.r;
      if (dist >= minDist || dist < 0.0001) {
        continue;
      }
      const normal = normalize(dx, dy);
      marble.x = bumper.x + normal.x * minDist;
      marble.y = bumper.y + normal.y * minDist;
      marble.vx = normal.x * bumper.boost;
      marble.vy = normal.y * bumper.boost;
      this.messageTimer = 0.5;
      this.message = "Bumper boost.";
    }

    for (const pit of level.pits) {
      const dx = pit.x - marble.x;
      const dy = pit.y - marble.y;
      const dist = Math.hypot(dx, dy);
      if (dist < pit.r + 60) {
        const pull = 1 - clamp((dist - pit.r) / 60, 0, 1);
        const dir = normalize(dx, dy, 0, 1);
        marble.vx += dir.x * PIT_PULL * pull * dt;
        marble.vy += dir.y * PIT_PULL * pull * dt;
      }
      if (dist < pit.r - marble.r * 0.15) {
        state.resetting = PIT_RESET_TIME;
        this.falls += 1;
        this.messageTimer = PIT_RESET_TIME;
        this.message = "Pitfall. Respawning.";
        marble.vx = 0;
        marble.vy = 0;
        state.timeLeft = Math.max(0, state.timeLeft - 4);
        break;
      }
    }

    for (const gyro of state.gyros) {
      const ax = Math.cos(gyro.angle) * gyro.armLength;
      const ay = Math.sin(gyro.angle) * gyro.armLength;
      const segment = circleSegmentDistance(
        marble,
        { x: gyro.x - ax, y: gyro.y - ay },
        { x: gyro.x + ax, y: gyro.y + ay },
      );
      if (segment.distance >= marble.r + gyro.armWidth * 0.5) {
        continue;
      }
      const normal = normalize(segment.dx, segment.dy, Math.cos(gyro.angle + Math.PI * 0.5), Math.sin(gyro.angle + Math.PI * 0.5));
      marble.x = segment.x + normal.x * (marble.r + gyro.armWidth * 0.5);
      marble.y = segment.y + normal.y * (marble.r + gyro.armWidth * 0.5);
      const tangential = normalize(-ay, ax);
      marble.vx = normal.x * 240 + tangential.x * gyro.speed * 135;
      marble.vy = normal.y * 240 + tangential.y * gyro.speed * 135;
      this.messageTimer = 0.55;
      this.message = "Gyro hit. Correct your line.";
    }

    for (const gem of state.gems) {
      if (gem.collected) {
        continue;
      }
      const dx = gem.x - marble.x;
      const dy = gem.y - marble.y;
      if (dx * dx + dy * dy <= (marble.r + gem.r) * (marble.r + gem.r)) {
        gem.collected = true;
        state.gemsCollected += 1;
        this.totalGems += 1;
        this.score += 120;
        this.messageTimer = 0.9;
        this.message = `Gem ${state.gemsCollected} / ${level.gemsRequired}`;
      }
    }

    const nextCheckpoint = level.checkpoints[state.checkpointsCleared];
    if (nextCheckpoint) {
      const dx = nextCheckpoint.x - marble.x;
      const dy = nextCheckpoint.y - marble.y;
      if (dx * dx + dy * dy <= (marble.r + nextCheckpoint.r) * (marble.r + nextCheckpoint.r)) {
        if (nextCheckpoint.finish && state.gemsCollected < level.gemsRequired) {
          this.messageTimer = 1.4;
          this.message = `Need ${level.gemsRequired - state.gemsCollected} more gems.`;
        } else {
          state.checkpointsCleared += 1;
          state.checkpointFlash = CHECKPOINT_FLASH;
          state.respawn = { x: nextCheckpoint.x, y: nextCheckpoint.y };
          this.score += nextCheckpoint.finish ? 700 : 250;

          if (nextCheckpoint.finish) {
            const bonus = Math.round(state.timeLeft * 18);
            this.score += bonus;
            if (this.levelIndex === LEVELS.length - 1) {
              this.mode = "win";
              this.message = `Course clear. Score ${this.score}.`;
              return;
            }
            this.levelIndex += 1;
            const newLevel = LEVELS[this.levelIndex];
            this.levelState = createLevelState(newLevel);
            this.camera = { x: newLevel.camera.x, y: newLevel.camera.y };
            this.messageTimer = 2;
            this.message = `${newLevel.name}. Reach checkpoint 1.`;
            return;
          }

          this.messageTimer = 1.3;
          this.message = `Checkpoint ${state.checkpointsCleared} locked.`;
        }
      }
    }

    if (state.checkpointFlash > 0) {
      state.checkpointFlash = Math.max(0, state.checkpointFlash - dt);
    }
    if (this.messageTimer > 0) {
      this.messageTimer = Math.max(0, this.messageTimer - dt);
    }

    const cameraTargetX = marble.x;
    const cameraTargetY = marble.y;
    this.camera.x += (cameraTargetX - this.camera.x) * Math.min(1, dt * 2.4);
    this.camera.y += (cameraTargetY - this.camera.y) * Math.min(1, dt * 2.4);
  }

  getFrameState() {
    const level = LEVELS[this.levelIndex];
    const state = this.levelState;
    const nextCheckpoint = level.checkpoints[state.checkpointsCleared] || null;
    const marble = state.marble;

    return {
      mode: this.mode,
      stageNumber: this.levelIndex + 1,
      stageCount: LEVELS.length,
      stageName: level.name,
      timeLeft: state.timeLeft,
      gemsCollected: state.gemsCollected,
      gemsRequired: level.gemsRequired,
      falls: this.falls,
      totalGems: this.totalGems,
      score: this.score,
      marble: { ...marble },
      camera: { ...this.camera },
      level,
      gyros: state.gyros,
      gems: state.gems,
      checkpointsCleared: state.checkpointsCleared,
      nextCheckpoint,
      resetting: state.resetting,
      checkpointFlash: state.checkpointFlash,
      message: this.messageTimer > 0 || this.mode !== "playing" ? this.message : "",
      velocity: Math.round(length(marble.vx, marble.vy)),
    };
  }
}
