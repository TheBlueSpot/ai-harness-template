const BG = ["#1b1020", "#37203a"];
const GUMMY = "#ffcc6b";
const GUMMY_DARK = "#d68a37";
const BISON = "#ffe9b5";
const SLAM = "#ff7a59";

export function renderFrame(ctx, frameState, viewport) {
  const w = viewport.width || ctx.canvas.clientWidth || 1280;
  const h = viewport.height || ctx.canvas.clientHeight || 720;
  const cameraX = Math.max(0, (frameState.player?.x || 0) - w * 0.32);
  const nextTarget = (frameState.queueItems || []).find((item) => item.target);
  ctx.clearRect(0, 0, w, h);
  drawBackground(ctx, w, h, viewport.time || 0);
  drawTrack(ctx, w, h, frameState.queueItems || [], frameState.player || {}, viewport.time || 0, cameraX, nextTarget);
  drawQueue(ctx, frameState.queueItems || [], cameraX);
  drawPlayer(ctx, frameState.player || {}, cameraX);
  drawSpeed(ctx, frameState.speed || 0, frameState.player || {}, cameraX);
  drawCallout(ctx, frameState.callout, frameState.player || {}, cameraX, w);
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

function drawTrack(ctx, w, h, queue, player, time, cameraX, nextTarget) {
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
    const x = item.x - cameraX;
    ctx.fillStyle = `rgba(255, 122, 89, ${item.target ? 0.2 + pulse * 0.18 : 0.08 + pulse * 0.08})`;
    ctx.beginPath();
    ctx.roundRect(x - 52, item.y + 24, 104, 14, 10);
    ctx.fill();
    if (item.target) {
      ctx.strokeStyle = `rgba(255, 212, 106, ${0.42 + pulse * 0.45})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(x, item.y + 34, 66 + pulse * 14, 20 + pulse * 4, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  if (player.slamWindowLive && nextTarget) {
    const playerX = (player.x || 0) - cameraX;
    const targetX = nextTarget.x - cameraX;
    const beam = ctx.createLinearGradient(playerX, player.y || 0, targetX, nextTarget.y);
    beam.addColorStop(0, "rgba(255, 212, 106, 0.14)");
    beam.addColorStop(0.55, "rgba(255, 212, 106, 0.34)");
    beam.addColorStop(1, "rgba(255, 122, 89, 0.22)");
    ctx.strokeStyle = beam;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(playerX, (player.y || 0) + 26);
    ctx.lineTo(targetX, nextTarget.y - 8);
    ctx.stroke();
  }
}

function drawQueue(ctx, queue, cameraX) {
  for (const item of queue) {
    const x = item.x - cameraX;
    if (x < -80 || x > ctx.canvas.clientWidth + 80) continue;
    ctx.save();
    ctx.translate(x, item.y);
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

function drawPlayer(ctx, player, cameraX) {
  const x = (player.x || 0) - cameraX;
  ctx.save();
  ctx.translate(x, player.y || 0);
  ctx.fillStyle = BISON;
  ctx.beginPath();
  ctx.arc(0, 0, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#6a4218";
  ctx.fillRect(-18, -10, 10, 20);
  ctx.fillRect(8, -10, 10, 20);
  if (player.slamReady && player.totalLaunches > 0 && !player.grounded && (player.vy || 0) > 0) {
    const windowAlpha = Math.max(0, 1 - (player.slamTimer || 0) / (player.slamWindow || 0.32));
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

function drawSpeed(ctx, speed, player, cameraX) {
  const strength = Math.min(1, speed / 1.8);
  const x = (player.x || 0) - cameraX;
  ctx.strokeStyle = `rgba(255,122,89,${0.15 + strength * 0.45})`;
  ctx.lineWidth = 16;
  ctx.beginPath();
  ctx.moveTo(x - 56, (player.y || 0) + 18);
  ctx.lineTo(x - 120 - strength * 140, (player.y || 0) + 12);
  ctx.stroke();
}

function drawCallout(ctx, callout, player, cameraX, w) {
  if (!callout) return;
  const palette = {
    slam: { fill: "rgba(255, 122, 89, 0.92)", glow: "rgba(255, 122, 89, 0.22)" },
    opening: { fill: "rgba(255, 212, 106, 0.96)", glow: "rgba(255, 212, 106, 0.26)" },
    soft: { fill: "rgba(255, 244, 219, 0.92)", glow: "rgba(255, 244, 219, 0.18)" },
  };
  const tone = palette[callout.tone] || palette.soft;
  const x = Math.min(w - 120, Math.max(120, (player.x || 0) - cameraX));
  const y = Math.max(88, (player.y || 0) - 96);
  ctx.save();
  ctx.textAlign = "center";
  ctx.font = "700 26px Trebuchet MS";
  ctx.fillStyle = tone.glow;
  ctx.beginPath();
  ctx.roundRect(x - 102, y - 26, 204, 52, 22);
  ctx.fill();
  ctx.fillStyle = tone.fill;
  ctx.fillText(String(callout.text || "").toUpperCase(), x, y + 9);
  ctx.restore();
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
