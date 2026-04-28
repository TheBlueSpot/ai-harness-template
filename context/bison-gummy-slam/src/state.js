import { GAME_CONSTANTS, UPGRADE_DEFS } from "./data.js";

export function createUpgradeState() {
  return UPGRADE_DEFS.map((upgrade) => ({
    ...upgrade,
    level: upgrade.owned ? 1 : 0,
    owned: Boolean(upgrade.owned),
    effect: { ...upgrade.effect },
  }));
}

export function createRunState(width = GAME_CONSTANTS.arenaWidth, height = GAME_CONSTANTS.arenaHeight) {
  return {
    phase: "menu",
    elapsed: 0,
    width,
    height,
    distance: 0,
    maxSpeed: 0,
    coins: 0,
    score: 0,
    combo: 0,
    bestCombo: 0,
    chainCount: 0,
    slamReady: false,
    slamActive: false,
    slamTimer: 0,
    launchCharge: 0,
    launchCooldown: 0,
    totalLaunches: 0,
    bounceChain: 0,
    message: "Press start, let the launcher auto-fire, then time the first slam.",
    player: {
      x: GAME_CONSTANTS.launcherX,
      y: GAME_CONSTANTS.launcherBaseY,
      vx: 0,
      vy: 0,
      radius: 22,
      grounded: false,
      launcherCharge: 0,
    },
    world: { width, height, groundY: GAME_CONSTANTS.groundY },
    entities: [],
    queueIndex: 0,
    queueTotal: 0,
    overlay: null,
    shopOpen: false,
    lastContactAt: 0,
  };
}

export function createFrameState(run, upgrades, shop, overlay) {
  const overlayType = run.phase === "menu" ? "menu" : run.phase === "result" ? "result" : null;
  return {
    state: run.phase,
    player: {
      x: run.player.x,
      y: run.player.y,
      vx: run.player.vx,
      vy: run.player.vy,
      grounded: run.player.grounded,
      launcherCharge: run.player.launcherCharge,
      slamReady: run.slamReady,
      slamActive: run.slamActive,
      slamTimer: run.slamTimer,
      totalLaunches: run.totalLaunches,
    },
    world: {
      width: run.world.width,
      height: run.world.height,
      groundY: run.world.groundY,
    },
    entities: run.entities.map((entity) => ({ ...entity })),
    queueItems: run.entities.map((entity, index) => ({
      id: entity.id,
      gummy: entity.type === "boss" ? "boss" : "normal",
      x: entity.x,
      y: entity.y,
      alive: entity.alive,
      target: index === 0,
      laneGuide: index < 3,
    })),
    hud: {
      distance: run.distance,
      speed: Math.hypot(run.player.vx, run.player.vy),
      coins: run.coins,
      combo: run.combo,
      bestCombo: run.bestCombo,
      score: run.score,
      chainCount: run.chainCount,
      queue: { index: run.queueIndex, total: run.queueTotal },
      message: run.message,
    },
    shop,
    overlay,
    overlayType,
    upgradeEffects: upgrades,
    status: run.message,
    distance: run.distance,
    speed: Math.hypot(run.player.vx, run.player.vy),
    coins: run.coins,
    combo: run.combo,
    queue: { index: run.queueIndex, total: run.queueTotal },
  };
}
