import { GAME } from "./data.js";

function makeTank(width = 1600, height = 900) {
  const w = Math.round(width * 0.72);
  const h = Math.round(height * 0.68);
  return { x: Math.round((width - w) * 0.5), y: Math.round(height * 0.18), width: w, height: h };
}

export function createInitialState(config = {}) {
  const width = config.width ?? 1600;
  const height = config.height ?? 900;
  return {
    phase: "menu",
    time: 0,
    elapsed: 0,
    width,
    height,
    tank: makeTank(width, height),
    sun: GAME.startSun,
    score: GAME.startSun,
    fish: [],
    food: [],
    coins: [],
    eggs: [],
    aliens: [],
    shots: [],
    bubbles: [],
    pets: [{ id: 1, type: "snail", x: 0.12, y: 0.86, support: 0.05 }],
    spawn: { fish: 0, coin: 0, alien: 0 },
    progression: { eggs: 0, unlockedEggs: 0, targetEggs: 0 },
    cursor: { x: 0.5, y: 0.5, active: false },
    hud: { status: "Tank idle", threat: "Calm", tip: "Start the tank and feed fish to build sun." },
    overlay: {
      eyebrow: "Tank start",
      title: "Insaniquarium Tide",
      copy: "Feed fish, bank sun, unlock eggs, and keep aliens off the tank.",
      button: "Start",
    },
    result: "menu",
    win: false,
    lose: false,
    nextFishId: 1,
    nextFoodId: 1,
    nextCoinId: 1,
    nextEggId: 1,
    nextAlienId: 1,
    nextShotId: 1,
    nextBubbleId: 1,
  };
}

export function resetRuntimeState(state, config = {}) {
  const fresh = createInitialState({ width: state.width, height: state.height, ...config });
  Object.assign(state, fresh);
  return state;
}

export function makeFishState(type, x, y) {
  return { type, x, y, vx: 0, vy: 0, hunger: 0, energy: 1, facing: 1, alive: true, eating: 0, stunned: 0 };
}
