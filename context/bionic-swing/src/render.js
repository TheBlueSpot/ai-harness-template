const SKY = ["#07111f", "#143257", "#245b7d"];

export function renderFrame(ctx, frame) {
  const { width, height, cameraX } = frame;
  const shake = getShakeOffset(frame);

  ctx.clearRect(0, 0, width, height);

  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, SKY[0]);
  sky.addColorStop(0.5, SKY[1]);
  sky.addColorStop(1, SKY[2]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.translate(shake.x * 0.35, shake.y * 0.35);
  drawParallax(ctx, frame, 0.2, "#11253c", 180, 440);
  drawParallax(ctx, frame, 0.45, "#193b56", 240, 520);
  ctx.restore();

  ctx.save();
  ctx.translate(shake.x - cameraX, shake.y);

  for (const band of frame.stageBands) {
    ctx.fillStyle = band.color;
    ctx.fillRect(band.start, 0, band.end - band.start, height);
  }

  drawGuideBeam(ctx, frame);
  drawAnchorTarget(ctx, frame);
  drawTravelingHook(ctx, frame);

  for (const anchor of frame.anchors) {
    ctx.strokeStyle = "#6ee7f2";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(anchor.x - 18, anchor.y);
    ctx.lineTo(anchor.x + 18, anchor.y);
    ctx.moveTo(anchor.x, anchor.y - 18);
    ctx.lineTo(anchor.x, anchor.y + 18);
    ctx.stroke();
  }

  for (const platform of frame.platforms) {
    ctx.fillStyle = "#2f4257";
    ctx.fillRect(platform.x, platform.y, platform.w, platform.h);
    ctx.fillStyle = "#4c6782";
    ctx.fillRect(platform.x, platform.y, platform.w, 8);
  }

  for (const pad of frame.bouncePads) {
    const glow = ctx.createLinearGradient(pad.x, pad.y - 12, pad.x, pad.y + 8);
    glow.addColorStop(0, "#67e8f9");
    glow.addColorStop(1, "#0f172a");
    ctx.fillStyle = glow;
    ctx.fillRect(pad.x, pad.y - 12, pad.w, 12);
    ctx.strokeStyle = "#a5f3fc";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pad.x + 8, pad.y - 6);
    ctx.lineTo(pad.x + pad.w * 0.3, pad.y - 2);
    ctx.lineTo(pad.x + pad.w * 0.55, pad.y - 8);
    ctx.lineTo(pad.x + pad.w - 8, pad.y - 4);
    ctx.stroke();
  }

  for (const ring of frame.boostRings) {
    ctx.save();
    ctx.translate(ring.x, ring.y);
    ctx.strokeStyle = ring.flash > 0 ? "#fde047" : "#facc15";
    ctx.lineWidth = ring.flash > 0 ? 7 : 4;
    ctx.beginPath();
    ctx.arc(0, 0, ring.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "#fef08a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-ring.radius * 0.6, 0);
    ctx.lineTo(ring.radius * 0.6, 0);
    ctx.moveTo(ring.radius * 0.15, -ring.radius * 0.35);
    ctx.lineTo(ring.radius * 0.6, 0);
    ctx.lineTo(ring.radius * 0.15, ring.radius * 0.35);
    ctx.stroke();
    ctx.restore();
  }

  for (const checkpoint of frame.checkpoints) {
    const pulse = checkpoint.active ? 0.55 + 0.45 * Math.sin((frame.time ?? 0) * 6.2) : 0.18;
    if (checkpoint.active) {
      const aura = ctx.createRadialGradient(checkpoint.x, checkpoint.y - 34, 0, checkpoint.x, checkpoint.y - 34, 58);
      aura.addColorStop(0, colorToRgba("#fde68a", 0.2 + pulse * 0.18));
      aura.addColorStop(1, "rgba(245, 158, 11, 0)");
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(checkpoint.x, checkpoint.y - 34, 58, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = colorToRgba("#fef3c7", 0.42 + pulse * 0.28);
      ctx.lineWidth = 2 + pulse * 1.8;
      ctx.beginPath();
      ctx.arc(checkpoint.x, checkpoint.y - 34, 24 + pulse * 10, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = checkpoint.active ? "#f59e0b" : "#64748b";
    ctx.fillRect(checkpoint.x - 8, checkpoint.y - 50, 16, 50);
    ctx.beginPath();
    ctx.moveTo(checkpoint.x + 8, checkpoint.y - 48);
    ctx.lineTo(checkpoint.x + 54, checkpoint.y - 34);
    ctx.lineTo(checkpoint.x + 8, checkpoint.y - 20);
    ctx.closePath();
    ctx.fill();
  }

  for (const battery of frame.batteries) {
    ctx.fillStyle = battery.collected ? "rgba(0,0,0,0)" : "#a3e635";
    if (battery.collected) {
      continue;
    }
    ctx.fillRect(battery.x - 10, battery.y - 14, 20, 28);
    ctx.fillStyle = "#1f2937";
    ctx.fillRect(battery.x - 3, battery.y - 8, 6, 16);
  }

  for (const medkit of frame.medkits) {
    if (medkit.collected) {
      continue;
    }
    ctx.fillStyle = "#10b981";
    ctx.fillRect(medkit.x - 11, medkit.y - 11, 22, 22);
    ctx.fillStyle = "#ecfdf5";
    ctx.fillRect(medkit.x - 3, medkit.y - 8, 6, 16);
    ctx.fillRect(medkit.x - 8, medkit.y - 3, 16, 6);
  }

  for (const turret of frame.turrets) {
    if (turret.charge > 0) {
      const intensity = Math.min(1, turret.charge / turret.windup);
      ctx.save();
      ctx.strokeStyle = `rgba(251, 113, 133, ${0.2 + intensity * 0.45})`;
      ctx.lineWidth = 3;
      ctx.setLineDash([14, 10]);
      ctx.beginPath();
      ctx.moveTo(turret.x, turret.y);
      ctx.lineTo(turret.x + Math.cos(turret.lockedAngle) * 420, turret.y + Math.sin(turret.lockedAngle) * 420);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    ctx.save();
    ctx.translate(turret.x, turret.y);
    ctx.fillStyle = turret.flash > 0 ? "#f97316" : "#94a3b8";
    ctx.fillRect(-18, -16, 36, 32);
    ctx.rotate(turret.angle);
    ctx.fillStyle = "#cbd5e1";
    ctx.fillRect(0, -5, 30, 10);
    ctx.restore();
  }

  for (const drone of frame.drones) {
    ctx.save();
    ctx.translate(drone.x, drone.y);
    ctx.fillStyle = "#f472b6";
    ctx.beginPath();
    ctx.arc(0, 0, drone.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#fce7f3";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-drone.radius - 8, 0);
    ctx.lineTo(-drone.radius + 2, 0);
    ctx.moveTo(drone.radius - 2, 0);
    ctx.lineTo(drone.radius + 8, 0);
    ctx.moveTo(0, -drone.radius - 8);
    ctx.lineTo(0, -drone.radius + 2);
    ctx.stroke();
    ctx.restore();
  }

  drawEffects(ctx, frame.effects, "under");

  for (const bullet of frame.bullets) {
    if (!bullet.friendly) {
      const glow = ctx.createRadialGradient(bullet.x, bullet.y, 0, bullet.x, bullet.y, 16);
      glow.addColorStop(0, "rgba(255, 241, 176, 0.9)");
      glow.addColorStop(0.55, "rgba(251, 113, 133, 0.42)");
      glow.addColorStop(1, "rgba(251, 113, 133, 0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, 16, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = bullet.friendly ? "#f8fafc" : "#fb7185";
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  drawFlowTrails(ctx, frame);

  if (frame.player.grapple.active) {
    const flowStrength = frame.flow?.strength ?? 0;
    ctx.strokeStyle = flowStrength > 0.08 ? colorToRgba("#a5f3fc", 0.7 + flowStrength * 0.25) : "#67e8f9";
    ctx.lineWidth = 2 + flowStrength * 2.4;
    ctx.beginPath();
    ctx.moveTo(frame.player.x, frame.player.y - 18);
    ctx.lineTo(frame.player.grapple.anchorX, frame.player.grapple.anchorY);
    ctx.stroke();
  }

  drawPlayer(ctx, frame.player);
  drawGoal(ctx, frame.goal);
  drawEffects(ctx, frame.effects, "over");

  ctx.restore();
  drawGuideArrow(ctx, frame);
  drawThreatIndicators(ctx, frame);
  drawScreenFx(ctx, frame);
}

function drawPlayer(ctx, player) {
  const flashIndex = player.invuln > 0 ? Math.floor(player.flashTimer * 12) % 3 : -1;
  let bodyColor = "#f8fafc";
  let visorColor = "#0f172a";
  let helmetColor = "#38bdf8";
  let alpha = 1;

  if (player.hurt > 0.68) {
    bodyColor = "#fb7185";
    helmetColor = "#f59e0b";
    visorColor = "#fff7ed";
  } else if (flashIndex === 0) {
    bodyColor = "#f8fafc";
    helmetColor = "#67e8f9";
    visorColor = "#0f172a";
  } else if (flashIndex === 1) {
    bodyColor = "#67e8f9";
    helmetColor = "#ffffff";
    visorColor = "#082f49";
    alpha = 0.88;
  } else if (flashIndex === 2) {
    bodyColor = "#f59e0b";
    helmetColor = "#fb7185";
    visorColor = "#fff7ed";
  }

  ctx.save();
  ctx.translate(player.x, player.y - 18);
  ctx.rotate(player.angle);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = bodyColor;
  ctx.fillRect(-14, -28, 28, 36);
  ctx.fillStyle = helmetColor;
  ctx.fillRect(-12, -42, 24, 16);
  ctx.fillStyle = visorColor;
  ctx.fillRect(player.facing >= 0 ? 6 : -12, -22, 10, 6);
  ctx.restore();
}

function drawTravelingHook(ctx, frame) {
  const grapple = frame.player.grapple;
  if (!grapple.traveling) {
    return;
  }

  ctx.save();
  ctx.strokeStyle = colorToRgba("#a5f3fc", 0.72);
  ctx.lineWidth = 2.4;
  ctx.setLineDash([12, 8]);
  ctx.lineDashOffset = -frame.time * 120;
  ctx.beginPath();
  ctx.moveTo(frame.player.x, frame.player.y - 18);
  ctx.lineTo(grapple.x, grapple.y);
  ctx.stroke();
  ctx.setLineDash([]);

  const hookGlow = ctx.createRadialGradient(grapple.x, grapple.y, 0, grapple.x, grapple.y, 18);
  hookGlow.addColorStop(0, "rgba(255,255,255,0.95)");
  hookGlow.addColorStop(0.4, "rgba(103,232,249,0.7)");
  hookGlow.addColorStop(1, "rgba(103,232,249,0)");
  ctx.fillStyle = hookGlow;
  ctx.beginPath();
  ctx.arc(grapple.x, grapple.y, 18, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#e0f2fe";
  ctx.beginPath();
  ctx.arc(grapple.x, grapple.y, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawGoal(ctx, goal) {
  const progress = goal.progress ?? 0;
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(goal.x, goal.y, goal.w, goal.h);
  ctx.fillStyle = `rgba(110, 231, 242, ${0.12 + progress * 0.2})`;
  ctx.fillRect(goal.x + 6, goal.y + 6, goal.w - 12, (goal.h - 12) * progress);
  ctx.fillStyle = "#22c55e";
  ctx.fillRect(goal.x + goal.w - 16, goal.y - 80, 12, 140);
  ctx.beginPath();
  ctx.moveTo(goal.x + goal.w - 4, goal.y - 78);
  ctx.lineTo(goal.x + goal.w + 54, goal.y - 58);
  ctx.lineTo(goal.x + goal.w - 4, goal.y - 38);
  ctx.closePath();
  ctx.fill();
  if (!goal.ready) {
    ctx.strokeStyle = "rgba(251, 191, 36, 0.78)";
    ctx.lineWidth = 3;
    ctx.strokeRect(goal.x - 4, goal.y - 4, goal.w + 8, goal.h + 8);
  }
}

function drawEffects(ctx, effects, layer) {
  for (const effect of effects) {
    if ((effect.layer ?? "over") !== layer) {
      continue;
    }

    ctx.save();
    ctx.translate(effect.x, effect.y);
    ctx.globalAlpha = effect.alpha ?? 1;

    if (effect.kind === "warning") {
      const len = Math.max(effect.radius * 2.4, Math.hypot(effect.vx ?? 0, effect.vy ?? 0) * 0.018);
      const angle = Math.atan2(effect.vy ?? 0, effect.vx ?? 0);
      ctx.rotate(angle);
      ctx.strokeStyle = effect.color;
      ctx.lineWidth = Math.max(1, effect.radius * 0.45);
      ctx.beginPath();
      ctx.moveTo(-len * 0.55, 0);
      ctx.lineTo(len * 0.55, 0);
      ctx.stroke();
      ctx.fillStyle = effect.color;
      ctx.beginPath();
      ctx.arc(0, 0, effect.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      continue;
    }

    if (effect.kind === "trail") {
      const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, effect.radius * 3.8);
      glow.addColorStop(0, colorToRgba(effect.color, 0.26));
      glow.addColorStop(1, colorToRgba(effect.color, 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, effect.radius * 3.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = effect.color;
      ctx.beginPath();
      ctx.arc(0, 0, effect.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      continue;
    }

    if (effect.kind === "ring") {
      ctx.strokeStyle = colorToRgba(effect.color, 0.22);
      ctx.lineWidth = Math.max(2, effect.radius * 0.34);
      ctx.beginPath();
      ctx.arc(0, 0, effect.radius * 1.1, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = effect.color;
      ctx.lineWidth = Math.max(1, effect.radius * 0.16);
      ctx.beginPath();
      ctx.arc(0, 0, effect.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      continue;
    }

    if (effect.kind === "spark") {
      const len = Math.max(effect.radius * 2.8, Math.hypot(effect.vx ?? 0, effect.vy ?? 0) * 0.024);
      const angle = Math.atan2(effect.vy ?? 0, effect.vx ?? 0);
      ctx.rotate(angle);
      const sparkGlow = ctx.createLinearGradient(-len * 0.3, 0, len, 0);
      sparkGlow.addColorStop(0, colorToRgba(effect.color, 0));
      sparkGlow.addColorStop(0.45, colorToRgba(effect.color, 0.18));
      sparkGlow.addColorStop(1, colorToRgba(effect.color, 0));
      ctx.strokeStyle = sparkGlow;
      ctx.lineWidth = Math.max(2.8, effect.radius * 1.2);
      ctx.beginPath();
      ctx.moveTo(-len * 0.4, 0);
      ctx.lineTo(len * 0.8, 0);
      ctx.stroke();
      ctx.strokeStyle = effect.color;
      ctx.lineWidth = Math.max(1.2, effect.radius * 0.5);
      ctx.beginPath();
      ctx.moveTo(-len * 0.4, 0);
      ctx.lineTo(len * 0.75, 0);
      ctx.stroke();
      ctx.restore();
      continue;
    }

    ctx.fillStyle = effect.color;
    ctx.beginPath();
    ctx.arc(0, 0, effect.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawParallax(ctx, frame, ratio, color, peak, base) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, frame.height);

  const span = 320;
  for (let i = -1; i <= Math.ceil(frame.width / span) + 2; i += 1) {
    const x = i * span;
    const worldX = x + frame.cameraX * ratio;
    const y = base - Math.sin(worldX / 280) * peak * 0.35 - Math.cos(worldX / 170) * peak * 0.18;
    ctx.lineTo(x, y);
  }

  ctx.lineTo(frame.width, frame.height);
  ctx.closePath();
  ctx.fill();
}

function drawGuideBeam(ctx, frame) {
  const guide = frame.batteryGuide;
  if (!guide) {
    return;
  }

  const screenX = guide.x - frame.cameraX;
  if (screenX < -60 || screenX > frame.width + 60) {
    return;
  }

  const pulse = 0.55 + 0.45 * Math.sin((frame.time ?? 0) * 4.2);
  const beam = ctx.createLinearGradient(screenX, guide.y - 180, screenX, guide.y + 22);
  beam.addColorStop(0, `rgba(250, 204, 21, ${0})`);
  beam.addColorStop(0.4, `rgba(250, 204, 21, ${0.08 + pulse * 0.08})`);
  beam.addColorStop(1, `rgba(34, 211, 238, ${0.02 + pulse * 0.04})`);
  ctx.fillStyle = beam;
  ctx.fillRect(screenX - 26, guide.y - 180, 52, 202);

  ctx.strokeStyle = `rgba(254, 240, 138, ${0.42 + pulse * 0.32})`;
  ctx.lineWidth = 2 + pulse * 3;
  ctx.beginPath();
  ctx.arc(screenX, guide.y, 22 + pulse * 12, 0, Math.PI * 2);
  ctx.stroke();

  const pillWidth = 104;
  const pillX = screenX - pillWidth * 0.5;
  const pillY = guide.y - 224;
  ctx.fillStyle = colorToRgba("#020617", 0.76);
  ctx.fillRect(pillX, pillY, pillWidth, 26);
  ctx.strokeStyle = colorToRgba("#fde68a", 0.7);
  ctx.lineWidth = 2;
  ctx.strokeRect(pillX, pillY, pillWidth, 26);
  ctx.fillStyle = "#fef3c7";
  ctx.font = "700 13px monospace";
  ctx.textAlign = "center";
  ctx.fillText("NEXT CELL", screenX, pillY + 17);
}

function drawAnchorTarget(ctx, frame) {
  const target = frame.targetAnchor;
  if (!target) {
    return;
  }

  const pulse = 0.55 + 0.45 * Math.sin((frame.time ?? 0) * 9.4);
  const playerX = frame.player.x;
  const playerY = frame.player.y - 18;

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.strokeStyle = colorToRgba("#a5f3fc", 0.18 + pulse * 0.18);
  ctx.lineWidth = 2 + pulse * 1.2;
  ctx.setLineDash([14, 10]);
  ctx.beginPath();
  ctx.moveTo(playerX, playerY);
  ctx.lineTo(target.x, target.y);
  ctx.stroke();
  ctx.setLineDash([]);

  const glow = ctx.createRadialGradient(target.x, target.y, 0, target.x, target.y, 34 + pulse * 12);
  glow.addColorStop(0, colorToRgba("#e0f2fe", 0.36 + pulse * 0.16));
  glow.addColorStop(0.55, colorToRgba("#67e8f9", 0.18 + pulse * 0.1));
  glow.addColorStop(1, "rgba(103, 232, 249, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(target.x, target.y, 34 + pulse * 12, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = colorToRgba("#f8fafc", 0.72 + pulse * 0.18);
  ctx.lineWidth = 2 + pulse * 1.6;
  ctx.beginPath();
  ctx.arc(target.x, target.y, 18 + pulse * 8, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawGuideArrow(ctx, frame) {
  const guide = frame.batteryGuide;
  if (!guide || frame.batteriesRemaining <= 0) {
    return;
  }

  const screenX = guide.x - frame.cameraX;
  if (screenX >= 36 && screenX <= frame.width - 36) {
    return;
  }

  const side = screenX < 0 ? 1 : -1;
  const x = side > 0 ? 28 : frame.width - 28;
  const y = Math.max(124, Math.min(frame.height - 96, guide.y));
  const pulse = 0.55 + 0.45 * Math.sin((frame.time ?? 0) * 5.8);

  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = `rgba(250, 204, 21, ${0.38 + pulse * 0.34})`;
  ctx.beginPath();
  ctx.moveTo(side * 18, 0);
  ctx.lineTo(-side * 12, -15);
  ctx.lineTo(-side * 12, 15);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(254, 240, 138, 0.9)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = "#fef3c7";
  ctx.font = "600 14px monospace";
  ctx.textAlign = side > 0 ? "left" : "right";
  ctx.fillText(`${frame.batteriesRemaining} left`, side > 0 ? 46 : frame.width - 46, y + 5);
}

function drawFlowTrails(ctx, frame) {
  const flowStrength = frame.flow?.strength ?? 0;
  if (flowStrength <= 0.05) {
    return;
  }

  const speed = frame.playerSpeed ?? Math.hypot(frame.player.vx, frame.player.vy);
  const length = 46 + flowStrength * 120 + Math.min(90, speed * 0.07);
  const direction = Math.abs(frame.player.vx) > 24 ? Math.sign(frame.player.vx) : frame.player.facing || 1;
  const pulse = 0.55 + 0.45 * Math.sin((frame.time ?? 0) * 16);
  const centerX = frame.player.x;
  const centerY = frame.player.y - 18;
  const offsets = [-18, -8, 2, 12];

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (let index = 0; index < offsets.length; index += 1) {
    const ratio = index / Math.max(1, offsets.length - 1);
    const startX = centerX - direction * (12 + ratio * 8);
    const startY = centerY + offsets[index];
    const endX = startX - direction * (length * (0.7 + ratio * 0.32));
    const endY = startY + offsets[index] * 0.18;
    const trail = ctx.createLinearGradient(startX, startY, endX, endY);
    trail.addColorStop(0, colorToRgba("#f8fafc", 0.52 + flowStrength * 0.24));
    trail.addColorStop(0.45, colorToRgba("#67e8f9", 0.28 + flowStrength * 0.34 * pulse));
    trail.addColorStop(1, "rgba(103, 232, 249, 0)");
    ctx.strokeStyle = trail;
    ctx.lineWidth = 2 + flowStrength * (2.2 - ratio);
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
  }

  ctx.restore();
}

function drawThreatIndicators(ctx, frame) {
  const threat = frame.threat;
  if (!threat) {
    return;
  }

  const pulse = 0.55 + 0.45 * Math.sin((frame.time ?? 0) * 10.5);
  const color = threat.kind === "bullet" ? "#fb7185" : "#f59e0b";
  const glow = threat.kind === "bullet" ? "#ffe4e6" : "#fef3c7";
  const side = threat.direction === "right" ? 1 : -1;

  if (threat.onScreen) {
    ctx.save();
    ctx.translate(threat.screenX, threat.screenY);
    ctx.strokeStyle = colorToRgba(color, 0.52 + pulse * 0.18);
    ctx.lineWidth = 2 + pulse * 2.4;
    ctx.beginPath();
    ctx.arc(0, 0, 18 + threat.intensity * 26 + pulse * 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = colorToRgba(glow, 0.84);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-24, 0);
    ctx.lineTo(-10, 0);
    ctx.moveTo(24, 0);
    ctx.lineTo(10, 0);
    ctx.moveTo(0, -24);
    ctx.lineTo(0, -10);
    ctx.moveTo(0, 24);
    ctx.lineTo(0, 10);
    ctx.stroke();
    ctx.fillStyle = colorToRgba("#020617", 0.78);
    ctx.fillRect(-54, -44, 108, 20);
    ctx.strokeStyle = colorToRgba(color, 0.7);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-54, -44, 108, 20);
    ctx.fillStyle = glow;
    ctx.font = "700 11px monospace";
    ctx.textAlign = "center";
    ctx.fillText(threat.kind === "bullet" ? "SHOT" : "LOCK", 0, -30);
    ctx.restore();
  }

  if (!threat.onScreen || threat.urgent) {
    const x = side > 0 ? frame.width - 42 : 42;
    const y = Math.max(108, Math.min(frame.height - 132, threat.screenY ?? frame.height * 0.42));
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = colorToRgba(color, 0.4 + pulse * 0.26);
    ctx.beginPath();
    ctx.moveTo(side * 20, 0);
    ctx.lineTo(-side * 12, -16);
    ctx.lineTo(-side * 12, 16);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = glow;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  if (threat.urgent) {
    const label = `${threat.label.toUpperCase()} ${threat.direction.toUpperCase()}`;
    const width = Math.min(frame.width - 180, 320 + label.length * 2.8);
    const x = (frame.width - width) * 0.5;
    const y = 68;
    ctx.fillStyle = colorToRgba("#020617", 0.74);
    ctx.fillRect(x, y, width, 32);
    ctx.strokeStyle = colorToRgba(color, 0.9);
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, width, 32);
    ctx.fillStyle = glow;
    ctx.font = "700 16px monospace";
    ctx.textAlign = "center";
    ctx.fillText(label, frame.width * 0.5, y + 21);
  }
}

function drawScreenFx(ctx, frame) {
  const vignette = ctx.createRadialGradient(
    frame.width * 0.5,
    frame.height * 0.42,
    frame.height * 0.14,
    frame.width * 0.5,
    frame.height * 0.5,
    frame.height * 0.78,
  );
  vignette.addColorStop(0, "rgba(3, 7, 18, 0)");
  vignette.addColorStop(1, "rgba(3, 7, 18, 0.38)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, frame.width, frame.height);

  const speedGlow = Math.min(0.18, Math.hypot(frame.player.vx, frame.player.vy) / 4200);
  if (speedGlow > 0.01) {
    const speedWash = ctx.createLinearGradient(0, 0, frame.width, 0);
    speedWash.addColorStop(0, `rgba(14, 165, 233, ${speedGlow * 0.18})`);
    speedWash.addColorStop(0.5, `rgba(103, 232, 249, ${speedGlow * 0.36})`);
    speedWash.addColorStop(1, `rgba(14, 165, 233, ${speedGlow * 0.18})`);
    ctx.fillStyle = speedWash;
    ctx.fillRect(0, 0, frame.width, frame.height);
  }

  const flowStrength = frame.flow?.strength ?? 0;
  if (flowStrength > 0.05) {
    const flowWash = ctx.createLinearGradient(0, frame.height * 0.2, frame.width, frame.height * 0.8);
    flowWash.addColorStop(0, colorToRgba("#67e8f9", flowStrength * 0.08));
    flowWash.addColorStop(0.55, colorToRgba("#e0f2fe", flowStrength * 0.04));
    flowWash.addColorStop(1, colorToRgba("#0ea5e9", flowStrength * 0.1));
    ctx.fillStyle = flowWash;
    ctx.fillRect(0, 0, frame.width, frame.height);
  }

  const stageGlow = Math.max(0, ((frame.stageIndex ?? 1) - 2) * 0.022);
  if (stageGlow > 0) {
    const grade = ctx.createLinearGradient(0, 0, frame.width, frame.height);
    grade.addColorStop(0, `rgba(34, 211, 238, ${stageGlow * 0.34})`);
    grade.addColorStop(0.45, `rgba(14, 165, 233, ${stageGlow * 0.16})`);
    grade.addColorStop(0.78, `rgba(251, 191, 36, ${stageGlow * 0.08})`);
    grade.addColorStop(1, `rgba(244, 114, 182, ${stageGlow * 0.24})`);
    ctx.fillStyle = grade;
    ctx.fillRect(0, 0, frame.width, frame.height);
  }

  if ((frame.dangerLevel ?? 0) > 0.45) {
    const pulse = 0.38 + 0.62 * Math.sin((frame.time ?? 0) * 7.8) ** 2;
    const danger = ctx.createRadialGradient(
      frame.width * 0.5,
      frame.height * 0.5,
      frame.height * 0.18,
      frame.width * 0.5,
      frame.height * 0.5,
      frame.height * 0.72,
    );
    danger.addColorStop(0, "rgba(127, 29, 29, 0)");
    danger.addColorStop(1, `rgba(239, 68, 68, ${((frame.dangerLevel ?? 0) - 0.45) * 0.28 * pulse})`);
    ctx.fillStyle = danger;
    ctx.fillRect(0, 0, frame.width, frame.height);
  }

  if (frame.threat?.urgent) {
    const directionBias = frame.threat.direction === "right" ? 1 : 0;
    const alert = ctx.createLinearGradient(
      directionBias ? frame.width : 0,
      0,
      directionBias ? frame.width * 0.18 : frame.width * 0.82,
      0,
    );
    alert.addColorStop(0, colorToRgba(frame.threat.kind === "bullet" ? "#fb7185" : "#f59e0b", 0.18));
    alert.addColorStop(1, "rgba(2, 6, 23, 0)");
    ctx.fillStyle = alert;
    ctx.fillRect(0, 0, frame.width, frame.height);
  }

  if ((frame.health ?? 0) <= 2 && frame.mode === "playing") {
    const pulse = 0.46 + 0.54 * Math.sin((frame.time ?? 0) * 8.8) ** 2;
    ctx.strokeStyle = `rgba(248, 113, 113, ${0.2 + pulse * 0.26})`;
    ctx.lineWidth = 12;
    ctx.strokeRect(6, 6, frame.width - 12, frame.height - 12);
  }

  ctx.fillStyle = "rgba(255, 255, 255, 0.03)";
  for (let y = 0; y < frame.height; y += 5) {
    ctx.fillRect(0, y, frame.width, 1);
  }

  if (frame.screenFlash) {
    ctx.fillStyle = colorToRgba(frame.screenFlash.color, frame.screenFlash.strength * 0.32);
    ctx.fillRect(0, 0, frame.width, frame.height);
  }
}

function getShakeOffset(frame) {
  const trauma = frame.cameraTrauma ?? 0;
  if (trauma <= 0.001) {
    return { x: 0, y: 0 };
  }

  const magnitude = trauma * trauma * 14;
  const t = frame.time ?? 0;
  return {
    x: Math.sin(t * 61) * magnitude,
    y: Math.cos(t * 47) * magnitude * 0.72,
  };
}

function colorToRgba(color, alpha) {
  if (!color.startsWith("#")) {
    return color;
  }

  const hex = color.slice(1);
  const size = hex.length === 3 ? 1 : 2;
  const expand = (value) => (size === 1 ? value + value : value);
  const r = Number.parseInt(expand(hex.slice(0, size)), 16);
  const g = Number.parseInt(expand(hex.slice(size, size * 2)), 16);
  const b = Number.parseInt(expand(hex.slice(size * 2, size * 3)), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
