const OFFER_CATALOG = [
  {
    id: "reload-speed",
    label: "Faster Reload",
    description: "Shave reload time so the house keeps hearing thunder.",
    kind: "reload",
    baseCost: 14,
    costStep: 10,
    maxPurchases: 4,
    value: 0.18,
  },
  {
    id: "clip-size",
    label: "Bigger Clip",
    description: "Pack more rounds before the next reload cycle.",
    kind: "ammo",
    baseCost: 18,
    costStep: 12,
    maxPurchases: 4,
    value: 3,
  },
  {
    id: "auto-turret",
    label: "Auto Turret",
    description: "Deploy a support gun that rips at the front runner.",
    kind: "turret",
    baseCost: 28,
    costStep: 18,
    maxPurchases: 3,
    value: 1,
  },
  {
    id: "sniper-hire",
    label: "Hire Sniper",
    description: "Add an allied sniper with closest-to-house target priority.",
    kind: "ally",
    allyRole: "sniper",
    baseCost: 34,
    costStep: 20,
    maxPurchases: 3,
    value: 1,
  },
  {
    id: "craftsman-hire",
    label: "Hire Craftsman",
    description: "Bring in a craftsman to stitch the house back together.",
    kind: "ally",
    allyRole: "craftsman",
    baseCost: 30,
    costStep: 18,
    maxPurchases: 3,
    value: 1,
  },
];

const getCostForLevel = (offer, level) => offer.baseCost + offer.costStep * level;

const cloneOffer = (offer, purchasedCount, context = {}) => {
  const maxed = purchasedCount >= offer.maxPurchases;
  const cost = maxed ? offer.baseCost : getCostForLevel(offer, purchasedCount);
  return {
    id: offer.id,
    label: offer.label,
    description: offer.description,
    kind: offer.kind,
    allyRole: offer.allyRole ?? null,
    value: offer.value,
    cost,
    purchasedCount,
    maxPurchases: offer.maxPurchases,
    level: purchasedCount,
    nextLevel: Math.min(offer.maxPurchases, purchasedCount + 1),
    maxed,
    affordable: (context.gold ?? 0) >= cost,
    status: maxed ? "MAXED" : (context.gold ?? 0) >= cost ? "READY" : "LOCKED",
  };
};

export class UpgradeTree {
  constructor() {
    this.reset();
  }

  reset() {
    this.purchases = new Map();
  }

  getOffers(context = {}) {
    return OFFER_CATALOG.map((offer) => cloneOffer(offer, this.purchases.get(offer.id) ?? 0, context));
  }

  applyPurchase(offerId, runtimeState = {}) {
    const offer = OFFER_CATALOG.find((item) => item.id === offerId);
    if (!offer) return null;
    const purchasedCount = this.purchases.get(offerId) ?? 0;
    if (purchasedCount >= offer.maxPurchases) return null;

    this.purchases.set(offerId, purchasedCount + 1);

    if (offer.kind === "reload" && runtimeState.weapon) {
      runtimeState.weapon.reloadDuration = Math.max(0.45, runtimeState.weapon.reloadDuration - offer.value);
    }

    if (offer.kind === "ammo" && runtimeState.weapon) {
      runtimeState.weapon.clipSize += offer.value;
      runtimeState.weapon.ammo = runtimeState.weapon.clipSize;
    }

    if (offer.kind === "turret") {
      runtimeState.spawnTurret?.();
    }

    if (offer.kind === "ally" && offer.allyRole) {
      runtimeState.hireAlly?.(offer.allyRole);
    }

    return cloneOffer(offer, purchasedCount + 1, runtimeState.economy ?? {});
  }

  purchase(offerId, runtimeState = {}) {
    return this.applyPurchase(offerId, runtimeState);
  }

  getRuntimeModifiers() {
    const modifiers = {
      reloadBonus: 0,
      clipBonus: 0,
      turretCount: 0,
      allyCounts: { sniper: 0, craftsman: 0 },
    };

    for (const offer of OFFER_CATALOG) {
      const count = this.purchases.get(offer.id) ?? 0;
      if (!count) continue;
      if (offer.kind === "reload") modifiers.reloadBonus += offer.value * count;
      if (offer.kind === "ammo") modifiers.clipBonus += offer.value * count;
      if (offer.kind === "turret") modifiers.turretCount += offer.value * count;
      if (offer.kind === "ally" && offer.allyRole) {
        modifiers.allyCounts[offer.allyRole] += offer.value * count;
      }
    }

    return modifiers;
  }
}
