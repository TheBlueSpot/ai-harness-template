// mini-golf-windmill/src/levels.js
var COURSE_BOUNDS = { x: 60, y: 60, width: 840, height: 420 };
var HOLES = [
  {
    name: "Warmup Bend",
    par: 3,
    start: { x: 150, y: 420 },
    cup: { x: 805, y: 145, radius: 15 },
    walls: [
      { x: 330, y: 250, width: 120, height: 24 },
      { x: 515, y: 180, width: 26, height: 180 }
    ],
    sand: [{ x: 610, y: 305, width: 150, height: 80 }],
    bumpers: [{ x: 265, y: 185, radius: 24 }],
    windmills: []
  },
  {
    name: "Twin Sails",
    par: 4,
    start: { x: 145, y: 145 },
    cup: { x: 800, y: 405, radius: 15 },
    walls: [
      { x: 320, y: 120, width: 30, height: 180 },
      { x: 320, y: 340, width: 210, height: 24 },
      { x: 610, y: 185, width: 30, height: 220 }
    ],
    sand: [{ x: 690, y: 110, width: 135, height: 55 }],
    bumpers: [{ x: 520, y: 185, radius: 20 }],
    windmills: [{ x: 515, y: 270, radius: 88, bladeCount: 4, bladeWidth: 14, speed: 1.3 }]
  },
  {
    name: "Cross Breeze",
    par: 4,
    start: { x: 160, y: 408 },
    cup: { x: 805, y: 130, radius: 15 },
    walls: [
      { x: 250, y: 300, width: 160, height: 22 },
      { x: 495, y: 120, width: 22, height: 250 },
      { x: 620, y: 295, width: 180, height: 22 }
    ],
    sand: [
      { x: 118, y: 130, width: 130, height: 70 },
      { x: 700, y: 350, width: 120, height: 80 }
    ],
    bumpers: [
      { x: 462, y: 400, radius: 22 },
      { x: 575, y: 205, radius: 22 }
    ],
    windmills: [
      { x: 352, y: 190, radius: 72, bladeCount: 3, bladeWidth: 16, speed: -1.45 },
      { x: 720, y: 200, radius: 64, bladeCount: 4, bladeWidth: 12, speed: 1.9 }
    ]
  },
  {
    name: "Gatekeeper",
    par: 5,
    start: { x: 140, y: 270 },
    cup: { x: 795, y: 268, radius: 15 },
    walls: [
      { x: 270, y: 110, width: 24, height: 320 },
      { x: 455, y: 110, width: 24, height: 150 },
      { x: 455, y: 315, width: 24, height: 115 },
      { x: 640, y: 110, width: 24, height: 320 }
    ],
    sand: [{ x: 705, y: 155, width: 95, height: 220 }],
    bumpers: [
      { x: 385, y: 160, radius: 18 },
      { x: 385, y: 375, radius: 18 },
      { x: 565, y: 270, radius: 22 }
    ],
    windmills: [
      { x: 385, y: 270, radius: 76, bladeCount: 2, bladeWidth: 18, speed: 2.3 },
      { x: 565, y: 270, radius: 76, bladeCount: 4, bladeWidth: 12, speed: -1.5 }
    ]
  },
  {
    name: "Final Loop",
    par: 5,
    start: { x: 165, y: 400 },
    cup: { x: 802, y: 130, radius: 15 },
    walls: [
      { x: 270, y: 120, width: 430, height: 20 },
      { x: 270, y: 120, width: 20, height: 230 },
      { x: 270, y: 330, width: 250, height: 20 },
      { x: 500, y: 220, width: 20, height: 130 },
      { x: 590, y: 220, width: 20, height: 170 },
      { x: 680, y: 120, width: 20, height: 200 }
    ],
    sand: [{ x: 105, y: 118, width: 120, height: 78 }],
    bumpers: [
      { x: 440, y: 415, radius: 23 },
      { x: 748, y: 380, radius: 23 }
    ],
    windmills: [
      { x: 405, y: 240, radius: 62, bladeCount: 3, bladeWidth: 14, speed: 1.4 },
      { x: 635, y: 375, radius: 64, bladeCount: 3, bladeWidth: 14, speed: -1.8 }
    ]
  },
  {
    name: "Victory Pin",
    par: 4,
    start: { x: 146, y: 270 },
    cup: { x: 805, y: 270, radius: 15 },
    walls: [
      { x: 250, y: 140, width: 30, height: 260 },
      { x: 435, y: 60, width: 28, height: 200 },
      { x: 435, y: 310, width: 28, height: 170 },
      { x: 620, y: 140, width: 30, height: 260 }
    ],
    sand: [
      { x: 690, y: 155, width: 120, height: 220 },
      { x: 300, y: 208, width: 92, height: 124 }
    ],
    bumpers: [
      { x: 345, y: 120, radius: 19 },
      { x: 345, y: 420, radius: 19 },
      { x: 530, y: 270, radius: 19 }
    ],
    windmills: [
      { x: 345, y: 270, radius: 86, bladeCount: 4, bladeWidth: 12, speed: 1.9 },
      { x: 530, y: 270, radius: 70, bladeCount: 2, bladeWidth: 18, speed: -2.4 },
      { x: 715, y: 270, radius: 58, bladeCount: 3, bladeWidth: 14, speed: 2.1 }
    ]
  }
];

// mini-golf-windmill/src/Game.js
var BALL_RADIUS = 11;
var STOP_SPEED = 8;
var MAX_DRAG = 170;
var MAX_SHOT_SPEED = 760;
var WALL_BOUNCE = 0.9;
var BUMPER_BOUNCE = 1.04;
var CUP_CAPTURE_SPEED = 150;
var CUP_SOFT_CAPTURE_SPEED = 220;
var CUP_SOFT_CAPTURE_MARGIN = 8;
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
    y: (vy - 2 * dot * ny) * scale
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
  for (let index = 0;index < count; index += 1) {
    total += HOLES[index].par;
  }
  return total;
}

class Game {
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
      sunk: false
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
        currentY: y
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
    const speed = mag / MAX_DRAG * MAX_SHOT_SPEED;
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
    for (let i = 0;i < this.windmillAngles.length; i += 1) {
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
      for (let bladeIndex = 0;bladeIndex < windmill.bladeCount; bladeIndex += 1) {
        const angle = baseAngle + Math.PI * 2 * bladeIndex / windmill.bladeCount;
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
      ball.vx += dx / Math.max(dist, 1) * pull * 90;
      ball.vy += dy / Math.max(dist, 1) * pull * 90;
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
      previewY: this.ball.y + dir.y * 110 * (mag / MAX_DRAG)
    };
  }
  getFrameState() {
    const completedHoleCount = this.mode === "holeComplete" || this.mode === "win" ? this.holeIndex + 1 : this.holeIndex;
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
      messageTimer: this.messageTimer
    };
  }
}

// mini-golf-windmill/src/render.js
function drawRoundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}
function drawWindmill(ctx, windmill, angle) {
  ctx.save();
  ctx.translate(windmill.x, windmill.y);
  ctx.fillStyle = "rgba(255, 248, 228, 0.92)";
  ctx.strokeStyle = "rgba(62, 35, 10, 0.8)";
  ctx.lineWidth = 2;
  for (let i = 0;i < windmill.bladeCount; i += 1) {
    const bladeAngle = angle + Math.PI * 2 * i / windmill.bladeCount;
    ctx.save();
    ctx.rotate(bladeAngle);
    ctx.beginPath();
    ctx.moveTo(-8, -windmill.bladeWidth * 0.5);
    ctx.lineTo(windmill.radius, -windmill.bladeWidth * 0.5);
    ctx.lineTo(windmill.radius + 6, 0);
    ctx.lineTo(windmill.radius, windmill.bladeWidth * 0.5);
    ctx.lineTo(-8, windmill.bladeWidth * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  ctx.fillStyle = "#9b5f2f";
  ctx.beginPath();
  ctx.arc(0, 0, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
function render(ctx, frame) {
  const { bounds, hole, ball, windmillAngles, shotPreview } = frame;
  ctx.clearRect(0, 0, frame.width, frame.height);
  const sky = ctx.createLinearGradient(0, 0, 0, frame.height);
  sky.addColorStop(0, "#d6f6ff");
  sky.addColorStop(1, "#f2fbff");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, frame.width, frame.height);
  ctx.fillStyle = "#bfe8a4";
  drawRoundedRect(ctx, bounds.x, bounds.y, bounds.width, bounds.height, 28);
  ctx.fill();
  ctx.strokeStyle = "#4e7d30";
  ctx.lineWidth = 8;
  ctx.stroke();
  for (const patch of hole.sand) {
    ctx.fillStyle = "#dcc67f";
    drawRoundedRect(ctx, patch.x, patch.y, patch.width, patch.height, 18);
    ctx.fill();
  }
  for (const wall of hole.walls) {
    ctx.fillStyle = "#815833";
    drawRoundedRect(ctx, wall.x, wall.y, wall.width, wall.height, 10);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    drawRoundedRect(ctx, wall.x + 4, wall.y + 4, wall.width - 8, wall.height - 8, 6);
    ctx.fill();
  }
  for (const bumper of hole.bumpers) {
    ctx.fillStyle = "#ef675f";
    ctx.beginPath();
    ctx.arc(bumper.x, bumper.y, bumper.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.beginPath();
    ctx.arc(bumper.x - 4, bumper.y - 5, bumper.radius * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
  hole.windmills.forEach((windmill, index) => drawWindmill(ctx, windmill, windmillAngles[index]));
  ctx.fillStyle = "#1f4f1e";
  ctx.beginPath();
  ctx.arc(hole.cup.x, hole.cup.y, hole.cup.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#102f13";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#f7f7f2";
  ctx.fillRect(hole.cup.x - 2, hole.cup.y - 42, 4, 28);
  ctx.fillStyle = "#ee684a";
  ctx.beginPath();
  ctx.moveTo(hole.cup.x + 2, hole.cup.y - 42);
  ctx.lineTo(hole.cup.x + 36, hole.cup.y - 31);
  ctx.lineTo(hole.cup.x + 2, hole.cup.y - 21);
  ctx.closePath();
  ctx.fill();
  if (shotPreview) {
    const arrowX = shotPreview.previewX;
    const arrowY = shotPreview.previewY;
    const arrowLength = 22 + shotPreview.power * 18;
    const backX = arrowX - shotPreview.aimX * arrowLength;
    const backY = arrowY - shotPreview.aimY * arrowLength;
    const leftX = backX - shotPreview.aimY * 8;
    const leftY = backY + shotPreview.aimX * 8;
    const rightX = backX + shotPreview.aimY * 8;
    const rightY = backY - shotPreview.aimX * 8;
    ctx.strokeStyle = "rgba(31, 79, 30, 0.46)";
    ctx.lineWidth = 4;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.moveTo(ball.x, ball.y);
    ctx.lineTo(backX, backY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(238, 104, 74, 0.92)";
    ctx.beginPath();
    ctx.moveTo(arrowX, arrowY);
    ctx.lineTo(leftX, leftY);
    ctx.lineTo(rightX, rightY);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(238, 104, 74, 0.58)";
    ctx.beginPath();
    ctx.arc(arrowX, arrowY, 6 + 6 * shotPreview.power, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#4a5a61";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "rgba(0,0,0,0.08)";
  ctx.beginPath();
  ctx.arc(ball.x + 3, ball.y + 4, ball.radius * 0.86, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(25, 57, 28, 0.75)";
  ctx.font = "700 22px Arial";
  ctx.fillText(hole.name, bounds.x + 18, bounds.y + 30);
  if (frame.mode === "holeComplete") {
    ctx.fillStyle = "rgba(255,255,255,0.86)";
    drawRoundedRect(ctx, 330, 214, 300, 112, 20);
    ctx.fill();
    ctx.fillStyle = "#1e3a20";
    ctx.font = "700 28px Arial";
    ctx.textAlign = "center";
    ctx.fillText("Hole Cleared", 480, 252);
    ctx.font = "400 18px Arial";
    ctx.fillText(`Hole strokes: ${frame.holeStrokes}  |  Press N or click`, 480, 286);
    ctx.textAlign = "left";
  }
}

// mini-golf-windmill/src/main.js
var canvas = document.getElementById("game");
var ctx = canvas.getContext("2d");
var overlay = document.getElementById("overlay");
var overlayTitle = document.getElementById("overlayTitle");
var overlayBody = document.getElementById("overlayBody");
var overlayButton = document.getElementById("overlayButton");
var holeLabel = document.getElementById("holeLabel");
var parLabel = document.getElementById("parLabel");
var strokesLabel = document.getElementById("strokesLabel");
var scoreLabel = document.getElementById("scoreLabel");
var game = new Game;
function formatScore(value) {
  if (value === 0) {
    return "E";
  }
  return value > 0 ? `+${value}` : `${value}`;
}
function updateHud(frame) {
  holeLabel.textContent = `Hole ${frame.holeIndex + 1} / ${frame.totalHoles}`;
  parLabel.textContent = `Par ${frame.hole.par}`;
  strokesLabel.textContent = `Strokes ${frame.holeStrokes}`;
  scoreLabel.textContent = `Card ${formatScore(frame.cardScoreVsPar)}`;
}
function syncOverlay(frame) {
  if (frame.mode === "menu") {
    overlay.hidden = false;
    overlayTitle.textContent = "Mini Golf Windmill";
    overlayBody.textContent = "Drag from the ball to aim and release. Sand slows the ball. Windmill blades can bank or ruin a shot.";
    overlayButton.textContent = "Start Round";
    return;
  }
  if (frame.mode === "win") {
    overlay.hidden = false;
    overlayTitle.textContent = "Scorecard Cleared";
    overlayBody.textContent = `Finished in ${frame.totalStrokes} strokes against par ${frame.totalPar} (${formatScore(frame.cardScoreVsPar)}). Run it again for a cleaner card.`;
    overlayButton.textContent = "Play Again";
    return;
  }
  overlay.hidden = true;
}
function pointerPosition(event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY
  };
}
overlayButton.addEventListener("click", () => {
  if (game.mode === "menu" || game.mode === "win") {
    game.start();
  }
});
canvas.addEventListener("pointerdown", (event) => {
  const pos = pointerPosition(event);
  game.onPointerDown(pos.x, pos.y);
});
window.addEventListener("pointermove", (event) => {
  const pos = pointerPosition(event);
  game.onPointerMove(pos.x, pos.y);
});
window.addEventListener("pointerup", (event) => {
  const pos = pointerPosition(event);
  game.onPointerUp(pos.x, pos.y);
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (game.mode === "menu" || game.mode === "win")) {
    game.start();
  } else if (event.key.toLowerCase() === "r") {
    if (game.mode === "menu" || game.mode === "win") {
      game.start();
    } else {
      game.restartCourse();
    }
  } else if (event.key.toLowerCase() === "n") {
    game.nextHole();
  }
});
var lastTime = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - lastTime) / 1000);
  lastTime = now;
  game.update(dt);
  const state = game.getFrameState();
  updateHud(state);
  syncOverlay(state);
  render(ctx, state);
  requestAnimationFrame(frame);
}
var initialState = game.getFrameState();
updateHud(initialState);
syncOverlay(initialState);
render(ctx, initialState);
requestAnimationFrame(frame);
