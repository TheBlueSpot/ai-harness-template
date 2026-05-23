export function createRunState(world, defs) {
  return {
    phase: "menu",
    time: 0,
    score: 0,
    health: 6,
    carried: 0,
    recruited: 0,
    rescueCount: 0,
    command: { x: world.base.x + 120, y: world.base.y - 40 },
    leader: spawnLeader(world),
    squad: defs.initialPikmin.map((pikmin, index) => spawnPikmin(world, pikmin, index)),
    thrown: [],
    pellets: defs.tasks
      .filter((task) => task.id.startsWith("pellet"))
      .map((task) => ({ ...task, delivered: false, liftedBy: 0, carried: false, carriedOffset: 0 })),
    gates: defs.tasks
      .filter((task) => task.id.startsWith("gate"))
      .map((task) => ({ ...task, progress: 0, open: false })),
    enemies: defs.enemies.map((enemy) => ({
      ...enemy,
      health: enemy.health,
      defeated: false,
      vx: 0,
      vy: 0,
    })),
    prompt: "Guide the leader, whistle the idle squad, and move to the first pellet.",
    result: "",
    overlay: "menu",
    menuTitle: "Pikmin Swarm",
    menuEyebrow: "Launch",
  };
}

export function spawnLeader(world) {
  return { x: world.base.x, y: world.base.y, vx: 0, vy: 0 };
}

export function spawnPikmin(world, pikmin, index) {
  return {
    id: index,
    kind: pikmin.kind,
    x: pikmin.x,
    y: pikmin.y,
    vx: 0,
    vy: 0,
    mode: "idle",
    targetId: null,
    carryId: null,
    homeX: pikmin.x,
    homeY: pikmin.y,
    alive: true,
  };
}

export function cloneForFrame(entity) {
  return { ...entity };
}
