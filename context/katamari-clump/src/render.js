const COLORS = {
  sky: "#9fe3ff",
  street: "#152338",
  glow: "#7cffc4",
  warm: "#ffbf5f",
  danger: "#ff6d7a",
  text: "#eef4ff",
  muted: "#9ab0ce",
};

function drawRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function massToRadius(mass) {
  return 18 + Math.sqrt(mass) * 4.5;
}

function districtTint(index) {
  return ["#132033", "#1b1c35", "#2c1c2d"][index % 3];
}

export function drawFrame(ctx, frame) {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);

  const bg = districtTint(frame.districtIndex);
  const skylineGlow = frame.mode === "win" ? "rgba(124, 255, 196, 0.22)" : "rgba(159, 227, 255, 0.14)";
  const cam = frame.cameraExtents ?? { x: 0, y: 0, width, height };
  const scaleX = width / Math.max(1, cam.width);
  const scaleY = height / Math.max(1, cam.height);
  const toScreenX = (x) => (x - cam.x) * scaleX;
  const toScreenY = (y) => (y - cam.y) * scaleY;

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, skylineGlow);
  grad.addColorStop(1, "rgba(0, 0, 0, 0.36)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  for (const band of frame.districtBands ?? []) {
    ctx.fillStyle = band.fill;
    ctx.fillRect(toScreenX(band.x), toScreenY(band.y), band.w * scaleX, band.h * scaleY);
  }

  for (const prop of Object.values(frame.objects ?? {}).flat()) {
    ctx.save();
    ctx.translate(toScreenX(prop.x), toScreenY(prop.y));
    const size = Math.max(8, prop.radius * 2) * Math.min(scaleX, scaleY);
    ctx.fillStyle = prop.absorbable ? "rgba(124, 255, 196, 0.88)" : "rgba(255, 109, 122, 0.9)";
    ctx.strokeStyle = prop.absorbable ? "rgba(0, 0, 0, 0.2)" : "rgba(255, 255, 255, 0.25)";
    ctx.lineWidth = 2;
    drawRoundRect(ctx, -size / 2, -size / 2, size, size, size * 0.24);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  for (const hazard of frame.hazards ?? []) {
    ctx.save();
    ctx.translate(toScreenX(hazard.x), toScreenY(hazard.y));
    ctx.strokeStyle = "rgba(255, 109, 122, 0.75)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, hazard.radius * Math.min(scaleX, scaleY), 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "rgba(255, 109, 122, 0.18)";
    ctx.fill();
    ctx.restore();
  }

  for (const gate of frame.gates ?? []) {
    ctx.save();
    ctx.translate(toScreenX(gate.x), toScreenY(gate.y));
    ctx.fillStyle = gate.open ? "rgba(124, 255, 196, 0.16)" : "rgba(255, 191, 95, 0.16)";
    ctx.strokeStyle = gate.open ? "rgba(124, 255, 196, 0.9)" : "rgba(255, 191, 95, 0.9)";
    ctx.lineWidth = 3;
    drawRoundRect(ctx, -gate.width / 2, -gate.height / 2, gate.width, gate.height, 10);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  for (const item of frame.attachedItems ?? []) {
    ctx.save();
    ctx.translate(toScreenX(item.x), toScreenY(item.y));
    const size = item.radius * 2 * Math.min(scaleX, scaleY);
    ctx.fillStyle = "rgba(124, 255, 196, 0.58)";
    drawRoundRect(ctx, -size / 2, -size / 2, size, size, 8);
    ctx.fill();
    ctx.restore();
  }

  const playerRadius = frame.player?.radius ?? massToRadius(frame.player?.mass ?? 1);
  const playerScale = Math.min(scaleX, scaleY);
  ctx.save();
  ctx.translate(toScreenX(frame.player.x), toScreenY(frame.player.y));
  ctx.fillStyle = "rgba(255, 255, 255, 0.94)";
  ctx.beginPath();
  ctx.arc(0, 0, playerRadius * playerScale, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(124, 255, 196, 0.3)";
  ctx.beginPath();
  ctx.arc(0, 0, Math.max(8, playerRadius * 0.55) * playerScale, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(frame.player.heading || frame.player.rotation || frame.player.angle || 0);
  const arrowLength = Math.max(18, playerRadius * 0.9) * playerScale;
  const arrowWidth = Math.max(12, playerRadius * 0.44) * playerScale;
  ctx.fillStyle = COLORS.street;
  ctx.beginPath();
  ctx.moveTo(arrowLength, 0);
  ctx.lineTo(-arrowWidth * 0.55, -arrowWidth * 0.62);
  ctx.lineTo(-arrowWidth * 0.2, 0);
  ctx.lineTo(-arrowWidth * 0.55, arrowWidth * 0.62);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.62)";
  ctx.lineWidth = Math.max(2, 3 * playerScale);
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = COLORS.text;
  ctx.font = "600 18px Trebuchet MS, sans-serif";
  ctx.fillText("Katamari Clump Rollup", 20, 32);

  if (frame.hud?.message) {
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(frame.hud.message, 20, 56);
  }

  if (frame.mode !== "playing") {
    ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
    ctx.fillRect(0, 0, width, height);
  }
}
