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
const COLORS = [
  { id: "rose", fill: "#f25f8b", glow: "#ffbdd1" },
  { id: "amber", fill: "#ffb347", glow: "#ffe0b2" },
  { id: "mint", fill: "#59d98e", glow: "#ccffe0" },
  { id: "sky", fill: "#58b7ff", glow: "#d2eeff" },
  { id: "violet", fill: "#9c7bff", glow: "#e5dbff" },
];

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

function createInitialGrid() {
  const grid = makeGrid();
  const laneColors = COLORS.map((color) => color.id);

  for (let row = 0; row < START_ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      if (row > 3 && Math.random() < 0.18) {
        continue;
      }

      const bias = laneColors[(col + row) % laneColors.length];
      const color = Math.random() < 0.68
        ? COLORS.find((entry) => entry.id === bias)
        : randItem(COLORS);
      grid[row][col] = makeBubble(color);
    }
  }

  return grid;
}

function cloneBubbleGrid(grid) {
  return grid.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
}

class Game {
  constructor() {
    this.width = WIDTH;
    this.height = HEIGHT;
    this.angle = -Math.PI / 2;
    this.pointer = { x: WIDTH / 2, y: 120, active: false };
    this.restart();
  }

  restart() {
    this.mode = "ready";
    this.score = 0;
    this.shotsUntilDrop = DROP_SHOTS;
    this.grid = createInitialGrid();
    this.activeShot = null;
    this.popBursts = [];
    this.fallingBursts = [];
    this.currentColor = randItem(COLORS).id;
    this.nextColor = randItem(COLORS).id;
    this.message = "Clear the ceiling cluster.";
    this.lastCluster = 0;
    this.frame = this.buildFrameState();
  }

  start() {
    if (this.mode === "ready") {
      this.mode = "playing";
      this.message = "Bank shots to reach buried colors.";
    }
  }

  resize(width, height) {
    this.width = width || WIDTH;
    this.height = height || HEIGHT;
    this.frame = this.buildFrameState();
  }

  update(dt, input) {
    if (input.restartPressed) {
      this.restart();
      return;
    }

    if ((this.mode === "ready" || this.mode === "win" || this.mode === "lose") && input.startPressed) {
      this.restart();
      this.start();
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
    };
    this.currentColor = this.nextColor;
    this.nextColor = this.getSpawnColor();
  }

  getSpawnColor() {
    const activeColors = new Set();
    for (const row of this.grid) {
      for (const bubble of row) {
        if (bubble) {
          activeColors.add(bubble.colorId);
        }
      }
    }
    const palette = COLORS.filter((color) => activeColors.has(color.id));
    return randItem((palette.length ? palette : COLORS)).id;
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

    this.grid[cell.row][cell.col] = makeBubble(COLORS.find((entry) => entry.id === this.activeShot.colorId));
    this.activeShot = null;
    const resolved = this.resolveMatches(cell.row, cell.col);
    this.shotsUntilDrop -= 1;

    if (!resolved && this.shotsUntilDrop <= 0) {
      this.dropCeiling();
      this.shotsUntilDrop = DROP_SHOTS;
    } else if (resolved) {
      this.shotsUntilDrop = DROP_SHOTS;
    }

    if (this.isBoardCleared()) {
      this.mode = "win";
      this.message = "Board cleared. Cluster collapsed.";
      return;
    }

    if (this.hasReachedLossLine()) {
      this.mode = "lose";
      this.message = "Ceiling broke the launch line.";
    }
  }

  resolveMatches(startRow, startCol) {
    const origin = this.grid[startRow][startCol];
    if (!origin) {
      return false;
    }

    const cluster = this.collectCluster(startRow, startCol, origin.colorId);
    if (cluster.length < 3) {
      this.message = `${this.shotsUntilDrop - 1} shots before the ceiling drops.`;
      return false;
    }

    this.lastCluster = cluster.length;
    for (const cell of cluster) {
      this.grid[cell.row][cell.col] = null;
      const point = cellToWorld(cell.row, cell.col);
      this.popBursts.push({ x: point.x, y: point.y, life: 0.55, colorId: origin.colorId });
    }
    this.score += cluster.length * 120;

    const floating = this.collectFloatingCells();
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
          life: 1.15,
          colorId: bubble.colorId,
        });
      }
      this.score += floating.length * 150;
    }

    this.message = floating.length
      ? `Pop ${cluster.length}. Drop ${floating.length}.`
      : `Cluster pop x${cluster.length}.`;
    return true;
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
      const bias = COLORS[(col + Math.floor(Math.random() * 2)) % COLORS.length];
      return makeBubble(bias);
    });
    this.grid[0] = seedRow;
    this.message = "Ceiling drops closer.";
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
    this.popBursts = this.popBursts
      .map((burst) => ({ ...burst, life: burst.life - dt }))
      .filter((burst) => burst.life > 0);

    this.fallingBursts = this.fallingBursts
      .map((burst) => ({
        ...burst,
        x: burst.x + burst.drift * dt,
        y: burst.y + burst.vy * dt,
        vy: burst.vy + 620 * dt,
        life: burst.life - dt,
      }))
      .filter((burst) => burst.life > 0);
  }

  buildAimLine() {
    const points = [];
    let x = this.width / 2;
    let y = SHOOTER_Y;
    let vx = Math.cos(this.angle) * 14;
    let vy = Math.sin(this.angle) * 14;
    const left = GRID_LEFT + BUBBLE_RADIUS;
    const right = GRID_LEFT + COLS * DIAMETER - BUBBLE_RADIUS;

    for (let step = 0; step < 40; step += 1) {
      x += vx;
      y += vy;
      if (x <= left || x >= right) {
        vx *= -1;
        x = clamp(x, left, right);
      }
      points.push({ x, y });
      if (y <= GRID_TOP + BUBBLE_RADIUS) {
        break;
      }
    }

    return points;
  }

  buildFrameState() {
    return {
      mode: this.mode,
      score: this.score,
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
      fallingBursts: this.fallingBursts.map((burst) => ({ ...burst })),
      aimLine: !this.activeShot && this.mode !== "win" && this.mode !== "lose" ? this.buildAimLine() : [],
      palette: COLORS,
      board: {
        left: GRID_LEFT,
        top: GRID_TOP,
        width: COLS * DIAMETER + BUBBLE_RADIUS,
        height: ROWS * ROW_HEIGHT,
        shooterY: SHOOTER_Y,
        radius: BUBBLE_RADIUS,
      },
      overlay: this.getOverlay(),
    };
  }

  getOverlay() {
    if (this.mode === "ready") {
      return {
        title: "Bubble Cluster",
        lines: [
          "Match 3+ colors to pop clusters.",
          "Detached groups fall for bonus score.",
          "Ceiling drops after too many dry shots.",
        ],
        prompt: "Press Enter to start",
      };
    }
    if (this.mode === "win") {
      return {
        title: "Board Cleared",
        lines: [
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

window.BubbleClusterGame = Game;
