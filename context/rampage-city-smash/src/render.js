import { STAGE } from "./data.js";

export function renderFrame(ctx, state) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);

  drawSky(ctx, w, h);
  drawBuildings(ctx, state.buildings ?? state.city?.skyline ?? [], w, h, state.camera ?? { x: 0, y: 0 });
  drawObjectiveMarker(ctx, state.objective, w, h, state.camera ?? { x: 0, y: 0 });
  drawDebris(ctx, state.debris ?? [], w, h);
  drawPickups(ctx, state.pickups ?? [], w, h, state.camera ?? { x: 0, y: 0 });
  drawEnemies(ctx, state.enemies ?? [], w, h, state.camera ?? { x: 0, y: 0 });
  drawPlayer(ctx, state.player ?? { x: 0, y: 0 }, w, h, state.camera ?? { x: 0, y: 0 });
  drawHudOverlay(ctx, state, w, h);
}

function drawSky(ctx, w, h) {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "#08111f");
  grad.addColorStop(0.6, "#13233c");
  grad.addColorStop(1, "#1d1010");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

function drawBuildings(ctx, buildings, w, h, camera) {
  const ground = h * 0.84;
  const scale = ground / STAGE.groundY;
  ctx.fillStyle = "#2f3645";
  ctx.fillRect(0, ground, w, h - ground);
  buildings.forEach((building, index) => {
    const segments = building.segments ?? [];
    segments.forEach((segment, segmentIndex) => {
      if (segment.destroyed) return;
      const segWidth = (segment.width ?? 88) * scale;
      const segHeight = (segment.height ?? 28) * scale;
      const x = (building.x ?? 0) - (camera.x ?? 0);
      const y = ground - (segmentIndex + 1) * segHeight;
      ctx.fillStyle = segment.color ?? (index % 2 === 0 ? "#4a556a" : "#394150");
      ctx.fillRect(x, y, segWidth, segHeight);
      if (segment.type === "window") {
        ctx.fillStyle = "#b9d7ff";
        for (let row = 0; row < 2; row += 1) {
          for (let col = 0; col < 3; col += 1) {
            ctx.fillRect(x + 10 * scale + col * 22 * scale, y + 7 * scale + row * 12 * scale, 10 * scale, 7 * scale);
          }
        }
      }
    });
    if (building.collapsed) {
      ctx.fillStyle = "rgba(255, 215, 102, 0.35)";
      ctx.fillRect((building.x ?? 0) - (camera.x ?? 0), ground - 16 * scale, 104 * scale, 16 * scale);
    }
  });
}

function drawPlayer(ctx, player, w, h, camera) {
  const ground = h * 0.84;
  const scale = ground / STAGE.groundY;
  const x = (player.x ?? 0) - (camera.x ?? 0);
  const y = (player.y ?? 0) * scale;
  ctx.fillStyle = "#f0a15f";
  ctx.beginPath();
  ctx.arc(x, y, 28 * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#4d1d1a";
  ctx.fillRect(x - 12 * scale, y - 6 * scale, 24 * scale, 12 * scale);
  ctx.fillRect(x - 18 * scale, y + 16 * scale, 36 * scale, 10 * scale);
}

function drawEnemies(ctx, enemies, w, h, camera) {
  const ground = h * 0.84;
  const scale = ground / STAGE.groundY;
  enemies.forEach((enemy) => {
    const x = (enemy.x ?? 0) - (camera.x ?? 0);
    const y = (enemy.y ?? 0) * scale;
    ctx.fillStyle = enemy.type === "helicopter" ? "#a7e0ff" : "#ffd46a";
    ctx.fillRect(x - 18 * scale, y - 8 * scale, 36 * scale, 16 * scale);
    ctx.fillRect(x - 8 * scale, y - 20 * scale, 16 * scale, 12 * scale);
    if (enemy.type === "tank") {
      ctx.fillRect(x - 24 * scale, ground - 16 * scale, 48 * scale, 16 * scale);
    }
  });
}

function drawDebris(ctx, debris, w, h) {
  const ground = h * 0.84;
  const scale = ground / STAGE.groundY;
  ctx.fillStyle = "#d8b07a";
  debris.forEach((chunk) => {
    ctx.globalAlpha = Math.max(0.15, chunk.life ?? 1);
    ctx.fillRect((chunk.x ?? 0) - 20, ground - (STAGE.groundY - (chunk.y ?? 0)) * scale, (chunk.size ?? 6) * scale, (chunk.size ?? 6) * scale);
  });
  ctx.globalAlpha = 1;
}

function drawObjectiveMarker(ctx, objective, w, h, camera) {
  if (!objective?.marker) return;
  const ground = h * 0.84;
  const scale = ground / STAGE.groundY;
  const x = (objective.marker.x ?? 0) - (camera.x ?? 0);
  const y = (objective.marker.y ?? 0) * scale;

  if (x < -60 || x > w + 60) return;

  ctx.fillStyle = "rgba(255, 202, 95, 0.96)";
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - 12 * scale, y - 22 * scale);
  ctx.lineTo(x + 12 * scale, y - 22 * scale);
  ctx.closePath();
  ctx.fill();

  const label = objective.marker.label ?? "NEXT";
  ctx.font = "700 12px system-ui, sans-serif";
  const pillWidth = Math.max(58, ctx.measureText(label).width + 18);
  ctx.fillStyle = "rgba(8, 14, 24, 0.9)";
  ctx.fillRect(x - pillWidth * 0.5, y - 46 * scale, pillWidth, 20);
  ctx.strokeStyle = "rgba(255, 202, 95, 0.9)";
  ctx.strokeRect(x - pillWidth * 0.5, y - 46 * scale, pillWidth, 20);
  ctx.fillStyle = "#fff6df";
  ctx.textAlign = "center";
  ctx.fillText(label, x, y - 31 * scale);
  ctx.textAlign = "start";
}

function drawPickups(ctx, pickups, w, h, camera) {
  const ground = h * 0.84;
  const scale = ground / STAGE.groundY;
  pickups.forEach((pickup) => {
    const x = (pickup.x ?? 0) - (camera.x ?? 0);
    const y = (pickup.y ?? 0) * scale;
    ctx.fillStyle = pickup.kind === "civilian" ? "#8ff0bc" : "#ff8484";
    ctx.beginPath();
    ctx.arc(x, y, (pickup.radius ?? 18) * scale * 0.6, 0, Math.PI * 2);
    ctx.fill();
    const label = pickup.kind === "civilian" ? "SAVE" : "HEAL";
    ctx.fillStyle = "rgba(8, 14, 24, 0.84)";
    ctx.fillRect(x - 20, y - 28 * scale, 40, 16);
    ctx.strokeStyle = pickup.kind === "civilian" ? "rgba(143, 240, 188, 0.92)" : "rgba(255, 132, 132, 0.92)";
    ctx.strokeRect(x - 20, y - 28 * scale, 40, 16);
    ctx.fillStyle = "#f7fbff";
    ctx.font = "700 10px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(label, x, y - 16 * scale);
    ctx.textAlign = "start";
  });
}

function drawHudOverlay(ctx, state, w, h) {
  const banner = state.phase === "play" ? state.prompt : state.overlayTitle;
  ctx.fillStyle = "rgba(5, 8, 14, 0.35)";
  ctx.fillRect(24, 24, Math.min(360, w - 48), 92);
  ctx.fillStyle = "#f2f5ff";
  ctx.font = "700 22px system-ui, sans-serif";
  ctx.fillText(banner ?? "", 40, 58);
  ctx.font = "500 14px system-ui, sans-serif";
  ctx.fillText(`Target ${Math.round(state.targetScore ?? 0)}  Damage ${Math.round(state.score ?? 0)}`, 40, 82);
}
