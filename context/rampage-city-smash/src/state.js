import { BUILDINGS, BUILDING_SEGMENT_TYPES, MONSTER, PHASE, STAGE } from "./data.js";

function cloneSegments(layout) {
  return layout.map((count, column) => {
    const type = BUILDING_SEGMENT_TYPES[Math.min(column, BUILDING_SEGMENT_TYPES.length - 1)];
    return {
      type: type.key,
      maxDurability: type.durability,
      durability: type.durability,
      score: type.score,
      reward: type.reward,
      width: type.width,
      height: type.height,
      color: type.color,
      offset: column,
      count,
      destroyed: false,
    };
  });
}

export function createMonster() {
  return {
    x: 48,
    y: STAGE.groundY - STAGE.climbCeiling,
    vx: 0,
    vy: 0,
    facing: 1,
    health: MONSTER.maxHealth,
    maxHealth: MONSTER.maxHealth,
    onGround: true,
    onBuilding: null,
    attackCooldown: 0,
    hurtTimer: 0,
    slamTimer: 0,
  };
}

export function createBuildings() {
  return BUILDINGS.map((building) => ({
    id: building.id,
    x: building.x,
    baseY: STAGE.groundY,
    collapsed: false,
    collapseTimer: 0,
    score: 0,
    reward: 0,
    civiliansSaved: 0,
    segments: cloneSegments(building.segments),
  }));
}

export function createEnemy(type, time, index, overrides = {}) {
  const base = type === "tank"
    ? { hp: 56, speed: 52, attack: 16, width: 54, height: 28, altitude: 0 }
    : { hp: 40, speed: 92, attack: 10, width: 72, height: 24, altitude: 110 };
  return {
    id: `${type}-${Math.round(time * 10)}-${index}`,
    type,
    x: overrides.x ?? 1900,
    y: overrides.y ?? (type === "tank" ? STAGE.groundY - 24 : 170),
    hp: overrides.hp ?? base.hp,
    maxHp: overrides.hp ?? base.hp,
    speed: overrides.speed ?? base.speed,
    attack: overrides.attack ?? base.attack,
    width: base.width,
    height: base.height,
    altitude: base.altitude,
    attackCooldown: 1.2,
    alive: true,
  };
}

export function createPickup(kind, x, y) {
  return {
    id: `${kind}-${Math.round(x)}-${Math.round(y)}`,
    kind,
    x,
    y,
    ttl: 12,
    radius: 18,
    collected: false,
  };
}

export function createDebris(x, y, count = 4) {
  return Array.from({ length: count }, (_, index) => ({
    id: `debris-${Math.round(x)}-${Math.round(y)}-${index}`,
    x,
    y,
    vx: (index % 2 === 0 ? -1 : 1) * (36 + index * 8),
    vy: -60 - index * 14,
    life: 1,
    size: 6 + (index % 3) * 3,
  }));
}

export function createRuntimeState() {
  return {
    phase: PHASE.MENU,
    outcome: "none",
    time: 0,
    score: 0,
    targetScore: STAGE.targetScore,
    health: MONSTER.maxHealth,
    monster: createMonster(),
    buildings: createBuildings(),
    enemies: [],
    debris: [],
    pickups: [],
    camera: { x: 0, y: 0 },
    waveIndex: 0,
    nextWaveIndex: 0,
    nextPickupAt: STAGE.startDelay + RUN_PICKUP_TIME_FALLBACK,
    nextSpawnAt: 0,
    prompt: "Press Enter to start the smash",
    alert: "",
    overlay: {
      eyebrow: "Arcade run",
      title: "Rampage City Smash",
      copy: "Climb the skyline, crush targets, and keep moving.",
      button: "Start",
    },
    hud: {
      time: 0,
      score: 0,
      health: MONSTER.maxHealth,
      targetScore: STAGE.targetScore,
      destroyed: 0,
      civilians: 0,
      wavesCleared: 0,
    },
    win: false,
    lose: false,
  };
}

const RUN_PICKUP_TIME_FALLBACK = 9;

export function resetRuntimeState(state) {
  const fresh = createRuntimeState();
  Object.keys(fresh).forEach((key) => {
    state[key] = fresh[key];
  });
  return state;
}
