export const createFxSystem = () => ({
  particles: [],
  spawn(x, y, color, count = 8) {
    for (let index = 0; index < count; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 140;
      const life = 0.4 + Math.random() * 0.5;
      this.particles.push({
        kind: "spark",
        sprite: "particle",
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        rotation: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 5,
        size: 0.8 + Math.random() * 0.6,
        color
      });
    }
  },
  spawnPulse(x, y, color, count = 10) {
    this.spawn(x, y, color, count);
  },
  spawnSpiritDeath(x, y, count = 30) {
    for (let index = 0; index < count; index += 1) {
      const angle = (index / count) * Math.PI * 2 + Math.random() * 0.35;
      const speed = 24 + Math.random() * 110;
      const drift = -20 - Math.random() * 90;
      const life = 0.65 + Math.random() * 0.55;
      this.particles.push({
        kind: "spirit",
        sprite: index % 3 === 0 ? "spirit-smoke" : "particle",
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed + drift,
        life,
        maxLife: life,
        rotation: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 8,
        size: 0.9 + Math.random() * 1.6,
        color: index % 2 === 0 ? "#d7fff6" : "#95d7ff"
      });
    }
  },
  update(dt) {
    for (let index = this.particles.length - 1; index >= 0; index -= 1) {
      const particle = this.particles[index];
      particle.life -= dt;
      if (particle.life <= 0) {
        this.particles.splice(index, 1);
        continue;
      }

      const age = 1 - particle.life / particle.maxLife;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= particle.kind === "spirit" ? 0.95 : 0.96;
      particle.vy *= particle.kind === "spirit" ? 0.94 : 0.96;
      particle.rotation += particle.spin * dt;
      if (particle.kind === "spirit") {
        particle.y -= 18 * dt * (0.25 + age);
      }
    }
  },
  render(ctx, assets) {
    for (const particle of this.particles) {
      const sprite = assets.images[particle.sprite];
      const alpha = Math.max(0, particle.life / particle.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha;
      if (particle.kind === "spirit") {
        ctx.globalCompositeOperation = "lighter";
      }

      if (sprite) {
        const size = (particle.size ?? 1) * (particle.kind === "spirit" ? 14 : 8);
        ctx.translate(particle.x, particle.y);
        ctx.rotate(particle.rotation);
        ctx.drawImage(sprite, -size * 0.5, -size * 0.5, size, size);
      } else {
        ctx.fillStyle = particle.color;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.kind === "spirit" ? 3.5 : 2.25, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }
});
