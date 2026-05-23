function getScale(layout, frameState) {
  const world = frameState.world ?? {};
  const width = layout.width || 1;
  const height = layout.height || 1;
  const worldWidth = world.width ?? 1600;
  const worldHeight = world.height ?? 900;
  return Math.min(width / worldWidth, height / worldHeight);
}

export function renderRunner(ctx, frameState = {}, layout = {}) {
  const scale = getScale(layout, frameState);
  const width = layout.width || ctx.canvas.width;
  const height = layout.height || ctx.canvas.height;
  const status = frameState.phase ?? frameState.mode ?? "menu";
  const world = frameState.world ?? {};
  const runner = frameState.runner ?? frameState.pose ?? {};
  const bodies = runner.bodies ?? {};
  const joints = runner.joints ?? [];
  const groundY = (world.groundY ?? 760) * scale;
  const cameraX = (world.cameraX ?? 0) * scale;
  const finishX = world.finishX != null ? world.finishX * scale - cameraX : null;
  const distance = Math.max(0, Math.round(frameState.distance ?? frameState.hud?.distance ?? 0));
  const bestDistance = Math.max(0, Math.round(frameState.bestDistance ?? frameState.hud?.bestDistance ?? 0));

  ctx.save();
  ctx.clearRect(0, 0, width, height);
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#182433");
  sky.addColorStop(0.62, "#0f1520");
  sky.addColorStop(1, "#080b11");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);
  for (let i = 0; i < 8; i += 1) {
    ctx.fillStyle = `rgba(255,255,255,${0.024 - i * 0.002})`;
    ctx.fillRect(0, (height / 8) * i, width, 1);
  }

  const ground = ctx.createLinearGradient(0, groundY - 40, 0, height);
  ground.addColorStop(0, "#c39758");
  ground.addColorStop(1, "#5d4527");
  ctx.fillStyle = ground;
  ctx.fillRect(0, groundY, width, Math.max(5, 6 * scale));

  ctx.fillStyle = "rgba(255, 191, 105, 0.12)";
  ctx.fillRect(0, groundY - 10 * scale, width, 10 * scale);

  if (finishX != null) {
    ctx.strokeStyle = "#8de4c2";
    ctx.lineWidth = Math.max(2, 3 * scale);
    ctx.beginPath();
    ctx.moveTo(finishX, groundY - 180 * scale);
    ctx.lineTo(finishX, groundY + 10 * scale);
    ctx.stroke();
  }

  for (const obstacle of world.obstacles ?? []) {
    const x = (obstacle.x ?? 0) * scale - cameraX;
    const h = (obstacle.h ?? 80) * scale;
    const w = (obstacle.w ?? 24) * scale;
    ctx.fillStyle = obstacle.hit ? "#ff7286" : obstacle.cleared ? "#8de4c2" : "#ffbf69";
    ctx.fillRect(x - w * 0.5, groundY - h, w, h);
  }

  const bumps = world.terrain?.bumps ?? [];
  if (bumps.length) {
    ctx.fillStyle = "rgba(255, 191, 105, 0.28)";
    for (const bump of bumps) {
      const bumpLeft = (bump.x - bump.width) * scale - cameraX;
      const bumpWidth = bump.width * 2 * scale;
      const bumpHeight = bump.height * scale;
      ctx.beginPath();
      ctx.moveTo(bumpLeft, groundY);
      ctx.quadraticCurveTo(bumpLeft + bumpWidth * 0.5, groundY - bumpHeight, bumpLeft + bumpWidth, groundY);
      ctx.closePath();
      ctx.fill();
    }
  }

  ctx.strokeStyle = status === "fallen" ? "#ff7286" : "#f5efe6";
  ctx.lineWidth = Math.max(2, 7 * scale);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const joint of joints) {
    const a = bodies[joint.a];
    const b = bodies[joint.b];
    if (!a || !b) continue;
    ctx.beginPath();
    ctx.moveTo(a.x * scale - cameraX, a.y * scale);
    ctx.lineTo(b.x * scale - cameraX, b.y * scale);
    ctx.stroke();
  }

  for (const [name, body] of Object.entries(bodies)) {
    const isCore = name === "torso" || name === "pelvis";
    ctx.fillStyle = isCore ? "#8de4c2" : "#f5efe6";
    ctx.beginPath();
    ctx.arc(body.x * scale - cameraX, body.y * scale, (isCore ? 16 : 10) * scale, 0, Math.PI * 2);
    ctx.fill();
  }

  const hudX = 24;
  const hudY = 24;
  const barWidth = Math.min(width * 0.36, 280);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(hudX, hudY, barWidth, 34 * scale);
  ctx.fillStyle = "#f5efe6";
  ctx.font = `${Math.max(12, 14 * scale)}px "Trebuchet MS", sans-serif`;
  ctx.fillText(`DIST ${distance}`, hudX + 12, hudY + 22 * scale);
  ctx.textAlign = "right";
  ctx.fillText(`BEST ${bestDistance}`, hudX + barWidth - 12, hudY + 22 * scale);
  ctx.textAlign = "start";

  ctx.restore();
}
