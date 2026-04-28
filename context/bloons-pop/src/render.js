import { HEIGHT, TOWER_DEFS, WIDTH } from "./data.js";

function drawTrack(ctx, pathPoints) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.strokeStyle = "#6d7f88";
  ctx.lineWidth = 76;
  ctx.beginPath();
  pathPoints.forEach((point, index) => {
    if (index === 0) {
      ctx.moveTo(point.x, point.y);
    } else {
      ctx.lineTo(point.x, point.y);
    }
  });
  ctx.stroke();

  ctx.strokeStyle = "#d3e4ec";
  ctx.lineWidth = 44;
  ctx.beginPath();
  pathPoints.forEach((point, index) => {
    if (index === 0) {
      ctx.moveTo(point.x, point.y);
    } else {
      ctx.lineTo(point.x, point.y);
    }
  });
  ctx.stroke();

  ctx.strokeStyle = "#8aa0aa";
  ctx.lineWidth = 4;
  ctx.setLineDash([14, 16]);
  ctx.beginPath();
  pathPoints.forEach((point, index) => {
    if (index === 0) {
      ctx.moveTo(point.x, point.y);
    } else {
      ctx.lineTo(point.x, point.y);
    }
  });
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawBackground(ctx) {
  const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  sky.addColorStop(0, "#0f2e3a");
  sky.addColorStop(1, "#1f4e5f");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = "#2b6e54";
  ctx.fillRect(0, HEIGHT * 0.55, WIDTH, HEIGHT * 0.45);

  for (let i = 0; i < 24; i += 1) {
    ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.06)";
    ctx.fillRect((i * 83) % WIDTH, HEIGHT * 0.58 + ((i * 47) % 180), 38, 8);
  }
}

function drawTower(ctx, tower) {
  ctx.fillStyle = tower.color;
  ctx.beginPath();
  ctx.arc(tower.x, tower.y, 22, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#11222a";
  ctx.beginPath();
  ctx.arc(tower.x, tower.y, 10, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(tower.x, tower.y, tower.range, 0, Math.PI * 2);
  ctx.stroke();
}

function drawBloon(ctx, bloon) {
  ctx.fillStyle = bloon.color;
  ctx.beginPath();
  ctx.ellipse(bloon.x, bloon.y, bloon.radius, bloon.radius + 5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.28)";
  ctx.beginPath();
  ctx.arc(bloon.x - 5, bloon.y - 6, 5, 0, Math.PI * 2);
  ctx.fill();

  if (bloon.maxHp > 1) {
    const ratio = Math.max(0, bloon.hp / bloon.maxHp);
    ctx.fillStyle = "rgba(0,0,0,0.42)";
    ctx.fillRect(bloon.x - 18, bloon.y - bloon.radius - 14, 36, 5);
    ctx.fillStyle = "#f8f9fa";
    ctx.fillRect(bloon.x - 18, bloon.y - bloon.radius - 14, 36 * ratio, 5);
  }
}

export function renderScene(ctx, state) {
  drawBackground(ctx);
  drawTrack(ctx, state.pathPoints);

  if (state.preview) {
    const tower = TOWER_DEFS[state.selectedTowerId];
    ctx.fillStyle = state.preview.valid ? "rgba(124, 255, 166, 0.18)" : "rgba(255, 99, 99, 0.18)";
    ctx.beginPath();
    ctx.arc(state.preview.x, state.preview.y, tower.range, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = state.preview.valid ? "rgba(124, 255, 166, 0.7)" : "rgba(255, 99, 99, 0.7)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(state.preview.x, state.preview.y, 22, 0, Math.PI * 2);
    ctx.stroke();
  }

  for (const effect of state.effects) {
    ctx.globalAlpha = Math.max(0, effect.life / effect.maxLife);
    ctx.fillStyle = effect.color;
    ctx.beginPath();
    ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  for (const tower of state.towers) {
    drawTower(ctx, tower);
  }

  for (const projectile of state.projectiles) {
    ctx.fillStyle = projectile.color;
    ctx.beginPath();
    ctx.arc(projectile.x, projectile.y, projectile.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const bloon of state.bloons) {
    drawBloon(ctx, bloon);
  }

  ctx.fillStyle = "rgba(7, 15, 19, 0.74)";
  ctx.fillRect(22, 20, 520, 52);
  ctx.fillStyle = "#f8f9fa";
  ctx.font = "600 22px Trebuchet MS, sans-serif";
  ctx.fillText(state.status, 38, 53);

  ctx.fillStyle = "rgba(7, 15, 19, 0.76)";
  ctx.fillRect(932, 20, 326, 88);
  ctx.fillStyle = "#f8f9fa";
  ctx.font = "600 18px Trebuchet MS, sans-serif";
  ctx.fillText(`Selected: ${TOWER_DEFS[state.selectedTowerId].name}`, 952, 50);
  ctx.fillText(`Cost: ${TOWER_DEFS[state.selectedTowerId].cost}`, 952, 76);
  ctx.fillText(`Range: ${Math.round(TOWER_DEFS[state.selectedTowerId].range)}`, 952, 102);
}
