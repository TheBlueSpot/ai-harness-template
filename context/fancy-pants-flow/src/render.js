import { CANVAS_HEIGHT, CANVAS_WIDTH, COURSE_LENGTH, getTerrainHeight } from "./terrain.js";

const SKY_TOP = "#fef8e2";
const SKY_BOTTOM = "#ffd28f";
const INK = "#1d1c26";
const ORANGE = "#ef8f1f";
const TEAL = "#2bb7a8";
const BLUE = "#7bc2ff";

export function renderGame(ctx, state) {
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  drawSky(ctx);
  drawNotebookPaper(ctx, state.cameraX);
  ctx.save();
  ctx.translate(-state.cameraX, 0);
  drawBackdrop(ctx, state.cameraX);
  drawTerrain(ctx);
  drawCheckpoints(ctx);
  drawCollectibles(ctx, state.collectibles);
  drawFinish(ctx);
  drawParticles(ctx, state.particles);
  drawPlayer(ctx, state.player);
  ctx.restore();
}

function drawSky(ctx) {
  const sky = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
  sky.addColorStop(0, SKY_TOP);
  sky.addColorStop(0.7, "#fff0c8");
  sky.addColorStop(1, SKY_BOTTOM);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
}

function drawNotebookPaper(ctx, cameraX) {
  ctx.save();
  ctx.globalAlpha = 0.42;
  ctx.fillStyle = "#fffef7";
  ctx.fillRect(0, 70, CANVAS_WIDTH, CANVAS_HEIGHT - 110);
  ctx.strokeStyle = "rgba(76, 144, 255, 0.18)";
  ctx.lineWidth = 2;
  for (let y = 110; y < CANVAS_HEIGHT - 20; y += 54) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(CANVAS_WIDTH, y);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(255, 64, 64, 0.18)";
  ctx.beginPath();
  ctx.moveTo(92, 70);
  ctx.lineTo(92, CANVAS_HEIGHT - 40);
  ctx.stroke();

  ctx.fillStyle = "rgba(29, 28, 38, 0.08)";
  ctx.font = "italic 28px Georgia, serif";
  ctx.fillText(`page ${1 + Math.floor((cameraX + 200) / 1400)}`, CANVAS_WIDTH - 180, 58);
  ctx.restore();
}

function drawBackdrop(ctx, cameraX) {
  const parallax = cameraX * 0.24;
  ctx.save();
  ctx.translate(-parallax, 0);
  for (let i = -2; i < 9; i += 1) {
    const x = i * 340;
    ctx.fillStyle = i % 2 === 0 ? "rgba(43, 183, 168, 0.12)" : "rgba(123, 194, 255, 0.12)";
    ctx.beginPath();
    ctx.moveTo(x, 540);
    ctx.quadraticCurveTo(x + 140, 320, x + 290, 540);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawTerrain(ctx) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, CANVAS_HEIGHT);
  for (let x = 0; x <= COURSE_LENGTH; x += 12) {
    ctx.lineTo(x, getTerrainHeight(x));
  }
  ctx.lineTo(COURSE_LENGTH, CANVAS_HEIGHT);
  ctx.closePath();
  const ground = ctx.createLinearGradient(0, 280, 0, CANVAS_HEIGHT);
  ground.addColorStop(0, "#fff2b8");
  ground.addColorStop(1, "#ef8f1f");
  ctx.fillStyle = ground;
  ctx.fill();

  ctx.strokeStyle = INK;
  ctx.lineWidth = 6;
  ctx.beginPath();
  for (let x = 0; x <= COURSE_LENGTH; x += 8) {
    const y = getTerrainHeight(x);
    if (x === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y + Math.sin(x * 0.06) * 1.5);
    }
  }
  ctx.stroke();
  ctx.restore();
}

function drawCheckpoints(ctx) {
  const marks = [
    { x: 0, label: "START" },
    { x: 1550, label: "HILLS" },
    { x: 3220, label: "TUNNELS" },
    { x: 4780, label: "CHASE" },
  ];

  ctx.font = "bold 22px 'Trebuchet MS', sans-serif";
  ctx.textAlign = "center";
  for (const mark of marks) {
    const y = getTerrainHeight(mark.x);
    ctx.strokeStyle = "rgba(29, 28, 38, 0.7)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(mark.x, y - 8);
    ctx.lineTo(mark.x, y - 126);
    ctx.stroke();
    ctx.fillStyle = "#fffef7";
    ctx.fillRect(mark.x - 54, y - 152, 108, 28);
    ctx.strokeRect(mark.x - 54, y - 152, 108, 28);
    ctx.fillStyle = INK;
    ctx.fillText(mark.label, mark.x, y - 130);
  }
}

function drawCollectibles(ctx, collectibles) {
  ctx.font = "bold 18px 'Trebuchet MS', sans-serif";
  ctx.textAlign = "center";
  for (const collectible of collectibles) {
    if (collectible.taken) {
      continue;
    }
    ctx.save();
    ctx.translate(collectible.x, collectible.y);
    ctx.rotate(Math.sin(collectible.x * 0.02) * 0.1);
    ctx.strokeStyle = TEAL;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, collectible.radius, 0.4, Math.PI * 1.8);
    ctx.stroke();
    ctx.fillStyle = "rgba(43, 183, 168, 0.12)";
    ctx.fill();
    ctx.restore();
  }
}

function drawFinish(ctx) {
  const x = COURSE_LENGTH - 120;
  const y = getTerrainHeight(x);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(x, y - 10);
  ctx.lineTo(x, y - 170);
  ctx.stroke();

  for (let i = 0; i < 7; i += 1) {
    const cellY = y - 168 + i * 22;
    ctx.fillStyle = i % 2 === 0 ? "#fffef7" : INK;
    ctx.fillRect(x, cellY, 92, 22);
    ctx.fillStyle = i % 2 === 0 ? INK : "#fffef7";
    ctx.fillRect(x + 92, cellY, 92, 22);
  }
}

function drawParticles(ctx, particles) {
  for (const particle of particles) {
    ctx.save();
    ctx.globalAlpha = particle.life / particle.maxLife;
    ctx.strokeStyle = particle.color;
    ctx.lineWidth = particle.size;
    ctx.beginPath();
    ctx.moveTo(particle.x - particle.vx * 2, particle.y - particle.vy * 2);
    ctx.lineTo(particle.x, particle.y);
    ctx.stroke();
    ctx.restore();
  }
}

function drawPlayer(ctx, player) {
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(player.angle);
  ctx.lineCap = "round";
  ctx.strokeStyle = INK;
  ctx.lineWidth = 6;

  const lean = Math.max(-0.32, Math.min(0.32, player.vx * 0.018));
  const stride = player.onGround ? Math.sin(player.stepPhase) * 18 : 6;
  const armSwing = Math.sin(player.stepPhase + Math.PI * 0.5) * 16;

  ctx.beginPath();
  ctx.arc(0, -48, 14, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(0, -34);
  ctx.lineTo(0, -2);
  ctx.lineTo(-18 + lean * 20, 28);
  ctx.moveTo(0, -2);
  ctx.lineTo(18 + lean * 20, 28);
  ctx.moveTo(0, -20);
  ctx.lineTo(-24 - armSwing * 0.4, -4);
  ctx.moveTo(0, -18);
  ctx.lineTo(22 + armSwing * 0.4, 2);
  ctx.moveTo(0, -2);
  ctx.lineTo(-14, 34 + stride);
  ctx.moveTo(0, -2);
  ctx.lineTo(18, 32 - stride);
  ctx.stroke();

  ctx.fillStyle = ORANGE;
  ctx.fillRect(-12, -30, 24, 10);

  if (player.onGround && Math.abs(player.vx) > 8) {
    ctx.strokeStyle = BLUE;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-12, 18);
    ctx.lineTo(-42, 12);
    ctx.moveTo(14, 18);
    ctx.lineTo(-20, 34);
    ctx.stroke();
  }

  ctx.restore();
}
