export const TRACK_LENGTH = 4800;
export const FINISH_DISTANCE = 4300;
export const SEGMENT_LENGTH = 40;
export const ROAD_HALF_WIDTH = 320;
export const CHECKPOINTS = [650, 1350, 2150, 3000, 3800, FINISH_DISTANCE];

export const RIVALS = [
  { name: "Rook", distance: 250, lane: -0.26, speed: 192, color: "#ff8a5c" },
  { name: "Hex", distance: 920, lane: 0.24, speed: 198, color: "#66d6ff" },
  { name: "Vanta", distance: 1820, lane: -0.18, speed: 204, color: "#ffd166" },
  { name: "Sable", distance: 2760, lane: 0.14, speed: 210, color: "#d49bff" },
];

export function getRoadCenter(distance) {
  return (
    Math.sin(distance * 0.0032) * 140 +
    Math.sin(distance * 0.0071 + 1.2) * 84 +
    Math.sin(distance * 0.0145 + 0.55) * 28
  );
}

export function getRoadCurve(distance) {
  return (
    Math.cos(distance * 0.0032) * 0.48 +
    Math.cos(distance * 0.0071 + 1.2) * 0.34 +
    Math.cos(distance * 0.0145 + 0.55) * 0.2
  );
}

export function getTrafficDensity(distance) {
  if (distance < 900) return 0.4;
  if (distance < 2200) return 0.7;
  if (distance < 3400) return 1;
  return 1.18;
}

export function getTrafficPhase(distance) {
  if (distance < 1300) return "Traffic light";
  if (distance < 2800) return "Traffic thick";
  return "Traffic redline";
}
