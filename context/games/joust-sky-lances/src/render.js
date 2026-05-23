const TAU = Math.PI * 2;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawMeter(ctx, x, y, w, h, value, color) {
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = color;
  roundRect(ctx, x, y, Math.max(h, w * Math.max(0, Math.min(1, value))), h, h / 2);
  ctx.fill();
}

function drawBird(ctx, entity, palette) {
  const flap = Math.sin(entity.wing) * 0.28;
  ctx.save();
  ctx.translate(entity.x, entity.y);
  ctx.scale(entity.facing, 1);

  ctx.globalAlpha = entity.invuln > 0 && Math.floor(entity.invuln * 14) % 2 === 0 ? 0.45 : 1;

  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-8, -2);
  ctx.lineTo(30, -16);
  ctx.stroke();

  ctx.fillStyle = palette.wing;
  ctx.beginPath();
  ctx.moveTo(-6, -2);
  ctx.quadraticCurveTo(-54, -44 - flap * 44, -12, -16);
  ctx.quadraticCurveTo(-26, -26, -6, -2);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(10, -4);
  ctx.quadraticCurveTo(-10, -54 + flap * 36, 24, -16);
  ctx.quadraticCurveTo(12, -24, 10, -4);
  ctx.fill();

  ctx.fillStyle = palette.body;
  ctx.beginPath();
  ctx.ellipse(0, 8, 36, 24, 0, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(30, -4, 18, 14, -0.24, 0, TAU);
  ctx.fill();

  ctx.fillStyle = palette.saddle;
  ctx.fillRect(-8, -22, 20, 18);
  ctx.fillStyle = "#ffe4c7";
  ctx.beginPath();
  ctx.arc(2, -28, 10, 0, TAU);
  ctx.fill();
  ctx.fillStyle = palette.visor;
  ctx.fillRect(-6, -34, 18, 6);

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(34, -8, 3, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawEgg(ctx, egg) {
  ctx.save();
  ctx.translate(egg.x, egg.y);
  ctx.rotate(Math.sin(egg.wobble) * 0.1);
  ctx.fillStyle = "#fff1b6";
  ctx.beginPath();
  ctx.ellipse(0, 0, 12, 16, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "rgba(120,84,32,0.4)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-4, -5);
  ctx.quadraticCurveTo(0, -8, 5, -3);
  ctx.stroke();
  ctx.restore();
}

export function renderGame(ctx, frame) {
  ctx.clearRect(0, 0, frame.width, frame.height);

  const sky = ctx.createLinearGradient(0, 0, 0, frame.height);
  sky.addColorStop(0, "#173856");
  sky.addColorStop(0.48, "#2f6991");
  sky.addColorStop(1, "#0a1320");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, frame.width, frame.height);

  const halo = ctx.createRadialGradient(frame.width * 0.74, 120, 12, frame.width * 0.74, 120, 180);
  halo.addColorStop(0, "rgba(255,232,168,0.85)");
  halo.addColorStop(0.4, "rgba(255,194,115,0.25)");
  halo.addColorStop(1, "rgba(255,194,115,0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(frame.width * 0.74, 120, 180, 0, TAU);
  ctx.fill();

  for (let i = 0; i < 5; i += 1) {
    const x = (i * 250 + (frame.player.x * 0.08)) % (frame.width + 180) - 100;
    const y = 90 + (i % 3) * 95;
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.beginPath();
    ctx.ellipse(x, y, 70, 24, 0, 0, TAU);
    ctx.ellipse(x + 34, y + 6, 52, 20, 0, 0, TAU);
    ctx.fill();
  }

  for (const perch of frame.perches) {
    ctx.fillStyle = "#69503a";
    ctx.beginPath();
    ctx.moveTo(perch.x - perch.w * 0.5, perch.y);
    ctx.quadraticCurveTo(perch.x, perch.y + 36, perch.x + perch.w * 0.5, perch.y);
    ctx.lineTo(perch.x + perch.w * 0.34, perch.y - 16);
    ctx.lineTo(perch.x - perch.w * 0.34, perch.y - 16);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#89c46c";
    ctx.fillRect(perch.x - perch.w * 0.38, perch.y - 20, perch.w * 0.76, 14);
  }

  ctx.fillStyle = "rgba(6,12,20,0.6)";
  ctx.fillRect(0, frame.floorY, frame.width, frame.height - frame.floorY);

  for (const particle of frame.particles) {
    ctx.globalAlpha = particle.alpha;
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  for (const enemy of frame.enemies) {
    for (const [index, trail] of enemy.trail.entries()) {
      ctx.globalAlpha = (index + 1) / enemy.trail.length * 0.18;
      ctx.fillStyle = trail.color;
      ctx.beginPath();
      ctx.arc(trail.x, trail.y, 10, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    drawBird(ctx, enemy, {
      body: enemy.color,
      wing: "rgba(255,255,255,0.3)",
      saddle: "#29313f",
      visor: "#ffe7bf",
    });
    if (enemy.tell > 0) {
      ctx.strokeStyle = "rgba(255,120,120,0.9)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(enemy.x, enemy.y, 42 + Math.sin(enemy.tell * 28) * 4, 0, TAU);
      ctx.stroke();
    }
  }

  for (const egg of frame.eggs) {
    drawEgg(ctx, egg);
    drawMeter(ctx, egg.x - 18, egg.y + 22, 36, 5, egg.timer / 6.5, "#ff8fb2");
  }

  for (const [index, trail] of frame.player.trail.entries()) {
    ctx.globalAlpha = (index + 1) / frame.player.trail.length * 0.2;
    ctx.fillStyle = trail.color;
    ctx.beginPath();
    ctx.arc(trail.x, trail.y, 11, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  drawBird(ctx, frame.player, {
    body: "#fff3b0",
    wing: "#d8ffff",
    saddle: "#244562",
    visor: "#ffffff",
  });

  ctx.fillStyle = "rgba(7,15,22,0.72)";
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  roundRect(ctx, 20, 20, 372, 126, 22);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#f6fbff";
  ctx.font = "700 24px Trebuchet MS";
  ctx.fillText("Joust Sky Lances", 38, 54);
  ctx.font = "14px Trebuchet MS";
  ctx.fillStyle = "#bcd3e7";
  ctx.fillText(`Wave ${Math.min(frame.wave, frame.maxWave)} / ${frame.maxWave}`, 38, 80);
  ctx.fillText(`Score ${frame.player.score}`, 150, 80);
  ctx.fillText(`Best ${frame.best}`, 258, 80);
  drawMeter(ctx, 38, 94, 140, 14, frame.player.hp / frame.player.maxHp, "#ff8a8a");
  drawMeter(ctx, 198, 94, 140, 14, frame.player.surgeMeter, "#87f4ff");
  ctx.fillStyle = "#bcd3e7";
  ctx.fillText("Armor", 38, 90);
  ctx.fillText("Surge", 198, 90);
  ctx.fillText(`Eggs Saved ${frame.player.eggsSaved}`, 38, 128);

  roundRect(ctx, frame.width - 388, 20, 368, 132, 22);
  ctx.fillStyle = "rgba(7,15,22,0.72)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.stroke();
  ctx.fillStyle = "#f6fbff";
  ctx.font = "700 20px Trebuchet MS";
  ctx.fillText("Sky Read", frame.width - 368, 52);
  ctx.font = "14px Trebuchet MS";
  ctx.fillStyle = "#bcd3e7";
  ctx.fillText(frame.message, frame.width - 368, 82);
  if (frame.tip) {
    ctx.fillStyle = "#ffe39a";
    ctx.fillText(frame.tip, frame.width - 368, 112);
  }

  if (frame.flash > 0) {
    ctx.fillStyle = `rgba(255,245,214,${frame.flash * 0.28})`;
    ctx.fillRect(0, 0, frame.width, frame.height);
  }
}
