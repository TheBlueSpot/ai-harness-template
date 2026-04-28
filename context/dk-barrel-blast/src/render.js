const WIDTH = 1280;
const HEIGHT = 720;

function clear(ctx, frameState) {
  const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  sky.addColorStop(0, "#09131f");
  sky.addColorStop(0.56, "#13283b");
  sky.addColorStop(1, "#1c1e24");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = "rgba(255,255,255,0.04)";
  for (let i = 0; i < 20; i += 1) {
    ctx.fillRect((i * 91) % WIDTH, 36 + ((i * 37) % 160), 52, 4);
  }

  ctx.fillStyle = "rgba(82, 43, 24, 0.42)";
  ctx.fillRect(0, HEIGHT - 88, WIDTH, 88);

  if (frameState?.stormGlow) {
    ctx.fillStyle = "rgba(255, 193, 92, 0.08)";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }
}

function drawPlatform(ctx, platform) {
  const x = platform.x ?? 0;
  const y = platform.y ?? 0;
  const w = platform.width ?? platform.w ?? 240;
  const h = platform.height ?? platform.h ?? 20;
  const angle = platform.angle ?? 0;

  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(angle);
  ctx.translate(-w / 2, -h / 2);

  ctx.fillStyle = platform.fill ?? "#7b4a24";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(255, 224, 176, 0.26)";
  ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, w, h);

  ctx.fillStyle = "rgba(22, 14, 10, 0.18)";
  for (let i = 0; i < Math.max(1, Math.floor(w / 54)); i += 1) {
    ctx.fillRect(i * 54 + 8, 3, 20, h - 6);
  }
  ctx.restore();
}

function drawLadder(ctx, ladder) {
  const x = ladder.x ?? 0;
  const top = ladder.yTop ?? 0;
  const bottom = ladder.yBottom ?? top + 100;
  const width = ladder.width ?? 42;

  ctx.save();
  ctx.strokeStyle = "rgba(255, 214, 128, 0.9)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x - width * 0.25, top);
  ctx.lineTo(x - width * 0.25, bottom);
  ctx.moveTo(x + width * 0.25, top);
  ctx.lineTo(x + width * 0.25, bottom);
  for (let y = top + 12; y < bottom; y += 18) {
    ctx.moveTo(x - width * 0.25, y);
    ctx.lineTo(x + width * 0.25, y);
  }
  ctx.stroke();
  ctx.restore();
}

function drawLaunchPad(ctx, pad) {
  const x = pad.x ?? 0;
  const y = pad.y ?? 0;
  const radius = pad.radius ?? 28;
  const glow = Math.max(0, 1 - (pad.cooldown ?? 0));

  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = `rgba(255, 170, 74, ${0.26 + glow * 0.18})`;
  ctx.beginPath();
  ctx.arc(0, 0, radius + 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#cb5d1d";
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#ffe2ab";
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = "#fff4c4";
  ctx.beginPath();
  ctx.moveTo(-8, 8);
  ctx.lineTo(12, 0);
  ctx.lineTo(-8, -8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawCharacter(ctx, actor) {
  const x = actor.x ?? 0;
  const y = actor.y ?? 0;
  const facing = actor.facing ?? 1;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(facing, 1);

  ctx.fillStyle = "#d96b3d";
  ctx.beginPath();
  ctx.arc(0, 0, 22, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#f0c8b8";
  ctx.beginPath();
  ctx.arc(5, -7, 10, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#1c1510";
  ctx.fillRect(-18, 16, 36, 10);
  ctx.fillStyle = "#5b3120";
  ctx.fillRect(-14, 20, 28, 14);

  ctx.fillStyle = "#ffd37c";
  ctx.beginPath();
  ctx.arc(0, -32, 7, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawBarrel(ctx, barrel) {
  const x = barrel.x ?? 0;
  const y = barrel.y ?? 0;
  const radius = barrel.radius ?? 18;
  const speed = barrel.spin ?? barrel.rotation ?? 0;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(speed);

  ctx.fillStyle = barrel.color ?? "#b96c2c";
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 219, 160, 0.45)";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = "#6a3d19";
  ctx.fillRect(-radius, -5, radius * 2, 10);
  ctx.fillStyle = "#f0d0a8";
  ctx.fillRect(-radius * 0.65, -14, radius * 1.3, 4);
  ctx.fillRect(-radius * 0.65, 10, radius * 1.3, 4);

  ctx.restore();
}

function drawZinger(ctx, zinger) {
  const x = zinger.x ?? 0;
  const y = zinger.y ?? 0;
  const radius = zinger.radius ?? 20;

  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = zinger.color ?? "#63e6ff";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.88)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, radius - 7, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawBanana(ctx, banana) {
  const x = banana.x ?? 0;
  const y = banana.y ?? 0;

  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = banana.color ?? "#ffd84d";
  ctx.beginPath();
  ctx.moveTo(-4, -18);
  ctx.quadraticCurveTo(12, -10, 14, 8);
  ctx.quadraticCurveTo(5, 18, -9, 12);
  ctx.quadraticCurveTo(-13, -2, -4, -18);
  ctx.fill();
  ctx.fillStyle = "#9f7b12";
  ctx.fillRect(4, 12, 6, 7);
  ctx.restore();
}

function drawLandingZone(ctx, zone) {
  const x = zone.x ?? 0;
  const y = zone.y ?? 0;
  const w = zone.width ?? zone.w ?? 120;
  const h = zone.height ?? zone.h ?? 42;

  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "rgba(255, 210, 80, 0.14)";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = zone.color ?? "#ffd24a";
  ctx.lineWidth = 4;
  ctx.strokeRect(0, 0, w, h);
  ctx.fillStyle = "#fff6ca";
  ctx.font = "700 18px Georgia, serif";
  ctx.fillText(zone.label ?? "LAND HERE", 14, 27);
  ctx.restore();
}

function drawOverlayText(ctx, frameState) {
  const lines = [
    frameState?.status,
    frameState?.hint,
  ].filter(Boolean);

  if (!lines.length) return;

  ctx.save();
  ctx.fillStyle = "rgba(9, 15, 21, 0.74)";
  ctx.fillRect(24, 22, 470, 78);
  ctx.fillStyle = "#f5f2ea";
  ctx.font = "700 24px Georgia, serif";
  ctx.fillText(lines[0], 42, 54);
  ctx.font = "500 16px Georgia, serif";
  if (lines[1]) ctx.fillText(lines[1], 42, 82);
  ctx.restore();
}

export function renderGame(ctx, frameState) {
  if (!ctx) return;
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  clear(ctx, frameState);

  const platforms = frameState?.platforms ?? [];
  const barrels = frameState?.barrels ?? [];
  const zingers = frameState?.zingers ?? [];
  const bananas = frameState?.bananaItems ?? frameState?.collectibles?.bananas ?? [];
  const landingZones = frameState?.landingZones ?? [];
  const actors = frameState?.actors ?? [];
  const ladders = frameState?.ladders ?? [];
  const launchPads = frameState?.launchPads ?? [];

  for (const platform of platforms) drawPlatform(ctx, platform);
  for (const ladder of ladders) drawLadder(ctx, ladder);
  for (const zone of landingZones) drawLandingZone(ctx, zone);
  for (const pad of launchPads) drawLaunchPad(ctx, pad);
  for (const banana of bananas) drawBanana(ctx, banana);
  for (const barrel of barrels) drawBarrel(ctx, barrel);
  for (const zinger of zingers) drawZinger(ctx, zinger);
  for (const actor of actors) drawCharacter(ctx, actor);

  drawOverlayText(ctx, frameState);
}
