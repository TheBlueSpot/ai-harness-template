export const UPGRADE_DEFINITIONS = [
  { id: "lift", name: "Wing Camber", description: "More lift at slow airspeed.", cost: 18 },
  { id: "thrust", name: "Fuel Mix", description: "Faster launch and stronger climb.", cost: 20 },
  { id: "glide", name: "Glide Slick", description: "Lower drag in cruise and descent.", cost: 22 },
  { id: "thermal", name: "Thermal Sense", description: "Better thermal pickup and hang time.", cost: 24 },
];

export function createProgression() {
  return {
    coins: 0,
    owned: { lift: 0, thrust: 0, glide: 0, thermal: 0 },
    selected: "lift",
  };
}

export function applyRunPayout(progress, payout) {
  return { ...progress, coins: progress.coins + Math.max(0, payout) };
}

export function selectUpgrade(progress, upgradeId) {
  if (!UPGRADE_DEFINITIONS.some((upgrade) => upgrade.id === upgradeId)) return progress;
  return { ...progress, selected: upgradeId };
}

export function purchaseUpgrade(progress, upgradeId) {
  const upgrade = UPGRADE_DEFINITIONS.find((item) => item.id === upgradeId);
  if (!upgrade) return { progress, purchased: false };
  const owned = progress.owned[upgradeId] || 0;
  const cost = upgrade.cost + owned * 8;
  if (progress.coins < cost) return { progress, purchased: false };
  return {
    purchased: true,
    progress: {
      ...progress,
      coins: progress.coins - cost,
      owned: { ...progress.owned, [upgradeId]: owned + 1 },
      selected: upgradeId,
    },
  };
}

export function getShopInventory(progress) {
  return UPGRADE_DEFINITIONS.map((upgrade) => ({
    ...upgrade,
    owned: progress.owned[upgrade.id] || 0,
    selected: progress.selected === upgrade.id,
    price: upgrade.cost + (progress.owned[upgrade.id] || 0) * 8,
  }));
}

export function deriveLoadout(progress) {
  return {
    lift: 1 + (progress.owned.lift || 0) * 0.08,
    thrust: 1 + (progress.owned.thrust || 0) * 0.1,
    glide: 1 - Math.min(0.28, (progress.owned.glide || 0) * 0.05),
    thermal: 1 + (progress.owned.thermal || 0) * 0.12,
  };
}

