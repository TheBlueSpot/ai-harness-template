export const TRACK_LENGTH = 5600;
export const CHECKPOINTS = [1700, 3400, TRACK_LENGTH];

const RAMPS = [
  { x: 420, width: 160, height: 44, airtime: 1.08 },
  { x: 980, width: 220, height: 62, airtime: 1.22 },
  { x: 1580, width: 180, height: 48, airtime: 1.15 },
  { x: 2320, width: 260, height: 74, airtime: 1.34 },
  { x: 3140, width: 200, height: 58, airtime: 1.2 },
  { x: 3940, width: 260, height: 82, airtime: 1.42 },
  { x: 4700, width: 180, height: 60, airtime: 1.24 },
];

const HAZARDS = [
  { x: 640, lane: 0, type: "rock" },
  { x: 720, lane: 2, type: "tree" },
  { x: 1280, lane: 1, type: "rock" },
  { x: 1420, lane: 2, type: "tree" },
  { x: 1920, lane: 0, type: "ice" },
  { x: 2080, lane: 1, type: "tree" },
  { x: 2760, lane: 2, type: "rock" },
  { x: 2920, lane: 0, type: "tree" },
  { x: 3520, lane: 1, type: "ice" },
  { x: 3680, lane: 0, type: "rock" },
  { x: 4260, lane: 2, type: "tree" },
  { x: 4460, lane: 1, type: "rock" },
  { x: 5040, lane: 0, type: "ice" },
  { x: 5200, lane: 2, type: "tree" },
];

const PICKUPS = [
  { x: 560, lane: 1, type: "boost" },
  { x: 1140, lane: 0, type: "boost" },
  { x: 1760, lane: 2, type: "boost" },
  { x: 2460, lane: 1, type: "boost" },
  { x: 3300, lane: 0, type: "boost" },
  { x: 4100, lane: 2, type: "boost" },
  { x: 4860, lane: 1, type: "boost" },
];

const GATES = [
  { x: 1180, width: 180 },
  { x: 2860, width: 220 },
  { x: 4520, width: 200 },
];

function triangleFalloff(distance, halfWidth) {
  const t = 1 - Math.abs(distance) / halfWidth;
  return Math.max(0, t);
}

export function sampleTerrain(x) {
  const clampedX = Math.max(0, Math.min(TRACK_LENGTH, x));
  let y =
    474 +
    Math.sin(clampedX / 180) * 28 +
    Math.sin(clampedX / 82) * 12 +
    Math.sin(clampedX / 420) * 48;

  for (const ramp of RAMPS) {
    const center = ramp.x + ramp.width * 0.5;
    const lift = triangleFalloff(clampedX - center, ramp.width * 0.5) * ramp.height;
    y -= lift;
  }

  return y;
}

export function sampleSlope(x) {
  const prev = sampleTerrain(x - 4);
  const next = sampleTerrain(x + 4);
  return (next - prev) / 8;
}

export function getRampAt(x) {
  return RAMPS.find((ramp) => x >= ramp.x && x <= ramp.x + ramp.width) ?? null;
}

export function getWindowObjects(centerX, distance = 900) {
  const min = centerX - distance * 0.35;
  const max = centerX + distance;

  return {
    ramps: RAMPS.filter((item) => item.x + item.width >= min && item.x <= max),
    hazards: HAZARDS.filter((item) => item.x >= min && item.x <= max),
    pickups: PICKUPS.filter((item) => item.x >= min && item.x <= max),
    gates: GATES.filter((item) => item.x >= min && item.x <= max),
  };
}

export function getTrackCatalog() {
  return {
    ramps: RAMPS,
    hazards: HAZARDS,
    pickups: PICKUPS,
    gates: GATES,
  };
}
