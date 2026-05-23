const COLORS = {
  rock: "#8796ab",
  wall: "#152033",
  dirt: "#5a4331",
  empty: "#07111e",
  gem: "#6ef6e0",
  exitClosed: "#6f2b26",
  exitOpen: "#f9c74f",
  player: "#f7f4dd",
  enemy: "#ff5d73",
  gridGlow: "rgba(98, 209, 255, 0.08)",
  dropHint: "rgba(255, 200, 87, 0.16)",
  dropHintActive: "rgba(255, 200, 87, 0.32)",
  routePath: "rgba(116, 232, 255, 0.9)",
  routeNode: "rgba(110, 246, 224, 0.2)"
};

export function renderGame(ctx, frame, width, height) {
  ctx.clearRect(0, 0, width, height);
  drawBackdrop(ctx, width, height);
  drawCave(ctx, frame, width, height);
}

function drawBackdrop(ctx, width, height) {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#10243b");
  gradient.addColorStop(1, "#04070d");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "rgba(255,255,255,0.03)";
  for (let i = 0; i < 60; i += 1) {
    ctx.beginPath();
    ctx.arc((i * 91) % width, (i * 53) % height, 1.5 + (i % 3), 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCave(ctx, frame, width, height) {
  const rows = frame.grid.length;
  const cols = frame.grid[0].length;
  const cell = Math.floor(Math.min((width - 80) / cols, (height - 80) / rows));
  const boardWidth = cols * cell;
  const boardHeight = rows * cell;
  const offsetX = Math.floor((width - boardWidth) / 2);
  const offsetY = Math.floor((height - boardHeight) / 2);

  ctx.fillStyle = "rgba(7, 15, 24, 0.92)";
  ctx.fillRect(offsetX - 14, offsetY - 14, boardWidth + 28, boardHeight + 28);

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const px = offsetX + x * cell;
      const py = offsetY + y * cell;
      const tile = frame.grid[y][x];
      ctx.fillStyle = COLORS.empty;
      ctx.fillRect(px, py, cell, cell);
      ctx.strokeStyle = COLORS.gridGlow;
      ctx.strokeRect(px + 0.5, py + 0.5, cell - 1, cell - 1);

      if (tile === "#") drawWall(ctx, px, py, cell);
      else if (tile === ".") drawDirt(ctx, px, py, cell);
      else if (tile === "O") drawRock(ctx, px, py, cell);
      else if (tile === "*") drawGem(ctx, px, py, cell);
      else if (tile === "X") drawExit(ctx, px, py, cell, frame.exit.open);
    }
  }

  drawDropHints(ctx, frame.dropHints ?? [], offsetX, offsetY, cell);
  if (frame.mode === "ready" && frame.routeHint?.path?.length) {
    drawRoutePath(ctx, frame.routeHint.path, offsetX, offsetY, cell);
  }

  for (const enemy of frame.enemies) {
    drawEnemy(ctx, offsetX + enemy.x * cell, offsetY + enemy.y * cell, cell);
  }

  drawPlayer(ctx, offsetX + frame.player.x * cell, offsetY + frame.player.y * cell, cell);
}

function drawDropHints(ctx, dropHints, offsetX, offsetY, cell) {
  for (const hint of dropHints) {
    ctx.fillStyle = hint.active ? COLORS.dropHintActive : COLORS.dropHint;
    for (const position of hint.cells) {
      const px = offsetX + position.x * cell;
      const py = offsetY + position.y * cell;
      ctx.fillRect(px + cell * 0.34, py + 2, cell * 0.32, cell - 4);
    }
  }
}

function drawRoutePath(ctx, path, offsetX, offsetY, cell) {
  ctx.save();
  ctx.strokeStyle = COLORS.routePath;
  ctx.lineWidth = Math.max(3, cell * 0.12);
  ctx.setLineDash([cell * 0.35, cell * 0.18]);
  ctx.beginPath();
  path.forEach((point, index) => {
    const px = offsetX + (point.x + 0.5) * cell;
    const py = offsetY + (point.y + 0.5) * cell;
    if (index === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();
  ctx.setLineDash([]);

  for (const point of path) {
    const px = offsetX + (point.x + 0.5) * cell;
    const py = offsetY + (point.y + 0.5) * cell;
    ctx.fillStyle = COLORS.routeNode;
    ctx.beginPath();
    ctx.arc(px, py, cell * 0.22, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawWall(ctx, x, y, cell) {
  ctx.fillStyle = COLORS.wall;
  ctx.fillRect(x, y, cell, cell);
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(x + 2, y + 2, cell - 4, 4);
}

function drawDirt(ctx, x, y, cell) {
  ctx.fillStyle = COLORS.dirt;
  ctx.fillRect(x + 2, y + 2, cell - 4, cell - 4);
  ctx.fillStyle = "rgba(245, 201, 130, 0.26)";
  ctx.beginPath();
  ctx.arc(x + cell * 0.35, y + cell * 0.4, cell * 0.09, 0, Math.PI * 2);
  ctx.arc(x + cell * 0.7, y + cell * 0.62, cell * 0.08, 0, Math.PI * 2);
  ctx.fill();
}

function drawRock(ctx, x, y, cell) {
  ctx.fillStyle = COLORS.rock;
  ctx.beginPath();
  ctx.arc(x + cell * 0.5, y + cell * 0.52, cell * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.beginPath();
  ctx.arc(x + cell * 0.4, y + cell * 0.42, cell * 0.08, 0, Math.PI * 2);
  ctx.fill();
}

function drawGem(ctx, x, y, cell) {
  ctx.fillStyle = COLORS.gem;
  ctx.beginPath();
  ctx.moveTo(x + cell * 0.5, y + cell * 0.14);
  ctx.lineTo(x + cell * 0.78, y + cell * 0.45);
  ctx.lineTo(x + cell * 0.5, y + cell * 0.84);
  ctx.lineTo(x + cell * 0.22, y + cell * 0.45);
  ctx.closePath();
  ctx.fill();
}

function drawExit(ctx, x, y, cell, open) {
  ctx.fillStyle = open ? COLORS.exitOpen : COLORS.exitClosed;
  ctx.fillRect(x + cell * 0.18, y + cell * 0.14, cell * 0.64, cell * 0.72);
  ctx.fillStyle = "rgba(10, 18, 28, 0.68)";
  ctx.fillRect(x + cell * 0.3, y + cell * 0.3, cell * 0.32, cell * 0.28);
}

function drawPlayer(ctx, x, y, cell) {
  ctx.fillStyle = COLORS.player;
  ctx.beginPath();
  ctx.arc(x + cell * 0.5, y + cell * 0.3, cell * 0.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#68d4ff";
  ctx.lineWidth = Math.max(2, cell * 0.08);
  ctx.beginPath();
  ctx.moveTo(x + cell * 0.5, y + cell * 0.46);
  ctx.lineTo(x + cell * 0.5, y + cell * 0.72);
  ctx.lineTo(x + cell * 0.36, y + cell * 0.92);
  ctx.moveTo(x + cell * 0.5, y + cell * 0.72);
  ctx.lineTo(x + cell * 0.64, y + cell * 0.92);
  ctx.moveTo(x + cell * 0.3, y + cell * 0.58);
  ctx.lineTo(x + cell * 0.7, y + cell * 0.62);
  ctx.stroke();
}

function drawEnemy(ctx, x, y, cell) {
  ctx.fillStyle = COLORS.enemy;
  ctx.beginPath();
  ctx.arc(x + cell * 0.5, y + cell * 0.5, cell * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#0b1220";
  ctx.beginPath();
  ctx.arc(x + cell * 0.42, y + cell * 0.45, cell * 0.06, 0, Math.PI * 2);
  ctx.arc(x + cell * 0.58, y + cell * 0.45, cell * 0.06, 0, Math.PI * 2);
  ctx.fill();
}
