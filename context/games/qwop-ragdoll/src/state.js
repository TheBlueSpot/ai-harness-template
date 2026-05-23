import { CONFIG } from "./config.js";

export const GAME_PHASE = {
  MENU: "menu",
  RUNNING: "running",
  FALLEN: "fallen",
  FINISHED: "finished",
};

export function createInitialState(config = CONFIG) {
  const world = {
    width: config.worldWidth ?? CONFIG.worldWidth,
    height: config.worldHeight ?? CONFIG.worldHeight,
    groundY: config.groundY ?? CONFIG.groundY,
    startX: config.runnerStartX ?? CONFIG.runnerStartX,
    finishX:
      (config.runnerStartX ?? CONFIG.runnerStartX) +
      (config.finishDistance ?? CONFIG.finishDistance),
    cameraX: 0,
    obstacles: [],
  };
  return {
    phase: GAME_PHASE.MENU,
    distance: 0,
    bestDistance: 0,
    elapsed: 0,
    finishTime: null,
    reason: "ready",
    message: "Press Enter or Space to start.",
    world,
    runner: {
      bodies: {},
      joints: [],
      fallLatched: false,
    },
  };
}

export function derivePhase(state, config = CONFIG) {
  if (state.phase === GAME_PHASE.MENU) return GAME_PHASE.MENU;
  if (state.phase === GAME_PHASE.FINISHED) return GAME_PHASE.FINISHED;
  if (state.phase === GAME_PHASE.FALLEN) return GAME_PHASE.FALLEN;
  if (config.finishDistance != null && state.distance >= config.finishDistance) return GAME_PHASE.FINISHED;
  if (config.timeoutSeconds != null && state.elapsed >= config.timeoutSeconds) return GAME_PHASE.FALLEN;
  if (state.runner?.fallLatched) return GAME_PHASE.FALLEN;
  return GAME_PHASE.RUNNING;
}

export function getStatusMessage(phase) {
  if (phase === GAME_PHASE.FALLEN) return "Runner down. Press R to restart.";
  if (phase === GAME_PHASE.FINISHED) return "Finish reached. Press R to run again.";
  if (phase === GAME_PHASE.RUNNING) return "Running.";
  return "Press Enter or Space to start.";
}

export function createFrameState(state, config = CONFIG) {
  const phase = derivePhase(state, config);
  const runnerX = state.runner?.torso?.x ?? state.world?.startX ?? config.runnerStartX ?? CONFIG.runnerStartX;
  const viewportWidth = state.world?.width ?? config.worldWidth ?? CONFIG.worldWidth;
  const finishX =
    state.world?.finishX ??
    ((config.runnerStartX ?? CONFIG.runnerStartX) + (config.finishDistance ?? CONFIG.finishDistance));
  const cameraLead = config.cameraLead ?? CONFIG.cameraLead;
  const maxCameraX = Math.max(0, finishX + (config.finishPadding ?? CONFIG.finishPadding) - viewportWidth);
  const cameraX = Math.max(0, Math.min(maxCameraX, runnerX - cameraLead));
  return {
    phase,
    status: phase,
    message: state.message ?? getStatusMessage(phase),
    distance: state.distance,
    elapsed: state.elapsed,
    bestDistance: state.bestDistance,
    finishTime: state.finishTime ?? null,
    reason: state.reason ?? "ready",
    hud: {
      distance: state.distance,
      time: state.elapsed,
      bestDistance: state.bestDistance,
    },
    world: {
      ...state.world,
      finishX,
      cameraX,
    },
    runner: state.runner,
  };
}
