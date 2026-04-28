import { BOSS_CORE_MAX, BOSS_SHIELD_MAX, HULL_MAX, OPTION_COUNT, POWER_BAR_SLOTS, SHIELD_MAX } from "./constants.js";

export function createInitialState(width = 960, height = 540) {
  return {
    view: { width, height, dpr: 1 },
    mode: "menu",
    time: 0,
    score: 0,
    lives: 3,
    shield: SHIELD_MAX,
    hull: HULL_MAX,
    powerBarIndex: 0,
    powerBarReady: false,
    powerBarLabel: "SPEED",
    powerBarFlash: 0,
    overlayEyebrow: "Mission",
    overlayTitle: "Gradius Option-Drive",
    overlayCopy: "Press Start to launch.",
    overlayButton: "Start",
    alert: "",
    player: makePlayer(width, height),
    options: Array.from({ length: OPTION_COUNT }, () => ({ x: width * 0.2, y: height * 0.7, r: 13, ready: false })),
    pickups: [],
    enemies: [],
    projectiles: [],
    boss: makeBoss(width, height),
    stars: [],
    waves: [],
    obstacles: [],
    bossState: "idle",
    weaponState: "NORMAL",
    overlay: { show: true, title: "Gradius Option-Drive", copy: "Press Start to launch." },
  };
}

export function makePlayer(width, height) {
  return {
    x: width * 0.2,
    y: height * 0.7,
    vx: 0,
    vy: 0,
    invuln: 0,
    fireCooldown: 0,
    history: [],
    weapon: 0,
    speedLevel: 0,
    optionCount: 0,
  };
}

export function makeBoss(width, height) {
  return {
    active: false,
    phase: "idle",
    x: width + 220,
    y: height * 0.34,
    w: 180,
    h: 120,
    shield: BOSS_SHIELD_MAX,
    core: BOSS_CORE_MAX,
    shieldVisible: false,
    coreOpen: false,
    enterTimer: 0,
    attackTimer: 0,
  };
}

export function clampPowerSlot(slot) {
  return Math.max(0, Math.min(POWER_BAR_SLOTS - 1, slot));
}
