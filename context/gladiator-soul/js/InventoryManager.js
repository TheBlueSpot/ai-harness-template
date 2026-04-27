const ASSET_PATHS = Object.freeze({
  player: "./assets/gladiators/player.png",
  enemy: "./assets/gladiators/enemy.png",
});

const MARKETPLACE = Object.freeze([
  {
    id: "iron-gladius",
    slot: "weapon",
    name: "Iron Gladius",
    price: 24,
    description: "Heavy edge for stronger swings and power attacks.",
    modifiers: { strengthBonus: 4, favorBonus: 1 },
    cosmeticLabel: "gladius",
  },
  {
    id: "arena-trident",
    slot: "weapon",
    name: "Arena Trident",
    price: 30,
    description: "Long reach that raises agility and tempo.",
    modifiers: { strengthBonus: 2, agilityBonus: 3 },
    cosmeticLabel: "trident",
  },
  {
    id: "bronze-shield",
    slot: "offhand",
    name: "Bronze Shield",
    price: 22,
    description: "Turns blocks into real protection.",
    modifiers: { defenseBonus: 4, healthBonus: 8 },
    cosmeticLabel: "shield",
  },
  {
    id: "sand-greaves",
    slot: "armor",
    name: "Sand Greaves",
    price: 18,
    description: "Footwork gear for faster jabs and better evasion.",
    modifiers: { agilityBonus: 2, staminaBonus: 8 },
    cosmeticLabel: "greaves",
  },
  {
    id: "victor-wreath",
    slot: "trinket",
    name: "Victor Wreath",
    price: 28,
    description: "Crowd magnet that pushes favor gain higher.",
    modifiers: { favorBonus: 5, staminaBonus: 4 },
    cosmeticLabel: "wreath",
  },
]);

const TRAINING = Object.freeze([
  {
    id: "strength",
    title: "Strength Drills",
    cost: 16,
    description: "Increase raw power and armor penetration.",
    stat: "strength",
  },
  {
    id: "agility",
    title: "Footwork Ladder",
    cost: 16,
    description: "Increase evasion and jab pressure.",
    stat: "agility",
  },
  {
    id: "stamina",
    title: "Endurance Run",
    cost: 18,
    description: "Raise max stamina for longer rounds.",
    stat: "stamina",
  },
  {
    id: "showmanship",
    title: "Crowd Work",
    cost: 14,
    description: "Raise favor generation and arena presence.",
    stat: "showmanship",
  },
]);

function cloneItem(item = {}) {
  return {
    ...item,
    modifiers: { ...(item.modifiers ?? {}) },
  };
}

function cloneInventory(inventory = {}) {
  return {
    owned: Array.isArray(inventory.owned) ? [...inventory.owned] : [],
    equipped: { ...(inventory.equipped ?? {}) },
  };
}

function normalizeFighterState(fighterState = {}) {
  return {
    ...structuredClone(fighterState),
    gold: Number.isFinite(Number(fighterState.gold)) ? Number(fighterState.gold) : 0,
    inventory: cloneInventory(fighterState.inventory),
    equipment: { ...(fighterState.equipment ?? {}) },
  };
}

function findItemById(itemId) {
  return MARKETPLACE.find((item) => item.id === itemId) ?? null;
}

function mergeModifierTotals(items = []) {
  return items.reduce(
    (totals, item) => ({
      healthBonus: totals.healthBonus + Number(item.modifiers?.healthBonus ?? 0),
      staminaBonus: totals.staminaBonus + Number(item.modifiers?.staminaBonus ?? 0),
      strengthBonus: totals.strengthBonus + Number(item.modifiers?.strengthBonus ?? 0),
      agilityBonus: totals.agilityBonus + Number(item.modifiers?.agilityBonus ?? 0),
      defenseBonus: totals.defenseBonus + Number(item.modifiers?.defenseBonus ?? 0),
      favorBonus: totals.favorBonus + Number(item.modifiers?.favorBonus ?? 0),
    }),
    {
      healthBonus: 0,
      staminaBonus: 0,
      strengthBonus: 0,
      agilityBonus: 0,
      defenseBonus: 0,
      favorBonus: 0,
    },
  );
}

export class InventoryManager {
  constructor() {
    this.catalog = MARKETPLACE.map(cloneItem);
    this.training = TRAINING.map((entry) => ({ ...entry }));
  }

  getMarketplaceStock() {
    return this.catalog.map(cloneItem);
  }

  getTrainingOptions() {
    return this.training.map((entry) => ({ ...entry }));
  }

  getTrainingOption(trainingId) {
    return this.training.find((entry) => entry.id === trainingId) ?? null;
  }

  purchaseItem(itemId, fighterState = {}) {
    const next = normalizeFighterState(fighterState);
    const item = findItemById(itemId);

    if (!item) return { fighterState: next, purchased: null, reason: "missing-item" };
    if (next.inventory.owned.includes(item.id)) return { fighterState: next, purchased: cloneItem(item), reason: "owned" };
    if (next.gold < item.price) return { fighterState: next, purchased: cloneItem(item), reason: "insufficient-gold" };

    next.gold -= item.price;
    next.inventory.owned.push(item.id);
    next.inventory.equipped[item.slot] = item.id;
    next.equipment[item.slot] = item.id;
    return { fighterState: next, purchased: cloneItem(item), reason: "purchased" };
  }

  equipItem(slot, itemId, fighterState = {}) {
    const next = normalizeFighterState(fighterState);
    const item = findItemById(itemId);

    if (!item || item.slot !== slot) return { fighterState: next, equipped: null, reason: "invalid-slot" };
    if (!next.inventory.owned.includes(item.id)) return { fighterState: next, equipped: cloneItem(item), reason: "not-owned" };

    next.inventory.equipped[slot] = item.id;
    next.equipment[slot] = item.id;
    return { fighterState: next, equipped: cloneItem(item), reason: "equipped" };
  }

  getEquippedItems(fighterState = {}) {
    const next = normalizeFighterState(fighterState);
    return Object.entries(next.inventory.equipped)
      .map(([slot, itemId]) => {
        const item = findItemById(itemId);
        return item ? { slot, ...cloneItem(item) } : null;
      })
      .filter(Boolean);
  }

  getEquipmentModifiers(fighterState = {}) {
    return mergeModifierTotals(this.getEquippedItems(fighterState));
  }

  getVisualLoadout(fighterState = {}) {
    const equipped = this.getEquippedItems(fighterState);
    const labels = equipped.map((item) => item.cosmeticLabel ?? item.name);
    const playerLabel = labels.length ? labels.join(" / ") : "bare steel";

    return {
      player: {
        src: ASSET_PATHS.player,
        alt: "Player gladiator",
        label: playerLabel,
      },
      enemy: {
        src: ASSET_PATHS.enemy,
        alt: "Enemy gladiator",
        label: "arena challenger",
      },
      menuArt: {
        src: ASSET_PATHS.player,
        alt: "Player gladiator standing in the menu",
      },
      championArt: {
        src: ASSET_PATHS.player,
        alt: "Champion gladiator art",
      },
      labels,
    };
  }
}
