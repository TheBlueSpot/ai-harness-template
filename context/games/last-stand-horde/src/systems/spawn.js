import { WORLD, ZOMBIE } from "../config.js";
import { createZombie } from "../entities/zombie.js";

export function spawnWave(state, seed = 0) {
  const initialCount = 3 + Math.min(4, state.day);
  state.spawn.totalSpawnBudget = initialCount + state.day * 2;
  state.spawn.spawnedCount = 0;
  state.spawn.spawnTimer = 1.2;
  state.spawn.spawnedThisNight = true;
  state.zombies = [];
  for (let index = 0; index < initialCount; index += 1) {
    state.zombies.push(createNightZombie(state, seed + index, index));
  }
  state.spawn.spawnedCount = initialCount;
  return state.zombies;
}

export function updateNightSpawns(state, dt) {
  if (!state.spawn.spawnedThisNight || state.spawn.spawnedCount >= state.spawn.totalSpawnBudget) {
    return state.zombies;
  }

  state.spawn.spawnTimer -= dt;
  if (state.spawn.spawnTimer > 0) {
    return state.zombies;
  }

  const extra = state.day >= 3 ? 2 : 1;
  for (let index = 0; index < extra && state.spawn.spawnedCount < state.spawn.totalSpawnBudget; index += 1) {
    const offset = state.spawn.spawnedCount + index;
    state.zombies.push(createNightZombie(state, state.spawn.waveSeed + offset, offset));
    state.spawn.spawnedCount += 1;
  }
  state.spawn.spawnTimer = Math.max(1.8, ZOMBIE.spawnIntervalBase - state.day * 0.35);
  return state.zombies;
}

function createNightZombie(state, seed, index) {
  const type = pickZombieType(state.day, seed);
  const baseY = state.arena.groundY - 18;
  const rowOffset = (index % 3) * 18;
  return createZombie(type, {
    id: `night-${state.day}-${index}`,
    x: state.arena.width + 40 + (index % 4) * 36,
    y: baseY - rowOffset,
  });
}

function pickZombieType(day, seed) {
  const roll = Math.abs(Math.sin((seed + 1) * 17.13)) % 1;
  if (day >= 3 && roll > 0.72) {
    return "brute";
  }
  if (roll > 0.4) {
    return "runner";
  }
  return "walker";
}
