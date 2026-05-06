const terrainFill = {
  plain: "#526c49",
  forest: "#35533a",
  road: "#7a674d",
  city: "#55697d",
  base: "#6a5b87",
  hq: "#2d456f",
};

function unitColor(side) {
  return side === "player" ? "#89d6ff" : "#ff9b89";
}

function structureStroke(owner) {
  if (owner === "player") return "#89d6ff";
  if (owner === "enemy") return "#ff9b89";
  return "#d4dce9";
}

function drawRect(ctx, x, y, width, height, fill) {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, width, height);
}

function drawOverlayTiles(ctx, tiles, layout, fill) {
  const { boardX, boardY, tile } = layout;
  ctx.fillStyle = fill;
  for (const cell of tiles) {
    ctx.fillRect(boardX + cell.x * tile + 5, boardY + cell.y * tile + 5, tile - 10, tile - 10);
  }
}

function drawGrid(ctx, state, layout) {
  const { boardX, boardY, tile } = layout;
  for (let y = 0; y < state.map.length; y += 1) {
    for (let x = 0; x < state.map[y].length; x += 1) {
      const terrain = state.map[y][x];
      drawRect(ctx, boardX + x * tile, boardY + y * tile, tile - 1, tile - 1, terrainFill[terrain] ?? terrainFill.plain);
    }
  }
}

function drawStructures(ctx, state, layout) {
  const { boardX, boardY, tile } = layout;
  for (const structure of state.structures) {
    const px = boardX + structure.x * tile;
    const py = boardY + structure.y * tile;
    ctx.strokeStyle = structureStroke(structure.owner);
    ctx.lineWidth = 3;
    ctx.strokeRect(px + 5, py + 5, tile - 10, tile - 10);
    ctx.fillStyle = "rgba(8, 10, 16, 0.3)";
    ctx.fillRect(px + 12, py + 12, tile - 24, tile - 24);
    ctx.fillStyle = "#eef5ff";
    ctx.font = `bold ${Math.floor(tile * 0.2)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(structure.type.toUpperCase(), px + tile / 2, py + tile / 2);
  }
}

function drawUnits(ctx, state, layout) {
  const { boardX, boardY, tile } = layout;
  const targetSet = new Set(state.attackTargets ?? []);

  for (const unit of state.units) {
    const cx = boardX + unit.x * tile + tile / 2;
    const cy = boardY + unit.y * tile + tile / 2;

    if (targetSet.has(unit.id)) {
      ctx.fillStyle = "rgba(255, 111, 111, 0.22)";
      ctx.beginPath();
      ctx.arc(cx, cy, tile * 0.42, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = unitColor(unit.side);
    ctx.beginPath();
    ctx.arc(cx, cy, tile * 0.28, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#10151d";
    ctx.font = `bold ${Math.floor(tile * 0.24)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(unit.type[0].toUpperCase(), cx, cy + 1);

    ctx.fillStyle = "#ecf4ff";
    ctx.font = `${Math.floor(tile * 0.15)}px sans-serif`;
    ctx.fillText(`${unit.hp}`, cx, cy + tile * 0.3);

    if (unit.moved || unit.acted) {
      ctx.strokeStyle = "rgba(255, 224, 138, 0.9)";
      ctx.lineWidth = 2;
      ctx.strokeRect(cx - tile * 0.22, cy - tile * 0.22, tile * 0.44, tile * 0.44);
    }
  }
}

function drawCursor(ctx, state, layout) {
  const { boardX, boardY, tile } = layout;
  const cursorPx = boardX + state.cursor.x * tile;
  const cursorPy = boardY + state.cursor.y * tile;
  ctx.strokeStyle = "#ffe08a";
  ctx.lineWidth = 4;
  ctx.strokeRect(cursorPx + 2, cursorPy + 2, tile - 4, tile - 4);

  if (state.selectedUnit) {
    const px = boardX + state.selectedUnit.x * tile;
    const py = boardY + state.selectedUnit.y * tile;
    ctx.strokeStyle = "#89d6ff";
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 8, py + 8, tile - 16, tile - 16);
  }
}

function drawRouteTiles(ctx, routeTiles, layout) {
  if (!routeTiles || routeTiles.length < 2) return;
  const { boardX, boardY, tile } = layout;
  ctx.save();
  ctx.strokeStyle = "rgba(255, 224, 138, 0.8)";
  ctx.lineWidth = Math.max(2, tile * 0.08);
  ctx.setLineDash([tile * 0.18, tile * 0.14]);
  ctx.beginPath();
  routeTiles.forEach((cell, index) => {
    const x = boardX + cell.x * tile + tile / 2;
    const y = boardY + cell.y * tile + tile / 2;
    if (index === 0) {
      ctx.moveTo(x, y);
      return;
    }
    ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.restore();
}

function drawOpeningFocus(ctx, state, layout) {
  const focusTiles = state.openingBrief?.focusTiles ?? [];
  if (focusTiles.length === 0) return;
  const { boardX, boardY, tile } = layout;
  const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 240);
  ctx.save();
  for (const cell of focusTiles) {
    const cx = boardX + cell.x * tile + tile / 2;
    const cy = boardY + cell.y * tile + tile / 2;
    ctx.strokeStyle = cell.kind === "capture" ? `rgba(143, 215, 255, ${0.95 - pulse * 0.15})` : `rgba(255, 224, 138, ${0.9 - pulse * 0.18})`;
    ctx.lineWidth = Math.max(3, tile * 0.08);
    ctx.beginPath();
    ctx.arc(cx, cy, tile * (0.34 + pulse * 0.08), 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, tile * (0.48 + pulse * 0.08), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

export function renderGame(ctx, state, layout) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.fillStyle = "#10151d";
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  drawGrid(ctx, state, layout);
  drawOverlayTiles(ctx, state.moveTiles ?? [], layout, "rgba(137, 214, 255, 0.16)");
  drawOverlayTiles(ctx, state.attackTiles ?? [], layout, "rgba(255, 155, 137, 0.12)");
  drawRouteTiles(ctx, state.openingBrief?.routeTiles ?? [], layout);
  drawStructures(ctx, state, layout);
  drawUnits(ctx, state, layout);
  drawCursor(ctx, state, layout);
  drawOpeningFocus(ctx, state, layout);
}

export function createLayout(canvasLike) {
  const width = canvasLike.width;
  const height = canvasLike.height;
  const compactHud = width <= 900;
  const horizontalReserve = compactHud ? 32 : 88;
  const topReserve = compactHud ? 172 : 108;
  const bottomReserve = compactHud ? 124 : 96;
  const minimumTile = compactHud ? 24 : 32;
  const tile = Math.max(minimumTile, Math.floor(Math.min((width - horizontalReserve) / 10, (height - topReserve - bottomReserve) / 8)));
  const boardWidth = tile * 10;
  const boardHeight = tile * 8;
  const availableHeight = Math.max(boardHeight, height - topReserve - bottomReserve);
  return {
    tile,
    boardX: Math.floor((width - boardWidth) / 2),
    boardY: topReserve + Math.max(0, Math.floor((availableHeight - boardHeight) / 2)),
  };
}
