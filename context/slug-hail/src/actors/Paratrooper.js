function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalize(x, y, length = 1) {
  const mag = Math.hypot(x, y) || 1;
  return { x: (x / mag) * length, y: (y / mag) * length };
}

export class Paratrooper {
  constructor(x, y, plan, wave) {
    this.x = x;
    this.y = y;
    this.vx = plan.vx;
    this.vy = plan.vy;
    this.targetX = plan.targetX;
    this.targetY = plan.targetY;
    this.dropSpeed = plan.dropSpeed;
    this.radius = 18 + Math.min(8, wave * 0.8);
    this.maxHp = 2 + Math.floor(wave / 2);
    this.hp = this.maxHp;
    this.dead = false;
    this.landed = false;
    this.attackCooldown = 0.9 + Math.random() * 0.4;
    this.groundSpeed = 90 + wave * 8;
    this.color = plan.color;
  }

  get bounds() {
    return {
      x: this.x - this.radius,
      y: this.y - this.radius,
      w: this.radius * 2,
      h: this.radius * 2,
    };
  }

  update(dt, game) {
    if (this.dead) {
      return;
    }

    const terrain = game.terrain;
    if (!this.landed) {
      const drift = normalize(this.targetX - this.x, 0, 1);
      this.vx += drift.x * 40 * dt;
      this.vx = clamp(this.vx, -120, 120);
      this.vy = clamp(this.vy + this.dropSpeed * dt, 40, 180);
      this.x += this.vx * dt;
      this.y += this.vy * dt;

      const ground = terrain.sampleGroundHeight(this.x);
      if (this.y + this.radius >= ground - 6 || terrain.collideCircle(this, this.radius).length > 0) {
        this.landed = true;
        this.vy = 0;
      }
      return;
    }

    const toPlayer = normalize(game.player.x - this.x, game.player.y - this.y, 1);
    this.vx = toPlayer.x * this.groundSpeed;
    this.vy = toPlayer.y * this.groundSpeed;
    this.x = clamp(this.x + this.vx * dt, this.radius, game.world.width - this.radius);
    this.y = clamp(this.y + this.vy * dt, this.radius, game.world.height - this.radius);
    terrain.resolveCircle(this, this.radius + 4);

    this.attackCooldown -= dt;
    const distance = Math.hypot(game.player.x - this.x, game.player.y - this.y);
    if (this.attackCooldown <= 0 && distance < 860) {
      game.emit("enemy-fired", { x: this.x, y: this.y });
      const shot = normalize(game.player.x - this.x, game.player.y - this.y, 360 + game.waveDirector.wave * 8);
      game.bulletManager.spawn({
        x: this.x + shot.x * 16,
        y: this.y + shot.y * 16,
        vx: shot.x,
        vy: shot.y,
        owner: "enemy",
        radius: 4.4,
        damage: 1,
        terrainDamage: 1,
        projectileSpeed: 360 + game.waveDirector.wave * 8,
        color: "#ff7d73",
      });
      this.attackCooldown = 1.1 + Math.random() * 0.7;
    }
  }

  render(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    if (!this.landed) {
      ctx.strokeStyle = "rgba(232,240,255,0.7)";
      ctx.beginPath();
      ctx.moveTo(-14, -22);
      ctx.quadraticCurveTo(0, -34, 14, -22);
      ctx.stroke();
      ctx.strokeStyle = "rgba(232,240,255,0.45)";
      ctx.beginPath();
      ctx.moveTo(0, -22);
      ctx.lineTo(0, -4);
      ctx.stroke();
    }
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#22311b";
    ctx.fillRect(-this.radius * 0.35, -2, this.radius * 0.7, 4);
    ctx.restore();
  }
}
