import { FLOOR_BOTTOM, FLOOR_LEFT, FLOOR_RIGHT, FLOOR_TOP, HEIGHT, WIDTH } from "./data.js";

const laneRatio = (y) => (y - FLOOR_TOP) / (FLOOR_BOTTOM - FLOOR_TOP);

function drawBackdrop(ctx, stage) {
  const [sky, mid, ground] = stage.backdrop;
  const skyGrad = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  skyGrad.addColorStop(0, sky);
  skyGrad.addColorStop(0.56, mid);
  skyGrad.addColorStop(1, ground);
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(0, FLOOR_TOP - 30, WIDTH, 6);

  ctx.fillStyle = "rgba(21, 16, 14, 0.28)";
  ctx.beginPath();
  ctx.moveTo(FLOOR_LEFT - 80, FLOOR_BOTTOM + 24);
  ctx.lineTo(WIDTH - FLOOR_LEFT + 80, FLOOR_BOTTOM + 24);
  ctx.lineTo(FLOOR_RIGHT + 140, FLOOR_TOP - 4);
  ctx.lineTo(FLOOR_LEFT - 140, FLOOR_TOP - 4);
  ctx.closePath();
  ctx.fill();

  for (let i = 0; i < 6; i += 1) {
    const x = 120 + i * 210;
    ctx.fillStyle = "rgba(16, 12, 10, 0.18)";
    ctx.fillRect(x, FLOOR_TOP - 70, 18, FLOOR_BOTTOM - FLOOR_TOP + 90);
  }
}

function drawShadow(ctx, entity, scale) {
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath();
  ctx.ellipse(entity.x, entity.y + 8, 22 * scale, 8 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawMountBody(ctx, rider) {
  ctx.fillStyle = rider ? "#8b4f1c" : "#5f7a3e";
  ctx.beginPath();
  ctx.ellipse(0, 0, 42, 24, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#d1bb74";
  ctx.fillRect(-34, -8, 54, 10);
  ctx.fillStyle = "#f3dc95";
  ctx.beginPath();
  ctx.arc(28, -16, 16, 0, Math.PI * 2);
  ctx.fill();
}

function drawMount(ctx, mount) {
  const scale = 0.85 + laneRatio(mount.y) * 0.55;
  drawShadow(ctx, mount, scale);
  ctx.save();
  ctx.translate(mount.x, mount.y);
  ctx.scale(scale, scale);
  drawMountBody(ctx, mount.rider);
  ctx.restore();
}

function drawMountedBase(ctx) {
  ctx.save();
  ctx.translate(0, 8);
  drawMountBody(ctx, true);
  ctx.restore();
}

function drawFighter(ctx, fighter, isPlayer) {
  const scale = 0.9 + laneRatio(fighter.y) * 0.6;
  drawShadow(ctx, fighter, scale);
  ctx.save();
  ctx.translate(fighter.x, fighter.y);
  ctx.scale(fighter.facing * scale, scale);

  if (fighter.flash > 0) {
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = "#fff6cf";
    ctx.fillRect(-36, -104, 72, 104);
    ctx.globalAlpha = 1;
  }

  if (fighter.mounted) {
    drawMountedBase(ctx);
    ctx.translate(0, -30);
  }

  ctx.fillStyle = isPlayer ? "#2fd0ff" : "#dc6a4e";
  ctx.fillRect(-18, -72, 36, 52);
  ctx.fillStyle = "#f7dcb2";
  ctx.beginPath();
  ctx.arc(0, -88, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#3a271f";
  ctx.fillRect(-10, -112, 20, 14);
  ctx.fillStyle = "#d6d6cf";
  ctx.fillRect(10, -50, fighter.attacking > 10 ? 54 : 34, 10);
  ctx.fillStyle = "#663828";
  ctx.fillRect(-18, -20, 14, 24);
  ctx.fillRect(4, -20, 14, 24);
  ctx.restore();
}

function drawEffects(ctx, effects) {
  for (const effect of effects) {
    ctx.save();
    ctx.globalAlpha = effect.life / effect.maxLife;
    ctx.strokeStyle = effect.color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(effect.x - 16, effect.y - 14);
    ctx.lineTo(effect.x + 20, effect.y + 12);
    ctx.moveTo(effect.x - 12, effect.y + 16);
    ctx.lineTo(effect.x + 14, effect.y - 18);
    ctx.stroke();
    ctx.restore();
  }
}

export function renderScene(ctx, frame) {
  drawBackdrop(ctx, frame.stage);

  ctx.strokeStyle = "rgba(255, 236, 176, 0.15)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 5; i += 1) {
    const y = FLOOR_TOP + ((FLOOR_BOTTOM - FLOOR_TOP) / 4) * i;
    ctx.beginPath();
    ctx.moveTo(FLOOR_LEFT, y);
    ctx.lineTo(FLOOR_RIGHT, y);
    ctx.stroke();
  }

  const entities = [...frame.mounts, ...frame.enemies, frame.player].sort((a, b) => a.y - b.y);
  for (const entity of entities) {
    if (entity.kind === "mount") {
      drawMount(ctx, entity);
    } else if (entity.kind === "enemy") {
      drawFighter(ctx, entity, false);
    } else {
      drawFighter(ctx, entity, true);
    }
  }

  drawEffects(ctx, frame.effects);

  if (frame.magicBurst > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(0.48, frame.magicBurst / 30);
    const grad = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, 60, WIDTH / 2, HEIGHT / 2, 420);
    grad.addColorStop(0, "rgba(255,255,255,0.85)");
    grad.addColorStop(0.35, "rgba(117,213,255,0.65)");
    grad.addColorStop(1, "rgba(117,213,255,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.restore();
  }

  ctx.fillStyle = "rgba(0,0,0,0.32)";
  ctx.fillRect(28, HEIGHT - 88, 420, 48);
  ctx.fillStyle = "#f7f0cf";
  ctx.font = "24px Georgia, serif";
  ctx.fillText(frame.message, 44, HEIGHT - 56);
}
