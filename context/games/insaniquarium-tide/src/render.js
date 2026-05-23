const SKY_TOP = "#071620";
const SKY_BOTTOM = "#0d3348";
const WATER_TOP = "#0d5d7e";
const WATER_BOTTOM = "#07202d";
const SAND = "#b89d63";

export function renderGame(ctx, frameState = {}, viewport = {}) {
  const width = viewport.width || ctx.canvas.width || 1600;
  const height = viewport.height || ctx.canvas.height || 900;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);

  drawBackdrop(ctx, width, height);
  drawAquarium(ctx, width, height, frameState);
  drawEntities(ctx, frameState, width, height);
  drawHUD(ctx, frameState, width, height);
  drawOverlay(ctx, frameState, width, height);
}

function drawBackdrop(ctx, width, height) {
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, SKY_TOP);
  sky.addColorStop(0.55, SKY_BOTTOM);
  sky.addColorStop(1, "#051019");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  const water = ctx.createLinearGradient(0, height * 0.1, 0, height);
  water.addColorStop(0, "rgba(109, 226, 255, 0.20)");
  water.addColorStop(1, "rgba(9, 29, 39, 0.64)");
  ctx.fillStyle = water;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
  for (let i = 0; i < 24; i += 1) {
    const x = (i * 97 + (frameState.time || 0) * 12) % (width + 140) - 70;
    const y = 40 + (i % 6) * 58;
    ctx.beginPath();
    ctx.ellipse(x, y, 18, 7, 0.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawAquarium(ctx, width, height, frameState) {
  const tank = getTank(frameState, width, height);
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  ctx.strokeStyle = "rgba(180, 240, 255, 0.28)";
  ctx.lineWidth = Math.max(2, Math.round(width * 0.002));
  roundRect(ctx, tank.x, tank.y, tank.w, tank.h, 26);
  ctx.fill();
  ctx.stroke();

  const water = ctx.createLinearGradient(0, tank.y, 0, tank.y + tank.h);
  water.addColorStop(0, "rgba(104, 219, 255, 0.22)");
  water.addColorStop(1, "rgba(7, 32, 47, 0.68)");
  ctx.fillStyle = water;
  roundRect(ctx, tank.x + 8, tank.y + 8, tank.w - 16, tank.h - 16, 20);
  ctx.fill();

  ctx.fillStyle = SAND;
  ctx.fillRect(tank.x + 18, tank.y + tank.h - 88, tank.w - 36, 68);
  ctx.fillStyle = "rgba(255,255,255,0.10)";
  for (let i = 0; i < 16; i += 1) {
    const x = tank.x + 24 + i * ((tank.w - 48) / 16);
    ctx.fillRect(x, tank.y + tank.h - 98, 5, 10);
  }
  ctx.restore();
}

function drawEntities(ctx, frameState, width, height) {
  const tank = getTank(frameState, width, height);
  const fish = frameState.fish ?? frameState.entities?.fish ?? [];
  const threats = frameState.threats ?? frameState.aliens ?? [];
  const food = frameState.food ?? [];
  const coins = frameState.coins ?? [];
  const eggs = frameState.eggs ?? [];
  const shots = frameState.shots ?? [];

  for (const bubble of frameState.bubbles ?? []) {
    const x = tank.x + bubble.x * tank.w;
    const y = tank.y + bubble.y * tank.h;
    const r = bubble.radius ?? 8;
    ctx.fillStyle = bubble.fill ?? "rgba(240, 255, 255, 0.34)";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const item of food) {
    drawPellet(ctx, tank.x + item.x * tank.w, tank.y + item.y * tank.h, item);
  }

  for (const coin of coins) {
    drawCoin(ctx, tank.x + coin.x * tank.w, tank.y + coin.y * tank.h, coin);
  }

  for (const shot of shots) {
    drawShot(ctx, tank.x + shot.x * tank.w, tank.y + shot.y * tank.h, shot);
  }

  for (const creature of fish) {
    drawFish(ctx, tank, creature);
  }

  for (const threat of threats) {
    drawAlien(ctx, tank, threat);
  }

  for (const egg of eggs) {
    drawEgg(ctx, tank, egg);
  }

  drawCursor(ctx, frameState, tank);
  drawThreatWarning(ctx, frameState, tank);
}

function drawFish(ctx, tank, fish) {
  const x = tank.x + tank.w * (fish.x ?? 0.5);
  const y = tank.y + tank.h * (fish.y ?? 0.45);
  const dir = fish.facing ?? fish.dir ?? 1;
  const scale = fish.scale ?? 1;
  const bodyW = 58 * scale;
  const bodyH = 26 * scale;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir, 1);
  ctx.fillStyle = fish.color ?? "#ffb35a";
  ctx.beginPath();
  ctx.ellipse(0, 0, bodyW * 0.5, bodyH * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff4dd";
  ctx.beginPath();
  ctx.arc(14 * scale, -4 * scale, 4 * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2c1f17";
  ctx.beginPath();
  ctx.arc(16 * scale, -4 * scale, 1.6 * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = fish.finColor ?? "#ff8e4e";
  ctx.beginPath();
  ctx.moveTo(-bodyW * 0.55, 0);
  ctx.lineTo(-bodyW * 0.82, -14 * scale);
  ctx.lineTo(-bodyW * 0.82, 14 * scale);
  ctx.closePath();
  ctx.fill();
  if (fish.hungry) {
    ctx.strokeStyle = "rgba(255, 214, 102, 0.7)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, -34 * scale, 14 * scale, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
  }
  ctx.restore();
}

function drawAlien(ctx, tank, threat) {
  const x = tank.x + tank.w * (threat.x ?? 0.75);
  const y = tank.y + tank.h * (threat.y ?? 0.36);
  const scale = threat.scale ?? 1;
  const pulse = 0.5 + Math.sin((threat.phase ?? 0) * 6) * 0.5;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "rgba(120, 255, 164, 0.16)";
  ctx.beginPath();
  ctx.arc(0, 0, 46 * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = threat.color ?? "#b9ff6e";
  ctx.beginPath();
  ctx.ellipse(0, 0, 28 * scale, 18 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#102019";
  ctx.fillRect(-14 * scale, -2 * scale, 10 * scale, 4 * scale);
  ctx.fillRect(4 * scale, -2 * scale, 10 * scale, 4 * scale);
  ctx.strokeStyle = `rgba(255, 82, 82, ${0.35 + pulse * 0.45})`;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-48 * scale, -46 * scale);
  ctx.lineTo(-12 * scale, -16 * scale);
  ctx.lineTo(20 * scale, -16 * scale);
  ctx.stroke();
  ctx.restore();
}

function drawPellet(ctx, x, y, item) {
  const r = item.radius ?? 8;
  ctx.fillStyle = item.color ?? "#ffd86a";
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function drawCoin(ctx, x, y, coin) {
  const radius = 10 + (coin.value ?? 1) * 2;
  ctx.save();
  ctx.fillStyle = "#ffe27a";
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(140, 88, 12, 0.7)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "rgba(104, 65, 6, 0.9)";
  ctx.font = "700 12px Trebuchet MS, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("$", x, y + 1);
  ctx.restore();
}

function drawShot(ctx, x, y, shot) {
  ctx.save();
  ctx.fillStyle = "#fff9df";
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 241, 184, 0.45)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - (shot.vx ?? 0) * 22, y - (shot.vy ?? 0) * 22);
  ctx.stroke();
  ctx.restore();
}

function drawEgg(ctx, tank, egg) {
  const x = tank.x + tank.w * (egg.x ?? 0.5);
  const y = tank.y + tank.h * (egg.y ?? 0.62);
  const pulse = 1 + Math.sin((egg.pulse ?? 0) * 4) * 0.08;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(pulse, pulse);
  ctx.fillStyle = "#f4f2ff";
  ctx.beginPath();
  ctx.ellipse(0, 0, 18, 24, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(122, 224, 255, 0.9)";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
}

function drawCursor(ctx, frameState, tank) {
  const cursor = frameState.cursor ?? {};
  if (cursor.x == null || cursor.y == null) return;
  ctx.save();
  ctx.strokeStyle = cursor.active ? "rgba(255, 232, 165, 0.95)" : "rgba(255, 232, 165, 0.38)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(tank.x + cursor.x * tank.w, tank.y + cursor.y * tank.h, cursor.radius ?? 16, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawThreatWarning(ctx, frameState, tank) {
  const threats = frameState.threats ?? frameState.aliens ?? [];
  if (!threats.length || !frameState.warning) return;
  const lead = threats[0];
  const x = tank.x + tank.w * (lead.x ?? 0.75);
  const y = tank.y + tank.h * Math.max(0.08, (lead.y ?? 0.24) - 0.12);
  ctx.save();
  ctx.fillStyle = "rgba(255, 84, 84, 0.92)";
  ctx.font = "700 13px Trebuchet MS, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(frameState.warning, x, y);
  ctx.strokeStyle = "rgba(255, 84, 84, 0.75)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y + 8);
  ctx.lineTo(tank.x + tank.w * (lead.x ?? 0.75), tank.y + tank.h * (lead.y ?? 0.24) - 18);
  ctx.stroke();
  ctx.restore();
}

function drawHUD(ctx, frameState, width, height) {
  const top = 26;
  ctx.save();
  ctx.fillStyle = "rgba(5, 17, 24, 0.32)";
  roundRect(ctx, 22, top, Math.min(360, width - 44), 86, 18);
  ctx.fill();
  ctx.fillStyle = "#f4fbff";
  ctx.font = "700 20px Georgia, serif";
  ctx.fillText(frameState.status ?? frameState.message ?? "Tank live", 40, top + 34);
  ctx.font = "500 13px system-ui, sans-serif";
  ctx.fillStyle = "rgba(226, 244, 251, 0.82)";
  ctx.fillText(
    `Sun ${Math.round(frameState.sun ?? 0)}   Fish ${Math.round(frameState.fishCount ?? 0)}   Threat ${frameState.threat ?? "Calm"}   ${frameState.goalText ?? "Egg 0 / 100"}`,
    40,
    top + 58,
  );
  if (frameState.hint) {
    ctx.fillStyle = "rgba(175, 234, 255, 0.9)";
    ctx.fillText(frameState.hint, 40, top + 78);
  } else if (frameState.warning) {
    ctx.fillStyle = "rgba(255, 99, 99, 0.92)";
    ctx.fillText(frameState.warning, 40, top + 78);
  }
  ctx.restore();
}

function drawOverlay(ctx, frameState, width, height) {
  const state = frameState.state ?? "menu";
  if (state === "playing" || state === "play") return;
  ctx.save();
  ctx.fillStyle = "rgba(4, 10, 14, 0.46)";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#f8fdff";
  ctx.font = "700 28px Georgia, serif";
  ctx.fillText(frameState.overlayTitle ?? "Insaniquarium Tide", 40, height * 0.78);
  ctx.font = "500 15px system-ui, sans-serif";
  ctx.fillStyle = "rgba(240, 248, 252, 0.82)";
  ctx.fillText(frameState.overlayCopy ?? "Press Start to begin.", 40, height * 0.78 + 28);
  if (frameState.overlayButton) {
    ctx.fillStyle = "#ffe27a";
    ctx.fillText(frameState.overlayButton, 40, height * 0.78 + 54);
  }
  ctx.restore();
}

function getTank(frameState, width, height) {
  const tank = frameState.tank ?? {};
  const w = tank.width ?? width * 0.72;
  const h = tank.height ?? height * 0.68;
  return {
    x: tank.x ?? (width - w) * 0.5,
    y: tank.y ?? height * 0.18,
    w,
    h,
  };
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}
