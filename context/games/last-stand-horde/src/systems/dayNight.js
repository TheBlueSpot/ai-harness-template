import { PHASES, WORLD } from "../config.js";
import { clamp01 } from "../state.js";

export function advanceDayNight(state, dt) {
  if (state.phase !== PHASES.DAY && state.phase !== PHASES.NIGHT) {
    return state;
  }

  const seconds = Math.max(0, Number(dt) || 0);
  state.cycleClock += seconds;
  state.cycleLength = state.phase === PHASES.DAY ? WORLD.dayDuration : WORLD.nightDuration;
  state.night = state.phase === PHASES.NIGHT ? clamp01(state.cycleClock / state.cycleLength) : 0;

  let transition = null;
  if (state.phase === PHASES.DAY && state.cycleClock >= state.cycleLength) {
    transition = PHASES.NIGHT;
  } else if (state.phase === PHASES.NIGHT && state.cycleClock >= state.cycleLength) {
    state.day += 1;
    transition = PHASES.DAY;
  }

  return transition;
}
