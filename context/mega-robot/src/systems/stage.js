import { createBossEncounter, updateBossEncounter } from "../entities/boss.js";
import { createEnemyWave, updateEnemies } from "../entities/enemies.js";
import { buildAttackIntents } from "./ai.js";
import { createWeaponState } from "./weapons.js";

export function createStageState(view) {
  return {
    mode: "menu",
    view: { ...view },
    groundY: 470,
    score: 0,
    events: [],
    rewardQueued: false,
    rewardGranted: false,
    player: { x: 110, y: 420, vx: 0, vy: 0, facing: 1, onGround: true, onWall: false, wallSide: 0, wallKick: 0, jumpHold: 0, hp: 5 },
    core: { x: 900, y: 200, hp: 4, shielded: true },
    enemies: createEnemyWave(0),
    shots: [],
    attackIntents: [],
    boss: createBossEncounter(),
    combat: {
      projectiles: [],
      effects: [],
      weapon: createWeaponState(),
      damageTotals: { player: 0, enemy: 0, boss: 0 },
      feedback: { playerFired: false, bossReward: null, shieldBlocked: false, playerHit: false },
      hitEvents: [],
      unlocks: [],
    },
    walls: [
      { x: 180, y: 320, w: 30, h: 150 },
      { x: 430, y: 240, w: 30, h: 230 },
      { x: 700, y: 180, w: 30, h: 290 },
    ],
  };
}

export const createStage = createStageState;

export function updateStage(stage, dt, playerState) {
  const p = stage.player;
  stage.events.length = 0;
  p.wallKick = Math.max(0, p.wallKick - dt);
  const accel = p.onGround ? 980 : 600;
  const maxSpeed = 200;
  if (playerState.left) p.vx -= accel * dt;
  if (playerState.right) p.vx += accel * dt;
  p.vx = Math.max(-maxSpeed, Math.min(maxSpeed, p.vx));
  p.facing = p.vx < 0 ? -1 : p.vx > 0 ? 1 : p.facing;

  const jumpPressed = playerState.jump && p.jumpHold <= 0;
  if (jumpPressed && p.onGround) {
    p.vy = -430;
    p.onGround = false;
    p.jumpHold = 0.18;
  } else if (jumpPressed && p.onWall) {
    p.vy = -410;
    p.vx = 210 * -p.wallSide;
    p.wallKick = 0.2;
    p.onWall = false;
    p.jumpHold = 0.18;
  }

  if (playerState.jump && p.jumpHold > 0) {
    p.jumpHold -= dt;
    if (p.vy < 0) p.vy -= 620 * dt;
  } else {
    p.jumpHold = 0;
  }

  p.vy += 980 * dt;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.vx *= p.onGround ? 0.82 : 0.96;
  p.x = Math.max(18, Math.min(stage.view.width - 18, p.x));

  p.onGround = false;
  p.onWall = false;
  for (const wall of stage.walls) {
    if (p.wallKick > 0) continue;
    const hit = p.x > wall.x - 14 && p.x < wall.x + wall.w + 14 && p.y > wall.y - 18 && p.y < wall.y + wall.h + 18;
    if (!hit) continue;
    if (p.x < wall.x) {
      p.x = wall.x - 14;
      p.onWall = true;
      p.wallSide = -1;
      p.vx = Math.min(0, p.vx);
    } else if (p.x > wall.x + wall.w) {
      p.x = wall.x + wall.w + 14;
      p.onWall = true;
      p.wallSide = 1;
      p.vx = Math.max(0, p.vx);
    }
    if (p.y > wall.y) p.y = Math.min(p.y, wall.y - 18);
  }

  if (p.y >= stage.groundY - 18) {
    p.y = stage.groundY - 18;
    p.vy = 0;
    p.onGround = true;
  }
  p.y = Math.max(24, p.y);

  const enemyResult = updateEnemies(stage.enemies, dt, p);
  stage.shots.push(...enemyResult.shots);
  stage.attackIntents = buildAttackIntents(stage.enemies, stage.boss);

  if (!stage.boss.active && stage.enemies.length === 0 && stage.mode === "play") {
    stage.boss.active = true;
    stage.events.push({ type: "boss-encounter", source: "stage" });
  }

  const bossResult = updateBossEncounter(stage.boss, dt, p);
  stage.shots.push(...bossResult.shots);
  stage.events.push(...bossResult.events);

  if (stage.boss.completed && !stage.rewardQueued) {
    stage.rewardQueued = true;
    stage.core.shielded = false;
    stage.events.push({ type: "reward-ready", source: "boss" });
    stage.combat.feedback.bossReward = "boss-defeated";
  }

  if (p.y < 120) stage.score += Math.round((120 - p.y) * 0.05);
  if (p.hp <= 0) stage.mode = "lose";
}
