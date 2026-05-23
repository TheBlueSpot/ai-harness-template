import { HEIGHT, STAGE_BREAKS, STAGE_NAMES, WIDTH, getBlockedLanes } from "./data.js";

function toScreenY(worldY, cameraY) {
  return HEIGHT - 140 - (worldY - cameraY);
}

export function renderScene(ctx, state) {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);

  const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  sky.addColorStop(0, "#102038");
  sky.addColorStop(0.65, "#1b4060");
  sky.addColorStop(1, "#4c89a8");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  drawCity(ctx, state.cameraY);
  drawFacade(ctx, state);
  drawStageMarkers(ctx, state);
  drawLedges(ctx, state);
  drawTelegraphs(ctx, state);
  drawPots(ctx, state);
  drawPlayer(ctx, state);
  drawSummitMarker(ctx, state);
  drawPrompt(ctx, state);
}

function drawStageMarkers(ctx, state) {
  for (let index = 1; index < STAGE_NAMES.length; index += 1) {
    const marker = { y: STAGE_BREAKS[index], label: STAGE_NAMES[index] };
    const y = toScreenY(marker.y, state.cameraY);
    if (y < -40 || y > HEIGHT + 40) {
      continue;
    }

    ctx.strokeStyle = "rgba(248, 239, 174, 0.45)";
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.moveTo(state.facadeLeft + 20, y);
    ctx.lineTo(state.facadeRight - 20, y);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "rgba(10, 16, 24, 0.78)";
    ctx.fillRect(state.facadeLeft + 26, y - 24, 170, 24);
    ctx.fillStyle = "#f8efae";
    ctx.font = "700 13px Arial";
    ctx.fillText(marker.label, state.facadeLeft + 36, y - 8);
  }
}

function drawCity(ctx, cameraY) {
  const parallax = cameraY * 0.12;
  ctx.fillStyle = "rgba(9, 18, 30, 0.45)";
  for (let i = 0; i < 11; i += 1) {
    const x = -40 + i * 100;
    const width = 70 + (i % 3) * 20;
    const height = 140 + ((i * 37) % 180);
    const y = 430 - (height * 0.18) - (parallax % 28);
    ctx.fillRect(x, y, width, height);
  }
}

function drawFacade(ctx, state) {
  ctx.fillStyle = "#2b3646";
  ctx.fillRect(state.facadeLeft, 0, state.facadeRight - state.facadeLeft, HEIGHT);

  ctx.fillStyle = "#1e2631";
  ctx.fillRect(state.facadeLeft + 22, 0, state.facadeRight - state.facadeLeft - 44, HEIGHT);

  const startRow = Math.max(0, Math.floor((state.cameraY - 120) / state.rowHeight));
  const endRow = Math.floor((state.cameraY + HEIGHT + 120) / state.rowHeight);
  for (let row = startRow; row <= endRow; row += 1) {
    const worldY = row * state.rowHeight;
    const screenY = toScreenY(worldY, state.cameraY);
    const blocked = getBlockedLanes(row);

    for (let lane = 0; lane < state.lanes.length; lane += 1) {
      const x = state.lanes[lane] - 40;
      ctx.fillStyle = blocked.includes(lane) ? "#8b4a45" : "#90d6ff";
      ctx.fillRect(x, screenY - 48, 80, 64);

      ctx.fillStyle = blocked.includes(lane) ? "#48211d" : "#d9f0ff";
      ctx.fillRect(x + 10, screenY - 38, 60, 44);

      if (blocked.includes(lane)) {
        ctx.strokeStyle = "rgba(28, 10, 8, 0.8)";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(x + 8, screenY - 44);
        ctx.lineTo(x + 72, screenY + 12);
        ctx.moveTo(x + 72, screenY - 44);
        ctx.lineTo(x + 8, screenY + 12);
        ctx.stroke();
      }
    }
  }
}

function drawLedges(ctx, state) {
  for (const ledge of state.ledges) {
    const y = toScreenY(ledge, state.cameraY);
    if (y < -30 || y > HEIGHT + 30) {
      continue;
    }

    ctx.fillStyle = ledge === 0 ? "#c6f0ff" : "#f2d689";
    ctx.fillRect(state.facadeLeft - 10, y + 16, state.facadeRight - state.facadeLeft + 20, 12);
    ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
    ctx.fillRect(state.facadeLeft - 10, y + 24, state.facadeRight - state.facadeLeft + 20, 8);
    if (ledge > 0 && ledge < state.summitY) {
      ctx.fillStyle = "#1d2732";
      ctx.font = "700 15px Arial";
      ctx.fillText(`Rest Ledge ${ledge} m`, state.facadeLeft + 18, y + 4);
    }
  }
}

function drawTelegraphs(ctx, state) {
  for (const telegraph of state.telegraphs) {
    const y = toScreenY(telegraph.y, state.cameraY);
    if (y < -60 || y > HEIGHT + 20) {
      continue;
    }
    const x = state.lanes[telegraph.lane];
    const pulse = 0.5 + Math.sin(telegraph.timer * 18) * 0.5;
    ctx.fillStyle = `rgba(255, 96, 72, ${0.45 + pulse * 0.35})`;
    ctx.fillRect(x - 34, y - 70, 68, 14);
    ctx.fillStyle = "#fff3d0";
    ctx.font = "700 13px Arial";
    ctx.fillText("DROP", x - 20, y - 78);
  }
}

function drawPots(ctx, state) {
  for (const pot of state.hazards) {
    const y = toScreenY(pot.y, state.cameraY);
    if (y < -40 || y > HEIGHT + 40) {
      continue;
    }
    const x = state.lanes[pot.lane];
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((pot.y / 60) * 0.2 * pot.spin);
    ctx.fillStyle = "#b65736";
    ctx.beginPath();
    ctx.moveTo(-14, -8);
    ctx.lineTo(14, -8);
    ctx.lineTo(11, 12);
    ctx.lineTo(-11, 12);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#f7c8a6";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, -10, 10, Math.PI, 0);
    ctx.stroke();
    ctx.restore();
  }
}

function drawPlayer(ctx, state) {
  const player = state.player;
  const x = player.x;
  const y = toScreenY(player.y, state.cameraY);
  const hitFlash = player.hitTimer > 0 && Math.floor(player.hitTimer * 12) % 2 === 0;

  ctx.save();
  ctx.translate(x, y);
  if (hitFlash) {
    ctx.globalAlpha = 0.45;
  }

  const sway = Math.sin(player.combo + player.y * 0.02) * 4;
  ctx.strokeStyle = "#f2f5f9";
  ctx.lineWidth = 6;
  ctx.lineCap = "round";

  ctx.beginPath();
  ctx.moveTo(0, -18);
  ctx.lineTo(0, 18);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(0, -10);
  ctx.lineTo(player.hand === "left" ? -26 : -18, -34 + sway);
  ctx.moveTo(0, -10);
  ctx.lineTo(player.hand === "right" ? 26 : 18, -34 - sway);
  ctx.moveTo(0, 18);
  ctx.lineTo(-16, 40);
  ctx.moveTo(0, 18);
  ctx.lineTo(16, 40);
  ctx.stroke();

  ctx.fillStyle = "#ffd07c";
  ctx.beginPath();
  ctx.arc(0, -30, 11, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = player.onLedge ? "#8af7b0" : "#ffce75";
  ctx.fillRect(-22, 44, 44 * (player.stamina / 100), 5);
  ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
  ctx.lineWidth = 2;
  ctx.strokeRect(-22, 44, 44, 5);
  ctx.restore();
}

function drawSummitMarker(ctx, state) {
  const y = toScreenY(state.summitY, state.cameraY);
  if (y > -120 && y < HEIGHT + 120) {
    ctx.fillStyle = "#dff8ff";
    ctx.fillRect(state.facadeLeft - 20, y - 14, state.facadeRight - state.facadeLeft + 40, 22);
    ctx.fillStyle = "#203040";
    ctx.font = "700 16px Arial";
    ctx.fillText("Helipad", state.facadeLeft + 24, y + 2);
  } else if (state.player.y < state.summitY) {
    ctx.fillStyle = "#dff8ff";
    ctx.beginPath();
    ctx.moveTo(WIDTH - 46, 44);
    ctx.lineTo(WIDTH - 24, 10);
    ctx.lineTo(WIDTH - 2, 44);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#203040";
    ctx.font = "700 14px Arial";
    ctx.fillText("Roof", WIDTH - 54, 62);
  }
}

function drawPrompt(ctx, state) {
  ctx.fillStyle = "rgba(10, 16, 24, 0.72)";
  ctx.fillRect(24, HEIGHT - 82, WIDTH - 48, 46);
  ctx.fillStyle = "#f4f8fb";
  ctx.font = "600 18px Arial";
  ctx.fillText(state.message, 40, HEIGHT - 52);
}
