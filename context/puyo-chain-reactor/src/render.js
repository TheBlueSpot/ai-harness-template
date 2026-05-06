const COLORS = {
  red: { fill: "#ff5a6f", shade: "#8c1732", glow: "rgba(255, 90, 111, 0.35)" },
  blue: { fill: "#5abfff", shade: "#0b4c8f", glow: "rgba(90, 191, 255, 0.35)" },
  green: { fill: "#68e58d", shade: "#146233", glow: "rgba(104, 229, 141, 0.35)" },
  yellow: { fill: "#ffd65a", shade: "#986800", glow: "rgba(255, 214, 90, 0.35)" },
  purple: { fill: "#bc8fff", shade: "#59218f", glow: "rgba(188, 143, 255, 0.35)" },
};

const CELL = 48;
const COLS = 6;
const ROWS = 12;
const BOARD_X = 220;
const BOARD_Y = 72;
const BOARD_W = CELL * COLS;
const BOARD_H = CELL * ROWS;

function drawBlob(ctx, x, y, color, alpha = 1) {
  const palette = COLORS[color];
  if (!palette) return;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);

  ctx.shadowColor = palette.glow;
  ctx.shadowBlur = 18;
  ctx.fillStyle = palette.fill;
  ctx.beginPath();
  ctx.arc(0, 0, CELL * 0.4, 0, Math.PI * 2);
  ctx.fill();

  const blobGradient = ctx.createRadialGradient(-8, -14, 4, 0, 0, CELL * 0.42);
  blobGradient.addColorStop(0, "rgba(255,255,255,0.92)");
  blobGradient.addColorStop(0.2, "rgba(255,255,255,0.28)");
  blobGradient.addColorStop(1, palette.fill);
  ctx.shadowBlur = 0;
  ctx.fillStyle = blobGradient;
  ctx.beginPath();
  ctx.arc(0, 0, CELL * 0.39, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.beginPath();
  ctx.arc(-10, -12, CELL * 0.13, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = palette.shade;
  ctx.beginPath();
  ctx.arc(-7, -2, 2.5, 0, Math.PI * 2);
  ctx.arc(7, -2, 2.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawWarningStripes(ctx, x, y, width, height, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();
  for (let offset = -height; offset < width + height; offset += 28) {
    ctx.fillStyle = "#1f2432";
    ctx.fillRect(x + offset, y, 14, height);
    ctx.fillStyle = "#f0b83f";
    ctx.fillRect(x + offset + 14, y, 14, height);
  }
  ctx.restore();
}

function drawAlarmLight(ctx, x, y, radius, active, color) {
  ctx.save();
  ctx.fillStyle = "rgba(10, 18, 28, 0.95)";
  ctx.beginPath();
  ctx.arc(x, y, radius + 6, 0, Math.PI * 2);
  ctx.fill();

  const glow = active ? 0.55 : 0.14;
  ctx.shadowColor = color;
  ctx.shadowBlur = active ? 28 : 10;
  ctx.fillStyle = active ? color : "rgba(92, 113, 134, 0.55)";
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.beginPath();
  ctx.arc(x - radius * 0.25, y - radius * 0.3, radius * 0.34, 0, Math.PI * 2);
  ctx.fill();

  if (active) {
    ctx.globalAlpha = glow;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, radius + 12, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function getStackHeight(board) {
  for (let y = 0; y < board.length; y += 1) {
    if (board[y].some(Boolean)) {
      return board.length - y;
    }
  }
  return 0;
}

export function renderGame(ctx, state) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  const heatRatio = state.pressureLimit > 0 ? state.pressure / state.pressureLimit : 0;
  const stackHeight = getStackHeight(state.board);
  const stackRatio = state.board.length > 0 ? stackHeight / state.board.length : 0;
  const topDanger = Math.max(0, stackRatio - 0.55) / 0.45;

  const chamberGradient = ctx.createLinearGradient(0, 0, 0, ctx.canvas.height);
  chamberGradient.addColorStop(0, "#06101c");
  chamberGradient.addColorStop(0.55, "#10253d");
  chamberGradient.addColorStop(1, "#050a14");
  ctx.fillStyle = chamberGradient;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  const glow = ctx.createRadialGradient(220, 140, 40, 220, 140, 360);
  glow.addColorStop(0, "rgba(87, 202, 255, 0.18)");
  glow.addColorStop(1, "rgba(87, 202, 255, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  const heatGlow = ctx.createRadialGradient(520, 700, 20, 520, 700, 280);
  heatGlow.addColorStop(0, `rgba(255, 109, 70, ${0.45 + heatRatio * 0.28})`);
  heatGlow.addColorStop(1, "rgba(255, 109, 70, 0)");
  ctx.fillStyle = heatGlow;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  ctx.fillStyle = "rgba(7, 16, 28, 0.84)";
  ctx.fillRect(64, 36, 832, 648);

  drawWarningStripes(ctx, BOARD_X - 46, BOARD_Y - 48, BOARD_W + 92, 18, 0.95);
  drawWarningStripes(ctx, BOARD_X - 46, BOARD_Y + BOARD_H + 30, BOARD_W + 92, 18, 0.95);

  ctx.fillStyle = "#15283e";
  ctx.fillRect(BOARD_X - 30, BOARD_Y - 26, BOARD_W + 60, BOARD_H + 52);
  ctx.fillStyle = "#0a1321";
  ctx.fillRect(BOARD_X - 16, BOARD_Y - 12, BOARD_W + 32, BOARD_H + 24);

  ctx.fillStyle = "#08111b";
  ctx.fillRect(BOARD_X, BOARD_Y, BOARD_W, BOARD_H);

  const injectorX = BOARD_X - 78;
  const injectorY = BOARD_Y + 24;
  const injectorH = BOARD_H - 48;
  const coolantX = BOARD_X + BOARD_W + 36;
  const coolantY = injectorY;
  const coolantW = 36;
  const coolantH = injectorH;

  ctx.fillStyle = "rgba(13, 23, 37, 0.98)";
  ctx.fillRect(injectorX, injectorY, 40, injectorH);
  ctx.fillRect(coolantX, coolantY, coolantW, coolantH);
  ctx.strokeStyle = "rgba(196, 228, 255, 0.2)";
  ctx.lineWidth = 2;
  ctx.strokeRect(injectorX, injectorY, 40, injectorH);
  ctx.strokeRect(coolantX, coolantY, coolantW, coolantH);

  const injectorFill = Math.max(0.1, heatRatio);
  const injectorGradient = ctx.createLinearGradient(0, injectorY + injectorH, 0, injectorY);
  injectorGradient.addColorStop(0, "#ff7248");
  injectorGradient.addColorStop(0.55, "#ffbe5f");
  injectorGradient.addColorStop(1, "#fff0a5");
  ctx.fillStyle = injectorGradient;
  ctx.fillRect(injectorX + 6, injectorY + injectorH * (1 - injectorFill), 28, injectorH * injectorFill);

  const coolantFill = Math.max(0.08, 1 - Math.max(heatRatio, topDanger));
  const coolantGradient = ctx.createLinearGradient(0, coolantY + coolantH, 0, coolantY);
  coolantGradient.addColorStop(0, "#1e8cff");
  coolantGradient.addColorStop(1, "#9bf7ff");
  ctx.fillStyle = coolantGradient;
  ctx.fillRect(coolantX + 6, coolantY + coolantH * (1 - coolantFill), coolantW - 12, coolantH * coolantFill);

  const bottomGlow = ctx.createLinearGradient(0, BOARD_Y + BOARD_H, 0, BOARD_Y + BOARD_H - 140);
  bottomGlow.addColorStop(0, `rgba(255, 117, 63, ${0.26 + heatRatio * 0.32})`);
  bottomGlow.addColorStop(1, "rgba(255, 117, 63, 0)");
  ctx.fillStyle = bottomGlow;
  ctx.fillRect(BOARD_X, BOARD_Y, BOARD_W, BOARD_H);

  const pipeGradient = ctx.createLinearGradient(0, BOARD_Y - 18, 0, BOARD_Y + 10);
  pipeGradient.addColorStop(0, "#29465f");
  pipeGradient.addColorStop(1, "#152737");
  ctx.fillStyle = pipeGradient;
  ctx.fillRect(BOARD_X + 64, BOARD_Y - 18, BOARD_W - 128, 20);
  ctx.fillStyle = "rgba(170, 227, 255, 0.16)";
  ctx.fillRect(BOARD_X + 76, BOARD_Y - 12, BOARD_W - 152, 6);

  drawAlarmLight(ctx, BOARD_X + 28, BOARD_Y - 36, 9, heatRatio >= 0.34, "#ffd45e");
  drawAlarmLight(ctx, BOARD_X + BOARD_W / 2, BOARD_Y - 36, 11, heatRatio >= 0.67 || topDanger > 0.2, "#ff9a4f");
  drawAlarmLight(ctx, BOARD_X + BOARD_W - 28, BOARD_Y - 36, 9, heatRatio >= 0.84 || topDanger > 0.45, "#ff6256");

  if (topDanger > 0) {
    ctx.fillStyle = `rgba(255, 90, 64, ${0.12 + topDanger * 0.22})`;
    ctx.fillRect(BOARD_X, BOARD_Y, BOARD_W, CELL * 2.3);
  }

  for (let x = 0; x <= COLS; x += 1) {
    ctx.strokeStyle = "rgba(130, 198, 255, 0.12)";
    ctx.beginPath();
    ctx.moveTo(BOARD_X + x * CELL, BOARD_Y);
    ctx.lineTo(BOARD_X + x * CELL, BOARD_Y + BOARD_H);
    ctx.stroke();
  }

  for (let y = 0; y <= ROWS; y += 1) {
    ctx.strokeStyle = "rgba(130, 198, 255, 0.12)";
    ctx.beginPath();
    ctx.moveTo(BOARD_X, BOARD_Y + y * CELL);
    ctx.lineTo(BOARD_X + BOARD_W, BOARD_Y + y * CELL);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(255, 255, 255, 0.28)";
  ctx.lineWidth = 3;
  ctx.strokeRect(BOARD_X, BOARD_Y, BOARD_W, BOARD_H);

  ctx.fillStyle = topDanger > 0.25 ? "#ffb585" : "#8fc6ef";
  ctx.font = '700 15px "Trebuchet MS", sans-serif';
  ctx.fillText("FEED PIPE", BOARD_X + 98, BOARD_Y - 26);

  for (let y = 0; y < state.board.length; y += 1) {
    for (let x = 0; x < state.board[y].length; x += 1) {
      const blob = state.board[y][x];
      if (!blob) continue;
      drawBlob(ctx, BOARD_X + x * CELL + CELL / 2, BOARD_Y + y * CELL + CELL / 2, blob);
    }
  }

  for (const cell of state.current) {
    drawBlob(ctx, BOARD_X + cell.x * CELL + CELL / 2, BOARD_Y + cell.y * CELL + CELL / 2, cell.color, 0.98);
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 2;
    ctx.strokeRect(BOARD_X + cell.x * CELL + 5, BOARD_Y + cell.y * CELL + 5, CELL - 10, CELL - 10);
  }

  ctx.fillStyle = "#d9f3ff";
  ctx.font = '700 28px "Trebuchet MS", sans-serif';
  ctx.fillText("Containment Chamber", 220, 40);

  ctx.fillStyle = "#8cc9e8";
  ctx.font = '600 16px "Trebuchet MS", sans-serif';
  ctx.fillText("Vent matching slime cores before heat forces a sludge surge.", 220, 672);

  const meterX = 610;
  const meterY = 32;
  const meterW = 220;
  const meterH = 14;
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(meterX, meterY, meterW, meterH);
  const meterGradient = ctx.createLinearGradient(meterX, meterY, meterX + meterW, meterY);
  meterGradient.addColorStop(0, "#40d0ff");
  meterGradient.addColorStop(0.55, "#ffd45e");
  meterGradient.addColorStop(1, "#ff6f52");
  ctx.fillStyle = meterGradient;
  ctx.fillRect(meterX, meterY, meterW * heatRatio, meterH);
  ctx.strokeStyle = "rgba(255,255,255,0.26)";
  ctx.lineWidth = 2;
  ctx.strokeRect(meterX, meterY, meterW, meterH);

  ctx.fillStyle = "#d9f3ff";
  ctx.font = '700 14px "Trebuchet MS", sans-serif';
  ctx.fillText("HEAT", meterX - 54, meterY + 12);
  ctx.fillStyle = heatRatio >= 0.83 ? "#ffb199" : "#b6dff3";
  ctx.fillText(`${state.turnsUntilPressure} DROPS TO SURGE`, meterX + 4, meterY + 38);

  ctx.fillStyle = "#8cc9e8";
  ctx.font = '700 12px "Trebuchet MS", sans-serif';
  ctx.fillText("SLUDGE", injectorX - 2, injectorY - 10);
  ctx.fillText("COOLANT", coolantX - 4, coolantY - 10);
}

export function renderNextPair(ctx, pair) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  const panelGradient = ctx.createLinearGradient(0, 0, 0, ctx.canvas.height);
  panelGradient.addColorStop(0, "#08121d");
  panelGradient.addColorStop(1, "#111f31");
  ctx.fillStyle = panelGradient;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  drawWarningStripes(ctx, 18, 16, ctx.canvas.width - 36, 12, 0.8);
  drawWarningStripes(ctx, 18, ctx.canvas.height - 28, ctx.canvas.width - 36, 12, 0.8);

  ctx.fillStyle = "rgba(160, 222, 255, 0.12)";
  ctx.fillRect(34, 34, ctx.canvas.width - 68, ctx.canvas.height - 68);
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = 2;
  ctx.strokeRect(34, 34, ctx.canvas.width - 68, ctx.canvas.height - 68);

  ctx.fillStyle = "#9ed9ff";
  ctx.font = '700 14px "Trebuchet MS", sans-serif';
  ctx.fillText("NEXT FEED", 54, 60);

  if (!pair) return;
  drawBlob(ctx, 90, 80, pair.child);
  drawBlob(ctx, 90, 132, pair.pivot);
}
