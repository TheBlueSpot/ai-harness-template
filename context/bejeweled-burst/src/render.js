function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

export function render(ctx, frame) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  const gradient = ctx.createLinearGradient(0, 0, 0, ctx.canvas.height);
  gradient.addColorStop(0, "#0c1b30");
  gradient.addColorStop(1, "#091119");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  ctx.fillStyle = "rgba(128, 212, 255, 0.08)";
  for (let i = 0; i < 24; i += 1) {
    const y = 20 + i * 34;
    ctx.fillRect(0, y, ctx.canvas.width, 1);
  }

  roundRect(ctx, frame.boardX - 20, frame.boardY - 20, 552, 552, 28);
  ctx.fillStyle = "rgba(3, 12, 22, 0.76)";
  ctx.fill();
  ctx.strokeStyle = frame.noMoveFlash > 0 ? "rgba(255, 210, 102, 0.95)" : "rgba(100, 176, 230, 0.3)";
  ctx.lineWidth = 3;
  ctx.stroke();

  for (let row = 0; row < frame.board.length; row += 1) {
    for (let col = 0; col < frame.board[row].length; col += 1) {
      const gem = frame.board[row][col];
      const x = frame.boardX + col * frame.cellSize;
      const y = frame.boardY + row * frame.cellSize;

      ctx.fillStyle = "rgba(255, 255, 255, 0.03)";
      roundRect(ctx, x + 4, y + 4, frame.cellSize - 8, frame.cellSize - 8, 16);
      ctx.fill();

      if (!gem) {
        continue;
      }

      const color = frame.colors[gem.type];
      const inner = ctx.createRadialGradient(x + 24, y + 20, 8, x + 32, y + 32, 30);
      inner.addColorStop(0, "rgba(255,255,255,0.95)");
      inner.addColorStop(0.2, color);
      inner.addColorStop(1, "rgba(0,0,0,0.7)");
      ctx.fillStyle = inner;

      ctx.beginPath();
      ctx.moveTo(x + 32, y + 8);
      ctx.lineTo(x + 54, y + 28);
      ctx.lineTo(x + 44, y + 56);
      ctx.lineTo(x + 20, y + 56);
      ctx.lineTo(x + 10, y + 28);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = "rgba(255,255,255,0.28)";
      ctx.lineWidth = 2;
      ctx.stroke();

      if (gem.special === "burst") {
        ctx.strokeStyle = "rgba(255, 209, 102, 0.95)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x + 16, y + 32);
        ctx.lineTo(x + 48, y + 32);
        ctx.moveTo(x + 32, y + 16);
        ctx.lineTo(x + 32, y + 48);
        ctx.stroke();
      }

      if (frame.selected && frame.selected.row === row && frame.selected.col === col) {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 4;
        roundRect(ctx, x + 2, y + 2, frame.cellSize - 4, frame.cellSize - 4, 18);
        ctx.stroke();
      }
    }
  }

  for (const spark of frame.sparkles) {
    ctx.globalAlpha = Math.min(1, spark.life * 2.2);
    ctx.fillStyle = spark.color;
    ctx.beginPath();
    ctx.arc(spark.x, spark.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  ctx.font = "600 22px Georgia";
  ctx.fillText(frame.message, 66, 92);

  ctx.fillStyle = "rgba(138, 182, 209, 0.95)";
  ctx.font = "16px Georgia";
  ctx.fillText("Create 4-gem matches to forge burst gems that clear a cross on the next pop.", 66, 672);
  ctx.fillText("Goal: beat the score target before the blitz timer expires.", 66, 702);
}
