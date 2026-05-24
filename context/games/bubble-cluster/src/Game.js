const WIDTH = 960;
const HEIGHT = 540;
const BUBBLE_RADIUS = 18;
const DIAMETER = BUBBLE_RADIUS * 2;
const ROW_HEIGHT = Math.round(BUBBLE_RADIUS * 1.73);
const COLS = 12;
const ROWS = 14;
const START_ROWS = 7;
const GRID_LEFT = 240;
const GRID_TOP = 84;
const SHOOTER_Y = 472;
const DROP_SHOTS = 5;
const FIRE_SPEED = 620;
const AIM_MIN = -2.85;
const AIM_MAX = -0.29;
const TOTAL_ROUNDS = 4;
const PRISM_CHARGE_TARGET = 3;
const COLORS = [
  { id: "rose", fill: "#f25f8b", glow: "#ffbdd1" },
  { id: "amber", fill: "#ffb347", glow: "#ffe0b2" },
  { id: "mint", fill: "#59d98e", glow: "#ccffe0" },
  { id: "sky", fill: "#58b7ff", glow: "#d2eeff" },
  { id: "violet", fill: "#9c7bff", glow: "#e5dbff" },
];
const PRISM_COLOR = { id: "prism", fill: "#ffe786", glow: "#f8fbff" };
const DISPLAY_COLORS = [...COLORS, PRISM_COLOR];

function randItem(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function makeGrid() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function cellToWorld(row, col) {
  const xOffset = row % 2 === 1 ? BUBBLE_RADIUS : 0;
  return {
    x: GRID_LEFT + BUBBLE_RADIUS + col * DIAMETER + xOffset,
    y: GRID_TOP + BUBBLE_RADIUS + row * ROW_HEIGHT,
  };
}

function inBounds(row, col) {
  return row >= 0 && row < ROWS && col >= 0 && col < COLS;
}

function getNeighborOffsets(row) {
  if (row % 2 === 0) {
    return [
      { row: 0, col: -1 },
      { row: 0, col: 1 },
      { row: -1, col: -1 },
      { row: -1, col: 0 },
      { row: 1, col: -1 },
      { row: 1, col: 0 },
    ];
  }

  return [
    { row: 0, col: -1 },
    { row: 0, col: 1 },
    { row: -1, col: 0 },
    { row: -1, col: 1 },
    { row: 1, col: 0 },
    { row: 1, col: 1 },
  ];
}

function getNeighbors(row, col) {
  return getNeighborOffsets(row)
    .map((offset) => ({ row: row + offset.row, col: col + offset.col }))
    .filter((cell) => inBounds(cell.row, cell.col));
}

function makeBubble(color) {
  return { colorId: color.id };
}

function worldToApproxCell(x, y) {
  const roughRow = clamp(
    Math.round((y - GRID_TOP - BUBBLE_RADIUS) / ROW_HEIGHT),
    0,
    ROWS - 1,
  );
  const xOffset = roughRow % 2 === 1 ? BUBBLE_RADIUS : 0;
  const roughCol = clamp(
    Math.round((x - GRID_LEFT - BUBBLE_RADIUS - xOffset) / DIAMETER),
    0,
    COLS - 1,
  );
  return { row: roughRow, col: roughCol };
}

function getRoundConfig(round) {
  const index = clamp(round - 1, 0, TOTAL_ROUNDS - 1);
  return {
    round,
    startRows: Math.min(START_ROWS + index, ROWS - 4),
    dropShots: Math.max(3, DROP_SHOTS - Math.floor(index / 2)),
    colorCount: Math.min(COLORS.length, 3 + Math.ceil((index + 1) / 2)),
    gapChance: Math.max(0.04, 0.18 - index * 0.025),
  };
}

function createInitialGrid(config) {
  const grid = makeGrid();
  const palette = COLORS.slice(0, config.colorCount);
  const laneColors = palette.map((color) => color.id);

  for (let row = 0; row < config.startRows; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      if (row > 3 && Math.random() < config.gapChance) {
        continue;
      }

      const bias = laneColors[(col + row) % laneColors.length];
      const color = Math.random() < 0.68
        ? palette.find((entry) => entry.id === bias)
        : randItem(palette);
      grid[row][col] = makeBubble(color);
    }
  }

  return grid;
}

function cloneBubbleGrid(grid) {
  return grid.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
}

function colorById(colorId) {
  return DISPLAY_COLORS.find((entry) => entry.id === colorId) ?? COLORS[0];
}

class Game {
  constructor() {
    this.width = WIDTH;
    this.height = HEIGHT;
    this.angle = -Math.PI / 2;
    this.time = 0;
    this.pointer = { x: WIDTH / 2, y: 120, active: false };
    this.restart();
  }

  restart() {
    this.round = 1;
    this.totalRounds = TOTAL_ROUNDS;
    this.mode = "ready";
    this.score = 0;
    this.prismCharge = 0;
    this.bankPrismShots = 0;
    this.audioEvents = [];
    this.screenShake = 0;
    this.flash = 0;
    this.ceilingPulse = 0;
    this.comboToast = null;
    this.progressionHandled = false;
    this.loadRound(this.round);
    this.message = "Round 1. Clear the first cluster.";
    this.frame = this.buildFrameState();
  }

  loadRound(round) {
    this.round = round;
    this.roundConfig = getRoundConfig(round);
    this.shotsUntilDrop = this.roundConfig.dropShots;
    this.grid = createInitialGrid(this.roundConfig);
    this.activeShot = null;
    this.popBursts = [];
    this.sparkBursts = [];
    this.fallingBursts = [];
    this.currentColor = randItem(COLORS.slice(0, this.roundConfig.colorCount)).id;
    this.nextColor = this.getSpawnColor();
    this.lastCluster = 0;
    this.progressionHandled = false;
  }

  start() {
    if (this.mode === "ready") {
      this.mode = "playing";
      this.message = this.round === 1
        ? "Bank shots to reach buried colors."
        : `Round ${this.round}. The ceiling is denser now.`;
    }
  }

  resize(width, height) {
    this.width = width || WIDTH;
    this.height = height || HEIGHT;
    this.frame = this.buildFrameState();
  }

  update(dt, input) {
    this.time += dt;

    if (input.restartPressed) {
      this.restart();
      return;
    }

    if (input.startPressed) {
      if (this.mode === "win" || this.mode === "lose") {
        this.restart();
        this.start();
      } else if (this.mode === "ready") {
        this.start();
      }
    }

    if (this.mode === "ready") {
      this.updateAim(input);
      this.frame = this.buildFrameState();
      return;
    }

    if (this.mode !== "playing") {
      this.updateParticles(dt);
      this.updateAim(input);
      this.frame = this.buildFrameState();
      return;
    }

    this.updateAim(input);
    this.updateParticles(dt);

    if (!this.activeShot && input.firePressed) {
      this.fire();
    }

    if (this.activeShot) {
      this.updateShot(dt);
    }

    this.frame = this.buildFrameState();
  }

  updateAim(input) {
    if (typeof input.pointerX === "number" && typeof input.pointerY === "number") {
      this.pointer.active = true;
      this.pointer.x = input.pointerX;
      this.pointer.y = input.pointerY;
      const dx = input.pointerX - this.width / 2;
      const dy = input.pointerY - SHOOTER_Y;
      this.angle = clamp(Math.atan2(dy, dx), AIM_MIN, AIM_MAX);
      return;
    }

    const turnSpeed = 2.8;
    if (input.leftHeld) {
      this.angle = clamp(this.angle - turnSpeed * input.dt, AIM_MIN, AIM_MAX);
    }
    if (input.rightHeld) {
      this.angle = clamp(this.angle + turnSpeed * input.dt, AIM_MIN, AIM_MAX);
    }
  }

  fire() {
    const muzzleX = this.width / 2 + Math.cos(this.angle) * 28;
    const muzzleY = SHOOTER_Y + Math.sin(this.angle) * 28;
    this.activeShot = {
      x: muzzleX,
      y: muzzleY,
      vx: Math.cos(this.angle) * FIRE_SPEED,
      vy: Math.sin(this.angle) * FIRE_SPEED,
      colorId: this.currentColor,
      bounces: 0,
    };
    this.queueAudio(this.currentColor === PRISM_COLOR.id ? "prism-fire" : "fire", {
      colorId: this.currentColor,
      pan: (muzzleX - this.width * 0.5) / (boardWidth() * 0.5),
      round: this.round,
    });
    this.currentColor = this.nextColor;
    this.nextColor = this.getSpawnColor();
  }

  getSpawnColor() {
    if (this.bankPrismShots > 0) {
      this.bankPrismShots -= 1;
      return PRISM_COLOR.id;
    }
    const activeColors = new Set();
    for (const row of this.grid) {
      for (const bubble of row) {
        if (bubble) {
          activeColors.add(bubble.colorId);
        }
      }
    }
    const allowedColors = COLORS.slice(0, this.roundConfig.colorCount);
    const palette = allowedColors.filter((color) => activeColors.has(color.id));
    return randItem((palette.length ? palette : allowedColors)).id;
  }

  updateShot(dt) {
    const shot = this.activeShot;
    shot.x += shot.vx * dt;
    shot.y += shot.vy * dt;

    const left = GRID_LEFT + BUBBLE_RADIUS;
    const right = GRID_LEFT + COLS * DIAMETER - BUBBLE_RADIUS;
    if (shot.x <= left || shot.x >= right) {
      shot.x = clamp(shot.x, left, right);
      shot.vx *= -1;
      shot.bounces += 1;
      this.screenShake = Math.max(this.screenShake, 0.12);
      this.queueAudio("bank", {
        pan: (shot.x - this.width * 0.5) / (boardWidth() * 0.5),
        count: shot.bounces,
      });
    }

    if (shot.y <= GRID_TOP + BUBBLE_RADIUS) {
      this.attachShot(worldToApproxCell(shot.x, GRID_TOP + BUBBLE_RADIUS));
      return;
    }

    const collision = this.findCollision(shot);
    if (collision) {
      this.attachShot(this.pickAttachCell(shot, collision));
    }
  }

  findCollision(shot) {
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        const bubble = this.grid[row][col];
        if (!bubble) {
          continue;
        }
        const point = cellToWorld(row, col);
        if (Math.hypot(point.x - shot.x, point.y - shot.y) <= DIAMETER - 4) {
          return { row, col, point };
        }
      }
    }
    return null;
  }

  pickAttachCell(shot, collision) {
    const candidates = [];
    const rough = worldToApproxCell(shot.x, shot.y);
    candidates.push(rough);
    candidates.push(...getNeighbors(collision.row, collision.col));

    const unique = new Map();
    for (const cell of candidates) {
      if (!inBounds(cell.row, cell.col) || this.grid[cell.row][cell.col]) {
        continue;
      }
      unique.set(`${cell.row}:${cell.col}`, cell);
    }

    const openCells = Array.from(unique.values());
    if (!openCells.length) {
      return rough;
    }

    openCells.sort((a, b) => {
      const da = distance(cellToWorld(a.row, a.col), shot);
      const db = distance(cellToWorld(b.row, b.col), shot);
      return da - db;
    });
    return openCells[0];
  }

  attachShot(cell) {
    const landedShot = this.activeShot;
    const row = clamp(cell.row, 0, ROWS - 1);
    const col = clamp(cell.col, 0, COLS - 1);
    if (this.grid[row][col]) {
      const fallback = getNeighbors(row, col).find((neighbor) => !this.grid[neighbor.row][neighbor.col]);
      if (!fallback) {
        this.activeShot = null;
        return;
      }
      cell = fallback;
    } else {
      cell = { row, col };
    }

    this.grid[cell.row][cell.col] = makeBubble(colorById(landedShot.colorId));
    if (landedShot.colorId === PRISM_COLOR.id) {
      this.resolvePrismColor(cell.row, cell.col);
    }
    const anchorPoint = cellToWorld(cell.row, cell.col);
    this.sparkBursts.push({
      x: anchorPoint.x,
      y: anchorPoint.y,
      vx: (Math.random() - 0.5) * 24,
      vy: -28 - Math.random() * 18,
      life: 0.18,
      maxLife: 0.18,
      colorId: landedShot.colorId,
      size: 3 + Math.random() * 2,
    });
    this.activeShot = null;
    const resolved = this.resolveMatches(cell.row, cell.col);
    this.shotsUntilDrop -= 1;

    if (!resolved && this.shotsUntilDrop <= 0) {
      this.dropCeiling();
      this.shotsUntilDrop = this.roundConfig.dropShots;
    } else if (resolved) {
      this.shotsUntilDrop = this.roundConfig.dropShots;
    } else {
      this.queueAudio("stick", {
        pan: (anchorPoint.x - this.width * 0.5) / (boardWidth() * 0.5),
        bounces: landedShot.bounces,
      });
    }

    if (this.isBoardCleared()) {
      this.advanceRoundOrWin();
      return;
    }

    if (this.hasReachedLossLine()) {
      this.mode = "lose";
      this.message = "Ceiling broke the launch line.";
      this.flash = Math.max(this.flash, 0.3);
      this.screenShake = Math.max(this.screenShake, 0.55);
      this.queueAudio("lose");
    }
  }

  resolvePrismColor(row, col) {
    const neighborColors = Array.from(new Set(
      getNeighbors(row, col)
        .map((neighbor) => this.grid[neighbor.row][neighbor.col]?.colorId)
        .filter((colorId) => colorId && colorId !== PRISM_COLOR.id),
    ));
    const fallbackPalette = COLORS.slice(0, this.roundConfig.colorCount).map((color) => color.id);
    const candidates = neighborColors.length ? neighborColors : fallbackPalette;
    let bestColor = candidates[0] ?? COLORS[0].id;
    let bestScore = -1;

    for (const colorId of candidates) {
      this.grid[row][col] = { colorId };
      const clusterSize = this.collectCluster(row, col, colorId).length;
      const localLinks = getNeighbors(row, col)
        .filter((neighbor) => this.grid[neighbor.row][neighbor.col]?.colorId === colorId)
        .length;
      const score = clusterSize * 10 + localLinks;
      if (score > bestScore) {
        bestColor = colorId;
        bestScore = score;
      }
    }

    this.grid[row][col] = { colorId: bestColor };
  }

  advanceRoundOrWin() {
    if (this.progressionHandled) {
      return;
    }
    this.progressionHandled = true;

    if (this.round >= this.totalRounds) {
      this.mode = "win";
      this.message = "Final board cleared. Cluster collapsed.";
      this.flash = Math.max(this.flash, 0.26);
      this.queueAudio("win");
      return;
    }

    const nextRound = this.round + 1;
    this.loadRound(nextRound);
    this.mode = "playing";
    this.message = `Round ${nextRound} unlocked. New bubbles are live.`;
    this.flash = Math.max(this.flash, 0.18);
    this.queueAudio("round-clear", { round: nextRound });
  }

  resolveMatches(startRow, startCol) {
    const origin = this.grid[startRow][startCol];
    if (!origin) {
      return false;
    }

    const cluster = this.collectCluster(startRow, startCol, origin.colorId);
    if (cluster.length < 3) {
      this.message = `${this.shotsUntilDrop} shots before the ceiling drops.`;
      return false;
    }

    this.lastCluster = cluster.length;
    for (const cell of cluster) {
      this.grid[cell.row][cell.col] = null;
      const point = cellToWorld(cell.row, cell.col);
      this.popBursts.push({
        x: point.x,
        y: point.y,
        life: 0.45,
        maxLife: 0.45,
        colorId: origin.colorId,
        size: 1 + Math.random() * 0.35,
      });
      for (let index = 0; index < 5; index += 1) {
        const angle = (Math.PI * 2 * index) / 5 + Math.random() * 0.35;
        const speed = 90 + Math.random() * 70;
        this.sparkBursts.push({
          x: point.x,
          y: point.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 20,
          life: 0.28 + Math.random() * 0.12,
          maxLife: 0.4,
          colorId: origin.colorId,
          size: 3 + Math.random() * 2,
        });
      }
    }
    this.score += cluster.length * 120;
    this.flash = Math.max(this.flash, 0.08 + cluster.length * 0.012);
    this.screenShake = Math.max(this.screenShake, 0.1 + cluster.length * 0.02);
    this.comboToast = {
      text: cluster.length >= 5 ? `${cluster.length} bubble burst` : `Pop x${cluster.length}`,
      life: 0.9,
      maxLife: 0.9,
      tone: origin.colorId,
    };
    this.queueAudio("pop", {
      size: cluster.length,
      colorId: origin.colorId,
      pan: (cellToWorld(startRow, startCol).x - this.width * 0.5) / (boardWidth() * 0.5),
    });

    const floating = this.collectFloatingCells();
    let prismReady = false;
    if (floating.length) {
      for (const cell of floating) {
        const bubble = this.grid[cell.row][cell.col];
        this.grid[cell.row][cell.col] = null;
        const point = cellToWorld(cell.row, cell.col);
        this.fallingBursts.push({
          x: point.x,
          y: point.y,
          vy: 80 + Math.random() * 40,
          drift: (Math.random() - 0.5) * 60,
          spin: (Math.random() - 0.5) * 8,
          life: 1.15,
          maxLife: 1.15,
          colorId: bubble.colorId,
          size: 0.85 + Math.random() * 0.18,
        });
        for (let index = 0; index < 3; index += 1) {
          this.sparkBursts.push({
            x: point.x,
            y: point.y,
            vx: (Math.random() - 0.5) * 44,
            vy: -10 - Math.random() * 24,
            life: 0.3 + Math.random() * 0.12,
            maxLife: 0.42,
            colorId: bubble.colorId,
            size: 2 + Math.random() * 1.5,
          });
        }
      }
      this.score += floating.length * 150;
      this.flash = Math.max(this.flash, 0.15 + floating.length * 0.01);
      this.screenShake = Math.max(this.screenShake, 0.2 + floating.length * 0.015);
      this.comboToast = {
        text: `Drop ${floating.length}`,
        life: 1.1,
        maxLife: 1.1,
        tone: floating[0] ? this.grid[floating[0].row]?.[floating[0].col]?.colorId ?? origin.colorId : origin.colorId,
      };
      this.queueAudio("drop", {
        size: floating.length,
        pan: (cellToWorld(startRow, startCol).x - this.width * 0.5) / (boardWidth() * 0.5),
      });
    }

    const chargeGain = (cluster.length >= 4 ? 1 : 0) + (floating.length >= 3 ? 1 : 0);
    if (chargeGain > 0) {
      prismReady = this.addPrismCharge(chargeGain);
    }

    this.message = floating.length
      ? `Pop ${cluster.length}. Drop ${floating.length}.`
      : `Cluster pop x${cluster.length}.`;
    if (prismReady) {
      this.message += " Prism shot ready.";
    }
    return true;
  }

  addPrismCharge(amount) {
    this.prismCharge += amount;
    let prismReady = false;
    while (this.prismCharge >= PRISM_CHARGE_TARGET) {
      this.prismCharge -= PRISM_CHARGE_TARGET;
      if (this.currentColor !== PRISM_COLOR.id && this.nextColor !== PRISM_COLOR.id) {
        this.nextColor = PRISM_COLOR.id;
      } else {
        this.bankPrismShots += 1;
      }
      prismReady = true;
    }

    if (prismReady) {
      this.comboToast = {
        text: "Prism shot ready",
        life: 1.05,
        maxLife: 1.05,
        tone: PRISM_COLOR.id,
      };
      this.queueAudio("power-ready");
    }
    return prismReady;
  }

  collectCluster(startRow, startCol, colorId) {
    const stack = [{ row: startRow, col: startCol }];
    const seen = new Set();
    const cluster = [];

    while (stack.length) {
      const cell = stack.pop();
      const key = `${cell.row}:${cell.col}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      const bubble = this.grid[cell.row][cell.col];
      if (!bubble || bubble.colorId !== colorId) {
        continue;
      }

      cluster.push(cell);
      for (const neighbor of getNeighbors(cell.row, cell.col)) {
        stack.push(neighbor);
      }
    }

    return cluster;
  }

  collectFloatingCells() {
    const anchored = new Set();
    const queue = [];

    for (let col = 0; col < COLS; col += 1) {
      if (this.grid[0][col]) {
        queue.push({ row: 0, col });
      }
    }

    while (queue.length) {
      const cell = queue.shift();
      const key = `${cell.row}:${cell.col}`;
      if (anchored.has(key)) {
        continue;
      }
      anchored.add(key);
      for (const neighbor of getNeighbors(cell.row, cell.col)) {
        if (this.grid[neighbor.row][neighbor.col]) {
          queue.push(neighbor);
        }
      }
    }

    const floating = [];
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        if (!this.grid[row][col]) {
          continue;
        }
        const key = `${row}:${col}`;
        if (!anchored.has(key)) {
          floating.push({ row, col });
        }
      }
    }

    return floating;
  }

  dropCeiling() {
    for (let row = ROWS - 1; row > 0; row -= 1) {
      this.grid[row] = cloneBubbleGrid([this.grid[row - 1]])[0];
    }
    const seedRow = Array.from({ length: COLS }, (_, col) => {
      if (Math.random() < 0.14) {
        return null;
      }
      const palette = COLORS.slice(0, this.roundConfig.colorCount);
      const bias = palette[(col + Math.floor(Math.random() * 2)) % palette.length];
      return makeBubble(bias);
    });
    this.grid[0] = seedRow;
    this.message = "Ceiling drops closer.";
    this.ceilingPulse = Math.max(this.ceilingPulse, 1);
    this.flash = Math.max(this.flash, 0.08);
    this.screenShake = Math.max(this.screenShake, 0.24);
    this.queueAudio("ceiling-drop", {
      danger: this.getDangerLevel(),
    });
  }

  hasReachedLossLine() {
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        if (!this.grid[row][col]) {
          continue;
        }
        const point = cellToWorld(row, col);
        if (point.y + BUBBLE_RADIUS >= SHOOTER_Y - 12) {
          return true;
        }
      }
    }
    return false;
  }

  isBoardCleared() {
    for (const row of this.grid) {
      for (const bubble of row) {
        if (bubble) {
          return false;
        }
      }
    }
    return true;
  }

  updateParticles(dt) {
    this.screenShake = Math.max(0, this.screenShake - dt * 1.5);
    this.flash = Math.max(0, this.flash - dt * 1.3);
    this.ceilingPulse = Math.max(0, this.ceilingPulse - dt * 1.1);
    if (this.comboToast) {
      this.comboToast = {
        ...this.comboToast,
        life: this.comboToast.life - dt,
      };
      if (this.comboToast.life <= 0) {
        this.comboToast = null;
      }
    }

    this.popBursts = this.popBursts
      .map((burst) => ({ ...burst, life: burst.life - dt }))
      .filter((burst) => burst.life > 0);

    this.sparkBursts = this.sparkBursts
      .map((burst) => ({
        ...burst,
        x: burst.x + burst.vx * dt,
        y: burst.y + burst.vy * dt,
        vy: burst.vy + 180 * dt,
        life: burst.life - dt,
      }))
      .filter((burst) => burst.life > 0);

    this.fallingBursts = this.fallingBursts
      .map((burst) => ({
        ...burst,
        x: burst.x + burst.drift * dt,
        y: burst.y + burst.vy * dt,
        vy: burst.vy + 620 * dt,
        rotation: (burst.rotation ?? 0) + burst.spin * dt,
        life: burst.life - dt,
      }))
      .filter((burst) => burst.life > 0);
  }

  buildAimGuide() {
    const points = [];
    let x = this.width / 2;
    let y = SHOOTER_Y;
    let vx = Math.cos(this.angle) * 14;
    let vy = Math.sin(this.angle) * 14;
    const left = GRID_LEFT + BUBBLE_RADIUS;
    const right = GRID_LEFT + COLS * DIAMETER - BUBBLE_RADIUS;
    let bounces = 0;

    for (let step = 0; step < 40; step += 1) {
      x += vx;
      y += vy;
      if (x <= left || x >= right) {
        vx *= -1;
        x = clamp(x, left, right);
        bounces += 1;
      }
      points.push({ x, y });
      if (y <= GRID_TOP + BUBBLE_RADIUS) {
        break;
      }
    }

    return {
      bounces,
      endpoint: points[points.length - 1] ?? { x: this.width / 2, y: SHOOTER_Y - 80 },
      points,
    };
  }

  buildFrameState() {
    const aimGuide = !this.activeShot && this.mode !== "win" && this.mode !== "lose"
      ? this.buildAimGuide()
      : { bounces: 0, endpoint: null, points: [] };
    return {
      mode: this.mode,
      time: this.time,
      score: this.score,
      round: this.round,
      totalRounds: this.totalRounds,
      shotsUntilDrop: this.shotsUntilDrop,
      message: this.message,
      angle: this.angle,
      currentColor: this.currentColor,
      nextColor: this.nextColor,
      activeShot: this.activeShot ? { ...this.activeShot } : null,
      bubbles: this.grid.flatMap((row, rowIndex) => row.flatMap((bubble, colIndex) => {
        if (!bubble) {
          return [];
        }
        return [{
          ...cellToWorld(rowIndex, colIndex),
          row: rowIndex,
          col: colIndex,
          colorId: bubble.colorId,
        }];
      })),
      popBursts: this.popBursts.map((burst) => ({ ...burst })),
      sparkBursts: this.sparkBursts.map((burst) => ({ ...burst })),
      fallingBursts: this.fallingBursts.map((burst) => ({ ...burst })),
      aimLine: aimGuide.points,
      aimBounces: aimGuide.bounces,
      aimEndpoint: aimGuide.endpoint,
      palette: DISPLAY_COLORS,
      power: {
        charge: this.prismCharge,
        target: PRISM_CHARGE_TARGET,
        nextReady: this.currentColor === PRISM_COLOR.id || this.nextColor === PRISM_COLOR.id,
        banked: this.bankPrismShots,
      },
      board: {
        left: GRID_LEFT,
        top: GRID_TOP,
        width: COLS * DIAMETER + BUBBLE_RADIUS,
        height: ROWS * ROW_HEIGHT,
        shooterY: SHOOTER_Y,
        radius: BUBBLE_RADIUS,
      },
      comboToast: this.comboToast ? { ...this.comboToast } : null,
      screenShake: this.screenShake,
      flash: this.flash,
      danger: this.getDangerLevel(),
      ceilingPulse: this.ceilingPulse,
      overlay: this.getOverlay(),
    };
  }

  getDangerLevel() {
    const shotPressure = 1 - this.shotsUntilDrop / Math.max(1, this.roundConfig.dropShots);
    let lowestY = GRID_TOP;
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        if (!this.grid[row][col]) {
          continue;
        }
        lowestY = Math.max(lowestY, cellToWorld(row, col).y + BUBBLE_RADIUS);
      }
    }
    const ceilingPressure = clamp((lowestY - (GRID_TOP + ROW_HEIGHT * 7)) / (SHOOTER_Y - GRID_TOP - ROW_HEIGHT * 7), 0, 1);
    return clamp(Math.max(shotPressure * 0.85, ceilingPressure), 0, 1);
  }

  queueAudio(type, payload = {}) {
    this.audioEvents.push({
      id: `${type}-${this.time}-${this.audioEvents.length}`,
      type,
      ...payload,
    });
  }

  consumeAudioEvents() {
    const events = this.audioEvents;
    this.audioEvents = [];
    return events;
  }

  getOverlay() {
    if (this.mode === "ready") {
      return {
        title: this.round === 1 ? "Bubble Cluster" : `Round ${this.round}`,
        lines: [
          `Clear round ${this.round} of ${this.totalRounds} before the ceiling reaches the shooter.`,
          "Match 3+ colors to pop clusters and drop hanging groups.",
          `The ceiling drops after ${this.roundConfig.dropShots} dry shots.`,
          "Big clears charge prism shots that lock to the strongest nearby color.",
        ],
        prompt: "Press Enter to start",
      };
    }
    if (this.mode === "win") {
      return {
        title: "Run Cleared",
        lines: [
          `All ${this.totalRounds} rounds cleared.`,
          `Score ${this.score}`,
          `Largest cluster ${Math.max(this.lastCluster, 3)}`,
        ],
        prompt: "Press Enter to play again",
      };
    }
    if (this.mode === "lose") {
      return {
        title: "Launch Line Crushed",
        lines: [
          `Score ${this.score}`,
          "The ceiling reached the shooter.",
        ],
        prompt: "Press Enter to retry",
      };
    }
    return null;
  }

  getFrameState() {
    return this.frame;
  }
}

function boardWidth() {
  return COLS * DIAMETER + BUBBLE_RADIUS;
}

window.BubbleClusterGame = Game;
