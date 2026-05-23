export const GAME_MODE = Object.freeze({
  MENU: "menu",
  PLAY: "play",
  CRASH: "crash",
  WIN: "win",
  LOSE: "lose",
});

export const DEFAULT_LAPS = 3;

export function createState() {
  return createRunState();
}

export function createRunState() {
  return {
    mode: GAME_MODE.MENU,
    lap: 1,
    lapsTotal: DEFAULT_LAPS,
    speed: 0,
    time: 0,
    distance: 0,
    heat: 0,
    launchAssistTimer: 0,
    crashTimer: 0,
    resultTimer: 0,
    message: "Press Start to race.",
    rider: createRiderState(),
    result: createResultState(),
  };
}

export function createRiderState() {
  return {
    x: 120,
    y: 0,
    lean: 0,
    airborne: false,
    crashed: false,
  };
}

export function createResultState() {
  return {
    completed: false,
    reason: null,
  };
}

export function resetForStart(state) {
  const next = createRunState();
  next.mode = GAME_MODE.PLAY;
  next.speed = 180;
  next.launchAssistTimer = 1.25;
  next.message = "Track open. Hold Up to keep pace and Left/Right to level the bike over jumps.";
  return next;
}

export function enterCrashState(state, reason) {
  return {
    ...state,
    mode: GAME_MODE.CRASH,
    crashTimer: 1.1,
    heat: Math.max(state.heat, 0.65),
    speed: Math.max(0, state.speed * 0.45),
    message: reason || "Crash! Recover and restart.",
    rider: {
      ...state.rider,
      crashed: true,
      airborne: false,
      lean: 0,
    },
    result: {
      completed: false,
      reason: reason || "crash",
    },
  };
}

export function enterResultState(state, won, reason) {
  return {
    ...state,
    mode: won ? GAME_MODE.WIN : GAME_MODE.LOSE,
    resultTimer: 0,
    message: won ? "Race won. Press Start for another run." : reason || "Run over. Press Start to restart the course.",
    result: {
      completed: true,
      reason: reason || (won ? "finish" : "lose"),
    },
  };
}
