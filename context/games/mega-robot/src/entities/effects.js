let nextEffectId = 1;

export function spawnHitEffect(x, y, kind = "hit") {
  return {
    id: `${kind}-${nextEffectId++}`,
    kind,
    x,
    y,
    age: 0,
    ttl: 0.35,
  };
}

export function updateEffects(effects, dt) {
  const alive = [];
  for (const effect of effects) {
    effect.age += dt;
    if (effect.age < effect.ttl) alive.push(effect);
  }
  return alive;
}
