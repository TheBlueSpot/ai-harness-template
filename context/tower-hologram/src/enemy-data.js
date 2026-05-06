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
  phase_titan: makeEnemy("phase_titan", {
    label: "Phase Titan",
    maxHealth: 248,
    speedCells: 1.42,
    radius: 18,
    tint: "#9ce6ff",
    reward: 28,
    traits: {
      phaseShift: true,
      splashResistance: 0.34,
      burnResistance: 0.88,
      targetPriority: 5,
    },
  }),
  echo_weaver: makeEnemy("echo_weaver", {
    label: "Echo Weaver",
    maxHealth: 122,
    speedCells: 1.26,
    radius: 14,
    tint: "#d7f7ff",
    reward: 20,
    traits: {
      hidden: true,
      flicker: true,
      scanRequired: true,
      splashResistance: 0.76,
      mirrorCaster: true,
    },
    deathSpawn: [
      { kind: "flicker", count: 2, spread: 0.18 },
      { kind: "ember", count: 2, spread: 0.16 },
    ],
  }),
  mirror_archon: makeEnemy("mirror_archon", {
    label: "Mirror Archon",
    maxHealth: 560,
    speedCells: 0.98,
    radius: 24,
    tint: "#d8ffff",
    reward: 86,
    boss: true,
    traits: {
      boss: true,
      phaseShift: true,
      splashResistance: 0.4,
      shielded: true,
      slowResistance: 0.84,
      burnResistance: 0.82,
      disruptWeak: 1.28,
      targetPriority: 6,
    },
    shieldAuraRadius: 104,
    shieldAuraStrength: 0.24,
    deathSpawn: [
      { kind: "phase_titan", count: 2, spread: 0.2 },
      { kind: "echo_weaver", count: 3, spread: 0.24 },
    ],
    disruption: {
      pulseSeconds: 2.2,
      fieldSeconds: 1.7,
      hardFieldWeight: 15,
      softFieldWeight: 10,
    },
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
  gap_colossus: makeEnemy("gap_colossus", {
    label: "Gap Colossus",
    maxHealth: 264,
    speedCells: 1.48,
    radius: 19,
    tint: "#aef8ff",
    reward: 30,
    traits: {
      phaseShift: true,
      splashResistance: 0.28,
      burnResistance: 0.92,
      targetPriority: 5,
    },
  }),
  lattice_seraph: makeEnemy("lattice_seraph", {
    label: "Lattice Seraph",
    maxHealth: 176,
    speedCells: 1.18,
    radius: 16,
    tint: "#d8fcff",
    reward: 26,
    traits: {
      shieldProjector: true,
      mirrorCaster: true,
      hidden: true,
      scanRequired: true,
      splashResistance: 0.7,
      targetPriority: 5,
    },
    shieldAuraRadius: 108,
    shieldAuraStrength: 0.26,
  }),
  holo_regent: makeEnemy("holo_regent", {
    label: "Holo Regent",
    maxHealth: 980,
    speedCells: 0.84,
    radius: 30,
    tint: "#dffeff",
    reward: 150,
    boss: true,
    traits: {
      boss: true,
      phaseShift: true,
      shielded: true,
      mirrorCaster: true,
      splashResistance: 0.46,
      slowResistance: 0.78,
      burnResistance: 0.8,
      disruptWeak: 1.34,
      targetPriority: 7,
    },
    shieldAuraRadius: 126,
    shieldAuraStrength: 0.32,
    deathSpawn: [
      { kind: "gap_colossus", count: 2, spread: 0.22 },
      { kind: "lattice_seraph", count: 3, spread: 0.28 },
      { kind: "echo_weaver", count: 4, spread: 0.34 },
    ],
    disruption: {
      pulseSeconds: 1.9,
      fieldSeconds: 2.3,
      hardFieldWeight: 20,
      softFieldWeight: 13,
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
    briefing: "First crown-class breach. Strip shields early so the Phase Titans do not sprint through the center lane.",
    actions: [
      wait(1.0),
      burst("overseer", 1, "right-mid"),
      burst("warden", 2, "left-upper"),
      interval("phase_titan", 3, 0.52, "left-mid"),
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
      interval("echo_weaver", 3, 0.36, "right-upper"),
      burst("flicker", 3, "left-mid"),
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
      interval("phase_titan", 4, 0.58, "right-lower"),
      burst("breaker", 3, "left-upper"),
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
    name: "Parallax",
    actions: [
      burst("echo_weaver", 3, "left-upper"),
      wait(0.55),
      interval("phase_titan", 4, 0.62, "right-mid"),
      mix(
        [
          { kind: "projector", count: 3, every: 0.18 },
          { kind: "carrier", count: 3, every: 0.24 },
        ],
        { spawnPoint: "left-lower" },
      ),
      burst("breaker", 4, "right-upper"),
    ],
  }),
  freeze({
    name: "Mirrorfall",
    boss: true,
    briefing: "Mirror Archon folds false walls across the field. Keep reveal towers online before the boss anchors.",
    actions: [
      wait(0.9),
      burst("projector", 3, "left-upper"),
      mix(
        [
          { kind: "echo_weaver", count: 4, every: 0.18 },
          { kind: "breaker", count: 4, every: 0.16 },
        ],
        { spawnPoint: "right-upper" },
      ),
      wait(1.0),
      burst("mirror_archon", 1, "left-mid", { kind: "mirror_archon" }),
      interval("phase_titan", 3, 0.7, "right-mid"),
      burst("carrier", 2, "left-lower"),
    ],
  }),
  freeze({
    name: "Hardlight",
    briefing: "Hardlight waves stack bruisers from opposite rails. Save one fast lane answer for the right-mid breach.",
    actions: [
      mix(
        [
          { kind: "phase_titan", count: 4, every: 0.58 },
          { kind: "prism", count: 5, every: 0.16 },
        ],
        { spawnPoint: "right-mid" },
      ),
      wait(0.7),
      burst("echo_weaver", 4, "left-upper"),
      interval("husk", 5, 0.16, "left-lower"),
      mix(
        [
          { kind: "projector", count: 2, every: 0.16 },
          { kind: "breaker", count: 5, every: 0.14 },
        ],
        { spawnPoint: "right-upper" },
      ),
    ],
  }),
  freeze({
    name: "Lattice Crown",
    boss: true,
    briefing: "The lattice crown floods the board with fake pressure. Stabilize center-left before the crown core arrives.",
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
  freeze({
    name: "Ghost Columns",
    briefing: "Gap Colossi sprint in long intervals. Use the breathing room between drops to retarget and rebuild.",
    actions: [
      interval("gap_colossus", 4, 1.15, "left-mid"),
      wait(0.65),
      mix(
        [
          { kind: "echo_weaver", count: 4, every: 0.2 },
          { kind: "breaker", count: 3, every: 0.2 },
        ],
        { spawnPoint: "right-upper" },
      ),
      burst("carrier", 2, "left-lower"),
    ],
  }),
  freeze({
    name: "Seraph Net",
    briefing: "Lattice Seraphs cast mirrored shield webs while fast tanks punch the open route.",
    actions: [
      mix(
        [
          { kind: "lattice_seraph", count: 3, every: 0.45 },
          { kind: "gap_colossus", count: 3, every: 0.9 },
        ],
        { spawnPoint: "right-mid" },
      ),
      wait(0.8),
      burst("projector", 3, "left-upper"),
      interval("flicker", 5, 0.14, "left-lower"),
    ],
  }),
  freeze({
    name: "Regent Broadcast",
    boss: true,
    briefing: "Holo Regent seeds phase walls and shield lattices. Break the shell, then burn the exposed core before the next pulse.",
    actions: [
      wait(1.0),
      burst("lattice_seraph", 2, "left-upper"),
      mix(
        [
          { kind: "gap_colossus", count: 3, every: 0.88 },
          { kind: "breaker", count: 4, every: 0.18 },
        ],
        { spawnPoint: "right-upper" },
      ),
      wait(1.0),
      burst("holo_regent", 1, "left-mid", { kind: "holo_regent" }),
      interval("carrier", 3, 0.28, "right-lower"),
      burst("echo_weaver", 4, "left-lower"),
    ],
  }),
]);

export function getEnemyDefinition(kind) {
  return ENEMY_TYPES[kind] ?? ENEMY_TYPES.scout;
}
