export function resolveCombat(state, dt = 0) {
  const impacts = [];
  const zombies = state.zombies ?? [];

  for (const shot of state.pendingShots) {
    const hit = findShotHit(shot, zombies);
    if (!hit) {
      continue;
    }
    const zone = rollHitZone(hit);
    const damage = applyHitZoneDamage(hit, zone, shot.damage ?? 0);
    impacts.push({ targetId: hit.id, zone, damage, x: hit.x, y: hit.y, type: "shot" });
    if (hit.dead) {
      state.score += hit.type === "brute" ? 25 : 10;
      state.scrap += hit.type === "brute" ? 2 : 1;
      state.message = hit.type === "brute" ? "Brute dropped. The lane opens up." : "Zombie dropped.";
    }
  }

  for (const swing of state.pendingMelee) {
    const hit = findMeleeHit(swing, zombies);
    if (!hit) {
      continue;
    }
    const damage = applyHitZoneDamage(hit, swing.zone ?? "torso", swing.damage ?? 0);
    impacts.push({ targetId: hit.id, zone: swing.zone ?? "torso", damage, x: hit.x, y: hit.y, type: "melee" });
    state.message = "Melee shove on the front line.";
  }

  state.pendingShots = [];
  state.pendingMelee = [];
  state.combatLog = impacts;
  state.lastCombatTick = (state.lastCombatTick ?? 0) + dt;
  return impacts;
}

export function applyHitZoneDamage(target, zone, damage) {
  if (!target || target.dead) {
    return 0;
  }

  const base = Math.max(0, Number(damage) || 0);
  switch (zone) {
    case "head":
      target.health = Math.max(0, target.health - base * 2.4);
      target.stagger = true;
      break;
    case "arm":
      target.health = Math.max(0, target.health - base * 0.75);
      target.bodyState.limb = Math.max(0, target.bodyState.limb - 0.2);
      target.slowed = true;
      break;
    case "leg":
      target.health = Math.max(0, target.health - base * 0.65);
      target.bodyState.limb = Math.max(0, target.bodyState.limb - 0.32);
      target.slowed = true;
      break;
    default:
      target.health = Math.max(0, target.health - base);
      break;
  }

  target.dead = target.health <= 0;
  return base;
}

function findShotHit(shot, zombies) {
  let best = null;
  for (const zombie of zombies) {
    if (zombie.dead) {
      continue;
    }
    const dx = zombie.x - shot.origin.x;
    const dy = zombie.y - shot.origin.y;
    const distance = Math.hypot(dx, dy);
    if (distance > (shot.range ?? 320)) {
      continue;
    }
    const alignment = dot(normalize(dx, dy), shot.aim ?? { x: 1, y: 0 });
    if (alignment < 1 - (shot.spread ?? 0.1)) {
      continue;
    }
    if (!best || distance < best.distance) {
      best = { zombie, distance };
    }
  }
  return best?.zombie ?? null;
}

function findMeleeHit(swing, zombies) {
  return zombies.find((zombie) => {
    if (zombie.dead) {
      return false;
    }
    return Math.hypot(zombie.x - swing.origin.x, zombie.y - swing.origin.y) <= (swing.range ?? 50);
  }) ?? null;
}

function rollHitZone(target) {
  const roll = Math.abs(Math.floor(target.x * 11 + target.y * 7 + target.health * 3)) % 100;
  if (roll < 24) {
    return "head";
  }
  if (roll < 62) {
    return "torso";
  }
  if (roll < 81) {
    return "arm";
  }
  return "leg";
}

function normalize(x, y) {
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
}

function dot(left, right) {
  return (left.x ?? 0) * (right.x ?? 0) + (left.y ?? 0) * (right.y ?? 0);
}
