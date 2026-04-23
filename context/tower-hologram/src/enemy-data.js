function freeze(value) {
  return Object.freeze(value);
}

function makeTraits(traits = {}) {
  return freeze({ ...traits });
}

function makeEnemy(kind, data) {
  return freeze({
    kind,
    ...data,
    traits: makeTraits(data.traits ?? {}),
  });
}

function actionBase(type, data = {}) {
  return freeze({ type, ...data });
}

function burst(kind, count, spawnPoint = "left-mid", data = {}) {
  return actionBase("burst", {
    kind,
    count,
    spawnPoint,
    ...data,
  });
}

function interval(kind, count, every, spawnPoint = "left-mid", data = {}) {
  return actionBase("interval", {
    kind,
    count,
    every,
    spawnPoint,
    ...data,
  });
}

function wait(duration) {
  return actionBase("wait", { duration });
}

function mix(groups, data = {}) {
  return actionBase("mix", {
    groups: groups.map((group) => freeze({ ...group })),
    ...data,
  });
}

export const ENEMY_TYPES = freeze({
  scout: makeEnemy("scout", {
    label: "Scout",
    maxHealth: 40,
    speedCells: 1.6,
    radius: 12,
    tint: "#7df3ff",
    reward: 6,
  }),
  shell: makeEnemy("shell", {
    label: "Shell",
    maxHealth: 68,
    speedCells: 1.28,
    radius: 13,
    tint: "#7d8dff",
    reward: 8,
    traits: {
      splashResistance: 0.82,
      burnResistance: 1.08,
    },
  }),
  brute: makeEnemy("brute", {
    label: "Brute",
    maxHealth: 110,
    speedCells: 1.05,
    radius: 15,
    tint: "#ffae57",
    reward: 12,
    traits: {
      slowWeak: 1.4,
      burnResistance: 1.2,
    },
  }),
  warden: makeEnemy("warden", {
    label: "Warden",
    maxHealth: 170,
    speedCells: 0.92,
    radius: 17,
    tint: "#ffd580",
    reward: 20,
    traits: {
      shielded: true,
      slowResistance: 0.62,
      burnResistance: 0.92,
      disruptWeak: 1.28,
    },
  }),
  overseer: makeEnemy("overseer", {
    label: "Overseer",
    maxHealth: 320,
    speedCells: 0.78,
    radius: 22,
    tint: "#bffcff",
    reward: 42,
    boss: true,
    traits: {
      shielded: true,
      slowImmune: true,
      burnResistance: 0.78,
      disruptWeak: 1.4,
    },
  }),
  ember: makeEnemy("ember", {
    label: "Ember Shade",
    maxHealth: 52,
    speedCells: 1.5,
    radius: 11,
    tint: "#ff8c61",
    reward: 9,
    traits: {
      burnWeak: 1.7,
    },
  }),
  husk: makeEnemy("husk", {
    label: "Glacier Husk",
    maxHealth: 98,
    speedCells: 1.12,
    radius: 14,
    tint: "#9cc6ff",
    reward: 11,
    traits: {
      slowImmune: true,
    },
  }),
  prism: makeEnemy("prism", {
    label: "Prism Bulwark",
    maxHealth: 152,
    speedCells: 0.98,
    radius: 15,
    tint: "#a8f7ff",
    reward: 16,
    traits: {
      splashResistance: 0.55,
    },
  }),
  breaker: makeEnemy("breaker", {
    label: "Breaker Node",
    maxHealth: 128,
    speedCells: 1.18,
    radius: 14,
    tint: "#ffd06f",
    reward: 18,
    traits: {
      shieldbreakerPriority: true,
      targetPriority: 4,
    },
  }),
  flicker: makeEnemy("flicker", {
    label: "Flicker Shade",
    maxHealth: 88,
    speedCells: 1.3,
    radius: 12,
    tint: "#d5ffff",
    reward: 15,
    traits: {
      hidden: true,
      flicker: true,
      scanRequired: true,
    },
  }),
  projector: makeEnemy("projector", {
    label: "Shield Projector",
    maxHealth: 94,
    speedCells: 1.0,
    radius: 13,
    tint: "#7df3ff",
    reward: 20,
    traits: {
      shieldProjector: true,
      splashResistance: 0.9,
    },
    shieldAuraRadius: 92,
    shieldAuraStrength: 0.42,
  }),
  carrier: makeEnemy("carrier", {
    label: "Carrier Drone",
    maxHealth: 136,
    speedCells: 1.04,
    radius: 15,
    tint: "#b3fbff",
    reward: 22,
    traits: {
      carrier: true,
    },
    deathSpawn: [
      { kind: "ember", count: 4, spread: 0.35 },
      { kind: "flicker", count: 2, spread: 0.16 },
    ],
  }),
  lattice_overseer: makeEnemy("lattice_overseer", {
    label: "Lattice Crown",
    maxHealth: 780,
    speedCells: 0.72,
    radius: 26,
    tint: "#bffcff",
    reward: 120,
    boss: true,
    traits: {
      boss: true,
      hidden: false,
      shieldbreakerPriority: true,
      targetPriority: 6,
      slowImmune: true,
      burnResistance: 0.72,
      disruptWeak: 1.5,
    },
    shieldAuraRadius: 118,
    shieldAuraStrength: 0.3,
    deathSpawn: [
      { kind: "carrier", count: 3, spread: 0.28 },
      { kind: "flicker", count: 8, spread: 0.45 },
      { kind: "ember", count: 6, spread: 0.4 },
    ],
    disruption: {
      pulseSeconds: 2.5,
      fieldSeconds: 2.1,
      hardFieldWeight: 18,
      softFieldWeight: 12,
    },
  }),
});

export const DEFAULT_WAVES = freeze([
  freeze({
    name: "Signal",
    actions: [
      burst("scout", 6, "left-mid"),
      wait(1.0),
      interval("scout", 4, 0.18, "right-mid"),
      burst("shell", 2, "left-upper"),
    ],
  }),
  freeze({
    name: "Pulse",
    actions: [
      interval("scout", 5, 0.2, "left-upper"),
      wait(0.75),
      mix(
        [
          { kind: "scout", count: 3, every: 0.16 },
          { kind: "shell", count: 2, every: 0.22 },
        ],
        { spawnPoint: "right-lower" },
      ),
      burst("shell", 3, "left-lower"),
    ],
  }),
  freeze({
    name: "Rift",
    actions: [
      burst("scout", 4, "left-mid"),
      mix(
        [
          { kind: "shell", count: 3, every: 0.18 },
          { kind: "ember", count: 2, every: 0.2 },
        ],
        { spawnPoint: "right-upper" },
      ),
      wait(0.95),
      interval("brute", 3, 0.42, "left-upper"),
      burst("prism", 2, "right-mid"),
    ],
  }),
  freeze({
    name: "Echo",
    actions: [
      mix(
        [
          { kind: "shell", count: 4, every: 0.18 },
          { kind: "brute", count: 2, every: 0.28 },
        ],
        { spawnPoint: "left-lower" },
      ),
      wait(1.2),
      burst("breaker", 2, "right-lower"),
      interval("scout", 6, 0.14, "left-upper"),
    ],
  }),
  freeze({
    name: "Fracture",
    actions: [
      burst("ember", 4, "left-upper"),
      wait(0.6),
      mix(
        [
          { kind: "shell", count: 4, every: 0.16 },
          { kind: "prism", count: 2, every: 0.3 },
        ],
        { spawnPoint: "right-upper" },
      ),
      interval("brute", 5, 0.22, "left-mid"),
    ],
  }),
  freeze({
    name: "Overload",
    actions: [
      interval("husk", 4, 0.22, "left-lower"),
      wait(0.8),
      burst("projector", 2, "right-upper"),
      mix(
        [
          { kind: "breaker", count: 3, every: 0.16 },
          { kind: "shell", count: 4, every: 0.12 },
        ],
        { spawnPoint: "left-upper" },
      ),
    ],
  }),
  freeze({
    name: "Cascade",
    actions: [
      mix(
        [
          { kind: "brute", count: 4, every: 0.2 },
          { kind: "prism", count: 2, every: 0.28 },
          { kind: "carrier", count: 2, every: 0.34 },
        ],
        { spawnPoint: "right-mid" },
      ),
      wait(1.0),
      burst("flicker", 3, "left-mid"),
      interval("shell", 6, 0.16, "right-lower"),
    ],
  }),
  freeze({
    name: "Crown",
    actions: [
      wait(1.0),
      burst("overseer", 1, "right-mid"),
      burst("warden", 2, "left-upper"),
      interval("brute", 5, 0.2, "left-mid"),
      mix(
        [
          { kind: "projector", count: 2, every: 0.18 },
          { kind: "breaker", count: 3, every: 0.16 },
        ],
        { spawnPoint: "right-upper" },
      ),
    ],
  }),
  freeze({
    name: "Surge",
    actions: [
      burst("scout", 8, "left-upper"),
      wait(0.65),
      interval("shell", 8, 0.12, "right-upper"),
      burst("ember", 5, "left-mid"),
      burst("breaker", 2, "right-mid"),
    ],
  }),
  freeze({
    name: "Anomaly",
    actions: [
      mix(
        [
          { kind: "carrier", count: 3, every: 0.26 },
          { kind: "projector", count: 2, every: 0.2 },
        ],
        { spawnPoint: "left-lower" },
      ),
      wait(1.1),
      burst("prism", 4, "right-lower"),
      interval("flicker", 4, 0.24, "right-upper"),
    ],
  }),
  freeze({
    name: "Zenith",
    actions: [
      interval("breaker", 6, 0.18, "left-mid"),
      wait(0.7),
      mix(
        [
          { kind: "ember", count: 5, every: 0.14 },
          { kind: "husk", count: 4, every: 0.18 },
        ],
        { spawnPoint: "right-mid" },
      ),
      burst("warden", 3, "left-upper"),
    ],
  }),
  freeze({
    name: "Mirage",
    actions: [
      burst("flicker", 4, "left-upper"),
      wait(0.5),
      mix(
        [
          { kind: "shell", count: 4, every: 0.14 },
          { kind: "flicker", count: 4, every: 0.12 },
          { kind: "breaker", count: 2, every: 0.2 },
        ],
        { spawnPoint: "right-upper" },
      ),
      interval("carrier", 3, 0.34, "left-lower"),
    ],
  }),
  freeze({
    name: "Bastion",
    actions: [
      mix(
        [
          { kind: "husk", count: 6, every: 0.18 },
          { kind: "prism", count: 4, every: 0.22 },
        ],
        { spawnPoint: "left-mid" },
      ),
      wait(1.0),
      burst("projector", 3, "right-mid"),
      interval("brute", 6, 0.18, "right-lower"),
    ],
  }),
  freeze({
    name: "Halo",
    actions: [
      burst("ember", 6, "left-upper"),
      wait(0.45),
      interval("breaker", 7, 0.14, "right-upper"),
      mix(
        [
          { kind: "projector", count: 2, every: 0.16 },
          { kind: "carrier", count: 2, every: 0.22 },
        ],
        { spawnPoint: "left-lower" },
      ),
    ],
  }),
  freeze({
    name: "Eclipse",
    actions: [
      mix(
        [
          { kind: "carrier", count: 4, every: 0.2 },
          { kind: "flicker", count: 5, every: 0.12 },
          { kind: "prism", count: 4, every: 0.18 },
        ],
        { spawnPoint: "right-mid" },
      ),
      wait(0.8),
      interval("husk", 6, 0.16, "left-upper"),
      burst("overseer", 1, "right-lower"),
    ],
  }),
  freeze({
    name: "Lattice Crown",
    boss: true,
    actions: [
      wait(1.2),
      burst("projector", 4, "left-upper"),
      wait(0.9),
      mix(
        [
          { kind: "carrier", count: 4, every: 0.22 },
          { kind: "breaker", count: 5, every: 0.16 },
        ],
        { spawnPoint: "right-upper" },
      ),
      wait(1.25),
      burst("lattice_overseer", 1, "right-mid", { kind: "lattice_overseer" }),
      interval("flicker", 6, 0.16, "left-mid"),
      wait(0.85),
      mix(
        [
          { kind: "ember", count: 6, every: 0.12 },
          { kind: "prism", count: 4, every: 0.18 },
        ],
        { spawnPoint: "center-left" },
      ),
    ],
  }),
]);

export function getEnemyDefinition(kind) {
  return ENEMY_TYPES[kind] ?? ENEMY_TYPES.scout;
}
