import { BARRICADE, ECONOMY, PHASES, WORLD } from "../config.js";
import { clamp, getBarricadeRatio } from "../state.js";
import { resolveScavengeAction } from "./scavenge.js";

export function applyProgression(state, dt, input = {}) {
  if (state.phase === PHASES.DAY) {
    handleDayInteraction(state, input);
  } else if (state.phase === PHASES.NIGHT) {
    handleNightPressure(state, dt, input);
  }

  state.player.ammo = state.ammo;
  state.player.health = clamp(state.player.health, 0, state.player.maxHealth);
  state.barricade.hp = clamp(state.barricade.hp, 0, state.barricade.maxHp);
  state.survivorsAlive = state.survivors.filter((survivor) => !survivor.dead).length;
  updateStatus(state);
  return state;
}

export function resolveOutcome(state) {
  if (state.survivorsAlive <= 0 || state.player.health <= 0 || state.barricade.hp <= 0) {
    state.phase = PHASES.LOSE;
    state.message = "The barricade collapsed under the horde.";
    state.status = "Run ended. Restart to try a cleaner defense.";
    return state;
  }

  if (state.phase === PHASES.DAY && state.day > WORLD.maxDaysToWin) {
    state.phase = PHASES.WIN;
    state.message = "Dawn broke and the horde dispersed.";
    state.status = "The line held. You got everyone through the last night.";
  }

  return state;
}

function handleDayInteraction(state, input) {
  const wantsInteract = Boolean(input.confirm) && !state.interactionLock;
  if (!wantsInteract) {
    state.interactionLock = Boolean(input.confirm);
    return;
  }

  const site = findNearbySite(state);
  if (site && !site.collected) {
    const loot = resolveScavengeAction(state, site);
    state.message = `Scavenged ${site.id}: +${loot.scrap} scrap${loot.ammo ? `, +${loot.ammo} ammo` : ""}.`;
    state.status = loot.medkit ? "Found a medkit in the sweep." : "Street cleared. Move to the next marked stop.";
    state.interactionLock = true;
    return;
  }

  if (isNearBarricade(state)) {
    if (state.barricade.hp < state.barricade.maxHp && state.scrap >= ECONOMY.repairCost) {
      state.scrap -= ECONOMY.repairCost;
      state.barricade.hp = Math.min(state.barricade.maxHp, state.barricade.hp + ECONOMY.repairAmount);
      state.message = "Day repair complete.";
      state.status = "Boards reset. The wall will last longer tonight.";
    } else if (state.scrap >= ECONOMY.upgradeCost && state.barricade.level < 2) {
      state.scrap -= ECONOMY.upgradeCost;
      state.barricade.level += 1;
      state.barricade.maxHp += 18;
      state.barricade.hp = Math.min(state.barricade.maxHp, state.barricade.hp + 18);
      state.message = "Barricade upgraded.";
      state.status = "Heavier plating installed before sunset.";
    } else if (state.scrap >= ECONOMY.ammoBundleCost) {
      state.scrap -= ECONOMY.ammoBundleCost;
      state.ammo += ECONOMY.ammoBundleAmount;
      state.message = "Ammo cache restocked.";
      state.status = "The firing line has more breathing room tonight.";
    } else {
      state.message = "Not enough scrap for repairs or supplies.";
      state.status = "Search more of the street before sundown.";
    }
    state.interactionLock = true;
    return;
  }

  state.interactionLock = true;
}

function handleNightPressure(state, dt, input) {
  state.barricade.hp = Math.max(0, state.barricade.hp - BARRICADE.nightlyDecay * Math.max(0, dt));
  if (Boolean(input.confirm) && !state.interactionLock && isNearBarricade(state) && state.scrap >= BARRICADE.emergencyPatchCost) {
    state.scrap -= BARRICADE.emergencyPatchCost;
    state.barricade.hp = Math.min(state.barricade.maxHp, state.barricade.hp + BARRICADE.emergencyPatchAmount);
    state.message = "Emergency patch nailed into the barricade.";
    state.status = "You bought a few more seconds.";
    state.interactionLock = true;
    return;
  }

  if (!input.confirm) {
    state.interactionLock = false;
  }
}

function updateStatus(state) {
  const ratio = getBarricadeRatio(state);
  if (state.phase === PHASES.DAY) {
    const remaining = (state.scavengeSites ?? []).filter((site) => !site.collected).length;
    if (remaining > 0) {
      state.status = `Scavenge ${remaining} marked stop${remaining === 1 ? "" : "s"} or return to the barricade to spend scrap.`;
    } else if (ratio < 0.7) {
      state.status = "Street cleared. Spend daylight on repairs before sundown.";
    }
    return;
  }

  if (state.phase === PHASES.NIGHT) {
    if (ratio < 0.25) {
      state.status = "Barricade critical. Patch now or the survivors get overrun.";
    } else if ((state.zombies ?? []).length > 6) {
      state.status = "Heavy pressure on the wall. Prioritize the runners and headshots.";
    }
  }
}

function findNearbySite(state) {
  const player = state.player;
  return (state.scavengeSites ?? []).find((site) => {
    if (site.collected) {
      return false;
    }
    return Math.hypot((site.x ?? 0) - player.x, (site.y ?? 0) - player.y) <= (site.radius ?? 32) + (player.radius ?? 16);
  }) ?? null;
}

function isNearBarricade(state) {
  const player = state.player;
  const barricade = state.barricade;
  return Math.hypot(barricade.x - player.x, barricade.y - player.y) <= 110;
}
