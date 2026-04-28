export const VIEW_WIDTH = 1280;
export const VIEW_HEIGHT = 720;
export const ROOM_WIDTH = 880;
export const ROOM_HEIGHT = 520;
export const FLOOR_Y = 430;

function rect(x, y, width, height) {
  return { x, y, width, height };
}

function ledge(x, y, width, height = 18) {
  return rect(x, y, width, height);
}

function verticalGate(x, y, width, height, requires, note) {
  return { x, y, width, height, requires, note, axis: "vertical" };
}

function hatchGate(x, y, width, height, requires, note) {
  return { x, y, width, height, requires, note, axis: "hatch" };
}

export const ROOM_LAYOUT = [
  { id: "dock", gridX: 0, gridY: 0, name: "Dock", color: "#22354a" },
  { id: "atrium", gridX: 1, gridY: 0, name: "Atrium", color: "#1e3d3d" },
  { id: "morph", gridX: 2, gridY: 0, name: "Morph Vault", color: "#44363c" },
  { id: "junction", gridX: 0, gridY: 1, name: "Service Junction", color: "#2d2e4f" },
  { id: "spore", gridX: 1, gridY: 1, name: "Spore Gallery", color: "#3b3f26" },
  { id: "highJump", gridX: 2, gridY: 1, name: "High Jump Lab", color: "#4a312d" },
  { id: "reactor", gridX: 1, gridY: 2, name: "Reactor Nest", color: "#4d2a25" },
];

export const ROOMS = {
  dock: {
    id: "dock",
    name: "Dock",
    zone: "Dock",
    connections: { right: "atrium", down: "junction" },
    platforms: [ledge(300, 350, 170), ledge(560, 300, 180)],
    solids: [],
    hazards: [],
    pickups: [],
    enemies: [{ type: "zoomer", path: "dockLoop", startT: 0.08 }, { type: "drone", x: 620, y: 250 }],
    gates: [],
    drops: [{ x: 24, width: 82, to: "junction", requires: null, note: "Drop through the freight elevator shaft." }],
    notes: "Survey the station and find a route to the reactor.",
  },
  atrium: {
    id: "atrium",
    name: "Atrium",
    zone: "Central Atrium",
    connections: { left: "dock", right: "morph", down: "spore" },
    platforms: [ledge(120, 300, 160), ledge(360, 240, 160), ledge(620, 190, 140)],
    solids: [],
    hazards: [],
    pickups: [],
    enemies: [{ type: "zoomer", path: "atriumLoop", startT: 0.44 }, { type: "drone", x: 420, y: 170 }],
    gates: [],
    drops: [{ x: 760, width: 90, to: "spore", requires: null, note: "Drop through the atrium maintenance gap." }],
    notes: "Upper catwalks lead deeper into the lab.",
  },
  morph: {
    id: "morph",
    name: "Morph Vault",
    zone: "Morph Vault",
    connections: { left: "atrium", down: "highJump" },
    platforms: [ledge(180, 330, 160), ledge(500, 270, 180)],
    solids: [rect(720, FLOOR_Y - 60, 120, 60)],
    hazards: [],
    pickups: [{ id: "morphBall", label: "Morph Ball", x: 765, y: FLOOR_Y - 100 }],
    enemies: [{ type: "zoomer", path: "vaultLoop", startT: 0.12 }],
    gates: [hatchGate(700, FLOOR_Y - 18, 80, 18, "morphBall", "Compress through the floor hatch.")],
    drops: [{ x: 700, width: 80, to: "highJump", requires: "morphBall", note: "Compress through the floor hatch." }],
    notes: "A sealed hatch hides a compact mobility module.",
  },
  junction: {
    id: "junction",
    name: "Service Junction",
    zone: "Service Junction",
    connections: { up: "dock", right: "spore" },
    platforms: [ledge(180, 280, 120), ledge(430, 320, 180)],
    solids: [rect(0, FLOOR_Y - 110, 90, 110)],
    hazards: [],
    pickups: [],
    enemies: [{ type: "zoomer", path: "junctionLoop", startT: 0.58 }],
    gates: [verticalGate(760, FLOOR_Y - 110, 32, 110, "morphBall", "Roll through the conduit to the gallery.")],
    drops: [],
    notes: "Maintenance conduits only admit a compact suit profile.",
  },
  spore: {
    id: "spore",
    name: "Spore Gallery",
    zone: "Spore Gallery",
    connections: { left: "junction", up: "atrium", right: "highJump", down: "reactor" },
    platforms: [ledge(140, 260, 140), ledge(340, 200, 120), ledge(620, 280, 150)],
    solids: [],
    hazards: [rect(370, FLOOR_Y - 20, 130, 20)],
    pickups: [],
    enemies: [
      { type: "zoomer", path: "sporeLoop", startT: 0.26 },
      { type: "zoomer", path: "sporeLoop", startT: 0.78 },
      { type: "drone", x: 700, y: 190 },
    ],
    gates: [verticalGate(780, FLOOR_Y - 160, 34, 160, "highJump", "Reach the elevated blast door with high jump.")],
    drops: [{ x: 420, width: 74, to: "reactor", requires: null, note: "Drop through the spore trench." }],
    notes: "Toxic spores flood the floor trench.",
  },
  highJump: {
    id: "highJump",
    name: "High Jump Lab",
    zone: "High Jump Lab",
    connections: { left: "spore", up: "morph" },
    platforms: [ledge(160, 320, 150), ledge(370, 240, 130), ledge(560, 160, 120)],
    solids: [rect(740, FLOOR_Y - 150, 100, 150)],
    hazards: [],
    pickups: [{ id: "highJump", label: "High Jump", x: 610, y: 120 }],
    enemies: [{ type: "zoomer", path: "jumpLoop", startT: 0.19 }, { type: "drone", x: 310, y: 140 }],
    gates: [],
    drops: [],
    notes: "Experimental jump servos wait at the top of the chamber.",
  },
  reactor: {
    id: "reactor",
    name: "Reactor Nest",
    zone: "Reactor Nest",
    connections: { up: "spore" },
    platforms: [ledge(170, 280, 140), ledge(530, 240, 170)],
    solids: [rect(370, FLOOR_Y - 150, 90, 150)],
    hazards: [rect(260, FLOOR_Y - 12, 330, 12)],
    pickups: [{ id: "reactorCore", label: "Containment Core", x: 705, y: 170 }],
    enemies: [
      { type: "zoomer", path: "reactorLoop", startT: 0.42 },
      { type: "zoomer", path: "reactorLoop", startT: 0.84 },
      { type: "drone", x: 640, y: 180, hp: 6 },
    ],
    gates: [hatchGate(620, FLOOR_Y - 18, 90, 18, "morphBall", "Slip under the reactor shielding."), verticalGate(660, 110, 36, 110, "highJump", "Leap to the suspended reactor ledge.")],
    drops: [],
    notes: "Break quarantine by extracting the containment core.",
  },
};

export const ZOOMER_PATHS = {
  dockLoop: [
    { x: 120, y: FLOOR_Y },
    { x: 120, y: 240 },
    { x: 320, y: 240 },
    { x: 320, y: FLOOR_Y },
  ],
  atriumLoop: [
    { x: 80, y: FLOOR_Y },
    { x: 80, y: 250 },
    { x: 250, y: 250 },
    { x: 250, y: FLOOR_Y },
  ],
  vaultLoop: [
    { x: 680, y: FLOOR_Y },
    { x: 680, y: FLOOR_Y - 140 },
    { x: 840, y: FLOOR_Y - 140 },
    { x: 840, y: FLOOR_Y },
  ],
  junctionLoop: [
    { x: 700, y: FLOOR_Y },
    { x: 700, y: FLOOR_Y - 130 },
    { x: 860, y: FLOOR_Y - 130 },
    { x: 860, y: FLOOR_Y },
  ],
  sporeLoop: [
    { x: 510, y: FLOOR_Y },
    { x: 510, y: 200 },
    { x: 770, y: 200 },
    { x: 770, y: FLOOR_Y },
  ],
  jumpLoop: [
    { x: 720, y: FLOOR_Y },
    { x: 720, y: 110 },
    { x: 850, y: 110 },
    { x: 850, y: FLOOR_Y },
  ],
  reactorLoop: [
    { x: 600, y: FLOOR_Y },
    { x: 600, y: 120 },
    { x: 820, y: 120 },
    { x: 820, y: FLOOR_Y },
  ],
};

export function createWorldState() {
  return {
    roomId: "dock",
    visited: new Set(["dock"]),
    acquired: new Set(),
    pickupsTaken: new Set(),
    doorMessage: "",
    objectiveLog: "Survey the station",
  };
}
