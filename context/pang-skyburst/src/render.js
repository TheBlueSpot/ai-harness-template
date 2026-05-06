export function renderFrame(ctx, state) {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);

  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#0d2035");
  sky.addColorStop(1, "#050a11");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  drawStars(ctx, width, height);
  drawArena(ctx, width, height);
  drawPlatforms(ctx, width, height, state.platforms || []);
  drawBlobs(ctx, width, height, state.blobs || []);
  drawTether(ctx, width, height, state.harpoon, state.player);
  drawPlayer(ctx, width, height, state.player);
  drawFooterCue(ctx, width, height, state);
}

function drawStars(ctx, width, height) {
  ctx.fillStyle = "rgba(170, 220, 255, 0.18)";
  for (let i = 0; i < 18; i += 1) {
    const x = (i * 97) % width;
    const y = ((i * 149) % height) * 0.46;
    ctx.fillRect(x, y, 2, 2);
  }
}

function drawArena(ctx, width, height) {
  const margin = Math.min(width, height) * 0.08;
  ctx.fillStyle = "rgba(7, 13, 22, 0.82)";
  ctx.fillRect(margin, margin, width - margin * 2, height - margin * 1.5);
  ctx.strokeStyle = "rgba(135, 240, 255, 0.35)";
  ctx.lineWidth = Math.max(2, Math.min(width, height) * 0.004);
  ctx.strokeRect(margin, margin, width - margin * 2, height - margin * 1.5);
}

function drawPlatforms(ctx, width, height, platforms) {
  ctx.fillStyle = "rgba(125, 171, 209, 0.25)";
  for (const platform of platforms) {
    const x = width * platform.x;
    const y = height * platform.y;
    const w = width * (platform.w ?? platform.width ?? 0);
    ctx.fillRect(x, y, w, Math.max(10, height * 0.015));
  }
}

function drawBlobs(ctx, width, height, blobs) {
  for (const blob of blobs) {
    const x = width * blob.x;
    const y = height * blob.y;
    const radius = Math.max(12, Math.min(width, height) * blob.radius);
    const hue = 192 + (blob.size ?? blob.tier ?? 1) * 12;
    const fill = ctx.createRadialGradient(x - radius * 0.28, y - radius * 0.28, radius * 0.2, x, y, radius);
    fill.addColorStop(0, `hsla(${hue}, 100%, 74%, 0.96)`);
    fill.addColorStop(1, `hsla(${hue + 12}, 80%, 48%, 0.78)`);
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.26)";
    ctx.lineWidth = Math.max(2, radius * 0.08);
    ctx.stroke();
  }
}

function drawTether(ctx, width, height, harpoon, player) {
  if (!harpoon?.active || !player) return;
  const x = width * harpoon.x;
  const top = height * harpoon.y;
  const bottom = height * (player.y - player.height * 0.5);
  ctx.strokeStyle = "rgba(255, 209, 102, 0.92)";
  ctx.lineWidth = Math.max(3, width * 0.004);
  ctx.beginPath();
  ctx.moveTo(x, top);
  ctx.lineTo(x, bottom);
  ctx.stroke();
  ctx.fillStyle = "rgba(255, 239, 194, 0.95)";
  ctx.fillRect(x - 2, top - 10, 4, 20);
}

function drawPlayer(ctx, width, height, player) {
  if (!player) return;
  const x = width * player.x;
  const y = height * player.y;
  const w = width * player.width;
  const h = height * player.height;
  ctx.fillStyle = "#d7f3ff";
  ctx.fillRect(x - w / 2, y - h / 2, w, h);
  ctx.fillStyle = "rgba(47, 108, 168, 0.95)";
  const handOffset = Math.max(3, w * 0.26);
  ctx.fillRect(x + handOffset * player.facing, y - h * 0.35, Math.max(4, w * 0.12), h * 0.7);
  ctx.fillStyle = "rgba(255, 209, 102, 0.95)";
  ctx.fillRect(x - w * 0.08, y - h * 0.18, w * 0.16, h * 0.36);
}

function drawFooterCue(ctx, width, height, state) {
  const text = state.mode === "play" ? "Tether above. Blobs split on contact." : "Press Start.";
  ctx.fillStyle = "rgba(6, 12, 20, 0.72)";
  ctx.fillRect(width * 0.5 - 160, height - 46, 320, 26);
  ctx.fillStyle = "#87f0ff";
  ctx.font = "600 14px Trebuchet MS, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, width * 0.5, height - 33);
}
