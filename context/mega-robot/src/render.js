export function renderFrame(ctx, frame) {
  const { width, height } = frame.view;
  ctx.save();
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#0f1118";
  ctx.fillRect(0, 0, width, height);

  const groundY = frame.groundY;
  ctx.fillStyle = "#1f2734";
  ctx.fillRect(0, groundY, width, height - groundY);

  ctx.fillStyle = "#2d3950";
  for (const wall of frame.walls) {
    ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
  }

  ctx.fillStyle = "#7bd6ff";
  for (const shot of frame.projectiles) {
    ctx.fillStyle = shot.owner === "player" ? "#ffd166" : "#ff6b6b";
    ctx.fillRect(shot.x - 3, shot.y - 2, 6, 4);
  }

  for (const effect of frame.effects) {
    ctx.fillStyle = effect.kind === "block" ? "#8be9fd" : effect.kind === "shield" ? "#c084fc" : "#ffffff";
    const size = 12 + effect.age * 18;
    ctx.fillRect(effect.x - size / 2, effect.y - size / 2, size, size);
  }

  ctx.fillStyle = "#7bd6ff";
  for (const enemy of frame.enemies) {
    ctx.fillStyle = enemy.weakpoint?.exposed ? "#9ff7ff" : "#7bd6ff";
    ctx.fillRect(enemy.x - 12, enemy.y - 12, 24, 24);
    ctx.fillStyle = "#94a3b8";
    const shieldX = enemy.shieldFacing < 0 ? enemy.x - 20 : enemy.x + 8;
    ctx.fillRect(shieldX, enemy.y - 16, 12, 32);
  }

  if (frame.boss?.active || frame.boss?.completed) {
    ctx.fillStyle = frame.boss.completed ? "#5a6" : "#b38cff";
    ctx.fillRect(frame.boss.x - 28, frame.boss.y - 28, 56, 56);
    if (frame.boss.weakpoint?.exposed) {
      ctx.strokeStyle = "#ffffff";
      ctx.strokeRect(frame.boss.x - 18, frame.boss.y - 18, 36, 36);
    }
  }

  ctx.fillStyle = "#ffcf5c";
  ctx.fillRect(frame.core.x - 22, frame.core.y - 22, 44, 44);
  if (frame.core.shielded) {
    ctx.strokeStyle = "#c084fc";
    ctx.lineWidth = 3;
    ctx.strokeRect(frame.core.x - 30, frame.core.y - 30, 60, 60);
  }

  ctx.fillStyle = frame.player.invuln > 0 ? "#f9a8d4" : "#ff6b6b";
  ctx.fillRect(frame.player.x - 12, frame.player.y - 18, 24, 36);
  if (frame.player.onWall) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(frame.player.x - 14, frame.player.y - 22, 28, 4);
  }

  ctx.fillStyle = "#f0f4ff";
  ctx.font = "16px system-ui, sans-serif";
  ctx.fillText(`Score ${frame.score}`, 18, 28);
  ctx.fillText(`Weapon ${frame.weapon.equipped}`, 18, 48);
  ctx.fillText(`HP ${frame.player.hp}`, 18, 68);

  if (frame.message) {
    ctx.fillStyle = "rgba(8, 10, 16, 0.72)";
    ctx.fillRect(width * 0.24, height * 0.2, width * 0.52, 110);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 28px system-ui, sans-serif";
    ctx.fillText(frame.message.title, width * 0.31, height * 0.25);
    ctx.font = "16px system-ui, sans-serif";
    ctx.fillText(frame.message.body, width * 0.31, height * 0.32);
  }
  ctx.restore();
}
