(() => {
const WALL_COLOR = "#16213b";
const FLOOR_COLOR = "#070d18";
const GRID_GLOW = "#0b1424";
const PLAYER_COLOR = "#ffd93b";
const FRIGHTENED_COLOR = "#335dff";
const EATEN_COLOR = "#d7deff";

function renderGame(ctx, frame) {
  const { width, height } = frame.dimensions;
  const tile = frame.tileSize;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = FLOOR_COLOR;
  ctx.fillRect(0, 0, width, height);

  drawMaze(ctx, frame.mazeTiles, tile);
  drawPellets(ctx, frame.pellets, frame.powerPellets, tile);
  drawPlayer(ctx, frame.player, tile);
  drawGhosts(ctx, frame.ghosts, tile, frame.ghostMode);
  drawFooter(ctx, frame, width, height);
}

function drawMaze(ctx, tiles, tile) {
  for (let y = 0; y < tiles.length; y += 1) {
    for (let x = 0; x < tiles[y].length; x += 1) {
      if (tiles[y][x] !== "#") {
        ctx.fillStyle = GRID_GLOW;
        ctx.fillRect(x * tile, y * tile, tile, tile);
        continue;
      }

      ctx.fillStyle = WALL_COLOR;
      roundRect(ctx, x * tile + 2, y * tile + 2, tile - 4, tile - 4, 9);
      ctx.fill();
    }
  }
}

function drawPellets(ctx, pellets, powerPellets, tile) {
  ctx.fillStyle = "#ffe6a7";
  for (const [x, y] of pellets) {
    ctx.beginPath();
    ctx.arc(x * tile + tile * 0.5, y * tile + tile * 0.5, tile * 0.11, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "#ffffff";
  for (const [x, y] of powerPellets) {
    ctx.beginPath();
    ctx.arc(x * tile + tile * 0.5, y * tile + tile * 0.5, tile * 0.21, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPlayer(ctx, player, tile) {
  const mouth = Math.abs(Math.sin((player.x + player.y) * 0.04)) * 0.5 + 0.18;
  const angleMap = {
    left: Math.PI,
    right: 0,
    up: Math.PI * 1.5,
    down: Math.PI * 0.5,
  };
  const heading = angleMap[player.direction] ?? 0;

  ctx.fillStyle = PLAYER_COLOR;
  ctx.beginPath();
  ctx.moveTo(player.x, player.y);
  ctx.arc(player.x, player.y, tile * 0.42, heading + mouth, heading - mouth + Math.PI * 2, false);
  ctx.closePath();
  ctx.fill();
}

function drawGhosts(ctx, ghosts, tile) {
  for (const ghost of ghosts) {
    const frightened = ghost.state === "frightened";
    const eaten = ghost.state === "eaten";
    ctx.fillStyle = eaten ? EATEN_COLOR : frightened ? FRIGHTENED_COLOR : ghost.color;

    ctx.beginPath();
    ctx.arc(ghost.x, ghost.y - tile * 0.08, tile * 0.36, Math.PI, 0, false);
    ctx.lineTo(ghost.x + tile * 0.36, ghost.y + tile * 0.28);
    for (let i = 0; i < 4; i += 1) {
      const waveX = ghost.x + tile * 0.36 - i * tile * 0.18;
      const waveY = ghost.y + tile * (i % 2 === 0 ? 0.28 : 0.18);
      ctx.lineTo(waveX, waveY);
    }
    ctx.lineTo(ghost.x - tile * 0.36, ghost.y + tile * 0.28);
    ctx.closePath();
    ctx.fill();

    const eyeOffset = tile * 0.12;
    drawEye(ctx, ghost.x - eyeOffset, ghost.y - tile * 0.04, tile * 0.09, eaten);
    drawEye(ctx, ghost.x + eyeOffset, ghost.y - tile * 0.04, tile * 0.09, eaten);
  }
}

function drawEye(ctx, x, y, radius, eaten) {
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(x, y, radius * 1.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = eaten ? "#4f5b91" : "#111827";
  ctx.beginPath();
  ctx.arc(x, y, radius * 0.8, 0, Math.PI * 2);
  ctx.fill();
}

function drawFooter(ctx, frame, width, height) {
  ctx.fillStyle = "rgba(4, 8, 16, 0.85)";
  ctx.fillRect(0, height - 78, width, 78);

  ctx.fillStyle = "#dce7ff";
  ctx.font = "600 22px Arial";
  ctx.fillText(`Best ${frame.bestScore}`, 24, height - 28);
  ctx.textAlign = "right";
  ctx.fillText(`${frame.pellets.length + frame.powerPellets.length} pellets left`, width - 24, height - 28);
  ctx.textAlign = "left";
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

window.PacGhostRender = { renderGame };
})();
