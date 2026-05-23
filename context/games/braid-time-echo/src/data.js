window.BraidTimeEchoData = {
  VIEW_WIDTH: 960,
  VIEW_HEIGHT: 540,
  WORLD_WIDTH: 3040,
  WORLD_HEIGHT: 540,
  GRAVITY: 1800,
  MAX_HISTORY: 420,
  MAX_ECHOES: 3,
  REWIND_RATE: 2.4,
  start: { x: 92, y: 420 },
  platforms: [
    { x: 0, y: 500, w: 720, h: 40 },
    { x: 760, y: 500, w: 420, h: 40 },
    { x: 1160, y: 500, w: 640, h: 40 },
    { x: 1880, y: 500, w: 1060, h: 40 },
    { x: 210, y: 430, w: 130, h: 18 },
    { x: 380, y: 370, w: 130, h: 18 },
    { x: 560, y: 310, w: 150, h: 18 },
    { x: 1290, y: 430, w: 130, h: 18 },
    { x: 1470, y: 360, w: 140, h: 18 },
    { x: 1650, y: 290, w: 180, h: 18 },
    { x: 2140, y: 420, w: 140, h: 18 },
    { x: 2320, y: 350, w: 140, h: 18 },
    { x: 2520, y: 280, w: 150, h: 18 }
  ],
  doors: [
    { id: "alpha", switchId: "alpha", x: 1110, y: 320, w: 42, h: 180 },
    { id: "beta", switchId: "beta", x: 1836, y: 320, w: 42, h: 180 },
    { id: "omega", switchId: "omega", x: 2728, y: 320, w: 42, h: 180 }
  ],
  switches: [
    { id: "alpha", x: 812, y: 476, w: 54, h: 14, label: "A" },
    { id: "beta", x: 1710, y: 266, w: 54, h: 14, label: "B" },
    { id: "omega", x: 2380, y: 476, w: 54, h: 14, label: "C" }
  ],
  shards: [
    { id: "past", x: 634, y: 274, r: 12 },
    { id: "present", x: 1750, y: 254, r: 12 },
    { id: "future", x: 2588, y: 244, r: 12 }
  ],
  spikes: [
    { x: 2025, y: 488, w: 88, h: 12 },
    { x: 2480, y: 488, w: 68, h: 12 }
  ],
  exit: {
    x: 2876,
    y: 430,
    w: 44,
    h: 70
  }
};
