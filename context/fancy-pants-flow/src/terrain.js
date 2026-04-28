export const COURSE_LENGTH = 6200;
export const CANVAS_WIDTH = 1280;
export const CANVAS_HEIGHT = 720;

const checkpointXs = [0, 1550, 3220, 4780];

export function getCheckpointLabel(x) {
  if (x < checkpointXs[1]) {
    return "Park";
  }
  if (x < checkpointXs[2]) {
    return "Hills";
  }
  if (x < checkpointXs[3]) {
    return "Tunnels";
  }
  return "Final Stretch";
}

export function getTerrainHeight(x) {
  const clamped = Math.max(0, Math.min(COURSE_LENGTH, x));
  let y =
    520 +
    Math.sin(clamped / 260) * 78 +
    Math.sin(clamped / 95) * 12 +
    Math.sin((clamped - 1100) / 310) * 46;

  y -= ridge(clamped, 600, 480, 130);
  y += valley(clamped, 1550, 620, 170);
  y -= ridge(clamped, 2380, 540, 150);
  y += valley(clamped, 3300, 520, 140);
  y -= ridge(clamped, 4200, 700, 160);
  y += valley(clamped, 4950, 360, 120);
  y -= ridge(clamped, 5650, 440, 145);

  return y;
}

export function getTerrainSlope(x) {
  const sample = 2;
  return (getTerrainHeight(x + sample) - getTerrainHeight(x - sample)) / (sample * 2);
}

export function getTerrainNormal(x) {
  const slope = getTerrainSlope(x);
  const length = Math.hypot(-slope, 1) || 1;
  return { x: -slope / length, y: 1 / length };
}

function ridge(x, center, radius, height) {
  const distance = Math.abs(x - center);
  if (distance >= radius) {
    return 0;
  }
  const t = distance / radius;
  return Math.cos(t * Math.PI * 0.5) ** 2 * height;
}

function valley(x, center, radius, depth) {
  const distance = Math.abs(x - center);
  if (distance >= radius) {
    return 0;
  }
  const t = distance / radius;
  return Math.cos(t * Math.PI * 0.5) ** 2 * depth;
}

export function buildCollectibles() {
  return [
    at(340, -90),
    at(510, -120),
    at(710, -80),
    at(1160, -96),
    at(1450, -110),
    at(1730, -130),
    at(1980, -100),
    at(2440, -120),
    at(2650, -98),
    at(3090, -150),
    at(3470, -116),
    at(3890, -92),
    at(4380, -130),
    at(4710, -96),
    at(5160, -118),
    at(5520, -104),
    at(5940, -86),
  ];
}

function at(x, offsetY) {
  return { x, y: getTerrainHeight(x) + offsetY, radius: 18, taken: false };
}

