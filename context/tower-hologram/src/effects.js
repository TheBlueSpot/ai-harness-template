function createScreenLayer() {
  return {
    damage: 0,
    win: 0,
    gameOver: 0,
    spawn: 0,
    upgrade: 0,
    energy: 0,
    death: 0,
    boss: 0,
    disruption: 0,
  };
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

export function createEffects() {
  return {
    particles: [],
    screen: createScreenLayer(),
    wobble: 0,
  };
}

export function triggerScreenFlash(effects, kind, amount = 1) {
  if (!effects?.screen || !Object.hasOwn(effects.screen, kind)) {
    return;
  }

  effects.screen[kind] = Math.max(effects.screen[kind], amount);
  effects.wobble = Math.max(effects.wobble, amount * 0.6);
}

export function spawnBurst(effects, { x, y, color = "#7df3ff", count = 10, speed = 160, life = 0.45, spread = Math.PI * 2, size = 2.6, glow = 0.8, ring = false }) {
  if (!effects) {
    return;
  }

  const particles = effects.particles;
  for (let i = 0; i < count; i += 1) {
    const angle = rand(0, spread);
    const velocity = rand(speed * 0.45, speed);
    particles.push({
      x,
      y,
      px: x,
      py: y,
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity,
      life,
      ttl: life,
      size: rand(size * 0.7, size * 1.2),
      color,
      glow,
      ring,
    });
  }
}

export function spawnShockwave(effects, { x, y, color = "#7df3ff", radius = 16, life = 0.4 }) {
  if (!effects) {
    return;
  }

  effects.particles.push({
    x,
    y,
    px: x,
    py: y,
    vx: 0,
    vy: 0,
    life,
    ttl: life,
    size: radius,
    color,
    glow: 1,
    ring: true,
  });
}

export function spawnHologramPulse(effects, { x, y, color = "#bffcff", radius = 28, life = 0.55 }) {
  if (!effects) {
    return;
  }

  effects.particles.push({
    x,
    y,
    px: x,
    py: y,
    vx: 0,
    vy: 0,
    life,
    ttl: life,
    size: radius,
    color,
    glow: 1.15,
    ring: true,
  });
}

export function updateEffects(effects, dt) {
  if (!effects) {
    return;
  }

  const fadeRate = 1.9;
  const screen = effects.screen;
  screen.damage = Math.max(0, screen.damage - dt * fadeRate);
  screen.win = Math.max(0, screen.win - dt * 0.9);
  screen.gameOver = Math.max(0, screen.gameOver - dt * 0.8);
  screen.spawn = Math.max(0, screen.spawn - dt * 1.6);
  screen.upgrade = Math.max(0, screen.upgrade - dt * 1.8);
  screen.energy = Math.max(0, screen.energy - dt * 1.4);
  screen.death = Math.max(0, screen.death - dt * 1.5);
  screen.boss = Math.max(0, screen.boss - dt * 1.3);
  screen.disruption = Math.max(0, screen.disruption - dt * 1.5);
  effects.wobble = Math.max(0, effects.wobble - dt * 1.4);

  for (const particle of effects.particles) {
    particle.life -= dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vx *= 0.975;
    particle.vy *= 0.975;
  }

  effects.particles = effects.particles.filter((particle) => particle.life > 0);
}

function drawParticles(ctx, effects) {
  for (const particle of effects.particles) {
    const progress = 1 - particle.life / particle.ttl;
    ctx.save();
    ctx.globalAlpha = Math.max(0, particle.life / particle.ttl);
    ctx.translate(particle.x, particle.y);
    ctx.shadowColor = particle.color;
    ctx.shadowBlur = 18 * particle.glow;
    ctx.fillStyle = particle.color;
    if (particle.ring) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = particle.color;
      ctx.beginPath();
      ctx.arc(0, 0, particle.size + progress * 18, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, particle.size * (1 - progress * 0.2), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function overlayFlash(ctx, width, height, color, intensity, mode = "screen") {
  if (intensity <= 0) {
    return;
  }

  ctx.save();
  ctx.globalCompositeOperation = mode;
  ctx.fillStyle = color;
  ctx.globalAlpha = Math.min(0.75, intensity);
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

export function drawEffects(ctx, effects, width, height) {
  if (!effects) {
    return;
  }

  drawParticles(ctx, effects);

  overlayFlash(ctx, width, height, "rgba(255, 102, 118, 1)", effects.screen.damage * 0.28, "screen");
  overlayFlash(ctx, width, height, "rgba(125, 243, 255, 1)", effects.screen.spawn * 0.18, "screen");
  overlayFlash(ctx, width, height, "rgba(125, 141, 255, 1)", effects.screen.upgrade * 0.2, "screen");
  overlayFlash(ctx, width, height, "rgba(255, 223, 122, 1)", effects.screen.energy * 0.18, "screen");
  overlayFlash(ctx, width, height, "rgba(255, 255, 255, 1)", effects.screen.death * 0.16, "screen");
  overlayFlash(ctx, width, height, "rgba(191, 252, 255, 1)", effects.screen.boss * 0.24, "screen");
  overlayFlash(ctx, width, height, "rgba(125, 243, 255, 1)", effects.screen.disruption * 0.12, "screen");
  overlayFlash(ctx, width, height, "rgba(125, 243, 255, 1)", effects.screen.win * 0.22, "screen");
  overlayFlash(ctx, width, height, "rgba(255, 111, 125, 1)", effects.screen.gameOver * 0.28, "source-over");

  if (effects.screen.gameOver > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(0.6, effects.screen.gameOver * 0.35);
    ctx.fillStyle = "rgba(2, 4, 8, 0.55)";
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }
}
