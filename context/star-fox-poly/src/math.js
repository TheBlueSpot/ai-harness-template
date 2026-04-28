export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function vec2(x = 0, y = 0) {
  return { x, y };
}

export function add2(a, b) {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function scale2(v, s) {
  return { x: v.x * s, y: v.y * s };
}

export function length2(v) {
  return Math.hypot(v.x, v.y);
}

export function normalize2(v) {
  const len = length2(v) || 1;
  return { x: v.x / len, y: v.y / len };
}

export function distance2(a, b) {
  return length2({ x: a.x - b.x, y: a.y - b.y });
}

export function projectPoint(point, camera, width, height, perspective = 520) {
  const depth = Math.max(0.18, point.z - camera.z);
  const scale = perspective / (perspective + depth * 160);
  return {
    x: width * 0.5 + (point.x - camera.x) * scale,
    y: height * 0.5 + (point.y - camera.y) * scale - depth * 12,
    scale,
    depth,
  };
}
