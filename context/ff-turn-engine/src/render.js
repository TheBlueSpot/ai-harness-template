const BAR_MAX = 4;

export function renderGame(ctx, frameState = {}) {
  if (!ctx) return;

  const width = ctx.canvas?.width ?? 1280;
  const height = ctx.canvas?.height ?? 720;
  const party = frameState.party ?? [];
  const enemies = frameState.enemies ?? [];
  const log = frameState.log ?? "Ready";

  ctx.clearRect(0, 0, width, height);
  drawBackdrop(ctx, width, height);
  drawLane(ctx, width, height, frameState);
  drawActors(ctx, width, height, party, "#69f0ff", 0.72);
  drawActors(ctx, width, height, enemies, "#ff8b6d", 0.36);
  drawHudBanner(ctx, width, height, frameState, log);
}

function drawBackdrop(ctx, width, height) {
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, "#0d1422");
  grad.addColorStop(1, "#05070b");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "rgba(120, 200, 255, 0.08)";
  for (let i = 0; i < 10; i += 1) {
    ctx.fillRect(0, i * (height / 10), width, 1);
  }
}

function drawLane(ctx, width, height, frameState) {
  const laneY = height * 0.58;
  const laneW = Math.min(width * 0.76, 980);
  const laneX = (width - laneW) / 2;
  const prog = clamp01(frameState.battle?.progress ?? 0);
  const pulse = 0.5 + Math.sin((frameState.time ?? 0) * 5) * 0.5;

  ctx.save();
  ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
  ctx.fillRect(laneX, laneY, laneW, 150);
  ctx.strokeStyle = "rgba(120, 240, 255, 0.36)";
  ctx.lineWidth = 3;
  ctx.strokeRect(laneX, laneY, laneW, 150);

  ctx.fillStyle = `rgba(104, 232, 255, ${0.08 + pulse * 0.08})`;
  ctx.fillRect(laneX, laneY + 58, laneW, 8);

  for (let i = 0; i < BAR_MAX; i += 1) {
    const x = laneX + (laneW / BAR_MAX) * i;
    ctx.fillStyle = "rgba(255,255,255,0.07)";
    ctx.fillRect(x, laneY, 2, 150);
  }

  ctx.fillStyle = "rgba(255, 214, 106, 0.7)";
  ctx.fillRect(laneX, laneY + 118, laneW * prog, 6);
  ctx.restore();
}

function drawActors(ctx, width, height, actors, fill, scale) {
  const baseY = height * 0.55;
  const left = width * 0.22;
  const span = width * 0.56;
  const sorted = [...actors].sort((a, b) => (b.gauge ?? 0) - (a.gauge ?? 0));

  for (const actor of sorted) {
    const x = left + span * clamp01(actor.gauge ?? 0);
    const y = baseY + (actor.side === "enemy" ? 68 : -40) + (actor.row ?? 0) * 20;
    const size = 28 + (actor.gauge ?? 0) * 18;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(x, y, size * scale * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillRect(x - size * 0.18, y - size * 0.18, size * 0.36, size * 0.36);
  }
}

function drawHudBanner(ctx, width, height, frameState, log) {
  const state = String(frameState.state ?? "menu");
  const banner = `${state.toUpperCase()}  |  ${log}`;
  ctx.save();
  ctx.fillStyle = "rgba(4, 7, 12, 0.58)";
  ctx.fillRect(24, 24, width - 48, 44);
  ctx.fillStyle = "#f7f2ea";
  ctx.font = "600 18px Trebuchet MS, sans-serif";
  ctx.fillText(banner, 40, 52);
  ctx.restore();
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}
