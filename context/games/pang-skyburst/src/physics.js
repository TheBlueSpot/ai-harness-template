const GRAVITY = 2.3;
const MOVE_ACCEL = 3.8;
const MAX_SPEED = 0.38;
const FRICTION = 8.5;
const JUMP_SPEED = 0.72;
const BLOB_BOUNCE = 0.84;

export function applyPlayerMotion(player, input, dt, bounds) {
  const left = Boolean(input?.held?.ArrowLeft || input?.held?.KeyA);
  const right = Boolean(input?.held?.ArrowRight || input?.held?.KeyD);
  const jump = Boolean(input?.pressed?.ArrowUp || input?.pressed?.KeyW || input?.pressed?.Space);

  let dir = 0;
  if (left) dir -= 1;
  if (right) dir += 1;
  if (dir !== 0) player.facing = dir;

  player.vx += dir * MOVE_ACCEL * dt;
  if (dir === 0) {
    const damp = Math.min(1, FRICTION * dt);
    player.vx *= 1 - damp;
  }
  player.vx = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, player.vx));

  if (jump && player.onGround) {
    player.vy = -JUMP_SPEED;
    player.onGround = false;
  }

  player.vy += GRAVITY * dt;
  player.x += player.vx * dt;
  player.y += player.vy * dt;

  const halfW = player.width * 0.5;
  const minX = bounds.left + halfW;
  const maxX = bounds.right - halfW;
  player.x = Math.max(minX, Math.min(maxX, player.x));
  if (player.x === minX || player.x === maxX) player.vx = 0;
}

export function updateHarpoon(harpoon, player, input, dt) {
  harpoon.cooldown = Math.max(0, harpoon.cooldown - dt);
  const fire = Boolean(input?.pressed?.KeyJ || input?.pressed?.ControlLeft || input?.pressed?.ControlRight);
  if (fire && !harpoon.active && harpoon.cooldown === 0) {
    harpoon.active = true;
    harpoon.x = player.x + player.facing * 0.01;
    harpoon.y = player.y - player.height * 0.5;
    harpoon.vy = -1.2;
    harpoon.cooldown = 0.12;
  }
  if (harpoon.active) {
    harpoon.y += harpoon.vy * dt;
  }
}

export function resolveGround(player, platforms) {
  player.onGround = false;
  const foot = player.y + player.height * 0.5;
  for (const platform of platforms) {
    const top = platform.y;
    const left = platform.x;
    const right = platform.x + platform.w;
    const withinX = player.x + player.width * 0.45 > left && player.x - player.width * 0.45 < right;
    const falling = player.vy >= 0;
    if (withinX && falling && foot >= top && foot - player.vy * 0.02 <= top) {
      player.y = top - player.height * 0.5;
      player.vy = 0;
      player.onGround = true;
      return;
    }
  }
}

export function updateBlob(blob, dt, bounds, platforms) {
  blob.vy += GRAVITY * 0.82 * dt;
  blob.x += blob.vx * dt;
  blob.y += blob.vy * dt;
  blob.bobSeed += dt * 2.4;

  const left = bounds.left + blob.radius;
  const right = bounds.right - blob.radius;
  if (blob.x < left) {
    blob.x = left;
    blob.vx = Math.abs(blob.vx);
  }
  if (blob.x > right) {
    blob.x = right;
    blob.vx = -Math.abs(blob.vx);
  }

  const floor = bounds.bottom - blob.radius;
  if (blob.y > floor) {
    blob.y = floor;
    blob.vy = -Math.abs(blob.vy) * BLOB_BOUNCE;
  }

  for (const platform of platforms) {
    const onTop = blob.x > platform.x - blob.radius && blob.x < platform.x + platform.w + blob.radius;
    const crossing = blob.y + blob.radius >= platform.y && blob.y + blob.radius - blob.vy * dt < platform.y;
    if (onTop && crossing && blob.vy > 0) {
      blob.y = platform.y - blob.radius;
      blob.vy = -Math.abs(blob.vy) * BLOB_BOUNCE;
    }
  }
}

export function ballDamageRadius(size) {
  return [0.085, 0.062, 0.042][Math.max(0, Math.min(2, 3 - size))] ?? 0.042;
}
