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
    health: 3,
    rings: {
      collected: 0,
      total: 24,
      list: createRingList(),
      temp: [],
    },
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
  }
  state.player.canJump = Math.min(0.12, state.player.canJump + dt);
}

export function scatterRingsFromDamage(state, count = 8) {
  const burst = buildRingScatter({ x: state.player.x, y: state.player.y }, count);
  state.rings.temp.push(...burst);
  state.rings.collected = Math.max(0, state.rings.collected - count);
  state.damageCooldown = 0.8;
  state.health = Math.max(0, state.health - 1);
  return burst;
}

export function getCheckpointByX(checkpoints, x) {
  let active = null;
  for (const checkpoint of checkpoints) {
    if (x >= checkpoint.x) active = checkpoint;
  }
  return active;
}

export function getModeTransition(mode, values) {
  if (mode === "running" && values.health <= 0) {
    return { mode: "lose", status: "Lost", message: "No rings left." };
  }
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
    health: state.health,
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
  const points = [];
  for (let i = 0; i < 24; i += 1) {
    points.push({
      id: `ring-${i}`,
      x: 260 + i * 92,
      y: i < 8 ? 500 - i * 10 : i < 16 ? 400 + Math.sin(i * 0.65) * 24 : 470 - (i - 16) * 16,
      radius: 11,
      collected: false,
    });
  }
  return points;
}
