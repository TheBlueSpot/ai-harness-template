export const WIDTH = 960;
export const HEIGHT = 640;
export const SUMMIT_Y = 7200;
export const START_TIME = 132;
export const MAX_LIVES = 3;
export const MAX_STAMINA = 100;
export const LEDGE_SPACING = 600;
export const LANE_X = [280, 400, 560, 680];
export const FACADE_LEFT = 180;
export const FACADE_RIGHT = 780;
export const ROW_HEIGHT = 120;
export const STAGE_BREAKS = [0, 1800, 3600, 5400, SUMMIT_Y];
export const STAGE_NAMES = ["Lobby Face", "Billboard Run", "Service Shafts", "Helipad Push"];

export function createLedges() {
  const ledges = [0];
  for (let y = LEDGE_SPACING; y <= SUMMIT_Y; y += LEDGE_SPACING) {
    ledges.push(y);
  }
  return ledges;
}

export function getBlockedLanes(rowIndex) {
  if (rowIndex < 5 || rowIndex % 6 === 0) {
    return [];
  }

  const blocked = [Math.abs((rowIndex * 3 + 1) % LANE_X.length)];
  if (rowIndex >= 18 && rowIndex % 5 === 0) {
    blocked.push((rowIndex + 1) % LANE_X.length);
  }
  if (rowIndex >= 32 && rowIndex % 6 === 0) {
    blocked.push((rowIndex + 2) % LANE_X.length);
  }

  return [...new Set(blocked)];
}

export function getPotLane(seed) {
  return Math.abs((seed * 5 + 3) % LANE_X.length);
}

export function getStageIndex(y) {
  if (y >= STAGE_BREAKS[3]) return 3;
  if (y >= STAGE_BREAKS[2]) return 2;
  if (y >= STAGE_BREAKS[1]) return 1;
  return 0;
}

export function getStageName(y) {
  return STAGE_NAMES[getStageIndex(y)];
}
