const DEFAULT_LAYOUT = [
  "###############",
  "#.............#",
  "#.###.#####.###",
  "#.#...#...#...#",
  "#.#.#.#.#.#.#.#",
  "#...#...#...#.#",
  "###.#.###.#.###",
  "#...#.....#...#",
  "#.###.###.###.#",
  "#.#...#...#...#",
  "#.#.###.###.#.#",
  "#...#.....#...#",
  "###.#.#####.#.#",
  "#.............#",
  "###############"
];

export const DEFAULT_CONFIG = {
  maze: {
    layout: DEFAULT_LAYOUT,
    tileSize: 40,
    playerSpawn: { row: 1, col: 1 },
    exitCell: { row: 13, col: 13 },
    ghostSpawns: [
      { row: 7, col: 11 },
      { row: 9, col: 3 }
    ]
  },
  player: {
    radius: 14,
    speed: 220,
    dangerSenseRadius: 172
  },
  lighting: {
    radius: 240,
    fov: Math.PI * 0.95,
    rayCount: 108,
    darkness: 0.94,
    exposureCurve: 1.65,
    angleCurve: 1.4,
    debugRays: false
  },
  ghosts: {
    radius: 15,
    sightRadius: 300,
    patrolSpeed: 44,
    searchSpeed: 76,
    huntSpeed: 120,
    captureRadius: 18,
    awarenessGain: 1.2,
    awarenessDecay: 0.22,
    searchThreshold: 0.26,
    huntThreshold: 0.68,
    memoryDuration: 2.5,
    repathInterval: 0.18,
    waypointReach: 12,
    debugLabels: false
  },
  debug: {
    enabled: false,
    showPaths: false,
    showRays: false
  }
};

export const createPacShadowsConfig = (overrides = {}) => {
  const config = cloneValue(DEFAULT_CONFIG);
  mergeDeep(config, readRuntimeOverrides());
  mergeDeep(config, overrides);
  return config;
};

export const installPacShadowsHooks = (config) => {
  const root = globalThis;
  const api = {
    config,
    patch(next = {}) {
      mergeDeep(config, next);
      return config;
    },
    reset() {
      replaceDeep(config, cloneValue(DEFAULT_CONFIG));
      return config;
    },
    snapshot() {
      return cloneValue(config);
    },
    toggleDebug(force) {
      config.debug.enabled = typeof force === "boolean" ? force : !config.debug.enabled;
      return config.debug.enabled;
    }
  };

  root.__PAC_SHADOWS__ = api;
  root.__PAC_SHADOWS_CONFIG__ = config;
  return api;
};

const readRuntimeOverrides = () => {
  const root = globalThis;
  const override = root.__PAC_SHADOWS_CONFIG__;
  return isPlainObject(override) ? override : {};
};

const mergeDeep = (target, source) => {
  if (!isPlainObject(source)) {
    return target;
  }

  for (const [key, value] of Object.entries(source)) {
    if (Array.isArray(value)) {
      target[key] = value.map((entry) => cloneValue(entry));
      continue;
    }

    if (isPlainObject(value)) {
      const base = isPlainObject(target[key]) ? target[key] : {};
      target[key] = mergeDeep(base, value);
      continue;
    }

    target[key] = value;
  }

  return target;
};

const replaceDeep = (target, source) => {
  for (const key of Object.keys(target)) {
    delete target[key];
  }
  mergeDeep(target, source);
  return target;
};

const cloneValue = (value) => {
  if (Array.isArray(value)) {
    return value.map((entry) => cloneValue(entry));
  }

  if (isPlainObject(value)) {
    const clone = {};
    for (const [key, entry] of Object.entries(value)) {
      clone[key] = cloneValue(entry);
    }
    return clone;
  }

  return value;
};

const isPlainObject = (value) =>
  typeof value === "object" && value !== null && value.constructor === Object;
