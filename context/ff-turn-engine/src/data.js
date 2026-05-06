export const COMMANDS = ["Attack", "Skill", "Guard", "Item"];

export const COMMAND_DETAILS = {
  Attack: {
    summary: "18 dmg, keep tempo",
    hint: "Single target. Refunds 20% ATB after hit.",
  },
  Skill: {
    summary: "28 dmg + splash",
    hint: "Heavy target hit. Other living enemies take 8.",
  },
  Guard: {
    summary: "halve next hit",
    hint: "Blocks one incoming strike and keeps 35% ATB.",
  },
  Item: {
    summary: "heal weakest ally",
    hint: "Restores 24 HP to the most injured living ally.",
  },
};

export const PARTY_TEMPLATES = [
  { id: "astra", name: "Astra", maxHp: 100, power: 18, row: 0 },
  { id: "bolt", name: "Bolt", maxHp: 92, power: 16, row: 1 },
  { id: "cure", name: "Cure", maxHp: 84, power: 14, row: 2 },
];

export const ENEMY_TEMPLATES = [
  {
    id: "imp",
    name: "Imp",
    maxHp: 70,
    power: 12,
    row: 0,
    role: "Picker",
    roleHint: "hunts the weakest ally",
    targetRule: "weakest",
  },
  {
    id: "drone",
    name: "Drone",
    maxHp: 80,
    power: 14,
    row: 1,
    role: "Jammer",
    roleHint: "tags whoever is almost ready",
    targetRule: "highestGauge",
  },
  {
    id: "warden",
    name: "Warden",
    maxHp: 96,
    power: 20,
    row: 2,
    role: "Bruiser",
    roleHint: "slams the front guard",
    targetRule: "front",
  },
];
