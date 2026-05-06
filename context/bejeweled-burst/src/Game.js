const BOARD_SIZE = 8;
const GEM_TYPES = 6;
const CELL_SIZE = 64;
const BOARD_X = 64;
const BOARD_Y = 132;
const ROUND_TIME = 70;
const TARGET_SCORE = 5000;

const COLORS = [
  "#ff6b6b",
  "#ffd166",
  "#06d6a0",
  "#4cc9f0",
  "#c77dff",
  "#ff8fab",
];

function createGem(type, special = null) {
  return {
    type,
    special,
  };
}

function cloneBoard(board) {
  return board.map((row) => row.map((gem) => (gem ? { ...gem } : null)));
}

function randomType() {
  return Math.floor(Math.random() * GEM_TYPES);
}

function inBounds(row, col) {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

function areAdjacent(a, b) {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1;
}

function swapCells(board, a, b) {
  const next = cloneBoard(board);
  const temp = next[a.row][a.col];
  next[a.row][a.col] = next[b.row][b.col];
  next[b.row][b.col] = temp;
  return next;
}

function findMatches(board) {
  const groups = [];
  const keySet = new Set();

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    let start = 0;
    for (let col = 1; col <= BOARD_SIZE; col += 1) {
      const same =
        col < BOARD_SIZE &&
        board[row][start] &&
        board[row][col] &&
        board[row][start].type === board[row][col].type;
      if (!same) {
        if (col - start >= 3) {
          const cells = [];
          for (let cursor = start; cursor < col; cursor += 1) {
            cells.push({ row, col: cursor });
          }
          groups.push(cells);
        }
        start = col;
      }
    }
  }

  for (let col = 0; col < BOARD_SIZE; col += 1) {
    let start = 0;
    for (let row = 1; row <= BOARD_SIZE; row += 1) {
      const same =
        row < BOARD_SIZE &&
        board[start][col] &&
        board[row][col] &&
        board[start][col].type === board[row][col].type;
      if (!same) {
        if (row - start >= 3) {
          const cells = [];
          for (let cursor = start; cursor < row; cursor += 1) {
            cells.push({ row: cursor, col });
          }
          groups.push(cells);
        }
        start = row;
      }
    }
  }

  const merged = [];
  for (const group of groups) {
    const overlap = merged.find((existing) =>
      group.some((cell) => existing.some((test) => test.row === cell.row && test.col === cell.col)),
    );
    if (overlap) {
      for (const cell of group) {
        const key = `${cell.row}:${cell.col}`;
        if (!keySet.has(key)) {
          overlap.push(cell);
          keySet.add(key);
        }
      }
    } else {
      const copy = [];
      for (const cell of group) {
        const key = `${cell.row}:${cell.col}`;
        copy.push(cell);
        keySet.add(key);
      }
      merged.push(copy);
    }
  }

  return merged;
}

function hasAnyMatches(board) {
  return findMatches(board).length > 0;
}

function hasValidMove(board) {
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const from = { row, col };
      const targets = [
        { row: row + 1, col },
        { row, col: col + 1 },
      ];
      for (const to of targets) {
        if (!inBounds(to.row, to.col)) {
          continue;
        }
        if (hasAnyMatches(swapCells(board, from, to))) {
          return true;
        }
      }
    }
  }
  return false;
}

function createBoard() {
  while (true) {
    const board = Array.from({ length: BOARD_SIZE }, () =>
      Array.from({ length: BOARD_SIZE }, () => createGem(randomType())),
    );

    for (let row = 0; row < BOARD_SIZE; row += 1) {
      for (let col = 0; col < BOARD_SIZE; col += 1) {
        while (
          (col >= 2 &&
            board[row][col - 1].type === board[row][col].type &&
            board[row][col - 2].type === board[row][col].type) ||
          (row >= 2 &&
            board[row - 1][col].type === board[row][col].type &&
            board[row - 2][col].type === board[row][col].type)
        ) {
          board[row][col] = createGem(randomType());
        }
      }
    }

    if (hasValidMove(board)) {
      return board;
    }
  }
}

function shuffleBoard(board) {
  const gems = [];
  for (const row of board) {
    for (const gem of row) {
      gems.push(gem ? { ...gem, special: null } : createGem(randomType()));
    }
  }

  while (true) {
    for (let index = gems.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      const temp = gems[index];
      gems[index] = gems[swapIndex];
      gems[swapIndex] = temp;
    }

    const next = [];
    let cursor = 0;
    for (let row = 0; row < BOARD_SIZE; row += 1) {
      next[row] = [];
      for (let col = 0; col < BOARD_SIZE; col += 1) {
        next[row][col] = { ...gems[cursor] };
        cursor += 1;
      }
    }

    if (!hasAnyMatches(next) && hasValidMove(next)) {
      return next;
    }
  }
}

function cellKey(cell) {
  return `${cell.row}:${cell.col}`;
}

export class Game {
  constructor() {
    this.reset();
  }

  reset() {
    this.mode = "menu";
    this.score = 0;
    this.targetScore = TARGET_SCORE;
    this.timeLeft = ROUND_TIME;
    this.combo = 1;
    this.maxCombo = 1;
    this.board = createBoard();
    this.selected = null;
    this.lastSwap = null;
    this.message = "Match-3 blitz";
    this.animations = [];
    this.pendingResolution = null;
    this.noMoveFlash = 0;
    this.sparkles = [];
  }

  start() {
    this.reset();
    this.mode = "playing";
    this.message = "Go";
  }

  restart() {
    this.start();
  }

  screenToCell(x, y) {
    const col = Math.floor((x - BOARD_X) / CELL_SIZE);
    const row = Math.floor((y - BOARD_Y) / CELL_SIZE);
    if (!inBounds(row, col)) {
      return null;
    }
    return { row, col };
  }

  handlePointer(x, y) {
    if (this.mode !== "playing" || this.pendingResolution) {
      return;
    }

    const cell = this.screenToCell(x, y);
    if (!cell) {
      this.selected = null;
      return;
    }

    if (!this.selected) {
      this.selected = cell;
      return;
    }

    if (this.selected.row === cell.row && this.selected.col === cell.col) {
      this.selected = null;
      return;
    }

    if (!areAdjacent(this.selected, cell)) {
      this.selected = cell;
      return;
    }

    this.trySwap(this.selected, cell);
    this.selected = null;
  }

  trySwap(a, b) {
    const swapped = swapCells(this.board, a, b);
    this.board = swapped;
    this.lastSwap = { a, b };
    const matches = findMatches(this.board);
    if (matches.length === 0) {
      this.pendingResolution = {
        type: "revert",
        timer: 0.18,
      };
      this.message = "No match";
      this.combo = 1;
      return;
    }

    this.pendingResolution = {
      type: "resolve",
      timer: 0.14,
    };
  }

  update(dt) {
    this.updateSparkles(dt);

    if (this.mode !== "playing") {
      return;
    }

    this.timeLeft = Math.max(0, this.timeLeft - dt);
    if (this.timeLeft === 0) {
      this.mode = this.score >= this.targetScore ? "win" : "lose";
      this.message = this.mode === "win" ? "Target reached" : "Time up";
      this.pendingResolution = null;
      return;
    }

    if (this.pendingResolution) {
      this.pendingResolution.timer -= dt;
      if (this.pendingResolution.timer <= 0) {
        if (this.pendingResolution.type === "revert") {
          this.board = swapCells(this.board, this.lastSwap.a, this.lastSwap.b);
          this.lastSwap = null;
          this.pendingResolution = null;
        } else {
          this.resolveBoard();
        }
      }
    }

    this.noMoveFlash = Math.max(0, this.noMoveFlash - dt);
  }

  updateSparkles(dt) {
    this.sparkles = this.sparkles
      .map((spark) => ({
        ...spark,
        x: spark.x + spark.vx * dt,
        y: spark.y + spark.vy * dt,
        life: spark.life - dt,
      }))
      .filter((spark) => spark.life > 0);
  }

  resolveBoard() {
    const matches = findMatches(this.board);
    if (matches.length === 0) {
      this.pendingResolution = null;
      this.lastSwap = null;
      this.combo = 1;
      if (!hasValidMove(this.board)) {
        this.board = shuffleBoard(this.board);
        this.noMoveFlash = 1.2;
        this.message = "Board shuffled";
      } else {
        this.message = "Chain settled";
      }
      if (this.score >= this.targetScore) {
        this.mode = "win";
        this.message = "Target reached";
      }
      return;
    }

    const remove = new Set();
    let gained = 0;

    for (const group of matches) {
      const anchor = group[group.length - 1];
      let makeBomb = null;
      if (group.length >= 4) {
        const anchorGem = this.board[anchor.row][anchor.col];
        makeBomb = createGem(anchorGem.type, "burst");
      }

      for (const cell of group) {
        const gem = this.board[cell.row][cell.col];
        remove.add(cellKey(cell));
        gained += 100;
        this.emitSparkles(cell, COLORS[gem.type]);
        if (gem.special === "burst") {
          for (let row = 0; row < BOARD_SIZE; row += 1) {
            remove.add(cellKey({ row, col: cell.col }));
          }
          for (let col = 0; col < BOARD_SIZE; col += 1) {
            remove.add(cellKey({ row: cell.row, col }));
          }
          gained += 250;
        }
      }

      if (makeBomb) {
        remove.delete(cellKey(anchor));
        this.board[anchor.row][anchor.col] = makeBomb;
      }
    }

    const cellCount = remove.size;
    const comboMultiplier = this.combo;
    this.score += gained * comboMultiplier;
    this.timeLeft = Math.min(ROUND_TIME + 10, this.timeLeft + Math.min(1.5, cellCount * 0.06));
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.message = `${cellCount} gems burst`;

    for (const key of remove) {
      const [row, col] = key.split(":").map(Number);
      this.board[row][col] = null;
    }

    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const survivors = [];
      for (let row = BOARD_SIZE - 1; row >= 0; row -= 1) {
        if (this.board[row][col]) {
          survivors.push(this.board[row][col]);
        }
      }
      for (let row = BOARD_SIZE - 1; row >= 0; row -= 1) {
        this.board[row][col] = survivors[BOARD_SIZE - 1 - row] ?? null;
      }
      for (let row = BOARD_SIZE - 1 - survivors.length; row >= 0; row -= 1) {
        this.board[row][col] = createGem(randomType());
      }
    }

    this.combo += 1;
    this.pendingResolution = {
      type: "resolve",
      timer: 0.16,
    };
  }

  emitSparkles(cell, color) {
    const centerX = BOARD_X + cell.col * CELL_SIZE + CELL_SIZE / 2;
    const centerY = BOARD_Y + cell.row * CELL_SIZE + CELL_SIZE / 2;
    for (let index = 0; index < 6; index += 1) {
      const angle = (Math.PI * 2 * index) / 6 + Math.random() * 0.3;
      const speed = 28 + Math.random() * 70;
      this.sparkles.push({
        x: centerX,
        y: centerY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.35 + Math.random() * 0.25,
        color,
      });
    }
  }

  getFrameState() {
    return {
      mode: this.mode,
      score: Math.floor(this.score),
      targetScore: this.targetScore,
      timer: this.timeLeft,
      combo: this.combo,
      maxCombo: this.maxCombo,
      board: this.board,
      selected: this.selected,
      message: this.message,
      boardX: BOARD_X,
      boardY: BOARD_Y,
      cellSize: CELL_SIZE,
      colors: COLORS,
      noMoveFlash: this.noMoveFlash,
      sparkles: this.sparkles,
    };
  }
}
