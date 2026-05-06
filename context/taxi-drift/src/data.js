export const CITY = {
  width: 2800,
  height: 1800,
  blockSize: 320,
  roadWidth: 120,
  roadShoulderGrace: 42,
  offroadDrag: 0.93,
  offroadGrip: 0.82,
};

export const STANDS = [
  { id: "downtown", label: "Downtown", x: 360, y: 320, color: "#8affc1" },
  { id: "arcade", label: "Arcade", x: 1480, y: 320, color: "#ffe36d" },
  { id: "market", label: "Night Market", x: 2440, y: 320, color: "#ff9e6d" },
  { id: "station", label: "Rail Station", x: 360, y: 900, color: "#7fe0ff" },
  { id: "plaza", label: "Sunset Plaza", x: 1480, y: 900, color: "#d6a3ff" },
  { id: "harbor", label: "Harbor", x: 2440, y: 900, color: "#69f0ae" },
  { id: "theater", label: "Theater", x: 360, y: 1480, color: "#ff7bd3" },
  { id: "hotel", label: "Sky Hotel", x: 1480, y: 1480, color: "#6dd0ff" },
  { id: "terminal", label: "Airport Link", x: 2440, y: 1480, color: "#ffd26d" },
];

const ROAD_CENTER = CITY.roadWidth / 2;

export const TRAFFIC_ROUTES = [
  // Keep AI traffic fully inside painted road lanes so collision rules read the same for player and traffic.
  { id: "h-north-east", axis: "x", startX: 120, endX: 2680, y: CITY.blockSize + ROAD_CENTER, speed: 260, direction: 1, color: "#ff6d57" },
  { id: "h-mid-west", axis: "x", startX: 2680, endX: 120, y: CITY.blockSize * 3 + ROAD_CENTER, speed: 220, direction: -1, color: "#57b8ff" },
  { id: "h-south-east", axis: "x", startX: 120, endX: 2680, y: CITY.blockSize * 5 + ROAD_CENTER, speed: 300, direction: 1, color: "#ffd857" },
  { id: "v-west-south", axis: "y", x: CITY.blockSize + ROAD_CENTER, startY: 120, endY: 1680, speed: 240, direction: 1, color: "#7dff87" },
  { id: "v-center-north", axis: "y", x: CITY.blockSize * 4 + ROAD_CENTER, startY: 1680, endY: 120, speed: 260, direction: -1, color: "#ff7de8" },
  { id: "v-east-south", axis: "y", x: CITY.blockSize * 7 + ROAD_CENTER, startY: 120, endY: 1680, speed: 280, direction: 1, color: "#7cecff" },
];

export const GAME_RULES = {
  targetFares: 5,
  startTime: 95,
  pickupRadius: 100,
  dropoffRadius: 118,
  pickupPreviewRadius: 144,
  dropoffPreviewRadius: 168,
  pickupSpeedLimit: 140,
  dropoffSpeedLimit: 160,
  trafficDamage: 22,
  maxHealth: 100,
  comboDecayPerSecond: 0.35,
};

export function createFareSequence() {
  return [
    ["downtown", "station"],
    ["arcade", "hotel"],
    ["market", "plaza"],
    ["theater", "terminal"],
    ["harbor", "downtown"],
    ["station", "market"],
    ["hotel", "harbor"],
  ].map(([pickupId, dropoffId]) => ({ pickupId, dropoffId }));
}

export function createTrafficCars() {
  return [
    { id: "car-1", routeId: "h-north-east", offset: 0.12 },
    { id: "car-2", routeId: "h-north-east", offset: 0.58 },
    { id: "car-3", routeId: "h-mid-west", offset: 0.24 },
    { id: "car-4", routeId: "h-mid-west", offset: 0.82 },
    { id: "car-5", routeId: "h-south-east", offset: 0.42 },
    { id: "car-6", routeId: "v-west-south", offset: 0.1 },
    { id: "car-7", routeId: "v-center-north", offset: 0.5 },
    { id: "car-8", routeId: "v-east-south", offset: 0.76 },
  ];
}
