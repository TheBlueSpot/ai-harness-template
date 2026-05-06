import {
  BUMPERS,
  FLIPPERS,
  GRAVITY,
  LAUNCH_LANE,
  LOCKS,
  MAX_BALLS,
  REACTOR_RAMPS,
  SLINGS,
  TABLE_HEIGHT,
  TABLE_WIDTH,
  TARGETS,
  WALLS,
} from "./table.js";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function distanceSq(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function closestPointOnSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;
  if (!lengthSq) {
    return { x: x1, y: y1, t: 0 };
  }
  const t = clamp(((px - x1) * dx + (py - y1) * dy) / lengthSq, 0, 1);
  return { x: x1 + dx * t, y: y1 + dy * t, t };
}

function reflect(ball, nx, ny, bounce) {
  const speed = ball.vx * nx + ball.vy * ny;
  if (speed >= 0) {
    return;
  }
  ball.vx -= (1 + bounce) * speed * nx;
  ball.vy -= (1 + bounce) * speed * ny;
}

function spawnBall(x = 640, y = 766, vx = 0, vy = 0) {
  return {
    x,
    y,
    vx,
    vy,
    radius: 12,
    launched: false,
    launchLock: 0.16,
    lockCooldown: 0.8,
  };
}

function makeState() {
  return {
    mode: "menu",
    score: 0,
    ballsRemaining: MAX_BALLS,
    combo: 1,
    comboTimer: 0,
    reactorCharge: 0,
    reactorReady: false,
    lockedBalls: 0,
    multiball: false,
    multiballTimer: 0,
    flippers: {
      left: FLIPPERS.left.restAngle,
      right: FLIPPERS.right.restAngle,
    },
    targetsLit: {
      L: false,
      C: false,
      R: false,
    },
    balls: [],
    floaters: [],
    flash: null,
    message: "Start Run",
    messageTimer: 2,
  };
}

export class Game {
  constructor() {
    this.state = makeState();
    this.input = {
      launchPressed: false,
      nudgePressed: false,
    };
    this.serveBall();
  }

  serveBall() {
    if (this.state.ballsRemaining <= 0 && this.state.mode !== "playing") {
      return;
    }
    this.state.balls = [spawnBall()];
  }

  start() {
    this.state = makeState();
    this.state.mode = "playing";
    this.serveBall();
    this.pushMessage("Reactor online");
  }

  restart() {
    this.start();
  }

  update(dt, input) {
    const step = Math.min(dt, 1 / 30);
    this.handleInput(step, input);
    this.updateFloaters(step);
    this.updateMessage(step);

    if (this.state.mode !== "playing") {
      return;
    }

    this.updateCombo(step);
    this.updateBalls(step, input);
    this.handleDrain();

    if (!this.state.balls.length && this.state.ballsRemaining > 0) {
      this.serveBall();
      this.pushMessage("Next ball ready");
    }
  }

  handleInput(dt, input) {
    const leftActive = input.left;
    const rightActive = input.right;
    const flipperSpeed = 14;
    const leftTarget = leftActive ? FLIPPERS.left.activeAngle : FLIPPERS.left.restAngle;
    const rightTarget = rightActive ? FLIPPERS.right.activeAngle : FLIPPERS.right.restAngle;

    this.state.flippers.left += (leftTarget - this.state.flippers.left) * Math.min(1, dt * flipperSpeed);
    this.state.flippers.right += (rightTarget - this.state.flippers.right) * Math.min(1, dt * flipperSpeed);

    if (input.nudge && !this.input.nudgePressed) {
      this.state.balls.forEach((ball) => {
        if (ball.y > 620) {
          ball.vx += input.left ? -90 : input.right ? 90 : 0;
          ball.vy -= 180;
        }
      });
    }

    if (input.launch && !this.input.launchPressed) {
      this.launchBall();
    }
    this.input.launchPressed = input.launch;
    this.input.nudgePressed = input.nudge;
  }

  launchBall() {
    if (this.state.mode === "menu") {
      this.start();
      return;
    }
    if (this.state.mode === "gameover" || this.state.mode === "win") {
      this.restart();
      return;
    }
    const ball = this.state.balls.find((candidate) => !candidate.launched);
    if (!ball) {
      return;
    }
    ball.launched = true;
    ball.vy = -1620;
    ball.vx = -80;
    this.pushMessage("Launch!");
  }

  updateFloaters(dt) {
    this.state.floaters = this.state.floaters.filter((floater) => {
      floater.life -= dt;
      floater.y -= 34 * dt;
      return floater.life > 0;
    });
  }

  updateMessage(dt) {
    if (this.state.messageTimer > 0) {
      this.state.messageTimer -= dt;
      if (this.state.messageTimer <= 0) {
        this.state.message = "";
      }
    }
  }

  updateCombo(dt) {
    if (this.state.comboTimer > 0) {
      this.state.comboTimer -= dt;
      if (this.state.comboTimer <= 0) {
        this.state.combo = 1;
      }
    }
  }

  updateBalls(dt, input) {
    for (const ball of this.state.balls) {
      if (!ball.launched) {
        ball.x = 640;
        ball.y = 766;
        continue;
      }

      ball.launchLock = Math.max(0, ball.launchLock - dt);
      ball.lockCooldown = Math.max(0, ball.lockCooldown - dt);
      ball.vy += GRAVITY * dt;
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      ball.vx *= 0.999;
      ball.vy *= 0.999;

      this.collideWalls(ball);
      this.collideBumpers(ball);
      this.collideTargets(ball);
      this.collideRamps(ball);
      this.collideLocks(ball);
      this.collideSlings(ball);
      this.collideFlipper(ball, "left", input.left);
      this.collideFlipper(ball, "right", input.right);
    }
  }

  collideWalls(ball) {
    for (const wall of WALLS) {
      const point = closestPointOnSegment(ball.x, ball.y, wall.x1, wall.y1, wall.x2, wall.y2);
      const dx = ball.x - point.x;
      const dy = ball.y - point.y;
      const distSq = dx * dx + dy * dy;
      if (distSq >= ball.radius * ball.radius || distSq === 0) {
        continue;
      }
      const dist = Math.sqrt(distSq);
      const nx = dx / dist;
      const ny = dy / dist;
      ball.x = point.x + nx * (ball.radius + 0.1);
      ball.y = point.y + ny * (ball.radius + 0.1);
      reflect(ball, nx, ny, 0.88);
    }

    if (ball.x < 44 + ball.radius) {
      ball.x = 44 + ball.radius;
      ball.vx = Math.abs(ball.vx) * 0.92;
    }
    if (ball.x > TABLE_WIDTH - 44 - ball.radius) {
      ball.x = TABLE_WIDTH - 44 - ball.radius;
      ball.vx = -Math.abs(ball.vx) * 0.92;
    }
    if (ball.y < 40 + ball.radius) {
      ball.y = 40 + ball.radius;
      ball.vy = Math.abs(ball.vy) * 0.9;
    }
  }

  collideBumpers(ball) {
    for (const bumper of BUMPERS) {
      const hitSq = distanceSq(ball.x, ball.y, bumper.x, bumper.y);
      const totalRadius = ball.radius + bumper.radius;
      if (hitSq >= totalRadius * totalRadius) {
        continue;
      }
      const distance = Math.sqrt(hitSq) || 0.001;
      const nx = (ball.x - bumper.x) / distance;
      const ny = (ball.y - bumper.y) / distance;
      ball.x = bumper.x + nx * (totalRadius + 0.2);
      ball.y = bumper.y + ny * (totalRadius + 0.2);
      const launch = 1.28 + this.state.combo * 0.06;
      reflect(ball, nx, ny, launch);
      ball.vx += nx * 70;
      ball.vy += ny * 70;
      this.score(bumper.score, bumper.x, bumper.y, `bumper-${bumper.x}`, "#fff1a6");
    }
  }

  collideTargets(ball) {
    for (const target of TARGETS) {
      const withinX = ball.x + ball.radius > target.x && ball.x - ball.radius < target.x + target.w;
      const withinY = ball.y + ball.radius > target.y && ball.y - ball.radius < target.y + target.h;
      if (!withinX || !withinY) {
        continue;
      }
      const fromLeft = Math.abs(ball.x - target.x) < Math.abs(ball.x - (target.x + target.w));
      ball.vx = Math.abs(ball.vx) * (fromLeft ? -1 : 1);
      this.state.targetsLit[target.key] = true;
      this.score(target.score, target.x + target.w / 2, target.y, `target-${target.key}`, "#ffb2cb");
      if (this.state.targetsLit.L && this.state.targetsLit.C && this.state.targetsLit.R) {
        this.state.targetsLit = { L: false, C: false, R: false };
        this.state.reactorCharge = clamp(this.state.reactorCharge + 1, 0, 3);
        this.state.reactorReady = this.state.reactorCharge >= 3;
        this.pushMessage(this.state.reactorReady ? "Reactor ready" : "Reactor charging");
      }
    }
  }

  collideRamps(ball) {
    for (const ramp of REACTOR_RAMPS) {
      const inside = ball.x > ramp.x && ball.x < ramp.x + ramp.w && ball.y > ramp.y && ball.y < ramp.y + ramp.h;
      if (!inside || ball.vy >= -120) {
        continue;
      }
      ball.vx = ramp.exitVX;
      ball.vy = ramp.exitVY;
      this.score(ramp.score, ramp.x + ramp.w / 2, ramp.y + 20, ramp.id, "#8ffcff");
      if (this.state.reactorReady) {
        this.triggerReactor();
      } else {
        this.state.reactorCharge = clamp(this.state.reactorCharge + 1, 0, 3);
        this.state.reactorReady = this.state.reactorCharge >= 3;
      }
    }
  }

  collideLocks(ball) {
    if (ball.lockCooldown > 0 || this.state.multiball) {
      return;
    }
    for (const lock of LOCKS) {
      const hitSq = distanceSq(ball.x, ball.y, lock.x, lock.y);
      const totalRadius = ball.radius + lock.radius;
      if (hitSq >= totalRadius * totalRadius) {
        continue;
      }
      this.score(lock.score, lock.x, lock.y - 12, `lock-${lock.x}`, "#ffe08a");
      this.state.lockedBalls += 1;
      ball.lockCooldown = 1.2;
      if (this.state.lockedBalls >= 2) {
        this.startMultiball();
        this.state.lockedBalls = 0;
      } else {
        ball.x = 640;
        ball.y = 766;
        ball.vx = 0;
        ball.vy = 0;
        ball.launched = false;
        this.pushMessage("Ball locked");
      }
      return;
    }
  }

  collideSlings(ball) {
    const slingCenters = [
      { x: 208, y: 820, forceX: -220 },
      { x: 512, y: 820, forceX: 220 },
    ];
    slingCenters.forEach((sling, index) => {
      if (distanceSq(ball.x, ball.y, sling.x, sling.y) < 58 * 58) {
        ball.vy = -Math.abs(ball.vy) - 260;
        ball.vx += index === 0 ? -180 : 180;
        this.score(80, sling.x, sling.y, `sling-${index}`, "#ffcfaa");
      }
    });
  }

  collideFlipper(ball, side, active) {
    const flipper = FLIPPERS[side];
    const angle = this.state.flippers[side];
    const tipX = flipper.pivot.x + Math.cos(angle) * flipper.length;
    const tipY = flipper.pivot.y + Math.sin(angle) * flipper.length;
    const point = closestPointOnSegment(ball.x, ball.y, flipper.pivot.x, flipper.pivot.y, tipX, tipY);
    const dx = ball.x - point.x;
    const dy = ball.y - point.y;
    const distSq = dx * dx + dy * dy;
    const radius = ball.radius + 13;
    if (distSq >= radius * radius || point.t < 0.04 || point.t > 0.98) {
      return;
    }
    const dist = Math.sqrt(distSq) || 0.001;
    const nx = dx / dist;
    const ny = dy / dist;
    ball.x = point.x + nx * (radius + 0.1);
    ball.y = point.y + ny * (radius + 0.1);
    reflect(ball, nx, ny, active ? 1.16 : 0.88);
    if (active) {
      const lift = side === "left" ? -380 : 380;
      ball.vx += lift * (1 - point.t * 0.55);
      ball.vy -= 540 * (0.75 + point.t * 0.35);
      this.state.comboTimer = 3.4;
    } else {
      ball.vy -= 60;
    }
  }

  triggerReactor() {
    this.state.reactorCharge = 0;
    this.state.reactorReady = false;
    const extra = this.state.multiball ? 2000 : 1200;
    this.score(extra, 360, 520, "reactor", "#94ffda");
    this.pushMessage(this.state.multiball ? "Reactor surge!" : "Reactor burst!");
    this.state.balls.forEach((ball, index) => {
      ball.vx += index % 2 === 0 ? -120 : 120;
      ball.vy -= 320;
    });
  }

  startMultiball() {
    const anchor = this.state.balls[0] || spawnBall(360, 680, 0, -900);
    this.state.multiball = true;
    this.state.multiballTimer = 18;
    this.state.balls = [
      anchor,
      spawnBall(anchor.x - 24, anchor.y - 22, -220, -980),
      spawnBall(anchor.x + 24, anchor.y - 22, 220, -980),
    ];
    this.state.balls.forEach((ball) => {
      ball.launched = true;
    });
    this.pushMessage("Multiball online");
  }

  handleDrain() {
    const before = this.state.balls.length;
    this.state.balls = this.state.balls.filter((ball) => ball.y - ball.radius <= TABLE_HEIGHT + 30);
    const drained = before - this.state.balls.length;
    if (drained <= 0) {
      return;
    }
    if (this.state.multiball && this.state.balls.length > 0) {
      this.pushMessage("Keep one alive");
      return;
    }

    this.state.ballsRemaining -= 1;
    this.state.multiball = false;
    this.state.lockedBalls = 0;
    if (this.state.ballsRemaining <= 0) {
      this.state.mode = "gameover";
      this.state.message = "";
      return;
    }
  }

  score(base, x, y, flashId, color) {
    const value = Math.round(base * this.state.combo);
    this.state.score += value;
    this.state.combo = Math.min(6, this.state.combo + 0.1);
    this.state.comboTimer = 3.2;
    this.state.floaters.push({
      text: `+${value}`,
      x,
      y,
      life: 0.9,
      maxLife: 0.9,
      color,
    });
    this.state.flash = { id: flashId, timer: 0.12 };
    if (this.state.score >= 15000) {
      this.state.mode = "win";
    }
  }

  pushMessage(text) {
    this.state.message = text;
    this.state.messageTimer = 1.8;
  }

  getFrameState() {
    if (this.state.flash) {
      this.state.flash.timer -= 1 / 60;
      if (this.state.flash.timer <= 0) {
        this.state.flash = null;
      }
    }
    if (this.state.multiball) {
      this.state.multiballTimer -= 1 / 60;
      if (this.state.multiballTimer <= 0 || this.state.balls.length <= 1) {
        this.state.multiball = false;
      }
    }

    return {
      mode: this.state.mode,
      score: this.state.score,
      ballsRemaining: this.state.ballsRemaining,
      combo: this.state.combo,
      reactorCharge: this.state.reactorCharge,
      reactorReady: this.state.reactorReady,
      lockedBalls: this.state.lockedBalls,
      multiball: this.state.multiball,
      flippers: { ...this.state.flippers },
      targetsLit: { ...this.state.targetsLit },
      balls: this.state.balls.map((ball) => ({ ...ball })),
      floaters: this.state.floaters.map((floater) => ({ ...floater })),
      flash: this.state.flash ? { ...this.state.flash } : null,
      message: this.state.message,
    };
  }
}
