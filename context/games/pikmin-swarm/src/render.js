const SKY_TOP = "#1f3d2c";
const SKY_BOTTOM = "#0b1510";
const SOIL = "#4c321e";
const GRASS = "#76a65a";
const PIKMIN = ["#d94a3b", "#efe05b", "#63c7da", "#d88be0"];

export function renderFrame(ctx, frameState, assets = {}) {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  ctx.clearRect(0, 0, width, height);
  drawBackdrop(ctx, width, height, assets.time || 0);
  drawGround(ctx, width, height);
  drawBase(ctx, frameState.base, frameState.world?.homeRadius || 64);
  drawPellets(ctx, frameState.pellets);
  drawGates(ctx, frameState.gates);
  drawEnemies(ctx, frameState.enemies);
  drawCursor(ctx, frameState.cursor);
  drawLeader(ctx, frameState.leader);
  drawSwarm(ctx, frameState.squad || []);
  drawObjectiveCue(ctx, frameState);
}

function drawBackdrop(ctx, width, height, time) {
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, SKY_TOP);
  grad.addColorStop(1, SKY_BOTTOM);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  for (let i = 0; i < 18; i += 1) {
    const x = ((i * 140) + time * 22) % (width + 160) - 80;
    ctx.fillRect(x, 70 + (i % 3) * 18, 70, 2);
  }
}

function drawGround(ctx, width, height) {
  ctx.fillStyle = SOIL;
  ctx.fillRect(0, height * 0.62, width, height * 0.38);
  ctx.fillStyle = GRASS;
  ctx.fillRect(0, height * 0.58, width, 18);
}

function drawBase(ctx, base, homeRadius) {
  ctx.save();
  ctx.translate(base.x, base.y);
  ctx.strokeStyle = "rgba(244, 230, 196, 0.18)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, homeRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#f4e6c4";
  ctx.beginPath();
  ctx.arc(0, 0, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#e84d39";
  ctx.beginPath();
  ctx.arc(0, -12, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPellets(ctx, pellets) {
  for (const pellet of pellets) {
    if (pellet.delivered) continue;
    ctx.save();
    ctx.translate(pellet.x, pellet.y);
    ctx.fillStyle = pellet.carried ? "#9de27a" : pellet.color || "#7ac943";
    ctx.beginPath();
    ctx.roundRect(-18, -18, 36, 36, 12);
    ctx.fill();
    ctx.strokeStyle = "#23381c";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = "#11210f";
    ctx.font = "700 16px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${pellet.required}`, 0, 6);
    ctx.restore();
  }
}

function drawGates(ctx, gates) {
  for (const gate of gates) {
    if (gate.open) continue;
    ctx.save();
    ctx.translate(gate.x, gate.y);
    ctx.fillStyle = gate.color || "#8c6a3a";
    ctx.fillRect(-18, -78, 36, 92);
    ctx.fillStyle = "#d8c18a";
    ctx.fillRect(-26, -84, 52, 10);
    ctx.fillStyle = "rgba(14, 19, 12, 0.65)";
    ctx.fillRect(-30, 22, 60, 10);
    const progress = Math.max(0, Math.min(1, gate.progress / gate.progressNeeded));
    ctx.fillStyle = "#d9ef7a";
    ctx.fillRect(-30, 22, 60 * progress, 10);
    ctx.restore();
  }
}

function drawEnemies(ctx, enemies) {
  for (const enemy of enemies) {
    if (enemy.defeated) continue;
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, enemy.sight, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = enemy.color || "#b84b3e";
    ctx.beginPath();
    ctx.ellipse(0, 0, enemy.radius + 10, enemy.radius, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f4f0db";
    ctx.beginPath();
    ctx.arc(enemy.radius * 0.35, -4, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawLeader(ctx, leader) {
  ctx.save();
  ctx.translate(leader.x, leader.y);
  ctx.fillStyle = "#efe6cf";
  ctx.beginPath();
  ctx.arc(0, 0, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#5eb36e";
  ctx.beginPath();
  ctx.ellipse(6, -15, 4, 10, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawSwarm(ctx, swarm) {
  swarm.forEach((unit, index) => {
    ctx.save();
    ctx.translate(unit.x, unit.y);
    ctx.fillStyle = PIKMIN[index % PIKMIN.length];
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.arc(3, -2, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

function drawCursor(ctx, cursor) {
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cursor.x, cursor.y, 18, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawObjectiveCue(ctx, frameState) {
  if (frameState.state !== "play") return;
  const objective =
    frameState.pellets.find((pellet) => !pellet.delivered) ||
    frameState.gates.find((gate) => !gate.open) ||
    frameState.enemies.find((enemy) => !enemy.defeated);
  if (!objective) return;
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 3;
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.arc(objective.x, objective.y, (objective.radius || 18) + 14, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  const label = objective.prompt || objective.telegraph || frameState.message || "Push objective.";
  const width = Math.min(320, Math.max(180, label.length * 7));
  const x = Math.max(24, Math.min(objective.x - width / 2, ctx.canvas.width - width - 24));
  const y = Math.max(24, objective.y - 92);
  ctx.fillStyle = "rgba(0,0,0,0.52)";
  ctx.fillRect(x, y, width, 44);
  ctx.fillStyle = "#f6f7ea";
  ctx.font = "600 16px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(label, x + 14, y + 27);
  ctx.restore();
}
