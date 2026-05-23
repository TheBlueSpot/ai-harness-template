const COLS = 10;
const ROWS = 22;
const VISIBLE_ROWS = 20;
const CELL = 32;

const boardCanvas = document.querySelector("#board");
const boardCtx = boardCanvas.getContext("2d");
const holdCanvas = document.querySelector("#hold");
const holdCtx = holdCanvas.getContext("2d");
const nextCanvas = document.querySelector("#next");
const nextCtx = nextCanvas.getContext("2d");

const scoreEl = document.querySelector("#score");
const linesEl = document.querySelector("#lines");
const levelEl = document.querySelector("#level");
const goalEl = document.querySelector("#goal");
const promptEl = document.querySelector("#prompt");
const overlayEl = document.querySelector("#overlay");
const overlayTitleEl = document.querySelector("#overlay-title");
const overlayTextEl = document.querySelector("#overlay-text");
const restartButton = document.querySelector("#restart");

const COLORS = {
  I: "#59e1ff",
  O: "#ffe27a",
  T: "#cd8bff",
  S: "#79f3b0",
  Z: "#ff8da1",
  J: "#8db4ff",
  L: "#ffb26b",
  ghost: "rgba(255,255,255,0.18)",
  grid: "rgba(173, 197, 255, 0.08)",
  locked: "#0a1522",
};

const SHAPES = {
  I: [
    [
      [0, 0, 0, 0],
      [1, 1, 1, 1],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    [
      [0, 0, 1, 0],
      [0, 0, 1, 0],
      [0, 0, 1, 0],
      [0, 0, 1, 0],
    ],
    [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [1, 1, 1, 1],
      [0, 0, 0, 0],
    ],
    [
      [0, 1, 0, 0],
      [0, 1, 0, 0],
      [0, 1, 0, 0],
      [0, 1, 0, 0],
    ],
  ],
  O: [
    [
      [1, 1],
      [1, 1],
    ],
  ],
  T: [
    [
      [0, 1, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],
    [
      [0, 1, 0],
      [0, 1, 1],
      [0, 1, 0],
    ],
    [
      [0, 0, 0],
      [1, 1, 1],
      [0, 1, 0],
    ],
    [
      [0, 1, 0],
      [1, 1, 0],
      [0, 1, 0],
    ],
  ],
  S: [
    [
      [0, 1, 1],
      [1, 1, 0],
      [0, 0, 0],
    ],
    [
      [0, 1, 0],
      [0, 1, 1],
      [0, 0, 1],
    ],
  ],
  Z: [
    [
      [1, 1, 0],
      [0, 1, 1],
      [0, 0, 0],
    ],
    [
      [0, 0, 1],
      [0, 1, 1],
      [0, 1, 0],
    ],
  ],
  J: [
    [
      [1, 0, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],
    [
      [0, 1, 1],
      [0, 1, 0],
      [0, 1, 0],
    ],
    [
      [0, 0, 0],
      [1, 1, 1],
      [0, 0, 1],
    ],
    [
      [0, 1, 0],
      [0, 1, 0],
      [1, 1, 0],
    ],
  ],
  L: [
    [
      [0, 0, 1],
      [1, 1, 1],
      [0, 0, 0],
    ],
    [
      [0, 1, 0],
      [0, 1, 0],
      [0, 1, 1],
    ],
    [
      [0, 0, 0],
      [1, 1, 1],
      [1, 0, 0],
    ],
    [
      [1, 1, 0],
      [0, 1, 0],
      [0, 1, 0],
    ],
  ],
};

const LINE_SCORES = [0, 100, 300, 500, 800];

const state = {
  board: [],
  bag: [],
  active: null,
  hold: null,
  holdLocked: false,
  score: 0,
  lines: 0,
  level: 1,
  dropTimer: 0,
  lockTimer: 0,
  grounded: false,
  paused: false,
  gameOver: false,
  backToBack: false,
  promptFlags: {
    moved: false,
    rotated: false,
    hardDropped: false,
    held: false,
    cleared: false,
  },
};

function createEmptyBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function makePiece(type) {
  const rotations = SHAPES[type];
  return {
    type,
    rotation: 0,
    rotations,
    matrix: rotations[0],
    x: Math.floor(COLS / 2) - Math.ceil(rotations[0][0].length / 2),
    y: 0,
  };
}

function refillBag() {
  const fresh = ["I", "O", "T", "S", "Z", "J", "L"];
  for (let i = fresh.length - 1; i > 0; i -= 1) {
    const swapIndex = Math.floor(Math.random() * (i + 1));
    [fresh[i], fresh[swapIndex]] = [fresh[swapIndex], fresh[i]];
  }
  state.bag.push(...fresh);
}

function peekQueue(count) {
  while (state.bag.length < count) {
    refillBag();
  }
  return state.bag.slice(0, count);
}

function nextType() {
  if (!state.bag.length) {
    refillBag();
  }
  return state.bag.shift();
}

function collide(piece, x = piece.x, y = piece.y, matrix = piece.matrix) {
  for (let row = 0; row < matrix.length; row += 1) {
    for (let col = 0; col < matrix[row].length; col += 1) {
      if (!matrix[row][col]) {
        continue;
      }
      const nextX = x + col;
      const nextY = y + row;
      if (nextX < 0 || nextX >= COLS || nextY >= ROWS) {
        return true;
      }
      if (nextY >= 0 && state.board[nextY][nextX]) {
        return true;
      }
    }
  }
  return false;
}

function spawnPiece() {
  const piece = makePiece(nextType());
  piece.y = -1;
  if (collide(piece, piece.x, piece.y, piece.matrix)) {
    state.gameOver = true;
    setOverlay("Shift failed", "The stack touched the intake. Press restart to run it back.");
  } else {
    state.active = piece;
    state.holdLocked = false;
    state.grounded = false;
    state.lockTimer = 0;
  }
}

function lockPiece() {
  const { active } = state;
  for (let row = 0; row < active.matrix.length; row += 1) {
    for (let col = 0; col < active.matrix[row].length; col += 1) {
      if (!active.matrix[row][col]) {
        continue;
      }
      const boardX = active.x + col;
      const boardY = active.y + row;
      if (boardY >= 0) {
        state.board[boardY][boardX] = active.type;
      }
    }
  }
  clearLines();
  spawnPiece();
}

function clearLines() {
  let cleared = 0;
  for (let row = ROWS - 1; row >= 0; row -= 1) {
    if (state.board[row].every(Boolean)) {
      state.board.splice(row, 1);
      state.board.unshift(Array(COLS).fill(null));
      cleared += 1;
      row += 1;
    }
  }

  if (!cleared) {
    state.backToBack = false;
    return;
  }

  state.promptFlags.cleared = true;
  state.lines += cleared;
  const difficultClear = cleared === 4;
  const scoreBase = LINE_SCORES[cleared] * state.level;
  const bonus = difficultClear && state.backToBack ? Math.floor(scoreBase * 0.5) : 0;
  state.score += scoreBase + bonus;
  state.backToBack = difficultClear;
  state.level = Math.floor(state.lines / 10) + 1;
}

function move(dx) {
  if (state.gameOver || state.paused) {
    return;
  }
  if (!collide(state.active, state.active.x + dx, state.active.y)) {
    state.active.x += dx;
    state.promptFlags.moved = true;
    if (state.grounded) {
      state.lockTimer = 0;
    }
  }
}

function rotate(direction) {
  if (state.gameOver || state.paused) {
    return;
  }

  const rotations = state.active.rotations;
  const nextRotation =
    (state.active.rotation + direction + rotations.length) % rotations.length;
  const nextMatrix = rotations[nextRotation];
  const kicks = [0, -1, 1, -2, 2];

  for (const offset of kicks) {
    if (!collide(state.active, state.active.x + offset, state.active.y, nextMatrix)) {
      state.active.rotation = nextRotation;
      state.active.matrix = nextMatrix;
      state.active.x += offset;
      state.promptFlags.rotated = true;
      if (state.grounded) {
        state.lockTimer = 0;
      }
      return;
    }
  }
}

function softDrop() {
  if (state.gameOver || state.paused) {
    return;
  }
  if (!collide(state.active, state.active.x, state.active.y + 1)) {
    state.active.y += 1;
    state.score += 1;
    return;
  }
  if (!state.grounded) {
    state.grounded = true;
    state.lockTimer = 0;
  }
}

function hardDrop() {
  if (state.gameOver || state.paused) {
    return;
  }
  let distance = 0;
  while (!collide(state.active, state.active.x, state.active.y + 1)) {
    state.active.y += 1;
    distance += 1;
  }
  state.score += distance * 2;
  state.promptFlags.hardDropped = true;
  lockPiece();
}

function holdPiece() {
  if (state.gameOver || state.paused || state.holdLocked) {
    return;
  }
  const current = state.active.type;
  if (!state.hold) {
    state.hold = current;
    spawnPiece();
  } else {
    const swap = state.hold;
    state.hold = current;
    state.active = makePiece(swap);
    state.active.y = -1;
    if (collide(state.active, state.active.x, state.active.y)) {
      state.gameOver = true;
      setOverlay("Shift failed", "Hold pushed the stack into the intake. Restart to try again.");
    }
  }
  state.promptFlags.held = true;
  state.holdLocked = true;
}

function getGhostY() {
  let ghostY = state.active.y;
  while (!collide(state.active, state.active.x, ghostY + 1, state.active.matrix)) {
    ghostY += 1;
  }
  return ghostY;
}

function drawCell(ctx, x, y, color, size) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.fillRect(x + 2, y + 2, size - 4, 5);
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
}

function drawBoard() {
  boardCtx.clearRect(0, 0, boardCanvas.width, boardCanvas.height);

  for (let row = ROWS - VISIBLE_ROWS; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const drawX = col * CELL;
      const drawY = (row - (ROWS - VISIBLE_ROWS)) * CELL;
      boardCtx.strokeStyle = COLORS.grid;
      boardCtx.strokeRect(drawX + 0.5, drawY + 0.5, CELL - 1, CELL - 1);
      const cell = state.board[row][col];
      if (cell) {
        drawCell(boardCtx, drawX, drawY, COLORS[cell], CELL);
      }
    }
  }

  if (!state.active) {
    return;
  }

  const ghostY = getGhostY();
  drawMatrix(state.active.matrix, state.active.x, ghostY, COLORS.ghost);
  drawMatrix(state.active.matrix, state.active.x, state.active.y, COLORS[state.active.type]);
}

function drawMatrix(matrix, offsetX, offsetY, color) {
  for (let row = 0; row < matrix.length; row += 1) {
    for (let col = 0; col < matrix[row].length; col += 1) {
      if (!matrix[row][col]) {
        continue;
      }
      const boardY = offsetY + row;
      if (boardY < ROWS - VISIBLE_ROWS || boardY < 0) {
        continue;
      }
      const drawX = (offsetX + col) * CELL;
      const drawY = (boardY - (ROWS - VISIBLE_ROWS)) * CELL;
      drawCell(boardCtx, drawX, drawY, color, CELL);
    }
  }
}

function drawMiniPiece(ctx, type, yOffset) {
  const matrix = SHAPES[type][0];
  const cell = 20;
  const width = matrix[0].length * cell;
  const startX = Math.floor((ctx.canvas.width - width) / 2);

  for (let row = 0; row < matrix.length; row += 1) {
    for (let col = 0; col < matrix[row].length; col += 1) {
      if (matrix[row][col]) {
        drawCell(ctx, startX + col * cell, yOffset + row * cell, COLORS[type], cell);
      }
    }
  }
}

function drawSidePanels() {
  holdCtx.clearRect(0, 0, holdCanvas.width, holdCanvas.height);
  if (state.hold) {
    drawMiniPiece(holdCtx, state.hold, 18);
  }

  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const queue = peekQueue(5);
  queue.forEach((type, index) => drawMiniPiece(nextCtx, type, 12 + index * 58));
}

function getPromptText() {
  if (!state.promptFlags.moved || !state.promptFlags.rotated) {
    return "Arrow keys move. `X` or Up rotates. Keep the stack below the warning stripe.";
  }
  if (!state.promptFlags.hardDropped) {
    return "Space hard drops when the ghost line shows a clean landing.";
  }
  if (state.lines >= 4 && !state.promptFlags.held) {
    return "Press C to hold a bad fit, but only once until the current piece locks.";
  }
  if (!state.promptFlags.cleared) {
    return "Build a flat well. Singles stabilize, doubles and triples buy time, four-line clears score big.";
  }
  if (state.lines >= 8 && state.level < 3) {
    return "Speed is rising soon. Leave one lane clean so long pieces still cash out.";
  }
  return "Night shift is live. Protect the ceiling, read the ghost, and keep the stack clean.";
}

function updateHud() {
  scoreEl.textContent = String(state.score);
  linesEl.textContent = String(state.lines);
  levelEl.textContent = String(state.level);
  goalEl.textContent = String(state.level * 10);
  promptEl.textContent = getPromptText();
}

function getDropInterval() {
  return Math.max(80, 900 - (state.level - 1) * 75);
}

function setOverlay(title, text) {
  overlayTitleEl.textContent = title;
  overlayTextEl.textContent = text;
  overlayEl.classList.remove("hidden");
}

function hideOverlay() {
  overlayEl.classList.add("hidden");
}

function update(delta) {
  if (state.paused || state.gameOver) {
    return;
  }

  state.dropTimer += delta;
  if (state.dropTimer >= getDropInterval()) {
    state.dropTimer = 0;
    if (!collide(state.active, state.active.x, state.active.y + 1)) {
      state.active.y += 1;
      state.grounded = false;
    } else {
      state.grounded = true;
    }
  }

  if (collide(state.active, state.active.x, state.active.y + 1)) {
    state.grounded = true;
    state.lockTimer += delta;
    if (state.lockTimer >= 500) {
      lockPiece();
      state.dropTimer = 0;
    }
  } else {
    state.grounded = false;
    state.lockTimer = 0;
  }
}

function render() {
  drawBoard();
  drawSidePanels();
  updateHud();
}

function resetGame() {
  state.board = createEmptyBoard();
  state.bag = [];
  state.active = null;
  state.hold = null;
  state.holdLocked = false;
  state.score = 0;
  state.lines = 0;
  state.level = 1;
  state.dropTimer = 0;
  state.lockTimer = 0;
  state.grounded = false;
  state.paused = false;
  state.gameOver = false;
  state.backToBack = false;
  state.promptFlags = {
    moved: false,
    rotated: false,
    hardDropped: false,
    held: false,
    cleared: false,
  };
  hideOverlay();
  refillBag();
  spawnPiece();
  render();
}

document.addEventListener("keydown", (event) => {
  if (event.repeat && !["ArrowDown"].includes(event.key)) {
    return;
  }

  if (event.key === "p" || event.key === "P") {
    if (state.gameOver) {
      return;
    }
    state.paused = !state.paused;
    if (state.paused) {
      setOverlay("Paused", "Press P to resume the shift.");
    } else {
      hideOverlay();
    }
    return;
  }

  if (state.paused || state.gameOver) {
    return;
  }

  switch (event.key) {
    case "ArrowLeft":
      move(-1);
      break;
    case "ArrowRight":
      move(1);
      break;
    case "ArrowDown":
      softDrop();
      break;
    case "ArrowUp":
    case "x":
    case "X":
      rotate(1);
      break;
    case "z":
    case "Z":
      rotate(-1);
      break;
    case " ":
      event.preventDefault();
      hardDrop();
      break;
    case "c":
    case "C":
      holdPiece();
      break;
    default:
      break;
  }
});

restartButton.addEventListener("click", resetGame);

let lastTime = performance.now();
function frame(now) {
  const delta = now - lastTime;
  lastTime = now;
  update(delta);
  render();
  requestAnimationFrame(frame);
}

resetGame();
requestAnimationFrame(frame);
