export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0 || 1), 0, 1);
  return t * t * (3 - 2 * t);
}

export function wrap(value, min, max) {
  const span = max - min;
  if (span === 0) return min;
  let wrapped = (value - min) % span;
  if (wrapped < 0) wrapped += span;
  return wrapped + min;
}

