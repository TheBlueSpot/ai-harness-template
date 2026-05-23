(function () {
  "use strict";

  const BOARD_DEFS = [
    {
      cols: 7,
      rows: 6,
      mines: [
        [1, 0], [4, 0], [2, 1], [5, 1], [0, 2], [3, 2], [6, 2], [1, 4], [4, 4], [2, 5]
      ]
    },
    {
      cols: 8,
      rows: 7,
      mines: [
        [0, 0], [3, 0], [6, 0], [2, 1], [5, 1], [7, 2], [1, 3], [4, 3], [6, 3], [0, 5], [3, 5], [5, 6]
      ]
    },
    {
      cols: 9,
      rows: 7,
      mines: [
        [2, 0], [5, 0], [8, 0], [0, 1], [4, 1], [7, 1], [2, 2], [6, 2], [1, 3], [4, 3],
        [8, 3], [0, 5], [3, 5], [7, 5], [5, 6]
      ]
    }
  ];

  const NEIGHBOR_OFFSETS_EVEN = [[1, 0], [-1, 0], [0, -1], [-1, -1], [0, 1], [-1, 1]];
  const NEIGHBOR_OFFSETS_ODD = [[1, 0], [-1, 0], [1, -1], [0, -1], [1, 1], [0, 1]];

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const boardLabel = document.getElementById("boardLabel");
  const safeLabel = document.getElementById("safeLabel");
  const flagLabel = document.getElementById("flagLabel");
  const shieldLabel = document.getElementById("shieldLabel");
  const messageLine = document.getElementById("messageLine");
  const startButton = document.getElementById("startButton");
  const restartButton = document.getElementById("restartButton");
  const flagModeButton = document.getElementById("flagModeButton");
  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlayTitle");
  const overlayText = document.getElementById("overlayText");
  const overlayButton = document.getElementById("overlayButton");

  const state = {
    mode: "menu",
    boardIndex: 0,
    board: null,
    revealedSafe: 0,
    totalSafe: 0,
    flags: 0,
    shields: 2,
    flagMode: false,
    hoverKey: null,
    boardLayout: null
  };
  const autoStart = /autostart=1/.test(window.location.search) || /autostart/.test(window.location.hash);

  function createBoard(def) {
    const mineSet = new Set(def.mines.map(([col, row]) => `${col},${row}`));
    const cells = [];
    let totalSafe = 0;
    for (let row = 0; row < def.rows; row += 1) {
      const line = [];
      for (let col = 0; col < def.cols; col += 1) {
        const mine = mineSet.has(`${col},${row}`);
        if (!mine) {
          totalSafe += 1;
        }
        line.push({
          col,
          row,
          mine,
          adjacent: 0,
          revealed: false,
          flagged: false,
          exploded: false
        });
      }
      cells.push(line);
    }

    for (let row = 0; row < def.rows; row += 1) {
      for (let col = 0; col < def.cols; col += 1) {
        const cell = cells[row][col];
        cell.adjacent = getNeighborsFor(cells, col, row).filter((neighbor) => neighbor.mine).length;
      }
    }

    return {
      cols: def.cols,
      rows: def.rows,
      cells,
      totalSafe
    };
  }

  function getOffsets(row) {
    return row % 2 === 0 ? NEIGHBOR_OFFSETS_EVEN : NEIGHBOR_OFFSETS_ODD;
  }

  function getNeighborsFor(cells, col, row) {
    const neighbors = [];
    for (const [dx, dy] of getOffsets(row)) {
      const nextCol = col + dx;
      const nextRow = row + dy;
      if (nextRow < 0 || nextRow >= cells.length) {
        continue;
      }
      if (nextCol < 0 || nextCol >= cells[nextRow].length) {
        continue;
      }
      neighbors.push(cells[nextRow][nextCol]);
    }
    return neighbors;
  }

  function beginRun() {
    state.mode = "playing";
    state.boardIndex = 0;
    state.shields = 2;
    state.flagMode = false;
    loadBoard(0);
    setOverlay(false);
  }

  function loadBoard(index) {
    const board = createBoard(BOARD_DEFS[index]);
    state.board = board;
    state.boardIndex = index;
    state.revealedSafe = 0;
    state.totalSafe = board.totalSafe;
    state.flags = 0;
    state.hoverKey = null;
    state.boardLayout = computeBoardLayout(board);
    messageLine.textContent = `Board ${index + 1}: reveal every safe hex. Clue clicks chord nearby cells when your flags match.`;
    syncUi();
    render();
  }

  function computeBoardLayout(board) {
    const marginX = 90;
    const marginY = 78;
    const usableWidth = canvas.width - marginX * 2;
    const usableHeight = canvas.height - marginY * 2;
    const radiusByWidth = usableWidth / ((board.cols - 1) * 1.5 + 2.6);
    const radiusByHeight = usableHeight / ((board.rows - 1) * Math.sqrt(3) + 2.2);
    const radius = Math.max(24, Math.min(42, Math.floor(Math.min(radiusByWidth, radiusByHeight))));
    const stepX = radius * 1.5;
    const stepY = radius * Math.sqrt(3);
    const offsetX = (canvas.width - ((board.cols - 1) * stepX + radius * 2)) / 2 + radius;
    const offsetY = (canvas.height - ((board.rows - 1) * stepY + radius * 2)) / 2 + radius;
    return { radius, stepX, stepY, offsetX, offsetY };
  }

  function syncUi() {
    boardLabel.textContent = `${state.boardIndex + 1} / ${BOARD_DEFS.length}`;
    safeLabel.textContent = `${state.revealedSafe} / ${state.totalSafe}`;
    flagLabel.textContent = String(state.flags);
    shieldLabel.textContent = String(state.shields);
    flagModeButton.textContent = `Flag Mode: ${state.flagMode ? "On" : "Off"}`;
  }

  function setOverlay(visible, title, text, buttonText) {
    overlay.classList.toggle("overlay--visible", visible);
    if (title) {
      overlayTitle.textContent = title;
    }
    if (text) {
      overlayText.textContent = text;
    }
    if (buttonText) {
      overlayButton.textContent = buttonText;
    }
  }

  function restartRun() {
    if (state.mode === "menu") {
      beginRun();
      return;
    }
    beginRun();
  }

  function toggleFlagMode() {
    state.flagMode = !state.flagMode;
    syncUi();
  }

  function getCellCenter(col, row) {
    const { radius, stepX, stepY, offsetX, offsetY } = state.boardLayout;
    return {
      x: offsetX + col * stepX + (row % 2 === 1 ? stepX / 2 : 0),
      y: offsetY + row * stepY
    };
  }

  function getCellPolygon(col, row) {
    const { radius } = state.boardLayout;
    const center = getCellCenter(col, row);
    const points = [];
    for (let i = 0; i < 6; i += 1) {
      const angle = (Math.PI / 180) * (60 * i - 30);
      points.push({
        x: center.x + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * radius
      });
    }
    return points;
  }

  function pointInPolygon(point, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x;
      const yi = polygon[i].y;
      const xj = polygon[j].x;
      const yj = polygon[j].y;
      const intersect =
        yi > point.y !== yj > point.y &&
        point.x < ((xj - xi) * (point.y - yi)) / ((yj - yi) || 0.0001) + xi;
      if (intersect) {
        inside = !inside;
      }
    }
    return inside;
  }

  function getCellAt(clientX, clientY) {
    if (!state.board || !state.boardLayout) {
      return null;
    }
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const point = {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
    for (let row = 0; row < state.board.rows; row += 1) {
      for (let col = 0; col < state.board.cols; col += 1) {
        const polygon = getCellPolygon(col, row);
        if (pointInPolygon(point, polygon)) {
          return state.board.cells[row][col];
        }
      }
    }
    return null;
  }

  function revealCell(cell) {
    if (!cell || cell.revealed || cell.flagged || state.mode !== "playing") {
      return;
    }

    if (cell.mine) {
      cell.revealed = true;
      cell.exploded = true;
      state.shields -= 1;
      shieldLabel.textContent = String(state.shields);
      messageLine.textContent = state.shields > 0
        ? "Mine hit. One shield spent. Keep clearing the board."
        : "No shields left. Restart and solve the route cleanly.";
      if (state.shields <= 0) {
        loseRun();
      } else {
        render();
      }
      return;
    }

    const stack = [cell];
    while (stack.length) {
      const current = stack.pop();
      if (!current || current.revealed || current.flagged) {
        continue;
      }
      current.revealed = true;
      state.revealedSafe += 1;
      if (current.adjacent === 0) {
        const neighbors = getNeighborsFor(state.board.cells, current.col, current.row);
        for (const neighbor of neighbors) {
          if (!neighbor.mine && !neighbor.revealed && !neighbor.flagged) {
            stack.push(neighbor);
          }
        }
      }
    }

    messageLine.textContent = "Safe chain opened. Use clue numbers to finish the board without guessing.";
    syncUi();
    checkBoardClear();
    render();
  }

  function chordCell(cell) {
    if (!cell || !cell.revealed || cell.mine || state.mode !== "playing") {
      return;
    }
    const neighbors = getNeighborsFor(state.board.cells, cell.col, cell.row);
    const flagged = neighbors.filter((neighbor) => neighbor.flagged).length;
    if (flagged !== cell.adjacent) {
      messageLine.textContent = `Chord blocked. This clue needs ${cell.adjacent} flagged neighbors.`;
      return;
    }
    for (const neighbor of neighbors) {
      if (!neighbor.flagged && !neighbor.revealed) {
        revealCell(neighbor);
      }
    }
  }

  function toggleFlag(cell) {
    if (!cell || cell.revealed || state.mode !== "playing") {
      return;
    }
    cell.flagged = !cell.flagged;
    state.flags += cell.flagged ? 1 : -1;
    messageLine.textContent = cell.flagged ? "Mine flagged." : "Flag removed.";
    syncUi();
    render();
  }

  function checkBoardClear() {
    if (state.revealedSafe < state.totalSafe) {
      return;
    }
    if (state.boardIndex < BOARD_DEFS.length - 1) {
      const nextIndex = state.boardIndex + 1;
      messageLine.textContent = `Board ${state.boardIndex + 1} clear. Loading board ${nextIndex + 1}.`;
      loadBoard(nextIndex);
      return;
    }
    winRun();
  }

  function revealAllMines() {
    for (const row of state.board.cells) {
      for (const cell of row) {
        if (cell.mine) {
          cell.revealed = true;
        }
      }
    }
  }

  function loseRun() {
    state.mode = "lose";
    revealAllMines();
    render();
    setOverlay(
      true,
      "Run Lost",
      "The shield bank is empty. Restart and work the clue chains instead of forcing uncertain reveals.",
      "Retry"
    );
  }

  function winRun() {
    state.mode = "win";
    revealAllMines();
    render();
    setOverlay(
      true,
      "Run Clear",
      `All ${BOARD_DEFS.length} boards cleared with ${state.shields} shield${state.shields === 1 ? "" : "s"} left.`,
      "Play Again"
    );
  }

  function handleCellAction(cell, flagIntent) {
    if (!cell || !state.board) {
      return;
    }
    if (flagIntent) {
      toggleFlag(cell);
      return;
    }
    if (cell.revealed) {
      chordCell(cell);
      render();
      return;
    }
    revealCell(cell);
  }

  function drawHex(points, fill, stroke, lineWidth) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }

  function renderBackground() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, "#0d2030");
    gradient.addColorStop(1, "#081018");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "rgba(127, 224, 255, 0.06)";
    for (let i = 0; i < 14; i += 1) {
      const x = (i * 131) % canvas.width;
      const y = 50 + ((i * 67) % (canvas.height - 100));
      ctx.beginPath();
      ctx.arc(x, y, 24 + (i % 4) * 12, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function renderBoard() {
    const palette = ["#97f0ff", "#73d2ff", "#8ef9c6", "#ffd166", "#ff9f68", "#ff7b7b"];

    for (let row = 0; row < state.board.rows; row += 1) {
      for (let col = 0; col < state.board.cols; col += 1) {
        const cell = state.board.cells[row][col];
        const key = `${col},${row}`;
        const points = getCellPolygon(col, row);
        const hovered = state.hoverKey === key;
        let fill = "rgba(24, 54, 76, 0.95)";
        let stroke = hovered ? "#7fe0ff" : "#36637f";
        let lineWidth = hovered ? 3 : 2;

        if (cell.revealed && !cell.mine) {
          fill = "rgba(120, 245, 212, 0.16)";
          stroke = "#90ffe2";
        } else if (cell.flagged) {
          fill = "rgba(255, 209, 102, 0.18)";
          stroke = "#ffd166";
        } else if (cell.revealed && cell.mine) {
          fill = cell.exploded ? "rgba(255, 107, 107, 0.38)" : "rgba(255, 107, 107, 0.2)";
          stroke = "#ff8a8a";
        }

        drawHex(points, fill, stroke, lineWidth);

        const center = getCellCenter(col, row);
        if (cell.flagged) {
          ctx.fillStyle = "#ffd166";
          ctx.font = "bold 20px Trebuchet MS";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("!", center.x, center.y + 1);
        } else if (cell.revealed && cell.mine) {
          ctx.fillStyle = cell.exploded ? "#fff4f4" : "#ffd7d7";
          ctx.beginPath();
          ctx.arc(center.x, center.y, 10, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#7a1f1f";
          ctx.lineWidth = 3;
          ctx.stroke();
        } else if (cell.revealed && cell.adjacent > 0) {
          ctx.fillStyle = palette[Math.min(palette.length - 1, cell.adjacent - 1)];
          ctx.font = "bold 22px Trebuchet MS";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(String(cell.adjacent), center.x, center.y + 1);
        }
      }
    }
  }

  function renderLegend() {
    ctx.fillStyle = "rgba(8, 20, 30, 0.76)";
    ctx.fillRect(26, canvas.height - 78, 290, 44);
    ctx.strokeStyle = "#2d5978";
    ctx.lineWidth = 1;
    ctx.strokeRect(26, canvas.height - 78, 290, 44);
    ctx.fillStyle = "#9eb8cb";
    ctx.font = "15px Trebuchet MS";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("Tip: flagged neighbors must match a revealed clue before chord opens the ring.", 40, canvas.height - 56);
  }

  function render() {
    renderBackground();
    if (!state.board) {
      return;
    }
    renderBoard();
    renderLegend();
  }

  function onPointerMove(event) {
    if (!state.board || state.mode === "menu") {
      return;
    }
    const cell = getCellAt(event.clientX, event.clientY);
    state.hoverKey = cell ? `${cell.col},${cell.row}` : null;
    render();
  }

  function onCanvasClick(event) {
    if (state.mode !== "playing") {
      return;
    }
    const cell = getCellAt(event.clientX, event.clientY);
    if (!cell) {
      return;
    }
    handleCellAction(cell, state.flagMode);
  }

  canvas.addEventListener("mousemove", onPointerMove);
  canvas.addEventListener("mouseleave", function () {
    state.hoverKey = null;
    render();
  });
  canvas.addEventListener("click", onCanvasClick);
  canvas.addEventListener("contextmenu", function (event) {
    event.preventDefault();
    if (state.mode !== "playing") {
      return;
    }
    const cell = getCellAt(event.clientX, event.clientY);
    if (!cell) {
      return;
    }
    handleCellAction(cell, true);
  });

  window.addEventListener("keydown", function (event) {
    if (event.key === "f" || event.key === "F") {
      toggleFlagMode();
      return;
    }
    if (event.key === "r" || event.key === "R") {
      restartRun();
      return;
    }
    if (event.key === "Enter" && state.mode === "menu") {
      beginRun();
      return;
    }
    if (event.key === "Enter" && (state.mode === "win" || state.mode === "lose")) {
      beginRun();
    }
  });

  startButton.addEventListener("click", beginRun);
  restartButton.addEventListener("click", restartRun);
  flagModeButton.addEventListener("click", toggleFlagMode);
  overlayButton.addEventListener("click", function () {
    beginRun();
  });

  renderBackground();
  if (autoStart) {
    beginRun();
  }
})();
