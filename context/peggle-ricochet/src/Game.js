import { createBoard } from "./board.js";

const WIDTH = 960;
const HEIGHT = 720;
const CANNON_Y = 66;
const BALL_RADIUS = 9;
const GRAVITY = 680;
const MAX_GUIDE_BOUNCES = 2;
const MAX_GUIDE_POINTS = 90;
const BALL_SPEED = 930;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function magnitude(x, y) {
  return Math.hypot(x, y);
}

function normalize(x, y) {
  const size = magnitude(x, y) || 1;
  return { x: x / size, y: y / size };
}

function reflect(vx, vy, nx, ny) {
  const dot = vx * nx + vy * ny;
  return {
    x: vx - 2 * dot * nx,
    y: vy - 2 * dot * ny,
  };
}

function pointInRect(px, py, rect) {
  return (
    px >= rect.x &&
    px <= rect.x + rect.width &&
    py >= rect.y &&
    py <= rect.y + rect.height
  );
}

function createBall(x, y, vx, vy) {
  return {
    x,
    y,
    vx,
    vy,
    radius: BALL_RADIUS,
    alive: true,
    catchLocked: false,
  };
}

export class Game {
  constructor() {
    this.width = WIDTH;
    this.height = HEIGHT;
    this.pointer = { x: WIDTH / 2, y: 200, active: false };
    this.lastFrameState = null;
    this.reset();
  }

  reset() {
    this.mode = "menu";
    this.score = 0;
    this.shots = 10;
    this.ball = null;
    this.ballTrail = [];
    this.bucketDirection = 1;
    this.bucketSpeed = 240;
    this.bucket = {
      x: 340,
      y: this.height - 34,
      width: 140,
      height: 18,
    };
    this.pegFlash = [];
    this.pegs = createBoard();
    this.orangeRemaining = this.pegs.filter((peg) => peg.kind === "orange").length;
    this.cannonX = this.width / 2;
    this.message = "Aim the bank shot through clustered orange pegs.";
    this.result = null;
    this.guidePoints = this.buildGuide();
    this.syncFrameState();
  }

  start() {
    if (this.mode === "menu" || this.mode === "lose" || this.mode === "win") {
      this.reset();
      this.mode = "playing";
      this.message = "Clear every orange peg before shots run dry.";
      this.syncFrameState();
    }
  }

  setPointer(x, y) {
    this.pointer.x = clamp(x, 48, this.width - 48);
    this.pointer.y = clamp(y, 40, this.height - 80);
    this.pointer.active = true;
    this.guidePoints = this.buildGuide();
    this.syncFrameState();
  }

  fire() {
    if (this.mode === "menu") {
      this.start();
    }
    if (this.mode !== "playing" || this.ball || this.shots <= 0) {
      return;
    }
    const aim = this.getAimVector();
    this.ball = createBall(this.cannonX, CANNON_Y, aim.x * BALL_SPEED, aim.y * BALL_SPEED);
    this.ballTrail.length = 0;
    this.shots -= 1;
    this.message = "Catch the falling ball to earn the shot back.";
    this.syncFrameState();
  }

  getAimVector() {
    const raw = normalize(this.pointer.x - this.cannonX, this.pointer.y - CANNON_Y);
    return raw.y > -0.12 ? normalize(raw.x, -0.12) : raw;
  }

  buildGuide() {
    const points = [];
    let { x, y } = { x: this.cannonX, y: CANNON_Y };
    let { x: vx, y: vy } = this.getAimVector();
    let bounces = 0;
    for (let i = 0; i < MAX_GUIDE_POINTS; i += 1) {
      x += vx * 10;
      y += vy * 10;
      if (x <= 14 || x >= this.width - 14) {
        vx *= -1;
        bounces += 1;
      }
      if (y <= 14) {
        vy *= -1;
        bounces += 1;
      }
      points.push({ x: clamp(x, 14, this.width - 14), y: clamp(y, 14, this.height - 14) });
      if (bounces >= MAX_GUIDE_BOUNCES || y > this.height - 120) {
        break;
      }
    }
    return points;
  }

  update(dt) {
    for (const peg of this.pegs) {
      peg.pulse += dt * (peg.kind === "orange" ? 6 : 3.8);
    }

    if (this.mode !== "playing") {
      this.syncFrameState();
      return;
    }

    this.updateBucket(dt);
    this.updatePegFlash(dt);

    if (this.ball) {
      this.updateBall(dt);
    } else if (this.shots <= 0 && this.orangeRemaining > 0) {
      this.mode = "lose";
      this.result = {
        title: "Out of shots",
        copy: "The board still has orange pegs alive. Press Enter or R for an instant retry.",
      };
    }

    if (this.orangeRemaining <= 0) {
      this.mode = "win";
      this.result = {
        title: "Board cleared",
        copy: "Every orange peg is gone. Bank another run any time with Enter.",
      };
    }

    this.syncFrameState();
  }

  updateBucket(dt) {
    this.bucket.x += this.bucketDirection * this.bucketSpeed * dt;
    if (this.bucket.x <= 80) {
      this.bucket.x = 80;
      this.bucketDirection = 1;
    } else if (this.bucket.x + this.bucket.width >= this.width - 80) {
      this.bucket.x = this.width - 80 - this.bucket.width;
      this.bucketDirection = -1;
    }
  }

  updatePegFlash(dt) {
    this.pegFlash = this.pegFlash.filter((flash) => {
      flash.life -= dt;
      return flash.life > 0;
    });
  }

  updateBall(dt) {
    const ball = this.ball;
    ball.vy += GRAVITY * dt;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    this.ballTrail.push({ x: ball.x, y: ball.y, life: 0.45 });
    this.ballTrail = this.ballTrail
      .map((point) => ({ ...point, life: point.life - dt }))
      .filter((point) => point.life > 0);

    if (ball.x <= ball.radius) {
      ball.x = ball.radius;
      ball.vx = Math.abs(ball.vx);
    } else if (ball.x >= this.width - ball.radius) {
      ball.x = this.width - ball.radius;
      ball.vx = -Math.abs(ball.vx);
    }

    if (ball.y <= ball.radius) {
      ball.y = ball.radius;
      ball.vy = Math.abs(ball.vy);
    }

    for (const peg of this.pegs) {
      if (!peg.alive) {
        continue;
      }
      const dx = ball.x - peg.x;
      const dy = ball.y - peg.y;
      const distance = magnitude(dx, dy);
      const minimum = ball.radius + peg.radius;
      if (distance < minimum) {
        const normal = normalize(dx || 0.001, dy || -1);
        const bounced = reflect(ball.vx, ball.vy, normal.x, normal.y);
        ball.vx = bounced.x * 0.99;
        ball.vy = bounced.y * 0.99;
        ball.x = peg.x + normal.x * (minimum + 0.2);
        ball.y = peg.y + normal.y * (minimum + 0.2);
        this.hitPeg(peg);
      }
    }

    const bucketCatch = {
      x: this.bucket.x,
      y: this.bucket.y - 10,
      width: this.bucket.width,
      height: this.bucket.height + 14,
    };
    if (!ball.catchLocked && pointInRect(ball.x, ball.y, bucketCatch) && ball.vy > 0) {
      ball.catchLocked = true;
      this.shots += 1;
      this.score += 250;
      this.message = "Bucket catch. Extra shot recovered.";
    }

    if (pointInRect(ball.x, ball.y, this.bucket) && ball.vy > 0) {
      ball.y = this.bucket.y - ball.radius;
      ball.vy = -Math.abs(ball.vy) * 0.95;
      const offset = (ball.x - (this.bucket.x + this.bucket.width / 2)) / (this.bucket.width / 2);
      ball.vx += offset * 180;
    }

    if (ball.y - ball.radius > this.height + 24) {
      this.ball = null;
      if (this.orangeRemaining > 0 && this.shots > 0) {
        this.message = "Reset and fire again immediately.";
      }
    }
  }

  hitPeg(peg) {
    if (!peg.alive) {
      return;
    }
    peg.alive = false;
    this.pegFlash.push({
      x: peg.x,
      y: peg.y,
      kind: peg.kind,
      life: 0.4,
    });
    if (peg.kind === "orange") {
      this.orangeRemaining -= 1;
      this.score += 300;
      this.message = `${this.orangeRemaining} orange pegs left.`;
    } else {
      this.score += 100;
    }
  }

  syncFrameState() {
    this.lastFrameState = {
      width: this.width,
      height: this.height,
      mode: this.mode,
      score: this.score,
      shots: this.shots,
      orangeRemaining: this.orangeRemaining,
      message: this.mode === "playing" ? this.message : this.result?.copy ?? this.message,
      pegs: this.pegs.map((peg) => ({ ...peg })),
      pegFlash: this.pegFlash.map((flash) => ({ ...flash })),
      ball: this.ball ? { ...this.ball } : null,
      ballTrail: this.ballTrail.map((point) => ({ ...point })),
      bucket: { ...this.bucket },
      guidePoints: this.ball ? [] : this.guidePoints.map((point) => ({ ...point })),
      cannon: {
        x: this.cannonX,
        y: CANNON_Y,
        aim: this.getAimVector(),
      },
      overlay:
        this.mode === "menu"
          ? {
              visible: true,
              kicker: "Peggle Ricochet",
              title: "Bank the shot. Clear the orange pegs.",
              copy: "Click or press Space to fire. Catching the ball in the bucket refunds the shot.",
              action: "Start Run",
            }
          : this.mode === "win"
            ? {
                visible: true,
                kicker: "Board Cleared",
                title: "Every orange peg is gone.",
                copy: "Press Enter to run it back instantly.",
                action: "Play Again",
              }
            : this.mode === "lose"
              ? {
                  visible: true,
                  kicker: "Shots Spent",
                  title: "Orange pegs still survived.",
                  copy: "Press Enter or R to reset with no downtime.",
                  action: "Retry",
                }
              : { visible: false },
    };
  }

  getFrameState() {
    return this.lastFrameState;
  }
}
