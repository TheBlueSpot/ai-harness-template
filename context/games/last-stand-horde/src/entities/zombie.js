const ZOMBIE_TYPES = {
  walker: { speed: 52, health: 38, damage: 8, scent: 1, size: 16 },
  runner: { speed: 86, health: 24, damage: 6, scent: 1.25, size: 13 },
  brute: { speed: 36, health: 90, damage: 15, scent: 0.8, size: 22 },
};

export function createZombie(type = "walker", spawn = {}) {
  const profile = ZOMBIE_TYPES[type] ?? ZOMBIE_TYPES.walker;
  return {
    id: spawn.id ?? `zombie-${Math.random().toString(36).slice(2, 9)}`,
    type,
    x: spawn.x ?? 0,
    y: spawn.y ?? 0,
    vx: 0,
    vy: 0,
    speed: profile.speed,
    health: profile.health,
    maxHealth: profile.health,
    damage: profile.damage,
    scent: profile.scent,
    size: profile.size,
    dead: false,
    slowed: false,
    stagger: false,
    attackCooldown: 0,
    targetId: null,
    targetKind: "barricade",
    bodyState: { head: 1, torso: 1, limb: 1 },
  };
}

export function updateZombies(state, dt = 0) {
  for (const zombie of state.zombies) {
    if (zombie.dead) {
      continue;
    }
    const target = selectZombieTarget(state, zombie);
    zombie.targetId = target?.id ?? null;
    zombie.targetKind = target?.kind ?? "barricade";
    zombie.attackCooldown = Math.max(0, zombie.attackCooldown - dt);

    const dx = (target?.x ?? state.barricade.x) - zombie.x;
    const dy = (target?.y ?? state.barricade.y) - zombie.y;
    const step = normalize(dx, dy);
    const speed = zombie.speed * (zombie.slowed ? 0.68 : 1) * (zombie.stagger ? 0.8 : 1);
    zombie.vx = step.x * speed;
    zombie.vy = step.y * speed;
    zombie.x += zombie.vx * dt;
    zombie.y += zombie.vy * dt;
    zombie.y = Math.min(zombie.y, state.arena.groundY - 10);
    zombie.stagger = false;
  }
  return state.zombies;
}

export function selectZombieTarget(state, zombie) {
  const candidates = [];
  const player = state.player;
  if (player.health > 0) {
    candidates.push({
      kind: "player",
      id: "player",
      x: player.x,
      y: player.y,
      score: scentScore(zombie, player, zombie.scent + player.firingHeat * 1.6),
    });
  }
  const survivor = (state.survivors ?? []).find((entry) => !entry.dead);
  if (survivor) {
    candidates.push({
      kind: "survivor",
      id: survivor.id,
      x: survivor.x,
      y: survivor.y,
      score: scentScore(zombie, survivor, zombie.scent * 0.95),
    });
  }
  candidates.push({
    kind: "barricade",
    id: "barricade",
    x: state.barricade.x,
    y: state.barricade.y,
    score: scentScore(zombie, state.barricade, 0.7),
  });
  return candidates.sort((left, right) => left.score - right.score)[0];
}

function scentScore(from, target, scentWeight) {
  const dx = (target.x ?? 0) - (from.x ?? 0);
  const dy = (target.y ?? 0) - (from.y ?? 0);
  return Math.hypot(dx, dy) / Math.max(0.1, scentWeight);
}

function normalize(x, y) {
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
}
