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
    openingSlamCommitted: false,
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
    callout: null,
  };
}

export function createFrameState(run, upgrades, shop, overlay) {
  const activeSlamWindow = run.queueIndex === 0 ? GAME_CONSTANTS.openingSlamWindow : GAME_CONSTANTS.slamWindow;
  const overlayType = run.phase === "menu" ? "menu" : run.phase === "result" ? "result" : null;
  const slamWindowLive = run.totalLaunches > 0
    && run.queueIndex === 0
    && run.slamReady
    && !run.player.grounded
    && run.player.vy > 0
    && run.slamTimer <= activeSlamWindow;
  const coach = buildCoach(run, slamWindowLive);
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
      slamWindow: activeSlamWindow,
      slamWindowLive,
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
    coach,
    callout: run.callout ? { ...run.callout } : null,
    upgradeEffects: upgrades,
    status: run.message,
    distance: run.distance,
    speed: Math.hypot(run.player.vx, run.player.vy),
    coins: run.coins,
    combo: run.combo,
    queue: { index: run.queueIndex, total: run.queueTotal },
  };
}

function buildCoach(run, slamWindowLive) {
  if (run.phase === "menu") {
    return {
      title: "Start the launcher",
      copy: "The ring auto-fires. First lesson is simple: wait for the drop, then slam.",
      tone: "wait",
    };
  }
  if (run.phase === "paused") {
    return {
      title: "Run paused",
      copy: "Resume when you are ready to rejoin the drop.",
      tone: "wait",
    };
  }
  if (run.phase === "result") {
    return {
      title: "Bank and retry",
      copy: "Restart fast, then convert the first drop into a rebound chain.",
      tone: "wait",
    };
  }
  if (run.totalLaunches === 0) {
    return {
      title: "Wait for auto-launch",
      copy: "Stay ready. The slam matters after the bison starts falling.",
      tone: "wait",
    };
  }
  if (slamWindowLive) {
    return {
      title: "Slam now",
      copy: "Drive through the first glowing gummy for the biggest opener rebound.",
      tone: "slam",
    };
  }
  if (run.slamActive) {
    return {
      title: "Ride the rebound",
      copy: "Stay in the lane and chain the next gummy before speed bleeds out.",
      tone: "hit",
    };
  }
  if (!run.player.grounded && run.player.vy <= 0) {
    return {
      title: "Hold the slam",
      copy: "The cue matters on descent. Wait for the fall before you commit.",
      tone: "wait",
    };
  }
  return {
    title: "Track the lane",
    copy: "Stay above the glowing target. The next clean drop resets your chain window.",
    tone: "wait",
  };
}
