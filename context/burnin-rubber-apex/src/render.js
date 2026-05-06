import { getRoadCenter, getRoadCurve } from "./data.js";

export function renderGame(ctx, frame, size) {
  const width = size.width;
  const height = size.height;
  ctx.clearRect(0, 0, width, height);
  drawBackdrop(ctx, width, height);
  drawRoad(ctx, frame, width, height);
  drawCheckpointGate(ctx, frame, width, height);
  drawCars(ctx, frame, width, height);
  drawPlayer(ctx, frame, width, height);
  drawBoostLines(ctx, frame, width, height);
}

function drawBackdrop(ctx, width, height) {
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#08111b");
  sky.addColorStop(0.56, "#122233");
  sky.addColorStop(1, "#0c0d14");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "rgba(255, 163, 98, 0.18)";
  ctx.beginPath();
  ctx.moveTo(0, height * 0.25);
  ctx.lineTo(width * 0.32, height * 0.1);
  ctx.lineTo(width * 0.58, height * 0.24);
  ctx.lineTo(width, height * 0.12);
  ctx.lineTo(width, 0);
  ctx.lineTo(0, 0);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#17291d";
  ctx.fillRect(0, height * 0.56, width, height * 0.44);
}

function drawRoad(ctx, frame, width, height) {
  const horizon = height * 0.18;
  const roadBottom = height * 0.96;
  const segments = frame.segments;
  for (let i = segments.length - 2; i >= 0; i -= 1) {
    const near = projectSegment(segments[i], frame.distance, width, horizon, roadBottom, i, segments.length);
    const far = projectSegment(segments[i + 1], frame.distance, width, horizon, roadBottom, i + 1, segments.length);
    if (!near || !far) continue;

    ctx.fillStyle = i % 2 === 0 ? "#29323b" : "#252c35";
    quad(ctx, near.left, near.y, near.right, near.y, far.right, far.y, far.left, far.y);

    ctx.fillStyle = "#8b957d";
    quad(ctx, near.left - near.shoulder, near.y, near.left, near.y, far.left, far.y, far.left - far.shoulder, far.y);
    quad(ctx, near.right, near.y, near.right + near.shoulder, near.y, far.right + far.shoulder, far.y, far.right, far.y);

    if (segments[i].checkpoint) {
      ctx.fillStyle = "rgba(122, 255, 213, 0.28)";
      quad(
        ctx,
        near.left + near.width * 0.1,
        near.y,
        near.right - near.width * 0.1,
        near.y,
        far.right - far.width * 0.1,
        far.y,
        far.left + far.width * 0.1,
        far.y
      );
    }

    ctx.fillStyle = i % 3 === 0 ? "#d8d4c2" : "#eb5e55";
    const stripeWidthNear = near.width * 0.04;
    const stripeWidthFar = far.width * 0.04;
    quad(
      ctx,
      near.left + near.width * 0.36,
      near.y,
      near.left + near.width * 0.36 + stripeWidthNear,
      near.y,
      far.left + far.width * 0.36 + stripeWidthFar,
      far.y,
      far.left + far.width * 0.36,
      far.y
    );
    quad(
      ctx,
      near.right - near.width * 0.36 - stripeWidthNear,
      near.y,
      near.right - near.width * 0.36,
      near.y,
      far.right - far.width * 0.36,
      far.y,
      far.right - far.width * 0.36 - stripeWidthFar,
      far.y
    );
  }
}

function drawCheckpointGate(ctx, frame, width, height) {
  if (frame.mode !== "running") return;
  const nextGate = frame.nextCheckpoint;
  if (!nextGate) return;

  const horizon = height * 0.18;
  const roadBottom = height * 0.96;
  const projection = projectSegment(
    { distance: nextGate.distance, center: getRoadCenter(nextGate.distance), curve: getRoadCurve(nextGate.distance) },
    frame.distance,
    width,
    horizon,
    roadBottom,
    0,
    1
  );
  if (!projection) return;

  const markerColor = nextGate.isFinish ? "#ffd866" : "#7affd1";
  const pulse = 0.5 + 0.5 * Math.sin(frame.distance * 0.015);
  const postInset = projection.width * 0.16;
  const postHeight = clamp(lerp(18, 110, 1 - clamp(nextGate.remaining / 900, 0, 1)), 18, 110);
  const leftX = projection.left + postInset;
  const rightX = projection.right - postInset;
  const topY = projection.y - postHeight;
  ctx.save();
  ctx.strokeStyle = markerColor;
  ctx.lineWidth = clamp(projection.width * 0.055, 3, 10);
  ctx.shadowColor = markerColor;
  ctx.shadowBlur = 14 + pulse * 10;
  ctx.beginPath();
  ctx.moveTo(leftX, projection.y);
  ctx.lineTo(leftX, topY);
  ctx.moveTo(rightX, projection.y);
  ctx.lineTo(rightX, topY);
  ctx.moveTo(leftX, topY);
  ctx.lineTo(rightX, topY);
  ctx.stroke();
  ctx.restore();

  drawCheckpointBanner(ctx, nextGate, width, height, markerColor);
}

function drawCheckpointBanner(ctx, nextGate, width, height, markerColor) {
  const label = nextGate.isFinish ? "Finish gate" : "Next gate";
  const setup =
    nextGate.turnHint === "left"
      ? "setup left"
      : nextGate.turnHint === "right"
        ? "setup right"
        : "hold center";
  const text = `${label} ${Math.ceil(nextGate.remaining)}m | ${setup}`;
  ctx.save();
  ctx.font = "600 18px 'Trebuchet MS', sans-serif";
  const textWidth = ctx.measureText(text).width;
  const cardWidth = textWidth + 34;
  const cardHeight = 36;
  const x = width * 0.5 - cardWidth * 0.5;
  const y = height * 0.08;
  ctx.fillStyle = "rgba(6, 16, 24, 0.72)";
  roundRect(ctx, x, y, cardWidth, cardHeight, 18);
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, cardWidth, cardHeight, 18);
  ctx.stroke();
  ctx.fillStyle = markerColor;
  ctx.fillText(text, x + 17, y + 24);
  ctx.restore();
}

function drawCars(ctx, frame, width, height) {
  for (const car of frame.traffic) {
    const rel = car.distance - frame.distance;
    if (rel < -30 || rel > 500) continue;
    const projected = projectActor(rel, car.lane, width, height);
    ctx.save();
    ctx.translate(projected.x, projected.y);
    ctx.scale(projected.scale, projected.scale);
    ctx.fillStyle = car.hit > 0 ? "#fff4c1" : car.color;
    ctx.fillRect(-22, -15, 44, 30);
    ctx.fillStyle = "#101924";
    ctx.fillRect(-12, -8, 24, 12);
    ctx.restore();
  }

  for (const rival of frame.rivals) {
    if (!rival.active && rival.blaze <= 0) continue;
    const rel = rival.distance - frame.distance;
    if (rel < -60 || rel > 520) continue;
    const projected = projectActor(rel, rival.lane, width, height);
    ctx.save();
    ctx.translate(projected.x, projected.y);
    ctx.scale(projected.scale * 1.06, projected.scale * 1.06);
    ctx.fillStyle = rival.active ? rival.color : `rgba(255, 210, 82, ${Math.max(0.15, rival.blaze * 0.75)})`;
    ctx.beginPath();
    ctx.moveTo(0, -20);
    ctx.lineTo(28, -2);
    ctx.lineTo(20, 18);
    ctx.lineTo(-20, 18);
    ctx.lineTo(-28, -2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#0b1016";
    ctx.fillRect(-10, -6, 20, 12);
    ctx.restore();
  }
}

function drawPlayer(ctx, frame, width, height) {
  const x = width * 0.5 + frame.lane * width * 0.22;
  const y = height * 0.8;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-frame.lane * 0.18);
  ctx.fillStyle = "#ff5c5c";
  ctx.beginPath();
  ctx.moveTo(0, -38);
  ctx.lineTo(26, -8);
  ctx.lineTo(24, 32);
  ctx.lineTo(-24, 32);
  ctx.lineTo(-26, -8);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#ffd866";
  ctx.fillRect(-10, -16, 20, 18);
  ctx.fillStyle = "#ffe7ad";
  ctx.fillRect(-4, -34, 8, 10);
  ctx.restore();
}

function drawBoostLines(ctx, frame, width, height) {
  const intensity = Math.max(frame.boost, frame.driftCharge * 0.65);
  if (intensity <= 0.06) return;
  ctx.save();
  ctx.strokeStyle = `rgba(122, 255, 209, ${0.15 + intensity * 0.35})`;
  ctx.lineWidth = 2 + intensity * 3;
  for (let i = 0; i < 8; i += 1) {
    const x = width * (0.16 + i * 0.1) + Math.sin(i + frame.distance * 0.01) * 10;
    ctx.beginPath();
    ctx.moveTo(x, height * 0.94);
    ctx.lineTo(x + frame.lane * 18, height * (0.58 + i * 0.02));
    ctx.stroke();
  }
  ctx.restore();
}

function projectSegment(segment, baseDistance, width, horizon, roadBottom, index, total) {
  const rel = segment.distance - baseDistance;
  if (rel < -40) return null;
  const depth = clamp(rel / 800, 0, 1);
  const perspective = 1 - depth;
  const y = lerp(roadBottom, horizon, depth);
  const roadWidth = lerp(width * 0.42, width * 0.04, depth);
  const center = width * 0.5 + (segment.center - 0) * (0.62 - depth * 0.34);
  return {
    y,
    left: center - roadWidth,
    right: center + roadWidth,
    width: roadWidth * 2,
    shoulder: roadWidth * 0.18,
    perspective,
  };
}

function projectActor(rel, lane, width, height) {
  const depth = clamp(rel / 520, 0, 1);
  const scale = lerp(1.4, 0.28, depth);
  const y = lerp(height * 0.82, height * 0.28, depth);
  const x = width * 0.5 + lane * lerp(width * 0.24, width * 0.06, depth);
  return { x, y, scale };
}

function quad(ctx, x0, y0, x1, y1, x2, y2, x3, y3) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y3);
  ctx.closePath();
  ctx.fill();
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}
