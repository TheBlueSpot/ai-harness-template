import { HEIGHT, POWERUP_TYPES, WIDTH } from "./data.js";

function drawBackground(ctx) {
  const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  gradient.addColorStop(0, "#07111f");
  gradient.addColorStop(0.5, "#101e39");
  gradient.addColorStop(1, "#140c24");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  for (let i = 0; i < 18; i += 1) {
    ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.04)" : "rgba(89,216,255,0.03)";
    ctx.fillRect(64 + i * 64, 0, 2, HEIGHT);
  }

  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  ctx.lineWidth = 2;
  ctx.strokeRect(32, 32, WIDTH - 64, HEIGHT - 64);
}

function drawBrick(ctx, brick) {
  const fill = ctx.createLinearGradient(brick.x, brick.y, brick.x, brick.y + brick.height);
  fill.addColorStop(0, brick.color);
  fill.addColorStop(1, "rgba(11,19,34,0.9)");
  ctx.fillStyle = fill;
  ctx.fillRect(brick.x, brick.y, brick.width, brick.height);

  ctx.strokeStyle = brick.kind === "prism" ? "#ffe8ff" : "rgba(255,255,255,0.45)";
  ctx.lineWidth = brick.kind === "prism" ? 3 : 2;
  ctx.strokeRect(brick.x + 1, brick.y + 1, brick.width - 2, brick.height - 2);

  if (brick.kind === "prism") {
    ctx.strokeStyle = "rgba(255,255,255,0.65)";
    ctx.beginPath();
    ctx.moveTo(brick.x + 12, brick.y + brick.height - 6);
    ctx.lineTo(brick.x + brick.width * 0.5, brick.y + 6);
    ctx.lineTo(brick.x + brick.width - 12, brick.y + brick.height - 6);
    ctx.stroke();
  }

  if (brick.maxHp > 1) {
    ctx.fillStyle = "rgba(255,255,255,0.84)";
    ctx.font = "700 14px Trebuchet MS, sans-serif";
    ctx.fillText(`${brick.hp}`, brick.x + brick.width - 16, brick.y + 19);
  }
}

function drawPaddle(ctx, paddle, laserActive) {
  const gradient = ctx.createLinearGradient(
    paddle.x,
    paddle.y - paddle.height * 0.5,
    paddle.x,
    paddle.y + paddle.height * 0.5,
  );
  gradient.addColorStop(0, laserActive ? "#ffd7df" : "#d8ecff");
  gradient.addColorStop(1, laserActive ? "#ff6f8b" : "#4d8dff");
  ctx.fillStyle = gradient;
  ctx.fillRect(paddle.x - paddle.width * 0.5, paddle.y - paddle.height * 0.5, paddle.width, paddle.height);

  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 2;
  ctx.strokeRect(
    paddle.x - paddle.width * 0.5 + 1,
    paddle.y - paddle.height * 0.5 + 1,
    paddle.width - 2,
    paddle.height - 2,
  );

  if (laserActive) {
    ctx.fillStyle = "#ffd3dd";
    ctx.fillRect(paddle.x - paddle.width * 0.32, paddle.y - paddle.height * 0.5 - 8, 10, 8);
    ctx.fillRect(paddle.x + paddle.width * 0.22, paddle.y - paddle.height * 0.5 - 8, 10, 8);
  }
}

function drawBall(ctx, ball) {
  for (let i = ball.trail.length - 1; i >= 0; i -= 1) {
    const trail = ball.trail[i];
    ctx.globalAlpha = 0.08 + (ball.trail.length - i) * 0.05;
    ctx.fillStyle = "#8de9ff";
    ctx.beginPath();
    ctx.arc(trail.x, trail.y, Math.max(2, ball.radius - i * 0.8), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#effcff";
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
  ctx.fill();
}

function drawPowerup(ctx, powerup) {
  const def = POWERUP_TYPES[powerup.type];
  ctx.fillStyle = def.glow;
  ctx.beginPath();
  ctx.arc(powerup.x, powerup.y, powerup.radius + 8, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = def.color;
  ctx.beginPath();
  ctx.arc(powerup.x, powerup.y, powerup.radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#09111e";
  ctx.font = "700 12px Trebuchet MS, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(powerup.type === "laser" ? "L" : "M", powerup.x, powerup.y + 4);
  ctx.textAlign = "start";
}

export function renderScene(ctx, state) {
  drawBackground(ctx);

  for (const brick of state.bricks) {
    drawBrick(ctx, brick);
  }

  for (const particle of state.particles) {
    ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife);
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  for (const powerup of state.powerups) {
    drawPowerup(ctx, powerup);
  }

  for (const laser of state.lasers) {
    ctx.fillStyle = "#ff8aa3";
    ctx.fillRect(laser.x - 2, laser.y - 16, 4, 16);
  }

  drawPaddle(ctx, state.paddle, state.laserActive);

  for (const ball of state.balls) {
    drawBall(ctx, ball);
  }

  ctx.fillStyle = "rgba(5,12,20,0.72)";
  ctx.fillRect(28, 22, 460, 52);
  ctx.fillStyle = "#f4fbff";
  ctx.font = "600 22px Trebuchet MS, sans-serif";
  ctx.fillText(state.status, 44, 55);
}
