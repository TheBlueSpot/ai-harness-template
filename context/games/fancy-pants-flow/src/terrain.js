export const CANVAS_WIDTH = 1280;
export const CANVAS_HEIGHT = 720;

const LEVEL_LENGTH = 4600;

const levelBlueprints = [
  {
    name: "Page 1",
    theme: "Playground warmup",
    beat: "Build speed through low hills",
    checkpointXs: [0, 1180, 2580, 3880],
    checkpointLabels: ["Park", "Slides", "Hills", "Sprint"],
    pageTint: "#fffef7",
    skyTop: "#fef8e2",
    skyBottom: "#ffd28f",
    hillColors: ["rgba(43, 183, 168, 0.12)", "rgba(123, 194, 255, 0.14)"],
    doodles: [
      { kind: "sun", x: 340, y: 128, size: 54 },
      { kind: "arrow", x: 1240, y: 168, text: "build speed" },
      { kind: "arrow", x: 3040, y: 124, text: "stay low" },
    ],
    ridges: [
      [520, 360, 110],
      [1680, 460, 136],
      [2860, 520, 148],
      [3920, 420, 128],
    ],
    valleys: [
      [1100, 400, 120],
      [2260, 360, 116],
      [3300, 420, 118],
    ],
    boostPads: [{ x: 3380, width: 180, forward: 8.4, upward: 11.8, label: "kick ramp" }],
    draftZones: [],
    trickGates: [
      { x: 910, offsetY: -170, radius: 38, label: "first flair", bonus: 180 },
      { x: 3460, offsetY: -190, radius: 42, label: "hill thread", bonus: 220 },
    ],
    collectibles: [
      [260, -88], [430, -112], [610, -92], [820, -84], [1160, -110], [1410, -120],
      [1760, -104], [1980, -88], [2340, -116], [2620, -130], [2880, -94], [3240, -118],
      [3510, -106], [3860, -94], [4210, -82], [4460, -96],
    ],
  },
  {
    name: "Page 2",
    theme: "Tunnel doodles",
    beat: "Hop gaps between tube sketches",
    checkpointXs: [0, 980, 2150, 3520],
    checkpointLabels: ["Stacks", "Tunnels", "Loopback", "Rush"],
    pageTint: "#fcfff7",
    skyTop: "#d9fff2",
    skyBottom: "#ffd89a",
    hillColors: ["rgba(239, 143, 31, 0.12)", "rgba(43, 183, 168, 0.14)"],
    doodles: [
      { kind: "cloud", x: 280, y: 118, size: 48 },
      { kind: "tube", x: 1650, y: 246, size: 140 },
      { kind: "arrow", x: 3120, y: 138, text: "gap hop" },
    ],
    ridges: [
      [420, 280, 96],
      [1280, 420, 128],
      [2480, 520, 156],
      [3500, 620, 162],
    ],
    valleys: [
      [860, 360, 124],
      [1860, 310, 136],
      [2900, 460, 142],
      [4160, 240, 96],
    ],
    boostPads: [
      { x: 1320, width: 170, forward: 8.8, upward: 12.6, label: "tube pop" },
      { x: 3560, width: 170, forward: 9.1, upward: 12.8, label: "gap hop" },
    ],
    draftZones: [],
    trickGates: [
      { x: 1460, offsetY: -210, radius: 42, label: "tube arc", bonus: 220 },
      { x: 3720, offsetY: -220, radius: 42, label: "clear gap", bonus: 240 },
    ],
    collectibles: [
      [210, -82], [520, -110], [760, -132], [1020, -92], [1320, -108], [1570, -124],
      [1840, -90], [2140, -130], [2410, -102], [2680, -124], [2980, -148], [3260, -108],
      [3540, -126], [3820, -92], [4160, -86], [4440, -112],
    ],
  },
  {
    name: "Page 3",
    theme: "Binder bounce",
    beat: "Chain launch pads between rings",
    checkpointXs: [0, 980, 2320, 3640],
    checkpointLabels: ["Margin", "Rings", "Bounce", "Flight"],
    pageTint: "#fffdf5",
    skyTop: "#ffeccf",
    skyBottom: "#ffd9a4",
    hillColors: ["rgba(43, 183, 168, 0.12)", "rgba(29, 28, 38, 0.1)"],
    doodles: [
      { kind: "ring", x: 860, y: 188, size: 78 },
      { kind: "ring", x: 1540, y: 204, size: 70 },
      { kind: "arrow", x: 2660, y: 138, text: "launch pad" },
      { kind: "star", x: 3940, y: 104, size: 48 },
    ],
    ridges: [
      [560, 340, 102],
      [1320, 440, 118],
      [2240, 340, 96],
      [3080, 560, 154],
      [4040, 540, 148],
    ],
    valleys: [
      [980, 340, 140],
      [1820, 320, 126],
      [2780, 340, 122],
      [3600, 360, 114],
    ],
    boostPads: [
      { x: 1180, width: 180, forward: 9.2, upward: 13.1, label: "binder snap" },
      { x: 2920, width: 180, forward: 9.4, upward: 13.4, label: "binder snap" },
    ],
    draftZones: [],
    trickGates: [
      { x: 1290, offsetY: -240, radius: 48, label: "ring skip", bonus: 240 },
      { x: 3030, offsetY: -250, radius: 48, label: "double snap", bonus: 260 },
    ],
    collectibles: [
      [220, -92], [460, -106], [710, -98], [980, -118], [1260, -144], [1530, -112],
      [1820, -126], [2090, -98], [2360, -114], [2620, -124], [2920, -142], [3210, -104],
      [3470, -118], [3800, -100], [4160, -88], [4440, -108],
    ],
  },
  {
    name: "Page 4",
    theme: "Margin glide",
    beat: "Ride updraft lanes for airtime",
    checkpointXs: [0, 1040, 2380, 3720],
    checkpointLabels: ["Notes", "Fan lane", "Glide", "Drop"],
    pageTint: "#f9fffb",
    skyTop: "#d7fff7",
    skyBottom: "#ffdca2",
    hillColors: ["rgba(123, 194, 255, 0.12)", "rgba(43, 183, 168, 0.12)"],
    doodles: [
      { kind: "note", x: 360, y: 170, text: "jump into the breeze" },
      { kind: "arrow", x: 1660, y: 148, text: "glide lane" },
      { kind: "spiral", x: 2860, y: 184, size: 54 },
      { kind: "arrow", x: 3980, y: 136, text: "stay high" },
    ],
    ridges: [
      [460, 320, 96],
      [1460, 460, 132],
      [2240, 360, 94],
      [3140, 520, 142],
      [4060, 460, 118],
    ],
    valleys: [
      [980, 360, 136],
      [1880, 340, 118],
      [2760, 340, 124],
      [3560, 360, 122],
    ],
    boostPads: [{ x: 1320, width: 180, forward: 9.1, upward: 12.9, label: "page flick" }],
    draftZones: [
      { start: 1500, end: 2220, floorOffset: 210, forceX: 0.065, forceY: -0.14, label: "tailwind" },
      { start: 3540, end: 4320, floorOffset: 230, forceX: 0.072, forceY: -0.16, label: "updraft" },
    ],
    trickGates: [
      { x: 1860, offsetY: -250, radius: 46, label: "margin float", bonus: 260 },
      { x: 3810, offsetY: -270, radius: 52, label: "draft line", bonus: 280 },
    ],
    collectibles: [
      [220, -88], [500, -110], [760, -96], [1040, -124], [1320, -142], [1580, -170],
      [1820, -190], [2060, -176], [2320, -136], [2580, -116], [2860, -132], [3160, -160],
      [3440, -148], [3720, -182], [3980, -160], [4260, -118],
    ],
  },
  {
    name: "Page 5",
    theme: "Ink escape",
    beat: "Stay ahead of heavy ink chase",
    checkpointXs: [0, 1140, 2520, 3820],
    checkpointLabels: ["Chase", "Drips", "Launch", "Finale"],
    pageTint: "#fffaf0",
    skyTop: "#ffe3d1",
    skyBottom: "#ffb36b",
    hillColors: ["rgba(29, 28, 38, 0.1)", "rgba(239, 143, 31, 0.12)"],
    doodles: [
      { kind: "ink", x: 560, y: 212, size: 72 },
      { kind: "scribble-monster", x: 1720, y: 214, size: 78 },
      { kind: "arrow", x: 2480, y: 132, text: "keep flying" },
      { kind: "star", x: 4060, y: 108, size: 48 },
    ],
    ridges: [
      [620, 420, 130],
      [1540, 480, 142],
      [2340, 320, 98],
      [3180, 620, 164],
      [4080, 500, 136],
    ],
    valleys: [
      [1060, 420, 148],
      [1880, 360, 132],
      [2760, 360, 126],
      [3640, 360, 118],
    ],
    boostPads: [
      { x: 2220, width: 180, forward: 9.5, upward: 13.5, label: "escape launch" },
      { x: 3560, width: 180, forward: 9.6, upward: 13.7, label: "final kick" },
    ],
    draftZones: [],
    trickGates: [
      { x: 2400, offsetY: -270, radius: 52, label: "ink vault", bonus: 300 },
      { x: 3690, offsetY: -240, radius: 46, label: "escape stitch", bonus: 280 },
    ],
    collectibles: [
      [240, -90], [460, -108], [730, -96], [980, -124], [1220, -140], [1490, -106],
      [1750, -128], [2030, -98], [2280, -156], [2540, -126], [2840, -136], [3140, -100],
      [3430, -120], [3700, -138], [3980, -104], [4320, -88],
    ],
  },
  {
    name: "Page 6",
    theme: "Library rooftop",
    beat: "Bounce over stacked bookshelves",
    checkpointXs: [0, 1120, 2380, 3760],
    checkpointLabels: ["Stairs", "Stacks", "Roofline", "Dash"],
    pageTint: "#fffaf5",
    skyTop: "#ffe8dc",
    skyBottom: "#ffc67f",
    hillColors: ["rgba(239, 143, 31, 0.12)", "rgba(123, 194, 255, 0.12)"],
    doodles: [
      { kind: "note", x: 430, y: 160, text: "vault over book piles" },
      { kind: "tube", x: 1730, y: 236, size: 160 },
      { kind: "arrow", x: 2720, y: 132, text: "roof gap" },
      { kind: "star", x: 4100, y: 108, size: 50 },
    ],
    ridges: [
      [520, 360, 108],
      [1360, 520, 142],
      [2320, 360, 96],
      [3180, 600, 156],
      [4040, 500, 126],
    ],
    valleys: [
      [980, 360, 120],
      [1840, 300, 104],
      [2740, 360, 132],
      [3640, 320, 110],
    ],
    boostPads: [
      { x: 1490, width: 180, forward: 9.2, upward: 13.2, label: "shelf launch" },
      { x: 3260, width: 180, forward: 9.5, upward: 13.7, label: "roof pop" },
    ],
    draftZones: [{ start: 2460, end: 3120, floorOffset: 220, forceX: 0.066, forceY: -0.15, label: "roof breeze" }],
    trickGates: [
      { x: 1620, offsetY: -240, radius: 48, label: "shelf gap", bonus: 280 },
      { x: 2940, offsetY: -280, radius: 52, label: "roof thread", bonus: 320 },
      { x: 3380, offsetY: -250, radius: 46, label: "late save", bonus: 260 },
    ],
    collectibles: [
      [250, -92], [520, -114], [760, -96], [1020, -126], [1300, -144], [1540, -168],
      [1780, -120], [2050, -96], [2320, -118], [2590, -180], [2860, -196], [3140, -154],
      [3400, -136], [3680, -110], [3960, -102], [4300, -88],
    ],
  },
  {
    name: "Page 7",
    theme: "Storm gutter",
    beat: "Use crosswinds before ink surge lands",
    checkpointXs: [0, 1080, 2240, 3660],
    checkpointLabels: ["Drizzle", "Crosswind", "Gutter", "Surge"],
    pageTint: "#f8fbff",
    skyTop: "#dbefff",
    skyBottom: "#ffc98f",
    hillColors: ["rgba(29, 28, 38, 0.08)", "rgba(43, 183, 168, 0.12)"],
    doodles: [
      { kind: "cloud", x: 320, y: 118, size: 54 },
      { kind: "spiral", x: 1760, y: 170, size: 62 },
      { kind: "arrow", x: 2680, y: 138, text: "crosswind" },
      { kind: "scribble-monster", x: 4010, y: 210, size: 74 },
    ],
    ridges: [
      [420, 300, 94],
      [1210, 500, 146],
      [2160, 380, 98],
      [3040, 620, 170],
      [4100, 560, 142],
    ],
    valleys: [
      [820, 340, 126],
      [1660, 320, 120],
      [2560, 360, 140],
      [3520, 320, 108],
    ],
    boostPads: [
      { x: 1260, width: 180, forward: 9.3, upward: 13.4, label: "storm pop" },
      { x: 2860, width: 190, forward: 9.6, upward: 13.8, label: "gutter fling" },
    ],
    draftZones: [
      { start: 1440, end: 2080, floorOffset: 220, forceX: 0.075, forceY: -0.12, label: "crosswind" },
      { start: 3000, end: 3720, floorOffset: 250, forceX: 0.08, forceY: -0.18, label: "storm lift" },
    ],
    trickGates: [
      { x: 1680, offsetY: -230, radius: 44, label: "wind cut", bonus: 300 },
      { x: 3180, offsetY: -300, radius: 56, label: "storm weave", bonus: 340 },
      { x: 3860, offsetY: -250, radius: 46, label: "surge skim", bonus: 300 },
    ],
    collectibles: [
      [220, -86], [470, -104], [760, -96], [1040, -132], [1280, -154], [1560, -178],
      [1820, -164], [2080, -136], [2340, -108], [2620, -140], [2900, -188], [3220, -210],
      [3520, -172], [3800, -136], [4100, -108], [4380, -88],
    ],
  },
  {
    name: "Page 8",
    theme: "Grand finale",
    beat: "Finish notebook with full-route combo",
    checkpointXs: [0, 1120, 2380, 3780],
    checkpointLabels: ["Sprint", "Launch", "Combo", "Exit"],
    pageTint: "#fffdf8",
    skyTop: "#fff0cf",
    skyBottom: "#ffbb72",
    hillColors: ["rgba(239, 143, 31, 0.12)", "rgba(29, 28, 38, 0.08)"],
    doodles: [
      { kind: "sun", x: 260, y: 118, size: 48 },
      { kind: "ring", x: 1540, y: 172, size: 86 },
      { kind: "arrow", x: 2860, y: 130, text: "combo lane" },
      { kind: "note", x: 3920, y: 170, text: "clear notebook" },
    ],
    ridges: [
      [520, 340, 104],
      [1420, 560, 154],
      [2320, 340, 96],
      [3200, 660, 178],
      [4080, 540, 136],
    ],
    valleys: [
      [980, 360, 126],
      [1820, 320, 116],
      [2720, 360, 132],
      [3640, 320, 114],
    ],
    boostPads: [
      { x: 1500, width: 180, forward: 9.5, upward: 13.8, label: "final arc" },
      { x: 3120, width: 200, forward: 9.8, upward: 14.1, label: "combo shot" },
      { x: 3860, width: 180, forward: 9.7, upward: 13.9, label: "exit kick" },
    ],
    draftZones: [{ start: 3180, end: 4020, floorOffset: 240, forceX: 0.078, forceY: -0.18, label: "victory draft" }],
    trickGates: [
      { x: 1640, offsetY: -270, radius: 54, label: "hero ring", bonus: 320 },
      { x: 3320, offsetY: -330, radius: 60, label: "combo lane", bonus: 380 },
      { x: 3980, offsetY: -260, radius: 48, label: "notebook seal", bonus: 360 },
    ],
    collectibles: [
      [240, -92], [500, -112], [770, -100], [1040, -128], [1310, -150], [1560, -190],
      [1820, -154], [2080, -120], [2340, -112], [2620, -146], [2920, -190], [3240, -224],
      [3520, -206], [3800, -162], [4080, -120], [4380, -96],
    ],
  },
  {
    name: "Page 9",
    theme: "Back cover blowout",
    beat: "Close the notebook with one last launch chain",
    checkpointXs: [0, 1060, 2260, 3660],
    checkpointLabels: ["Spill", "Climb", "Chain", "Seal"],
    pageTint: "#fff7f1",
    skyTop: "#ffd7c3",
    skyBottom: "#ff9c62",
    hillColors: ["rgba(29, 28, 38, 0.12)", "rgba(239, 143, 31, 0.12)"],
    doodles: [
      { kind: "ink", x: 420, y: 218, size: 78 },
      { kind: "ring", x: 1630, y: 176, size: 90 },
      { kind: "arrow", x: 2840, y: 132, text: "last chain" },
      { kind: "note", x: 4000, y: 166, text: "slam the cover shut" },
    ],
    ridges: [
      [480, 340, 96],
      [1340, 580, 162],
      [2260, 360, 102],
      [3140, 680, 184],
      [4080, 560, 144],
    ],
    valleys: [
      [900, 360, 130],
      [1820, 320, 120],
      [2680, 360, 140],
      [3560, 320, 114],
    ],
    boostPads: [
      { x: 1440, width: 180, forward: 9.7, upward: 14.0, label: "cover crack" },
      { x: 3040, width: 210, forward: 10.0, upward: 14.3, label: "seal shot" },
      { x: 3920, width: 180, forward: 9.8, upward: 14.0, label: "last stamp" },
    ],
    draftZones: [{ start: 3100, end: 4020, floorOffset: 250, forceX: 0.082, forceY: -0.2, label: "cover rush" }],
    trickGates: [
      { x: 1680, offsetY: -290, radius: 56, label: "cover loop", bonus: 340 },
      { x: 3240, offsetY: -350, radius: 62, label: "seal combo", bonus: 400 },
      { x: 3980, offsetY: -280, radius: 50, label: "final stamp", bonus: 380 },
    ],
    collectibles: [
      [240, -94], [500, -114], [780, -104], [1040, -130], [1320, -154], [1580, -198],
      [1840, -162], [2100, -122], [2360, -114], [2660, -150], [2960, -198], [3280, -236],
      [3560, -214], [3820, -168], [4100, -126], [4380, -100],
    ],
  },
];

export const LEVELS = levelBlueprints.map((blueprint, index) => ({
  ...blueprint,
  index,
  length: LEVEL_LENGTH,
}));

export const COURSE_LENGTH = LEVEL_LENGTH;
export const TOTAL_LEVELS = LEVELS.length;

export function getLevelDefinition(index) {
  return LEVELS[Math.max(0, Math.min(index, LEVELS.length - 1))];
}

export function getCheckpointLabel(x, levelIndex) {
  const level = getLevelDefinition(levelIndex);
  const { checkpointXs, checkpointLabels } = level;
  for (let i = checkpointXs.length - 1; i >= 0; i -= 1) {
    if (x >= checkpointXs[i]) {
      return checkpointLabels[i];
    }
  }
  return checkpointLabels[0];
}

export function getTerrainHeight(x, levelIndex) {
  const level = getLevelDefinition(levelIndex);
  const clamped = Math.max(0, Math.min(level.length, x));
  let y =
    520 +
    Math.sin(clamped / 240) * 64 +
    Math.sin(clamped / 110) * 12 +
    Math.sin((clamped - 760) / 360) * 42;

  for (const [center, radius, height] of level.ridges) {
    y -= ridge(clamped, center, radius, height);
  }

  for (const [center, radius, depth] of level.valleys) {
    y += valley(clamped, center, radius, depth);
  }

  return y;
}

export function getTerrainSlope(x, levelIndex) {
  const sample = 2;
  return (getTerrainHeight(x + sample, levelIndex) - getTerrainHeight(x - sample, levelIndex)) / (sample * 2);
}

export function getTerrainNormal(x, levelIndex) {
  const slope = getTerrainSlope(x, levelIndex);
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

export function buildCollectibles(levelIndex) {
  const level = getLevelDefinition(levelIndex);
  return level.collectibles.map(([x, offsetY]) => ({
    x,
    y: getTerrainHeight(x, levelIndex) + offsetY,
    radius: 18,
    taken: false,
  }));
}

export function buildTrickGates(levelIndex) {
  const level = getLevelDefinition(levelIndex);
  return (level.trickGates ?? []).map((gate) => ({
    x: gate.x,
    y: getTerrainHeight(gate.x, levelIndex) + gate.offsetY,
    radius: gate.radius,
    label: gate.label,
    bonus: gate.bonus,
    taken: false,
  }));
}

export function getBoostPadAt(x, levelIndex) {
  const level = getLevelDefinition(levelIndex);
  return level.boostPads.find((pad) => Math.abs(x - pad.x) <= pad.width * 0.5) ?? null;
}

export function getDraftZoneAt(x, y, levelIndex) {
  const level = getLevelDefinition(levelIndex);
  const terrainY = getTerrainHeight(x, levelIndex);
  return (
    level.draftZones.find(
      (zone) => x >= zone.start && x <= zone.end && y <= terrainY - 30 && y >= terrainY - zone.floorOffset,
    ) ?? null
  );
}
