function rectsIntersect(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export class BulletManager {
  constructor(terrain, emit, makeBroadphase) {
    this.terrain = terrain;
    this.emit = emit;
    this.makeBroadphase = makeBroadphase;
    this.bullets = [];
  }

  reset() {
    this.bullets.length = 0;
  }

  spawn(config) {
    const speed = config.projectileSpeed || Math.hypot(config.vx, config.vy) || 1;
    const mag = Math.hypot(config.vx, config.vy) || 1;
    this.bullets.push({
      x: config.x,
      y: config.y,
      vx: (config.vx / mag) * speed,
      vy: (config.vy / mag) * speed,
      radius: config.radius,
      owner: config.owner,
      damage: config.damage,
      terrainDamage: config.terrainDamage,
      color: config.color,
      life: config.owner === "player" ? 1.4 : 1.8,
      dead: false,
      bounds: {
        x: config.x - config.radius,
        y: config.y - config.radius,
        w: config.radius * 2,
        h: config.radius * 2,
      },
    });
  }

  update(dt, game) {
    const enemyTree = this.makeBroadphase(game.enemies);
    for (const bullet of this.bullets) {
      if (bullet.dead) {
        continue;
      }
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.life -= dt;
      bullet.bounds.x = bullet.x - bullet.radius;
      bullet.bounds.y = bullet.y - bullet.radius;

      if (bullet.life <= 0) {
        bullet.dead = true;
        continue;
      }

      if (bullet.owner === "player") {
        const nearby = enemyTree.retrieve(bullet.bounds, []);
        for (const enemy of nearby) {
          if (enemy.dead || !rectsIntersect(bullet.bounds, enemy.bounds)) {
            continue;
          }
          enemy.hp -= bullet.damage;
          bullet.dead = true;
          this.emit("enemy-hit", { x: bullet.x, y: bullet.y, enemy });
          if (enemy.hp <= 0) {
            enemy.dead = true;
            this.emit("enemy-killed", { x: enemy.x, y: enemy.y, enemy });
          }
          break;
        }
      } else if (rectsIntersect(bullet.bounds, game.player.bounds) && game.player.damage(bullet.damage)) {
        bullet.dead = true;
        this.emit("player-hit", { x: game.player.x, y: game.player.y, amount: bullet.damage });
      }

      if (bullet.dead) {
        continue;
      }

      const terrainHits = this.terrain.damageCircle(bullet.x, bullet.y, bullet.radius + 4, bullet.terrainDamage);
      if (terrainHits.length > 0) {
        bullet.dead = true;
        this.emit("terrain-hit", { x: bullet.x, y: bullet.y, hits: terrainHits });
      }
    }
    this.bullets = this.bullets.filter((bullet) => !bullet.dead);
  }

  render(ctx) {
    for (const bullet of this.bullets) {
      ctx.fillStyle = bullet.color;
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
