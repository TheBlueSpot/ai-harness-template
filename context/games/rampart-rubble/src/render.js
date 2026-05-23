import { CELL_SIZE, GRID_COLS, GRID_ROWS, GRID_X, GRID_Y } from "./data.js";

function drawRoundedRect(ctx, x, y, width, height, radius, fillStyle, strokeStyle) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
  if (fillStyle) {
    ctx.fillStyle = fillStyle;
    ctx.fill();
  }
  if (strokeStyle) {
    ctx.strokeStyle = strokeStyle;
    ctx.stroke();
  }
}

export function render(ctx, frame) {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);

  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, frame.phase === "defend" ? "#08192f" : "#6ea6d8");
  sky.addColorStop(0.7, frame.phase === "defend" ? "#10315c" : "#bdd9ef");
  sky.addColorStop(1, "#d5b17f");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#4f7298";
  ctx.fillRect(0, 140, width, 110);
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  for (let wave = 0; wave < 5; wave += 1) {
    const y = 158 + wave * 18 + Math.sin(frame.time * 0.8 + wave) * 5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= width; x += 24) {
      ctx.lineTo(x, y + Math.sin((x * 0.02) + frame.time * 1.4 + wave) * 5);
    }
    ctx.stroke();
  }

  ctx.fillStyle = "#876646";
  ctx.fillRect(0, 250, width, 290);
  ctx.fillStyle = "#6a4b31";
  ctx.fillRect(0, 356, width, 184);

  drawRoundedRect(ctx, 424, 214, 112, 72, 12, "#7c5e44", "#2f2117");
  ctx.fillStyle = "#3e2b1c";
  ctx.fillRect(460, 198, 40, 24);
  ctx.fillStyle = "#f2d8a0";
  ctx.fillRect(473, 229, 14, 20);

  ctx.strokeStyle = "rgba(33, 22, 14, 0.35)";
  ctx.lineWidth = 1;
  for (let col = 0; col <= GRID_COLS; col += 1) {
    const x = GRID_X + col * CELL_SIZE;
    ctx.beginPath();
    ctx.moveTo(x, GRID_Y);
    ctx.lineTo(x, GRID_Y + GRID_ROWS * CELL_SIZE);
    ctx.stroke();
  }
  for (let row = 0; row <= GRID_ROWS; row += 1) {
    const y = GRID_Y + row * CELL_SIZE;
    ctx.beginPath();
    ctx.moveTo(GRID_X, y);
    ctx.lineTo(GRID_X + GRID_COLS * CELL_SIZE, y);
    ctx.stroke();
  }

  for (let row = 0; row < GRID_ROWS; row += 1) {
    for (let col = 0; col < GRID_COLS; col += 1) {
      const cell = frame.grid[row][col];
      if (!cell) {
        continue;
      }
      const x = GRID_X + col * CELL_SIZE;
      const y = GRID_Y + row * CELL_SIZE;
      drawRoundedRect(ctx, x + 1, y + 1, CELL_SIZE - 2, CELL_SIZE - 2, 4, cell.hp === 1 ? "#b58b53" : "#d8b476", "#4f3822");
      if (cell.hp === 1) {
        ctx.strokeStyle = "#765230";
        ctx.beginPath();
        ctx.moveTo(x + 7, y + 6);
        ctx.lineTo(x + 18, y + 18);
        ctx.lineTo(x + 22, y + 10);
        ctx.stroke();
      }
    }
  }

  if (frame.phase === "rebuild" && frame.ghost.valid) {
    ctx.globalAlpha = 0.45;
    for (const cell of frame.ghost.cells) {
      const x = GRID_X + cell.col * CELL_SIZE;
      const y = GRID_Y + cell.row * CELL_SIZE;
      drawRoundedRect(ctx, x + 1, y + 1, CELL_SIZE - 2, CELL_SIZE - 2, 4, "#c8f08f", "#385120");
    }
    ctx.globalAlpha = 1;
  }

  for (const ship of frame.ships) {
    const hullColor = ship.hp <= 2 ? "#833737" : "#5d2b2b";
    drawRoundedRect(ctx, ship.x - 46, ship.y - 12, 92, 24, 8, hullColor, "#1f0f10");
    ctx.fillStyle = "#d0c1a0";
    ctx.fillRect(ship.x - 8, ship.y - 52, 16, 40);
    ctx.beginPath();
    ctx.moveTo(ship.x, ship.y - 84);
    ctx.lineTo(ship.x + 28, ship.y - 40);
    ctx.lineTo(ship.x, ship.y - 40);
    ctx.closePath();
    ctx.fillStyle = "#c59b4d";
    ctx.fill();
    ctx.fillStyle = "#251415";
    ctx.fillRect(ship.x - 20, ship.y - 8, 18, 8);
    ctx.fillRect(ship.x + 2, ship.y - 8, 18, 8);
  }

  const cannon = frame.cannon;
  ctx.save();
  ctx.translate(cannon.x, cannon.y);
  ctx.rotate(cannon.angle);
  drawRoundedRect(ctx, -10, -8, 66, 16, 6, "#33363f", "#101117");
  ctx.restore();
  drawRoundedRect(ctx, cannon.x - 16, cannon.y - 14, 32, 28, 10, "#6d5540", "#2d1e15");

  for (const shell of frame.shells) {
    ctx.beginPath();
    ctx.arc(shell.x, shell.y, shell.radius, 0, Math.PI * 2);
    ctx.fillStyle = shell.friendly ? "#f7f0b6" : "#f09a6c";
    ctx.fill();
  }

  for (const burst of frame.bursts) {
    ctx.globalAlpha = burst.alpha;
    ctx.beginPath();
    ctx.arc(burst.x, burst.y, burst.radius, 0, Math.PI * 2);
    ctx.fillStyle = burst.color;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.fillStyle = "#f6e7bc";
  ctx.font = "18px Georgia, serif";
  ctx.textAlign = "left";
  ctx.fillText(frame.phaseLabel, 36, 74);
  ctx.font = "14px Georgia, serif";
  ctx.fillText(frame.instruction, 36, 102);

  ctx.textAlign = "center";
  ctx.font = "16px Georgia, serif";
  ctx.fillStyle = "rgba(21, 11, 6, 0.72)";
  ctx.fillText(frame.pieceLabel, width * 0.5, 520);
}
