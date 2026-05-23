export const PHASES = Object.freeze({
  MENU: "menu",
  DAY: "day",
  NIGHT: "night",
  WIN: "win",
  LOSE: "gameover",
});

export const WORLD = Object.freeze({
  baseWidth: 1280,
  baseHeight: 720,
  groundY: 548,
  dayDuration: 45,
  nightDuration: 40,
  maxDaysToWin: 4,
  scavengingEdge: 780,
  barricadeX: 922,
  barricadeY: 428,
});

export const ECONOMY = Object.freeze({
  startingScrap: 6,
  startingAmmo: 22,
  startingSurvivors: 4,
  repairCost: 4,
  repairAmount: 18,
  ammoBundleCost: 3,
  ammoBundleAmount: 10,
  upgradeCost: 12,
});

export const BARRICADE = Object.freeze({
  startingHp: 120,
  maxHp: 120,
  width: 44,
  height: 152,
  nightlyDecay: 2.4,
  emergencyPatchCost: 2,
  emergencyPatchAmount: 7,
});

export const PLAYER = Object.freeze({
  speed: 250,
  radius: 16,
  maxHealth: 100,
  meleeRange: 52,
  rangedDamage: 18,
  meleeDamage: 24,
  fireCooldown: 0.22,
  shotgunCooldown: 0.48,
});

export const ZOMBIE = Object.freeze({
  spawnIntervalBase: 4.2,
  contactDamage: 11,
  breachDamage: 15,
});
