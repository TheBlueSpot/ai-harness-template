const COLORS = {
  sky: "#0b1220",
  mist: "#101a2c",
  field: "#141f2e",
  lane: "#26354d",
  laneGlow: "#7ed8ff",
  wall: "#5c6f86",
  wallHot: "#ffd166",
  wallCold: "#94a3b8",
  zombie: "#9ad58b",
  zombieDark: "#2f4d34",
  target: "#ffe08a",
  targetRing: "#ffb703",
  text: "#eaf2ff",
  dimText: "#aab7c8",
  danger: "#ff6b6b",
  success: "#90ee90",
  panel: "rgba(7, 12, 20, 0.72)",
  panelEdge: "rgba(170, 196, 255, 0.18)",
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function fitCanvas(ctx, viewport) {
  if (viewport?.width && viewport?.height) {
    return { width: viewport.width, height: viewport.height };
  }
  return { width: ctx.canvas.width, height: ctx.canvas.height };
}

function drawText(ctx, text, x, y, options = {}) {
  ctx.save();
  ctx.fillStyle = options.color || COLORS.text;
  ctx.textAlign = options.align || "left";
  ctx.textBaseline = options.baseline || "middle";
  ctx.font = options.font || "600 18px monospace";
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawPanel(ctx, x, y, width, height) {
  ctx.save();
  ctx.fillStyle = COLORS.panel;
  ctx.strokeStyle = COLORS.panelEdge;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 18);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function clearScene(ctx, width, height) {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, COLORS.sky);
  gradient.addColorStop(1, COLORS.mist);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

function drawLanes(ctx, field) {
  const laneHeight = field.height / 3;

  for (let i = 0; i < 3; i += 1) {
    const laneY = field.y + i * laneHeight;
    ctx.fillStyle = i === 1 ? "rgba(126, 216, 255, 0.06)" : "rgba(255, 255, 255, 0.03)";
    ctx.fillRect(field.x, laneY, field.width, laneHeight - 2);
    ctx.strokeStyle = i === 1 ? "rgba(126, 216, 255, 0.18)" : "rgba(155, 175, 207, 0.12)";
    ctx.beginPath();
    ctx.moveTo(field.x, laneY + laneHeight / 2);
    ctx.lineTo(field.x + field.width, laneY + laneHeight / 2);
    ctx.stroke();
  }
}

function laneCenter(field, laneIndex) {
  const laneHeight = field.height / 3;
  return field.y + laneHeight * laneIndex + laneHeight / 2;
}

function drawWall(ctx, field, state) {
  const wallWidth = Math.max(18, field.width * 0.04);
  const wallX = field.x + field.width - wallWidth - 12;
  const wallY = field.y + 10;
  const wallH = field.height - 20;

  ctx.save();
  ctx.fillStyle = state.finished ? COLORS.wallHot : COLORS.wall;
  ctx.fillRect(wallX, wallY, wallWidth, wallH);
  for (let i = 0; i < 6; i += 1) {
    const sy = wallY + (wallH / 6) * i;
    ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.14)";
    ctx.fillRect(wallX + 2, sy + 3, wallWidth - 4, 5);
  }
  ctx.fillStyle = state.finished ? "rgba(255, 209, 102, 0.18)" : "rgba(126, 216, 255, 0.16)";
  ctx.fillRect(wallX - 6, wallY + 10, 6, wallH - 20);
  ctx.restore();

  return { x: wallX, y: wallY, width: wallWidth, height: wallH };
}

function drawZombie(ctx, field, zombie, wall, state) {
  const laneIndex = state.lanes.findIndex((lane) => lane.id === zombie.laneId);
  const y = laneCenter(field, laneIndex >= 0 ? laneIndex : 1);
  const x = field.x + field.width * clamp(zombie.progress ?? 0, 0, 1);
  const bodyW = 72;
  const bodyH = 34;
  const bodyX = x - bodyW / 2;
  const bodyY = y - bodyH / 2;
  const active = state.activeTarget?.id === zombie.id;
  const typed = state.typedBuffer || "";
  const matched = active && typed.length > 0 && zombie.word.startsWith(typed);
  const crossed = x + bodyW / 2 >= wall.x;

  ctx.save();
  ctx.fillStyle = zombie.flash === "hit" ? COLORS.success : COLORS.zombieDark;
  ctx.beginPath();
  ctx.roundRect(bodyX, bodyY, bodyW, bodyH, 12);
  ctx.fill();
  ctx.strokeStyle = crossed ? COLORS.danger : active ? COLORS.targetRing : COLORS.zombie;
  ctx.lineWidth = active ? 3 : 2;
  ctx.stroke();

  ctx.fillStyle = COLORS.zombie;
  ctx.fillRect(bodyX + 8, bodyY + 7, bodyW - 16, 10);
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(bodyX + 14, bodyY + 18, bodyW - 28, 4);

  if (active) {
    ctx.strokeStyle = COLORS.targetRing;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 34, 0, Math.PI * 2);
    ctx.stroke();
  }

  drawText(ctx, zombie.word, x, bodyY - 18, {
    align: "center",
    font: matched ? "700 18px monospace" : "600 17px monospace",
    color: matched ? COLORS.target : COLORS.text,
  });

  if (zombie.state === "staggered") {
    drawText(ctx, "staggered", x, bodyY - 38, {
      align: "center",
      font: "700 14px monospace",
      color: COLORS.success,
    });
  }

  if (active && typed) {
    drawText(ctx, typed, x, bodyY + bodyH + 16, {
      align: "center",
      font: "700 14px monospace",
      color: COLORS.target,
    });
  }

  ctx.restore();
}

function drawField(ctx, state, field) {
  ctx.save();
  ctx.fillStyle = COLORS.field;
  ctx.fillRect(field.x, field.y, field.width, field.height);
  drawLanes(ctx, field);
  ctx.restore();

  const wall = drawWall(ctx, field, state);
  const zombies = Array.isArray(state.enemies) ? state.enemies : [];
  zombies.forEach((zombie) => drawZombie(ctx, field, zombie, wall, state));
  return wall;
}

function drawOverlay(ctx, viewport, state) {
  const { width, height } = viewport;
  const activeWord = state.activeTarget?.word || "-";

  drawText(ctx, "Typing Zombie Siege", 24, 22, {
    font: "700 20px monospace",
    color: COLORS.text,
  });

  drawPanel(ctx, 18, 16, Math.min(400, width * 0.34), 74);
  drawText(ctx, `Health ${state.barricadeHealth ?? 0}`, 36, 40, { font: "700 18px monospace" });
  drawText(ctx, `Score ${state.score ?? 0}`, 36, 66, { color: COLORS.dimText });
  drawText(ctx, `Wave ${state.wave?.completed ?? 0}/${state.wave?.total ?? 0}`, 180, 40, { font: "700 18px monospace" });
  drawText(ctx, state.prompt || "Defend the fence", 180, 66, {
    color: state.mode === "win" ? COLORS.target : COLORS.dimText,
  });

  drawPanel(ctx, 18, height - 90, Math.min(520, width * 0.56), 58);
  drawText(ctx, "Typed", 36, height - 68, { color: COLORS.dimText, font: "700 14px monospace" });
  drawText(ctx, state.typedBuffer || "_", 98, height - 68, {
    font: "700 22px monospace",
    color: COLORS.target,
  });
  drawText(ctx, "Target", 240, height - 68, { color: COLORS.dimText, font: "700 14px monospace" });
  drawText(ctx, activeWord, 306, height - 68, {
    font: "700 22px monospace",
    color: COLORS.text,
  });

  if (state.lastEvent) {
    drawText(ctx, state.lastEvent, width - 24, height - 68, {
      align: "right",
      color: COLORS.dimText,
      font: "700 14px monospace",
    });
  }

  if (state.mode === "menu") {
    drawPanel(ctx, width * 0.28, height * 0.14, width * 0.44, 70);
    drawText(ctx, "Type to wake the tower defense", width / 2, height * 0.14 + 24, {
      align: "center",
      font: "700 18px monospace",
    });
    drawText(ctx, "Backspace trims, Enter fires the word", width / 2, height * 0.14 + 48, {
      align: "center",
      color: COLORS.dimText,
      font: "600 14px monospace",
    });
  }

  if (state.mode === "win") {
    drawPanel(ctx, width * 0.24, height * 0.22, width * 0.52, 120);
    drawText(ctx, "The fence held", width / 2, height * 0.22 + 32, {
      align: "center",
      font: "800 34px monospace",
      color: COLORS.success,
    });
    drawText(ctx, "Escape to reset and defend again", width / 2, height * 0.22 + 68, {
      align: "center",
      color: COLORS.dimText,
      font: "600 16px monospace",
    });
  }

  if (state.mode === "lose") {
    drawPanel(ctx, width * 0.24, height * 0.22, width * 0.52, 120);
    drawText(ctx, "The barricade fell", width / 2, height * 0.22 + 32, {
      align: "center",
      font: "800 34px monospace",
      color: COLORS.danger,
    });
    drawText(ctx, "Escape to reset and hold again", width / 2, height * 0.22 + 68, {
      align: "center",
      color: COLORS.dimText,
      font: "600 16px monospace",
    });
  }
}

export function renderGame(ctx, frameState, viewport) {
  const { width, height } = fitCanvas(ctx, viewport);
  const state = frameState || {};
  const field = {
    x: Math.max(24, width * 0.06),
    y: Math.max(96, height * 0.14),
    width: Math.min(width * 0.88, 1100),
    height: Math.max(220, height * 0.54),
  };
  field.x = Math.min(field.x, Math.max(20, width - field.width - 20));

  clearScene(ctx, width, height);

  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.03)";
  for (let i = 0; i < 32; i += 1) {
    const px = (i * 97) % width;
    const py = (i * 53) % height;
    ctx.fillRect(px, py, 2, 2);
  }
  ctx.restore();

  drawField(ctx, state, field);
  drawOverlay(ctx, { width, height }, state);
}

export { renderGame as render };
