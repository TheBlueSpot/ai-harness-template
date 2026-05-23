const DIRECTIONS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const TURN_OPTIONS = {
  up: ["left", "right"],
  down: ["right", "left"],
  left: ["down", "up"],
  right: ["up", "down"],
};

const OPPOSITE = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
};

const COLORS = {
  player: "#7aebff",
  orange: "#ff8f3f",
  pink: "#ff69c8",
  gold: "#ffd166",
};

function cellKey(x, y) {
  return `${x},${y}`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export class Game {
  constructor() {
    this.width = 960;
    this.height = 540;
    this.gridCols = 32;
    this.gridRows = 18;
    this.cell = 28;
    this.offsetX = (this.width - this.gridCols * this.cell) * 0.5;
    this.offsetY = (this.height - this.gridRows * this.cell) * 0.5;
    this.input = { turn: null, boost: false, startPressed: false };
    this.mode = "menu";
    this.lives = 3;
    this.round = 1;
    this.maxRounds = 4;
    this.score = 0;
    this.banner = "Cut off the rivals.";
    this.bannerTimer = 0;
    this.flashTimer = 0;
    this.boostOrbs = [];
    this.orbTimer = 0;
    this.roundTimer = 0;
    this.resetRound();
  }

  resetRound() {
    this.occupancy = new Map();
    this.riders = [];
    this.sparkBursts = [];
    this.boostOrbs = [];
    this.orbTimer = 2.5;
    this.roundTimer = 0;
    this.mode = this.mode === "menu" ? "menu" : "playing";

    const player = this.createRider({
      id: "player",
      x: 6,
      y: Math.floor(this.gridRows / 2),
      dir: "right",
      color: COLORS.player,
      isPlayer: true,
      boost: 70,
      lives: this.lives,
    });
    this.player = player;
    this.riders.push(player);

    const rivals = clamp(this.round + 1, 2, 4);
    const spawnRows = [3, this.gridRows - 4, Math.floor(this.gridRows / 2)];
    const spawnDirs = ["left", "left", "up", "down"];
    const colors = [COLORS.orange, COLORS.pink, COLORS.gold, "#8cf18f"];
    for (let i = 0; i < rivals; i += 1) {
      const x = this.gridCols - 7 - (i % 2) * 3;
      const y = spawnRows[i % spawnRows.length] + (i > 2 ? 2 : 0);
      const rival = this.createRider({
        id: `rival-${i}`,
        x,
        y,
        dir: spawnDirs[i] || "left",
        color: colors[i],
        isPlayer: false,
        boost: 50 + this.round * 8,
      });
      this.riders.push(rival);
    }
  }

  createRider(config) {
    const rider = {
      ...config,
      alive: true,
      pendingTurn: null,
      moveTimer: 0,
      speed: 0.11 - (config.isPlayer ? 0 : Math.min(0.03, this.round * 0.004)),
      boostSpeed: 0.058,
      trail: [{ x: config.x, y: config.y }],
      intent: null,
      intentTimer: 0,
      hitFlash: 0,
    };
    this.occupancy.set(cellKey(rider.x, rider.y), rider.id);
    return rider;
  }

  startRun() {
    this.mode = "playing";
    this.round = 1;
    this.lives = 3;
    this.score = 0;
    this.banner = "Round 1. Box them in.";
    this.bannerTimer = 2.2;
    this.resetRound();
  }

  restartAfterLose() {
    this.mode = "menu";
    this.round = 1;
    this.lives = 3;
    this.score = 0;
    this.banner = "Cut off the rivals.";
    this.bannerTimer = 0;
    this.resetRound();
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    this.cell = Math.floor(Math.min(width / this.gridCols, height / this.gridRows));
    this.offsetX = Math.floor((width - this.gridCols * this.cell) * 0.5);
    this.offsetY = Math.floor((height - this.gridRows * this.cell) * 0.5);
  }

  setTurn(turn) {
    this.input.turn = turn;
  }

  setBoost(isBoosting) {
    this.input.boost = isBoosting;
  }

  pressStart() {
    this.input.startPressed = true;
  }

  update(dt) {
    if (this.input.startPressed) {
      if (this.mode === "menu") {
        this.startRun();
      } else if (this.mode === "gameOver" || this.mode === "victory") {
        this.restartAfterLose();
      } else if (this.mode === "roundClear") {
        this.round += 1;
        if (this.round > this.maxRounds) {
          this.mode = "victory";
        } else {
          this.banner = `Round ${this.round}. More riders.`;
          this.bannerTimer = 2.2;
          this.resetRound();
        }
      }
    }
    this.input.startPressed = false;

    this.bannerTimer = Math.max(0, this.bannerTimer - dt);
    this.flashTimer = Math.max(0, this.flashTimer - dt);

    if (this.mode !== "playing") {
      return;
    }

    this.roundTimer += dt;
    this.orbTimer -= dt;
    if (this.orbTimer <= 0 && this.boostOrbs.length < 2) {
      this.spawnBoostOrb();
      this.orbTimer = 3 + Math.random() * 2.5;
    }

    if (this.player.alive && this.input.turn) {
      if (this.input.turn !== OPPOSITE[this.player.dir]) {
        this.player.pendingTurn = this.input.turn;
      }
    }

    if (this.input.boost && this.player.boost > 0) {
      this.player.boost = Math.max(0, this.player.boost - dt * 55);
    } else {
      this.player.boost = Math.min(100, this.player.boost + dt * 12);
    }

    for (const rider of this.riders) {
      if (!rider.alive) {
        continue;
      }
      if (!rider.isPlayer) {
        this.planAi(rider);
      }
      rider.moveTimer += dt;
      const speed = this.getStepTime(rider);
      while (rider.moveTimer >= speed && rider.alive && this.mode === "playing") {
        rider.moveTimer -= speed;
        this.advanceRider(rider);
      }
      rider.intentTimer = Math.max(0, rider.intentTimer - dt);
      rider.hitFlash = Math.max(0, rider.hitFlash - dt);
    }

    this.sparkBursts = this.sparkBursts.filter((spark) => {
      spark.life -= dt;
      return spark.life > 0;
    });

    if (this.mode !== "playing") {
      return;
    }

    const aliveRivals = this.riders.filter((rider) => !rider.isPlayer && rider.alive);
    if (!this.player.alive) {
      this.lives -= 1;
      if (this.lives <= 0) {
        this.mode = "gameOver";
      } else {
        this.banner = `Bike lost. ${this.lives} lives left.`;
        this.bannerTimer = 1.8;
        this.resetRound();
      }
      return;
    }

    if (aliveRivals.length === 0) {
      this.score += 500 + this.round * 150 + Math.max(0, 140 - Math.floor(this.roundTimer * 10));
      this.mode = "roundClear";
      this.banner = this.round === this.maxRounds ? "Core lane clear." : "Arena clear. Press Enter.";
      this.bannerTimer = 99;
    }
  }

  getStepTime(rider) {
    if (!rider.isPlayer) {
      return rider.speed;
    }
    if (this.input.boost && rider.boost > 0) {
      return rider.boostSpeed;
    }
    return rider.speed;
  }

  spawnBoostOrb() {
    for (let tries = 0; tries < 60; tries += 1) {
      const x = randInt(4, this.gridCols - 5);
      const y = randInt(3, this.gridRows - 4);
      const key = cellKey(x, y);
      if (this.occupancy.has(key) || this.boostOrbs.some((orb) => orb.x === x && orb.y === y)) {
        continue;
      }
      this.boostOrbs.push({ x, y, pulse: Math.random() * Math.PI * 2 });
      return;
    }
  }

  planAi(rider) {
    const options = [rider.dir, ...TURN_OPTIONS[rider.dir]];
    let bestDir = rider.dir;
    let bestScore = -Infinity;

    for (const dir of options) {
      if (dir === OPPOSITE[rider.dir]) {
        continue;
      }
      const score = this.scoreDirection(rider, dir);
      if (score > bestScore) {
        bestScore = score;
        bestDir = dir;
      }
    }

    if (bestDir !== rider.dir) {
      rider.pendingTurn = bestDir;
      rider.intent = this.projectPath(rider, bestDir, 5);
      rider.intentTimer = 0.28;
    }
  }

  scoreDirection(rider, dir) {
    const delta = DIRECTIONS[dir];
    let space = 0;
    let x = rider.x;
    let y = rider.y;
    for (let i = 0; i < 7; i += 1) {
      x += delta.x;
      y += delta.y;
      if (x < 0 || y < 0 || x >= this.gridCols || y >= this.gridRows) {
        break;
      }
      if (this.occupancy.has(cellKey(x, y))) {
        break;
      }
      space += 1;
    }

    const playerBias = Math.abs(this.player.x - (rider.x + delta.x)) + Math.abs(this.player.y - (rider.y + delta.y));
    const orbBias = this.boostOrbs.reduce((best, orb) => {
      const distance = Math.abs(orb.x - (rider.x + delta.x)) + Math.abs(orb.y - (rider.y + delta.y));
      return Math.min(best, distance);
    }, 99);

    return space * 10 - playerBias * 0.7 - orbBias * 0.2 + Math.random() * 1.4;
  }

  projectPath(rider, dir, length) {
    const delta = DIRECTIONS[dir];
    const cells = [];
    let x = rider.x;
    let y = rider.y;
    for (let i = 0; i < length; i += 1) {
      x += delta.x;
      y += delta.y;
      cells.push({ x, y });
      if (x < 0 || y < 0 || x >= this.gridCols || y >= this.gridRows) {
        break;
      }
    }
    return cells;
  }

  advanceRider(rider) {
    if (rider.pendingTurn && rider.pendingTurn !== OPPOSITE[rider.dir]) {
      rider.dir = rider.pendingTurn;
    }
    rider.pendingTurn = null;

    const delta = DIRECTIONS[rider.dir];
    const next = { x: rider.x + delta.x, y: rider.y + delta.y };
    if (
      next.x < 0 ||
      next.y < 0 ||
      next.x >= this.gridCols ||
      next.y >= this.gridRows ||
      this.occupancy.has(cellKey(next.x, next.y))
    ) {
      this.killRider(rider, next);
      return;
    }

    rider.x = next.x;
    rider.y = next.y;
    rider.trail.push(next);
    this.occupancy.set(cellKey(next.x, next.y), rider.id);

    const orbIndex = this.boostOrbs.findIndex((orb) => orb.x === next.x && orb.y === next.y);
    if (orbIndex >= 0) {
      rider.boost = Math.min(100, rider.boost + 45);
      this.boostOrbs.splice(orbIndex, 1);
      this.score += rider.isPlayer ? 80 : 0;
      this.banner = rider.isPlayer ? "Boost cell primed." : this.banner;
      this.bannerTimer = rider.isPlayer ? 0.8 : this.bannerTimer;
    }
  }

  killRider(rider, point) {
    rider.alive = false;
    rider.hitFlash = 0.5;
    this.sparkBursts.push({
      x: rider.x,
      y: rider.y,
      color: rider.color,
      life: 0.45,
    });
    if (!rider.isPlayer) {
      this.score += 220;
      this.banner = "Trail cut.";
      this.bannerTimer = 0.7;
    } else {
      this.flashTimer = 0.35;
    }
  }

  getFrameState() {
    return {
      mode: this.mode,
      width: this.width,
      height: this.height,
      cell: this.cell,
      offsetX: this.offsetX,
      offsetY: this.offsetY,
      gridCols: this.gridCols,
      gridRows: this.gridRows,
      riders: this.riders.map((rider) => ({
        id: rider.id,
        x: rider.x,
        y: rider.y,
        color: rider.color,
        trail: rider.trail,
        alive: rider.alive,
        isPlayer: rider.isPlayer,
        intent: rider.intentTimer > 0 ? rider.intent : null,
      })),
      sparkBursts: this.sparkBursts,
      boostOrbs: this.boostOrbs,
      banner: this.bannerTimer > 0 ? this.banner : "",
      score: this.score,
      round: this.round,
      lives: this.lives,
      boost: Math.round(this.player.boost),
      flash: this.flashTimer > 0,
      showBoostPrompt: this.mode === "playing" && this.player.alive && this.player.boost >= 35,
      player: { x: this.player.x, y: this.player.y, alive: this.player.alive },
    };
  }

  render(ctx) {
    const state = this.getFrameState();
    ctx.clearRect(0, 0, this.width, this.height);

    const gridWidth = this.gridCols * this.cell;
    const gridHeight = this.gridRows * this.cell;
    ctx.fillStyle = "#02060d";
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.fillStyle = "#04121c";
    ctx.fillRect(state.offsetX, state.offsetY, gridWidth, gridHeight);

    ctx.strokeStyle = "rgba(122, 235, 255, 0.1)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= this.gridCols; x += 1) {
      const drawX = state.offsetX + x * this.cell + 0.5;
      ctx.beginPath();
      ctx.moveTo(drawX, state.offsetY);
      ctx.lineTo(drawX, state.offsetY + gridHeight);
      ctx.stroke();
    }
    for (let y = 0; y <= this.gridRows; y += 1) {
      const drawY = state.offsetY + y * this.cell + 0.5;
      ctx.beginPath();
      ctx.moveTo(state.offsetX, drawY);
      ctx.lineTo(state.offsetX + gridWidth, drawY);
      ctx.stroke();
    }

    for (const orb of state.boostOrbs) {
      const px = state.offsetX + orb.x * this.cell + this.cell * 0.5;
      const py = state.offsetY + orb.y * this.cell + this.cell * 0.5;
      ctx.fillStyle = "#ffd166";
      ctx.beginPath();
      ctx.arc(px, py, this.cell * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 209, 102, 0.5)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, this.cell * 0.34, 0, Math.PI * 2);
      ctx.stroke();
    }

    for (const rider of state.riders) {
      ctx.strokeStyle = rider.color;
      ctx.lineWidth = Math.max(4, this.cell * 0.34);
      ctx.lineJoin = "round";
      ctx.beginPath();
      rider.trail.forEach((cell, index) => {
        const px = state.offsetX + cell.x * this.cell + this.cell * 0.5;
        const py = state.offsetY + cell.y * this.cell + this.cell * 0.5;
        if (index === 0) {
          ctx.moveTo(px, py);
        } else {
          ctx.lineTo(px, py);
        }
      });
      ctx.stroke();
    }

    for (const rider of state.riders) {
      if (!rider.alive && !rider.isPlayer) {
        continue;
      }
      if (rider.intent) {
        ctx.strokeStyle = `${rider.color}55`;
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        rider.intent.forEach((cell, index) => {
          const px = state.offsetX + cell.x * this.cell + this.cell * 0.5;
          const py = state.offsetY + cell.y * this.cell + this.cell * 0.5;
          if (index === 0) {
            ctx.moveTo(px, py);
          } else {
            ctx.lineTo(px, py);
          }
        });
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    for (const rider of state.riders) {
      if (!rider.alive) {
        continue;
      }
      const px = state.offsetX + rider.x * this.cell + this.cell * 0.5;
      const py = state.offsetY + rider.y * this.cell + this.cell * 0.5;
      ctx.fillStyle = rider.color;
      ctx.shadowColor = rider.color;
      ctx.shadowBlur = 22;
      ctx.beginPath();
      ctx.arc(px, py, this.cell * 0.34, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    for (const spark of state.sparkBursts) {
      const px = state.offsetX + spark.x * this.cell + this.cell * 0.5;
      const py = state.offsetY + spark.y * this.cell + this.cell * 0.5;
      ctx.strokeStyle = spark.color;
      ctx.lineWidth = 2;
      for (let i = 0; i < 6; i += 1) {
        const angle = (Math.PI * 2 * i) / 6;
        const radius = (1 - spark.life / 0.45) * this.cell;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + Math.cos(angle) * radius, py + Math.sin(angle) * radius);
        ctx.stroke();
      }
    }

    if (state.flash) {
      ctx.fillStyle = "rgba(255, 90, 90, 0.14)";
      ctx.fillRect(0, 0, this.width, this.height);
    }

    if (state.banner) {
      const px = state.offsetX + state.player.x * this.cell + this.cell * 1.2;
      const py = state.offsetY + state.player.y * this.cell - this.cell * 0.8;
      ctx.font = "14px Trebuchet MS";
      const textWidth = ctx.measureText(state.banner).width;
      ctx.fillStyle = "rgba(4, 16, 29, 0.88)";
      ctx.strokeStyle = "rgba(122, 235, 255, 0.28)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(px - 10, py - 24, textWidth + 24, 34, 16);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#e7fbff";
      ctx.fillText(state.banner, px, py - 2);
    }

    if (state.showBoostPrompt) {
      const text = "SPACE BOOST";
      const px = state.offsetX + state.player.x * this.cell - 32;
      const py = state.offsetY + state.player.y * this.cell + this.cell * 1.8;
      ctx.fillStyle = "#ffd166";
      ctx.font = "bold 12px Trebuchet MS";
      ctx.fillText(text, px, py);
    }
  }
}
