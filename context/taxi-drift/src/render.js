function formatTime(seconds) {
  return `${seconds.toFixed(1)}s`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatSpeed(speed) {
  return `${Math.round(speed)}`;
}

function drawRoadGrid(ctx, city) {
  ctx.fillStyle = "#0b0f16";
  ctx.fillRect(0, 0, city.width, city.height);

  for (let y = 0; y < city.height; y += city.blockSize) {
    for (let x = 0; x < city.width; x += city.blockSize) {
      ctx.fillStyle = ((x + y) / city.blockSize) % 2 === 0 ? "#161d28" : "#121822";
      ctx.fillRect(x + city.roadWidth, y + city.roadWidth, city.blockSize - city.roadWidth, city.blockSize - city.roadWidth);
    }
  }

  ctx.fillStyle = "#2a3345";
  for (let x = 0; x <= city.width; x += city.blockSize) {
    ctx.fillRect(x, 0, city.roadWidth, city.height);
  }
  for (let y = 0; y <= city.height; y += city.blockSize) {
    ctx.fillRect(0, y, city.width, city.roadWidth);
  }

  ctx.strokeStyle = "rgba(255, 214, 102, 0.24)";
  ctx.lineWidth = 6;
  ctx.setLineDash([24, 28]);
  for (let x = city.roadWidth / 2; x < city.width; x += city.blockSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, city.height);
    ctx.stroke();
  }
  for (let y = city.roadWidth / 2; y < city.height; y += city.blockSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(city.width, y);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

function drawStand(ctx, stand, label, ringRadius, options = {}) {
  const {
    previewRadius = ringRadius,
    active = true,
    ready = false,
    tooFast = false,
  } = options;
  const alpha = active ? 1 : 0.28;
  ctx.save();
  ctx.strokeStyle = active ? stand.color : "rgba(255,255,255,0.28)";
  ctx.fillStyle = active ? `${stand.color}22` : "rgba(255,255,255,0.05)";
  ctx.lineWidth = ready ? 8 : 6;
  ctx.beginPath();
  ctx.arc(stand.x, stand.y, ringRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  if (previewRadius > ringRadius) {
    ctx.strokeStyle = tooFast ? "rgba(255, 124, 107, 0.9)" : `rgba(255,255,255,${active ? 0.4 : 0.14})`;
    ctx.lineWidth = 3;
    ctx.setLineDash([14, 14]);
    ctx.beginPath();
    ctx.arc(stand.x, stand.y, previewRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.globalAlpha = alpha;
  ctx.fillStyle = stand.color;
  ctx.beginPath();
  ctx.arc(stand.x, stand.y, 18, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#f6f8ff";
  ctx.font = "700 22px Arial";
  ctx.textAlign = "center";
  ctx.fillText(label, stand.x, stand.y - ringRadius - 18);

  if (active) {
    ctx.font = "600 16px Arial";
    if (ready) {
      ctx.fillStyle = "#8affc1";
      ctx.fillText("READY", stand.x, stand.y + ringRadius + 30);
    } else if (tooFast) {
      ctx.fillStyle = "#ff9e6d";
      ctx.fillText("TOO FAST", stand.x, stand.y + ringRadius + 30);
    }
  }
  ctx.restore();
}

function drawTraffic(ctx, traffic) {
  for (const car of traffic) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.fillStyle = car.color;
    ctx.fillRect(-car.width / 2, -car.height / 2, car.width, car.height);
    ctx.fillStyle = "#10131a";
    ctx.fillRect(-car.width * 0.18, -car.height * 0.4, car.width * 0.36, car.height * 0.8);
    ctx.restore();
  }
}

function drawSkids(ctx, skidMarks) {
  for (const mark of skidMarks) {
    ctx.fillStyle = `rgba(12, 14, 20, ${0.35 * mark.life})`;
    ctx.fillRect(mark.x - 18, mark.y - 6, 36, 12);
  }
}

function drawTaxi(ctx, player) {
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(player.angle);

  if (player.flash > 0) {
    ctx.shadowColor = "rgba(255, 104, 104, 0.8)";
    ctx.shadowBlur = 26;
  }

  ctx.fillStyle = "#ffd743";
  ctx.fillRect(-30, -18, 60, 36);
  ctx.fillStyle = "#11161f";
  ctx.fillRect(-10, -14, 24, 28);
  ctx.fillStyle = "#ff914d";
  ctx.fillRect(12, -18, 18, 36);
  ctx.fillStyle = "#f7f8ff";
  ctx.fillRect(18, -8, 8, 16);
  ctx.restore();
}

function drawDamageFx(ctx, player) {
  if (player.health >= 50) {
    return;
  }

  const smokeStrength = clamp((50 - player.health) / 50, 0.12, 1);
  const fireStrength = player.health < 25 ? clamp((25 - player.health) / 25, 0.2, 1) : 0;
  const pulse = 0.7 + Math.sin(player.health * 0.45) * 0.12;

  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(player.angle);

  for (let i = 0; i < 3; i += 1) {
    const offsetX = -28 - i * 10;
    const offsetY = -8 - i * 6;
    const radius = 12 + i * 6 * smokeStrength;
    ctx.fillStyle = `rgba(36, 41, 52, ${0.18 + smokeStrength * (0.16 - i * 0.02)})`;
    ctx.beginPath();
    ctx.arc(offsetX, offsetY, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  if (fireStrength > 0) {
    ctx.fillStyle = `rgba(255, 196, 82, ${0.42 * fireStrength * pulse})`;
    ctx.beginPath();
    ctx.moveTo(-22, -4);
    ctx.quadraticCurveTo(-38, -22, -28, -34);
    ctx.quadraticCurveTo(-14, -24, -10, -8);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = `rgba(255, 104, 71, ${0.55 * fireStrength})`;
    ctx.beginPath();
    ctx.moveTo(-20, -4);
    ctx.quadraticCurveTo(-30, -18, -24, -25);
    ctx.quadraticCurveTo(-14, -18, -12, -6);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

function drawDestinationBeam(ctx, stand) {
  ctx.save();
  const gradient = ctx.createLinearGradient(stand.x, stand.y - 220, stand.x, stand.y + 24);
  gradient.addColorStop(0, "rgba(255,255,255,0)");
  gradient.addColorStop(1, `${stand.color}55`);
  ctx.fillStyle = gradient;
  ctx.fillRect(stand.x - 18, stand.y - 220, 36, 244);
  ctx.restore();
}

function drawApproachGuide(ctx, stand, approach, speedLimit) {
  if (!approach || !approach.insidePreview) return;
  ctx.save();
  ctx.fillStyle = "rgba(8, 11, 17, 0.88)";
  ctx.strokeStyle = approach.speedReady ? "rgba(138, 255, 193, 0.72)" : "rgba(255, 158, 109, 0.8)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(stand.x - 72, stand.y - 154, 144, 54, 12);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#f4f7ff";
  ctx.textAlign = "center";
  ctx.font = "700 16px Arial";
  ctx.fillText(approach.speedReady ? "BRAKE WINDOW OPEN" : "SLOW DOWN", stand.x, stand.y - 128);
  ctx.font = "600 14px Arial";
  ctx.fillText(`speed ${formatSpeed(approach.speed)} / ${speedLimit}`, stand.x, stand.y - 108);
  ctx.restore();
}

function getRouteTarget(frame) {
  if (!frame.activeFare || frame.mode !== "playing") {
    return null;
  }

  const pickedUp = frame.activeFare.pickedUp;
  const stand = pickedUp ? frame.activeFare.dropoff : frame.activeFare.pickup;
  const approach = pickedUp ? frame.activeFare.dropoffApproach : frame.activeFare.pickupApproach;
  return {
    approach,
    label: pickedUp ? "Drop-off" : "Pickup",
    stand,
  };
}

function drawRouteCard(ctx, frame, width, target) {
  const distance = Math.hypot(frame.player.x - target.stand.x, frame.player.y - target.stand.y);
  const blocks = (distance / frame.city.blockSize).toFixed(1);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "rgba(8, 11, 17, 0.84)";
  ctx.strokeStyle = target.approach?.insidePreview
    ? target.approach.speedReady
      ? "rgba(138, 255, 193, 0.82)"
      : "rgba(255, 158, 109, 0.84)"
    : "rgba(127, 224, 255, 0.55)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(width / 2 - 176, 20, 352, 72, 16);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#c7d1e6";
  ctx.font = "600 15px Arial";
  ctx.textAlign = "center";
  ctx.fillText(`${target.label} target`, width / 2, 46);
  ctx.fillStyle = "#f3f6ff";
  ctx.font = "700 24px Arial";
  ctx.fillText(target.stand.label, width / 2, 72);
  ctx.fillStyle = "#9bdcff";
  ctx.font = "600 14px Arial";
  ctx.fillText(`${blocks} blocks away`, width / 2, 92);
  ctx.restore();
}

function drawOffscreenRouteArrow(ctx, frame, width, height, target) {
  const screenX = width / 2 + (target.stand.x - frame.camera.x);
  const screenY = height / 2 + (target.stand.y - frame.camera.y);
  const safeBounds = {
    left: 56,
    right: width - 56,
    top: 112,
    bottom: height - 56,
  };

  const visible =
    screenX >= safeBounds.left &&
    screenX <= safeBounds.right &&
    screenY >= safeBounds.top &&
    screenY <= safeBounds.bottom;
  if (visible) {
    return;
  }

  const dx = screenX - width / 2;
  const dy = screenY - height / 2;
  const halfW = (safeBounds.right - safeBounds.left) / 2;
  const halfH = (safeBounds.bottom - safeBounds.top) / 2;
  const scale = Math.max(Math.abs(dx) / halfW, Math.abs(dy) / halfH, 1);
  const arrowX = clamp(width / 2 + dx / scale, safeBounds.left, safeBounds.right);
  const arrowY = clamp(height / 2 + dy / scale, safeBounds.top, safeBounds.bottom);
  const angle = Math.atan2(dy, dx);
  const color = target.stand.color;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.translate(arrowX, arrowY);
  ctx.rotate(angle);

  ctx.fillStyle = "rgba(8, 11, 17, 0.9)";
  ctx.beginPath();
  ctx.arc(0, 0, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(18, 0);
  ctx.lineTo(-10, -12);
  ctx.lineTo(-10, 12);
  ctx.closePath();
  ctx.fill();

  ctx.rotate(-angle);
  ctx.fillStyle = "#f3f6ff";
  ctx.font = "700 12px Arial";
  ctx.textAlign = "center";
  ctx.fillText(target.label.toUpperCase(), 0, 46);
  ctx.restore();
}

function drawPrompt(ctx, frame) {
  if (!frame.hud.prompt || frame.mode !== "playing") return;
  ctx.save();
  ctx.fillStyle = "rgba(8, 11, 17, 0.84)";
  ctx.strokeStyle = "rgba(133, 220, 255, 0.6)";
  ctx.lineWidth = 2;
  const width = 460;
  const x = 34;
  const y = frame.player.y < 240 ? frame.city.height - 110 : 28;
  ctx.beginPath();
  ctx.roundRect(x, y, width, 64, 14);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#f0f4ff";
  ctx.font = "600 22px Arial";
  ctx.fillText(frame.hud.prompt, x + 18, y + 40, width - 36);
  ctx.restore();
}

function drawHud(ctx, frame, width, height) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "rgba(8, 11, 17, 0.78)";
  ctx.fillRect(22, 20, 420, 112);
  ctx.fillStyle = "#f3f6ff";
  ctx.font = "700 22px Arial";
  ctx.fillText(`Score ${frame.hud.score}`, 40, 52);
  ctx.fillText(`Time ${formatTime(frame.hud.timer)}`, 40, 84);
  ctx.fillText(`Fares ${frame.hud.completedFares}/${frame.hud.targetFares}`, 220, 52);
  ctx.fillText(`Combo x${frame.hud.combo.toFixed(1)}`, 220, 84);

  ctx.fillStyle = "rgba(8, 11, 17, 0.78)";
  ctx.fillRect(width - 278, 20, 256, 112);
  ctx.fillStyle = "#c7d1e6";
  ctx.font = "600 18px Arial";
  ctx.fillText("Cab Integrity", width - 258, 48);
  ctx.fillStyle = "#1d2534";
  ctx.fillRect(width - 258, 62, 216, 22);
  ctx.fillStyle = frame.hud.health > 35 ? "#68f59d" : "#ff6d76";
  ctx.fillRect(width - 258, 62, 216 * clamp(frame.hud.health / 100, 0, 1), 22);
  if (frame.hud.health < 50) {
    ctx.strokeStyle = frame.hud.health < 25 ? "rgba(255, 145, 94, 0.92)" : "rgba(212, 225, 255, 0.72)";
    ctx.lineWidth = frame.hud.health < 25 ? 3 : 2;
    ctx.strokeRect(width - 260, 60, 220, 26);
    ctx.fillStyle = frame.hud.health < 25 ? "#ff915e" : "#d4e1ff";
    ctx.font = "700 14px Arial";
    ctx.fillText(frame.hud.health < 25 ? "FIRE" : "SMOKE", width - 108, 106);
  }
  ctx.fillStyle = "#f3f6ff";
  ctx.font = "700 18px Arial";
  ctx.fillText(`${Math.round(frame.hud.health)}%`, width - 258, 106);
  ctx.restore();
}

function drawOverlay(ctx, overlay, width, height) {
  if (!overlay) return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "rgba(5, 7, 12, 0.7)";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "rgba(13, 17, 26, 0.95)";
  ctx.strokeStyle = "rgba(255, 214, 67, 0.5)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(width / 2 - 280, height / 2 - 150, 560, 300, 24);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#f8fbff";
  ctx.textAlign = "center";
  ctx.font = "700 38px Arial";
  ctx.fillText(overlay.title, width / 2, height / 2 - 68);
  ctx.font = "500 22px Arial";
  ctx.fillText(overlay.copy, width / 2, height / 2 - 16, 470);
  ctx.font = "700 24px Arial";
  ctx.fillStyle = "#ffd743";
  ctx.fillText(overlay.action, width / 2, height / 2 + 54);
  ctx.font = "500 18px Arial";
  ctx.fillStyle = "#c9d4ec";
  ctx.fillText(overlay.hint, width / 2, height / 2 + 96);
  ctx.restore();
}

export function renderFrame(ctx, frame) {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  ctx.clearRect(0, 0, width, height);

  ctx.save();
  ctx.translate(width / 2 - frame.camera.x, height / 2 - frame.camera.y);
  drawRoadGrid(ctx, frame.city);
  drawSkids(ctx, frame.skidMarks);

  if (frame.activeFare) {
    drawStand(ctx, frame.activeFare.pickup, frame.activeFare.pickedUp ? "Pickup clear" : frame.activeFare.pickup.label, 100, {
      previewRadius: 144,
      active: !frame.activeFare.pickedUp,
      ready: !frame.activeFare.pickedUp && frame.activeFare.pickupApproach?.speedReady && frame.activeFare.pickupApproach?.insideInteract,
      tooFast: !frame.activeFare.pickedUp && frame.activeFare.pickupApproach?.insidePreview && !frame.activeFare.pickupApproach?.speedReady,
    });
    drawDestinationBeam(ctx, frame.activeFare.pickedUp ? frame.activeFare.dropoff : frame.activeFare.pickup);
    drawStand(ctx, frame.activeFare.dropoff, frame.activeFare.dropoff.label, 118, {
      previewRadius: 168,
      active: frame.activeFare.pickedUp,
      ready: frame.activeFare.pickedUp && frame.activeFare.dropoffApproach?.speedReady && frame.activeFare.dropoffApproach?.insideInteract,
      tooFast: frame.activeFare.pickedUp && frame.activeFare.dropoffApproach?.insidePreview && !frame.activeFare.dropoffApproach?.speedReady,
    });
    drawApproachGuide(
      ctx,
      frame.activeFare.pickedUp ? frame.activeFare.dropoff : frame.activeFare.pickup,
      frame.activeFare.pickedUp ? frame.activeFare.dropoffApproach : frame.activeFare.pickupApproach,
      frame.activeFare.pickedUp ? 160 : 140,
    );
  }

  drawTraffic(ctx, frame.traffic);
  drawDamageFx(ctx, frame.player);
  drawTaxi(ctx, frame.player);
  drawPrompt(ctx, frame);
  ctx.restore();

  const routeTarget = getRouteTarget(frame);
  if (routeTarget) {
    drawRouteCard(ctx, frame, width, routeTarget);
    drawOffscreenRouteArrow(ctx, frame, width, height, routeTarget);
  }

  drawHud(ctx, frame, width, height);
  drawOverlay(ctx, frame.overlay, width, height);
}
