import { COURSE_BOUNDS, HOLES } from "./levels.js";

const BALL_RADIUS = 11;
const STOP_SPEED = 8;
const MAX_DRAG = 170;
const MAX_SHOT_SPEED = 760;
const WALL_BOUNCE = 0.9;
const BUMPER_BOUNCE = 1.04;
const CUP_CAPTURE_SPEED = 150;
const CUP_SOFT_CAPTURE_SPEED = 220;
const CUP_SOFT_CAPTURE_MARGIN = 8;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function length(x, y) {
  return Math.hypot(x, y);
}

function normalize(x, y) {
  const mag = Math.hypot(x, y) || 1;
  return { x: x / mag, y: y / mag };
}

function reflect(vx, vy, nx, ny, scale = 1) {
  const dot = vx * nx + vy * ny;
  return {
    x: (vx - 2 * dot * nx) * scale,
    y: (vy - 2 * dot * ny) * scale,
  };
}

function nearestPointOnSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const denom = abx * abx + aby * aby || 1;
  const t = clamp(((px - ax) * abx + (py - ay) * aby) / denom, 0, 1);
  return { x: ax + abx * t, y: ay + aby * t };
}

function parForHoles(count) {
  let total = 0;
  for (let index = 0; index < count; index += 1) {
    total += HOLES[index].par;
  }
  return total;
}

export class Game {
  constructor() {
    this.width = 960;
    this.height = 540;
    this.mode = "menu";
    this.holeIndex = 0;
    this.totalPar = HOLES.reduce((sum, hole) => sum + hole.par, 0);
    this.totalStrokes = 0;
    this.messageTimer = 0;
    this.windmillAngles = [];
    this.dragState = null;
    this.lastPointer = null;
    this.ball = this.createBall(HOLES[0].start);
    this.loadHole(0, true);
  }

  createBall(start) {
    return {
      x: start.x,
      y: start.y,
      vx: 0,
      vy: 0,
      radius: BALL_RADIUS,
      moving: false,
      sunk: false,
    };
  }

  get currentHole() {
    return HOLES[this.holeIndex];
  }

  start() {
    this.mode = "playing";
    this.restartCourse();
  }

  restartCourse() {
    this.totalStrokes = 0;
    this.loadHole(0, true);
    this.mode = "playing";
  }

  restartHole() {
    const strokesBeforeHole = this.holeStrokeStart ?? 0;
    this.totalStrokes = strokesBeforeHole;
    this.loadHole(this.holeIndex, true);
    this.mode = "playing";
  }

  loadHole(index, resetTotalForHole = false) {
    this.holeIndex = index;
    this.holeStrokeStart = resetTotalForHole ? this.totalStrokes : this.holeStrokeStart ?? this.totalStrokes;
    this.ball = this.createBall(HOLES[index].start);
    this.messageTimer = 0;
    this.windmillAngles = HOLES[index].windmills.map((_, i) => i * 0.7);
    this.dragState = null;
  }

  onPointerDown(x, y) {
    this.lastPointer = { x, y };
    if (this.mode === "holeComplete") {
      this.advanceHole();
      return;
    }
    if (this.mode !== "playing" || this.ball.moving || this.ball.sunk) {
      return;
    }
    if (length(x - this.ball.x, y - this.ball.y) <= this.ball.radius + 18) {
      this.dragState = {
        startX: x,
        startY: y,
        currentX: x,
        currentY: y,
      };
    }
  }

  onPointerMove(x, y) {
    this.lastPointer = { x, y };
    if (!this.dragState) {
      return;
    }
    this.dragState.currentX = x;
    this.dragState.currentY = y;
  }

  onPointerUp(x, y) {
    this.lastPointer = { x, y };
    if (!this.dragState) {
      return;
    }
    this.dragState.currentX = x;
    this.dragState.currentY = y;
    this.shootFromDrag();
  }

  shootFromDrag() {
    const drag = this.dragState;
    this.dragState = null;
    if (!drag || this.ball.moving || this.ball.sunk) {
      return;
    }
    const dx = drag.currentX - this.ball.x;
    const dy = drag.currentY - this.ball.y;
    const pullX = -dx;
    const pullY = -dy;
    const mag = Math.min(MAX_DRAG, length(pullX, pullY));
    if (mag < 10) {
      return;
    }
    const dir = normalize(pullX, pullY);
    const speed = (mag / MAX_DRAG) * MAX_SHOT_SPEED;
    this.ball.vx = dir.x * speed;
    this.ball.vy = dir.y * speed;
    this.ball.moving = true;
    this.totalStrokes += 1;
  }

  nextHole() {
    if (this.mode === "holeComplete") {
      this.advanceHole();
    }
  }

  advanceHole() {
    if (this.holeIndex >= HOLES.length - 1) {
      this.mode = "win";
      return;
    }
    this.loadHole(this.holeIndex + 1, true);
    this.mode = "playing";
  }

  update(dt) {
    if (this.mode === "menu" || this.mode === "win") {
      return;
    }

    for (let i = 0; i < this.windmillAngles.length; i += 1) {
      this.windmillAngles[i] += this.currentHole.windmills[i].speed * dt;
    }

    if (this.mode === "holeComplete") {
      this.messageTimer += dt;
      return;
    }

    if (!this.ball.moving) {
      return;
    }

    const ball = this.ball;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    const surfaceFriction = this.getSurfaceFriction(ball.x, ball.y);
    const frictionScale = Math.max(0, 1 - surfaceFriction * dt);
    ball.vx *= frictionScale;
    ball.vy *= frictionScale;

    this.resolveBoundaryCollision();
    this.resolveWallCollisions();
    this.resolveBumpers();
    this.resolveWindmills();
    this.resolveCup();

    if (length(ball.vx, ball.vy) < STOP_SPEED && !ball.sunk) {
      ball.vx = 0;
      ball.vy = 0;
      ball.moving = false;
    }
  }

  getSurfaceFriction(x, y) {
    for (const patch of this.currentHole.sand) {
      if (x >= patch.x && x <= patch.x + patch.width && y >= patch.y && y <= patch.y + patch.height) {
        return 2.8;
      }
    }
    return 1.35;
  }

  resolveBoundaryCollision() {
    const ball = this.ball;
    const minX = COURSE_BOUNDS.x + ball.radius;
    const maxX = COURSE_BOUNDS.x + COURSE_BOUNDS.width - ball.radius;
    const minY = COURSE_BOUNDS.y + ball.radius;
    const maxY = COURSE_BOUNDS.y + COURSE_BOUNDS.height - ball.radius;

    if (ball.x < minX) {
      ball.x = minX;
      ball.vx = Math.abs(ball.vx) * WALL_BOUNCE;
    } else if (ball.x > maxX) {
      ball.x = maxX;
      ball.vx = -Math.abs(ball.vx) * WALL_BOUNCE;
    }

    if (ball.y < minY) {
      ball.y = minY;
      ball.vy = Math.abs(ball.vy) * WALL_BOUNCE;
    } else if (ball.y > maxY) {
      ball.y = maxY;
      ball.vy = -Math.abs(ball.vy) * WALL_BOUNCE;
    }
  }

  resolveWallCollisions() {
    const ball = this.ball;
    for (const wall of this.currentHole.walls) {
      const nearestX = clamp(ball.x, wall.x, wall.x + wall.width);
      const nearestY = clamp(ball.y, wall.y, wall.y + wall.height);
      const dx = ball.x - nearestX;
      const dy = ball.y - nearestY;
      const dist = Math.hypot(dx, dy);
      if (dist === 0 || dist >= ball.radius) {
        continue;
      }
      const overlap = ball.radius - dist;
      const nx = dx / dist;
      const ny = dy / dist;
      ball.x += nx * overlap;
      ball.y += ny * overlap;
      const bounce = reflect(ball.vx, ball.vy, nx, ny, WALL_BOUNCE);
      ball.vx = bounce.x;
      ball.vy = bounce.y;
    }
  }

  resolveBumpers() {
    const ball = this.ball;
    for (const bumper of this.currentHole.bumpers) {
      const dx = ball.x - bumper.x;
      const dy = ball.y - bumper.y;
      const dist = Math.hypot(dx, dy);
      const minDist = ball.radius + bumper.radius;
      if (dist === 0 || dist >= minDist) {
        continue;
      }
      const nx = dx / dist;
      const ny = dy / dist;
      const overlap = minDist - dist;
      ball.x += nx * overlap;
      ball.y += ny * overlap;
      const bounce = reflect(ball.vx, ball.vy, nx, ny, BUMPER_BOUNCE);
      ball.vx = bounce.x;
      ball.vy = bounce.y;
    }
  }

  resolveWindmills() {
    const ball = this.ball;
    const hole = this.currentHole;

    hole.windmills.forEach((windmill, windmillIndex) => {
      const baseAngle = this.windmillAngles[windmillIndex];
      for (let bladeIndex = 0; bladeIndex < windmill.bladeCount; bladeIndex += 1) {
        const angle = baseAngle + (Math.PI * 2 * bladeIndex) / windmill.bladeCount;
        const tipX = windmill.x + Math.cos(angle) * windmill.radius;
        const tipY = windmill.y + Math.sin(angle) * windmill.radius;
        const nearest = nearestPointOnSegment(ball.x, ball.y, windmill.x, windmill.y, tipX, tipY);
        const dx = ball.x - nearest.x;
        const dy = ball.y - nearest.y;
        const dist = Math.hypot(dx, dy);
        const minDist = ball.radius + windmill.bladeWidth * 0.5;
        if (dist === 0 || dist >= minDist) {
          continue;
        }
        const nx = dx / dist;
        const ny = dy / dist;
        const overlap = minDist - dist;
        ball.x += nx * overlap;
        ball.y += ny * overlap;
        const tangentX = -Math.sin(angle);
        const tangentY = Math.cos(angle);
        const bladeSpeed = windmill.speed * windmill.radius * 0.55;
        const relativeVx = ball.vx - tangentX * bladeSpeed;
        const relativeVy = ball.vy - tangentY * bladeSpeed;
        const bounced = reflect(relativeVx, relativeVy, nx, ny, 0.96);
        ball.vx = bounced.x + tangentX * bladeSpeed;
        ball.vy = bounced.y + tangentY * bladeSpeed;
        ball.moving = true;
      }
    });
  }

  resolveCup() {
    const ball = this.ball;
    const cup = this.currentHole.cup;
    const dx = cup.x - ball.x;
    const dy = cup.y - ball.y;
    const dist = Math.hypot(dx, dy);
    const speed = Math.hypot(ball.vx, ball.vy);

    if (dist < cup.radius + CUP_SOFT_CAPTURE_MARGIN && speed <= CUP_SOFT_CAPTURE_SPEED) {
      const pull = clamp(1 - dist / (cup.radius + CUP_SOFT_CAPTURE_MARGIN), 0, 1);
      ball.vx += (dx / Math.max(dist, 1)) * pull * 90;
      ball.vy += (dy / Math.max(dist, 1)) * pull * 90;
      ball.vx *= 0.94;
      ball.vy *= 0.94;
    }

    if (dist < cup.radius + 4 && speed <= CUP_CAPTURE_SPEED) {
      ball.x = cup.x;
      ball.y = cup.y;
      ball.vx = 0;
      ball.vy = 0;
      ball.moving = false;
      ball.sunk = true;
      this.mode = "holeComplete";
      this.messageTimer = 0;
    }
  }

  getShotPreview() {
    if (!this.dragState || this.mode !== "playing" || this.ball.moving) {
      return null;
    }
    const dx = this.dragState.currentX - this.ball.x;
    const dy = this.dragState.currentY - this.ball.y;
    const mag = Math.min(MAX_DRAG, length(dx, dy));
    if (mag < 8) {
      return null;
    }
    const dir = normalize(-dx, -dy);
    return {
      aimX: dir.x,
      aimY: dir.y,
      power: mag / MAX_DRAG,
      previewX: this.ball.x + dir.x * 110 * (mag / MAX_DRAG),
      previewY: this.ball.y + dir.y * 110 * (mag / MAX_DRAG),
    };
  }

  getFrameState() {
    const completedHoleCount =
      this.mode === "holeComplete" || this.mode === "win" ? this.holeIndex + 1 : this.holeIndex;
    const completedPar = parForHoles(completedHoleCount);
    return {
      mode: this.mode,
      width: this.width,
      height: this.height,
      bounds: COURSE_BOUNDS,
      holeIndex: this.holeIndex,
      totalHoles: HOLES.length,
      hole: this.currentHole,
      ball: { ...this.ball },
      windmillAngles: [...this.windmillAngles],
      shotPreview: this.getShotPreview(),
      totalStrokes: this.totalStrokes,
      holeStrokes: this.totalStrokes - this.holeStrokeStart,
      cardScoreVsPar: this.totalStrokes - completedPar,
      totalPar: this.totalPar,
      messageTimer: this.messageTimer,
    };
  }
}
