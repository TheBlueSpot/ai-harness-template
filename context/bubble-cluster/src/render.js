function getColor(palette, colorId) {
  return palette.find((entry) => entry.id === colorId);
}

function drawBubble(ctx, x, y, radius, color, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  const gradient = ctx.createRadialGradient(x - radius * 0.35, y - radius * 0.45, 2, x, y, radius);
  gradient.addColorStop(0, color.glow);
  gradient.addColorStop(0.6, color.fill);
  gradient.addColorStop(1, "#101320");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255,255,255,0.28)";
  ctx.stroke();
  ctx.restore();
}

function drawOverlay(ctx, width, height, overlay) {
  if (!overlay) {
    return;
  }

  ctx.save();
  ctx.fillStyle = "rgba(4, 8, 19, 0.72)";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#f6f4ff";
  ctx.textAlign = "center";
  ctx.font = "700 42px Georgia";
  ctx.fillText(overlay.title, width / 2, 180);
  ctx.font = "500 22px Arial";
  overlay.lines.forEach((line, index) => {
    ctx.fillStyle = "rgba(240, 238, 255, 0.92)";
    ctx.fillText(line, width / 2, 234 + index * 30);
  });
  ctx.fillStyle = "#ffe786";
  ctx.font = "700 20px Arial";
  ctx.fillText(overlay.prompt, width / 2, 334);
  ctx.restore();
}

function renderGame(ctx, frameState) {
  const { canvas } = ctx;
  const width = canvas.width;
  const height = canvas.height;
  const board = frameState.board;
  ctx.clearRect(0, 0, width, height);

  const background = ctx.createLinearGradient(0, 0, 0, height);
  background.addColorStop(0, "#162042");
  background.addColorStop(0.45, "#0c1431");
  background.addColorStop(1, "#070b16");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "rgba(255,255,255,0.035)";
  for (let i = 0; i < 20; i += 1) {
    ctx.beginPath();
    ctx.arc(90 + i * 42, 60 + (i % 3) * 16, 2 + (i % 4), 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "rgba(255,255,255,0.04)";
  ctx.fillRect(board.left - 20, board.top - 18, board.width + 40, board.height + 28);
  ctx.strokeStyle = "rgba(255,255,255,0.09)";
  ctx.lineWidth = 2;
  ctx.strokeRect(board.left - 20, board.top - 18, board.width + 40, board.height + 28);

  ctx.strokeStyle = "rgba(255, 231, 134, 0.15)";
  ctx.beginPath();
  ctx.moveTo(board.left - 24, board.shooterY - 10);
  ctx.lineTo(board.left + board.width + 24, board.shooterY - 10);
  ctx.stroke();

  frameState.aimLine.forEach((point, index) => {
    ctx.fillStyle = `rgba(255,255,255,${0.3 - index * 0.006})`;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 3, 0, Math.PI * 2);
    ctx.fill();
  });

  frameState.bubbles.forEach((bubble) => {
    drawBubble(ctx, bubble.x, bubble.y, board.radius, getColor(frameState.palette, bubble.colorId));
  });

  frameState.popBursts.forEach((burst) => {
    const color = getColor(frameState.palette, burst.colorId);
    drawBubble(ctx, burst.x, burst.y, board.radius * (1.4 - burst.life), color, burst.life * 1.4);
  });

  frameState.fallingBursts.forEach((burst) => {
    const color = getColor(frameState.palette, burst.colorId);
    drawBubble(ctx, burst.x, burst.y, board.radius * 0.92, color, Math.max(burst.life, 0));
  });

  if (frameState.activeShot) {
    drawBubble(
      ctx,
      frameState.activeShot.x,
      frameState.activeShot.y,
      board.radius,
      getColor(frameState.palette, frameState.activeShot.colorId),
    );
  }

  ctx.save();
  ctx.translate(width / 2, board.shooterY);
  ctx.rotate(frameState.angle);
  ctx.fillStyle = "#2d385e";
  ctx.fillRect(-18, -12, 48, 24);
  ctx.fillStyle = "#90d3ff";
  ctx.fillRect(16, -6, 26, 12);
  ctx.restore();

  drawBubble(ctx, width / 2, board.shooterY, board.radius + 1, getColor(frameState.palette, frameState.currentColor));
  drawBubble(ctx, width / 2 + 82, board.shooterY + 14, board.radius - 4, getColor(frameState.palette, frameState.nextColor));

  ctx.fillStyle = "#f7f3ff";
  ctx.font = "700 24px Arial";
  ctx.fillText(`Score ${frameState.score}`, 54, 52);
  ctx.font = "600 18px Arial";
  ctx.fillStyle = "#8be9fd";
  ctx.fillText(`Drop in ${frameState.shotsUntilDrop}`, 54, 84);
  ctx.fillStyle = "#ffe786";
  ctx.fillText("Next", width / 2 + 114, board.shooterY + 22);

  ctx.fillStyle = "rgba(242, 242, 255, 0.92)";
  ctx.font = "500 18px Arial";
  ctx.fillText(frameState.message, 54, height - 28);

  drawOverlay(ctx, width, height, frameState.overlay);
}

window.renderBubbleCluster = renderGame;
