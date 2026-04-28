const DEFAULT_WEAPONS = ["buster"];

export function createWeaponState() {
  return {
    equipped: "buster",
    unlocked: new Set(DEFAULT_WEAPONS),
    inventory: new Map(DEFAULT_WEAPONS.map((weaponId) => [weaponId, { ammo: Infinity, unlocked: true }])),
    rewardQueue: [],
    pendingReward: null,
    lastFiredAt: 0,
    fireCooldown: 0,
  };
}

export function grantBossWeapon(state, weaponId) {
  if (!weaponId) return false;
  if (!state.weapon) state.weapon = createWeaponState();
  const weaponState = state.weapon;
  weaponState.unlocked.add(weaponId);
  weaponState.inventory.set(weaponId, { ammo: Infinity, unlocked: true });
  weaponState.rewardQueue.push(weaponId);
  weaponState.pendingReward = weaponId;
  weaponState.equipped = weaponId;
  return true;
}

export function equipWeapon(state, weaponId) {
  if (!state.weapon?.unlocked?.has(weaponId)) return false;
  state.weapon.equipped = weaponId;
  return true;
}
