import {
  COLLISION,
  DEFAULT_BOMB_LAYOUT,
  DEFAULT_HAZARD_LAYOUT,
  ENTITY_TYPES,
  LAUNCH,
  PHYSICS,
  WORLD,
} from "./constants.js";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function createHero(overrides = {}) {
  return {
    id: overrides.id ?? "hero",
    type: ENTITY_TYPES.HERO,
    x: overrides.x ?? 190,
    y: overrides.y ?? WORLD.groundBase - 140,
    vx: overrides.vx ?? 0,
    vy: overrides.vy ?? 0,
    ax: 0,
    ay: 0,
    radius: overrides.radius ?? COLLISION.heroRadius,
    mass: overrides.mass ?? 1.9,
    spin: overrides.spin ?? 0,
    angle: overrides.angle ?? 0,
    grounded: true,
    launched: false,
    settled: false,
    alive: true,
    fuel: clamp(overrides.fuel ?? LAUNCH.midairFuelMax, 0, LAUNCH.midairFuelMax),
    combo: 0,
    impactCooldown: 0,
    lastContact: null,
    distance: 0,
    altitude: 0,
    maxAltitude: 0,
    maxSpeed: 0,
    airtime: 0,
    bounceCount: 0,
    hazardHits: 0,
    bombHits: 0,
    particles: [],
  };
}

export function createHazard(overrides = {}) {
  return {
    id: overrides.id ?? `hazard-${Math.random().toString(36).slice(2, 8)}`,
    type: ENTITY_TYPES.HAZARD,
    kind: overrides.kind ?? "spike",
    x: overrides.x ?? 0,
    y: overrides.y ?? WORLD.groundBase,
    radius: overrides.radius ?? COLLISION.hazardRadius,
    damage: overrides.damage ?? 1,
    score: overrides.score ?? COLLISION.scorePerHit,
    restitution: overrides.restitution ?? PHYSICS.hazardRestitution,
    friction: overrides.friction ?? PHYSICS.hazardFriction,
    knockback: overrides.knockback ?? COLLISION.hazardKnockback,
    active: overrides.active ?? true,
    wobble: overrides.wobble ?? 0,
  };
}

export function createBomb(overrides = {}) {
  return {
    id: overrides.id ?? `bomb-${Math.random().toString(36).slice(2, 8)}`,
    type: ENTITY_TYPES.BOMB,
    kind: overrides.kind ?? "satchel",
    x: overrides.x ?? 0,
    y: overrides.y ?? WORLD.groundBase,
    radius: overrides.radius ?? COLLISION.bombRadius,
    blastRadius: overrides.blastRadius ?? COLLISION.bombBlastRadius,
    blastImpulse: overrides.blastImpulse ?? COLLISION.bombBlastImpulse,
    score: overrides.score ?? COLLISION.scorePerBomb,
    fuse: overrides.fuse ?? 0,
    armed: overrides.armed ?? true,
    detonated: overrides.detonated ?? false,
    active: overrides.active ?? true,
    smokeLife: overrides.smokeLife ?? 0,
  };
}

export function createDebris(overrides = {}) {
  return {
    id: overrides.id ?? `debris-${Math.random().toString(36).slice(2, 8)}`,
    type: ENTITY_TYPES.DEBRIS,
    x: overrides.x ?? 0,
    y: overrides.y ?? 0,
    vx: overrides.vx ?? 0,
    vy: overrides.vy ?? 0,
    life: overrides.life ?? 0.7,
    radius: overrides.radius ?? 6,
    color: overrides.color ?? "#ffe07a",
    gravity: overrides.gravity ?? PHYSICS.gravity * 0.46,
  };
}

export function buildCourseEntities() {
  const hazards = DEFAULT_HAZARD_LAYOUT.map((hazard) =>
    createHazard({
      ...hazard,
      y: WORLD.groundBase - 8,
    }),
  );

  const bombs = DEFAULT_BOMB_LAYOUT.map((bomb) =>
    createBomb({
      ...bomb,
      y: WORLD.groundBase - 20,
    }),
  );

  return { hazards, bombs };
}

export function cloneHero(hero) {
  return {
    ...hero,
    particles: [...hero.particles],
  };
}

