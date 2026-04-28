const DEFAULT_BOUNDS = { left: 220, right: 760 };

let nextEnemyId = 1;

export function spawnSniperJoe(x, y, options = {}) {
  return {
    id: options.id ?? `sniper-${nextEnemyId++}`,
    type: "sniper-joe",
    x,
    y,
    vx: options.vx ?? 0,
    hp: options.hp ?? 3,
    shieldFacing: options.shieldFacing ?? -1,
    exposeTimer: options.exposeTimer ?? 0,
    exposeWindow: options.exposeWindow ?? 0,
    fireCooldown: options.fireCooldown ?? 1.2,
    attackIntent: null,
    weakpoint: { facing: options.shieldFacing ?? -1, exposed: false },
    bounds: { ...DEFAULT_BOUNDS, ...(options.bounds ?? {}) },
  };
}

export function createEnemyWave(index = 0) {
  return [
    spawnSniperJoe(340 + index * 24, 420, { shieldFacing: -1, exposeTimer: 0.8 }),
    spawnSniperJoe(640 - index * 20, 340, { shieldFacing: 1, exposeTimer: 1.2 }),
  ];
}

export function updateEnemies(enemies, dt, playerState, context = {}) {
  const shots = [];

  for (const enemy of enemies) {
    if (enemy.type !== "sniper-joe") continue;

    const playerSide = Math.sign(playerState.x - enemy.x) || enemy.shieldFacing;
    enemy.shieldFacing = playerSide < 0 ? -1 : 1;
    enemy.weakpoint.facing = enemy.shieldFacing;

    if (enemy.exposeTimer > 0) {
      enemy.exposeTimer = Math.max(0, enemy.exposeTimer - dt);
      enemy.attackIntent = { type: "shield-up", from: enemy.id, facing: enemy.shieldFacing };
      enemy.weakpoint.exposed = false;
      continue;
    }

    enemy.fireCooldown = Math.max(0, enemy.fireCooldown - dt);

    if (enemy.exposeWindow > 0) {
      enemy.exposeWindow = Math.max(0, enemy.exposeWindow - dt);
      enemy.weakpoint.exposed = true;
      enemy.attackIntent = { type: "exposed", from: enemy.id, facing: enemy.shieldFacing };
      if (enemy.fireCooldown === 0) {
        shots.push({
          from: enemy.id,
          kind: "sniper-shot",
          x: enemy.x,
          y: enemy.y - 10,
          vx: enemy.shieldFacing * 390,
          vy: 0,
          damage: 1,
          blockedByShield: true,
        });
        enemy.fireCooldown = 1.15;
      }
      if (enemy.exposeWindow === 0) {
        enemy.exposeTimer = context.recoverDelay ?? 1.3;
      }
      continue;
    }

    enemy.weakpoint.exposed = Math.abs(playerState.x - enemy.x) < 100 && Math.abs(playerState.y - enemy.y) < 72;
    enemy.attackIntent = { type: "charge", from: enemy.id, facing: enemy.shieldFacing };

    if (enemy.fireCooldown === 0) {
      enemy.exposeWindow = 0.55;
      enemy.attackIntent = { type: "open-shield", from: enemy.id, facing: enemy.shieldFacing };
      enemy.fireCooldown = 1.75;
    }
  }

  return { enemies, shots };
}
