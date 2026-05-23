import { buildRingScatter, getTrackBounds } from "./track.js";

export function createRuntimeState() {
  const world = {
    finish: { x: 2720, y: 460 },
    checkpoints: [
      { id: "cp-1", x: 620, y: 540, message: "Checkpoint 1." },
      { id: "cp-2", x: 1540, y: 518, message: "Checkpoint 2." },
      { id: "cp-3", x: 2260, y: 468, message: "Checkpoint 3." },
    ],
    bounds: getTrackBounds(),
    fallY: 880,
  };

  return {
    world,
    gravity: 2400,
    mode: "menu",
    status: "Ready",
    message: "Press Start Run.",
    timer: 0,
    speed: 0,
    rings: {
      collected: 0,
      total: 24,
      list: createRingList(),
      temp: [],
    },
    activeHazardId: null,
    damageCooldown: 0,
    activeCheckpointId: null,
    lastCheckpoint: null,
    viewport: { width: 0, height: 0 },
    player: {
      x: 120,
      y: 540,
      vx: 0,
      vy: 0,
      ax: 0,
      speed: 0,
      grounded: true,
      attached: true,
      crouch: 0,
      spin: false,
      canJump: 0.12,
      normalForce: 0,
    },
    tuning: {
      detachNormalForce: 180,
    },
  };
}

export function stepRuntimeState(state, dt) {
  state.damageCooldown = Math.max(0, state.damageCooldown - dt);
  state.rings.temp = state.rings.temp.filter((ring) => (ring.life -= dt) > 0);
  for (const ring of state.rings.temp) {
    ring.x += ring.vx * dt;
    ring.y += ring.vy * dt;
    ring.vy += state.gravity * 0.45 * dt;
    ring.collectDelay = Math.max(0, (ring.collectDelay ?? 0) - dt);
  }
  state.player.canJump = Math.min(0.12, state.player.canJump + dt);
}

export function scatterRingsFromDamage(state, count = state.rings.collected) {
  const lostCount = Math.max(0, Math.min(state.rings.collected, count));
  const burst = buildRingScatter({ x: state.player.x, y: state.player.y }, lostCount);
  state.rings.temp.push(...burst);
  state.rings.collected -= lostCount;
  state.damageCooldown = 0.8;
  return { burst, lostCount };
}

export function getCheckpointByX(checkpoints, x) {
  let active = null;
  for (const checkpoint of checkpoints) {
    if (x >= checkpoint.x) active = checkpoint;
  }
  return active;
}

export function getModeTransition(mode, values) {
  if (mode === "running" && values.rings >= 24) {
    return null;
  }
  return null;
}

export function buildFrameState(state, track) {
  const camera = {
    x: Math.max(state.world.bounds.left, Math.min(state.player.x - 320, state.world.bounds.right)),
    y: Math.max(0, state.player.y - 180),
  };
  return {
    state: state.mode,
    status: state.status,
    message: state.message,
    time: state.timer,
    timer: state.timer,
    speed: state.speed,
    guard: state.rings.collected > 0 ? "Rings Up" : "Exposed",
    rings: { collected: state.rings.collected, total: state.rings.total },
    player: { ...state.player },
    surfaces: track.surfaces.map((surface) => ({ ...surface })),
    ringsList: state.rings.list.map((ring) => ({ ...ring })),
    ringScatter: state.rings.temp.map((ring) => ({ ...ring })),
    hazards: track.hazards,
    finish: track.finish,
    loop: { centerX: 960, centerY: 384, radius: 156 },
    checkpoint: state.lastCheckpoint,
    mode: state.mode,
    viewport: state.viewport,
    camera,
    overlays: {
      canRestart: state.mode === "win" || state.mode === "lose",
      checkpoint: state.lastCheckpoint ? state.lastCheckpoint.message : null,
    },
  };
}

function createRingList() {
  const positions = [
    { x: 172, y: 522 },
    { x: 232, y: 514 },
    { x: 292, y: 506 },
    { x: 352, y: 498 },
    { x: 432, y: 492 },
    { x: 516, y: 478 },
    { x: 602, y: 464 },
    { x: 676, y: 452 },
    { x: 780, y: 326 },
    { x: 844, y: 270 },
    { x: 908, y: 236 },
    { x: 960, y: 228 },
    { x: 1012, y: 236 },
    { x: 1076, y: 270 },
    { x: 1140, y: 326 },
    { x: 1232, y: 456 },
    { x: 1320, y: 470 },
    { x: 1412, y: 484 },
    { x: 1504, y: 498 },
    { x: 1630, y: 498 },
    { x: 1810, y: 498 },
    { x: 1990, y: 498 },
    { x: 2270, y: 486 },
    { x: 2460, y: 468 },
  ];

  return positions.map((point, index) => ({
    id: `ring-${index}`,
    x: point.x,
    y: point.y,
    radius: 11,
    collected: false,
  }));
}
