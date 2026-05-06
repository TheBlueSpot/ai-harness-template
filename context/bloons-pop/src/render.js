import { HEIGHT, WIDTH } from "./data.js";

function drawTrack(ctx, state) {
  const { pathPoints, theme } = state;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.strokeStyle = theme.trackOuter;
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

  ctx.strokeStyle = theme.trackInner;
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

  ctx.strokeStyle = theme.trackDash;
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

  ctx.strokeStyle = theme.trackGlow || theme.panelGlow;
  ctx.lineWidth = 18;
  ctx.globalAlpha = 0.28;
  ctx.beginPath();
  pathPoints.forEach((point, index) => {
    if (index === 0) {
      ctx.moveTo(point.x, point.y);
    } else {
      ctx.lineTo(point.x, point.y);
    }
  });
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.strokeStyle = state.waveActive ? "rgba(255,255,255,0.34)" : "rgba(255,255,255,0.14)";
  ctx.lineWidth = state.waveActive ? 8 : 5;
  ctx.setLineDash(state.waveActive ? [28, 30] : [12, 26]);
  ctx.lineDashOffset = -(state.time || 0) * (state.waveActive ? 210 : 64);
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
  ctx.lineDashOffset = 0;
}

function drawRouteBeacons(ctx, state) {
  const pressure = state.threatMetrics?.routePressure || 0;
  for (let index = 1; index < state.pathPoints.length - 1; index += 1) {
    const point = state.pathPoints[index];
    const pulse = 8 + pressure * 3 + Math.sin((state.time || 0) * (state.waveActive ? 5 : 4) + index * 0.8) * (1.5 + pressure * 1.3);
    ctx.globalAlpha = state.waveActive ? 0.24 + pressure * 0.14 : 0.14;
    ctx.fillStyle = state.theme.accent;
    ctx.beginPath();
    ctx.arc(point.x, point.y, pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.42 + pressure * 0.2;
    ctx.strokeStyle = "rgba(255,255,255,0.32)";
    ctx.lineWidth = 2 + pressure * 0.7;
    ctx.beginPath();
    ctx.arc(point.x, point.y, pulse + 7, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawThreatTelegraphs(ctx, state) {
  const candidates = [...state.bloons]
    .filter((bloon) => bloon.armored || bloon.volatile || bloon.maxHp >= 8)
    .sort((left, right) => right.distance - left.distance)
    .slice(0, 6);
  if (candidates.length === 0) {
    return;
  }
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (const bloon of candidates) {
    const length = Math.min(92, 34 + bloon.speed * 0.28);
    const endX = bloon.x + bloon.dirX * length;
    const endY = bloon.y + bloon.dirY * length;
    const alpha = bloon.maxHp >= 18 ? 0.32 : bloon.volatile ? 0.28 : 0.2;
    ctx.globalAlpha = 0.52;
    ctx.strokeStyle = "rgba(8, 12, 18, 0.42)";
    ctx.lineWidth = bloon.maxHp >= 18 ? 13 : 10;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(bloon.x, bloon.y);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    const gradient = ctx.createLinearGradient(bloon.x, bloon.y, endX, endY);
    gradient.addColorStop(0, "rgba(255,255,255,0)");
    gradient.addColorStop(0.38, bloon.volatile ? `rgba(255, 166, 120, ${alpha})` : `rgba(255,255,255,${alpha * 0.72})`);
    gradient.addColorStop(1, bloon.volatile ? `rgba(255, 126, 92, ${alpha * 0.56})` : `${bloon.color}${bloon.maxHp >= 18 ? "88" : "55"}`);
    ctx.strokeStyle = gradient;
    ctx.lineWidth = bloon.maxHp >= 18 ? 8 : 6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(bloon.x, bloon.y);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    ctx.globalAlpha = 0.55;
    ctx.fillStyle = bloon.volatile ? "rgba(255, 196, 148, 0.55)" : "rgba(255,255,255,0.4)";
    ctx.beginPath();
    ctx.arc(endX, endY, bloon.maxHp >= 18 ? 7 : 5, 0, Math.PI * 2);
    ctx.fill();
    if (bloon.maxHp >= 18) {
      const sideX = -bloon.dirY || 0;
      const sideY = bloon.dirX || 0;
      ctx.strokeStyle = "rgba(255, 248, 224, 0.42)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(endX - sideX * 7 - bloon.dirX * 8, endY - sideY * 7 - bloon.dirY * 8);
      ctx.lineTo(endX, endY);
      ctx.lineTo(endX + sideX * 7 - bloon.dirX * 8, endY + sideY * 7 - bloon.dirY * 8);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function drawRouteMarkers(ctx, state) {
  const start = state.pathPoints[0];
  const exit = state.pathPoints[state.pathPoints.length - 1];
  const beat = state.waveActive ? 0.55 : 0.28;
  const clock = state.time || 0;

  const startPulse = 24 + Math.sin(clock * (state.waveActive ? 7 : 4)) * 3;
  const exitPulse = 26 + Math.sin(clock * 5 + 1.4) * 3;

  ctx.globalAlpha = beat;
  ctx.strokeStyle = state.theme.accent;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(start.x, start.y, startPulse, 0, Math.PI * 2);
  ctx.stroke();

  ctx.globalAlpha = state.waveActive ? 0.5 : 0.25;
  ctx.strokeStyle = "rgba(255,255,255,0.72)";
  ctx.beginPath();
  ctx.arc(exit.x, exit.y, exitPulse, 0, Math.PI * 2);
  ctx.stroke();

  ctx.globalAlpha = 1;
  ctx.fillStyle = "rgba(7, 15, 19, 0.7)";
  ctx.beginPath();
  ctx.arc(start.x, start.y, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(exit.x, exit.y, 15, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#f8f9fa";
  ctx.font = "700 13px Trebuchet MS, sans-serif";
  ctx.fillText("IN", start.x - 10, start.y + 4);
  ctx.fillText("OUT", exit.x - 14, exit.y + 4);
}

function drawStarterPads(ctx, state) {
  if (!Array.isArray(state.starterPads) || state.starterPads.length === 0) {
    return;
  }
  const pulseTime = state.time || 0;
  ctx.save();
  ctx.textAlign = "center";
  for (const [index, pad] of state.starterPads.entries()) {
    const pulse = 30 + Math.sin(pulseTime * 3.2 + index * 0.9) * 3;
    const targetX = Number.isFinite(pad.targetX) ? pad.targetX : pad.x;
    const targetY = Number.isFinite(pad.targetY) ? pad.targetY : pad.y - 72;

    ctx.globalAlpha = 0.52;
    ctx.strokeStyle = `${state.theme.accent}dd`;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.moveTo(pad.x, pad.y - 14);
    ctx.lineTo(targetX, targetY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.globalAlpha = 0.22;
    ctx.fillStyle = state.theme.accent;
    ctx.beginPath();
    ctx.arc(targetX, targetY, 14, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.84;
    ctx.strokeStyle = "rgba(255,255,255,0.72)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(targetX, targetY, 7, 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = 0.18;
    ctx.fillStyle = state.theme.accent;
    ctx.beginPath();
    ctx.arc(pad.x, pad.y, pulse, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.72;
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 2.5;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.arc(pad.x, pad.y, pulse + 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.globalAlpha = 0.88;
    ctx.fillStyle = "rgba(7, 15, 19, 0.82)";
    ctx.fillRect(pad.x - 64, pad.y - 68, 128, 42);
    ctx.fillStyle = "#f8f9fa";
    ctx.font = "700 12px Trebuchet MS, sans-serif";
    ctx.fillText(pad.label || "Build", pad.x, pad.y - 52);
    ctx.globalAlpha = 0.76;
    ctx.font = "600 11px Trebuchet MS, sans-serif";
    ctx.fillText(pad.subtitle || "safe opener", pad.x, pad.y - 38);
    if (pad.detail) {
      ctx.globalAlpha = 0.56;
      ctx.font = "600 10px Trebuchet MS, sans-serif";
      ctx.fillText(pad.detail, pad.x, pad.y - 24);
    }
  }
  ctx.restore();
}

function drawBackground(ctx, theme) {
  const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  sky.addColorStop(0, theme.skyTop);
  sky.addColorStop(1, theme.skyBottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = theme.grass;
  ctx.fillRect(0, theme.grassTop, WIDTH, HEIGHT - theme.grassTop);

  for (let i = 0; i < 24; i += 1) {
    ctx.fillStyle = i % 2 === 0 ? theme.grassStripeA : theme.grassStripeB;
    ctx.fillRect((i * 83) % WIDTH, theme.grassTop + HEIGHT * 0.03 + ((i * 47) % 180), 38, 8);
  }

  ctx.globalAlpha = 0.26;
  ctx.fillStyle = theme.panelGlow;
  ctx.beginPath();
  ctx.arc(1080, 128, 160, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(178, 152, 116, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawTower(ctx, tower, accent) {
  ctx.fillStyle = "rgba(6, 14, 18, 0.22)";
  ctx.beginPath();
  ctx.ellipse(tower.x, tower.y + 12, 22, 9, 0, 0, Math.PI * 2);
  ctx.fill();

  if (tower.isSelected) {
    ctx.strokeStyle = accent;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(tower.x, tower.y, 28, 0, Math.PI * 2);
    ctx.stroke();
  }

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
  ctx.fillStyle = "rgba(6, 14, 18, 0.18)";
  ctx.beginPath();
  ctx.ellipse(bloon.x, bloon.y + bloon.radius * 0.68, bloon.radius * 0.9, bloon.radius * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();

  if (bloon.slowedUntil > bloon.time) {
    ctx.strokeStyle = "rgba(171, 255, 161, 0.52)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(bloon.x, bloon.y, bloon.radius + 7, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (bloon.armored || bloon.maxHp >= 8) {
    ctx.fillStyle = "rgba(7, 12, 18, 0.5)";
    ctx.beginPath();
    ctx.ellipse(bloon.x, bloon.y, bloon.radius + 4, bloon.radius + 9, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = bloon.color;
  ctx.beginPath();
  ctx.ellipse(bloon.x, bloon.y, bloon.radius, bloon.radius + 5, 0, 0, Math.PI * 2);
  ctx.fill();

  if (bloon.armored || bloon.maxHp >= 8) {
    ctx.strokeStyle = "rgba(7, 12, 18, 0.78)";
    ctx.lineWidth = bloon.maxHp >= 18 ? 5.5 : 4.5;
    ctx.beginPath();
    ctx.ellipse(bloon.x, bloon.y, bloon.radius + 1, bloon.radius + 6, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = bloon.maxHp >= 18 ? "rgba(255,255,255,0.44)" : "rgba(255,255,255,0.28)";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.ellipse(bloon.x, bloon.y, bloon.radius - 2, bloon.radius + 2, 0, Math.PI * 1.08, Math.PI * 1.92);
    ctx.stroke();

    ctx.strokeStyle = bloon.armored ? "rgba(30, 37, 44, 0.92)" : "rgba(255, 246, 214, 0.82)";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(bloon.x - bloon.radius * 0.42, bloon.y - bloon.radius - 2);
    ctx.lineTo(bloon.x, bloon.y - bloon.radius - 10);
    ctx.lineTo(bloon.x + bloon.radius * 0.42, bloon.y - bloon.radius - 2);
    ctx.stroke();
  }

  if (bloon.armored) {
    ctx.strokeStyle = "rgba(28, 34, 40, 0.8)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(bloon.x, bloon.y, bloon.radius - 4, Math.PI * 0.16, Math.PI * 1.84);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(bloon.x - bloon.radius * 0.4, bloon.y - 3);
    ctx.lineTo(bloon.x + bloon.radius * 0.4, bloon.y - 3);
    ctx.stroke();
  }

  if (bloon.bonusCash) {
    ctx.fillStyle = "rgba(255, 248, 198, 0.92)";
    ctx.font = "700 18px Trebuchet MS, sans-serif";
    ctx.fillText("$", bloon.x - 6, bloon.y + 6);
  }

  if (bloon.children) {
    ctx.strokeStyle = "rgba(255,255,255,0.68)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(bloon.x - bloon.radius * 0.5, bloon.y - 2);
    ctx.lineTo(bloon.x + bloon.radius * 0.5, bloon.y - 2);
    ctx.stroke();
  }

  if (bloon.volatile) {
    ctx.strokeStyle = "rgba(255, 198, 77, 0.94)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(bloon.x - 5, bloon.y - bloon.radius - 6);
    ctx.lineTo(bloon.x, bloon.y - bloon.radius - 14);
    ctx.lineTo(bloon.x + 5, bloon.y - bloon.radius - 6);
    ctx.stroke();
  }

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

function drawEffect(ctx, effect) {
  if (effect.delay && effect.delay > 0) {
    return;
  }
  const ratio = Math.max(0, effect.life / effect.maxLife);
  ctx.globalAlpha = ratio;
  if (effect.kind !== "lanePulse") {
    ctx.fillStyle = effect.color;
    ctx.globalAlpha = ratio * 0.16;
    ctx.beginPath();
    ctx.arc(effect.x, effect.y, effect.radius * 1.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = ratio;
  }
  if (effect.kind === "ring" || effect.kind === "shockwave") {
    ctx.save();
    ctx.globalCompositeOperation = effect.kind === "shockwave" ? "screen" : "source-over";
    ctx.strokeStyle = effect.color;
    ctx.lineWidth = (effect.lineWidth || 4) * (effect.kind === "shockwave" ? 1 + (1 - ratio) * 0.35 : 1);
    ctx.beginPath();
    ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  } else if (effect.kind === "lanePulse") {
    ctx.strokeStyle = effect.color;
    ctx.lineWidth = (effect.lineWidth || 8) * (0.8 + (1 - ratio) * 0.5);
    ctx.beginPath();
    ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = ratio * 0.45;
    ctx.fillStyle = effect.color;
    ctx.beginPath();
    ctx.arc(effect.x, effect.y, effect.radius * 0.44, 0, Math.PI * 2);
    ctx.fill();
  } else if (effect.kind === "trail") {
    ctx.fillStyle = effect.color;
    ctx.beginPath();
    ctx.ellipse(effect.x, effect.y, effect.radius * 1.1, effect.radius * 0.65, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (effect.kind === "drift") {
    ctx.fillStyle = effect.color;
    ctx.beginPath();
    ctx.ellipse(effect.x, effect.y, effect.radius * 1.25, effect.radius * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = ratio * 0.5;
    ctx.beginPath();
    ctx.arc(effect.x, effect.y, effect.radius * 0.45, 0, Math.PI * 2);
    ctx.fill();
  } else if (effect.kind === "flash") {
    const gradient = ctx.createRadialGradient(effect.x, effect.y, 0, effect.x, effect.y, effect.radius);
    gradient.addColorStop(0, effect.color);
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2);
    ctx.fill();
  } else if (effect.kind === "sparkle") {
    ctx.strokeStyle = effect.color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(effect.x - effect.radius, effect.y);
    ctx.lineTo(effect.x + effect.radius, effect.y);
    ctx.moveTo(effect.x, effect.y - effect.radius);
    ctx.lineTo(effect.x, effect.y + effect.radius);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(effect.x, effect.y, effect.radius * 0.38, 0, Math.PI * 2);
    ctx.fill();
  } else if (effect.kind === "burst" && Array.isArray(effect.sparks)) {
    ctx.fillStyle = effect.color;
    ctx.beginPath();
    ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2);
    ctx.fill();
    for (const spark of effect.sparks) {
      const sparkLength = spark.length * (1 - ratio * 0.15);
      const endX = effect.x + Math.cos(spark.angle) * sparkLength;
      const endY = effect.y + Math.sin(spark.angle) * sparkLength;
      ctx.strokeStyle = spark.color;
      ctx.lineWidth = spark.width;
      ctx.beginPath();
      ctx.moveTo(effect.x, effect.y);
      ctx.lineTo(endX, endY);
      ctx.stroke();
      ctx.fillStyle = spark.color;
      ctx.beginPath();
      ctx.arc(endX, endY, effect.sparkRadius || 2, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    ctx.fillStyle = effect.color;
    ctx.beginPath();
    ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawVignette(ctx) {
  const vignette = ctx.createRadialGradient(WIDTH * 0.5, HEIGHT * 0.45, HEIGHT * 0.18, WIDTH * 0.5, HEIGHT * 0.45, WIDTH * 0.66);
  vignette.addColorStop(0, "rgba(255,255,255,0)");
  vignette.addColorStop(1, "rgba(3, 9, 14, 0.32)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function drawAccentBloom(ctx, state) {
  const start = state.pathPoints[0];
  const exit = state.pathPoints[state.pathPoints.length - 1];
  const liveBoost = state.waveActive ? 1 : 0.52;
  const accentSoft = state.theme.accent;

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  const startGlow = ctx.createRadialGradient(start.x, start.y, 0, start.x, start.y, 130);
  startGlow.addColorStop(0, `${accentSoft}66`);
  startGlow.addColorStop(0.45, `${accentSoft}1a`);
  startGlow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.globalAlpha = 0.16 * liveBoost;
  ctx.fillStyle = startGlow;
  ctx.beginPath();
  ctx.arc(start.x, start.y, 130, 0, Math.PI * 2);
  ctx.fill();

  const exitGlow = ctx.createRadialGradient(exit.x, exit.y, 0, exit.x, exit.y, 156);
  exitGlow.addColorStop(0, "rgba(255, 255, 255, 0.22)");
  exitGlow.addColorStop(0.38, `${accentSoft}22`);
  exitGlow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.globalAlpha = 0.11 + (state.startingLives > 0 ? (1 - state.lives / state.startingLives) * 0.16 : 0);
  ctx.fillStyle = exitGlow;
  ctx.beginPath();
  ctx.arc(exit.x, exit.y, 156, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawDangerWash(ctx, state) {
  const livesRatio = state.startingLives > 0 ? state.lives / state.startingLives : 1;
  const danger = Math.max(0, 1 - livesRatio * 1.8);
  if (danger <= 0) {
    return;
  }
  const overlay = ctx.createLinearGradient(0, HEIGHT, 0, 0);
  overlay.addColorStop(0, `rgba(255, 84, 84, ${0.14 * danger})`);
  overlay.addColorStop(1, "rgba(255, 84, 84, 0)");
  ctx.fillStyle = overlay;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function drawScreenPulse(ctx, state) {
  if (!state.screenPulse) {
    return;
  }
  const ratio = Math.max(0, state.screenPulse.life / state.screenPulse.maxLife);
  const pulseX = state.screenPulse.x ?? WIDTH * 0.5;
  const pulseY = state.screenPulse.y ?? HEIGHT * 0.5;
  const pulseRadius = Math.max(84, Math.min(WIDTH * 0.26, state.screenPulse.radius || WIDTH * 0.2));
  const pulse = ctx.createRadialGradient(pulseX, pulseY, 0, pulseX, pulseY, pulseRadius);
  pulse.addColorStop(0, state.screenPulse.color);
  pulse.addColorStop(0.3, state.screenPulse.color);
  pulse.addColorStop(1, "rgba(255,255,255,0)");
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = state.screenPulse.intensity * ratio * 0.9;
  ctx.fillStyle = pulse;
  ctx.beginPath();
  ctx.arc(pulseX, pulseY, pulseRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawCombatGrade(ctx, state) {
  const routePressure = state.threatMetrics?.routePressure || 0;
  const combatStrength = (state.waveActive ? 0.08 : 0.03) + routePressure * 0.08;
  const urgency = state.startingLives > 0 ? Math.max(0, 1 - state.lives / state.startingLives) : 0;
  if (combatStrength <= 0 && urgency <= 0) {
    return;
  }

  ctx.save();
  const overlay = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  overlay.addColorStop(0, `${state.theme.accent}10`);
  overlay.addColorStop(0.55, "rgba(255,255,255,0)");
  overlay.addColorStop(1, `rgba(255, 102, 102, ${0.06 + urgency * 0.12})`);
  ctx.globalAlpha = 0.7 + combatStrength;
  ctx.fillStyle = overlay;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.globalAlpha = 0.1 + combatStrength * 0.6;
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  const drift = ((state.time || 0) * 12) % 18;
  for (let y = -18; y < HEIGHT + 18; y += 18) {
    ctx.beginPath();
    ctx.moveTo(0, y + drift);
    ctx.lineTo(WIDTH, y + drift);
    ctx.stroke();
  }
  ctx.restore();
}

export function renderScene(ctx, state) {
  const shake = state.screenShake || 0;
  const offsetX = shake > 0.05 ? Math.sin((state.time || 0) * 52) * shake : 0;
  const offsetY = shake > 0.05 ? Math.cos((state.time || 0) * 44) * shake * 0.75 : 0;
  ctx.save();
  ctx.translate(offsetX, offsetY);
  drawBackground(ctx, state.theme);
  drawTrack(ctx, state);
  drawRouteBeacons(ctx, state);
  drawRouteMarkers(ctx, state);
  drawStarterPads(ctx, state);
  drawThreatTelegraphs(ctx, state);

  if (state.preview) {
    ctx.fillStyle = state.preview.valid ? "rgba(124, 255, 166, 0.18)" : "rgba(255, 99, 99, 0.18)";
    ctx.beginPath();
    ctx.arc(state.preview.x, state.preview.y, state.preview.range, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = state.preview.valid ? "rgba(124, 255, 166, 0.7)" : "rgba(255, 99, 99, 0.7)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(state.preview.x, state.preview.y, 22, 0, Math.PI * 2);
    ctx.stroke();
  }

  for (const tower of state.towers) {
    drawTower(ctx, tower, state.theme.accent);
  }

  for (const projectile of state.projectiles) {
    ctx.strokeStyle = projectile.color;
    ctx.lineWidth = projectile.radius * (projectile.type === "bomb" ? 1.45 : 1.05);
    ctx.lineCap = "round";
    ctx.globalAlpha = projectile.type === "bomb" ? 0.34 : 0.26;
    ctx.beginPath();
    ctx.moveTo(projectile.x - projectile.vx * projectile.trailLife, projectile.y - projectile.vy * projectile.trailLife);
    ctx.lineTo(projectile.x, projectile.y);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = projectile.radius * 0.34;
    ctx.beginPath();
    ctx.moveTo(projectile.x - projectile.vx * 0.018, projectile.y - projectile.vy * 0.018);
    ctx.lineTo(projectile.x, projectile.y);
    ctx.stroke();
    ctx.strokeStyle = projectile.color;
    ctx.lineWidth = projectile.radius * 0.8;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(projectile.x - projectile.vx * 0.025, projectile.y - projectile.vy * 0.025);
    ctx.lineTo(projectile.x, projectile.y);
    ctx.stroke();
    ctx.fillStyle = projectile.color;
    ctx.beginPath();
    ctx.arc(projectile.x, projectile.y, projectile.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const bloon of state.bloons) {
    drawBloon(ctx, bloon);
  }

  for (const effect of state.effects) {
    drawEffect(ctx, effect);
  }

  drawCombatGrade(ctx, state);
  drawAccentBloom(ctx, state);
  drawVignette(ctx);
  drawDangerWash(ctx, state);
  drawScreenPulse(ctx, state);
  ctx.restore();
}
