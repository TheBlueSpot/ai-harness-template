import {
  BUMPERS,
  FLIPPERS,
  LAUNCH_LANE,
  LOCKS,
  REACTOR_RAMPS,
  SLINGS,
  TABLE_HEIGHT,
  TABLE_WIDTH,
  TARGETS,
  WALLS,
} from "./table.js";

function drawRoundedRect(ctx, x, y, w, h, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawWall(ctx, wall) {
  ctx.beginPath();
  ctx.moveTo(wall.x1, wall.y1);
  ctx.lineTo(wall.x2, wall.y2);
  ctx.stroke();
}

function drawPolygon(ctx, points) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.closePath();
}

function drawFlipper(ctx, pivot, angle, length, color) {
  const tipX = pivot.x + Math.cos(angle) * length;
  const tipY = pivot.y + Math.sin(angle) * length;
  const normalX = Math.cos(angle + Math.PI / 2) * 13;
  const normalY = Math.sin(angle + Math.PI / 2) * 13;

  ctx.beginPath();
  ctx.moveTo(pivot.x - normalX, pivot.y - normalY);
  ctx.lineTo(pivot.x + normalX, pivot.y + normalY);
  ctx.lineTo(tipX + normalX * 0.72, tipY + normalY * 0.72);
  ctx.lineTo(tipX - normalX * 0.72, tipY - normalY * 0.72);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(pivot.x, pivot.y, 15, 0, Math.PI * 2);
  ctx.fillStyle = "#f5efe2";
  ctx.fill();
}

export function renderGame(ctx, state) {
  ctx.clearRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);

  const backdrop = ctx.createLinearGradient(0, 0, 0, TABLE_HEIGHT);
  backdrop.addColorStop(0, "#07101f");
  backdrop.addColorStop(0.48, "#122741");
  backdrop.addColorStop(1, "#05070d");
  ctx.fillStyle = backdrop;
  ctx.fillRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);

  const glow = ctx.createRadialGradient(360, 160, 10, 360, 300, 360);
  glow.addColorStop(0, "rgba(90, 242, 255, 0.28)");
  glow.addColorStop(1, "rgba(90, 242, 255, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);

  ctx.fillStyle = "#102235";
  drawRoundedRect(ctx, 34, 24, 652, 900, 48);
  ctx.fill();

  ctx.strokeStyle = "#97ecff";
  ctx.lineWidth = 5;
  ctx.shadowBlur = 14;
  ctx.shadowColor = "rgba(99, 230, 255, 0.45)";
  WALLS.forEach((wall) => drawWall(ctx, wall));
  ctx.shadowBlur = 0;

  ctx.fillStyle = "rgba(75, 196, 246, 0.14)";
  REACTOR_RAMPS.forEach((ramp) => {
    drawRoundedRect(ctx, ramp.x, ramp.y, ramp.w, ramp.h, 30);
    ctx.fill();
    ctx.strokeStyle = "#84f0ff";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = "#d4fbff";
    ctx.font = "bold 18px Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillText("RAMP", ramp.x + ramp.w / 2, ramp.y + ramp.h / 2);
    ctx.fillStyle = "rgba(75, 196, 246, 0.14)";
  });

  LOCKS.forEach((lock, index) => {
    ctx.beginPath();
    ctx.arc(lock.x, lock.y, lock.radius, 0, Math.PI * 2);
    ctx.fillStyle = state.lockedBalls > index ? "#f7d86a" : "#233a54";
    ctx.fill();
    ctx.strokeStyle = "#fff0b0";
    ctx.lineWidth = 3;
    ctx.stroke();
  });

  BUMPERS.forEach((bumper) => {
    ctx.beginPath();
    ctx.arc(bumper.x, bumper.y, bumper.radius, 0, Math.PI * 2);
    const active = state.flash && state.flash.id === `bumper-${bumper.x}`;
    ctx.fillStyle = active ? "#fbf3a3" : "#7c2cff";
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = "#ffe087";
    ctx.stroke();
  });

  TARGETS.forEach((target) => {
    ctx.fillStyle = state.targetsLit[target.key] ? "#f26b9a" : "#2a4f70";
    drawRoundedRect(ctx, target.x, target.y, target.w, target.h, 10);
    ctx.fill();
    ctx.strokeStyle = "#ffe0ee";
    ctx.lineWidth = 3;
    ctx.stroke();
  });

  SLINGS.forEach((sling, index) => {
    drawPolygon(ctx, sling);
    ctx.fillStyle = index === 0 ? "#ff8d62" : "#ff617f";
    ctx.fill();
  });

  drawRoundedRect(ctx, LAUNCH_LANE.x, LAUNCH_LANE.y, LAUNCH_LANE.w, LAUNCH_LANE.h, 22);
  ctx.strokeStyle = "#7ceaff";
  ctx.lineWidth = 3;
  ctx.stroke();

  const reactorRadius = 54 + state.reactorCharge * 8;
  ctx.beginPath();
  ctx.arc(360, 520, reactorRadius, 0, Math.PI * 2);
  ctx.fillStyle = state.multiball
    ? "rgba(255, 196, 80, 0.55)"
    : "rgba(80, 255, 228, 0.2)";
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = state.reactorReady ? "#ffd36f" : "#6cf5ff";
  ctx.stroke();

  ctx.fillStyle = "#f2feff";
  ctx.font = "bold 32px Georgia, serif";
  ctx.textAlign = "center";
  ctx.fillText("REACTOR", 360, 530);

  drawFlipper(
    ctx,
    FLIPPERS.left.pivot,
    state.flippers.left,
    FLIPPERS.left.length,
    "#fff1cf",
  );
  drawFlipper(
    ctx,
    FLIPPERS.right.pivot,
    state.flippers.right,
    FLIPPERS.right.length,
    "#fff1cf",
  );

  state.balls.forEach((ball) => {
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    ctx.fillStyle = "#f7f9ff";
    ctx.fill();
    ctx.strokeStyle = "#8cd8ff";
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  state.floaters.forEach((floater) => {
    ctx.globalAlpha = Math.max(0, floater.life / floater.maxLife);
    ctx.fillStyle = floater.color;
    ctx.font = "bold 22px Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillText(floater.text, floater.x, floater.y);
    ctx.globalAlpha = 1;
  });

  if (state.message) {
    ctx.fillStyle = "rgba(8, 14, 25, 0.65)";
    drawRoundedRect(ctx, 198, 66, 324, 56, 20);
    ctx.fill();
    ctx.strokeStyle = "#9defff";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#f8fcff";
    ctx.font = "bold 24px Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillText(state.message, 360, 101);
  }
}
