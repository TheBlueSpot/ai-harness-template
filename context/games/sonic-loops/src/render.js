const SKY_TOP = "#09111f";
const SKY_BOTTOM = "#1f3558";
const TRACK = "#5e6a74";
const TRACK_EDGE = "#f2c46e";
const INK = "#e7eef6";
const SONIC = "#4ed0ff";
const RING = "#ffd64f";
const HAZARD = "#ff6a5c";

export function renderFrame(ctx, frameState, viewport) {
  const w = viewport.width || ctx.canvas.clientWidth || 1280;
  const h = viewport.height || ctx.canvas.clientHeight || 720;
  const camera = frameState.camera || { x: 0, y: 0 };
  ctx.clearRect(0, 0, w, h);
  drawSky(ctx, w, h, viewport.time || 0);
  drawTerrain(ctx, frameState.surfaces || [], camera, w, h);
  drawLoop(ctx, frameState.loop, camera);
  drawRings(ctx, frameState.ringsList || [], camera);
  drawRingScatter(ctx, frameState.ringScatter || [], camera);
  drawHazards(ctx, frameState.hazards || [], camera);
  drawFinish(ctx, frameState.finish, camera, h);
  drawPlayer(ctx, frameState.player || {}, camera);
  drawSpeedTrails(ctx, frameState.player || {}, camera);
}

function drawSky(ctx, w, h, time) {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, SKY_TOP);
  sky.addColorStop(1, SKY_BOTTOM);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  for (let i = 0; i < 12; i += 1) ctx.fillRect(((i * 160) + time * 18) % (w + 120) - 60, 70 + (i % 4) * 28, 80, 3);
}

function drawTerrain(ctx, surfaces, camera, w, h) {
  ctx.fillStyle = TRACK;
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (const surface of surfaces) {
    if (surface.kind === "loop") {
      const start = Math.PI * 1.05;
      const end = Math.PI * -0.05;
      for (let i = 0; i <= 32; i += 1) {
        const t = i / 32;
        const angle = start + (end - start) * t;
        ctx.lineTo(
          surface.centerX + Math.cos(angle) * surface.radius - camera.x,
          surface.centerY + Math.sin(angle) * surface.radius,
        );
      }
      continue;
    }

    const y1 = surface.kind === "flat" ? surface.y : surface.y1;
    const y2 = surface.kind === "flat" ? surface.y : surface.y2;
    ctx.lineTo(surface.startX - camera.x, y1);
    ctx.lineTo(surface.endX - camera.x, y2);
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = TRACK_EDGE;
  ctx.lineWidth = 6;
  ctx.stroke();
}

function drawLoop(ctx, loop, camera) {
  if (!loop) return;
  ctx.strokeStyle = "rgba(255,214,79,0.6)";
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(loop.centerX - camera.x, loop.centerY, loop.radius, Math.PI * 0.15, Math.PI * 1.85);
  ctx.stroke();
}

function drawRings(ctx, rings, camera) {
  for (const ring of rings) {
    if (ring.collected) continue;
    ctx.strokeStyle = RING;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(ring.x - camera.x, ring.y, 11, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawRingScatter(ctx, rings, camera) {
  ctx.strokeStyle = "rgba(255,214,79,0.65)";
  ctx.lineWidth = 4;
  for (const ring of rings) {
    ctx.beginPath();
    ctx.arc(ring.x - camera.x, ring.y, ring.radius || 7, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawHazards(ctx, hazards, camera) {
  for (const hazard of hazards) {
    ctx.fillStyle = HAZARD;
    ctx.beginPath();
    ctx.arc(hazard.x - camera.x, hazard.y, hazard.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawFinish(ctx, finish, camera, h) {
  if (!finish) return;
  const x = finish.x - camera.x;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(x, h - 30);
  ctx.lineTo(x, 290);
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.fillRect(x - 18, 290, 36, 18);
}

function drawPlayer(ctx, player, camera) {
  ctx.save();
  ctx.translate((player.x || 0) - camera.x, player.y || 0);
  ctx.fillStyle = SONIC;
  ctx.beginPath();
  ctx.arc(0, 0, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.restore();
}

function drawSpeedTrails(ctx, player, camera) {
  const speed = Math.abs(player.vx || 0);
  if (speed < 180) return;
  const x = (player.x || 0) - camera.x;
  const y = player.y || 0;
  ctx.strokeStyle = `rgba(78, 208, 255, ${Math.min(0.35, speed / 1500)})`;
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.moveTo(x - 24, y + 6);
  ctx.lineTo(Math.max(-80, x - speed * 0.08), y + Math.sin(speed * 0.02) * 8);
  ctx.stroke();
}
