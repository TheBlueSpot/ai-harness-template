import { spawnHitEffect, updateEffects } from "../entities/effects.js";
import { spawnEnemyShot, spawnPlayerShot, updateProjectiles } from "../entities/projectiles.js";
import { createWeaponState, equipWeapon, grantBossWeapon } from "./weapons.js";

const PLAYER_HITBOX = { w: 22, h: 34 };
const ENEMY_HITBOX = { w: 24, h: 24 };
const BOSS_HITBOX = { w: 56, h: 56 };

function ensureCombatState(stage) {
  stage.combat ??= {};
  stage.combat.weapon ??= createWeaponState();
  stage.combat.projectiles ??= [];
  stage.combat.effects ??= [];
  stage.combat.damageTotals ??= { player: 0, enemy: 0, boss: 0 };
  stage.combat.feedback ??= { playerFired: false, bossReward: null, shieldBlocked: false, playerHit: false };
  stage.combat.hitEvents ??= [];
  stage.combat.unlocks ??= [];
  stage.player.invuln ??= 0;
  stage.player.fireLatch ??= false;
  return stage.combat;
}

function overlaps(ax, ay, aw, ah, bx, by, bw, bh) {
  return Math.abs(ax - bx) * 2 < aw + bw && Math.abs(ay - by) * 2 < ah + bh;
}

function resetFrameSignals(combat) {
  combat.feedback = { playerFired: false, bossReward: null, shieldBlocked: false, playerHit: false };
  combat.hitEvents.length = 0;
  combat.unlocks.length = 0;
}

function handleWeaponInput(stage, input, combat) {
  const weapon = combat.weapon;
  weapon.fireCooldown = Math.max(0, weapon.fireCooldown - stage.dt);
  weapon.lastFiredAt += stage.dt;

  if (input.digit1) equipWeapon(stage.combat, "buster");
  if (input.digit2) equipWeapon(stage.combat, "sniper");

  const wantsFire = Boolean(input.fire);
  if (wantsFire && !stage.player.fireLatch && weapon.fireCooldown === 0) {
    combat.projectiles.push(spawnPlayerShot(stage.player, stage.player.facing, weapon.equipped));
    combat.feedback.playerFired = true;
    weapon.lastFiredAt = 0;
    weapon.fireCooldown = weapon.equipped === "sniper" ? 0.38 : 0.17;
  }
  stage.player.fireLatch = wantsFire;
}

function integrateEnemyShots(stage) {
  for (const shot of stage.shots) {
    stage.combat.projectiles.push(
      spawnEnemyShot({ x: shot.x, y: shot.y }, Math.sign(shot.vx) || 1, shot.kind === "sniper-shot" ? "sniper" : "patrol"),
    );
  }
  stage.shots.length = 0;
}

function applyPlayerDamage(stage, amount, sourceX, sourceY) {
  if (stage.player.invuln > 0 || amount <= 0) return;
  stage.player.hp = Math.max(0, stage.player.hp - amount);
  stage.player.invuln = 0.9;
  stage.combat.damageTotals.player += amount;
  stage.combat.feedback.playerHit = true;
  stage.combat.effects.push(spawnHitEffect(sourceX, sourceY, "player-hit"));
}

function hitSniperJoeShield(player, enemy) {
  const attackDir = Math.sign(enemy.x - player.x) || player.facing;
  return !enemy.weakpoint.exposed && attackDir === enemy.shieldFacing;
}

function resolvePlayerShots(stage, alive) {
  for (const projectile of stage.combat.projectiles) {
    if (projectile.owner !== "player") {
      alive.push(projectile);
      continue;
    }

    let consumed = false;
    for (const enemy of stage.enemies) {
      if (!overlaps(projectile.x, projectile.y, 10, 8, enemy.x, enemy.y - 4, ENEMY_HITBOX.w, ENEMY_HITBOX.h)) continue;
      if (enemy.type === "sniper-joe" && hitSniperJoeShield(stage.player, enemy)) {
        stage.combat.feedback.shieldBlocked = true;
        stage.combat.hitEvents.push({ type: "shield-block", target: enemy.id });
        stage.combat.effects.push(spawnHitEffect(projectile.x, projectile.y, "shield"));
      } else {
        enemy.hp = Math.max(0, enemy.hp - projectile.damage);
        stage.combat.damageTotals.enemy += projectile.damage;
        stage.combat.hitEvents.push({ type: "enemy-hit", target: enemy.id, damage: projectile.damage });
        stage.combat.effects.push(spawnHitEffect(projectile.x, projectile.y, "enemy-hit"));
        if (enemy.hp === 0) {
          stage.score += 150;
        }
      }
      consumed = true;
      break;
    }

    if (!consumed && stage.boss.active && !stage.boss.completed) {
      if (overlaps(projectile.x, projectile.y, 12, 10, stage.boss.x, stage.boss.y, BOSS_HITBOX.w, BOSS_HITBOX.h)) {
        if (stage.boss.weakpoint.exposed) {
          stage.boss.hp = Math.max(0, stage.boss.hp - projectile.damage);
          stage.combat.damageTotals.boss += projectile.damage;
          stage.combat.hitEvents.push({ type: "boss-hit", damage: projectile.damage });
          stage.combat.effects.push(spawnHitEffect(projectile.x, projectile.y, "boss-hit"));
          if (stage.boss.hp === 0) {
            stage.score += 900;
          }
        } else {
          stage.combat.hitEvents.push({ type: "boss-block" });
          stage.combat.effects.push(spawnHitEffect(projectile.x, projectile.y, "shield"));
        }
        consumed = true;
      }
    }

    if (!consumed && overlaps(projectile.x, projectile.y, 12, 10, stage.core.x, stage.core.y, 44, 44)) {
      if (stage.core.shielded) {
        stage.combat.hitEvents.push({ type: "core-block" });
        stage.combat.effects.push(spawnHitEffect(projectile.x, projectile.y, "shield"));
      } else {
        stage.core.hp = Math.max(0, stage.core.hp - projectile.damage);
        stage.combat.hitEvents.push({ type: "core-hit", damage: projectile.damage });
        stage.combat.effects.push(spawnHitEffect(projectile.x, projectile.y, "core-hit"));
        if (stage.core.hp === 0) stage.score += 600;
      }
      consumed = true;
    }

    if (!consumed) alive.push(projectile);
  }
}

function resolveEnemyShots(stage, alive) {
  for (const projectile of alive) {
    if (projectile.owner !== "enemy") continue;
    if (overlaps(projectile.x, projectile.y, 10, 10, stage.player.x, stage.player.y - 2, PLAYER_HITBOX.w, PLAYER_HITBOX.h)) {
      applyPlayerDamage(stage, projectile.damage, projectile.x, projectile.y);
      projectile.active = false;
    }
  }
  return alive.filter((projectile) => projectile.active !== false);
}

function resolveBodyCollisions(stage) {
  for (const enemy of stage.enemies) {
    if (overlaps(stage.player.x, stage.player.y, PLAYER_HITBOX.w, PLAYER_HITBOX.h, enemy.x, enemy.y - 4, ENEMY_HITBOX.w, ENEMY_HITBOX.h)) {
      applyPlayerDamage(stage, 1, enemy.x, enemy.y);
    }
  }
  if (stage.boss.active && !stage.boss.completed) {
    if (overlaps(stage.player.x, stage.player.y, PLAYER_HITBOX.w, PLAYER_HITBOX.h, stage.boss.x, stage.boss.y, BOSS_HITBOX.w, BOSS_HITBOX.h)) {
      applyPlayerDamage(stage, 1, stage.boss.x, stage.boss.y);
    }
  }
}

function handleBossReward(stage, combat) {
  const ready = stage.events.find((event) => event.type === "reward-ready");
  if (!ready || stage.rewardGranted) return;
  if (grantBossWeapon(combat, "sniper")) {
    stage.rewardGranted = true;
    combat.feedback.bossReward = "sniper";
    combat.unlocks.push("sniper");
    stage.score += 400;
  }
}

export function updateCombat(stage, dt, input = {}) {
  stage.dt = dt;
  const combat = ensureCombatState(stage);
  resetFrameSignals(combat);
  stage.player.invuln = Math.max(0, stage.player.invuln - dt);

  handleWeaponInput(stage, input, combat);
  integrateEnemyShots(stage);

  combat.projectiles = updateProjectiles(combat.projectiles, dt, stage.view);
  resolveBodyCollisions(stage);

  const survivors = [];
  resolvePlayerShots(stage, survivors);
  combat.projectiles = resolveEnemyShots(stage, survivors);
  combat.effects = updateEffects(combat.effects, dt);

  stage.enemies = stage.enemies.filter((enemy) => enemy.hp > 0);
  handleBossReward(stage, combat);
}

export function resolveCombat(stage) {
  const combat = ensureCombatState(stage);
  if (stage.core.hp <= 0) {
    stage.mode = "win";
  }
  if (stage.player.hp <= 0) {
    stage.mode = "lose";
  }
  stage.combat = combat;
}
