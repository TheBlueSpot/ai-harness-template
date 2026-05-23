let nextProjectileId = 1;

function makeProjectile(base) {
  return {
    id: `${base.type}-${nextProjectileId++}`,
    active: true,
    ttl: 3,
    owner: "player",
    type: "shot",
    damage: 1,
    ...base,
  };
}

export function spawnPlayerShot(origin, facing = 1, weaponId = "buster") {
  const speed = weaponId === "sniper" ? 540 : 420;
  const damage = weaponId === "sniper" ? 2 : 1;
  const shot = makeProjectile({
    owner: "player",
    type: weaponId,
    x: origin.x + facing * 18,
    y: origin.y - 6,
    vx: facing * speed,
    vy: 0,
    damage,
  });
  return shot;
}

export function spawnEnemyShot(origin, aim = 1, mode = "patrol") {
  const speed = mode === "sniper" ? 300 : 240;
  return makeProjectile({
    owner: "enemy",
    type: mode,
    x: origin.x,
    y: origin.y,
    vx: aim * speed,
    vy: 0,
    damage: 1,
  });
}

export function updateProjectiles(projectiles, dt, bounds) {
  const alive = [];
  for (const projectile of projectiles) {
    projectile.ttl -= dt;
    projectile.x += projectile.vx * dt;
    projectile.y += projectile.vy * dt;
    const inBounds = projectile.x > -40 && projectile.x < bounds.width + 40 && projectile.y > -40 && projectile.y < bounds.height + 40;
    if (projectile.ttl > 0 && inBounds) {
      alive.push(projectile);
    }
  }
  return alive;
}
