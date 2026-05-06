const COLS = 10;
const ROWS = 20;
const BLOCK = 20;

const COLORS = {
  0: "#000000",
  1: "#00ffff",
  2: "#ffff00",
  3: "#b54cff",
  4: "#00ff66",
  5: "#ff4d4d",
  6: "#4d7dff",
  7: "#ffab40",
};

const SHAPES = [
  {
    colorId: 1,
    rotations: [
      [
        [0, 0, 0, 0],
        [1, 1, 1, 1],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ],
      [
        [0, 1, 0, 0],
        [0, 1, 0, 0],
        [0, 1, 0, 0],
        [0, 1, 0, 0],
      ],
    ],
  },
  {
    colorId: 2,
    rotations: [
      [
        [2, 2],
        [2, 2],
      ],
    ],
  },
  {
    colorId: 3,
    rotations: [
      [
        [0, 3, 0],
        [3, 3, 3],
        [0, 0, 0],
      ],
      [
        [0, 3, 0],
        [0, 3, 3],
        [0, 3, 0],
      ],
      [
        [0, 0, 0],
        [3, 3, 3],
        [0, 3, 0],
      ],
      [
        [0, 3, 0],
        [3, 3, 0],
        [0, 3, 0],
      ],
    ],
  },
  {
    colorId: 4,
    rotations: [
      [
        [0, 4, 4],
        [4, 4, 0],
        [0, 0, 0],
      ],
      [
        [0, 4, 0],
        [0, 4, 4],
        [0, 0, 4],
      ],
    ],
  },
  {
    colorId: 5,
    rotations: [
      [
        [5, 5, 0],
        [0, 5, 5],
        [0, 0, 0],
      ],
      [
        [0, 0, 5],
        [0, 5, 5],
        [0, 5, 0],
      ],
    ],
  },
  {
    colorId: 6,
    rotations: [
      [
        [6, 0, 0],
        [6, 6, 6],
        [0, 0, 0],
      ],
      [
        [0, 6, 6],
        [0, 6, 0],
        [0, 6, 0],
      ],
      [
        [0, 0, 0],
        [6, 6, 6],
        [0, 0, 6],
      ],
      [
        [0, 6, 0],
        [0, 6, 0],
        [6, 6, 0],
      ],
    ],
  },
  {
    colorId: 7,
    rotations: [
      [
        [0, 0, 7],
        [7, 7, 7],
        [0, 0, 0],
      ],
      [
        [0, 7, 0],
        [0, 7, 0],
        [0, 7, 7],
      ],
      [
        [0, 0, 0],
        [7, 7, 7],
        [7, 0, 0],
      ],
      [
        [7, 7, 0],
        [0, 7, 0],
        [0, 7, 0],
      ],
    ],
  },
];

const canvas = document.getElementById("tetrisCanvas");
const ctx = canvas.getContext("2d");
const scoreDisplay = document.getElementById("score-display");
const levelDisplay = document.getElementById("level-display");
const linesDisplay = document.getElementById("lines-display");
const nextPieceDisplay = document.getElementById("next-piece-display");
const startButton = document.getElementById("startButton");

const nextCanvas = document.createElement("canvas");
nextCanvas.width = 100;
nextCanvas.height = 100;
nextPieceDisplay.appendChild(nextCanvas);
const nextCtx = nextCanvas.getContext("2d");

let board = [];
let currentPiece = null;
let nextPiece = null;
let bag = [];
let score = 0;
let lines = 0;
let level = 1;
let dropAccumulator = 0;
let lastFrame = 0;
let running = false;
let paused = false;
let gameOver = false;
let started = false;
let clearBanner = "";
let clearBannerTimer = 0;

function createBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
}

function refillBag() {
  const entries = SHAPES.map((shape, index) => index);
  while (entries.length) {
    const pick = Math.floor(Math.random() * entries.length);
    bag.push(entries.splice(pick, 1)[0]);
  }
}

function cloneMatrix(matrix) {
  return matrix.map((row) => row.slice());
}

function makePiece(index) {
  const shape = SHAPES[index];
  const matrix = cloneMatrix(shape.rotations[0]);
  return {
    index,
    rotation: 0,
    matrix,
    x: Math.floor((COLS - matrix[0].length) / 2),
    y: -1,
  };
}

function pullPiece() {
  if (!bag.length) {
    refillBag();
  }
  return makePiece(bag.pop());
}

function resetGame() {
  board = createBoard();
  bag = [];
  score = 0;
  lines = 0;
  level = 1;
  dropAccumulator = 0;
  running = true;
  paused = false;
  gameOver = false;
  started = true;
  currentPiece = pullPiece();
  nextPiece = pullPiece();
  updateHud();
  updateButton();
  draw();
}

function updateHud() {
  scoreDisplay.textContent = `${score}`;
  levelDisplay.textContent = `1-${Math.min(4, ((level - 1) % 4) + 1)}`;
  linesDisplay.textContent = `${lines}`;
}

function updateButton() {
  if (!started || gameOver) {
    startButton.textContent = started ? "Restart Game" : "Start Game";
    return;
  }
  startButton.textContent = paused ? "Resume Game" : "Pause Game";
}

function collision(piece, offsetX = 0, offsetY = 0, matrix = piece.matrix) {
  for (let y = 0; y < matrix.length; y += 1) {
    for (let x = 0; x < matrix[y].length; x += 1) {
      if (!matrix[y][x]) {
        continue;
      }
      const boardX = piece.x + x + offsetX;
      const boardY = piece.y + y + offsetY;
      if (boardX < 0 || boardX >= COLS || boardY >= ROWS) {
        return true;
      }
      if (boardY >= 0 && board[boardY][boardX]) {
        return true;
      }
    }
  }
  return false;
}

function mergePiece() {
  currentPiece.matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (!value) {
        return;
      }
      const boardY = currentPiece.y + y;
      if (boardY < 0) {
        gameOver = true;
        running = false;
        updateButton();
        return;
      }
      board[boardY][currentPiece.x + x] = value;
    });
  });
}

function clearLines() {
  let cleared = 0;
  for (let y = ROWS - 1; y >= 0; y -= 1) {
    if (board[y].every(Boolean)) {
      board.splice(y, 1);
      board.unshift(Array(COLS).fill(0));
      cleared += 1;
      y += 1;
    }
  }

  if (!cleared) {
    return;
  }

  lines += cleared;
  level = Math.floor(lines / 10) + 1;
  const lineScores = [0, 100, 300, 500, 800];
  score += lineScores[cleared] * level;
  const clearLabels = ["", "COIN CLEAR!", "SHELL COMBO!", "STAR COMBO!", "CASTLE CLEAR!"];
  clearBanner = clearLabels[cleared] ?? "WORLD CLEAR!";
  clearBannerTimer = 1100;
  updateHud();
}

function spawnNextPiece() {
  currentPiece = nextPiece;
  currentPiece.x = Math.floor((COLS - currentPiece.matrix[0].length) / 2);
  currentPiece.y = -1;
  nextPiece = pullPiece();

  if (collision(currentPiece)) {
    gameOver = true;
    running = false;
    updateButton();
  }
}

function lockPiece() {
  mergePiece();
  if (gameOver) {
    return;
  }
  clearLines();
  spawnNextPiece();
}

function tryMove(dx, dy) {
  if (!currentPiece || paused || gameOver) {
    return false;
  }
  if (!collision(currentPiece, dx, dy)) {
    currentPiece.x += dx;
    currentPiece.y += dy;
    return true;
  }
  return false;
}

function rotatePiece(direction) {
  if (!currentPiece || paused || gameOver) {
    return;
  }
  const rotations = SHAPES[currentPiece.index].rotations;
  const nextRotation =
    (currentPiece.rotation + direction + rotations.length) % rotations.length;
  const candidate = cloneMatrix(rotations[nextRotation]);
  const kicks = [0, -1, 1, -2, 2];

  for (const kick of kicks) {
    if (!collision(currentPiece, kick, 0, candidate)) {
      currentPiece.rotation = nextRotation;
      currentPiece.matrix = candidate;
      currentPiece.x += kick;
      return;
    }
  }
}

function hardDrop() {
  if (!currentPiece || paused || gameOver) {
    return;
  }
  let distance = 0;
  while (tryMove(0, 1)) {
    distance += 1;
  }
  score += distance * 2;
  updateHud();
  lockPiece();
}

function softDrop() {
  if (tryMove(0, 1)) {
    score += 1;
    updateHud();
    return;
  }
  lockPiece();
}

function getDropDelay() {
  return Math.max(90, 900 - (level - 1) * 70);
}

function drawBackdrop() {
  const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
  sky.addColorStop(0, "#5bc0ff");
  sky.addColorStop(0.72, "#d7f4ff");
  sky.addColorStop(0.72, "#5dc051");
  sky.addColorStop(0.82, "#5dc051");
  sky.addColorStop(0.82, "#905128");
  sky.addColorStop(1, "#905128");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.fillRect(18, 38, 34, 12);
  ctx.fillRect(30, 28, 22, 28);
  ctx.fillRect(124, 62, 44, 14);
  ctx.fillRect(136, 48, 24, 32);

  ctx.fillStyle = "#46a83e";
  ctx.fillRect(0, canvas.height - 68, canvas.width, 20);
  ctx.fillStyle = "#8e4f27";
  ctx.fillRect(0, canvas.height - 48, canvas.width, 48);
}

function drawCell(targetCtx, x, y, value, size) {
  const px = x * size;
  const py = y * size;
  targetCtx.fillStyle = COLORS[value];
  targetCtx.fillRect(px, py, size, size);
  targetCtx.fillStyle = "rgba(255,255,255,0.18)";
  targetCtx.fillRect(px + 2, py + 2, size - 4, 4);
  targetCtx.fillStyle = "rgba(0,0,0,0.16)";
  targetCtx.fillRect(px + 2, py + size - 6, size - 4, 4);
  targetCtx.fillStyle = "rgba(255,255,255,0.14)";
  targetCtx.fillRect(px + 6, py + 6, 4, 4);
  targetCtx.strokeStyle = "rgba(60,29,13,0.28)";
  targetCtx.strokeRect(px + 0.5, py + 0.5, size - 1, size - 1);
}

function drawBoard() {
  drawBackdrop();
  ctx.fillStyle = "rgba(14, 40, 66, 0.84)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      if (board[y][x]) {
        drawCell(ctx, x, y, board[y][x], BLOCK);
      } else {
        ctx.strokeStyle = "rgba(255,255,255,0.10)";
        ctx.strokeRect(x * BLOCK + 0.5, y * BLOCK + 0.5, BLOCK - 1, BLOCK - 1);
      }
    }
  }
}

function getGhostY() {
  let ghostY = currentPiece.y;
  while (!collision(currentPiece, 0, ghostY - currentPiece.y + 1)) {
    ghostY += 1;
  }
  return ghostY;
}

function drawPiece(piece, ghost = false) {
  piece.matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (!value) {
        return;
      }
      const px = piece.x + x;
      const py = piece.y + y;
      if (py < 0) {
        return;
      }
      if (ghost) {
        ctx.fillStyle = "rgba(255,255,255,0.12)";
        ctx.fillRect(px * BLOCK, py * BLOCK, BLOCK, BLOCK);
        ctx.strokeStyle = "rgba(255,255,255,0.25)";
        ctx.strokeRect(px * BLOCK + 0.5, py * BLOCK + 0.5, BLOCK - 1, BLOCK - 1);
        return;
      }
      drawCell(ctx, px, py, value, BLOCK);
    });
  });
}

function drawNextPiece() {
  nextCtx.fillStyle = "#fff6db";
  nextCtx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
  if (!nextPiece) {
    return;
  }

  const matrix = nextPiece.matrix;
  const cell = 18;
  const width = matrix[0].length * cell;
  const height = matrix.length * cell;
  const offsetX = Math.floor((nextCanvas.width - width) / 2);
  const offsetY = Math.floor((nextCanvas.height - height) / 2);

  matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (!value) {
        return;
      }
      nextCtx.fillStyle = COLORS[value];
      nextCtx.fillRect(offsetX + x * cell, offsetY + y * cell, cell, cell);
      nextCtx.strokeStyle = "rgba(255,255,255,0.18)";
      nextCtx.strokeRect(
        offsetX + x * cell + 0.5,
        offsetY + y * cell + 0.5,
        cell - 1,
        cell - 1
      );
    });
  });
}

function drawOverlay(title, detail, footer) {
  ctx.fillStyle = "rgba(8, 24, 42, 0.82)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = "center";
  ctx.fillStyle = "#fff2bf";
  ctx.font = "bold 20px 'Trebuchet MS', Verdana, sans-serif";
  ctx.fillText(title, canvas.width / 2, 150);
  ctx.font = "bold 11px 'Trebuchet MS', Verdana, sans-serif";
  ctx.fillStyle = "#f6f7ff";
  ctx.fillText(detail, canvas.width / 2, 205);
  ctx.fillStyle = "#9cfb74";
  ctx.fillText(footer, canvas.width / 2, 250);
}

function drawBanner() {
  if (!clearBanner || clearBannerTimer <= 0) {
    return;
  }
  ctx.save();
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
  ctx.fillRect(24, 96, canvas.width - 48, 40);
  ctx.strokeStyle = "#fff4b8";
  ctx.lineWidth = 3;
  ctx.strokeRect(25.5, 97.5, canvas.width - 51, 37);
  ctx.font = "bold 16px 'Trebuchet MS', Verdana, sans-serif";
  ctx.fillStyle = "#fff4b8";
  ctx.fillText(clearBanner, canvas.width / 2, 122);
  ctx.restore();
}

function draw() {
  drawBoard();
  drawNextPiece();

  if (currentPiece) {
    const ghost = { ...currentPiece, y: getGhostY() };
    drawPiece(ghost, true);
    drawPiece(currentPiece);
  }

  drawBanner();

  if (!started) {
    drawOverlay("WORLD 1-1", "Stack bricks. Clear rows.", "Press Start");
  } else if (paused) {
    drawOverlay("PAUSED", "Mario waiting at flagpole.", "Press P or button");
  } else if (gameOver) {
    drawOverlay("TIME UP", `${score} coins banked`, "Press R or Restart");
  }
}

function togglePause() {
  if (!started || gameOver) {
    return;
  }
  paused = !paused;
  updateButton();
  draw();
}

function step(delta) {
  clearBannerTimer = Math.max(0, clearBannerTimer - delta);
  if (clearBannerTimer === 0) {
    clearBanner = "";
  }

  if (running && !paused && !gameOver) {
    dropAccumulator += delta;
    const delay = getDropDelay();
    while (dropAccumulator >= delay) {
      dropAccumulator -= delay;
      if (!tryMove(0, 1)) {
        lockPiece();
        break;
      }
    }
  }

  draw();
  requestAnimationFrame(loop);
}

function loop(timestamp) {
  const delta = lastFrame ? timestamp - lastFrame : 0;
  lastFrame = timestamp;
  step(delta);
}

document.addEventListener("keydown", (event) => {
  if (event.code === "Enter" && !started) {
    resetGame();
    return;
  }

  if (event.code === "KeyR") {
    resetGame();
    return;
  }

  if (!started) {
    return;
  }

  if (event.code === "KeyP") {
    togglePause();
    return;
  }

  if (paused || gameOver) {
    return;
  }

  if (["ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp", "Space", "KeyZ"].includes(event.code)) {
    event.preventDefault();
  }

  switch (event.code) {
    case "ArrowLeft":
      tryMove(-1, 0);
      break;
    case "ArrowRight":
      tryMove(1, 0);
      break;
    case "ArrowDown":
      softDrop();
      break;
    case "ArrowUp":
      rotatePiece(1);
      break;
    case "KeyZ":
      rotatePiece(-1);
      break;
    case "Space":
      hardDrop();
      break;
    default:
      break;
  }

  draw();
});

startButton.addEventListener("click", () => {
  if (!started || gameOver) {
    resetGame();
    return;
  }
  togglePause();
});

board = createBoard();
updateHud();
updateButton();
draw();
requestAnimationFrame(loop);
