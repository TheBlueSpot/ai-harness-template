import { segments } from "./track.js";

export function renderFrame(ctx, frame) {
  const { width, height, worldOffset } = frame;
  ctx.clearRect(0, 0, width, height);

  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#0b1730");
  sky.addColorStop(0.55, "#204a70");
  sky.addColorStop(1, "#7d4b1f");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  drawHills(ctx, width, height, worldOffset);
  drawTrack(ctx, frame);
  drawRider(ctx, frame);
  drawHudEcho(ctx, frame);
  drawOverlayHint(ctx, frame);
}

function drawHills(ctx, width, height, worldOffset) {
  ctx.fillStyle = "#17304f";
  ctx.beginPath();
  ctx.moveTo(0, height);
  for (let x = -80; x <= width + 80; x += 80) {
    const worldX = x + worldOffset * 0.2;
    ctx.lineTo(x, 250 + Math.sin(worldX / 180) * 20);
  }
  ctx.lineTo(width, height);
  ctx.closePath();
  ctx.fill();
}

function drawTrack(ctx, frame) {
  const { width, height, worldOffset } = frame;
  ctx.save();
  ctx.translate(-worldOffset, 0);
  ctx.fillStyle = "#4a3422";
  ctx.beginPath();
  ctx.moveTo(0, height);
  for (const segment of segments) {
    ctx.lineTo(segment.x, segment.y);
  }
  ctx.lineTo(segments[segments.length - 1].x, height);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "#f7d08a";
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(0, segments[0].y - 1);
  for (const segment of segments) ctx.lineTo(segment.x, segment.y - 1);
  ctx.stroke();

  ctx.strokeStyle = "#1f130d";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, segments[0].y);
  for (const segment of segments) ctx.lineTo(segment.x, segment.y);
  ctx.stroke();

  ctx.fillStyle = "#9b6c3e";
  for (let x = 0; x < frame.track.length; x += 240) {
    const y = segmentYAt(x);
    ctx.fillRect(x + 96, y - 12, 10, 24);
  }
  ctx.restore();
}

function drawRider(ctx, frame) {
  const x = 120;
  const y = frame.sampledGround - 24;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(frame.rider.lean * 0.35);
  ctx.fillStyle = "#e2e8f0";
  ctx.fillRect(-16, -20, 32, 18);
  ctx.fillStyle = "#ef4444";
  ctx.fillRect(-10, -34, 20, 12);
  ctx.fillStyle = "#111827";
  ctx.fillRect(-20, -2, 44, 8);
  ctx.restore();
}

function drawHudEcho(ctx, frame) {
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(18, 18, 120, 4);
  ctx.fillRect(18, 28, 96, 4);
  ctx.fillRect(18, 38, 140, 4);
  if (frame.mode !== "play") {
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.fillRect(0, 0, frame.width, frame.height);
  }
}

function drawOverlayHint(ctx, frame) {
  if (frame.mode === "play") return;
  ctx.fillStyle = "rgba(7, 17, 31, 0.75)";
  ctx.fillRect(0, 0, frame.width, frame.height);
}

function segmentYAt(x) {
  for (let i = 0; i < segments.length - 1; i += 1) {
    const left = segments[i];
    const right = segments[i + 1];
    if (x >= left.x && x <= right.x) {
      const t = (x - left.x) / Math.max(1, right.x - left.x);
      return left.y + (right.y - left.y) * t;
    }
  }
  return segments[segments.length - 1].y;
}
