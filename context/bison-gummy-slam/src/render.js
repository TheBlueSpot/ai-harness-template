const BG = ["#1b1020", "#37203a"];
const GUMMY = "#ffcc6b";
const GUMMY_DARK = "#d68a37";
const BISON = "#ffe9b5";
const SLAM = "#ff7a59";

export function renderFrame(ctx, frameState, viewport) {
  const w = viewport.width || ctx.canvas.clientWidth || 1280;
  const h = viewport.height || ctx.canvas.clientHeight || 720;
  ctx.clearRect(0, 0, w, h);
  drawBackground(ctx, w, h, viewport.time || 0);
  drawTrack(ctx, w, h, frameState.queueItems || [], viewport.time || 0);
  drawQueue(ctx, frameState.queueItems || []);
  drawPlayer(ctx, frameState.player || {});
  drawSpeed(ctx, frameState.speed || 0, frameState.player || {});
  drawResultPulse(ctx, frameState.overlay, w, h);
}

function drawBackground(ctx, w, h, time) {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, BG[0]);
  grad.addColorStop(1, BG[1]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  for (let i = 0; i < 18; i += 1) ctx.fillRect(((i * 120) + time * 32) % (w + 120) - 60, 80 + (i % 5) * 34, 84, 2);
}

function drawTrack(ctx, w, h, queue, time) {
  ctx.fillStyle = "rgba(12, 10, 17, 0.48)";
  ctx.beginPath();
  ctx.roundRect(80, h * 0.58, w - 160, 160, 36);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,220,140,0.35)";
  ctx.lineWidth = 2;
  ctx.stroke();
  const guides = queue.filter((item) => item.laneGuide);
  const pulse = 0.4 + 0.2 * Math.sin(time * 8);
  for (const item of guides) {
    ctx.fillStyle = `rgba(255, 122, 89, ${item.target ? 0.2 + pulse * 0.18 : 0.08 + pulse * 0.08})`;
    ctx.beginPath();
    ctx.roundRect(item.x - 52, item.y + 24, 104, 14, 10);
    ctx.fill();
  }
}

function drawQueue(ctx, queue) {
  for (const item of queue) {
    ctx.save();
    ctx.translate(item.x, item.y);
    ctx.fillStyle = item.gummy === "boss" ? SLAM : GUMMY;
    ctx.strokeStyle = GUMMY_DARK;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, 0, item.gummy === "boss" ? 26 : 18, item.gummy === "boss" ? 19 : 14, 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (item.target) {
      ctx.strokeStyle = "rgba(255, 212, 106, 0.9)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, item.gummy === "boss" ? 34 : 26, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "rgba(255, 212, 106, 0.9)";
      ctx.beginPath();
      ctx.moveTo(0, -42);
      ctx.lineTo(-10, -56);
      ctx.lineTo(10, -56);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawPlayer(ctx, player) {
  ctx.save();
  ctx.translate(player.x || 0, player.y || 0);
  ctx.fillStyle = BISON;
  ctx.beginPath();
  ctx.arc(0, 0, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#6a4218";
  ctx.fillRect(-18, -10, 10, 20);
  ctx.fillRect(8, -10, 10, 20);
  if (player.slamReady && player.totalLaunches > 0 && !player.grounded) {
    const windowAlpha = Math.max(0, 1 - (player.slamTimer || 0) / 0.32);
    ctx.strokeStyle = `rgba(255, 212, 106, ${0.2 + windowAlpha * 0.65})`;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(0, 0, 40 + windowAlpha * 4, -Math.PI * 0.2, Math.PI * 1.2);
    ctx.stroke();
  }
  if (player.slamActive) {
    ctx.strokeStyle = "rgba(255, 122, 89, 0.95)";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(0, 0, 48, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawSpeed(ctx, speed, player) {
  const strength = Math.min(1, speed / 1.8);
  ctx.strokeStyle = `rgba(255,122,89,${0.15 + strength * 0.45})`;
  ctx.lineWidth = 16;
  ctx.beginPath();
  ctx.moveTo((player.x || 0) - 56, (player.y || 0) + 18);
  ctx.lineTo((player.x || 0) - 120 - strength * 140, (player.y || 0) + 12);
  ctx.stroke();
}

function drawResultPulse(ctx, overlay, w, h) {
  if (!overlay) return;
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(255,122,89,0.8)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(w * 0.5, h * 0.36, 96, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
