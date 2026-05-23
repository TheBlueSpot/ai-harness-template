export const trickTable = {
  ollie: { name: "Ollie", type: "jump", baseScore: 120, comboBonus: 1.0 },
  manual: { name: "Manual", type: "manual", baseScore: 90, comboBonus: 1.1 },
  grind: { name: "Grind", type: "grind", baseScore: 140, comboBonus: 1.25 },
  air: { name: "Air", type: "air", baseScore: 160, comboBonus: 1.2 },
  landing: { name: "Clean Landing", type: "landing", baseScore: 60, comboBonus: 0.8 },
};

export const comboRules = {
  multiplierStep: 0.25,
  maxMultiplier: 6,
  bailPenalty: 0.5,
  hardLandingSpeed: 380,
  manualWindow: 0.75,
  grindWindow: 0.55,
  jumpWindow: 0.8,
};

export function scoreTrick(kind, comboMultiplier = 1) {
  const trick = trickTable[kind] ?? trickTable.ollie;
  return Math.round(trick.baseScore * (1 + comboMultiplier * trick.comboBonus));
}
