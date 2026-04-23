export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const vec = (x = 0, y = 0) => ({ x, y });
export const add = (a, b) => vec(a.x + b.x, a.y + b.y);
export const sub = (a, b) => vec(a.x - b.x, a.y - b.y);
export const mul = (a, s) => vec(a.x * s, a.y * s);
export const dot = (a, b) => a.x * b.x + a.y * b.y;
export const len = (a) => Math.hypot(a.x, a.y);
export const norm = (a) => {
  const m = len(a) || 1;
  return vec(a.x / m, a.y / m);
};
export const perp = (a) => vec(-a.y, a.x);

export const lerp = (a, b, t) => a + (b - a) * t;
export const lerpVec = (a, b, t) => vec(lerp(a.x, b.x, t), lerp(a.y, b.y, t));

export const catmullRom = (p0, p1, p2, p3, t) => {
  const t2 = t * t;
  const t3 = t2 * t;
  return vec(
    0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
  );
};

export const catmullRomTangent = (p0, p1, p2, p3, t) => {
  const t2 = t * t;
  return vec(
    0.5 * ((-p0.x + p2.x) + 2 * (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t + 3 * (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t2),
    0.5 * ((-p0.y + p2.y) + 2 * (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t + 3 * (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t2)
  );
};
