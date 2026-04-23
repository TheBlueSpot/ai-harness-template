export const SCENES = {
  MENU: "menu",
  PLAYING: "playing",
  LOSE: "lose",
  WIN: "win",
};

function levelName(level) {
  return level?.name ?? "Unknown Route";
}

export function createInitialGameState(levelCount = 0) {
  return {
    scene: SCENES.MENU,
    levelIndex: 0,
    levelCount,
    levelName: "First Drop",
    totalDeaths: 0,
    completed: false,
    message: "Press jump or Enter to begin the first route.",
    justTransitioned: true,
  };
}

export function enterMenu(state, level, levelCount = state.levelCount) {
  return {
    ...state,
    scene: SCENES.MENU,
    levelIndex: 0,
    levelCount,
    levelName: levelName(level),
    completed: false,
    message: "Every death becomes a ghost. Start when ready.",
    justTransitioned: true,
  };
}

export function enterPlaying(state, levelIndex = state.levelIndex, level = null, levelCount = state.levelCount) {
  return {
    ...state,
    scene: SCENES.PLAYING,
    levelIndex,
    levelCount,
    levelName: levelName(level),
    completed: false,
    message: "Air-strafe, cut jumps early, and use the wall.",
    justTransitioned: true,
  };
}

export function enterLose(state, deathCount = state.totalDeaths, level = null, levelCount = state.levelCount) {
  return {
    ...state,
    scene: SCENES.LOSE,
    totalDeaths: deathCount,
    levelCount,
    levelName: levelName(level),
    message: "Restart to race the ghost swarm.",
    justTransitioned: true,
  };
}

export function enterWin(state, deathCount = state.totalDeaths, level = null, levelCount = state.levelCount) {
  return {
    ...state,
    scene: SCENES.WIN,
    totalDeaths: deathCount,
    levelCount,
    levelName: levelName(level),
    completed: true,
    message: "Run complete. The swarm still remembers every mistake.",
    justTransitioned: true,
  };
}
