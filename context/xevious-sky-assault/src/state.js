import { GAME_CONFIG } from "./data.js";

export function createPlayer(width, height) {
  return {
    x: width * 0.5,
    y: height * 0.75,
    angle: 0,
    fireAir: 0,
    fireGround: 0,
  };
}

export function createGameState(width = GAME_CONFIG.width, height = GAME_CONFIG.height) {
  return {
    width,
    height,
    mode: "menu",
    time: 0,
    score: 0,
    lives: 3,
    radar: 0,
    scroll: 0,
    banner: "Press Start",
    alert: "Launch ready",
    over: false,
    waveIndex: 0,
    nextSpawn: 0.6,
    player: createPlayer(width, height),
    shots: [],
    bombs: [],
    airEnemies: [],
    groundTargets: [],
    radarMarks: [],
    stripes: [],
  };
}

export function resetDynamicState(state) {
  state.time = 0;
  state.score = 0;
  state.lives = 3;
  state.radar = 0;
  state.scroll = 0;
  state.banner = "Press Start";
  state.alert = "Launch ready";
  state.over = false;
  state.waveIndex = 0;
  state.nextSpawn = 0.6;
  state.player = createPlayer(state.width, state.height);
  state.shots = [];
  state.bombs = [];
  state.airEnemies = [];
  state.groundTargets = [];
  state.radarMarks = [];
  state.stripes = [];
  return state;
}

