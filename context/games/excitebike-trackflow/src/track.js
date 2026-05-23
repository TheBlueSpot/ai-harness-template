export const TRACK = Object.freeze({
  length: 5200,
  finishX: 5000,
  maxLaps: 3,
  gravity: 1700,
  accel: 820,
  brake: 980,
  maxSpeed: 960,
  airTimeLimit: 0.92,
  crashLeanLimit: 0.82,
  mudDrag: 0.58,
});

export const segments = [
  { x: 0, y: 500, kind: "road", label: "start" },
  { x: 420, y: 492, kind: "road", label: "roll" },
  { x: 760, y: 460, kind: "jump", label: "first jump" },
  { x: 1160, y: 522, kind: "mud", label: "mud patch" },
  { x: 1620, y: 446, kind: "boost", label: "boost pad" },
  { x: 2080, y: 520, kind: "road", label: "rise" },
  { x: 2620, y: 434, kind: "jump", label: "triple crest" },
  { x: 3120, y: 500, kind: "mud", label: "soft bend" },
  { x: 3680, y: 456, kind: "boost", label: "late boost" },
  { x: 4360, y: 478, kind: "road", label: "home straight" },
  { x: 5200, y: 478, kind: "finish", label: "finish" },
];

export function sampleTrack(x) {
  const clamped = Math.max(0, Math.min(TRACK.length, x));
  return segmentAt(clamped).y;
}

export function segmentAt(x) {
  const clamped = Math.max(0, Math.min(TRACK.length, x));
  for (let i = 0; i < segments.length - 1; i += 1) {
    const left = segments[i];
    const right = segments[i + 1];
    if (clamped >= left.x && clamped <= right.x) {
      const t = (clamped - left.x) / Math.max(1, right.x - left.x);
      return {
        x: clamped,
        y: left.y + (right.y - left.y) * t,
        kind: left.kind,
        label: left.label,
        progress: (clamped - left.x) / Math.max(1, right.x - left.x),
        left,
        right,
      };
    }
  }
  const last = segments[segments.length - 1];
  return { x: clamped, y: last.y, kind: last.kind, label: last.label, progress: 1, left: last, right: last };
}

export function getTerrainEffect(x) {
  const segment = segmentAt(x);
  return {
    ...segment,
    isJump: segment.kind === "jump",
    isMud: segment.kind === "mud",
    isBoost: segment.kind === "boost",
    isFinish: segment.kind === "finish",
    traction: segment.kind === "mud" ? TRACK.mudDrag : 1,
    lift: segment.kind === "jump" ? 1 : 0,
    boost: segment.kind === "boost" ? 220 : 0,
  };
}

export function getFinishProgress(distance) {
  const lapDistance = Math.max(0, distance % TRACK.finishX);
  return Math.min(1, lapDistance / TRACK.finishX);
}

export function getJumpSegments() {
  return segments.filter((segment) => segment.kind === "jump");
}

export function getMudSegments() {
  return segments.filter((segment) => segment.kind === "mud");
}

export function getBoostPads() {
  return segments.filter((segment) => segment.kind === "boost");
}

export function isFinishLine(distance) {
  return distance >= TRACK.finishX;
}

export function getUpcomingFeature(distance) {
  return getUpcomingFeatures(distance, 1)[0] ?? null;
}

export function getUpcomingFeatures(distance, count = 2) {
  const lapDistance = Math.max(0, distance % TRACK.finishX);
  return segments
    .filter((segment) => segment.x > lapDistance + 80 && segment.kind !== "road" && segment.kind !== "finish")
    .slice(0, Math.max(1, count))
    .map((segment) => ({
      ...segment,
      distance: segment.x - lapDistance,
    }));
}
