import { clamp, normalize, randRange } from "./math.js";

const TAU = Math.PI * 2;

const randomBetween = (min, max) => min + Math.random() * (max - min);

const baseParticle = (overrides = {}) => ({
  age: 0,
  alpha: 1,
  additive: false,
  color: "#ffffff",
  drag: 0.96,
  gravity: 0,
  kind: "spark",
  life: 0.5,
  length: 0,
  size: 3,
  spin: 0,
  spinVelocity: 0,
  vx: 0,
  vy: 0,
  x: 0,
  y: 0,
  ...overrides,
});

export class ParticleSystem {
  constructor() {
    this.items = [];
  }

  clear() {
    this.items.length = 0;
  }

  spawn(particle) {
    this.items.push(baseParticle(particle));
  }

  update(dt) {
    for (let index = this.items.length - 1; index >= 0; index -= 1) {
      const particle = this.items[index];
      particle.age += dt;
      if (particle.age >= particle.life) {
        this.items.splice(index, 1);
        continue;
      }

      particle.vx *= Math.pow(particle.drag, dt * 60);
      particle.vy = particle.vy * Math.pow(particle.drag, dt * 60) + particle.gravity * dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.spin += particle.spinVelocity * dt;
    }
  }

  emitExplosion(x, y, radius = 28, color = "#ff8f7c", intensity = 1, kind = "explosion") {
    const size = Math.max(18, radius * 0.9);
    this.spawn({
      kind: "flash",
      x,
      y,
      life: 0.16 + intensity * 0.08,
      size,
      color,
      alpha: 0.95,
      additive: true,
    });

    const sparkCount = Math.max(8, Math.round(12 * intensity));
    for (let index = 0; index < sparkCount; index += 1) {
      const angle = randomBetween(0, TAU);
      const speed = randomBetween(radius * 4.5, radius * 9.5) * (0.75 + intensity * 0.25);
      const spread = randomBetween(-0.7, 0.7);
      this.spawn({
        kind: "spark",
        x,
        y,
        vx: Math.cos(angle + spread) * speed,
        vy: Math.sin(angle + spread) * speed - radius * 0.8,
        life: randomBetween(0.24, 0.56),
        size: randomBetween(1.4, 2.9),
        color,
        drag: 0.9,
        gravity: 240,
        spinVelocity: randomBetween(-8, 8),
        additive: true,
      });
    }

    const smokeCount = kind === "terrain" ? Math.max(6, Math.round(9 * intensity)) : Math.max(4, Math.round(5 * intensity));
    for (let index = 0; index < smokeCount; index += 1) {
      this.spawn({
        kind: "smoke",
        x: x + randRange(-radius * 0.3, radius * 0.3),
        y: y + randRange(-radius * 0.2, radius * 0.2),
        vx: randRange(-22, 22),
        vy: randRange(-60, -14),
        life: randomBetween(0.76, 1.35),
        size: randomBetween(radius * 0.12, radius * 0.26),
        color: kind === "terrain" ? "rgba(128, 107, 85, 0.92)" : "rgba(255, 198, 190, 0.9)",
        drag: 0.94,
        gravity: -16,
        alpha: 0.42,
      });
    }
  }

  emitThrust(x, y, directionX, directionY, intensity = 1, color = "#76d7ff") {
    const back = normalize(-directionX, -directionY);
    const sideways = { x: -back.y, y: back.x };
    const count = Math.max(3, Math.round(4 * intensity));

    for (let index = 0; index < count; index += 1) {
      const lateral = randomBetween(-0.8, 0.8);
      const speed = randomBetween(120, 240) * (0.75 + intensity * 0.45);
      this.spawn({
        kind: "thrust",
        x: x + back.x * randomBetween(2, 8),
        y: y + back.y * randomBetween(2, 8),
        vx: back.x * speed + sideways.x * lateral * 52 + randRange(-16, 16),
        vy: back.y * speed + sideways.y * lateral * 52 + randRange(-16, 16),
        life: randomBetween(0.18, 0.36),
        size: randomBetween(2.5, 4.8),
        length: randomBetween(14, 30),
        color,
        drag: 0.88,
        gravity: 24,
        alpha: 0.9,
        additive: true,
      });
    }
  }

  emitImpact(x, y, normalX = 0, normalY = -1, intensity = 1, color = "#76d7ff") {
    const normal = normalize(normalX, normalY);
    const tangent = { x: -normal.y, y: normal.x };
    const sparkCount = Math.max(4, Math.round(6 * intensity));

    for (let index = 0; index < sparkCount; index += 1) {
      const forward = randomBetween(100, 280) * (0.7 + intensity * 0.35);
      const scatter = randomBetween(-110, 110);
      this.spawn({
        kind: "spark",
        x,
        y,
        vx: normal.x * forward + tangent.x * scatter,
        vy: normal.y * forward + tangent.y * scatter,
        life: randomBetween(0.18, 0.48),
        size: randomBetween(1.3, 2.4),
        color,
        drag: 0.9,
        gravity: 210,
        additive: true,
      });
    }

    this.spawn({
      kind: "flash",
      x,
      y,
      life: 0.12 + intensity * 0.05,
      size: Math.max(10, intensity * 14),
      color,
      alpha: 0.78,
      additive: true,
    });
  }

  emitTerrainDebris(x, y, intensity = 1, color = "rgba(146, 122, 90, 0.96)") {
    const count = Math.max(5, Math.round(7 * intensity));
    for (let index = 0; index < count; index += 1) {
      const angle = randomBetween(Math.PI * 0.9, Math.PI * 2.1);
      const speed = randomBetween(60, 220) * (0.65 + intensity * 0.35);
      this.spawn({
        kind: "debris",
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - randomBetween(40, 120),
        life: randomBetween(0.45, 1.0),
        size: randomBetween(1.8, 4.8),
        color,
        drag: 0.84,
        gravity: 420,
        spinVelocity: randomBetween(-12, 12),
      });
    }
  }
}
