export function renderWorld(ctx, frame = {}) {
  if (!ctx) {
    return;
  }

  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const world = frame.world ?? {};
  const scaleX = width / Math.max(1, world.width ?? width);
  const scaleY = height / Math.max(1, world.height ?? height);

  ctx.save();
  ctx.scale(scaleX, scaleY);
  paintSky(ctx, world.width ?? width, world.height ?? height, frame);
  paintGround(ctx, world.width ?? width, world.height ?? height, frame);
  paintScavengeSites(ctx, frame);
  paintBarricade(ctx, frame);
  paintSurvivors(ctx, frame);
  paintPlayer(ctx, frame);
  paintThreats(ctx, frame);
  paintCombatImpacts(ctx, frame);
  paintPrompts(ctx, frame);
  ctx.restore();
}

function paintSky(ctx, width, height, frame) {
  const night = clamp01(frame.night ?? 0);
  const dayMix = 1 - night;
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, `rgb(${mix(22, 80, dayMix)}, ${mix(25, 112, dayMix)}, ${mix(34, 144, dayMix)})`);
  gradient.addColorStop(0.6, `rgb(${mix(13, 56, dayMix)}, ${mix(16, 78, dayMix)}, ${mix(24, 93, dayMix)})`);
  gradient.addColorStop(1, "#080b0f");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.globalAlpha = 0.25 + dayMix * 0.22;
  ctx.fillStyle = "#f6be72";
  ctx.beginPath();
  ctx.arc(width * 0.22, height * 0.18, 44, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function paintGround(ctx, width, height, frame) {
  const groundY = frame.world?.groundY ?? height * 0.76;
  const night = clamp01(frame.night ?? 0);
  const ground = ctx.createLinearGradient(0, groundY, 0, height);
  ground.addColorStop(0, `rgba(${mix(48, 34, 1 - night)}, ${mix(54, 42, 1 - night)}, ${mix(45, 38, 1 - night)}, 1)`);
  ground.addColorStop(1, "#111512");
  ctx.fillStyle = ground;
  ctx.fillRect(0, groundY, width, height - groundY);

  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.beginPath();
  for (let x = 0; x <= width; x += 78) {
    ctx.moveTo(x, groundY);
    ctx.lineTo(x + 22, height);
  }
  ctx.stroke();
}

function paintScavengeSites(ctx, frame) {
  for (const site of frame.scavengeSites ?? []) {
    ctx.globalAlpha = site.collected ? 0.18 : 1;
    ctx.fillStyle = site.kind === "ammo" ? "#b7d6f8" : site.kind === "med" ? "#a7ddb4" : "#cfb482";
    ctx.fillRect(site.x - 26, site.y - 18, 52, 36);
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.strokeRect(site.x - 26, site.y - 18, 52, 36);
    ctx.fillStyle = "#0d1114";
    ctx.font = "700 14px Georgia, serif";
    ctx.fillText(site.id, site.x - 24, site.y - 24);
  }
  ctx.globalAlpha = 1;
}

function paintBarricade(ctx, frame) {
  const barricade = frame.barricade ?? {};
  const ratio = clamp01(barricade.hpRatio ?? 1);
  ctx.fillStyle = "#6a4b31";
  ctx.fillRect(barricade.x, barricade.y - barricade.height * 0.5, barricade.width, barricade.height);
  ctx.fillStyle = "#c39a6a";
  ctx.fillRect(barricade.x + 6, barricade.y - barricade.height * 0.5 + 8, barricade.width - 12, barricade.height - 16);
  ctx.fillStyle = "rgba(18,20,24,0.4)";
  ctx.fillRect(barricade.x - 30, barricade.y + 28, barricade.width + 60, 12);

  ctx.fillStyle = "#111";
  ctx.fillRect(barricade.x - 28, barricade.y - barricade.height * 0.5 - 24, 120, 10);
  ctx.fillStyle = ratio > 0.45 ? "#7ed886" : ratio > 0.2 ? "#e3ba63" : "#ee7266";
  ctx.fillRect(barricade.x - 28, barricade.y - barricade.height * 0.5 - 24, 120 * ratio, 10);
}

function paintSurvivors(ctx, frame) {
  for (const survivor of frame.survivors ?? []) {
    if (survivor.dead) {
      continue;
    }
    ctx.fillStyle = "#e6eadc";
    ctx.fillRect(survivor.x - 7, survivor.y - 22, 14, 22);
    ctx.fillStyle = "#394249";
    ctx.fillRect(survivor.x - 4, survivor.y - 30, 8, 8);
  }
}

function paintPlayer(ctx, frame) {
  const player = frame.player ?? {};
  const aim = normalize(player.aimX ?? 1, player.aimY ?? 0);
  ctx.fillStyle = "#f1f3ec";
  ctx.fillRect(player.x - 12, player.y - 28, 24, 28);
  ctx.fillStyle = "#33424e";
  ctx.fillRect(player.x - 7, player.y - 38, 14, 10);
  ctx.strokeStyle = "#ffd18f";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(player.x, player.y - 18);
  ctx.lineTo(player.x + aim.x * 28, player.y - 18 + aim.y * 18);
  ctx.stroke();

  ctx.fillStyle = "rgba(0,0,0,0.38)";
  ctx.fillRect(player.x - 24, player.y - 56, 48, 8);
  ctx.fillStyle = "#7dd790";
  ctx.fillRect(player.x - 24, player.y - 56, 48 * clamp01((player.health ?? 0) / Math.max(1, player.maxHealth ?? 1)), 8);
}

function paintThreats(ctx, frame) {
  for (const threat of frame.threats ?? []) {
    const color = threat.type === "brute" ? "#81c66d" : threat.type === "runner" ? "#b4ef89" : "#8fd07e";
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(threat.x, threat.y - threat.size * 0.5, threat.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(8,10,8,0.42)";
    ctx.fillRect(threat.x - threat.size, threat.y + 2, threat.size * 2, 6);
  }
}

function paintCombatImpacts(ctx, frame) {
  ctx.font = "700 13px Georgia, serif";
  for (const impact of frame.combatLog ?? []) {
    ctx.fillStyle = impact.zone === "head" ? "#ffd37c" : "#f18776";
    ctx.fillText(impact.zone.toUpperCase(), impact.x - 16, impact.y - 26);
  }
}

function paintPrompts(ctx, frame) {
  const player = frame.player ?? {};
  const day = frame.phase === "day";
  const message = day
    ? "E at a marked stop to loot. E at the barricade to repair, upgrade, or buy ammo."
    : "Hold Space or click to fire. Press F for melee. E at the wall for an emergency patch.";
  ctx.fillStyle = "rgba(9, 11, 14, 0.5)";
  ctx.fillRect(24, 24, 640, 34);
  ctx.fillStyle = "#eef3ed";
  ctx.font = "600 16px Georgia, serif";
  ctx.fillText(message, 38, 46);

  if (frame.phase === "night") {
    ctx.fillStyle = "rgba(9, 11, 14, 0.58)";
    ctx.fillRect(player.x - 28, player.y - 74, 56, 10);
    ctx.fillStyle = "#95d3af";
    ctx.fillRect(player.x - 28, player.y - 74, 56 * clamp01((player.stamina ?? 0) / 100), 10);
  }
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function mix(a, b, t) {
  return Math.round(a + (b - a) * clamp01(t));
}

function normalize(x, y) {
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
}
