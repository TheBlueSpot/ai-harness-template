import { PHASES, PLAYER } from "../config.js";

const DEFAULT_PLAYER = {
  x: 160,
  y: 220,
  vx: 0,
  vy: 0,
  speed: PLAYER.speed,
  radius: PLAYER.radius,
  health: PLAYER.maxHealth,
  maxHealth: PLAYER.maxHealth,
  stamina: 100,
  ammo: 0,
  weapon: "rifle",
  meleeDamage: PLAYER.meleeDamage,
  rangedDamage: PLAYER.rangedDamage,
  fireCooldown: 0,
  meleeCooldown: 0,
  aimX: 1,
  aimY: 0,
  firingHeat: 0,
};

export function createPlayer(overrides = {}) {
  return {
    ...DEFAULT_PLAYER,
    ...overrides,
  };
}

export function updatePlayerCombat(state, input = {}, dt = 0) {
  const player = state.player;
  const arena = state.arena;
  const moveX = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const moveY = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  const length = Math.hypot(moveX, moveY) || 1;
  const speed = player.speed * (player.stamina < 25 ? 0.72 : 1);

  player.vx = (moveX / length) * speed;
  player.vy = (moveY / length) * speed;
  player.x = clamp(player.x + player.vx * dt, 36, arena.width - 36);
  player.y = clamp(player.y + player.vy * dt, arena.groundY - 132, arena.groundY - 20);

  if (state.phase === PHASES.DAY) {
    player.x = clamp(player.x, 36, arena.scavengingEdge);
  } else if (state.phase === PHASES.NIGHT) {
    player.x = clamp(player.x, 36, state.barricade.x - 30);
  }

  const target = resolveAimTarget(state, input);
  if (target) {
    player.aimX = target.x - player.x;
    player.aimY = target.y - player.y;
  }

  player.fireCooldown = Math.max(0, player.fireCooldown - dt);
  player.meleeCooldown = Math.max(0, player.meleeCooldown - dt);
  player.firingHeat = Math.max(0, player.firingHeat - dt * 1.6);
  player.stamina = clamp(player.stamina + dt * 14 - (moveX || moveY ? dt * 18 : 0), 0, 100);

  if (input.fire && player.fireCooldown <= 0 && state.ammo > 0) {
    const aim = normalizeVector(player.aimX, player.aimY);
    state.pendingShots.push({
      origin: { x: player.x + aim.x * 14, y: player.y + aim.y * 8 },
      aim,
      damage: player.weapon === "shotgun" ? 13 : player.rangedDamage,
      range: player.weapon === "shotgun" ? 240 : 420,
      spread: player.weapon === "shotgun" ? 0.24 : 0.08,
      type: "ranged",
      source: "player",
    });
    state.ammo = Math.max(0, state.ammo - 1);
    player.ammo = state.ammo;
    player.fireCooldown = player.weapon === "shotgun" ? PLAYER.shotgunCooldown : PLAYER.fireCooldown;
    player.firingHeat = Math.min(1, player.firingHeat + 0.4);
  }

  if (input.melee && player.meleeCooldown <= 0) {
    state.pendingMelee.push({
      origin: { x: player.x, y: player.y },
      range: PLAYER.meleeRange,
      damage: player.meleeDamage,
      zone: "torso",
      source: "player",
    });
    player.meleeCooldown = 0.48;
  }

  return player;
}

function resolveAimTarget(state, input) {
  if (input.pointer) {
    return input.pointer;
  }
  const nearest = (state.zombies ?? [])
    .filter((zombie) => !zombie.dead)
    .sort((left, right) => Math.abs(left.x - state.player.x) - Math.abs(right.x - state.player.x))[0];
  return nearest ?? { x: state.player.x + 1, y: state.player.y };
}

function normalizeVector(x, y) {
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}
