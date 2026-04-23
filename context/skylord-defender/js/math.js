export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const lerp = (a, b, t) => a + (b - a) * t;

export const randRange = (min, max) => min + Math.random() * (max - min);

export const randInt = (min, max) => Math.floor(randRange(min, max + 1));

export const distanceSq = (ax, ay, bx, by) => {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
};

export const distance = (ax, ay, bx, by) => Math.sqrt(distanceSq(ax, ay, bx, by));

export const normalize = (x, y) => {
  const length = Math.hypot(x, y);
  if (length <= 0.00001) {
    return { x: 0, y: -1 };
  }
  return { x: x / length, y: y / length };
};

export const pointToAngle = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);

export const wrap = (value, min, max) => {
  const span = max - min;
  if (span <= 0) {
    return min;
  }
  let next = value;
  while (next < min) next += span;
  while (next >= max) next -= span;
  return next;
};
