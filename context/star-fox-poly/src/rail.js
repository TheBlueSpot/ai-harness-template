import { clamp, lerp } from "./math.js";

export const RAIL_LENGTH = 5400;
export const LANE_COUNT = 5;
export const LANE_WIDTH = 96;

const SEGMENTS = [
  { start: 0, end: 700, lane: 2, curve: 0 },
  { start: 700, end: 1600, lane: 1, curve: -0.12 },
  { start: 1600, end: 2500, lane: 3, curve: 0.1 },
  { start: 2500, end: 3300, lane: 2, curve: 0 },
  { start: 3300, end: 4100, lane: 1, curve: -0.18 },
  { start: 4100, end: 4900, lane: 3, curve: 0.16 },
  { start: 4900, end: RAIL_LENGTH, lane: 2, curve: 0 },
];

export const OBSTACLE_POSITIONS = [
  { z: 760, lane: 1, kind: "barrier" },
  { z: 1180, lane: 3, kind: "drone" },
  { z: 1520, lane: 0, kind: "barrier" },
  { z: 2050, lane: 4, kind: "turret" },
  { z: 2680, lane: 2, kind: "drone" },
  { z: 3460, lane: 1, kind: "turret" },
  { z: 4060, lane: 3, kind: "barrier" },
  { z: 4680, lane: 2, kind: "drone" },
];

export function getRailSegment(progress) {
  const z = clamp(progress, 0, RAIL_LENGTH);
  return SEGMENTS.find((segment) => z >= segment.start && z < segment.end) ?? SEGMENTS[SEGMENTS.length - 1];
}

export function laneToX(lane, sway = 0) {
  return (clamp(lane, 0, LANE_COUNT - 1) - (LANE_COUNT - 1) * 0.5 + sway) * LANE_WIDTH;
}

export function computeRailOffset(progress) {
  const segment = getRailSegment(progress);
  const span = segment.end - segment.start || 1;
  const t = clamp((progress - segment.start) / span, 0, 1);
  return {
    lane: segment.lane,
    sway: lerp(segment.curve * 0.5, segment.curve, t),
  };
}

export function progressToStage(progress) {
  return clamp(progress / RAIL_LENGTH, 0, 1);
}

export function getObstacleWindow(progress, lookAhead = 240) {
  return OBSTACLE_POSITIONS.filter((obstacle) => obstacle.z >= progress && obstacle.z <= progress + lookAhead);
}
