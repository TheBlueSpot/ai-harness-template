import { FLOOR_Y, ROOM_HEIGHT, ROOM_LAYOUT, ROOM_WIDTH, VIEW_HEIGHT, VIEW_WIDTH } from "./world.js";

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function drawBackground(ctx, room) {
  const gradient = ctx.createLinearGradient(0, 0, 0, VIEW_HEIGHT);
  gradient.addColorStop(0, room.color);
  gradient.addColorStop(1, "#081019");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

  ctx.fillStyle = "rgba(124, 226, 194, 0.06)";
  for (let i = 0; i < 12; i += 1) {
    ctx.fillRect(80 + i * 100, 60 + (i % 3) * 130, 42, 260);
  }

  ctx.strokeStyle = "rgba(186, 240, 219, 0.08)";
  ctx.lineWidth = 2;
  for (let y = 86; y < VIEW_HEIGHT - 40; y += 58) {
    ctx.beginPath();
    ctx.moveTo(30, y);
    ctx.lineTo(VIEW_WIDTH - 30, y);
    ctx.stroke();
  }
}

function drawPlatforms(ctx, room) {
  ctx.fillStyle = "#3f5a6e";
  for (const platform of room.platforms) {
    ctx.fillRect(platform.x, platform.y, platform.width, platform.height);
    ctx.fillStyle = "#88dec6";
    ctx.fillRect(platform.x, platform.y, platform.width, 4);
    ctx.fillStyle = "#3f5a6e";
  }

  ctx.fillStyle = "#274050";
  for (const solid of room.solids) {
    ctx.fillRect(solid.x, solid.y, solid.width, solid.height);
  }

  ctx.fillStyle = "#1a2634";
  ctx.fillRect(0, FLOOR_Y, ROOM_WIDTH, ROOM_HEIGHT - FLOOR_Y);
}

function drawHazards(ctx, room) {
  for (const hazard of room.hazards) {
    const gradient = ctx.createLinearGradient(hazard.x, hazard.y, hazard.x, hazard.y + hazard.height);
    gradient.addColorStop(0, "#7ff9b2");
    gradient.addColorStop(1, "#13392d");
    ctx.fillStyle = gradient;
    ctx.fillRect(hazard.x, hazard.y, hazard.width, hazard.height);
  }
}

function drawGates(ctx, room, abilities) {
  for (const gate of room.gates) {
    const unlocked = abilities.has(gate.requires);
    ctx.fillStyle = unlocked ? "rgba(96, 232, 183, 0.22)" : "rgba(231, 132, 132, 0.26)";
    ctx.strokeStyle = unlocked ? "#5df0ba" : "#ff8b8b";
    ctx.lineWidth = 3;
    ctx.fillRect(gate.x, gate.y, gate.width, gate.height);
    ctx.strokeRect(gate.x, gate.y, gate.width, gate.height);
  }
}

function drawPickups(ctx, room, pickupsTaken) {
  for (const pickup of room.pickups) {
    if (pickupsTaken.has(pickup.id)) continue;
    ctx.fillStyle = pickup.id === "reactorCore" ? "#ffb770" : "#9ef6da";
    ctx.beginPath();
    ctx.arc(pickup.x, pickup.y, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function drawPlayer(ctx, player) {
  const alpha = player.invuln > 0 && Math.floor(player.invuln * 20) % 2 === 0 ? 0.45 : 1;
  ctx.save();
  ctx.globalAlpha = alpha;
  if (player.form === "morph") {
    ctx.fillStyle = "#f0d36a";
    ctx.beginPath();
    ctx.arc(player.x + player.width / 2, player.y + player.height / 2, player.width / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#20495c";
    ctx.lineWidth = 4;
    ctx.stroke();
  } else {
    ctx.fillStyle = "#d8c36c";
    ctx.fillRect(player.x + 10, player.y + 8, player.width - 20, player.height - 18);
    ctx.fillStyle = "#66d4b1";
    ctx.fillRect(player.x + 12, player.y + 18, player.width - 24, player.height - 26);
    ctx.fillStyle = "#d95061";
    ctx.fillRect(player.x + (player.facing > 0 ? player.width - 12 : 4), player.y + 28, 26, 12);
  }
  ctx.restore();
}

function drawEnemies(ctx, enemies) {
  for (const enemy of enemies) {
    if (enemy.hp <= 0) continue;
    if (enemy.kind === "zoomer") {
      ctx.fillStyle = "#f3b669";
      ctx.beginPath();
      ctx.arc(enemy.x, enemy.y, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#6b3419";
      ctx.lineWidth = 3;
      ctx.stroke();
    } else {
      ctx.fillStyle = "#e16978";
      ctx.fillRect(enemy.x - 16, enemy.y - 16, 32, 32);
      ctx.fillStyle = "#ffe0b5";
      ctx.fillRect(enemy.x - 10, enemy.y - 10, 20, 8);
    }
  }
}

function drawProjectiles(ctx, projectiles) {
  for (const shot of projectiles) {
    ctx.fillStyle = shot.owner === "player" ? "#8af8e0" : "#ff9d78";
    ctx.beginPath();
    ctx.arc(shot.x, shot.y, 6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawEffects(ctx, effects) {
  for (const effect of effects) {
    ctx.strokeStyle = effect.color;
    ctx.globalAlpha = Math.max(0, effect.life / effect.maxLife);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function drawMinimap(ctx, frame) {
  const mapX = 970;
  const mapY = 24;
  const cell = 62;
  roundRect(ctx, mapX - 18, mapY - 18, 270, 240, 18);
  ctx.fillStyle = "rgba(8, 18, 28, 0.82)";
  ctx.fill();
  ctx.strokeStyle = "rgba(153, 255, 223, 0.35)";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = "#d6fff5";
  ctx.font = "18px sans-serif";
  ctx.fillText("Minimap", mapX, mapY - 28);

  for (const room of ROOM_LAYOUT) {
    const x = mapX + room.gridX * cell;
    const y = mapY + room.gridY * cell;
    const visited = frame.visited.has(room.id);
    ctx.fillStyle = visited ? room.color : "rgba(47, 60, 74, 0.85)";
    ctx.fillRect(x, y, cell - 10, cell - 10);
    ctx.strokeStyle = frame.roomId === room.id ? "#ffd56a" : "rgba(153, 255, 223, 0.28)";
    ctx.lineWidth = frame.roomId === room.id ? 4 : 2;
    ctx.strokeRect(x, y, cell - 10, cell - 10);

    if (frame.upgrades.has("morphBall") && room.id === "morph") {
      ctx.fillStyle = "#9ef6da";
      ctx.beginPath();
      ctx.arc(x + 14, y + 14, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    if (frame.upgrades.has("highJump") && room.id === "highJump") {
      ctx.fillStyle = "#9ef6da";
      ctx.fillRect(x + 9, y + 9, 10, 10);
    }
    if (frame.coreRecovered && room.id === "reactor") {
      ctx.fillStyle = "#ffb770";
      ctx.fillRect(x + 30, y + 10, 10, 10);
    }
  }
}

function drawMessage(ctx, frame) {
  if (!frame.toast) return;
  roundRect(ctx, 36, 36, 420, 74, 18);
  ctx.fillStyle = "rgba(7, 14, 23, 0.82)";
  ctx.fill();
  ctx.strokeStyle = "rgba(153, 255, 223, 0.28)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#e9fff8";
  ctx.font = "18px sans-serif";
  ctx.fillText(frame.toast, 58, 82);
}

export function renderFrame(ctx, frame) {
  const room = frame.room;
  drawBackground(ctx, room);
  drawPlatforms(ctx, room);
  drawHazards(ctx, room);
  drawGates(ctx, room, frame.upgrades);
  drawPickups(ctx, room, frame.pickupsTaken);
  drawEnemies(ctx, frame.enemies);
  drawProjectiles(ctx, frame.projectiles);
  drawPlayer(ctx, frame.player);
  drawEffects(ctx, frame.effects);
  drawMinimap(ctx, frame);
  drawMessage(ctx, frame);
}
