import { createBossEncounter, updateBossEncounter } from "../entities/boss.js";
import { createEnemyWave, updateEnemies } from "../entities/enemies.js";
import { buildAttackIntents } from "./ai.js";
import { createWeaponState } from "./weapons.js";

const PLAYER_HALF_WIDTH = 12;
const PLAYER_HALF_HEIGHT = 18;
const WALL_GRIP_BUFFER = 14;

export function createStageState(view) {
  return {
    mode: "menu",
    view: { ...view },
    camera: { x: 0, y: 0 },
    groundY: 470,
    score: 0,
    events: [],
    rewardQueued: false,
    rewardGranted: false,
    player: { x: 110, y: 420, vx: 0, vy: 0, facing: 1, onGround: true, onWall: false, wallSide: 0, wallKick: 0, wallGrace: 0, jumpHold: 0, hp: 5 },
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
      { x: 180, y: 360, w: 30, h: 110 },
      { x: 430, y: 240, w: 30, h: 230 },
      { x: 700, y: 180, w: 30, h: 290 },
    ],
  };
}

export const createStage = createStageState;

export function updateStage(stage, dt, playerState) {
  const p = stage.player;
  stage.events.length = 0;
  const previousX = p.x;
  const previousY = p.y;
  const previousLeft = previousX - PLAYER_HALF_WIDTH;
  const previousRight = previousX + PLAYER_HALF_WIDTH;
  const previousTop = previousY - PLAYER_HALF_HEIGHT;
  const previousBottom = previousY + PLAYER_HALF_HEIGHT;
  p.wallKick = Math.max(0, p.wallKick - dt);
  p.wallGrace = Math.max(0, p.wallGrace - dt);
  const accel = p.onGround ? 1040 : 660;
  const maxSpeed = 280;
  if (playerState.left) p.vx -= accel * dt;
  if (playerState.right) p.vx += accel * dt;
  p.vx = Math.max(-maxSpeed, Math.min(maxSpeed, p.vx));
  p.facing = p.vx < 0 ? -1 : p.vx > 0 ? 1 : p.facing;

  const jumpPressed = playerState.jump && p.jumpHold <= 0;
  if (jumpPressed && p.onGround) {
    p.vy = -430;
    p.onGround = false;
    p.jumpHold = 0.18;
  } else if (playerState.jump && !p.onGround && (p.onWall || p.wallGrace > 0) && p.wallKick <= 0 && (p.jumpHold <= 0 || p.onWall)) {
    p.vy = -410;
    p.vx = 235 * -p.wallSide;
    p.wallKick = 0.28;
    p.wallGrace = 0;
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
    const playerLeft = p.x - PLAYER_HALF_WIDTH;
    const playerRight = p.x + PLAYER_HALF_WIDTH;
    const playerTop = p.y - PLAYER_HALF_HEIGHT;
    const playerBottom = p.y + PLAYER_HALF_HEIGHT;
    const wallCatchActive = p.wallKick <= 0;
    const overlapsWall =
      playerRight > wall.x && playerLeft < wall.x + wall.w && playerBottom > wall.y && playerTop < wall.y + wall.h;
    const canCatchLeft =
      wallCatchActive &&
      previousRight <= wall.x + WALL_GRIP_BUFFER &&
      playerRight >= wall.x - WALL_GRIP_BUFFER &&
      playerBottom > wall.y + 2 &&
      playerTop < wall.y + wall.h - 6;
    const canCatchRight =
      wallCatchActive &&
      previousLeft >= wall.x + wall.w - WALL_GRIP_BUFFER &&
      playerLeft <= wall.x + wall.w + WALL_GRIP_BUFFER &&
      playerBottom > wall.y + 2 &&
      playerTop < wall.y + wall.h - 6;
    const canLatch = overlapsWall || canCatchLeft || canCatchRight;
    if (!canLatch) continue;
    const landedFromAbove =
      previousBottom <= wall.y + 4 &&
      previousTop < wall.y &&
      previousLeft < wall.x + wall.w - 6 &&
      previousRight > wall.x + 6;
    const canLandOnTop = landedFromAbove && p.vy >= 0 && playerBottom >= wall.y && !canCatchLeft && !canCatchRight;
    if (canLandOnTop && p.vy >= 0) {
      p.y = wall.y - PLAYER_HALF_HEIGHT;
      p.vy = 0;
      p.onGround = true;
      continue;
    }
    const canHitUnderside = previousTop >= wall.y + wall.h && playerTop <= wall.y + wall.h;
    if (canHitUnderside && p.vy <= 0) {
      p.y = wall.y + wall.h + PLAYER_HALF_HEIGHT;
      p.vy = Math.max(0, p.vy);
      continue;
    }
    const overlapX = Math.min(playerRight, wall.x + wall.w) - Math.max(playerLeft, wall.x);
    const overlapY = Math.min(playerBottom, wall.y + wall.h) - Math.max(playerTop, wall.y);
    const cameFromLeft = canCatchLeft || previousRight <= wall.x;
    const cameFromRight = canCatchRight || previousLeft >= wall.x + wall.w;
    const edgeGrazedTop = p.x <= wall.x + 2 || p.x >= wall.x + wall.w - 2;
    if (cameFromLeft) {
      p.x = wall.x - PLAYER_HALF_WIDTH;
      p.onWall = true;
      p.wallSide = -1;
      p.wallGrace = 0.28;
      p.vx = Math.min(0, p.vx);
    } else if (cameFromRight) {
      p.x = wall.x + wall.w + PLAYER_HALF_WIDTH;
      p.onWall = true;
      p.wallSide = 1;
      p.wallGrace = 0.28;
      p.vx = Math.max(0, p.vx);
    } else if (overlapX > 0 && overlapY > 0 && (overlapX < overlapY || edgeGrazedTop)) {
      const leftDistance = Math.abs(previousRight - wall.x);
      const rightDistance = Math.abs(previousLeft - (wall.x + wall.w));
      const resolveLeft = leftDistance <= rightDistance;
      p.x = resolveLeft ? wall.x - PLAYER_HALF_WIDTH : wall.x + wall.w + PLAYER_HALF_WIDTH;
      p.onWall = true;
      p.wallSide = resolveLeft ? -1 : 1;
      p.wallGrace = 0.28;
      p.vx = resolveLeft ? Math.min(0, p.vx) : Math.max(0, p.vx);
    } else {
      const fromLeft = previousRight <= wall.x;
      const fromRight = previousLeft >= wall.x + wall.w;
      if (fromLeft || fromRight || canCatchLeft || canCatchRight) {
        const resolveLeft = fromLeft ? true : fromRight ? false : previousX < wall.x + wall.w / 2;
        p.x = resolveLeft ? wall.x - PLAYER_HALF_WIDTH : wall.x + wall.w + PLAYER_HALF_WIDTH;
        p.onWall = true;
        p.wallSide = resolveLeft ? -1 : 1;
        p.wallGrace = 0.28;
        p.vx = resolveLeft ? Math.min(0, p.vx) : Math.max(0, p.vx);
      } else {
        const resolveTop = previousBottom <= wall.y || previousY <= wall.y;
        p.y = resolveTop ? wall.y - PLAYER_HALF_HEIGHT : wall.y + wall.h + PLAYER_HALF_HEIGHT;
      }
      p.vy = 0;
    }
    if (p.onWall && p.vy > 160) {
      p.vy = 160;
    }
  }

  if (p.y >= stage.groundY - 18) {
    p.y = stage.groundY - 18;
    p.vy = 0;
    p.onGround = true;
  }
  p.y = Math.max(24, p.y);
  const inputLead = playerState.left ? -18 : playerState.right ? 18 : 0;
  const cameraLeadX = p.facing * 48 + p.vx * 0.12 + inputLead;
  const airborneLookAheadY = p.vy < -40 ? -34 : p.vy > 120 ? 18 : -10;
  const cameraTargetX = Math.max(-108, Math.min(108, (p.x - stage.view.width * 0.5) * 0.5 + cameraLeadX));
  const cameraTargetY = Math.max(-124, Math.min(28, (p.y - stage.view.height * 0.5) * 0.58 + Math.min(52, p.vy * 0.1) + airborneLookAheadY));
  const cameraCatchup = p.onGround ? 5.4 : 7.2;
  stage.camera.x += (cameraTargetX - stage.camera.x) * Math.min(1, dt * cameraCatchup);
  stage.camera.y += (cameraTargetY - stage.camera.y) * Math.min(1, dt * cameraCatchup);

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
