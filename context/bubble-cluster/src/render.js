function getColor(palette, colorId) {
  return palette.find((entry) => entry.id === colorId);
}

function drawBubble(ctx, x, y, radius, color, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  const gradient = ctx.createRadialGradient(x - radius * 0.35, y - radius * 0.45, 2, x, y, radius);
  if (color.id === "prism") {
    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(0.35, "#ffe786");
    gradient.addColorStop(0.72, "#8be9fd");
    gradient.addColorStop(1, "#101320");
  } else {
    gradient.addColorStop(0, color.glow);
    gradient.addColorStop(0.6, color.fill);
    gradient.addColorStop(1, "#101320");
  }
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = color.id === "prism" ? 3 : 2;
  ctx.strokeStyle = color.id === "prism" ? "rgba(255, 231, 134, 0.92)" : "rgba(255,255,255,0.28)";
  ctx.stroke();
  if (color.id === "prism") {
    ctx.strokeStyle = "rgba(255,255,255,0.65)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.52, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPanel(ctx, x, y, width, height, stroke, fill = "rgba(7, 12, 24, 0.82)") {
  ctx.save();
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 18);
  ctx.fill();
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

  const shake = frameState.screenShake * 8;
  const shakeX = shake ? Math.sin(performance.now() * 0.06) * shake : 0;
  const shakeY = shake ? Math.cos(performance.now() * 0.08) * shake * 0.6 : 0;
  ctx.save();
  ctx.translate(shakeX, shakeY);

  const background = ctx.createLinearGradient(0, 0, 0, height);
  background.addColorStop(0, "#162042");
  background.addColorStop(0.45, "#0c1431");
  background.addColorStop(1, "#070b16");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  const aura = ctx.createRadialGradient(width * 0.5, board.shooterY + 10, 32, width * 0.5, board.shooterY + 10, 280);
  aura.addColorStop(0, `rgba(126, 214, 255, ${0.14 + frameState.danger * 0.08})`);
  aura.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = aura;
  ctx.fillRect(0, board.shooterY - 160, width, 300);

  ctx.fillStyle = "rgba(255,255,255,0.035)";
  for (let i = 0; i < 24; i += 1) {
    ctx.beginPath();
    ctx.arc(68 + i * 38, 54 + (i % 4) * 18, 2 + (i % 4), 0, Math.PI * 2);
    ctx.fill();
  }

  const boardGlow = ctx.createLinearGradient(0, board.top - 24, 0, board.top + board.height + 40);
  boardGlow.addColorStop(0, `rgba(255, 120, 148, ${0.1 + frameState.ceilingPulse * 0.12})`);
  boardGlow.addColorStop(0.2, "rgba(255,255,255,0.05)");
  boardGlow.addColorStop(1, "rgba(255,255,255,0.02)");
  ctx.fillStyle = boardGlow;
  ctx.fillRect(board.left - 20, board.top - 18, board.width + 40, board.height + 28);
  ctx.strokeStyle = `rgba(255,255,255,${0.08 + frameState.danger * 0.08})`;
  ctx.lineWidth = 2;
  ctx.strokeRect(board.left - 20, board.top - 18, board.width + 40, board.height + 28);

  ctx.strokeStyle = `rgba(255, 231, 134, ${0.14 + frameState.danger * 0.18})`;
  ctx.beginPath();
  ctx.moveTo(board.left - 24, board.shooterY - 10);
  ctx.lineTo(board.left + board.width + 24, board.shooterY - 10);
  ctx.stroke();

  frameState.aimLine.forEach((point, index) => {
    ctx.fillStyle = `rgba(255,255,255,${0.34 - index * 0.006})`;
    ctx.beginPath();
    ctx.arc(point.x, point.y, index % 4 === 0 ? 3.4 : 2.5, 0, Math.PI * 2);
    ctx.fill();
  });
  if (frameState.aimEndpoint) {
    ctx.strokeStyle = frameState.aimBounces > 0 ? "rgba(255, 231, 134, 0.7)" : "rgba(139, 233, 253, 0.56)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(frameState.aimEndpoint.x, frameState.aimEndpoint.y, 8, 0, Math.PI * 2);
    ctx.stroke();
  }

  frameState.bubbles.forEach((bubble) => {
    drawBubble(ctx, bubble.x, bubble.y, board.radius, getColor(frameState.palette, bubble.colorId));
  });

  frameState.popBursts.forEach((burst) => {
    const color = getColor(frameState.palette, burst.colorId);
    const progress = 1 - burst.life / burst.maxLife;
    drawBubble(ctx, burst.x, burst.y, board.radius * (0.65 + progress * 1.2) * burst.size, color, burst.life * 1.5);
    ctx.save();
    ctx.globalAlpha = burst.life;
    ctx.strokeStyle = color.glow;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(burst.x, burst.y, board.radius * (0.4 + progress * 1.6), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  });

  frameState.sparkBursts.forEach((burst) => {
    const color = getColor(frameState.palette, burst.colorId);
    const alpha = Math.max(0, burst.life / burst.maxLife);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color.glow;
    ctx.beginPath();
    ctx.arc(burst.x, burst.y, burst.size * alpha, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });

  frameState.fallingBursts.forEach((burst) => {
    const color = getColor(frameState.palette, burst.colorId);
    ctx.save();
    ctx.strokeStyle = `rgba(255,255,255,${Math.max(0, burst.life / burst.maxLife) * 0.15})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(burst.x, burst.y - 18);
    ctx.lineTo(burst.x - burst.drift * 0.05, burst.y + 10);
    ctx.stroke();
    ctx.restore();
    drawBubble(ctx, burst.x, burst.y, board.radius * burst.size, color, Math.max(burst.life / burst.maxLife, 0));
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

  ctx.save();
  const deckGlow = ctx.createRadialGradient(width / 2, board.shooterY, 6, width / 2, board.shooterY, 72);
  deckGlow.addColorStop(0, `rgba(255,255,255,${0.18 + frameState.danger * 0.08})`);
  deckGlow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = deckGlow;
  ctx.beginPath();
  ctx.arc(width / 2, board.shooterY, 72, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  drawBubble(ctx, width / 2, board.shooterY, board.radius + 1, getColor(frameState.palette, frameState.currentColor));

  drawPanel(ctx, width / 2 + 56, board.shooterY - 14, 98, 72, "rgba(255, 231, 134, 0.26)", "rgba(7, 12, 24, 0.86)");

  ctx.fillStyle = "#ffe786";
  ctx.font = "700 14px Arial";
  ctx.fillText("Next", width / 2 + 70, board.shooterY + 10);
  drawBubble(ctx, width / 2 + 102, board.shooterY + 20, board.radius + 2, getColor(frameState.palette, frameState.nextColor));

  ctx.fillStyle = "#f7f3ff";
  ctx.font = "700 24px Arial";
  ctx.fillText(`Score ${frameState.score}`, 54, 52);
  ctx.font = "600 18px Arial";
  ctx.fillStyle = "#8be9fd";
  ctx.fillText(`Round ${frameState.round}/${frameState.totalRounds}`, 54, 84);

  drawPanel(
    ctx,
    44,
    96,
    170,
    38,
    frameState.danger > 0.6 ? "rgba(255, 145, 161, 0.42)" : "rgba(139, 233, 253, 0.22)",
  );
  ctx.fillStyle = "#8be9fd";
  ctx.font = "700 18px Arial";
  ctx.fillText(`Drop in ${frameState.shotsUntilDrop}`, 58, 121);

  drawPanel(
    ctx,
    44,
    142,
    170,
    54,
    frameState.power.nextReady ? "rgba(255, 231, 134, 0.38)" : "rgba(255,255,255,0.12)",
    frameState.power.nextReady ? "rgba(22, 20, 10, 0.82)" : "rgba(7, 12, 24, 0.82)",
  );
  ctx.fillStyle = frameState.power.nextReady ? "#ffe786" : "#f7f3ff";
  ctx.font = "700 16px Arial";
  ctx.fillText(frameState.power.nextReady ? "Prism online" : "Prism charge", 58, 164);
  ctx.font = "600 14px Arial";
  ctx.fillStyle = frameState.power.nextReady ? "#f8fbff" : "#8be9fd";
  ctx.fillText(
    frameState.power.nextReady
      ? `Next shot bends to best match${frameState.power.banked ? ` +${frameState.power.banked} banked` : ""}`
      : `${frameState.power.charge}/${frameState.power.target} strong clears`,
    58,
    185,
  );

  drawPanel(ctx, width - 224, 42, 180, 84, "rgba(255,255,255,0.12)", "rgba(6, 9, 18, 0.68)");
  ctx.fillStyle = "#f7f3ff";
  ctx.font = "700 14px Arial";
  ctx.fillText("Aim Read", width - 206, 66);
  ctx.fillStyle = frameState.aimBounces > 0 ? "#ffe786" : "#8be9fd";
  ctx.font = "700 22px Arial";
  ctx.fillText(frameState.aimBounces > 0 ? `Bank x${frameState.aimBounces}` : "Direct lane", width - 206, 96);
  ctx.fillStyle = frameState.danger > 0.6 ? "#ff9cb3" : "#dbe6ff";
  ctx.font = "600 14px Arial";
  ctx.fillText(frameState.danger > 0.6 ? "Ceiling pressure high" : "Stack still readable", width - 206, 116);

  drawPanel(ctx, 36, height - 68, width - 72, 44, "rgba(255,255,255,0.09)", "rgba(5, 8, 18, 0.72)");
  ctx.fillStyle = "rgba(242, 242, 255, 0.92)";
  ctx.font = "500 18px Arial";
  ctx.fillText(frameState.message, 54, height - 40);

  if (frameState.comboToast) {
    const toastColor = getColor(frameState.palette, frameState.comboToast.tone);
    const alpha = frameState.comboToast.life / frameState.comboToast.maxLife;
    ctx.save();
    ctx.globalAlpha = alpha;
    drawPanel(
      ctx,
      width * 0.5 - 94,
      26 + (1 - alpha) * 10,
      188,
      36,
      "rgba(255,255,255,0.12)",
      "rgba(10, 14, 28, 0.78)",
    );
    ctx.fillStyle = toastColor.glow;
    ctx.font = "700 18px Arial";
    ctx.textAlign = "center";
    ctx.fillText(frameState.comboToast.text, width * 0.5, 50 + (1 - alpha) * 10);
    ctx.restore();
    ctx.textAlign = "left";
  }

  if (frameState.flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${frameState.flash * 0.14})`;
    ctx.fillRect(0, 0, width, height);
  }

  ctx.restore();

  drawOverlay(ctx, width, height, frameState.overlay);
}

window.renderBubbleCluster = renderGame;
