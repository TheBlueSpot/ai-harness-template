const TAU = Math.PI * 2;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const random = (min, max) => min + Math.random() * (max - min);

function pickPalette(palette, fallback = ["#ffb347"]) {
  if (!Array.isArray(palette) || palette.length === 0) {
    return fallback;
  }
  return palette;
}

function resolveEventPalette(event) {
  if (event.palette) {
    return pickPalette(event.palette);
  }

  switch (event.type) {
    case "bombDetonation":
      return ["#ffe07a", "#ff6d4d", "#ffffff"];
    case "hazardHit":
      return ["#84f7ff", "#49bfff", "#e0ffff"];
    case "terrainContact":
      return event.hardHit
        ? ["#ffd26f", "#ff8f5a", "#fff3c4"]
        : ["#4b515b", "#75808d", "#b5c0cf"];
    default:
      return ["#ffb347", "#ffffff", "#ffe07a"];
  }
}

function resolveIntensity(event) {
  return clamp(event.intensity ?? event.power ?? 1, 0.15, 6);
}

class ParticleField {
  constructor() {
    this.items = [];
  }

  clear() {
    this.items.length = 0;
  }

  update(dt) {
    for (let index = this.items.length - 1; index >= 0; index -= 1) {
      const particle = this.items[index];
      particle.life -= dt;
      if (particle.life <= 0) {
        this.items.splice(index, 1);
        continue;
      }

      particle.vx += (particle.ax ?? 0) * dt;
      particle.vy += (particle.ay ?? 0) * dt;
      particle.vx *= Math.pow(particle.drag ?? 0.93, dt * 60);
      particle.vy *= Math.pow(particle.drag ?? 0.93, dt * 60);
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.spin += (particle.spinVelocity ?? 0) * dt;
      particle.alpha = clamp((particle.life / particle.maxLife) * (particle.fade ?? 1), 0, 1);
      particle.size = Math.max(0, particle.size + (particle.growth ?? 0) * dt);
      particle.hueShift = (particle.hueShift ?? 0) + dt * 0.8;
    }
  }

  draw(ctx) {
    for (const particle of this.items) {
      ctx.save();
      ctx.translate(particle.x, particle.y);
      ctx.rotate(particle.spin);
      ctx.globalAlpha = particle.alpha;
      ctx.fillStyle = particle.color;
      ctx.strokeStyle = particle.color;
      ctx.lineWidth = particle.lineWidth ?? 1;

      switch (particle.kind) {
        case "spark":
          ctx.fillRect(-particle.length * 0.5, -particle.size * 0.22, particle.length, particle.size * 0.44);
          ctx.fillRect(-particle.size * 0.22, -particle.length * 0.5, particle.size * 0.44, particle.length);
          break;
        case "shard":
          ctx.beginPath();
          ctx.moveTo(0, -particle.size);
          ctx.lineTo(particle.size * 0.72, 0);
          ctx.lineTo(0, particle.size * 1.15);
          ctx.lineTo(-particle.size * 0.68, 0);
          ctx.closePath();
          ctx.fill();
          break;
        case "ring":
          ctx.beginPath();
          ctx.arc(0, 0, particle.size, 0, TAU);
          ctx.stroke();
          break;
        case "smoke":
          ctx.globalAlpha *= 0.58;
          ctx.beginPath();
          ctx.arc(0, 0, particle.size, 0, TAU);
          ctx.fill();
          break;
        default:
          ctx.beginPath();
          ctx.arc(0, 0, particle.size, 0, TAU);
          ctx.fill();
          break;
      }

      ctx.restore();
    }
  }
}

export class ParticleSystem extends ParticleField {
  emit(event) {
    if (!event || !event.type) {
      return [];
    }

    const emitted = [];
    const palette = resolveEventPalette(event);
    const intensity = resolveIntensity(event);
    const x = event.x ?? 0;
    const y = event.y ?? 0;

    if (event.type === "terrainContact") {
      emitted.push(
        ...this.emitImpact({
          x,
          y,
          palette,
          intensity,
          spread: event.hardHit ? 1.4 : 0.9,
          count: event.hardHit ? 22 : 14,
          style: event.hardHit ? "burst" : "dust",
        }),
      );
      return emitted;
    }

    if (event.type === "hazardHit") {
      emitted.push(
        ...this.emitImpact({
          x,
          y,
          palette,
          intensity,
          spread: 1.15,
          count: 18,
          style: "electric",
        }),
      );
      return emitted;
    }

    if (event.type === "bombDetonation") {
      emitted.push(
        ...this.emitImpact({
          x,
          y,
          palette,
          intensity: intensity * 1.35,
          spread: 1.7,
          count: 30,
          style: "detonation",
        }),
      );
      return emitted;
    }

    if (event.type === "blastChain") {
      emitted.push(
        ...this.emitImpact({
          x,
          y,
          palette,
          intensity: intensity * 0.8,
          spread: 1.05,
          count: 10,
          style: "chain",
        }),
      );
      return emitted;
    }

    emitted.push(
      ...this.emitImpact({
        x,
        y,
        palette,
        intensity,
        spread: 1,
        count: 12,
        style: "burst",
      }),
    );
    return emitted;
  }

  emitImpact({
    x,
    y,
    palette,
    intensity = 1,
    spread = 1,
    count = 16,
    style = "burst",
  }) {
    const colors = pickPalette(palette, ["#ffb347"]);
    const particles = [];
    const burstCount = Math.max(4, Math.round(count * intensity));

    for (let index = 0; index < burstCount; index += 1) {
      const angle = random(0, TAU);
      const speed = random(110, 420) * intensity * spread;
      const color = colors[index % colors.length];
      const kind = index % 5 === 0 ? "spark" : index % 3 === 0 ? "shard" : "glow";
      const length = random(8, 26) * intensity;
      const size = random(1.8, 6.4) * intensity;
      const life = random(0.24, 0.76) * (0.7 + intensity * 0.12);

      const particle = {
        kind,
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        ax: 0,
        ay: style === "smoke" ? -18 : 0,
        life,
        maxLife: life,
        size: kind === "spark" ? size * 0.75 : size,
        length,
        growth: kind === "smoke" ? random(8, 22) : random(-2.2, 1.4),
        drag: style === "electric" ? 0.88 : 0.84,
        spin: random(0, TAU),
        spinVelocity: random(-8, 8),
        alpha: 1,
        color,
        fade: style === "dust" ? 0.82 : 1,
      };

      if (style === "detonation") {
        particle.kind = index % 4 === 0 ? "ring" : particle.kind;
        particle.vx *= 0.85;
        particle.vy *= 0.85;
        particle.drag = 0.81;
        particle.growth = random(2, 9);
      } else if (style === "chain") {
        particle.kind = index % 2 === 0 ? "spark" : "shard";
        particle.length *= 0.8;
        particle.size *= 0.9;
      } else if (style === "dust") {
        particle.kind = "smoke";
        particle.drag = 0.92;
        particle.growth = random(12, 24);
        particle.vx *= 0.35;
        particle.vy *= 0.35;
      }

      this.items.push(particle);
      particles.push(particle);
    }

    return particles;
  }

  emitTrail(x, y, vx, vy, palette = ["#62e8c4", "#ffb347"]) {
    const speed = Math.hypot(vx, vy);
    const count = speed > 420 ? 3 : 2;
    const colors = pickPalette(palette, ["#62e8c4"]);
    const emitted = [];

    for (let index = 0; index < count; index += 1) {
      const color = colors[index % colors.length];
      const particle = {
        kind: index === 0 ? "glow" : "spark",
        x: x + random(-3, 3),
        y: y + random(-3, 3),
        vx: -vx * random(0.025, 0.06) + random(-30, 30),
        vy: -vy * random(0.025, 0.06) + random(-30, 30),
        ax: 0,
        ay: 0,
        life: random(0.14, 0.28),
        maxLife: 0.28,
        size: random(1.6, 3.6),
        length: random(5, 15),
        growth: random(0.4, 1.2),
        drag: 0.9,
        spin: random(0, TAU),
        spinVelocity: random(-3, 3),
        alpha: 1,
        color,
        fade: 1,
      };

      this.items.push(particle);
      emitted.push(particle);
    }

    return emitted;
  }
}

export function createParticleSystem() {
  return new ParticleSystem();
}
