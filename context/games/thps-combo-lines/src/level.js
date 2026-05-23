const ramps = [
  { id: "start-roll", x: 80, y: 416, w: 112, h: 22, type: "ramp", launch: 1.04 },
  { id: "bank-pop", x: 250, y: 376, w: 124, h: 28, type: "ramp", launch: 1.18 },
  { id: "spine-kick", x: 690, y: 398, w: 136, h: 30, type: "ramp", launch: 1.24 },
  { id: "hip-boost", x: 1040, y: 352, w: 126, h: 34, type: "ramp", launch: 1.34 },
  { id: "gap-floater", x: 1360, y: 328, w: 140, h: 36, type: "ramp", launch: 1.42 },
  { id: "finisher-lip", x: 1910, y: 318, w: 164, h: 42, type: "ramp", launch: 1.5 },
];

const rails = [
  { id: "rail-a", x: 206, y: 312, w: 176, h: 10, type: "rail" },
  { id: "rail-b", x: 568, y: 294, w: 212, h: 10, type: "rail" },
  { id: "rail-c", x: 930, y: 260, w: 186, h: 10, type: "rail" },
  { id: "rail-d", x: 1270, y: 238, w: 222, h: 10, type: "rail" },
  { id: "rail-e", x: 1710, y: 248, w: 248, h: 10, type: "rail" },
];

const landingZones = [
  { id: "manual-pad-1", x: 148, y: 448, w: 188, h: 18, type: "manual" },
  { id: "manual-pad-2", x: 462, y: 448, w: 172, h: 18, type: "manual" },
  { id: "manual-pad-3", x: 820, y: 448, w: 174, h: 18, type: "manual" },
  { id: "manual-pad-4", x: 1170, y: 448, w: 198, h: 18, type: "manual" },
  { id: "manual-pad-5", x: 1608, y: 448, w: 196, h: 18, type: "manual" },
];

const pickups = [
  { id: "score-1", x: 156, y: 362, radius: 14, score: 220 },
  { id: "score-2", x: 328, y: 316, radius: 14, score: 320 },
  { id: "score-3", x: 622, y: 284, radius: 14, score: 360 },
  { id: "score-4", x: 884, y: 338, radius: 14, score: 380 },
  { id: "score-5", x: 1072, y: 252, radius: 14, score: 420 },
  { id: "score-6", x: 1436, y: 230, radius: 14, score: 480 },
  { id: "score-7", x: 1770, y: 214, radius: 14, score: 520 },
  { id: "score-8", x: 2050, y: 256, radius: 16, score: 640 },
];

const finishGates = [
  { id: "gate-1", x: 2238, y: 232, w: 24, h: 206, openAt: 0 },
  { id: "gate-2", x: 2276, y: 216, w: 26, h: 222, openAt: 0 },
];

const lineGoals = [
  {
    id: "warmup-flow",
    start: 0,
    end: 620,
    label: "Warmup flow",
    copy: "Pop the opening bank, then settle into the first manual pad.",
    requirements: ["air", "manual"],
    bonus: 700,
  },
  {
    id: "transfer-spine",
    start: 620,
    end: 1450,
    label: "Transfer spine",
    copy: "Link a rail, then a manual, then launch the hip clean.",
    requirements: ["grind", "manual", "air"],
    bonus: 1200,
  },
  {
    id: "crown-finisher",
    start: 1450,
    end: 2280,
    label: "Crown finisher",
    copy: "Hold the long crown rail and stomp the final landing.",
    requirements: ["grind", "landing"],
    bonus: 1600,
  },
];

const course = {
  width: 2360,
  cameraWindow: 920,
  worldHeight: 540,
  groundY: 468,
  runTime: 84,
  startTime: 0,
  finishTime: 84,
  finishDistance: 2260,
  targetScore: 8200,
};

export function getCourse() {
  return course;
}

export function getRamps() {
  return ramps;
}

export function getRails() {
  return rails;
}

export function getLandingZones() {
  return landingZones;
}

export function getPickups() {
  return pickups;
}

export function getFinishGates() {
  return finishGates;
}

export function getLineGoals() {
  return lineGoals;
}
