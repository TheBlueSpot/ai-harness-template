const TAU = Math.PI * 2;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function createOffscreen(width, height) {
  if (typeof document === "undefined") {
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function drawSoftGlow(ctx, x, y, radius, innerColor, outerColor) {
  const glow = ctx.createRadialGradient(x, y, radius * 0.1, x, y, radius);
  glow.addColorStop(0, innerColor);
  glow.addColorStop(1, outerColor);
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.fill();
}

function makeTurtleSprite() {
  const canvas = createOffscreen(128, 96);
  if (!canvas) {
    return null;
  }

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.translate(64, 48);

  const shell = ctx.createRadialGradient(-10, -8, 8, 0, 0, 32);
  shell.addColorStop(0, "#8cf7d8");
  shell.addColorStop(0.55, "#3dbfa2");
  shell.addColorStop(1, "#1f695f");

  ctx.fillStyle = shell;
  ctx.beginPath();
  ctx.ellipse(0, 0, 30, 22, -0.1, 0, TAU);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.28)";
  ctx.beginPath();
  ctx.ellipse(-7, -7, 11, 7, -0.15, 0, TAU);
  ctx.fill();

  ctx.fillStyle = "#17352f";
  ctx.beginPath();
  ctx.ellipse(28, 0, 12, 10, 0.05, 0, TAU);
  ctx.fill();

  ctx.fillStyle = "#f7efe2";
  ctx.beginPath();
  ctx.arc(29, -5, 3.5, 0, TAU);
  ctx.arc(29, 5, 3.5, 0, TAU);
  ctx.fill();

  ctx.fillStyle = "#17352f";
  ctx.beginPath();
  ctx.ellipse(-20, -18, 9, 5, -0.55, 0, TAU);
  ctx.ellipse(-20, 18, 9, 5, 0.55, 0, TAU);
  ctx.ellipse(4, -22, 10, 5, 0.15, 0, TAU);
  ctx.ellipse(4, 22, 10, 5, -0.15, 0, TAU);
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, 14, 0.3, TAU - 0.3);
  ctx.stroke();

  ctx.restore();
  return canvas;
}

function makeBombSprite() {
  const canvas = createOffscreen(96, 96);
  if (!canvas) {
    return null;
  }

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.translate(48, 48);

  const body = ctx.createRadialGradient(-8, -10, 6, 0, 0, 28);
  body.addColorStop(0, "#fff1a1");
  body.addColorStop(0.5, "#ff8c4f");
  body.addColorStop(1, "#7f2f17");

  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(0, 0, 22, 0, TAU);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.beginPath();
  ctx.arc(-6, -8, 7, 0, TAU);
  ctx.fill();

  ctx.strokeStyle = "#29140c";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(0, -22);
  ctx.lineTo(0, -34);
  ctx.stroke();

  ctx.strokeStyle = "#f6f0e8";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, -36, 5, 0, TAU);
  ctx.stroke();

  ctx.restore();
  return canvas;
}

function makeHazardSprite(kind = "spike") {
  const canvas = createOffscreen(96, 96);
  if (!canvas) {
    return null;
  }

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(48, 48);

  ctx.fillStyle = kind === "crusher" ? "#586374" : kind === "grinder" ? "#8a96a8" : "#6ca5ff";
  ctx.beginPath();
  ctx.arc(0, 0, 21, 0, TAU);
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.32)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, 14, 0, TAU);
  ctx.stroke();

  ctx.fillStyle = kind === "crusher" ? "#1f2832" : "#ffb347";
  for (let index = 0; index < 6; index += 1) {
    const angle = (index / 6) * TAU + 0.2;
    const radius = kind === "spike" ? 24 : 22;
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * 12, Math.sin(angle) * 12);
    ctx.lineTo(Math.cos(angle + 0.14) * radius, Math.sin(angle + 0.14) * radius);
    ctx.lineTo(Math.cos(angle - 0.14) * radius, Math.sin(angle - 0.14) * radius);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
  return canvas;
}

export class Renderer {
  constructor(ctx, options = {}) {
    this.ctx = ctx;
    this.width = options.width ?? ctx.canvas.width;
    this.height = options.height ?? ctx.canvas.height;
    this.assets = {
      turtle: makeTurtleSprite(),
      bomb: makeBombSprite(),
      hazard: makeHazardSprite("spike"),
      crusher: makeHazardSprite("crusher"),
      grinder: makeHazardSprite("grinder"),
    };
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
  }

  render(scene = {}) {
    const ctx = this.ctx;
    const width = scene.width ?? this.width ?? ctx.canvas.width;
    const height = scene.height ?? this.height ?? ctx.canvas.height;
    const time = scene.time ?? 0;

    ctx.save();
    ctx.clearRect(0, 0, width, height);
    this.drawBackground(width, height, time);
    this.drawParallax(scene, width, height, time);
    this.drawArena(scene, width, height);
    this.drawHazards(scene.hazards ?? [], height);
    this.drawBombs(scene.bombs ?? [], height);
    this.drawTarget(scene.target, width, height);
    this.drawTrajectory(scene.trajectory ?? null);
    this.drawProjectile(scene.projectile, width, height);
    this.drawOverlay(scene.overlay ?? null, width, height);
    ctx.restore();
  }

  drawBackground(width, height, time) {
    const ctx = this.ctx;
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, "#10243a");
    sky.addColorStop(0.45, "#07111c");
    sky.addColorStop(1, "#030507");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    const mist = ctx.createRadialGradient(width * 0.52, height * 0.18, 40, width * 0.52, height * 0.18, height * 0.55);
    mist.addColorStop(0, "rgba(98,232,196,0.16)");
    mist.addColorStop(0.45, "rgba(255,179,71,0.08)");
    mist.addColorStop(1, "rgba(255,179,71,0)");
    ctx.fillStyle = mist;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = "#62e8c4";
    for (let index = 0; index < 22; index += 1) {
      const x = ((index * 137.5 + time * 18) % (width + 120)) - 60;
      const y = 80 + (index % 7) * 32 + Math.sin(time * 0.6 + index) * 10;
      ctx.beginPath();
      ctx.arc(x, y, index % 4 === 0 ? 2.1 : 1.2, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  drawParallax(scene, width, height, time) {
    const ctx = this.ctx;
    const horizon = scene.horizonY ?? height * 0.42;
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1.5;
    for (let index = 0; index < 6; index += 1) {
      const y = horizon + index * 42;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    ctx.globalAlpha = 0.15;
    ctx.fillStyle = "#9bf37f";
    for (let index = 0; index < 8; index += 1) {
      const x = ((index * 287 + time * 42) % (width + 300)) - 150;
      const baseY = horizon - 90 + (index % 3) * 18;
      ctx.beginPath();
      ctx.moveTo(x - 24, baseY + 46);
      ctx.lineTo(x, baseY);
      ctx.lineTo(x + 28, baseY + 46);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  drawArena(scene, width, height) {
    const ctx = this.ctx;
    const floorY = scene.floorY ?? height * 0.88;
    ctx.save();
    const band = ctx.createLinearGradient(0, floorY - 44, 0, height);
    band.addColorStop(0, "rgba(255,255,255,0)");
    band.addColorStop(1, "rgba(255,255,255,0.08)");
    ctx.fillStyle = band;
    ctx.fillRect(0, floorY - 44, width, height - (floorY - 44));

    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(0, floorY, width, 2);
    ctx.restore();
  }

  drawTarget(target, width, height) {
    if (!target) {
      return;
    }

    const ctx = this.ctx;
    const radius = target.radius ?? 72;
    const x = target.x ?? width * 0.5;
    const y = target.y ?? height * 0.2;

    ctx.save();
    drawSoftGlow(ctx, x, y, radius * 2.2, "rgba(98,232,196,0.16)", "rgba(98,232,196,0)");
    ctx.lineWidth = clamp(radius * 0.15, 8, 12);
    ctx.strokeStyle = "rgba(98,232,196,0.92)";
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, TAU);
    ctx.stroke();

    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(255,179,71,0.78)";
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.72, 0, TAU);
    ctx.stroke();

    ctx.fillStyle = "#f6f0e8";
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  drawTrajectory(trajectory) {
    if (!trajectory || !trajectory.length) {
      return;
    }

    const ctx = this.ctx;
    ctx.save();
    ctx.setLineDash([12, 12]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255,179,71,0.58)";
    ctx.beginPath();
    ctx.moveTo(trajectory[0].x, trajectory[0].y);
    for (const point of trajectory) {
      ctx.lineTo(point.x, point.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  drawProjectile(projectile, width, height) {
    if (!projectile || !projectile.active) {
      return;
    }

    const ctx = this.ctx;
    const radius = projectile.radius ?? 15;
    const x = projectile.x ?? width * 0.5;
    const y = projectile.y ?? height * 0.5;
    const angle = projectile.angle ?? 0;
    const speed = Math.hypot(projectile.vx ?? 0, projectile.vy ?? 0);

    ctx.save();
    drawSoftGlow(ctx, x, y, 34, "rgba(255,255,255,0.92)", "rgba(98,232,196,0)");

    ctx.translate(x, y);
    ctx.rotate(angle + clamp((projectile.vx ?? 0) * 0.0006, -0.4, 0.4));

    if (this.assets.turtle) {
      const scale = clamp(0.72 + speed / 2400, 0.72, 1.05);
      ctx.scale(scale, scale);
      ctx.drawImage(this.assets.turtle, -64, -48);
    } else {
      ctx.fillStyle = "#f6f0e8";
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, TAU);
      ctx.fill();
    }

    ctx.restore();
  }

  drawBombs(bombs, height) {
    if (!Array.isArray(bombs)) {
      return;
    }

    for (const bomb of bombs) {
      if (!bomb || bomb.active === false) {
        continue;
      }

      const x = bomb.x ?? 0;
      const y = bomb.y ?? height * 0.5;
      const radius = bomb.radius ?? 28;
      const sprite = this.assets.bomb;

      this.ctx.save();
      drawSoftGlow(this.ctx, x, y, radius * 2.6, "rgba(255,179,71,0.22)", "rgba(255,179,71,0)");
      if (sprite) {
        const scale = radius / 22;
        this.ctx.translate(x, y);
        this.ctx.scale(scale, scale);
        this.ctx.drawImage(sprite, -48, -48);
      } else {
        this.ctx.fillStyle = "#ffb347";
        this.ctx.beginPath();
        this.ctx.arc(x, y, radius, 0, TAU);
        this.ctx.fill();
      }
      this.ctx.restore();
    }
  }

  drawHazards(hazards, height) {
    if (!Array.isArray(hazards)) {
      return;
    }

    for (const hazard of hazards) {
      if (!hazard || hazard.active === false) {
        continue;
      }

      const kind = hazard.kind ?? "spike";
      const sprite = this.assets[kind] ?? this.assets.hazard;
      const x = hazard.x ?? 0;
      const y = hazard.y ?? height * 0.5;
      const radius = hazard.radius ?? 32;

      this.ctx.save();
      drawSoftGlow(this.ctx, x, y, radius * 2.15, "rgba(132,247,255,0.16)", "rgba(132,247,255,0)");
      if (sprite) {
        const scale = radius / 21;
        this.ctx.translate(x, y);
        this.ctx.rotate((hazard.wobble ?? 0) * 0.08);
        this.ctx.scale(scale, scale);
        this.ctx.drawImage(sprite, -48, -48);
      } else {
        this.ctx.fillStyle = "#84f7ff";
        this.ctx.beginPath();
        this.ctx.arc(x, y, radius, 0, TAU);
        this.ctx.fill();
      }
      this.ctx.restore();
    }
  }

  drawOverlay(overlay, width, height) {
    if (!overlay) {
      return;
    }

    const ctx = this.ctx;
    const alpha = clamp(overlay.alpha ?? 1, 0, 1);
    if (alpha <= 0) {
      return;
    }

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = overlay.fill ?? "rgba(3,5,7,0.34)";
    ctx.fillRect(0, 0, width, height);
    if (overlay.title) {
      ctx.fillStyle = overlay.color ?? "#f6f0e8";
      ctx.font = overlay.font ?? "700 18px Trebuchet MS, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(overlay.title, width * 0.5, height * 0.14);
    }
    ctx.restore();
  }
}

export function createRenderer(ctx, options) {
  return new Renderer(ctx, options);
}
