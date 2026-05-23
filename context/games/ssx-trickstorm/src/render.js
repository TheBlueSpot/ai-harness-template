import { sampleTerrain } from "./track.js";

const LANE_OFFSETS = [-36, 0, 36];

function drawBackdrop(ctx, width, height) {
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#102245");
  sky.addColorStop(0.5, "#2c5f8c");
  sky.addColorStop(1, "#d7ecff");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "rgba(255,255,255,0.18)";
  for (let i = 0; i < 7; i += 1) {
    ctx.beginPath();
    ctx.ellipse(140 + i * 180, 110 + (i % 3) * 28, 100, 28, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "#17355b";
  ctx.beginPath();
  ctx.moveTo(0, height * 0.42);
  for (let x = 0; x <= width; x += 60) {
    const y = height * 0.42 + Math.sin(x / 120) * 18 + Math.cos(x / 70) * 12;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(width, 0);
  ctx.lineTo(0, 0);
  ctx.closePath();
  ctx.fill();
}

function worldToScreen(frame, x, y, lane = 1) {
  const screenX = x - frame.cameraX;
  const terrainOffset = LANE_OFFSETS[lane] ?? 0;
  return {
    x: screenX,
    y: y + terrainOffset,
  };
}

function drawTerrain(ctx, frame) {
  const { width, height } = frame;
  const floorGradient = ctx.createLinearGradient(0, height * 0.45, 0, height);
  floorGradient.addColorStop(0, "#eef7ff");
  floorGradient.addColorStop(0.52, "#d0e6f7");
  floorGradient.addColorStop(1, "#8eb7d6");

  ctx.fillStyle = floorGradient;
  ctx.beginPath();
  ctx.moveTo(0, height);
  for (let screenX = -20; screenX <= width + 20; screenX += 16) {
    const worldX = frame.cameraX + screenX;
    const y = sampleTerrain(worldX);
    ctx.lineTo(screenX, y + 64);
  }
  ctx.lineTo(width, height);
  ctx.closePath();
  ctx.fill();

  for (let lane = 0; lane < 3; lane += 1) {
    ctx.strokeStyle = lane === 1 ? "rgba(255,255,255,0.62)" : "rgba(255,255,255,0.28)";
    ctx.lineWidth = lane === 1 ? 5 : 3;
    ctx.beginPath();
    for (let screenX = -20; screenX <= width + 20; screenX += 16) {
      const worldX = frame.cameraX + screenX;
      const y = sampleTerrain(worldX) + LANE_OFFSETS[lane];
      if (screenX === -20) {
        ctx.moveTo(screenX, y);
      } else {
        ctx.lineTo(screenX, y);
      }
    }
    ctx.stroke();
  }
}

function drawRamp(ctx, frame, ramp) {
  const p1 = worldToScreen(frame, ramp.x, sampleTerrain(ramp.x), 1);
  const p2 = worldToScreen(frame, ramp.x + ramp.width * 0.5, sampleTerrain(ramp.x + ramp.width * 0.5), 1);
  const p3 = worldToScreen(frame, ramp.x + ramp.width, sampleTerrain(ramp.x + ramp.width), 1);

  ctx.fillStyle = "rgba(232, 108, 55, 0.9)";
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y + 18);
  ctx.lineTo(p2.x, p2.y - 12);
  ctx.lineTo(p3.x, p3.y + 18);
  ctx.closePath();
  ctx.fill();
}

function drawHazard(ctx, frame, hazard) {
  const pos = worldToScreen(frame, hazard.x, sampleTerrain(hazard.x), hazard.lane);
  if (hazard.type === "tree") {
    ctx.fillStyle = "#1d6733";
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y - 42);
    ctx.lineTo(pos.x - 24, pos.y + 10);
    ctx.lineTo(pos.x + 24, pos.y + 10);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#5d3118";
    ctx.fillRect(pos.x - 4, pos.y + 8, 8, 18);
  } else if (hazard.type === "rock") {
    ctx.fillStyle = "#5d7389";
    ctx.beginPath();
    ctx.arc(pos.x, pos.y + 4, 16, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.strokeStyle = "#b8f4ff";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y + 2, 18, Math.PI * 0.15, Math.PI * 0.92);
    ctx.stroke();
  }
}

function drawPickup(ctx, frame, pickup) {
  const pos = worldToScreen(frame, pickup.x, sampleTerrain(pickup.x), pickup.lane);
  ctx.fillStyle = "#f4ff8a";
  ctx.beginPath();
  ctx.moveTo(pos.x, pos.y - 20);
  ctx.lineTo(pos.x - 15, pos.y);
  ctx.lineTo(pos.x, pos.y + 18);
  ctx.lineTo(pos.x + 15, pos.y);
  ctx.closePath();
  ctx.fill();
}

function drawGate(ctx, frame, gate) {
  const left = worldToScreen(frame, gate.x, sampleTerrain(gate.x), 0);
  const right = worldToScreen(frame, gate.x, sampleTerrain(gate.x), 2);

  ctx.strokeStyle = "#ff6a7d";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(left.x, left.y - 60);
  ctx.lineTo(left.x, left.y + 10);
  ctx.moveTo(right.x, right.y - 60);
  ctx.lineTo(right.x, right.y + 10);
  ctx.moveTo(left.x, left.y - 60);
  ctx.lineTo(right.x, right.y - 60);
  ctx.stroke();
}

function drawRider(ctx, frame) {
  const rider = frame.rider;
  const pos = worldToScreen(frame, rider.x, rider.y, Math.round(rider.lane));

  ctx.save();
  ctx.translate(pos.x, pos.y - 26);
  ctx.rotate((rider.angle * Math.PI) / 180);

  ctx.fillStyle = "#16161f";
  ctx.fillRect(-32, 18, 64, 6);

  ctx.fillStyle = "#de3342";
  ctx.fillRect(-10, -28, 20, 28);
  ctx.fillStyle = "#ffe9bf";
  ctx.beginPath();
  ctx.arc(0, -38, 12, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#0f1115";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-4, 0);
  ctx.lineTo(-18, 18);
  ctx.moveTo(4, 0);
  ctx.lineTo(18, 18);
  ctx.moveTo(-4, -16);
  ctx.lineTo(-22, -2);
  ctx.moveTo(4, -16);
  ctx.lineTo(22, -6);
  ctx.stroke();
  ctx.restore();

  if (!rider.grounded) {
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.setLineDash([10, 10]);
    ctx.beginPath();
    ctx.arc(pos.x, pos.y - 26, 44, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

export function renderFrame(ctx, frame) {
  ctx.clearRect(0, 0, frame.width, frame.height);
  drawBackdrop(ctx, frame.width, frame.height);
  drawTerrain(ctx, frame);

  for (const ramp of frame.viewport.ramps) {
    drawRamp(ctx, frame, ramp);
  }
  for (const gate of frame.viewport.gates) {
    drawGate(ctx, frame, gate);
  }
  for (const pickup of frame.viewport.pickups) {
    drawPickup(ctx, frame, pickup);
  }
  for (const hazard of frame.viewport.hazards) {
    drawHazard(ctx, frame, hazard);
  }

  drawRider(ctx, frame);

  ctx.fillStyle = "rgba(15, 23, 42, 0.72)";
  ctx.fillRect(frame.width - 232, frame.height - 82, 192, 42);
  ctx.fillStyle = "#eaf7ff";
  ctx.font = "600 18px Arial";
  ctx.fillText(`Finish ${Math.max(0, Math.round(frame.trackLength - frame.rider.x))} m`, frame.width - 212, frame.height - 54);
}
