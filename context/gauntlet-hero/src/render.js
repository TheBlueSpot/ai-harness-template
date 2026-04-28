import { HEIGHT, WIDTH } from "./data.js";

function toScreen(state, x, y) {
  return {
    x: x - state.cameraX + WIDTH * 0.5,
    y: y - state.cameraY + HEIGHT * 0.5,
  };
}

export function renderScene(ctx, state) {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);

  const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  gradient.addColorStop(0, "#08111b");
  gradient.addColorStop(1, "#05070d");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const roomOrigin = toScreen(state, 0, 0);
  ctx.fillStyle = state.theme.floor;
  ctx.fillRect(roomOrigin.x, roomOrigin.y, state.roomWidth, state.roomHeight);
  ctx.strokeStyle = state.theme.line;
  ctx.lineWidth = 5;
  ctx.strokeRect(roomOrigin.x, roomOrigin.y, state.roomWidth, state.roomHeight);

  ctx.strokeStyle = `${state.theme.accent}22`;
  ctx.lineWidth = 1;
  for (let x = 80; x < state.roomWidth; x += 80) {
    const start = toScreen(state, x, 0);
    const end = toScreen(state, x, state.roomHeight);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
  }
  for (let y = 80; y < state.roomHeight; y += 80) {
    const start = toScreen(state, 0, y);
    const end = toScreen(state, state.roomWidth, y);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
  }

  renderDoor(ctx, state);
  renderKey(ctx, state);
  renderGenerators(ctx, state);
  renderProjectiles(ctx, state);
  renderEnemies(ctx, state);
  renderPlayer(ctx, state);
  renderParticles(ctx, state);
  renderStatus(ctx, state);
}

function renderDoor(ctx, state) {
  const door = toScreen(state, state.door.x, state.door.y);
  ctx.fillStyle = state.doorLocked ? "#61384a" : "#3f725f";
  ctx.fillRect(door.x - state.door.width * 0.5, door.y - state.door.height * 0.5, state.door.width, state.door.height);
  ctx.strokeStyle = state.doorLocked ? "#e06d96" : "#9bf7c4";
  ctx.lineWidth = 4;
  ctx.strokeRect(door.x - state.door.width * 0.5, door.y - state.door.height * 0.5, state.door.width, state.door.height);
}

function renderKey(ctx, state) {
  if (!state.key || state.key.collected) {
    return;
  }
  const key = toScreen(state, state.key.x, state.key.y + Math.sin(state.totalTime * 4) * 8);
  ctx.fillStyle = "#ffd765";
  ctx.beginPath();
  ctx.arc(key.x, key.y, state.key.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(key.x + 8, key.y - 5, 24, 10);
  ctx.fillRect(key.x + 24, key.y - 11, 8, 6);
  ctx.fillRect(key.x + 24, key.y + 5, 8, 6);
}

function renderGenerators(ctx, state) {
  for (const generator of state.generators) {
    const point = toScreen(state, generator.x, generator.y);
    const pulse = 1 + Math.sin(generator.pulse) * 0.12;
    ctx.fillStyle = "#1f315f";
    ctx.beginPath();
    ctx.arc(point.x, point.y, generator.radius * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#86e4ff";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(point.x, point.y, generator.radius * 0.72, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#b1f2ff";
    ctx.fillRect(point.x - 10, point.y - generator.radius - 16, 20 * (generator.hp / generator.maxHp), 6);
  }
}

function renderProjectiles(ctx, state) {
  for (const projectile of state.projectiles) {
    const point = toScreen(state, projectile.x, projectile.y);
    ctx.fillStyle = projectile.color;
    ctx.beginPath();
    ctx.arc(point.x, point.y, projectile.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function renderEnemies(ctx, state) {
  for (const enemy of state.enemies) {
    const point = toScreen(state, enemy.x, enemy.y);
    ctx.fillStyle = "#cde9ff";
    ctx.globalAlpha = 0.82;
    ctx.beginPath();
    ctx.arc(point.x, point.y, enemy.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(point.x - enemy.radius * 0.8, point.y + enemy.radius * 0.1);
    ctx.quadraticCurveTo(point.x, point.y + enemy.radius * 1.35, point.x + enemy.radius * 0.8, point.y + enemy.radius * 0.1);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#08111b";
    ctx.beginPath();
    ctx.arc(point.x - 5, point.y - 2, 3, 0, Math.PI * 2);
    ctx.arc(point.x + 5, point.y - 2, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ed708f";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(point.x - 8, point.y + 8);
    ctx.lineTo(point.x + 8, point.y + 8);
    ctx.stroke();
  }
}

function renderPlayer(ctx, state) {
  const hero = toScreen(state, state.heroX, state.heroY);
  ctx.save();
  ctx.translate(hero.x, hero.y);
  ctx.rotate(state.heroFacing);
  ctx.fillStyle = state.heroHurt ? "#ffffff" : state.heroColor;
  ctx.beginPath();
  ctx.arc(0, 0, state.heroRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#0b1121";
  ctx.fillRect(-6, -state.heroRadius - 8, 20, 16);
  ctx.fillStyle = "#f7f4d6";
  ctx.beginPath();
  ctx.moveTo(10, 0);
  ctx.lineTo(36, -7);
  ctx.lineTo(36, 7);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function renderParticles(ctx, state) {
  for (const particle of state.particles) {
    const point = toScreen(state, particle.x, particle.y);
    ctx.globalAlpha = particle.alpha;
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(point.x, point.y, particle.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function renderStatus(ctx, state) {
  ctx.fillStyle = "rgba(5, 8, 15, 0.72)";
  ctx.fillRect(22, HEIGHT - 74, 620, 46);
  ctx.strokeStyle = state.theme.accent;
  ctx.lineWidth = 2;
  ctx.strokeRect(22, HEIGHT - 74, 620, 46);
  ctx.fillStyle = "#e9f2ff";
  ctx.font = "18px Arial";
  ctx.fillText(state.statusText, 40, HEIGHT - 44);
}
