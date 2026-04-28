const VIEW_W = 1280;
const VIEW_H = 720;

function worldToScreen(x, y, camera) {
  return {
    x: x - camera.x + VIEW_W * 0.5,
    y: y - camera.y + VIEW_H * 0.5,
  };
}

function drawRoundedPanel(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function render(ctx, frame) {
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);

  const bg = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  bg.addColorStop(0, "#0a1321");
  bg.addColorStop(1, "#05070c");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  const grid = ctx.createLinearGradient(0, 0, VIEW_W, VIEW_H);
  grid.addColorStop(0, "#17253a");
  grid.addColorStop(1, "#0c1827");

  const { level, camera } = frame;

  ctx.save();
  ctx.translate(0, 0);
  for (let y = -200; y < 1600; y += 48) {
    const a = worldToScreen(-200, y, camera);
    const b = worldToScreen(1600, y, camera);
    ctx.strokeStyle = "rgba(157, 214, 255, 0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  for (let x = -200; x < 1600; x += 48) {
    const a = worldToScreen(x, -200, camera);
    const b = worldToScreen(x, 1600, camera);
    ctx.strokeStyle = "rgba(157, 214, 255, 0.05)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.restore();

  for (const wall of level.walls) {
    const p = worldToScreen(wall.x, wall.y, camera);
    const wallGradient = ctx.createLinearGradient(p.x, p.y, p.x + wall.w, p.y + wall.h);
    wallGradient.addColorStop(0, "#28405d");
    wallGradient.addColorStop(1, "#1a2940");
    ctx.fillStyle = wallGradient;
    ctx.fillRect(p.x, p.y, wall.w, wall.h);
    ctx.strokeStyle = "#8cd7ff";
    ctx.lineWidth = 2;
    ctx.strokeRect(p.x, p.y, wall.w, wall.h);
  }

  for (const pit of level.pits) {
    const p = worldToScreen(pit.x, pit.y, camera);
    const pitGrad = ctx.createRadialGradient(p.x, p.y, 10, p.x, p.y, pit.r);
    pitGrad.addColorStop(0, "#000000");
    pitGrad.addColorStop(0.7, "#06111c");
    pitGrad.addColorStop(1, "#163047");
    ctx.fillStyle = pitGrad;
    ctx.beginPath();
    ctx.arc(p.x, p.y, pit.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(120, 222, 255, 0.4)";
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  for (const bumper of level.bumpers) {
    const p = worldToScreen(bumper.x, bumper.y, camera);
    const grad = ctx.createRadialGradient(p.x - 4, p.y - 4, 2, p.x, p.y, bumper.r);
    grad.addColorStop(0, "#fff8b1");
    grad.addColorStop(0.5, "#ffb347");
    grad.addColorStop(1, "#b14a1c");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(p.x, p.y, bumper.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffe8a3";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  for (const gem of frame.gems) {
    if (gem.collected) {
      continue;
    }
    const p = worldToScreen(gem.x, gem.y, camera);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(performance.now() * 0.0025);
    ctx.fillStyle = "#78f7ff";
    ctx.beginPath();
    ctx.moveTo(0, -gem.r);
    ctx.lineTo(gem.r * 0.72, 0);
    ctx.lineTo(0, gem.r);
    ctx.lineTo(-gem.r * 0.72, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#e0ffff";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  for (let i = 0; i < level.checkpoints.length; i += 1) {
    const checkpoint = level.checkpoints[i];
    const p = worldToScreen(checkpoint.x, checkpoint.y, camera);
    const isCleared = i < frame.checkpointsCleared;
    const isNext = frame.nextCheckpoint === checkpoint;
    ctx.beginPath();
    ctx.arc(p.x, p.y, checkpoint.r, 0, Math.PI * 2);
    ctx.strokeStyle = isCleared ? "#74ffb1" : isNext ? "#f9ff7f" : "rgba(255,255,255,0.18)";
    ctx.lineWidth = isNext ? 6 : 4;
    ctx.stroke();
    if (isNext) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, checkpoint.r + 10 + Math.sin(performance.now() * 0.006) * 3, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(249,255,127,0.22)";
      ctx.lineWidth = 6;
      ctx.stroke();
    }
  }

  for (const gyro of frame.gyros) {
    const p = worldToScreen(gyro.x, gyro.y, camera);
    const dx = Math.cos(gyro.angle) * gyro.armLength;
    const dy = Math.sin(gyro.angle) * gyro.armLength;
    const a = worldToScreen(gyro.x - dx, gyro.y - dy, camera);
    const b = worldToScreen(gyro.x + dx, gyro.y + dy, camera);
    ctx.strokeStyle = "#ff7a7a";
    ctx.lineWidth = gyro.armWidth;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.fillStyle = "#ffd3d3";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 14, 0, Math.PI * 2);
    ctx.fill();
  }

  const marblePos = worldToScreen(frame.marble.x, frame.marble.y, camera);
  const marbleGrad = ctx.createRadialGradient(
    marblePos.x - 5,
    marblePos.y - 6,
    3,
    marblePos.x,
    marblePos.y,
    frame.marble.r + 4,
  );
  marbleGrad.addColorStop(0, "#ffffff");
  marbleGrad.addColorStop(0.45, "#9ed6ff");
  marbleGrad.addColorStop(1, "#1f5da0");
  ctx.fillStyle = marbleGrad;
  ctx.beginPath();
  ctx.arc(marblePos.x, marblePos.y, frame.marble.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#f6fbff";
  ctx.lineWidth = 2;
  ctx.stroke();

  const speedDir = Math.atan2(frame.marble.vy, frame.marble.vx || 0.0001);
  ctx.strokeStyle = "rgba(255,255,255,0.45)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(marblePos.x, marblePos.y);
  ctx.lineTo(
    marblePos.x + Math.cos(speedDir) * Math.min(44, frame.velocity * 0.15),
    marblePos.y + Math.sin(speedDir) * Math.min(44, frame.velocity * 0.15),
  );
  ctx.stroke();

  if (frame.nextCheckpoint) {
    const target = worldToScreen(frame.nextCheckpoint.x, frame.nextCheckpoint.y, camera);
    const dx = target.x - marblePos.x;
    const dy = target.y - marblePos.y;
    const dist = Math.hypot(dx, dy);
    const dirX = dx / Math.max(1, dist);
    const dirY = dy / Math.max(1, dist);
    ctx.strokeStyle = "rgba(249,255,127,0.45)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(marblePos.x + dirX * 28, marblePos.y + dirY * 28);
    ctx.lineTo(marblePos.x + dirX * Math.min(118, dist - 8), marblePos.y + dirY * Math.min(118, dist - 8));
    ctx.stroke();
  }

  drawRoundedPanel(ctx, 22, 612, 380, 86, 18);
  ctx.fillStyle = "rgba(6, 12, 20, 0.82)";
  ctx.fill();
  ctx.strokeStyle = "rgba(133, 212, 255, 0.28)";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = "#9ac6e8";
  ctx.font = "16px Arial";
  ctx.fillText(frame.stageName, 42, 640);
  ctx.fillStyle = "#f4fbff";
  ctx.font = "700 20px Arial";
  ctx.fillText(frame.message || "Tilt steady. Keep speed for the next line.", 42, 670);

  if (frame.mode === "lose" || frame.mode === "win") {
    ctx.fillStyle = "rgba(0, 0, 0, 0.42)";
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
}
