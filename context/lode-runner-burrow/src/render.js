function fillBackground(ctx, width, height) {
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#09111c");
  sky.addColorStop(0.5, "#142433");
  sky.addColorStop(1, "#20150f");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);
}

function drawTile(ctx, tile, size) {
  const x = tile.x * size;
  const y = tile.y * size;
  ctx.fillStyle = tile.dug ? "rgba(0,0,0,0)" : "#8a5a2a";
  if (!tile.dug) ctx.fillRect(x, y, size, size);
  ctx.strokeStyle = "rgba(255, 220, 165, 0.15)";
  ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
}

function drawLadder(ctx, ladder, size) {
  if (!ladder.revealed) return;
  const x = ladder.x * size;
  const y = ladder.y * size;
  ctx.strokeStyle = "#8ce3ff";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x + 10, y + 4);
  ctx.lineTo(x + 10, y + size - 4);
  ctx.moveTo(x + size - 10, y + 4);
  ctx.lineTo(x + size - 10, y + size - 4);
  ctx.moveTo(x + 10, y + 11);
  ctx.lineTo(x + size - 10, y + 11);
  ctx.moveTo(x + 10, y + 20);
  ctx.lineTo(x + size - 10, y + 20);
  ctx.stroke();
}

function drawExitMarker(ctx, exit, locked) {
  if (!exit) return;
  ctx.save();
  if (locked) {
    ctx.fillStyle = "rgba(216, 180, 74, 0.18)";
    ctx.strokeStyle = "rgba(216, 180, 74, 0.72)";
    ctx.setLineDash([6, 5]);
    ctx.lineWidth = 2;
    ctx.fillRect(exit.x - 6, exit.y - 10, exit.w + 12, exit.h + 14);
    ctx.strokeRect(exit.x - 6, exit.y - 10, exit.w + 12, exit.h + 14);
    ctx.setLineDash([]);
    ctx.fillStyle = "#f1d98e";
    ctx.font = "700 12px Georgia, serif";
    ctx.fillText("EXIT", exit.x - 2, exit.y - 16);
  } else {
    ctx.fillStyle = "#89e7ff";
    ctx.fillRect(exit.x, exit.y, exit.w, exit.h);
  }
  ctx.restore();
}

function drawActor(ctx, actor, color) {
  ctx.fillStyle = color;
  ctx.fillRect(actor.x - actor.w / 2, actor.y - actor.h / 2, actor.w, actor.h);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillRect(actor.x - 5 * actor.facing, actor.y - 7, 4, 4);
}

export function renderGame(ctx, frameState) {
  if (!ctx) return;
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const size = 32;

  ctx.save();
  ctx.clearRect(0, 0, width, height);
  fillBackground(ctx, width, height);

  for (const tile of frameState.tiles ?? []) drawTile(ctx, tile, size);
  for (const ladder of frameState.ladders ?? []) drawLadder(ctx, ladder, size);

  ctx.fillStyle = "#d8b44a";
  for (const gold of frameState.gold ?? []) {
    if (gold.taken) continue;
    ctx.beginPath();
    ctx.arc(gold.x, gold.y, 7, 0, Math.PI * 2);
    ctx.fill();
  }

  drawExitMarker(ctx, frameState.exit, frameState.exitLocked);

  drawActor(ctx, frameState.player ?? { x: 0, y: 0, w: 22, h: 28, facing: 1 }, "#f2f5f8");
  for (const guard of frameState.guards ?? []) drawActor(ctx, guard, "#ff7d64");

  ctx.restore();
}
