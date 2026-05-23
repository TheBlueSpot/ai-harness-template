(function () {
  const COLS = 8;
  const ROWS = 16;
  const CELL = 48;
  const COLORS = ["red", "blue", "yellow"];
  const COLOR_HEX = {
    red: "#fb7185",
    blue: "#38bdf8",
    yellow: "#fbbf24",
  };
  const LEVELS = 3;
  const VIRUS_BASE = 10;
  const KEY_REPEAT = 120;
  const DROP_BASE = 760;
  const ORIENTATIONS = ["right", "down", "left", "up"];

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const nextCanvas = document.getElementById("nextCapsule");
  const nextCtx = nextCanvas.getContext("2d");
  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlayTitle");
  const overlayText = document.getElementById("overlayText");
  const overlayButton = document.getElementById("overlayButton");
  const levelValue = document.getElementById("levelValue");
  const scoreValue = document.getElementById("scoreValue");
  const virusValue = document.getElementById("virusValue");
  const chainValue = document.getElementById("chainValue");
  const statusLine = document.getElementById("statusLine");

  const state = {
    mode: "menu",
    level: 1,
    score: 0,
    chain: 0,
    viruses: 0,
    board: createBoard(),
    current: null,
    next: createCapsule(),
    dropTimer: 0,
    lockDelay: 0,
    inputLocks: new Map(),
    message: "",
    flashTimer: 0,
  };

  const keyState = new Set();
  let lastTime = performance.now();

  function createBoard() {
    return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  }

  function clonePart(color, pairId, side) {
    return { type: "capsule", color, pairId, side };
  }

  function createCapsule() {
    return {
      pairId: Math.random().toString(36).slice(2),
      x: 3,
      y: 0,
      orientation: "right",
      parts: [
        { color: COLORS[Math.floor(Math.random() * COLORS.length)] },
        { color: COLORS[Math.floor(Math.random() * COLORS.length)] },
      ],
    };
  }

  function getPieceCells(piece, x = piece.x, y = piece.y, orientation = piece.orientation) {
    if (orientation === "right") {
      return [
        { x, y, color: piece.parts[0].color, side: "left" },
        { x: x + 1, y, color: piece.parts[1].color, side: "right" },
      ];
    }
    if (orientation === "down") {
      return [
        { x, y, color: piece.parts[0].color, side: "top" },
        { x, y: y + 1, color: piece.parts[1].color, side: "bottom" },
      ];
    }
    if (orientation === "left") {
      return [
        { x, y, color: piece.parts[0].color, side: "right" },
        { x: x - 1, y, color: piece.parts[1].color, side: "left" },
      ];
    }
    return [
      { x, y, color: piece.parts[0].color, side: "bottom" },
      { x, y: y - 1, color: piece.parts[1].color, side: "top" },
    ];
  }

  function canPlacePiece(piece, x = piece.x, y = piece.y, orientation = piece.orientation) {
    return getPieceCells(piece, x, y, orientation).every((cell) => {
      if (cell.x < 0 || cell.x >= COLS || cell.y < 0 || cell.y >= ROWS) {
        return false;
      }
      return !state.board[cell.y][cell.x];
    });
  }

  function randomColor() {
    return COLORS[Math.floor(Math.random() * COLORS.length)];
  }

  function wouldCreateImmediateMatch(board, x, y, color) {
    const sample = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    for (const [dx, dy] of sample) {
      let run = 1;
      let tx = x + dx;
      let ty = y + dy;
      while (tx >= 0 && tx < COLS && ty >= 0 && ty < ROWS && board[ty][tx] && board[ty][tx].color === color) {
        run += 1;
        tx += dx;
        ty += dy;
      }
      tx = x - dx;
      ty = y - dy;
      while (tx >= 0 && tx < COLS && ty >= 0 && ty < ROWS && board[ty][tx] && board[ty][tx].color === color) {
        run += 1;
        tx -= dx;
        ty -= dy;
      }
      if (run >= 4) {
        return true;
      }
    }
    return false;
  }

  function buildLevel(level) {
    state.board = createBoard();
    state.current = null;
    state.dropTimer = 0;
    state.lockDelay = 0;
    state.chain = 0;
    state.message = "";
    state.flashTimer = 0;

    const virusTarget = VIRUS_BASE + (level - 1) * 4;
    let placed = 0;
    let attempts = 0;

    while (placed < virusTarget && attempts < 4000) {
      attempts += 1;
      const x = Math.floor(Math.random() * COLS);
      const y = Math.floor(6 + Math.random() * 10);
      if (state.board[y][x]) {
        continue;
      }
      const color = randomColor();
      const cell = { type: "virus", color };
      state.board[y][x] = cell;
      if (wouldCreateImmediateMatch(state.board, x, y, color)) {
        state.board[y][x] = null;
        continue;
      }
      placed += 1;
    }

    state.viruses = placed;
    state.next = createCapsule();
    spawnCapsule();
    syncHud();
  }

  function spawnCapsule() {
    state.current = state.next;
    state.current.x = 3;
    state.current.y = 0;
    state.current.orientation = "right";
    state.current.pairId = Math.random().toString(36).slice(2);
    state.next = createCapsule();
    if (!canPlacePiece(state.current)) {
      loseRun("Bottle jammed. The stack reached the spawn row.");
    }
  }

  function startRun() {
    state.mode = "playing";
    state.level = 1;
    state.score = 0;
    buildLevel(state.level);
    hideOverlay();
  }

  function restartRun() {
    startRun();
  }

  function showOverlay(title, text, buttonText) {
    overlayTitle.textContent = title;
    overlayText.textContent = text;
    overlayButton.textContent = buttonText;
    overlay.classList.remove("hidden");
  }

  function hideOverlay() {
    overlay.classList.add("hidden");
  }

  function syncHud() {
    levelValue.textContent = String(state.level);
    scoreValue.textContent = String(state.score);
    virusValue.textContent = String(state.viruses);
    chainValue.textContent = String(state.chain);
    statusLine.textContent = state.message;
  }

  function movePiece(dx) {
    if (!state.current || state.mode !== "playing") {
      return;
    }
    if (canPlacePiece(state.current, state.current.x + dx, state.current.y, state.current.orientation)) {
      state.current.x += dx;
    }
  }

  function rotatePiece(direction) {
    if (!state.current || state.mode !== "playing") {
      return;
    }
    const currentIndex = ORIENTATIONS.indexOf(state.current.orientation);
    const targetOrientation = ORIENTATIONS[(currentIndex + direction + ORIENTATIONS.length) % ORIENTATIONS.length];
    const kicks = [
      [0, 0],
      [-1, 0],
      [1, 0],
      [-2, 0],
      [2, 0],
      [0, 1],
    ];

    for (const [kickX, kickY] of kicks) {
      const targetX = state.current.x + kickX;
      const targetY = state.current.y + kickY;
      if (canPlacePiece(state.current, targetX, targetY, targetOrientation)) {
        state.current.x = targetX;
        state.current.y = targetY;
        state.current.orientation = targetOrientation;
        return;
      }
    }
  }

  function hardDrop() {
    if (!state.current || state.mode !== "playing") {
      return;
    }
    while (canPlacePiece(state.current, state.current.x, state.current.y + 1, state.current.orientation)) {
      state.current.y += 1;
      state.score += 2;
    }
    lockCurrent();
    syncHud();
  }

  function lockCurrent() {
    if (!state.current) {
      return;
    }
    const cells = getPieceCells(state.current);
    for (const cell of cells) {
      state.board[cell.y][cell.x] = clonePart(cell.color, state.current.pairId, cell.side);
    }
    state.current = null;
    resolveBoard();
  }

  function resolveBoard() {
    let chain = 0;
    while (true) {
      const matches = findMatches();
      if (matches.length === 0) {
        break;
      }
      chain += 1;
      state.chain = chain;
      clearMatches(matches, chain);
      applyGravity();
    }

    if (state.viruses <= 0) {
      if (state.level >= LEVELS) {
        winRun();
        return;
      }
      state.level += 1;
      buildLevel(state.level);
      state.message = `Bottle cleared. Level ${state.level} ready.`;
      syncHud();
      return;
    }

    state.message = chain > 1 ? `Chain x${chain}! Keep the bottle moving.` : "";
    spawnCapsule();
    syncHud();
  }

  function findMatches() {
    const marked = new Set();

    for (let y = 0; y < ROWS; y += 1) {
      let run = [];
      for (let x = 0; x <= COLS; x += 1) {
        const cell = x < COLS ? state.board[y][x] : null;
        if (cell && (run.length === 0 || run[0].color === cell.color)) {
          run.push({ x, y, color: cell.color });
        } else {
          if (run.length >= 4) {
            run.forEach((item) => marked.add(`${item.x},${item.y}`));
          }
          run = cell ? [{ x, y, color: cell.color }] : [];
        }
      }
    }

    for (let x = 0; x < COLS; x += 1) {
      let run = [];
      for (let y = 0; y <= ROWS; y += 1) {
        const cell = y < ROWS ? state.board[y][x] : null;
        if (cell && (run.length === 0 || run[0].color === cell.color)) {
          run.push({ x, y, color: cell.color });
        } else {
          if (run.length >= 4) {
            run.forEach((item) => marked.add(`${item.x},${item.y}`));
          }
          run = cell ? [{ x, y, color: cell.color }] : [];
        }
      }
    }

    return Array.from(marked).map((key) => {
      const [x, y] = key.split(",").map(Number);
      return { x, y };
    });
  }

  function clearMatches(matches, chain) {
    let clearedViruses = 0;
    for (const { x, y } of matches) {
      const cell = state.board[y][x];
      if (!cell) {
        continue;
      }
      if (cell.type === "virus") {
        clearedViruses += 1;
      }
      state.board[y][x] = null;
    }
    state.viruses -= clearedViruses;
    state.score += matches.length * 100 * chain + clearedViruses * 150;
    state.flashTimer = 0.18;
    detachBrokenLinks();
    syncHud();
  }

  function detachBrokenLinks() {
    const pairCounts = new Map();
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const cell = state.board[y][x];
        if (cell && cell.type === "capsule") {
          pairCounts.set(cell.pairId, (pairCounts.get(cell.pairId) || 0) + 1);
        }
      }
    }

    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const cell = state.board[y][x];
        if (cell && cell.type === "capsule" && pairCounts.get(cell.pairId) < 2) {
          cell.pairId = null;
          cell.side = "solo";
        }
      }
    }
  }

  function applyGravity() {
    let moved = true;
    while (moved) {
      moved = false;

      for (let y = ROWS - 2; y >= 0; y -= 1) {
        for (let x = 0; x < COLS; x += 1) {
          const cell = state.board[y][x];
          if (!cell || cell.type !== "capsule") {
            continue;
          }

          if (cell.pairId) {
            const partner = findPartner(cell.pairId, x, y);
            if (!partner) {
              cell.pairId = null;
              cell.side = "solo";
              continue;
            }

            if (partner.y < y || (partner.y === y && partner.x < x)) {
              continue;
            }

            if (partner.y === y) {
              if (y + 1 < ROWS && !state.board[y + 1][x] && !state.board[partner.y + 1][partner.x]) {
                state.board[y + 1][x] = cell;
                state.board[partner.y + 1][partner.x] = partner.cell;
                state.board[y][x] = null;
                state.board[partner.y][partner.x] = null;
                moved = true;
              }
            } else if (partner.x === x) {
              const bottomY = Math.max(y, partner.y);
              if (bottomY + 1 < ROWS && !state.board[bottomY + 1][x]) {
                const topY = Math.min(y, partner.y);
                const topCell = state.board[topY][x];
                const bottomCell = state.board[bottomY][x];
                state.board[bottomY + 1][x] = bottomCell;
                state.board[topY + 1][x] = topCell;
                state.board[topY][x] = null;
                moved = true;
              }
            }
          } else if (y + 1 < ROWS && !state.board[y + 1][x]) {
            state.board[y + 1][x] = cell;
            state.board[y][x] = null;
            moved = true;
          }
        }
      }
    }
  }

  function findPartner(pairId, x, y) {
    const checks = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    for (const [dx, dy] of checks) {
      const tx = x + dx;
      const ty = y + dy;
      if (tx < 0 || tx >= COLS || ty < 0 || ty >= ROWS) {
        continue;
      }
      const target = state.board[ty][tx];
      if (target && target.type === "capsule" && target.pairId === pairId) {
        return { x: tx, y: ty, cell: target };
      }
    }
    return null;
  }

  function loseRun(message) {
    state.mode = "lose";
    state.message = message;
    syncHud();
    showOverlay("Bottle Jammed", `${message} Final score: ${state.score}.`, "Restart Run");
  }

  function winRun() {
    state.mode = "win";
    state.message = "All three bottles cleared.";
    syncHud();
    showOverlay("Run Cleared", `You cleared ${LEVELS} escalating bottles for ${state.score} points.`, "Play Again");
  }

  function processInput(now) {
    if (pressed("ArrowLeft", now)) {
      movePiece(-1);
    }
    if (pressed("ArrowRight", now)) {
      movePiece(1);
    }
    if (pressed("ArrowDown", now, 45)) {
      if (state.current && canPlacePiece(state.current, state.current.x, state.current.y + 1, state.current.orientation)) {
        state.current.y += 1;
        state.score += 1;
        syncHud();
      }
    }
    if (pressed("KeyZ", now)) {
      rotatePiece(-1);
    }
    if (pressed("KeyX", now) || pressed("ArrowUp", now)) {
      rotatePiece(1);
    }
    if (pressed("Space", now)) {
      hardDrop();
    }
    if (pressed("Enter", now)) {
      if (state.mode === "menu") {
        startRun();
      } else if (state.mode === "lose" || state.mode === "win") {
        restartRun();
      }
    }
  }

  function pressed(code, now, repeat = KEY_REPEAT) {
    if (!keyState.has(code)) {
      state.inputLocks.delete(code);
      return false;
    }
    const last = state.inputLocks.get(code);
    if (last == null || now - last >= repeat) {
      state.inputLocks.set(code, now);
      return true;
    }
    return false;
  }

  function update(dt, now) {
    processInput(now);
    if (state.flashTimer > 0) {
      state.flashTimer = Math.max(0, state.flashTimer - dt);
    }
    if (state.mode !== "playing" || !state.current) {
      syncHud();
      return;
    }

    state.dropTimer += dt * 1000;
    const dropInterval = Math.max(180, DROP_BASE - (state.level - 1) * 110);

    while (state.dropTimer >= dropInterval) {
      state.dropTimer -= dropInterval;
      if (canPlacePiece(state.current, state.current.x, state.current.y + 1, state.current.orientation)) {
        state.current.y += 1;
      } else {
        lockCurrent();
        break;
      }
    }
    syncHud();
  }

  function renderBoard() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();

    ctx.fillStyle = "#0b1120";
    roundRect(ctx, 18, 18, canvas.width - 36, canvas.height - 36, 28);
    ctx.fill();

    ctx.save();
    ctx.translate(0, 16);

    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const px = 24 + x * CELL;
        const py = 24 + y * CELL;
        ctx.fillStyle = "rgba(148, 163, 184, 0.06)";
        ctx.fillRect(px + 1, py + 1, CELL - 2, CELL - 2);

        const cell = state.board[y][x];
        if (cell) {
          drawCell(ctx, px, py, cell.color, cell.type === "virus");
        }
      }
    }

    if (state.current && state.mode === "playing") {
      for (const cell of getPieceCells(state.current)) {
        drawCell(ctx, 24 + cell.x * CELL, 24 + cell.y * CELL, cell.color, false);
      }
    }

    ctx.restore();

    if (state.flashTimer > 0) {
      ctx.fillStyle = `rgba(255,255,255,${state.flashTimer * 0.35})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    ctx.restore();
  }

  function drawCell(target, px, py, color, virus) {
    const base = COLOR_HEX[color];
    const dark = shade(base, -24);
    const light = shade(base, 36);
    target.save();
    target.translate(px, py);
    target.fillStyle = base;
    roundRect(target, 4, 4, CELL - 8, CELL - 8, 14);
    target.fill();

    target.fillStyle = light;
    roundRect(target, 8, 8, CELL - 24, CELL - 24, 10);
    target.fill();

    target.strokeStyle = dark;
    target.lineWidth = 4;
    roundRect(target, 4, 4, CELL - 8, CELL - 8, 14);
    target.stroke();

    if (virus) {
      target.fillStyle = "#ffffff";
      target.beginPath();
      target.arc(17, 19, 4, 0, Math.PI * 2);
      target.arc(31, 19, 4, 0, Math.PI * 2);
      target.fill();
      target.fillStyle = dark;
      target.beginPath();
      target.arc(17, 19, 1.6, 0, Math.PI * 2);
      target.arc(31, 19, 1.6, 0, Math.PI * 2);
      target.fill();
      target.strokeStyle = dark;
      target.lineWidth = 3;
      target.beginPath();
      target.arc(24, 28, 8, 0.1 * Math.PI, 0.9 * Math.PI);
      target.stroke();
    } else {
      target.fillStyle = "rgba(255,255,255,0.3)";
      target.fillRect(12, 16, CELL - 24, 6);
    }
    target.restore();
  }

  function renderNext() {
    nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
    nextCtx.save();
    nextCtx.translate(0, 4);
    drawPreviewPart(nextCtx, 8, 4, state.next.parts[0].color);
    drawPreviewPart(nextCtx, 48, 4, state.next.parts[1].color);
    nextCtx.restore();
  }

  function drawPreviewPart(target, x, y, color) {
    const base = COLOR_HEX[color];
    target.fillStyle = base;
    roundRect(target, x, y, 36, 36, 12);
    target.fill();
    target.fillStyle = "rgba(255,255,255,0.28)";
    roundRect(target, x + 6, y + 6, 14, 14, 6);
    target.fill();
  }

  function roundRect(target, x, y, width, height, radius) {
    target.beginPath();
    target.moveTo(x + radius, y);
    target.arcTo(x + width, y, x + width, y + height, radius);
    target.arcTo(x + width, y + height, x, y + height, radius);
    target.arcTo(x, y + height, x, y, radius);
    target.arcTo(x, y, x + width, y, radius);
    target.closePath();
  }

  function shade(hex, amount) {
    const clean = hex.replace("#", "");
    const value = parseInt(clean, 16);
    const r = Math.max(0, Math.min(255, (value >> 16) + amount));
    const g = Math.max(0, Math.min(255, ((value >> 8) & 255) + amount));
    const b = Math.max(0, Math.min(255, (value & 255) + amount));
    return `rgb(${r}, ${g}, ${b})`;
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    update(dt, now);
    renderBoard();
    renderNext();
    requestAnimationFrame(frame);
  }

  document.addEventListener("keydown", (event) => {
    keyState.add(event.code);
    if (["ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp", "Space"].includes(event.code)) {
      event.preventDefault();
    }
  });

  document.addEventListener("keyup", (event) => {
    keyState.delete(event.code);
    state.inputLocks.delete(event.code);
  });

  overlayButton.addEventListener("click", () => {
    if (state.mode === "menu") {
      startRun();
    } else {
      restartRun();
    }
  });

  showOverlay("Dr Mario Capsule Cascade", "Clear every virus across three escalating bottle layouts.", "Start Run");
  syncHud();
  renderBoard();
  renderNext();
  requestAnimationFrame(frame);
})();
