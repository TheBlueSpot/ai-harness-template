import { BOSS_CORE_MAX, BOSS_SHIELD_MAX } from "./constants.js";

export function spawnEnemy(type, x, y, extra = {}) {
  return {
    type,
    x,
    y,
    vx: extra.vx ?? -180,
    vy: extra.vy ?? 0,
    w: extra.w ?? 28,
    h: extra.h ?? 20,
    hp: extra.hp ?? 1,
    damage: extra.damage ?? 1,
    score: extra.score ?? 100,
    phase: extra.phase ?? "active",
    shield: extra.shield ?? BOSS_SHIELD_MAX,
    core: extra.core ?? BOSS_CORE_MAX,
    shieldVisible: extra.shieldVisible ?? false,
    coreOpen: extra.coreOpen ?? false,
    spawnTime: extra.spawnTime ?? 0,
  };
}

export function isBossEnemy(enemy) {
  return enemy?.type === "boss";
}
