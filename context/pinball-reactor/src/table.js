export const TABLE_WIDTH = 720;
export const TABLE_HEIGHT = 960;
export const GRAVITY = 1800;
export const MAX_BALLS = 3;

export const WALLS = [
  { x1: 68, y1: 40, x2: 32, y2: 810 },
  { x1: 652, y1: 40, x2: 688, y2: 810 },
  { x1: 68, y1: 40, x2: 292, y2: 28 },
  { x1: 652, y1: 40, x2: 428, y2: 28 },
  { x1: 220, y1: 810, x2: 294, y2: 894 },
  { x1: 500, y1: 810, x2: 426, y2: 894 },
];

export const BUMPERS = [
  { x: 232, y: 220, radius: 37, score: 120 },
  { x: 490, y: 220, radius: 37, score: 120 },
  { x: 360, y: 312, radius: 44, score: 180 },
];

export const TARGETS = [
  { x: 142, y: 360, w: 22, h: 90, score: 220, key: "L" },
  { x: 576, y: 360, w: 22, h: 90, score: 220, key: "R" },
  { x: 348, y: 452, w: 24, h: 104, score: 260, key: "C" },
];

export const SLINGS = [
  [
    { x: 158, y: 780 },
    { x: 256, y: 822 },
    { x: 210, y: 870 },
  ],
  [
    { x: 562, y: 780 },
    { x: 464, y: 822 },
    { x: 510, y: 870 },
  ],
];

export const REACTOR_RAMPS = [
  {
    id: "left-ramp",
    label: "Left Ramp",
    x: 140,
    y: 134,
    w: 112,
    h: 170,
    score: 700,
    exitVX: 180,
    exitVY: -1020,
  },
  {
    id: "right-ramp",
    label: "Right Ramp",
    x: 468,
    y: 134,
    w: 112,
    h: 170,
    score: 700,
    exitVX: -180,
    exitVY: -1020,
  },
];

export const LOCKS = [
  { x: 206, y: 118, radius: 28, score: 500 },
  { x: 514, y: 118, radius: 28, score: 500 },
];

export const FLIPPERS = {
  left: {
    pivot: { x: 285, y: 862 },
    length: 118,
    restAngle: 3.58,
    activeAngle: 2.55,
  },
  right: {
    pivot: { x: 435, y: 862 },
    length: 118,
    restAngle: -0.44,
    activeAngle: 0.59,
  },
};

export const LAUNCH_LANE = {
  x: 612,
  y: 52,
  w: 56,
  h: 796,
};
