function drawBackground(ctx, state) {
  const gradient = ctx.createLinearGradient(0, 0, 0, state.height);
  gradient.addColorStop(0, "#081426");
  gradient.addColorStop(0.55, "#13305c");
  gradient.addColorStop(1, "#050814");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, state.width, state.height);

  ctx.fillStyle = "rgba(255,255,255,0.05)";
  for (let i = 0; i < 18; i += 1) {
    const x = (i * 73) % state.width;
    const y = 70 + i * 34;
    ctx.beginPath();
    ctx.arc(x, y, 1 + (i % 3), 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCannon(ctx, state) {
  const { x, y, aim } = state.cannon;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.atan2(aim.y, aim.x) + Math.PI / 2);
  ctx.fillStyle = "#d6e4ff";
  ctx.fillRect(-10, -26, 20, 42);
  ctx.fillStyle = "#4da8ff";
  ctx.fillRect(-6, -36, 12, 18);
  ctx.restore();

  ctx.fillStyle = "#0b1430";
  ctx.beginPath();
  ctx.arc(x, y + 6, 24, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ecf3ff";
  ctx.beginPath();
  ctx.arc(x, y + 6, 17, 0, Math.PI * 2);
  ctx.fill();
}

function drawGuide(ctx, state) {
  if (!state.guidePoints.length) {
    return;
  }
  ctx.save();
  for (let i = 0; i < state.guidePoints.length; i += 1) {
    const point = state.guidePoints[i];
    const alpha = 1 - i / state.guidePoints.length;
    ctx.fillStyle = `rgba(255, 242, 166, ${0.12 + alpha * 0.45})`;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 4 - alpha * 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawPegs(ctx, state) {
  for (const peg of state.pegs) {
    if (!peg.alive) {
      continue;
    }
    const glow = peg.kind === "orange" ? "#ff9f3f" : "#66c3ff";
    const fill = peg.kind === "orange" ? "#ffcf6b" : "#cfefff";
    const pulse = 1 + Math.sin(peg.pulse) * 0.08;
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(peg.x, peg.y, peg.radius * 1.35 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(peg.x, peg.y, peg.radius * pulse, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawFlash(ctx, state) {
  for (const flash of state.pegFlash) {
    const t = flash.life / 0.4;
    ctx.strokeStyle =
      flash.kind === "orange"
        ? `rgba(255, 177, 90, ${t})`
        : `rgba(126, 210, 255, ${t})`;
    ctx.lineWidth = 5 * t;
    ctx.beginPath();
    ctx.arc(flash.x, flash.y, 18 + (1 - t) * 20, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawBucket(ctx, state) {
  const { x, y, width, height } = state.bucket;
  ctx.fillStyle = "#0d1835";
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = "#ffe27c";
  ctx.fillRect(x + 6, y + 4, width - 12, height - 8);
  ctx.fillStyle = "rgba(255, 226, 124, 0.3)";
  ctx.fillRect(x + width * 0.2, y - 10, width * 0.6, 6);
}

function drawBall(ctx, state) {
  for (const point of state.ballTrail) {
    ctx.fillStyle = `rgba(255, 255, 255, ${point.life * 0.5})`;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 5 * point.life, 0, Math.PI * 2);
    ctx.fill();
  }
  if (!state.ball) {
    return;
  }
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(state.ball.x, state.ball.y, state.ball.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#7dd6ff";
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawMessage(ctx, state) {
  ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
  ctx.font = "600 20px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(state.message, state.width / 2, state.height - 84);
}

export function render(ctx, state) {
  drawBackground(ctx, state);
  drawGuide(ctx, state);
  drawPegs(ctx, state);
  drawFlash(ctx, state);
  drawBucket(ctx, state);
  drawCannon(ctx, state);
  drawBall(ctx, state);
  drawMessage(ctx, state);
}
