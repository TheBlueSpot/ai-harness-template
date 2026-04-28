function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export class HUD {
  render(ctx, frame) {
    const { width, height, player, wave, score, message, enemies } = frame;
    ctx.save();

    ctx.fillStyle = "rgba(7, 12, 20, 0.84)";
    roundRect(ctx, 18, 16, Math.min(430, width - 36), 102, 20);
    ctx.fill();
    ctx.strokeStyle = "rgba(215,226,255,0.12)";
    ctx.stroke();

    ctx.fillStyle = "#f8c84a";
    ctx.font = '700 14px "Trebuchet MS", sans-serif';
    ctx.fillText("SLUG HAIL", 36, 38);
    ctx.fillStyle = "#edf4ff";
    ctx.font = '700 24px "Trebuchet MS", sans-serif';
    ctx.fillText(`Wave ${wave}`, 36, 68);
    ctx.font = '700 18px "Trebuchet MS", sans-serif';
    ctx.fillText(`Score ${score.toString().padStart(5, "0")}`, 36, 94);
    ctx.fillStyle = "rgba(232,240,255,0.74)";
    ctx.font = '14px "Trebuchet MS", sans-serif';
    ctx.fillText(message, 170, 68);
    ctx.fillText(`${enemies} hostiles active`, 170, 92);

    ctx.fillStyle = "rgba(7, 12, 20, 0.84)";
    roundRect(ctx, width - 270, 16, 252, 122, 20);
    ctx.fill();
    ctx.strokeStyle = "rgba(215,226,255,0.12)";
    ctx.stroke();

    ctx.fillStyle = "#edf4ff";
    ctx.font = '700 18px "Trebuchet MS", sans-serif';
    ctx.fillText(player.weaponLabel, width - 250, 44);
    ctx.fillStyle = "rgba(232,240,255,0.74)";
    ctx.font = '14px "Trebuchet MS", sans-serif';
    ctx.fillText("HP", width - 250, 72);
    ctx.fillText("Heat", width - 250, 102);

    for (let i = 0; i < player.maxHp; i += 1) {
      ctx.fillStyle = i < player.hp ? (player.hp <= 3 ? "#ff7d73" : "#7ff0b4") : "rgba(255,255,255,0.08)";
      roundRect(ctx, width - 214 + i * 20, 58, 16, 12, 6);
      ctx.fill();
    }

    ctx.fillStyle = "rgba(255,255,255,0.08)";
    roundRect(ctx, width - 214, 88, 170, 14, 7);
    ctx.fill();
    ctx.fillStyle = player.heat > 0.7 ? "#ff7d73" : "#8ee6ff";
    roundRect(ctx, width - 214, 88, 170 * player.heat, 14, 7);
    ctx.fill();

    ctx.fillStyle = "rgba(7, 12, 20, 0.84)";
    roundRect(ctx, 18, height - 70, Math.min(520, width - 36), 52, 18);
    ctx.fill();
    ctx.strokeStyle = "rgba(215,226,255,0.12)";
    ctx.stroke();
    ctx.fillStyle = "rgba(232,240,255,0.74)";
    ctx.font = '14px "Trebuchet MS", sans-serif';
    ctx.fillText("WASD move  |  Mouse aim  |  Hold click or Space fire  |  Q switch  |  Shift slow-drift", 34, height - 39);

    ctx.restore();
  }
}
