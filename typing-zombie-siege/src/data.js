export const lanes = [
  { id: "left", label: "Left", x: 0.2 },
  { id: "mid", label: "Mid", x: 0.5 },
  { id: "right", label: "Right", x: 0.8 },
];

export const scoreValues = {
  kill: 120,
  stagger: 35,
  breach: -60,
  comboStep: 10,
  waveClear: 300,
};

export const vocabularyPools = {
  common: ["grave", "shamble", "cull", "ashen", "venom", "ember", "hush", "gloom", "rift", "scrape"],
  tense: ["lurch", "fang", "dread", "hollow", "mire", "wretch", "spine", "briar", "echo", "rot"],
  elite: ["catacomb", "undertow", "nightfall", "ruinous", "blackout", "morrow", "threshold"],
};

export const waveSchedule = [
  { at: 0, count: 3, pool: "common", spawnGap: 0.9, speed: 0.055, health: 1 },
  { at: 18, count: 4, pool: "common", spawnGap: 0.8, speed: 0.062, health: 1 },
  { at: 38, count: 5, pool: "tense", spawnGap: 0.72, speed: 0.071, health: 1 },
  { at: 64, count: 5, pool: "tense", spawnGap: 0.68, speed: 0.08, health: 2 },
  { at: 92, count: 6, pool: "elite", spawnGap: 0.6, speed: 0.09, health: 2 },
];

export const difficulty = {
  barricadeHealth: 12,
  retreatBuffer: 0.13,
  spawnStart: 0.95,
  killFill: 0.28,
  staggerDelay: 0.85,
  baseWordGain: 1,
  waveClearBonus: 0.45,
};
