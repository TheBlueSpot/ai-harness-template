const GROUND_Y = 540;

const surfaces = [
  { kind: "flat", startX: 0, endX: 520, y: 540 },
  { kind: "slope", startX: 520, endX: 760, y1: 540, y2: 454 },
  { kind: "loop", startX: 760, endX: 1160, centerX: 960, centerY: 384, radius: 156 },
  { kind: "slope", startX: 1160, endX: 1560, y1: 454, y2: 518 },
  { kind: "flat", startX: 1560, endX: 2200, y: 518 },
  { kind: "slope", startX: 2200, endX: 2520, y1: 518, y2: 460 },
  { kind: "flat", startX: 2520, endX: 2800, y: 460 },
];

const hazards = [
  { id: "spike-a", x: 700, y: 526, radius: 24, damage: 1 },
  { id: "spike-b", x: 1470, y: 506, radius: 26, damage: 1 },
  { id: "spike-c", x: 2070, y: 526, radius: 24, damage: 1 },
];

export function sampleTrack(world) {
  return { surfaces, hazards, finish: world.finish, checkpoints: world.checkpoints };
}

export function getSurfaceContact(track, player, airborneOnly = false) {
  const surface = track.surfaces.find((item) => player.x >= item.startX && player.x <= item.endX);
  if (!surface) return null;
  if (surface.kind === "loop") {
    const dx = player.x - surface.centerX;
    const dy = player.y - surface.centerY;
    const dist = Math.hypot(dx, dy) || surface.radius;
    const onLoop = Math.abs(dist - surface.radius) < 18;
    const normalX = dx / dist;
    const normalY = dy / dist;
    const tangent = -normalY;
    const normalForce = Math.max(0, player.speed * player.speed / surface.radius - 900);
    return {
      attached: onLoop && !airborneOnly,
      release: !onLoop,
      point: {
        x: surface.centerX + normalX * surface.radius,
        y: surface.centerY + normalY * surface.radius,
      },
      tangent,
      normalForce,
      minAdhesionSpeed: 280,
    };
  }

  const t = (player.x - surface.startX) / (surface.endX - surface.startX || 1);
  const y = surface.kind === "flat" ? surface.y : surface.y1 + (surface.y2 - surface.y1) * t;
  return {
    attached: !airborneOnly && player.y >= y - 14,
    release: player.y < y - 32,
    point: { x: player.x, y },
    tangent: surface.kind === "flat" ? 0 : Math.atan2(surface.y2 - surface.y1, surface.endX - surface.startX),
    normalForce: 9999,
    minAdhesionSpeed: 0,
  };
}

export function updateCollectedRings(state) {
  for (const ring of state.rings.list) {
    if (ring.collected) continue;
    const dx = state.player.x - ring.x;
    const dy = state.player.y - ring.y;
    if (Math.hypot(dx, dy) < ring.radius + 18) {
      ring.collected = true;
      state.rings.collected += 1;
    }
  }

  for (let index = state.rings.temp.length - 1; index >= 0; index -= 1) {
    const ring = state.rings.temp[index];
    if ((ring.collectDelay ?? 0) > 0) continue;
    const dx = state.player.x - ring.x;
    const dy = state.player.y - ring.y;
    if (Math.hypot(dx, dy) < (ring.radius ?? 7) + 18) {
      state.rings.collected = Math.min(state.rings.total, state.rings.collected + 1);
      state.rings.temp.splice(index, 1);
    }
  }
}

export function buildRingScatter(origin, count) {
  return Array.from({ length: count }, (_, index) => ({
    x: origin.x,
    y: origin.y,
    vx: Math.cos(index) * (140 + index * 10),
    vy: -220 + index * 22,
    life: 1.8,
    radius: 7,
    collectDelay: 0.18,
  }));
}

export function getTrackBounds() {
  return { left: 0, right: 2800, groundY: GROUND_Y };
}
