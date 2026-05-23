const WALL = "#5b3327";
const FLOOR_TILE = "#f3e1c7";
const FLOOR_TILE_ALT = "#edd5b7";
const ACCENT = "#d24d2c";
const GREEN = "#41835a";
const GOLD = "#f0b94b";
const INK = "#281510";

function drawRoundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function colorForTable(status) {
  if (status === "waiting-order") return "#f4c95d";
  if (status === "cooking") return "#d8873f";
  if (status === "ready-pickup" || status === "waiting-serve") return "#d24d2c";
  if (status === "eating") return "#4f8f63";
  if (status === "dirty") return "#705246";
  return "#cab496";
}

function labelForTable(status) {
  if (status === "waiting-order") return "ORDER";
  if (status === "cooking") return "COOK";
  if (status === "ready-pickup") return "UP";
  if (status === "waiting-serve") return "SERVE";
  if (status === "eating") return "EAT";
  if (status === "dirty") return "CLEAR";
  return "OPEN";
}

function drawPatience(ctx, x, y, width, value, fg) {
  ctx.fillStyle = "rgba(40, 21, 16, 0.22)";
  ctx.fillRect(x, y, width, 10);
  ctx.fillStyle = fg;
  ctx.fillRect(x, y, width * value, 10);
  ctx.strokeStyle = "rgba(40, 21, 16, 0.5)";
  ctx.strokeRect(x, y, width, 10);
}

function drawGuideRing(ctx, x, y, radius, color, pulse) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.setLineDash([12, 10]);
  ctx.beginPath();
  ctx.arc(x, y, radius + 18 + Math.sin(pulse * 5) * 4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export function renderScene(ctx, state) {
  ctx.clearRect(0, 0, state.width, state.height);

  const gradient = ctx.createLinearGradient(0, 0, 0, state.height);
  gradient.addColorStop(0, "#f9edd5");
  gradient.addColorStop(1, "#c97e55");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, state.width, state.height);

  ctx.fillStyle = "#7f4d38";
  ctx.fillRect(0, 0, state.width, 96);
  ctx.fillStyle = "#7f4d38";
  ctx.fillRect(0, state.height - 56, state.width, 56);

  ctx.fillStyle = WALL;
  drawRoundedRect(ctx, state.floor.x - 16, state.floor.y - 16, state.floor.width + 32, state.floor.height + 32, 28);
  ctx.fill();

  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 14; col += 1) {
      ctx.fillStyle = (row + col) % 2 === 0 ? FLOOR_TILE : FLOOR_TILE_ALT;
      ctx.fillRect(state.floor.x + col * 76, state.floor.y + row * 68, 76, 68);
    }
  }

  ctx.fillStyle = "#964d30";
  drawRoundedRect(ctx, state.hostStand.x - 70, state.hostStand.y - 56, 120, 112, 18);
  ctx.fill();
  ctx.fillStyle = "#f6dfb3";
  ctx.font = "700 20px Georgia, serif";
  ctx.fillText("HOST", state.hostStand.x - 28, state.hostStand.y + 8);

  ctx.fillStyle = "#a9302e";
  drawRoundedRect(ctx, state.kitchen.x - 96, state.kitchen.y - 64, 180, 128, 22);
  ctx.fill();
  ctx.fillStyle = "#fff1d6";
  ctx.fillText("KITCHEN", state.kitchen.x - 56, state.kitchen.y + 8);

  ctx.fillStyle = "rgba(255, 241, 214, 0.85)";
  ctx.font = "600 18px Georgia, serif";
  ctx.fillText(`Ready ${state.kitchenReadyCount}`, state.kitchen.x - 38, state.kitchen.y + 38);

  ctx.fillStyle = "#5d7b9d";
  drawRoundedRect(ctx, 132, 566, 170, 66, 18);
  ctx.fill();
  ctx.fillStyle = "#f4f0e0";
  ctx.fillText(`Queue ${state.queue.length}`, 182, 606);

  state.queue.forEach((party, index) => {
    const x = 182 + index * 38;
    const y = 520 - index * 14;
    ctx.fillStyle = `rgba(210, 77, 44, ${0.85 - index * 0.1})`;
    ctx.beginPath();
    ctx.arc(x, y, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff7ea";
    ctx.font = "700 14px Arial";
    ctx.fillText(`${party.size}`, x - 4, y + 5);
    drawPatience(ctx, x - 22, y + 24, 44, party.patience, GOLD);
  });

  state.tables.forEach((table) => {
    const glow = 10 + table.seatPulse * 16;
    ctx.fillStyle = `rgba(255, 255, 255, ${table.seatPulse * 0.35})`;
    ctx.beginPath();
    ctx.arc(table.x, table.y, table.radius + glow, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#724434";
    ctx.beginPath();
    ctx.arc(table.x, table.y, table.radius + 12, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = colorForTable(table.status);
    ctx.beginPath();
    ctx.arc(table.x, table.y, table.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#fff7ea";
    ctx.font = "700 20px Georgia, serif";
    ctx.fillText(table.label, table.x - 18, table.y + 6);

    ctx.fillStyle = INK;
    ctx.font = "700 14px Arial";
    ctx.fillText(labelForTable(table.status), table.x - 24, table.y - table.radius - 20);

    if (table.status === "waiting-order" || table.status === "cooking" || table.status === "ready-pickup" || table.status === "waiting-serve") {
      drawPatience(ctx, table.x - 40, table.y + table.radius + 18, 80, table.patience, ACCENT);
    }

    if (table.status === "eating") {
      drawPatience(ctx, table.x - 40, table.y + table.radius + 18, 80, Math.min(1, table.eatTimer / 9), GREEN);
    }

    if (table.meal && table.status !== "dirty" && table.status !== "empty") {
      ctx.fillStyle = "#fff7ea";
      ctx.font = "600 13px Arial";
      ctx.fillText(table.meal, table.x - 30, table.y + table.radius + 42);
    }
  });

  if (state.nextTask?.target) {
    const ringColor = state.nextTask.priority === "urgent" ? "#ffd978" : "#fff5de";
    drawGuideRing(ctx, state.nextTask.target.x, state.nextTask.target.y, 76, ringColor, state.pulse);
  }

  const bob = Math.sin(state.pulse * 6) * 4;
  ctx.fillStyle = "#1e4257";
  ctx.beginPath();
  ctx.ellipse(state.player.x, state.player.y + 18, 20, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f6e2c0";
  ctx.beginPath();
  ctx.arc(state.player.x, state.player.y - 12 + bob * 0.15, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#294d66";
  drawRoundedRect(ctx, state.player.x - 18, state.player.y - 4, 36, 48, 12);
  ctx.fill();
  ctx.fillStyle = "#f2f2e8";
  ctx.fillRect(state.player.x - 6 + state.player.facing * 8, state.player.y + 8, 18, 7);

  if (state.player.carry) {
    ctx.fillStyle = "#fff6e0";
    ctx.beginPath();
    ctx.arc(state.player.x + state.player.facing * 20, state.player.y - 24, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  if (state.transitionTimer > 0) {
    ctx.fillStyle = "rgba(40, 21, 16, 0.6)";
    drawRoundedRect(ctx, 456, 40, 368, 64, 18);
    ctx.fill();
    ctx.fillStyle = "#fff5de";
    ctx.font = "700 28px Georgia, serif";
    ctx.fillText("Shift Clear", 560, 82);
  }

  if (state.mode === "playing" && state.nextTask) {
    const pillWidth = 456;
    const pillX = state.width - pillWidth - 30;
    const pillY = state.height - 88;
    ctx.fillStyle = state.nextTask.priority === "urgent" ? "rgba(160, 48, 46, 0.92)" : "rgba(40, 21, 16, 0.84)";
    drawRoundedRect(ctx, pillX, pillY, pillWidth, 56, 18);
    ctx.fill();
    ctx.fillStyle = "#ebc692";
    ctx.font = "700 12px Arial";
    ctx.fillText(state.nextTask.label.toUpperCase(), pillX + 18, pillY + 18);
    ctx.fillStyle = "#fff7ea";
    ctx.font = "700 16px Arial";
    ctx.fillText(state.nextTask.detail, pillX + 18, pillY + 40);
  }
}
