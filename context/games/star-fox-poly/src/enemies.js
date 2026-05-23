import { clamp, lerp } from "./math.js";

export const FORMATIONS = [
  { at: 420, type: "triangle", lanes: [2, 1, 3], aggression: 0.22, hp: 1, score: 120 },
  { at: 980, type: "fan", lanes: [0, 2, 4], aggression: 0.3, hp: 1, score: 150 },
  { at: 1320, type: "bar", lanes: [1, 2, 3], aggression: 0.38, hp: 2, score: 180 },
  { at: 1980, type: "cross", lanes: [0, 4, 2], aggression: 0.45, hp: 2, score: 220 },
  { at: 2860, type: "diamond", lanes: [1, 2, 3, 2], aggression: 0.5, hp: 2, score: 260 },
  { at: 3720, type: "spear", lanes: [2, 2, 1, 3], aggression: 0.56, hp: 3, score: 320 },
];

export const BOSS_CORE = {
  entryAt: 5100,
  hp: 14,
  weakpoints: [
    { id: "left", lane: 1, hp: 2 },
    { id: "core", lane: 2, hp: 4, gatedBy: ["left", "right"] },
    { id: "right", lane: 3, hp: 2 },
  ],
};

export function enemySpeedForProgress(progress, stageProgress) {
  const base = 44 + stageProgress * 14;
  return base + Math.sin(progress * 0.003) * 4;
}

export function buildWaveState(progress) {
  return FORMATIONS.filter((formation) => progress >= formation.at - 680);
}

export function enemyProjectilePattern(enemy, age, stageProgress) {
  const cadence = clamp(2.15 - stageProgress * 0.38, 1.15, 2.15);
  const fire = age > 0.4 && Math.floor((age + enemy.seed) / cadence) !== Math.floor((age - 0.016 + enemy.seed) / cadence);
  if (!fire) {
    return null;
  }
  return {
    lane: enemy.lane,
    speed: lerp(168, 252, stageProgress),
    damage: enemy.kind === "boss" ? 8 : enemy.kind === "turret" ? 6 : 4,
  };
}

export function createBossState() {
  return {
    hp: BOSS_CORE.hp,
    spawned: false,
    weakpoints: BOSS_CORE.weakpoints.map((weakpoint) => ({ ...weakpoint, open: !weakpoint.gatedBy?.length })),
    phase: "approach",
  };
}

export function isBossCoreOpen(bossState) {
  const left = bossState.weakpoints.find((item) => item.id === "left");
  const right = bossState.weakpoints.find((item) => item.id === "right");
  return Boolean(left?.hp <= 0 && right?.hp <= 0);
}
