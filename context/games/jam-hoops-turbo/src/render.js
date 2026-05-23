const HOME_COLOR = "#2fa0ff";
const AWAY_COLOR = "#ff6840";
const LINE = "rgba(255, 247, 220, 0.85)";
const WOOD_A = "#b8713f";
const WOOD_B = "#cb8750";
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;

function drawCourt(ctx) {
  ctx.fillStyle = "#7d4c2d";
  ctx.fillRect(0, 0, 1280, 720);

  for (let stripe = 0; stripe < 16; stripe += 1) {
    ctx.fillStyle = stripe % 2 === 0 ? WOOD_A : WOOD_B;
    ctx.fillRect(96 + stripe * 68, 96, 68, 528);
  }

  ctx.fillStyle = "rgba(25, 81, 48, 0.85)";
  ctx.fillRect(96, 96, 1088, 528);

  ctx.strokeStyle = LINE;
  ctx.lineWidth = 6;
  ctx.strokeRect(96, 96, 1088, 528);

  ctx.beginPath();
  ctx.moveTo(640, 96);
  ctx.lineTo(640, 624);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(640, 360, 78, 0, Math.PI * 2);
  ctx.stroke();

  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(1128, 360, 120, Math.PI * 0.5, Math.PI * 1.5);
  ctx.arc(152, 360, 120, -Math.PI * 0.5, Math.PI * 0.5);
  ctx.stroke();

  ctx.fillStyle = "rgba(244, 208, 111, 0.12)";
  ctx.fillRect(1018, 250, 110, 220);
  ctx.fillRect(152, 250, 110, 220);
}

function drawHoop(ctx, x, y, flip) {
  ctx.strokeStyle = "#f6f0de";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(x, y - 60);
  ctx.lineTo(x, y + 60);
  ctx.stroke();

  ctx.strokeStyle = "#ff6540";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + flip * 18, y);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x + flip * 26, y, 20, Math.PI * 0.15, Math.PI * 0.85, flip < 0);
  ctx.stroke();
}

function drawPlayer(ctx, player, controlled, fireTeam) {
  ctx.save();
  ctx.translate(player.x, player.y);

  if (fireTeam === player.team) {
    const aura = ctx.createRadialGradient(0, 0, 8, 0, 0, 40);
    aura.addColorStop(0, "rgba(255, 216, 106, 0.45)");
    aura.addColorStop(1, "rgba(255, 216, 106, 0)");
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(0, 0, 40, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = player.team === "home" ? HOME_COLOR : AWAY_COLOR;
  ctx.beginPath();
  ctx.arc(0, 0, player.radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.2)";
  ctx.beginPath();
  ctx.arc(-7, -8, 10, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(10, 22, 37, 0.85)";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = "#f8f2dd";
  ctx.font = "bold 15px Trebuchet MS";
  ctx.textAlign = "center";
  ctx.fillText(player.role[0], 0, 5);

  if (controlled) {
    ctx.fillStyle = "#ffd56a";
    ctx.beginPath();
    ctx.moveTo(0, -38);
    ctx.lineTo(-12, -56);
    ctx.lineTo(12, -56);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

function getBallVisual(ball) {
  if (ball.mode === "shot" && ball.shot) {
    const apexRatio = clamp(ball.z / Math.max(ball.shot.arc, 1), 0, 1);
    const flight = clamp(ball.shot.elapsed / Math.max(ball.shot.duration, 0.001), 0, 1);
    const descending = flight >= 0.5;
    const scale = descending
      ? lerp(0.68, 1.18, clamp((flight - 0.5) / 0.5, 0, 1))
      : lerp(1, 0.68, apexRatio);
    const shadowScale = lerp(1, 0.5, apexRatio);
    return {
      scale,
      shadowScale: clamp(shadowScale, 0.5, 1),
    };
  }

  return {
    scale: 1,
    shadowScale: 1,
  };
}

function drawBall(ctx, ball) {
  const visual = getBallVisual(ball);
  const ballRadius = 12 * visual.scale;
  const shadowRadiusX = 16 * visual.shadowScale;
  const shadowRadiusY = 8 * visual.shadowScale;

  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath();
  ctx.ellipse(ball.x, ball.y + 18, shadowRadiusX, shadowRadiusY, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.translate(ball.x, ball.y - ball.z);
  ctx.fillStyle = "#ff9642";
  ctx.beginPath();
  ctx.arc(0, 0, ballRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#7d3514";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, ballRadius, 0, Math.PI * 2);
  ctx.moveTo(-ballRadius, 0);
  ctx.lineTo(ballRadius, 0);
  ctx.moveTo(0, -ballRadius);
  ctx.lineTo(0, ballRadius);
  ctx.stroke();
  ctx.restore();
}

function drawBanner(ctx, message) {
  if (!message) {
    return;
  }
  ctx.save();
  ctx.fillStyle = "rgba(7, 16, 28, 0.82)";
  ctx.fillRect(420, 28, 440, 54);
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.strokeRect(420, 28, 440, 54);
  ctx.fillStyle = "#ffd56a";
  ctx.font = "bold 28px Trebuchet MS";
  ctx.textAlign = "center";
  ctx.fillText(message, 640, 63);
  ctx.restore();
}

export function renderGame(ctx, frame) {
  ctx.clearRect(0, 0, frame.width, frame.height);
  drawCourt(ctx);
  drawHoop(ctx, 126, 360, 1);
  drawHoop(ctx, 1154, 360, -1);

  for (const player of frame.players) {
    drawPlayer(ctx, player, player.id === frame.controlledId, frame.fireTeam);
  }

  drawBall(ctx, frame.ball);
  drawBanner(ctx, frame.message);
}
