import { Paratrooper } from "./actors/Paratrooper.js";

function randomChoice(items) {
  return items[(Math.random() * items.length) | 0];
}

export class WaveDirector {
  constructor(world, emit) {
    this.world = world;
    this.emit = emit;
    this.reset();
  }

  reset() {
    this.wave = 0;
    this.score = 0;
    this.spawnBudget = 0;
    this.waveTimer = 0.8;
    this.waveGap = 1.2;
    this.wavePressure = 0;
  }

  startNextWave() {
    this.wave += 1;
    this.spawnBudget = 5 + this.wave * 3;
    this.waveTimer = 0.3;
    this.waveGap = Math.max(0.28, 0.7 - this.wave * 0.03);
    this.wavePressure = 0;
    this.emit("wave-started", { wave: this.wave, total: this.spawnBudget });
  }

  recordKill(enemy) {
    this.score += 85 + this.wave * 12;
    this.wavePressure = Math.min(1, this.wavePressure + 0.08);
    this.emit("score", { delta: 85 + this.wave * 12, total: this.score, enemy });
  }

  makeSpawnPlan(player) {
    const side = randomChoice(["left", "right", "top"]);
    if (side === "left") {
      return {
        x: -30,
        y: 120 + Math.random() * (this.world.height - 240),
        targetX: player.x + 180 + Math.random() * 140,
        targetY: player.y,
        vx: 60 + Math.random() * 40,
        vy: 26,
        dropSpeed: 32 + Math.random() * 18,
        color: "#9bf06f",
      };
    }
    if (side === "right") {
      return {
        x: this.world.width + 30,
        y: 120 + Math.random() * (this.world.height - 240),
        targetX: player.x - 180 - Math.random() * 140,
        targetY: player.y,
        vx: -60 - Math.random() * 40,
        vy: 26,
        dropSpeed: 32 + Math.random() * 18,
        color: "#8ee6ff",
      };
    }
    return {
      x: 240 + Math.random() * (this.world.width - 480),
      y: -50,
      targetX: player.x + (Math.random() - 0.5) * 200,
      targetY: player.y,
      vx: (Math.random() - 0.5) * 80,
      vy: 18,
      dropSpeed: 42 + Math.random() * 24,
      color: "#c9f07a",
    };
  }

  update(dt, game) {
    if (this.wave === 0) {
      this.startNextWave();
    }

    if (this.spawnBudget > 0) {
      this.waveTimer -= dt;
      if (this.waveTimer <= 0) {
        const plan = this.makeSpawnPlan(game.player);
        game.enemies.push(new Paratrooper(plan.x, plan.y, plan, this.wave));
        this.spawnBudget -= 1;
        this.wavePressure = Math.min(1, this.wavePressure + 0.04);
        this.waveTimer = this.waveGap;
      }
    } else if (game.enemies.length === 0) {
      this.startNextWave();
    } else {
      this.wavePressure = Math.max(0, this.wavePressure - dt * 0.04);
    }
  }
}
