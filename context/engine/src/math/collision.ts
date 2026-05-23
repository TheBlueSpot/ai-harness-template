export type RectLike = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type CircleLike = {
  x: number;
  y: number;
  r: number;
};

export type Vec2 = {
  x: number;
  y: number;
};

export type RayBox = RectLike | readonly [x: number, y: number, w: number, h: number];

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function rectsOverlap(a: RectLike, b: RectLike) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function testOverlapRect(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number
) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

export function testOverlapCircle(ax: number, ay: number, ar: number, bx: number, by: number, br: number) {
  const dx = ax - bx;
  const dy = ay - by;
  const radius = ar + br;
  return dx * dx + dy * dy <= radius * radius;
}

export function pointInRect(px: number, py: number, rx: number, ry: number, rw: number, rh: number) {
  return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;
}

export function circleRectOverlap(circle: CircleLike, rect: RectLike) {
  const closestX = clamp(circle.x, rect.x, rect.x + rect.w);
  const closestY = clamp(circle.y, rect.y, rect.y + rect.h);
  const dx = circle.x - closestX;
  const dy = circle.y - closestY;
  return dx * dx + dy * dy <= circle.r * circle.r;
}

export function vecDistance(x1: number, y1: number, x2: number, y2: number) {
  return Math.hypot(x2 - x1, y2 - y1);
}

export function vecAngle(x1: number, y1: number, x2: number, y2: number) {
  return Math.atan2(y2 - y1, x2 - x1);
}

export function vecNormalize<T extends Vec2 = Vec2>(x: number, y: number, out: T = { x: 0, y: 0 } as T) {
  const length = Math.hypot(x, y);
  if (length === 0) {
    out.x = 0;
    out.y = 0;
    return out;
  }
  out.x = x / length;
  out.y = y / length;
  return out;
}

export function rayIntersectRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number
) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let tMin = 0;
  let tMax = 1;

  if (dx === 0) {
    if (x1 < rx || x1 > rx + rw) return false;
  } else {
    const tx1 = (rx - x1) / dx;
    const tx2 = (rx + rw - x1) / dx;
    tMin = Math.max(tMin, Math.min(tx1, tx2));
    tMax = Math.min(tMax, Math.max(tx1, tx2));
  }

  if (dy === 0) {
    if (y1 < ry || y1 > ry + rh) return false;
  } else {
    const ty1 = (ry - y1) / dy;
    const ty2 = (ry + rh - y1) / dy;
    tMin = Math.max(tMin, Math.min(ty1, ty2));
    tMax = Math.min(tMax, Math.max(ty1, ty2));
  }

  return tMin <= tMax;
}

export function rayIntersectMap(x1: number, y1: number, x2: number, y2: number, boxes: readonly RayBox[]) {
  for (let i = 0; i < boxes.length; i += 1) {
    const box = boxes[i];
    if (Array.isArray(box)) {
      if (rayIntersectRect(x1, y1, x2, y2, box[0], box[1], box[2], box[3])) return true;
    } else {
      const rect = box as RectLike;
      if (rayIntersectRect(x1, y1, x2, y2, rect.x, rect.y, rect.w, rect.h)) {
        return true;
      }
    }
  }
  return false;
}
