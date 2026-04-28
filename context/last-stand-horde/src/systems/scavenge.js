export function rollScavengeLoot(state, location = {}) {
  const seed = location.seed ?? hashLocation(location, state.day ?? 1);
  const loot = {
    scrap: 2 + (seed % 4),
    ammo: location.kind === "ammo" ? 5 + (seed % 3) : seed % 3,
    medkit: location.kind === "med" || seed % 7 === 0,
    parts: 1 + (seed % 2),
  };

  state.scrap += loot.scrap;
  state.ammo += loot.ammo;
  state.inventory.medkit += loot.medkit ? 1 : 0;
  state.inventory.parts += loot.parts;
  state.lastScavenge = loot;
  return loot;
}

export function resolveScavengeAction(state, location) {
  if (state.phase !== "day") {
    return null;
  }
  const site = (state.scavengeSites ?? []).find((entry) => entry.id === location.id);
  if (!site || site.collected) {
    return null;
  }
  const loot = rollScavengeLoot(state, site);
  site.collected = true;
  return loot;
}

function hashLocation(location, day) {
  const x = Math.round(Number(location.x) || 0);
  const y = Math.round(Number(location.y) || 0);
  return Math.abs((x * 19 + y * 13 + day * 23) | 0);
}
