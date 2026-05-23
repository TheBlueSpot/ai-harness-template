export const ENTITY_TYPES = Object.freeze({
  HERO: "hero",
  HAZARD: "hazard",
  BOMB: "bomb",
  DEBRIS: "debris",
});

export const WORLD = Object.freeze({
  width: 24000,
  height: 2400,
  skyTop: 0,
  groundBase: 1540,
  horizonY: 430,
  sampleStep: 14,
});

export const PHYSICS = Object.freeze({
  gravity: 1850,
  airDrag: 0.0016,
  linearDamping: 0.998,
  angularDamping: 0.992,
  maxSpeed: 1650,
  maxDownwardSpeed: 1800,
  maxUpwardSpeed: 920,
  terminalSpeed: 2200,
  groundRestitution: 0.54,
  groundFriction: 0.12,
  hazardRestitution: 0.58,
  hazardFriction: 0.16,
  bombRestitution: 0.84,
  bounceSleepSpeed: 80,
  settleSpeed: 30,
  settleTime: 0.55,
});

export const LAUNCH = Object.freeze({
  releasePowerMin: 860,
  releasePowerMax: 1760,
  releaseAngleMin: -0.62,
  releaseAngleMax: 0.28,
  releaseSpinMin: -11,
  releaseSpinMax: 18,
  midairThrust: 780,
  midairLift: 0.68,
  midairFuelMax: 1,
  fuelDrainPerSecond: 0.24,
  fuelRegenPerSecond: 0.07,
  altitudeAssist: 0.5,
  driftControl: 0.9,
  speedCapBuffer: 0.92,
});

export const COLLISION = Object.freeze({
  heroRadius: 26,
  hazardRadius: 32,
  hazardKnockback: 680,
  bombRadius: 28,
  bombBlastRadius: 152,
  bombBlastImpulse: 1140,
  bombDirectHitImpulse: 920,
  terrainProbePadding: 3,
  contactGrace: 0.06,
  scorePerMeter: 12,
  scorePerHit: 140,
  scorePerBomb: 260,
  scorePerCombo: 55,
});

export const SCORING = Object.freeze({
  altitudeBonusFactor: 6,
  airtimeBonusFactor: 3,
  hardImpactBonusFactor: 0.45,
  bombChainBonusFactor: 0.65,
});

export const RUN_STATES = Object.freeze({
  READY: "ready",
  LAUNCHED: "launched",
  AIRBORNE: "airborne",
  SETTLING: "settling",
  FINISHED: "finished",
});

export const DEFAULT_RUN_STATS = Object.freeze({
  score: 0,
  distance: 0,
  altitude: 0,
  maxAltitude: 0,
  maxSpeed: 0,
  airtime: 0,
  impacts: 0,
  bombs: 0,
  hazards: 0,
  bounces: 0,
  combo: 0,
  settled: false,
});

export const DEFAULT_HAZARD_LAYOUT = Object.freeze([
  { x: 1440, kind: "spike", radius: 34, score: 120 },
  { x: 1910, kind: "spike", radius: 40, score: 130 },
  { x: 2400, kind: "crusher", radius: 46, score: 180 },
  { x: 3290, kind: "spike", radius: 32, score: 140 },
  { x: 3860, kind: "spike", radius: 36, score: 150 },
  { x: 4510, kind: "grinder", radius: 43, score: 170 },
  { x: 5750, kind: "spike", radius: 36, score: 160 },
  { x: 6220, kind: "crusher", radius: 48, score: 190 },
  { x: 7410, kind: "spike", radius: 35, score: 165 },
]);

export const DEFAULT_BOMB_LAYOUT = Object.freeze([
  { x: 880, kind: "satchel", radius: 26, blastRadius: 152, blastImpulse: 1240, score: 220, fuse: 0 },
  { x: 2080, kind: "satchel", radius: 28, blastRadius: 160, blastImpulse: 1360, score: 250, fuse: 0.1 },
  { x: 2960, kind: "mine", radius: 30, blastRadius: 176, blastImpulse: 1450, score: 300, fuse: 0 },
  { x: 5120, kind: "mine", radius: 31, blastRadius: 184, blastImpulse: 1520, score: 320, fuse: 0.15 },
  { x: 6840, kind: "satchel", radius: 28, blastRadius: 168, blastImpulse: 1480, score: 300, fuse: 0 },
]);

export const PARTICLE_PALETTES = Object.freeze({
  ground: ["#ffd26f", "#ff8f5a", "#fff3c4"],
  hazard: ["#84f7ff", "#49bfff", "#e0ffff"],
  bomb: ["#ffe07a", "#ff6d4d", "#ffffff"],
  smoke: ["#4b515b", "#75808d", "#b5c0cf"],
});

