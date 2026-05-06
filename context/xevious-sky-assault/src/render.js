const TAU = Math.PI * 2;

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function wrap(value, size) {
  return ((value % size) + size) % size;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawShip(ctx, entity, fill, stroke) {
  ctx.save();
  ctx.translate(entity.x, entity.y);
  ctx.rotate(entity.angle || 0);
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, -18);
  ctx.lineTo(14, 10);
  ctx.lineTo(0, 6);
  ctx.lineTo(-14, 10);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawBullet(ctx, bullet, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(bullet.x, bullet.y, bullet.kind === "ground" ? 3.2 : 2.4, 0, TAU);
  ctx.fill();
}

function drawTerrain(ctx, frame) {
  const { width, height, scroll } = frame;
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#091826");
  sky.addColorStop(0.56, "#0a2232");
  sky.addColorStop(1, "#03070c");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.translate(0, wrap(scroll * 0.35, 120));
  for (let y = -120; y < height + 160; y += 120) {
    ctx.strokeStyle = "rgba(130, 210, 255, 0.08)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  ctx.restore();

  const trenchTop = frame.trench?.top ?? height * 0.56;
  ctx.fillStyle = "#08101a";
  ctx.fillRect(0, trenchTop, width, height - trenchTop);

  ctx.fillStyle = "rgba(42, 70, 88, 0.84)";
  ctx.fillRect(0, trenchTop - 12, width, 12);
  ctx.fillStyle = "rgba(24, 38, 48, 0.9)";
  ctx.fillRect(0, trenchTop + 14, width, 18);

  for (let i = 0; i < frame.radarMarks.length; i += 1) {
    const mark = frame.radarMarks[i];
    const x = mark.x * width;
    const y = trenchTop + 14 + mark.y * (height - trenchTop - 24);
    ctx.fillStyle = mark.threat ? "rgba(255, 120, 120, 0.9)" : "rgba(121, 235, 255, 0.72)";
    ctx.beginPath();
    ctx.arc(x, y, mark.threat ? 5 : 3, 0, TAU);
    ctx.fill();
  }

  ctx.fillStyle = "rgba(255, 227, 132, 0.85)";
  for (const stripe of frame.stripes) {
    ctx.fillRect(stripe.x, stripe.y, stripe.w, stripe.h);
  }
}

function drawBase(ctx, base) {
  ctx.save();
  ctx.translate(base.x, base.y);
  ctx.fillStyle = base.threat ? "#82343d" : "#3a5f75";
  roundRect(ctx, -18, -18, 36, 36, 6);
  ctx.fill();
  ctx.fillStyle = "#e6f6ff";
  ctx.fillRect(-7, -7, 14, 14);
  ctx.restore();
}

export function renderScene(ctx, frame) {
  const { width, height } = frame;
  ctx.clearRect(0, 0, width, height);
  drawTerrain(ctx, frame);

  for (const entity of frame.airEnemies || []) drawShip(ctx, entity, "#ffcf68", "#5f3d00");
  for (const entity of frame.groundTargets || []) drawBase(ctx, entity);

  for (const bomb of frame.bombs) {
    ctx.fillStyle = "rgba(255, 148, 82, 0.92)";
    ctx.beginPath();
    ctx.arc(bomb.x, bomb.y, 4, 0, TAU);
    ctx.fill();
  }

  for (const shot of frame.shots) {
    drawBullet(ctx, shot, shot.kind === "ground" ? "#8df3ff" : "#ffe38f");
  }

  drawShip(ctx, frame.player, "#86f2ff", "#08344b");

  ctx.fillStyle = "rgba(2, 8, 14, 0.6)";
  roundRect(ctx, 18, 18, 278, 104, 18);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.stroke();
  ctx.fillStyle = "#eaf6ff";
  ctx.font = "700 20px Trebuchet MS";
  ctx.fillText("Xevious Sky Assault", 36, 48);
  ctx.font = "14px Trebuchet MS";
  ctx.fillStyle = "#b4d2e7";
  ctx.fillText(`Score ${frame.score}`, 36, 72);
  ctx.fillText(`Lives ${frame.lives}`, 132, 72);
  ctx.fillText(`Radar ${Math.round(clamp01(frame.radar) * 100)}%`, 210, 72);

  if (frame.banner) {
    ctx.fillStyle = "rgba(2, 8, 14, 0.58)";
    roundRect(ctx, width * 0.5 - 160, height - 78, 320, 40, 999);
    ctx.fill();
    ctx.fillStyle = "#f4fbff";
    ctx.font = "700 14px Trebuchet MS";
    ctx.textAlign = "center";
    ctx.fillText(frame.banner, width * 0.5, height - 52);
    ctx.textAlign = "left";
  }
}
