import { SHAFT_WIDTH, VIEW_HEIGHT, VIEW_WIDTH } from "./data.js";

function drawPlatform(ctx, platform, cameraY) {
  if (!platform.active) {
    return;
  }

  const y = platform.y - cameraY;
  let fill = "#f8fafc";
  if (platform.type === "crumbly") {
    fill = "#fde68a";
  } else if (platform.type === "spike") {
    fill = "#fb7185";
  } else if (platform.type === "goal") {
    fill = "#c4b5fd";
  }

  ctx.fillStyle = fill;
  ctx.fillRect(platform.x, y - 6, platform.width, 12);

  if (platform.type === "spike") {
    ctx.fillStyle = "#7f1d1d";
    for (let x = platform.x + 8; x < platform.x + platform.width - 8; x += 18) {
      ctx.beginPath();
      ctx.moveTo(x, y - 6);
      ctx.lineTo(x + 7, y - 20);
      ctx.lineTo(x + 14, y - 6);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function drawPlayer(ctx, player, cameraY) {
  const x = player.x;
  const y = player.y - cameraY;
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = player.invuln > 0 && Math.floor(player.invuln * 12) % 2 === 0 ? 0.35 : 1;

  ctx.fillStyle = "#e5f3ff";
  ctx.fillRect(-10, -14, 20, 24);

  ctx.fillStyle = "#38bdf8";
  ctx.fillRect(-10, 8, 8, 16);
  ctx.fillRect(2, 8, 8, 16);

  ctx.fillStyle = "#08101c";
  ctx.fillRect(-6, -8, 4, 4);
  ctx.fillRect(2, -8, 4, 4);
  ctx.restore();
}

export function renderScene(ctx, state) {
  const { biome, cameraY } = state;

  const sky = ctx.createLinearGradient(0, 0, 0, VIEW_HEIGHT);
  sky.addColorStop(0, biome.sky);
  sky.addColorStop(1, biome.haze);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

  ctx.fillStyle = "#05070e";
  ctx.fillRect(0, 0, 240, VIEW_HEIGHT);
  ctx.fillRect(240 + SHAFT_WIDTH, 0, VIEW_WIDTH - (240 + SHAFT_WIDTH), VIEW_HEIGHT);

  const shaft = ctx.createLinearGradient(240, 0, 240 + SHAFT_WIDTH, 0);
  shaft.addColorStop(0, "rgba(255,255,255,0.04)");
  shaft.addColorStop(0.5, "rgba(255,255,255,0.01)");
  shaft.addColorStop(1, "rgba(255,255,255,0.04)");
  ctx.fillStyle = shaft;
  ctx.fillRect(240, 0, SHAFT_WIDTH, VIEW_HEIGHT);

  ctx.save();
  ctx.translate(240, 0);

  for (const platform of state.platforms) {
    drawPlatform(ctx, platform, cameraY);
  }

  for (const gem of state.gems) {
    if (gem.collected) {
      continue;
    }
    const y = gem.y - cameraY;
    ctx.fillStyle = "#86efac";
    ctx.beginPath();
    ctx.arc(gem.x, y, gem.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const pack of state.healthPacks ?? []) {
    if (pack.collected) {
      continue;
    }
    const y = pack.y - cameraY;
    ctx.fillStyle = "rgba(252, 165, 165, 0.18)";
    ctx.beginPath();
    ctx.arc(pack.x, y, pack.radius + 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fecaca";
    ctx.fillRect(pack.x - 8, y - 5, 16, 10);
    ctx.fillRect(pack.x - 5, y - 8, 10, 16);
    ctx.fillStyle = "#7f1d1d";
    ctx.fillRect(pack.x - 2, y - 8, 4, 16);
    ctx.fillRect(pack.x - 8, y - 2, 16, 4);
  }

  for (const relay of state.relays) {
    const y = relay.y - cameraY;
    ctx.strokeStyle = relay.activated ? "#f9a8d4" : "rgba(249,168,212,0.55)";
    ctx.fillStyle = relay.activated ? "rgba(249,168,212,0.2)" : "rgba(249,168,212,0.08)";
    ctx.lineWidth = relay.activated ? 4 : 2;
    ctx.beginPath();
    ctx.arc(relay.x, y, relay.radius + 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = relay.activated ? "#fdf2f8" : "#fbcfe8";
    ctx.fillRect(relay.x - 7, y - 16, 14, 32);
    ctx.fillRect(relay.x - 16, y - 5, 32, 10);
  }

  for (const bullet of state.bullets) {
    ctx.fillStyle = "#7dd3fc";
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y - cameraY, bullet.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const drone of state.drones) {
    if (drone.dead) {
      continue;
    }
    const y = drone.y - cameraY;
    if (drone.state === "telegraph") {
      ctx.strokeStyle = "rgba(248,113,113,0.8)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(drone.x, y);
      ctx.lineTo(drone.dashDir < 0 ? 18 : SHAFT_WIDTH - 18, y);
      ctx.stroke();
    }

    ctx.fillStyle = drone.state === "dash" ? "#f97316" : "#c084fc";
    ctx.beginPath();
    ctx.arc(drone.x, y, drone.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#0f172a";
    ctx.fillRect(drone.x - 7, y - 3, 14, 6);
  }

  for (const sentry of state.sentries) {
    if (sentry.dead) {
      continue;
    }
    const y = sentry.y - cameraY;
    if (sentry.state === "telegraph") {
      ctx.strokeStyle = "rgba(251,113,133,0.85)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(sentry.x, y);
      ctx.lineTo(sentry.side === "left" ? SHAFT_WIDTH - 18 : 18, y);
      ctx.stroke();
    }

    ctx.fillStyle = "#111827";
    ctx.fillRect(sentry.x - sentry.width * 0.5, y - sentry.height * 0.5, sentry.width, sentry.height);
    ctx.fillStyle = "#fb7185";
    ctx.fillRect(sentry.x - 6, y - 5, 12, 10);
    ctx.fillStyle = "#fda4af";
    const nozzleX = sentry.side === "left" ? sentry.x + 8 : sentry.x - 12;
    ctx.fillRect(nozzleX, y - 3, 12, 6);
  }

  for (const shot of state.enemyShots) {
    ctx.fillStyle = "#fb7185";
    ctx.beginPath();
    ctx.arc(shot.x, shot.y - cameraY, shot.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  const goalY = state.goal.y - cameraY;
  const goalTop = state.goal.y - state.goal.height * 0.5 - cameraY;
  const goalHeight = state.goal.height;
  ctx.fillStyle = state.goalReady ? "rgba(196,181,253,0.18)" : "rgba(71,85,105,0.16)";
  ctx.fillRect(state.goal.x - state.goal.width * 0.5, goalTop, state.goal.width, goalHeight);
  ctx.strokeStyle = state.goalReady ? "rgba(196,181,253,0.56)" : "rgba(148,163,184,0.4)";
  ctx.lineWidth = 2;
  ctx.strokeRect(state.goal.x - state.goal.width * 0.5, goalTop, state.goal.width, goalHeight);
  ctx.strokeStyle = state.goalReady ? biome.accent : "#64748b";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(state.goal.x, goalY, state.goal.radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = state.goalReady ? "#ede9fe" : "#cbd5e1";
  ctx.font = "700 16px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(state.goalReady ? "Gate Open" : "Gate Locked", state.goal.x, goalY + 6);
  ctx.textAlign = "start";

  drawPlayer(ctx, state.player, cameraY);

  for (const particle of state.particles) {
    ctx.globalAlpha = particle.life / particle.maxLife;
    ctx.fillStyle = particle.color;
    ctx.fillRect(particle.x - 2, particle.y - cameraY - 2, 4, 4);
  }
  ctx.globalAlpha = 1;

  ctx.restore();

  ctx.fillStyle = "rgba(5,10,18,0.88)";
  ctx.fillRect(16, VIEW_HEIGHT - 64, 330, 44);
  ctx.strokeStyle = biome.accent;
  ctx.strokeRect(16, VIEW_HEIGHT - 64, 330, 44);
  ctx.fillStyle = "#f8fafc";
  ctx.font = "16px sans-serif";
  ctx.fillText(state.message || "Descend.", 30, VIEW_HEIGHT - 36);

  ctx.fillStyle = "#f9a8d4";
  ctx.font = "700 16px sans-serif";
  ctx.fillText(`Relays ${state.relaysActivated}/${state.requiredRelays}`, VIEW_WIDTH - 174, VIEW_HEIGHT - 36);

  if (state.combo > 1) {
    ctx.fillStyle = biome.accent;
    ctx.font = "700 18px sans-serif";
    ctx.fillText(`Streak x${state.combo}`, VIEW_WIDTH - 170, 46);
  }
}
