export function renderScene(ctx, frameState, viewport) {
  const w = viewport.width;
  const h = viewport.height;
  const cameraX = frameState.distance;
  ctx.clearRect(0, 0, w, h);

  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#83c8ff");
  sky.addColorStop(0.55, "#d9f0ff");
  sky.addColorStop(1, "#f8e8b2");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = "rgba(255,255,255,0.18)";
  for (let i = 0; i < 6; i += 1) ctx.fillRect((i * 180 + cameraX * 0.4) % w, 40 + i * 18, 96, 2);

  const terrainY = h * 0.78 + Math.sin(cameraX * 0.005) * 10;
  ctx.fillStyle = "#4b6a3d";
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(0, terrainY);
  for (let x = 0; x <= w; x += 32) {
    ctx.lineTo(x, terrainY + Math.sin((x + cameraX) * 0.01) * 14);
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();

  frameState.thermals.forEach((thermal) => {
    const screenX = w * 0.42 + (thermal.x - cameraX);
    if (screenX < -40 || screenX > w + 40) return;
    ctx.strokeStyle = `rgba(255, 154, 73, ${0.12 + thermal.strength * 0.02})`;
    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.moveTo(screenX, terrainY);
    ctx.lineTo(screenX, terrainY - Math.max(90, thermal.radius * 2.1));
    ctx.stroke();
  });

  const flyerX = w * 0.42;
  const flyerY = h * 0.74 - frameState.hud.altitude * 1.6;
  ctx.save();
  ctx.translate(flyerX, flyerY);
  ctx.rotate(frameState.pose.bank * 0.45 + frameState.pose.pitch * 0.35);
  ctx.fillStyle = "#2a2432";
  ctx.beginPath();
  ctx.moveTo(-22, 0);
  ctx.lineTo(18, -8);
  ctx.lineTo(28, 0);
  ctx.lineTo(18, 8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  frameState.hazards.forEach((hazard) => {
    const screenX = w * 0.42 + (hazard.x - cameraX);
    const screenY = h * 0.74 - hazard.y * 1.2;
    if (screenX < -40 || screenX > w + 40 || screenY < -40 || screenY > h + 40) return;
    ctx.fillStyle = hazard.kind === "updraft-shear" ? "rgba(150, 60, 255, 0.3)" : "rgba(255, 80, 80, 0.28)";
    ctx.beginPath();
    ctx.arc(screenX, screenY, hazard.radius, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fillText(`Target ${Math.round(frameState.targetDistance)}m`, 24, h - 28);
  ctx.fillText(`Phase ${frameState.phase}`, 24, 36);
}
