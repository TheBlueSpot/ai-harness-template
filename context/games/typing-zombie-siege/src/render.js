const BG = "#0b1013";
const LANE = "#182126";
const BARRICADE = "#70553a";
const BARRICADE_GLOW = "#efb366";

function drawBackdrop(ctx, viewport) {
  const gradient = ctx.createLinearGradient(0, 0, 0, viewport.height);
  gradient.addColorStop(0, "#13222b");
  gradient.addColorStop(0.55, "#11181d");
  gradient.addColorStop(1, BG);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, viewport.width, viewport.height);

  ctx.fillStyle = "rgba(255, 214, 153, 0.06)";
  for (let i = 0; i < 7; i += 1) {
    ctx.beginPath();
    ctx.arc(180 + i * 160, 78 + (i % 2) * 24, 44 + i * 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawLanes(ctx, lanes, viewport, barricadeHealth) {
  const width = viewport.width - 220;
  for (const lane of lanes) {
    ctx.fillStyle = LANE;
    ctx.fillRect(150, lane.y - 44, width, 88);
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.strokeRect(150, lane.y - 44, width, 88);
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = "14px monospace";
    ctx.fillText(lane.name, 166, lane.y - 54);
  }

  ctx.fillStyle = BARRICADE;
  ctx.fillRect(112, 104, 54, viewport.height - 208);
  ctx.fillStyle = BARRICADE_GLOW;
  ctx.globalAlpha = 0.2 + (barricadeHealth / 100) * 0.35;
  ctx.fillRect(112, 104, 54, viewport.height - 208);
  ctx.globalAlpha = 1;
}

function drawEnemy(ctx, enemy) {
  const tint = enemy.tier === "hard" ? "#d95f5f" : enemy.tier === "medium" ? "#c78d4b" : "#94b36d";
  ctx.save();
  if (enemy.hitFlash > 0) {
    ctx.globalAlpha = 0.8 + enemy.hitFlash;
  }
  ctx.fillStyle = tint;
  ctx.beginPath();
  ctx.arc(enemy.x, enemy.y - 18, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(enemy.x - 14, enemy.y - 2, 28, 30);
  ctx.strokeStyle = enemy.isActive ? "#f8e16c" : "rgba(255,255,255,0.15)";
  ctx.lineWidth = enemy.isActive ? 3 : 1;
  ctx.strokeRect(enemy.x - 28, enemy.y - 38, 56, 74);
  ctx.restore();

  const start = enemy.word.slice(0, enemy.matchLength);
  const rest = enemy.word.slice(enemy.matchLength);
  ctx.font = "bold 20px monospace";
  ctx.textAlign = "center";
  ctx.fillStyle = enemy.isActive ? "#f8e16c" : "#f0f4f7";
  ctx.fillText(start, enemy.x - ctx.measureText(rest).width / 2, enemy.y - 48);
  ctx.fillStyle = "#8ea3ad";
  ctx.fillText(rest, enemy.x + ctx.measureText(start).width / 2, enemy.y - 48);
}

function drawHud(ctx, frameState, viewport) {
  ctx.fillStyle = "rgba(7, 12, 16, 0.82)";
  ctx.fillRect(18, 18, 340, 94);
  ctx.fillRect(viewport.width - 288, 18, 270, 132);

  ctx.fillStyle = "#f4efe6";
  ctx.font = "18px monospace";
  ctx.textAlign = "left";
  ctx.fillText(`Wave ${frameState.wave}/${frameState.totalWaves}`, 32, 44);
  ctx.fillText(`Score ${frameState.score}`, 32, 70);
  ctx.fillText(`Combo x${frameState.combo}`, 32, 96);

  ctx.fillText(`Wall ${frameState.barricadeHealth}%`, viewport.width - 270, 44);
  ctx.fillText(`Kills ${frameState.kills}`, viewport.width - 270, 70);
  ctx.fillText(`Threats ${frameState.enemies.length}`, viewport.width - 270, 96);

  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(viewport.width - 270, 112, 236, 18);
  ctx.fillStyle = frameState.barricadeHealth > 45 ? "#7ed47d" : frameState.barricadeHealth > 20 ? "#f2b75d" : "#ef6461";
  ctx.fillRect(viewport.width - 270, 112, 236 * (frameState.barricadeHealth / 100), 18);

  ctx.fillStyle = "rgba(7, 12, 16, 0.82)";
  ctx.fillRect(18, viewport.height - 94, viewport.width - 36, 62);
  ctx.fillStyle = "#f4efe6";
  ctx.font = "bold 28px monospace";
  ctx.fillText(frameState.typedBuffer || "type to lock a target", 32, viewport.height - 54);
}

function drawFeedback(ctx, feedback) {
  ctx.textAlign = "center";
  ctx.font = "bold 16px monospace";
  for (const item of feedback) {
    ctx.globalAlpha = Math.max(0, item.life);
    ctx.fillStyle = item.color;
    ctx.fillText(item.text, item.x, item.y);
  }
  ctx.globalAlpha = 1;
}

function drawOverlay(ctx, overlay, viewport) {
  if (!overlay) {
    return;
  }
  ctx.fillStyle = "rgba(0,0,0,0.62)";
  ctx.fillRect(0, 0, viewport.width, viewport.height);
  ctx.fillStyle = "#f6f0dd";
  ctx.textAlign = "center";
  ctx.font = "bold 42px monospace";
  ctx.fillText(overlay.title, viewport.width / 2, viewport.height / 2 - 52);
  ctx.font = "20px monospace";
  overlay.lines.forEach((line, index) => {
    ctx.fillText(line, viewport.width / 2, viewport.height / 2 + index * 32);
  });
}

export function renderGame(ctx, frameState, viewport) {
  ctx.clearRect(0, 0, viewport.width, viewport.height);
  drawBackdrop(ctx, viewport);
  drawLanes(ctx, frameState.lanes, viewport, frameState.barricadeHealth);
  for (const enemy of frameState.enemies) {
    drawEnemy(ctx, enemy);
  }
  drawHud(ctx, frameState, viewport);
  drawFeedback(ctx, frameState.feedback);
  drawOverlay(ctx, frameState.overlay, viewport);
}
