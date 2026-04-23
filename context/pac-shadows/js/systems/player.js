export const createPlayer = ({ x, y, radius = 14, speed = 220 }) => ({
  x,
  y,
  radius,
  speed,
  vx: 0,
  vy: 0,
  facingX: 1,
  facingY: 0,
  facingAngle: 0,
  moving: false
});

export const updatePlayer = (player, input, maze, dt) => {
  const previousX = player.x;
  const previousY = player.y;
  const dx =
    (input.isDown("ArrowRight", "KeyD") ? 1 : 0) -
    (input.isDown("ArrowLeft", "KeyA") ? 1 : 0);
  const dy =
    (input.isDown("ArrowDown", "KeyS") ? 1 : 0) -
    (input.isDown("ArrowUp", "KeyW") ? 1 : 0);
  const length = Math.hypot(dx, dy);

  player.moving = length > 0;
  if (player.moving) {
    player.vx = (dx / length) * player.speed;
    player.vy = (dy / length) * player.speed;
    player.facingX = dx / length;
    player.facingY = dy / length;
    player.facingAngle = Math.atan2(player.facingY, player.facingX);
  } else {
    player.vx = 0;
    player.vy = 0;
  }

  const nextX = player.x + player.vx * dt;
  const nextY = player.y + player.vy * dt;

  if (!maze.collideCircle(nextX, player.y, player.radius)) {
    player.x = nextX;
  }

  if (!maze.collideCircle(player.x, nextY, player.radius)) {
    player.y = nextY;
  }

  if (!player.moving && player.facingAngle === 0) {
    player.facingAngle = 0;
  }

  const moved = Math.hypot(player.x - previousX, player.y - previousY) > 0.5;
  const cell = maze.cellFromWorld(player.x, player.y);
  const previousCell = maze.cellFromWorld(previousX, previousY);

  return {
    moving: player.moving,
    moved,
    blocked: player.moving && !moved,
    cellChanged: cell.col !== previousCell.col || cell.row !== previousCell.row,
    cell
  };
};
