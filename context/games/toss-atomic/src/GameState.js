const TAU = Math.PI * 2;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (start, end, amount) => start + (end - start) * amount;
const length = (x, y) => Math.hypot(x, y);
const random = (min, max) => min + Math.random() * (max - min);

export class GameState {
  constructor() {
    this.reset();
  }

  reset() {
    this.mode = "title";
    this.message = "Launch the capsule into the reactor ring.";
    this.score = 0;
    this.lives = 3;
    this.round = 1;
    this.roundGoal = 5;
    this.best = 0;
    this.time = 0;
    this.shake = 0;
    this.bounds = { width: 1600, height: 900 };
    this.pointer = {
      x: 800,
      y: 540,
      down: false,
      active: false,
    };
    this.launcher = { x: 800, y: 790 };
    this.projectile = {
      active: false,
      x: this.launcher.x,
      y: this.launcher.y,
      vx: 0,
      vy: 0,
      radius: 15,
      age: 0,
      trailAge: 0,
    };
    this.target = {
      x: 800,
      y: 170,
      baseX: 800,
      baseY: 170,
      radius: 72,
      phase: 0,
      speed: 0.7,
      drift: 190,
    };
    this.gravity = 1180;
  }

  start(bounds) {
    this.reset();
    if (bounds) {
      this.setBounds(bounds.width, bounds.height);
    }
    this.mode = "playing";
    this.message = "Aim, release, and keep the reactor stable.";
  }

  setBounds(width, height) {
    this.bounds.width = width;
    this.bounds.height = height;
    this.launcher.x = width * 0.5;
    this.launcher.y = height * 0.88;
    this.target.baseX = width * 0.5;
    this.target.baseY = height * 0.18;
    this.target.x = this.target.baseX;
    this.target.y = this.target.baseY;
    if (!this.projectile.active) {
      this.projectile.x = this.launcher.x;
      this.projectile.y = this.launcher.y;
    }
  }

  pause() {
    if (this.mode === "playing") {
      this.mode = "paused";
      this.message = "Paused. Press P or click resume.";
    }
  }

  resume() {
    if (this.mode === "paused") {
      this.mode = "playing";
      this.message = "Back online. Toss the next capsule.";
    }
  }

  finish(mode, message) {
    this.mode = mode;
    this.message = message;
    this.best = Math.max(this.best, this.score);
  }

  win() {
    this.finish("victory", "Reactor stable. Press restart to run again.");
  }

  lose() {
    this.finish("gameover", "Containment failed. Press restart to try again.");
  }

  nextRound() {
    this.round += 1;
    this.target.phase += 0.6;
    this.target.radius = clamp(72 - this.round * 3, 40, 72);
    this.target.drift = clamp(this.target.drift + 10, 170, 260);
    this.projectile.active = false;
    this.projectile.x = this.launcher.x;
    this.projectile.y = this.launcher.y;
    this.projectile.vx = 0;
    this.projectile.vy = 0;
    this.projectile.age = 0;
    this.projectile.trailAge = 0;
    this.message = "New capsule armed. Keep the streak going.";
  }

  addScore(amount = 1) {
    this.score += amount;
    this.shake = Math.max(this.shake, 0.18);
  }

  loseLife() {
    this.lives -= 1;
    this.shake = Math.max(this.shake, 0.28);
  }

  setPointer(x, y, active = true) {
    this.pointer.x = x;
    this.pointer.y = y;
    this.pointer.active = active;
  }

  canLaunch() {
    return this.mode === "playing" && !this.projectile.active;
  }
}

class ParticleField {
  constructor() {
    this.items = [];
  }

  clear() {
    this.items.length = 0;
  }

  update(dt) {
    for (let index = this.items.length - 1; index >= 0; index -= 1) {
      const particle = this.items[index];
      particle.life -= dt;
      if (particle.life <= 0) {
        this.items.splice(index, 1);
        continue;
      }
      particle.vx *= Math.pow(particle.drag, dt * 60);
      particle.vy *= Math.pow(particle.drag, dt * 60);
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.spin += particle.spinVelocity * dt;
      particle.size += particle.growth * dt;
      particle.alpha = clamp(particle.life / particle.maxLife, 0, 1);
    }
  }

  draw(ctx) {
    for (const particle of this.items) {
      ctx.save();
      ctx.translate(particle.x, particle.y);
      ctx.rotate(particle.spin);
      ctx.globalAlpha = particle.alpha;
      ctx.fillStyle = particle.color;
      if (particle.kind === "spark") {
        ctx.fillRect(-particle.length * 0.5, -particle.size * 0.22, particle.length, particle.size * 0.44);
        ctx.fillRect(-particle.size * 0.22, -particle.length * 0.5, particle.size * 0.44, particle.length);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, particle.size, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
  }
}

export class TrailParticles extends ParticleField {
  emitTrail(x, y, vx, vy) {
    const speed = length(vx, vy);
    const count = speed > 300 ? 2 : 1;
    for (let index = 0; index < count; index += 1) {
      this.items.push({
        kind: "glow",
        x: x + random(-3, 3),
        y: y + random(-3, 3),
        vx: -vx * random(0.02, 0.06) + random(-20, 20),
        vy: -vy * random(0.02, 0.06) + random(-20, 20),
        life: random(0.16, 0.32),
        maxLife: 0.32,
        size: random(1.5, 3.4),
        growth: random(0.4, 1.0),
        drag: 0.9,
        spin: random(0, TAU),
        spinVelocity: random(-1.2, 1.2),
        alpha: 1,
        color: index === 0 ? "#62e8c4" : "#ffb347",
      });
    }
  }
}

export class ImpactParticles extends ParticleField {
  emitBurst(x, y, color = "#ffb347", intensity = 1) {
    const count = Math.round(14 + intensity * 8);
    for (let index = 0; index < count; index += 1) {
      const angle = random(0, TAU);
      const speed = random(70, 420) * intensity;
      this.items.push({
        kind: index % 3 === 0 ? "spark" : "glow",
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: random(0.34, 0.72),
        maxLife: 0.72,
        size: random(2.2, 5.6) * intensity,
        length: random(7, 22) * intensity,
        growth: random(-2.2, 0.8),
        drag: 0.86,
        spin: random(0, TAU),
        spinVelocity: random(-7, 7),
        alpha: 1,
        color,
      });
    }
  }
}

export class LaunchDynamics {
  constructor(gameState, trails) {
    this.game = gameState;
    this.trails = trails;
  }

  launchToward(pointer) {
    if (!this.game.canLaunch()) {
      return false;
    }
    const origin = this.game.launcher;
    const dx = pointer.x - origin.x;
    const dy = pointer.y - origin.y;
    const distance = Math.max(length(dx, dy), 1);
    const aimX = dx / distance;
    const aimY = dy / distance;
    const power = clamp(distance / 560, 0.36, 1);
    const speed = lerp(760, 1160, power);

    this.game.projectile.active = true;
    this.game.projectile.x = origin.x;
    this.game.projectile.y = origin.y;
    this.game.projectile.vx = aimX * speed;
    this.game.projectile.vy = aimY * speed - 160;
    this.game.projectile.radius = 15;
    this.game.projectile.age = 0;
    this.game.projectile.trailAge = 0;
    this.game.message = "Capsule in flight.";
    return true;
  }

  update(dt) {
    const projectile = this.game.projectile;
    if (!projectile.active) {
      return;
    }
    projectile.age += dt;
    projectile.trailAge += dt;
    projectile.vy += this.game.gravity * dt;
    projectile.vx *= Math.pow(0.998, dt * 60);
    projectile.x += projectile.vx * dt;
    projectile.y += projectile.vy * dt;
    if (this.trails) {
      this.trails.emitTrail(projectile.x, projectile.y, projectile.vx, projectile.vy);
    }
  }

  resetProjectile() {
    const projectile = this.game.projectile;
    projectile.active = false;
    projectile.x = this.game.launcher.x;
    projectile.y = this.game.launcher.y;
    projectile.vx = 0;
    projectile.vy = 0;
    projectile.age = 0;
    projectile.trailAge = 0;
  }
}

export class CollisionManager {
  constructor(gameState, impacts) {
    this.game = gameState;
    this.impacts = impacts;
    this.time = 0;
  }

  resetRound() {
    this.time = 0;
    this.game.target.phase = this.game.round * 0.75;
    this.game.target.radius = clamp(72 - this.game.round * 3, 40, 72);
    this.game.target.drift = clamp(180 + this.game.round * 6, 180, 260);
  }

  update(dt) {
    const { target, bounds } = this.game;
    this.time += dt;
    target.x = target.baseX + Math.sin(this.time * target.speed + target.phase) * target.drift;
    target.y = target.baseY + Math.cos(this.time * 0.55 + target.phase * 0.5) * 22;
    target.x = clamp(target.x, 120, bounds.width - 120);
    target.y = clamp(target.y, 110, bounds.height * 0.42);

    const projectile = this.game.projectile;
    if (!projectile.active) {
      return null;
    }

    const dx = projectile.x - target.x;
    const dy = projectile.y - target.y;
    const hitRadius = projectile.radius + target.radius;
    if (dx * dx + dy * dy <= hitRadius * hitRadius) {
      if (this.impacts) {
        this.impacts.emitBurst(projectile.x, projectile.y, "#62e8c4", 1.2);
        this.impacts.emitBurst(target.x, target.y, "#ffb347", 0.9);
      }
      projectile.active = false;
      this.game.addScore(1);
      if (this.game.score >= this.game.roundGoal) {
        this.game.win();
      } else {
        this.game.message = "Direct hit. The reactor wants another charge.";
        this.game.nextRound();
      }
      return { type: "hit" };
    }

    const offScreen =
      projectile.x < -80 ||
      projectile.x > bounds.width + 80 ||
      projectile.y < -80 ||
      projectile.y > bounds.height + 120;

    if (offScreen) {
      if (this.impacts) {
        this.impacts.emitBurst(projectile.x, clamp(projectile.y, 0, bounds.height), "#ff6f7a", 0.8);
      }
      projectile.active = false;
      this.game.loseLife();
      if (this.game.lives <= 0) {
        this.game.lose();
      } else {
        this.game.message = "Missed. Re-arm and try the next toss.";
        this.game.projectile.x = this.game.launcher.x;
        this.game.projectile.y = this.game.launcher.y;
        this.game.projectile.vx = 0;
        this.game.projectile.vy = 0;
        this.game.projectile.age = 0;
        this.game.projectile.trailAge = 0;
      }
      return { type: "miss" };
    }

    return null;
  }
}

export class UIController {
  constructor(nodes = {}) {
    this.nodes = nodes;
  }

  sync(state) {
    const modeLabel = this.nodes.modeLabel;
    const scoreLabel = this.nodes.scoreLabel;
    const livesLabel = this.nodes.livesLabel;
    const roundLabel = this.nodes.roundLabel;
    const statusCopy = this.nodes.statusCopy;
    const hintCopy = this.nodes.hintCopy;
    const root = this.nodes.root;

    if (root) {
      root.dataset.state = state.mode;
    }
    if (modeLabel) {
      modeLabel.textContent = state.mode;
    }
    if (scoreLabel) {
      scoreLabel.textContent = `${state.score}`;
    }
    if (livesLabel) {
      livesLabel.textContent = `${state.lives}`;
    }
    if (roundLabel) {
      roundLabel.textContent = `${state.round}`;
    }
    if (statusCopy) {
      statusCopy.textContent = state.message;
    }
    if (hintCopy) {
      hintCopy.textContent =
        state.mode === "playing"
          ? "Move the pointer to aim. Click to toss. P pauses the run."
          : state.mode === "paused"
            ? "Paused. Resume with P, Space, or the resume button."
            : state.mode === "victory"
              ? "Victory path clear. Restart to launch again."
              : state.mode === "gameover"
                ? "Containment failed. Restart for a new attempt."
                : "Click start or press Space to begin.";
    }
  }
}
