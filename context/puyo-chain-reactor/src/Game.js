const COLS = 6;
const ROWS = 12;
const HIDDEN_ROWS = 2;
const COLORS = ["red", "blue", "green", "yellow", "purple"];
const BASE_DROP_INTERVAL = 0.72;
const SOFT_DROP_INTERVAL = 0.05;
const TARGET_SCORE = 6000;
const PRESSURE_LIMIT = 6;

function createBoard() {
  return Array.from({ length: ROWS + HIDDEN_ROWS }, () => Array(COLS).fill(null));
}

function randomColor(rng) {
  return COLORS[Math.floor(rng() * COLORS.length)];
}

function createPair(rng) {
  return {
    pivot: randomColor(rng),
    child: randomColor(rng),
  };
}

function createRng(seed = Date.now() % 2147483647) {
  let value = seed || 1;
  return () => {
    value = (value * 48271) % 2147483647;
    return value / 2147483647;
  };
}

function visibleBoard(board) {
  return board.slice(HIDDEN_ROWS);
}

function copyPair(pair) {
  return { pivot: pair.pivot, child: pair.child };
}

export class Game {
  constructor() {
    this.rng = createRng();
    this.reset();
  }

  reset() {
    this.mode = "menu";
    this.board = createBoard();
    this.score = 0;
    this.bestChain = 0;
    this.lastChain = 0;
    this.pressure = 0;
    this.turnsSinceClear = 0;
    this.dropTimer = 0;
    this.moveTimer = 0;
    this.horizontalHold = 0;
    this.resolveTimer = 0;
    this.message = "Match four slime cores to vent the chamber.";
    this.current = null;
    this.nextPair = createPair(this.rng);
    this.phase = "idle";
  }

  start() {
    this.board = createBoard();
    this.score = 0;
    this.bestChain = 0;
    this.lastChain = 0;
    this.pressure = 0;
    this.turnsSinceClear = 0;
    this.dropTimer = 0;
    this.moveTimer = 0;
    this.horizontalHold = 0;
    this.resolveTimer = 0;
    this.message = "Heat rises after six dead drops.";
    this.mode = "playing";
    this.phase = "falling";
    this.current = this.spawnPair();
    this.nextPair = createPair(this.rng);
    if (!this.current) {
      this.fail("Reactor jammed before start.");
    }
  }

  restart() {
    this.reset();
    this.start();
  }

  spawnPair() {
    const pair = copyPair(this.nextPair);
    const candidate = {
      x: 2,
      y: 1,
      rotation: 0,
      pivot: pair.pivot,
      child: pair.child,
    };
    return this.canOccupy(candidate) ? candidate : null;
  }

  update(dt, input) {
    if (input.restart) {
      if (this.mode === "playing") {
        this.restart();
        return;
      }
      this.start();
      return;
    }

    if (this.mode !== "playing") {
      return;
    }

    if (this.phase === "falling") {
      this.handleMovement(dt, input);
      const interval = input.softDrop ? SOFT_DROP_INTERVAL : BASE_DROP_INTERVAL;
      this.dropTimer += dt;
      if (input.hardDrop) {
        while (this.tryMove(0, 1)) {
          this.score += 2;
        }
        this.lockCurrentPair();
        return;
      }
      if (this.dropTimer >= interval) {
        this.dropTimer = 0;
        if (!this.tryMove(0, 1)) {
          this.lockCurrentPair();
        }
      }
      return;
    }

    if (this.phase === "resolving") {
      this.resolveTimer += dt;
      if (this.resolveTimer >= 0.16) {
        this.resolveTimer = 0;
        this.stepResolution();
      }
    }
  }

  handleMovement(dt, input) {
    const horizontal = input.left === input.right ? 0 : input.left ? -1 : 1;
    if (horizontal !== 0) {
      if (this.horizontalHold !== horizontal) {
        this.horizontalHold = horizontal;
        this.moveTimer = 0.14;
        this.tryMove(horizontal, 0);
      } else {
        this.moveTimer -= dt;
        if (this.moveTimer <= 0) {
          this.moveTimer += 0.08;
          this.tryMove(horizontal, 0);
        }
      }
    } else {
      this.horizontalHold = 0;
      this.moveTimer = 0;
    }
    if (input.rotate) {
      this.tryRotate(1);
    }
  }

  tryMove(dx, dy) {
    if (!this.current) {
      return false;
    }
    const candidate = { ...this.current, x: this.current.x + dx, y: this.current.y + dy };
    if (!this.canOccupy(candidate)) {
      return false;
    }
    this.current = candidate;
    return true;
  }

  tryRotate(direction) {
    if (!this.current) {
      return false;
    }
    const base = (this.current.rotation + direction + 4) % 4;
    const kicks = [0, -1, 1];
    for (const kick of kicks) {
      const candidate = { ...this.current, rotation: base, x: this.current.x + kick };
      if (this.canOccupy(candidate)) {
        this.current = candidate;
        return true;
      }
    }
    return false;
  }

  getChildOffset(rotation) {
    switch (rotation % 4) {
      case 0:
        return { x: 0, y: -1 };
      case 1:
        return { x: 1, y: 0 };
      case 2:
        return { x: 0, y: 1 };
      default:
        return { x: -1, y: 0 };
    }
  }

  getPairCells(piece) {
    const offset = this.getChildOffset(piece.rotation);
    return [
      { x: piece.x, y: piece.y, color: piece.pivot },
      { x: piece.x + offset.x, y: piece.y + offset.y, color: piece.child },
    ];
  }

  canOccupy(piece) {
    return this.getPairCells(piece).every((cell) => {
      if (cell.x < 0 || cell.x >= COLS) return false;
      if (cell.y < 0 || cell.y >= ROWS + HIDDEN_ROWS) return false;
      return !this.board[cell.y][cell.x];
    });
  }

  lockCurrentPair() {
    for (const cell of this.getPairCells(this.current)) {
      this.board[cell.y][cell.x] = cell.color;
    }
    this.current = null;
    this.phase = "resolving";
    this.resolveTimer = 0;
    this.chainDepth = 0;
  }

  stepResolution() {
    this.applyGravity();
    const groups = this.findGroups();
    if (groups.length > 0) {
      this.chainDepth += 1;
      this.lastChain = this.chainDepth;
      this.bestChain = Math.max(this.bestChain, this.chainDepth);
      const popped = this.clearGroups(groups);
      const gain = popped * 20 * this.chainDepth;
      this.score += gain;
      this.message = this.chainDepth > 1 ? `${this.chainDepth} chain reaction vented the chamber.` : `Vented ${popped} slime cores.`;
      this.turnsSinceClear = 0;
      this.pressure = 0;
      if (this.score >= TARGET_SCORE) {
        this.win();
      }
      return;
    }

    if (this.chainDepth === 0) {
      this.turnsSinceClear += 1;
      this.pressure = this.turnsSinceClear % PRESSURE_LIMIT;
      if (this.turnsSinceClear >= PRESSURE_LIMIT) {
        this.turnsSinceClear = 0;
        this.injectPressureRow();
      } else {
        this.message = `${PRESSURE_LIMIT - this.pressure} safe drops before the sludge surge.`;
      }
    }

    if (this.mode !== "playing") {
      return;
    }

    this.current = this.spawnPair();
    this.nextPair = createPair(this.rng);
    this.phase = "falling";
    this.dropTimer = 0;
    this.moveTimer = 0;
    this.horizontalHold = 0;
    this.lastChain = 0;
    if (!this.current) {
      this.fail("The reactor stack reached the feed pipe.");
    }
  }

  applyGravity() {
    for (let x = 0; x < COLS; x += 1) {
      let writeY = ROWS + HIDDEN_ROWS - 1;
      for (let y = ROWS + HIDDEN_ROWS - 1; y >= 0; y -= 1) {
        const cell = this.board[y][x];
        if (!cell) continue;
        if (writeY !== y) {
          this.board[writeY][x] = cell;
          this.board[y][x] = null;
        }
        writeY -= 1;
      }
      for (let y = writeY; y >= 0; y -= 1) {
        this.board[y][x] = null;
      }
    }
  }

  findGroups() {
    const marks = Array.from({ length: ROWS + HIDDEN_ROWS }, () => Array(COLS).fill(false));
    const groups = [];
    for (let y = 0; y < ROWS + HIDDEN_ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const color = this.board[y][x];
        if (!color || marks[y][x]) continue;
        const stack = [{ x, y }];
        const cells = [];
        marks[y][x] = true;
        while (stack.length) {
          const cell = stack.pop();
          cells.push(cell);
          const neighbors = [
            { x: cell.x + 1, y: cell.y },
            { x: cell.x - 1, y: cell.y },
            { x: cell.x, y: cell.y + 1 },
            { x: cell.x, y: cell.y - 1 },
          ];
          for (const next of neighbors) {
            if (next.x < 0 || next.x >= COLS || next.y < 0 || next.y >= ROWS + HIDDEN_ROWS) continue;
            if (marks[next.y][next.x]) continue;
            if (this.board[next.y][next.x] !== color) continue;
            marks[next.y][next.x] = true;
            stack.push(next);
          }
        }
        if (cells.length >= 4) {
          groups.push(cells);
        }
      }
    }
    return groups;
  }

  clearGroups(groups) {
    let cleared = 0;
    for (const group of groups) {
      for (const cell of group) {
        if (this.board[cell.y][cell.x]) {
          this.board[cell.y][cell.x] = null;
          cleared += 1;
        }
      }
    }
    return cleared;
  }

  injectPressureRow() {
    for (let y = 0; y < ROWS + HIDDEN_ROWS - 1; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        this.board[y][x] = this.board[y + 1][x];
      }
    }
    const bottom = this.board[ROWS + HIDDEN_ROWS - 1];
    for (let x = 0; x < COLS; x += 1) {
      bottom[x] = randomColor(this.rng);
    }
    this.message = "Sludge surge rose from below.";
    if (this.board[0].some(Boolean) || this.board[1].some(Boolean)) {
      this.fail("Sludge pressure forced the feed pipe shut.");
    }
  }

  fail(message) {
    this.mode = "lose";
    this.phase = "idle";
    this.message = message;
  }

  win() {
    this.mode = "win";
    this.phase = "idle";
    this.message = "Core stabilized. Reactor cleared.";
  }

  getFrameState() {
    return {
      mode: this.mode,
      board: visibleBoard(this.board),
      current: this.current ? this.getPairCells(this.current).map((cell) => ({ ...cell, y: cell.y - HIDDEN_ROWS })) : [],
      nextPair: copyPair(this.nextPair),
      score: this.score,
      bestChain: this.bestChain,
      lastChain: this.lastChain,
      pressure: this.pressure,
      pressureLimit: PRESSURE_LIMIT,
      turnsUntilPressure: this.pressure === 0 ? PRESSURE_LIMIT : PRESSURE_LIMIT - this.pressure,
      targetScore: TARGET_SCORE,
      message: this.message,
    };
  }
}
