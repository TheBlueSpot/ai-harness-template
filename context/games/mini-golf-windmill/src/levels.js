export const COURSE_BOUNDS = { x: 60, y: 60, width: 840, height: 420 };

export const HOLES = [
  {
    name: "Warmup Bend",
    par: 3,
    start: { x: 150, y: 420 },
    cup: { x: 805, y: 145, radius: 15 },
    walls: [
      { x: 330, y: 250, width: 120, height: 24 },
      { x: 515, y: 180, width: 26, height: 180 },
    ],
    sand: [{ x: 610, y: 305, width: 150, height: 80 }],
    bumpers: [{ x: 265, y: 185, radius: 24 }],
    windmills: [],
  },
  {
    name: "Twin Sails",
    par: 4,
    start: { x: 145, y: 145 },
    cup: { x: 800, y: 405, radius: 15 },
    walls: [
      { x: 320, y: 120, width: 30, height: 180 },
      { x: 320, y: 340, width: 210, height: 24 },
      { x: 610, y: 185, width: 30, height: 220 },
    ],
    sand: [{ x: 690, y: 110, width: 135, height: 55 }],
    bumpers: [{ x: 520, y: 185, radius: 20 }],
    windmills: [{ x: 515, y: 270, radius: 88, bladeCount: 4, bladeWidth: 14, speed: 1.3 }],
  },
  {
    name: "Cross Breeze",
    par: 4,
    start: { x: 160, y: 408 },
    cup: { x: 805, y: 130, radius: 15 },
    walls: [
      { x: 250, y: 300, width: 160, height: 22 },
      { x: 495, y: 120, width: 22, height: 250 },
      { x: 620, y: 295, width: 180, height: 22 },
    ],
    sand: [
      { x: 118, y: 130, width: 130, height: 70 },
      { x: 700, y: 350, width: 120, height: 80 },
    ],
    bumpers: [
      { x: 462, y: 400, radius: 22 },
      { x: 575, y: 205, radius: 22 },
    ],
    windmills: [
      { x: 352, y: 190, radius: 72, bladeCount: 3, bladeWidth: 16, speed: -1.45 },
      { x: 720, y: 200, radius: 64, bladeCount: 4, bladeWidth: 12, speed: 1.9 },
    ],
  },
  {
    name: "Gatekeeper",
    par: 5,
    start: { x: 140, y: 270 },
    cup: { x: 795, y: 268, radius: 15 },
    walls: [
      { x: 270, y: 110, width: 24, height: 320 },
      { x: 455, y: 110, width: 24, height: 150 },
      { x: 455, y: 315, width: 24, height: 115 },
      { x: 640, y: 110, width: 24, height: 320 },
    ],
    sand: [{ x: 705, y: 155, width: 95, height: 220 }],
    bumpers: [
      { x: 385, y: 160, radius: 18 },
      { x: 385, y: 375, radius: 18 },
      { x: 565, y: 270, radius: 22 },
    ],
    windmills: [
      { x: 385, y: 270, radius: 76, bladeCount: 2, bladeWidth: 18, speed: 2.3 },
      { x: 565, y: 270, radius: 76, bladeCount: 4, bladeWidth: 12, speed: -1.5 },
    ],
  },
  {
    name: "Final Loop",
    par: 5,
    start: { x: 165, y: 400 },
    cup: { x: 802, y: 130, radius: 15 },
    walls: [
      { x: 270, y: 120, width: 430, height: 20 },
      { x: 270, y: 120, width: 20, height: 230 },
      { x: 270, y: 330, width: 250, height: 20 },
      { x: 500, y: 220, width: 20, height: 130 },
      { x: 590, y: 220, width: 20, height: 170 },
      { x: 680, y: 120, width: 20, height: 200 },
    ],
    sand: [{ x: 105, y: 118, width: 120, height: 78 }],
    bumpers: [
      { x: 440, y: 415, radius: 23 },
      { x: 748, y: 380, radius: 23 },
    ],
    windmills: [
      { x: 405, y: 240, radius: 62, bladeCount: 3, bladeWidth: 14, speed: 1.4 },
      { x: 635, y: 375, radius: 64, bladeCount: 3, bladeWidth: 14, speed: -1.8 },
    ],
  },
  {
    name: "Victory Pin",
    par: 4,
    start: { x: 146, y: 270 },
    cup: { x: 805, y: 270, radius: 15 },
    walls: [
      { x: 250, y: 140, width: 30, height: 260 },
      { x: 435, y: 60, width: 28, height: 200 },
      { x: 435, y: 310, width: 28, height: 170 },
      { x: 620, y: 140, width: 30, height: 260 },
    ],
    sand: [
      { x: 690, y: 155, width: 120, height: 220 },
      { x: 300, y: 208, width: 92, height: 124 },
    ],
    bumpers: [
      { x: 345, y: 120, radius: 19 },
      { x: 345, y: 420, radius: 19 },
      { x: 530, y: 270, radius: 19 },
    ],
    windmills: [
      { x: 345, y: 270, radius: 86, bladeCount: 4, bladeWidth: 12, speed: 1.9 },
      { x: 530, y: 270, radius: 70, bladeCount: 2, bladeWidth: 18, speed: -2.4 },
      { x: 715, y: 270, radius: 58, bladeCount: 3, bladeWidth: 14, speed: 2.1 },
    ],
  },
];
