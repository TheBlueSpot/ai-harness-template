import { getTileAt, isClimbableTile, isSolidTile, TILE } from "./level.js";

function createActor(x, y, dir = 1) {
  return { x: x * TILE, y: y * TILE, vx: 0, vy: 0, w: 22, h: 28, dir, onGround: false };
}

export function createInitialState(level) {
  return {
    mode: "menu",
    time: 0,
    score: 0,
    message: "",
    player: createActor(level.spawn.x, level.spawn.y),
    enemies: level.enemySpawns.map((spawn) => createActor(spawn.x, spawn.y, spawn.dir)),
    collectibles: level.gold.map((gold) => ({ ...gold })),
    pits: level.pitSeeds.map((pit) => ({ ...pit, elapsed: 0, active: true })),
    escapeLadders: level.escapeLadders.map((ladder) => ({ ...ladder })),
    win: false,
    lose: false,
  };
}

function cloneRunState(state) {
  return {
    ...state,
    player: { ...state.player },
    enemies: state.enemies.map((enemy) => ({ ...enemy })),
    collectibles: state.collectibles.map((gold) => ({ ...gold })),
    pits: state.pits.map((pit) => ({ ...pit })),
    escapeLadders: state.escapeLadders.map((ladder) => ({ ...ladder })),
  };
}

export function stepPitTimers(state, dt) {
  const next = cloneRunState(state);
  next.pits = next.pits.map((pit) => {
    if (pit.active) return pit;
    const elapsed = pit.elapsed + dt;
    if (elapsed >= pit.duration) {
      return { ...pit, elapsed: 0, active: true };
    }
    return { ...pit, elapsed, active: false };
  });
  return next;
}

export function revealEscapeLadders(state) {
  const next = cloneRunState(state);
  next.escapeLadders = next.escapeLadders.map((ladder) => ({ ...ladder, revealed: true }));
  return next;
}

export function countCollectedGold(state) {
  return state.collectibles.filter((gold) => gold.collected).length;
}

export function allGoldCollected(state) {
  return state.collectibles.length > 0 && state.collectibles.every((gold) => gold.collected);
}

export function getEscapeLadderAt(state, x, y) {
  return state.escapeLadders.find((ladder) => ladder.revealed && ladder.x === x && ladder.y === y) || null;
}

export function isTileClimbable(level, state, x, y) {
  const tile = getTileAt(level, x, y);
  return isClimbableTile(tile) || Boolean(getEscapeLadderAt(state, x, y));
}

export function tileBlocksMovement(level, state, x, y) {
  const tile = getTileAt(level, x, y);
  if (!isSolidTile(tile)) return false;
  const pit = state.pits.find((entry) => entry.x === x && entry.y === y);
  return !(pit && pit.active === false);
}
