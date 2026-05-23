import { CONFIG } from "./data.js";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function overlaps(a, b) {
  return (
    Math.abs(a.x - b.x) * 2 < a.width + b.width &&
    Math.abs(a.y - b.y) * 2 < a.height + b.height
  );
}

export class Game {
  constructor() {
    this.reset();
  }

  reset() {
    this.mode = "menu";
    this.distance = CONFIG.startDistance;
    this.score = 0;
    this.speed = 280;
    this.health = 3;
    this.combo = 0;
    this.nextGateAt = this.distance - 180;
    this.nextTreeAt = this.distance - 80;
    this.nextRampAt = this.distance - 540;
    this.nextLogAt = this.distance - 320;
    this.gates = [];
    this.trees = [];
    this.ramps = [];
    this.logs = [];
    this.trails = [];
    this.player = {
      x: CONFIG.width * 0.5,
      y: CONFIG.playerY,
      vx: 0,
      jumpTimer: 0,
      flash: 0,
    };
    this.avalanche = {
      distanceBehind: 640,
      surge: 0,
    };
    this.message = "Thread gates, use ramps, and do not let the wall catch you.";
  }

  start() {
    this.reset();
    this.mode = "playing";
  }

  restart() {
    this.start();
  }

  update(dt, input) {
    if (this.mode !== "playing") {
      if (input.startPressed) {
        this.start();
      }
      return;
    }

    if (input.startPressed) {
      this.restart();
      return;
    }

    const steerInput = (input.left ? -1 : 0) + (input.right ? 1 : 0);
    const accelInput = (input.up ? 1 : 0) - (input.down ? 1 : 0);

    this.speed += accelInput * CONFIG.accel * dt;
    this.speed -= CONFIG.drag * dt * (accelInput === 0 ? 1 : 0.35);
    this.speed = clamp(this.speed, CONFIG.minSpeed, CONFIG.maxSpeed);

    this.player.vx += steerInput * CONFIG.steer * dt;
    this.player.vx *= this.player.jumpTimer > 0 ? 0.985 : 0.92;
    this.player.x += this.player.vx * dt;
    this.player.x = clamp(this.player.x, 70, CONFIG.width - 70);
    this.player.jumpTimer = Math.max(0, this.player.jumpTimer - dt);
    this.player.flash = Math.max(0, this.player.flash - dt);

    const scroll = this.speed * dt;
    this.distance = Math.max(0, this.distance - scroll);

    this.spawnAhead();
    this.updateEntities(scroll);
    this.handleGates();
    this.handleCollisions(input);
    this.updateAvalanche(dt);
    this.updateTrails();

    if (this.distance <= 0) {
      this.mode = "win";
      this.message = `Lodge reached with ${this.score} points and combo x${Math.max(1, this.combo)}.`;
    }

    if (this.health <= 0 || this.avalanche.distanceBehind <= 30) {
      this.mode = "lose";
      this.message = this.health <= 0
        ? "Too many wipeouts. Restart and hold a cleaner line."
        : "The avalanche closed the gap. Keep your pace up and stop missing gates.";
    }
  }

  spawnAhead() {
    while (this.nextGateAt > this.distance - 1500) {
      const laneCenter = 180 + Math.random() * (CONFIG.width - 360);
      const width = 110 + Math.random() * 70;
      this.gates.push({
        x: laneCenter,
        y: -100 - Math.random() * 120,
        width,
        passed: false,
      });
      this.nextGateAt -= CONFIG.gateSpacing;
    }

    while (this.nextTreeAt > this.distance - 1200) {
      const isLeft = Math.random() < 0.5;
      this.trees.push({
        x: isLeft ? 70 + Math.random() * 250 : CONFIG.width - 70 - Math.random() * 250,
        y: -60 - Math.random() * 160,
        width: 36,
        height: 42,
        type: Math.random() < 0.28 ? "rock" : "tree",
      });
      this.nextTreeAt -= CONFIG.treeSpacing;
    }

    while (this.nextRampAt > this.distance - 1200) {
      this.ramps.push({
        x: 160 + Math.random() * (CONFIG.width - 320),
        y: -80 - Math.random() * 180,
        width: 68,
        height: 16,
      });
      this.nextRampAt -= CONFIG.rampSpacing;
    }

    while (this.nextLogAt > this.distance - 1200) {
      this.logs.push({
        x: 180 + Math.random() * (CONFIG.width - 360),
        y: -50 - Math.random() * 140,
        width: 120,
        height: 18,
      });
      this.nextLogAt -= CONFIG.logSpacing;
    }
  }

  updateEntities(scroll) {
    for (const list of [this.gates, this.trees, this.ramps, this.logs]) {
      for (const item of list) {
        item.y += scroll;
      }
    }
    this.gates = this.gates.filter((item) => item.y < CONFIG.height + 80);
    this.trees = this.trees.filter((item) => item.y < CONFIG.height + 80);
    this.ramps = this.ramps.filter((item) => item.y < CONFIG.height + 80);
    this.logs = this.logs.filter((item) => item.y < CONFIG.height + 80);
  }

  handleGates() {
    for (const gate of this.gates) {
      if (gate.passed || gate.y < this.player.y + 12) {
        continue;
      }
      gate.passed = true;
      const inside = Math.abs(this.player.x - gate.x) <= gate.width * 0.5 - 10;
      if (inside) {
        this.combo += 1;
        this.score += 100 + this.combo * 20;
        this.avalanche.distanceBehind = Math.min(760, this.avalanche.distanceBehind + 30);
      } else {
        this.combo = 0;
        this.score = Math.max(0, this.score - 40);
        this.avalanche.distanceBehind -= 65;
      }
    }
  }

  handleCollisions(input) {
    const playerBox = {
      x: this.player.x,
      y: this.player.y,
      width: this.player.jumpTimer > 0 ? 30 : 26,
      height: this.player.jumpTimer > 0 ? 24 : 34,
    };

    if (input.jumpPressed && this.player.jumpTimer <= 0.02) {
      const nearRamp = this.ramps.find((ramp) =>
        Math.abs(ramp.x - this.player.x) < ramp.width * 0.5 + 14 &&
        Math.abs(ramp.y - this.player.y) < 30
      );
      if (nearRamp) {
        this.player.jumpTimer = 0.8;
        this.speed = clamp(this.speed + 45, CONFIG.minSpeed, CONFIG.maxSpeed);
        this.score += 60;
      }
    }

    for (const ramp of this.ramps) {
      if (
        this.player.jumpTimer <= 0 &&
        Math.abs(ramp.x - this.player.x) < ramp.width * 0.5 + 8 &&
        Math.abs(ramp.y - this.player.y) < 16
      ) {
        this.player.jumpTimer = 0.8;
        this.speed = clamp(this.speed + 50, CONFIG.minSpeed, CONFIG.maxSpeed);
      }
    }

    for (const hazard of this.trees) {
      if (hazard.hit) {
        continue;
      }
      if (overlaps(playerBox, hazard)) {
        hazard.hit = true;
        this.crash(hazard.type === "rock" ? 2 : 1);
      }
    }

    for (const hazard of this.logs) {
      if (hazard.hit) {
        continue;
      }
      if (this.player.jumpTimer > 0.2) {
        continue;
      }
      if (overlaps(playerBox, hazard)) {
        hazard.hit = true;
        this.crash(1);
      }
    }
  }

  crash(damage) {
    this.health -= damage;
    this.combo = 0;
    this.player.flash = 0.45;
    this.player.vx *= -0.35;
    this.speed = Math.max(CONFIG.minSpeed, this.speed - 70);
    this.avalanche.distanceBehind -= 90;
    this.score = Math.max(0, this.score - 80);
  }

  updateAvalanche(dt) {
    const slowPenalty = (290 - this.speed) * 0.08;
    const chase = 9 + Math.max(0, slowPenalty) + this.avalanche.surge;
    this.avalanche.distanceBehind -= chase * dt;
    this.avalanche.distanceBehind += 21 * dt;
    this.avalanche.distanceBehind = clamp(this.avalanche.distanceBehind, -20, 760);
    this.avalanche.surge = Math.max(0, this.avalanche.surge - 12 * dt);
  }

  updateTrails() {
    this.trails.push({
      x: this.player.x,
      y: this.player.y + 20,
      life: 1,
    });
    for (const trail of this.trails) {
      trail.life -= 0.08;
      trail.y += 5;
    }
    this.trails = this.trails.filter((trail) => trail.life > 0);
  }

  getFrameState() {
    const nextGate = this.gates.find((gate) => gate.y < this.player.y && !gate.passed) || null;
    return {
      mode: this.mode,
      message: this.message,
      score: this.score,
      distance: Math.ceil(this.distance),
      nextGateDistance: nextGate ? Math.max(0, Math.ceil((this.player.y - nextGate.y) * 2)) : 0,
      speed: Math.round(this.speed),
      health: this.health,
      combo: this.combo,
      player: { ...this.player },
      gates: this.gates.map((gate) => ({ ...gate })),
      trees: this.trees.map((tree) => ({ ...tree })),
      ramps: this.ramps.map((ramp) => ({ ...ramp })),
      logs: this.logs.map((log) => ({ ...log })),
      trails: this.trails.map((trail) => ({ ...trail })),
      avalanche: { ...this.avalanche },
    };
  }
}
