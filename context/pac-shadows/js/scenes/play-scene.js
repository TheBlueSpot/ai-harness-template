import { createMaze } from "../systems/maze.js";
import { createPlayer, updatePlayer } from "../systems/player.js";
import { createLightingSystem } from "../systems/lighting.js";
import { createGhostSystem } from "../systems/ghosts.js";
import { createFxSystem } from "../systems/fx.js";

export const createPlayScene = ({ assets, config }) => {
  let maze = createMaze(config.maze.layout, config.maze.tileSize);
  let player = createPlayer({
    ...maze.centerOfCell(config.maze.playerSpawn.col, config.maze.playerSpawn.row),
    radius: config.player.radius,
    speed: config.player.speed
  });
  const lighting = createLightingSystem(config.lighting);
  config.ghosts.spawnCells = config.maze.ghostSpawns;
  config.ghosts.debug = config.debug;
  const ghosts = createGhostSystem(config.ghosts);
  const fx = createFxSystem();
  let stepCooldown = 0;

  return {
    enter(runtime) {
      runtime.patchSharedState({
        sceneLabel: "Play",
        sceneHint: "Move with WASD or arrows. Light drives ghost aggression."
      });
      maze = createMaze(config.maze.layout, config.maze.tileSize);
      player = createPlayer({
        ...maze.centerOfCell(config.maze.playerSpawn.col, config.maze.playerSpawn.row),
        radius: config.player.radius,
        speed: config.player.speed
      });
      lighting.rays = [];
      lighting.beamPolygon = [];
      lighting.playerX = player.x;
      lighting.playerY = player.y;
      ghosts.reset(maze);
      fx.particles.length = 0;
      stepCooldown = 0;
    },
    onKeyDown(event, runtime) {
      if (event.code === "Escape") {
        runtime.go("menu");
      }
      if (config.debug.enabled && event.code === "Digit1") {
        runtime.go("win");
      }
      if (config.debug.enabled && event.code === "Digit2") {
        runtime.go("lose");
      }
      if (config.debug.enabled && event.code === "KeyP") {
        fx.spawnSpiritDeath(player.x, player.y, 12);
      }
    },
    update(dt, runtime) {
      const input = runtime.getSharedState().input;
      if (!input) {
        return;
      }

      stepCooldown = Math.max(0, stepCooldown - dt);
      const movement = updatePlayer(player, input, maze, dt);
      lighting.update(player, maze);

      if (movement.moved && (movement.cellChanged || stepCooldown <= 0)) {
        assets.sounds.step?.play(assets.audio, { volume: movement.blocked ? 0.6 : 0.9 });
        fx.spawnPulse(player.x, player.y, "#7ef8ff", movement.blocked ? 4 : 6);
        stepCooldown = movement.blocked ? 0.24 : 0.14;
      }

      const ghostResult = ghosts.update(dt, { player, maze, lighting, fx });
      for (const event of ghostResult.events) {
        handleGhostEvent(event, { assets, fx });
      }
      fx.update(dt);

      if (ghostResult.capture) {
        assets.sounds.lose?.play(assets.audio, { volume: 1 });
        fx.spawnSpiritDeath(player.x, player.y, 36);
        if (ghostResult.x != null && ghostResult.y != null) {
          fx.spawnSpiritDeath(ghostResult.x, ghostResult.y, 18);
        }
        runtime.go("lose");
        return;
      }

      if (reachedExit(player, maze, config.maze.exitCell)) {
        assets.sounds.win?.play(assets.audio, { volume: 1 });
        fx.spawnSpiritDeath(player.x, player.y, 10);
        runtime.go("win");
        return;
      }
    },
    render(ctx) {
      drawScene(ctx, maze, player, lighting, ghosts, fx, assets, config);
    }
  };
};

const handleGhostEvent = (event, { assets, fx }) => {
  if (event.type === "ghost-lit") {
    assets.sounds.alert?.play(assets.audio, { volume: 0.85 });
    fx.spawnPulse(event.x ?? 0, event.y ?? 0, "#a0ffef", 6);
  }

  if (event.type === "ghost-state") {
    if (event.state === "hunt") {
      assets.sounds.alert?.play(assets.audio, { volume: 1 });
      fx.spawnPulse(event.x ?? 0, event.y ?? 0, "#ff7b7b", 8);
    } else if (event.state === "search") {
      fx.spawnPulse(event.x ?? 0, event.y ?? 0, "#ffb46b", 6);
    }
  }
};

const drawScene = (ctx, maze, player, lighting, ghosts, fx, assets, config) => {
  const width = ctx.canvas.clientWidth;
  const height = ctx.canvas.clientHeight;

  ctx.fillStyle = "#050814";
  ctx.fillRect(0, 0, width, height);
  drawBackdrop(ctx, width, height);
  drawMaze(ctx, maze, assets, config);
  drawExit(ctx, maze, config);
  ghosts.render(ctx, maze, assets);
  fx.render(ctx, assets);
  drawPlayer(ctx, player, assets);
  drawBeamGuide(ctx, lighting, player, config);
  lighting.render(ctx, player, maze);
  drawDangerSense(ctx, player, ghosts, maze, config);
  drawHud(ctx, lighting, ghosts, fx, assets, config);
};

const drawBackdrop = (ctx, width, height) => {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#081125");
  gradient.addColorStop(1, "#04070f");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  const glow = ctx.createRadialGradient(width * 0.5, height * 0.25, 30, width * 0.5, height * 0.25, width * 0.75);
  glow.addColorStop(0, "rgba(126,248,255,0.06)");
  glow.addColorStop(1, "rgba(126,248,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);
};

const drawMaze = (ctx, maze, assets, config) => {
  const floor = assets.images["maze-floor"];
  const wall = assets.images["maze-wall"];

  for (let row = 0; row < maze.rows.length; row += 1) {
    for (let col = 0; col < maze.rows[row].length; col += 1) {
      const tile = maze.rows[row][col];
      const x = col * maze.tileSize;
      const y = row * maze.tileSize;

      if (tile === "#") {
        if (wall) {
          ctx.drawImage(wall, x, y, maze.tileSize, maze.tileSize);
        } else {
          ctx.fillStyle = "#1a2644";
          ctx.fillRect(x, y, maze.tileSize, maze.tileSize);
        }
        ctx.strokeStyle = "rgba(126,248,255,0.05)";
        ctx.strokeRect(x + 0.5, y + 0.5, maze.tileSize - 1, maze.tileSize - 1);
      } else {
        if (floor) {
          ctx.drawImage(floor, x, y, maze.tileSize, maze.tileSize);
        } else {
          ctx.fillStyle = "#08111f";
          ctx.fillRect(x, y, maze.tileSize, maze.tileSize);
        }
      }
    }
  }

  if (config.debug.enabled) {
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    for (let row = 0; row <= maze.rows.length; row += 1) {
      ctx.beginPath();
      ctx.moveTo(0, row * maze.tileSize + 0.5);
      ctx.lineTo(maze.width, row * maze.tileSize + 0.5);
      ctx.stroke();
    }
    for (let col = 0; col <= maze.rows[0].length; col += 1) {
      ctx.beginPath();
      ctx.moveTo(col * maze.tileSize + 0.5, 0);
      ctx.lineTo(col * maze.tileSize + 0.5, maze.height);
      ctx.stroke();
    }
  }
};

const drawExit = (ctx, maze, config) => {
  const exit = maze.centerOfCell(config.maze.exitCell.col, config.maze.exitCell.row);
  const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.004);
  ctx.save();
  ctx.strokeStyle = `rgba(155,229,100,${0.35 + pulse * 0.2})`;
  ctx.fillStyle = `rgba(155,229,100,${0.1 + pulse * 0.1})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(exit.x, exit.y, maze.tileSize * 0.25 + pulse * 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
};

const drawPlayer = (ctx, player, assets) => {
  const sprite = assets.images.player;
  ctx.save();
  ctx.fillStyle = "rgba(126,248,255,0.2)";
  ctx.beginPath();
  ctx.arc(player.x, player.y, player.radius * 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(player.facingAngle);
  if (sprite) {
    const size = player.radius * 2.3;
    ctx.drawImage(sprite, -size * 0.5, -size * 0.5, size, size);
  } else {
    ctx.fillStyle = "#7ef8ff";
    ctx.beginPath();
    ctx.arc(0, 0, player.radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
};

const drawDangerSense = (ctx, player, ghosts, maze, config) => {
  const senseRadius = config.player.dangerSenseRadius ?? 160;
  let strongestThreat = 0;
  const threatSamples = [];

  for (const ghost of ghosts.ghosts) {
    const dx = ghost.x - player.x;
    const dy = ghost.y - player.y;
    const distance = Math.hypot(dx, dy);
    if (distance > senseRadius) {
      continue;
    }

    const distanceFactor = 1 - distance / senseRadius;
    const hasLineOfSight = maze.hasLineOfSight(player.x, player.y, ghost.x, ghost.y);
    const lineOfSightFactor = hasLineOfSight ? 1 : 0.55;
    const stateFactor = ghost.state === "hunt" ? 1 : ghost.state === "search" ? 0.74 : 0.48;
    const threat = clamp(distanceFactor * lineOfSightFactor * Math.max(stateFactor, ghost.awareness), 0, 1);
    strongestThreat = Math.max(strongestThreat, threat);
    threatSamples.push({
      angle: Math.atan2(dy, dx),
      threat,
      distanceFactor,
      hasLineOfSight,
      state: ghost.state
    });
  }

  const pulse = 0.5 + 0.5 * Math.sin(performance.now() * (8 + strongestThreat * 8) * 0.001);
  const orbRadius = player.radius * 4.1 + strongestThreat * 18;

  ctx.save();
  ctx.fillStyle =
    strongestThreat > 0.45
      ? "rgba(255,123,123,0.14)"
      : strongestThreat > 0.15
        ? "rgba(255,180,107,0.12)"
        : "rgba(126,248,255,0.1)";
  ctx.beginPath();
  ctx.arc(player.x, player.y, player.radius * 1.75 + strongestThreat * 4, 0, Math.PI * 2);
  ctx.fill();

  const orb = ctx.createRadialGradient(player.x, player.y, player.radius * 0.65, player.x, player.y, orbRadius);
  orb.addColorStop(0, strongestThreat > 0.45 ? "rgba(255,123,123,0.2)" : "rgba(126,248,255,0.18)");
  orb.addColorStop(0.68, strongestThreat > 0.45 ? "rgba(255,123,123,0.12)" : "rgba(126,248,255,0.08)");
  orb.addColorStop(1, "rgba(255,123,123,0)");
  ctx.fillStyle = orb;
  ctx.beginPath();
  ctx.arc(player.x, player.y, orbRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.lineWidth = 2.5 + strongestThreat * 1.5;
  ctx.strokeStyle =
    strongestThreat > 0.6
      ? `rgba(255,123,123,${0.48 + pulse * 0.24})`
      : strongestThreat > 0.25
        ? `rgba(255,180,107,${0.36 + pulse * 0.18})`
        : "rgba(126,248,255,0.38)";
  ctx.beginPath();
  ctx.arc(player.x, player.y, player.radius * 2.9 + strongestThreat * 10, 0, Math.PI * 2);
  ctx.stroke();

  const ringRadius = player.radius * 3.5 + strongestThreat * 12;
  const topThreats = threatSamples
    .filter((sample) => sample.threat > 0.1)
    .sort((left, right) => right.threat - left.threat)
    .slice(0, 3);

  for (const sample of topThreats) {
    const arcHalfSpan = 0.16 + sample.distanceFactor * 0.22;
    const alpha = 0.18 + sample.threat * 0.56 + pulse * 0.08;
    ctx.beginPath();
    ctx.lineWidth = 4 + sample.threat * 3;
    ctx.strokeStyle =
      sample.state === "hunt"
        ? `rgba(255,123,123,${alpha})`
        : sample.state === "search"
          ? `rgba(255,180,107,${alpha * 0.92})`
          : `rgba(126,248,255,${alpha * 0.72})`;
    ctx.arc(player.x, player.y, ringRadius, sample.angle - arcHalfSpan, sample.angle + arcHalfSpan);
    ctx.stroke();

    if (sample.hasLineOfSight && sample.threat > 0.32) {
      const pipRadius = ringRadius + 6 + sample.threat * 4;
      const pipX = player.x + Math.cos(sample.angle) * pipRadius;
      const pipY = player.y + Math.sin(sample.angle) * pipRadius;
      ctx.fillStyle =
        sample.state === "hunt"
          ? `rgba(255,123,123,${0.4 + sample.threat * 0.35})`
          : `rgba(255,180,107,${0.32 + sample.threat * 0.28})`;
      ctx.beginPath();
      ctx.arc(pipX, pipY, 2.2 + sample.threat * 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (strongestThreat > 0.2) {
    const arrowRadius = player.radius * 2.2 + strongestThreat * 10;
    const arrowX = player.x + Math.cos(topThreats[0]?.angle ?? 0) * arrowRadius;
    const arrowY = player.y + Math.sin(topThreats[0]?.angle ?? 0) * arrowRadius;
    ctx.strokeStyle =
      strongestThreat > 0.6
        ? `rgba(255,123,123,${0.56 + pulse * 0.2})`
        : `rgba(255,180,107,${0.46 + pulse * 0.15})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(player.x, player.y);
    ctx.lineTo(arrowX, arrowY);
    ctx.stroke();
    ctx.fillStyle =
      strongestThreat > 0.6
        ? `rgba(255,123,123,${0.52 + strongestThreat * 0.18})`
        : `rgba(255,180,107,${0.42 + strongestThreat * 0.16})`;
    ctx.beginPath();
    ctx.arc(arrowX, arrowY, 4 + strongestThreat * 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
};

const drawBeamGuide = (ctx, lighting, player, config) => {
  if (!config.debug.enabled) {
    return;
  }

  ctx.save();
  ctx.strokeStyle = "rgba(126,248,255,0.22)";
  ctx.fillStyle = "rgba(126,248,255,0.06)";
  ctx.beginPath();
  if (lighting.beamPolygon.length) {
    ctx.moveTo(lighting.beamPolygon[0].x, lighting.beamPolygon[0].y);
    for (let index = 1; index < lighting.beamPolygon.length; index += 1) {
      ctx.lineTo(lighting.beamPolygon[index].x, lighting.beamPolygon[index].y);
    }
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(player.x, player.y, config.lighting.radius * 0.04, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
};

const drawHud = (ctx, lighting, ghosts, fx, assets, config) => {
  const width = ctx.canvas.clientWidth;
  const panel = assets.images["ui-panel"];
  const huntCount = ghosts.ghosts.filter((ghost) => ghost.state === "hunt").length;
  const searchCount = ghosts.ghosts.filter((ghost) => ghost.state === "search").length;
  const patrolCount = ghosts.ghosts.filter((ghost) => ghost.state === "patrol").length;
  const beamState =
    lighting.lastVisibleRatio > 0.38
      ? "Bright beam"
      : lighting.lastVisibleRatio > 0.2
        ? "Half-hidden beam"
        : "Tight beam";
  const threatState =
    huntCount > 0
      ? "Red ring means hunt pressure is on top of you."
      : searchCount > 0
        ? "Amber ring means ghosts are tracking the light."
        : "Cyan ring means your lane is still calm.";
  ctx.save();
  if (panel) {
    ctx.globalAlpha = 0.92;
    ctx.drawImage(panel, width - 438, 16, 418, 200);
    ctx.globalAlpha = 1;
  } else {
    ctx.fillStyle = "rgba(7,12,24,0.72)";
    ctx.fillRect(width - 438, 16, 418, 200);
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.strokeRect(width - 438, 16, 418, 200);
  }

  ctx.fillStyle = "#f7f4ea";
  ctx.font = "700 18px Trebuchet MS";
  ctx.fillText("Pac Shadows", width - 398, 48);
  ctx.font = "400 13px Trebuchet MS";
  ctx.fillStyle = "rgba(247,244,234,0.8)";
  ctx.fillText("Goal: reach the green exit without waking the room.", width - 398, 74);
  ctx.fillText(`${beamState}. Keep ghosts outside the cone when you can.`, width - 398, 94);
  ctx.fillText(`Ghost states: ${huntCount} hunt | ${searchCount} search | ${patrolCount} patrol`, width - 398, 114);
  ctx.fillText(threatState, width - 398, 134);
  ctx.fillText("Move: WASD or arrows. Escape returns to menu.", width - 398, 154);
  ctx.fillText("Light up the route, then cut the beam before ghosts commit.", width - 398, 174);

  if (config.debug.enabled) {
    ctx.fillStyle = "#9be564";
    ctx.fillText(`Debug hooks active via window.__PAC_SHADOWS__ | FX ${fx.particles.length}`, width - 398, 194);
  }

  ctx.restore();
};

const reachedExit = (player, maze, exitCell) => {
  const playerCell = maze.cellFromWorld(player.x, player.y);
  return playerCell.col === exitCell.col && playerCell.row === exitCell.row;
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
