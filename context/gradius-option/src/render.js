function drawShip(ctx, x, y, scale, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(24 * scale, 0);
  ctx.lineTo(-8 * scale, -16 * scale);
  ctx.lineTo(-18 * scale, 0);
  ctx.lineTo(-8 * scale, 16 * scale);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawBar(ctx, x, y, w, h, ratio, fill, back) {
  ctx.fillStyle = back;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, Math.max(0, Math.min(1, ratio)) * w, h);
}

export function renderGame(ctx, frameState) {
  const width = frameState.view?.width ?? ctx.canvas.width;
  const height = frameState.view?.height ?? ctx.canvas.height;
  ctx.save();
  ctx.clearRect(0, 0, width, height);

  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#020713");
  sky.addColorStop(0.62, "#08192f");
  sky.addColorStop(1, "#02040a");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "rgba(124, 210, 255, 0.08)";
  ctx.fillRect(0, height * 0.5, width, height * 0.5);

  for (const star of frameState.stars ?? []) {
    ctx.fillStyle = star.color ?? "#f5fbff";
    ctx.fillRect(star.x * width, star.y * height, star.size ?? 2, star.size ?? 2);
  }

  for (const wave of frameState.waves ?? []) {
    ctx.fillStyle = wave.kind === "boss" ? "#6f5dff" : wave.kind === "pod" ? "#ffc857" : "#71d0ff";
    ctx.fillRect(wave.x - wave.w / 2, wave.y - wave.h / 2, wave.w, wave.h);
  }

  for (const pickup of frameState.pickups ?? []) {
    ctx.strokeStyle = "#ffc857";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(pickup.x, pickup.y, 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#fff2b3";
    ctx.fillRect(pickup.x - 4, pickup.y - 4, 8, 8);
  }

  for (const enemy of frameState.enemies ?? []) {
    ctx.fillStyle = enemy.hp > 1 ? "#ff8b7f" : "#71d0ff";
    ctx.fillRect(enemy.x - enemy.w / 2, enemy.y - enemy.h / 2, enemy.w, enemy.h);
    ctx.fillStyle = "#020713";
    ctx.fillRect(enemy.x - enemy.w / 2 + 5, enemy.y - 3, 5, 5);
    ctx.fillRect(enemy.x + enemy.w / 2 - 10, enemy.y - 3, 5, 5);
  }

  for (const obstacle of frameState.obstacles ?? []) {
    ctx.fillStyle = obstacle.kind === "laser" ? "#ff7b7b" : "#8fb4c9";
    ctx.fillRect(obstacle.x, obstacle.y, obstacle.w, obstacle.h);
  }

  for (const projectile of frameState.projectiles ?? []) {
    ctx.fillStyle = projectile.owner === "player" ? "#8cecff" : "#ff8b7f";
    ctx.fillRect(projectile.x - projectile.w / 2, projectile.y - projectile.h / 2, projectile.w, projectile.h);
  }

  for (const option of frameState.options ?? []) {
    ctx.strokeStyle = option.ready ? "#7ff7c6" : "#8aa0b8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(option.x, option.y, option.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = option.ready ? "#bfffe9" : "#d6e1ef";
    ctx.fillRect(option.x - 4, option.y - 4, 8, 8);
  }

  if (frameState.boss?.active || frameState.boss?.phase) {
    const boss = frameState.boss;
    ctx.fillStyle = boss.phase === "shield" ? "#556b86" : "#7f4cff";
    ctx.fillRect(boss.x - boss.w / 2, boss.y - boss.h / 2, boss.w, boss.h);
    if (boss.shieldVisible) {
      ctx.strokeStyle = "#8cecff";
      ctx.lineWidth = 4;
      ctx.strokeRect(boss.x - boss.w / 2 - 10, boss.y - boss.h / 2 - 10, boss.w + 20, boss.h + 20);
    }
    if (boss.coreOpen) {
      ctx.fillStyle = "#ff5f7a";
      ctx.fillRect(boss.x - 18, boss.y - 18, 36, 36);
    }
  }

  drawShip(ctx, frameState.player?.x ?? width * 0.2, frameState.player?.y ?? height * 0.7, 1, frameState.player?.invuln ? "#ffd166" : "#eaf5ff");

  const scoreY = 28;
  ctx.fillStyle = "#eff7ff";
  ctx.font = "600 18px Trebuchet MS, system-ui, sans-serif";
  ctx.fillText(`SCORE ${frameState.score ?? 0}`, 20, scoreY);
  ctx.fillText(`LIVES ${frameState.lives ?? 0}`, 20, scoreY + 22);
  ctx.fillText(`SHIELD ${Math.max(0, Math.round(frameState.shield ?? 0))}%`, 20, scoreY + 44);

  const barX = 20;
  const barY = height - 44;
  drawBar(ctx, barX, barY, 220, 14, (frameState.powerBarIndex ?? 0) / 6, "#7ff7c6", "rgba(255,255,255,0.12)");
  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.strokeRect(barX, barY, 220, 14);

  ctx.fillStyle = "#eff7ff";
  ctx.fillText(`BOSS ${frameState.bossState ?? "idle"}`, width - 180, 28);
  ctx.fillText(frameState.powerBarLabel ?? "POWER BAR", width - 180, 50);

  if (frameState.overlay?.show) {
    ctx.fillStyle = "rgba(1, 4, 10, 0.68)";
    ctx.fillRect(width * 0.18, height * 0.26, width * 0.64, height * 0.32);
    ctx.fillStyle = "#f7fbff";
    ctx.font = "700 30px Trebuchet MS, system-ui, sans-serif";
    ctx.fillText(frameState.overlay.title ?? "Gradius Option-Drive", width * 0.24, height * 0.35);
    ctx.font = "16px Trebuchet MS, system-ui, sans-serif";
    ctx.fillText(frameState.overlay.copy ?? "", width * 0.24, height * 0.42);
  }

  ctx.restore();
}
