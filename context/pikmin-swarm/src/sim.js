export function moveToward(unit, target, speed, dt) {
  const dx = target.x - unit.x;
  const dy = target.y - unit.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.0001) return { ...unit, vx: 0, vy: 0 };
  const travel = Math.min(dist, speed * dt);
  const nx = dx / dist;
  const ny = dy / dist;
  return {
    ...unit,
    x: unit.x + nx * travel,
    y: unit.y + ny * travel,
    vx: nx * speed,
    vy: ny * speed,
  };
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function nearestBy(list, origin, filterFn) {
  let best = null;
  let bestDistance = Infinity;
  for (const item of list) {
    if (filterFn && !filterFn(item)) continue;
    const d = distance(item, origin);
    if (d < bestDistance) {
      bestDistance = d;
      best = item;
    }
  }
  return best;
}

export function projectPoint(origin, angle, distanceValue) {
  return {
    x: origin.x + Math.cos(angle) * distanceValue,
    y: origin.y + Math.sin(angle) * distanceValue,
  };
}
