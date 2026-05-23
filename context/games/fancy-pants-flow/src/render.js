import { CANVAS_HEIGHT, CANVAS_WIDTH, COURSE_LENGTH, getTerrainHeight } from "./terrain.js";

const INK = "#1d1c26";
const ORANGE = "#ef8f1f";
const TEAL = "#2bb7a8";
const BLUE = "#7bc2ff";

export function renderGame(ctx, state) {
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  drawSky(ctx, state.level);
  drawNotebookPaper(ctx, state.cameraX, state.level);
  ctx.save();
  ctx.translate(-state.cameraX, 0);
  drawBackdrop(ctx, state.cameraX, state.level);
  drawDoodles(ctx, state.level);
  drawTerrain(ctx, state.level.index);
  drawCheckpoints(ctx, state.level);
  drawBoostPads(ctx, state.level);
  drawDraftZones(ctx, state.level);
  drawTrickGates(ctx, state.trickGates);
  drawCollectibles(ctx, state.collectibles);
  drawFinish(ctx, state.level.index);
  drawInkWaves(ctx, state.inkWaves);
  drawParticles(ctx, state.particles);
  drawPlayer(ctx, state.player);
  ctx.restore();
}

function drawSky(ctx, level) {
  const sky = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
  sky.addColorStop(0, level.skyTop);
  sky.addColorStop(0.7, "#fff0c8");
  sky.addColorStop(1, level.skyBottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
}

function drawNotebookPaper(ctx, cameraX, level) {
  ctx.save();
  ctx.globalAlpha = 0.42;
  ctx.fillStyle = level.pageTint;
  ctx.fillRect(0, 70, CANVAS_WIDTH, CANVAS_HEIGHT - 110);
  ctx.strokeStyle = "rgba(76, 144, 255, 0.18)";
  ctx.lineWidth = 2;
  for (let y = 110; y < CANVAS_HEIGHT - 20; y += 54) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(CANVAS_WIDTH, y);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(255, 64, 64, 0.18)";
  ctx.beginPath();
  ctx.moveTo(92, 70);
  ctx.lineTo(92, CANVAS_HEIGHT - 40);
  ctx.stroke();

  ctx.fillStyle = "rgba(29, 28, 38, 0.08)";
  ctx.font = "italic 28px Georgia, serif";
  ctx.fillText(level.name.toLowerCase(), 112, 58);
  ctx.fillText(`camera ${Math.floor((cameraX + 200) / 300)}`, CANVAS_WIDTH - 210, 58);
  ctx.restore();
}

function drawBackdrop(ctx, cameraX, level) {
  const parallax = cameraX * 0.24;
  ctx.save();
  ctx.translate(-parallax, 0);
  for (let i = -2; i < 9; i += 1) {
    const x = i * 340;
    ctx.fillStyle = level.hillColors[i % level.hillColors.length];
    ctx.beginPath();
    ctx.moveTo(x, 540);
    ctx.quadraticCurveTo(x + 140, 320, x + 290, 540);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawDoodles(ctx, level) {
  ctx.save();
  ctx.strokeStyle = "rgba(29, 28, 38, 0.7)";
  ctx.fillStyle = "rgba(29, 28, 38, 0.08)";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.font = "bold 20px 'Trebuchet MS', sans-serif";
  for (const doodle of level.doodles) {
    if (doodle.kind === "sun") {
      ctx.beginPath();
      ctx.arc(doodle.x, doodle.y, doodle.size * 0.45, 0, Math.PI * 2);
      ctx.stroke();
      for (let i = 0; i < 10; i += 1) {
        const angle = (Math.PI * 2 * i) / 10;
        ctx.beginPath();
        ctx.moveTo(doodle.x + Math.cos(angle) * doodle.size * 0.6, doodle.y + Math.sin(angle) * doodle.size * 0.6);
        ctx.lineTo(doodle.x + Math.cos(angle) * doodle.size, doodle.y + Math.sin(angle) * doodle.size);
        ctx.stroke();
      }
    } else if (doodle.kind === "cloud") {
      ctx.beginPath();
      ctx.arc(doodle.x - 28, doodle.y + 6, 24, Math.PI * 0.7, Math.PI * 1.95);
      ctx.arc(doodle.x + 8, doodle.y - 6, 28, Math.PI, Math.PI * 1.95);
      ctx.arc(doodle.x + 40, doodle.y + 4, 22, Math.PI * 1.1, Math.PI * 1.95);
      ctx.stroke();
    } else if (doodle.kind === "ring") {
      ctx.strokeStyle = "rgba(29, 28, 38, 0.55)";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(doodle.x, doodle.y, doodle.size * 0.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(doodle.x, doodle.y + doodle.size * 0.5);
      ctx.lineTo(doodle.x, doodle.y + doodle.size * 1.2);
      ctx.stroke();
      ctx.strokeStyle = "rgba(29, 28, 38, 0.7)";
      ctx.lineWidth = 4;
    } else if (doodle.kind === "tube") {
      ctx.strokeRect(doodle.x - doodle.size * 0.5, doodle.y - 34, doodle.size, 68);
      ctx.strokeRect(doodle.x - doodle.size * 0.3, doodle.y - 72, doodle.size * 0.6, 30);
    } else if (doodle.kind === "ink") {
      ctx.beginPath();
      ctx.moveTo(doodle.x, doodle.y - doodle.size * 0.55);
      for (let i = 0; i < 8; i += 1) {
        const angle = (-Math.PI / 2) + (Math.PI * 2 * i) / 8;
        const radius = doodle.size * (0.6 + (i % 2) * 0.18);
        ctx.lineTo(doodle.x + Math.cos(angle) * radius, doodle.y + Math.sin(angle) * radius);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (doodle.kind === "star") {
      ctx.beginPath();
      for (let i = 0; i < 10; i += 1) {
        const angle = -Math.PI / 2 + (Math.PI * i) / 5;
        const radius = i % 2 === 0 ? doodle.size : doodle.size * 0.45;
        const x = doodle.x + Math.cos(angle) * radius;
        const y = doodle.y + Math.sin(angle) * radius;
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.closePath();
      ctx.stroke();
    } else if (doodle.kind === "spiral") {
      ctx.beginPath();
      for (let i = 0; i < 28; i += 1) {
        const t = i / 27;
        const angle = t * Math.PI * 4.4;
        const radius = doodle.size * t;
        const x = doodle.x + Math.cos(angle) * radius;
        const y = doodle.y + Math.sin(angle) * radius;
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    } else if (doodle.kind === "note") {
      ctx.strokeRect(doodle.x - 122, doodle.y - 30, 244, 64);
      ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
      ctx.fillRect(doodle.x - 122, doodle.y - 30, 244, 64);
      ctx.fillStyle = "rgba(29, 28, 38, 0.74)";
      ctx.fillText(doodle.text, doodle.x - 104, doodle.y + 10);
      ctx.fillStyle = "rgba(29, 28, 38, 0.08)";
    } else if (doodle.kind === "scribble-monster") {
      ctx.beginPath();
      for (let i = 0; i < 18; i += 1) {
        const angle = (Math.PI * 2 * i) / 18;
        const radius = doodle.size * (0.58 + (i % 2) * 0.18 + Math.sin(i * 1.4) * 0.06);
        const x = doodle.x + Math.cos(angle) * radius;
        const y = doodle.y + Math.sin(angle) * radius;
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(doodle.x - 16, doodle.y - 6, 8, 0, Math.PI * 2);
      ctx.arc(doodle.x + 14, doodle.y - 4, 9, 0, Math.PI * 2);
      ctx.stroke();
    } else if (doodle.kind === "arrow") {
      ctx.beginPath();
      ctx.moveTo(doodle.x - 64, doodle.y);
      ctx.lineTo(doodle.x + 34, doodle.y);
      ctx.lineTo(doodle.x + 10, doodle.y - 16);
      ctx.moveTo(doodle.x + 34, doodle.y);
      ctx.lineTo(doodle.x + 10, doodle.y + 16);
      ctx.stroke();
      ctx.fillStyle = "rgba(29, 28, 38, 0.7)";
      ctx.fillText(doodle.text, doodle.x - 84, doodle.y - 18);
      ctx.fillStyle = "rgba(29, 28, 38, 0.08)";
    }
  }
  ctx.restore();
}

function drawBoostPads(ctx, level) {
  for (const pad of level.boostPads) {
    const y = getTerrainHeight(pad.x, level.index);
    ctx.save();
    ctx.translate(pad.x, y - 10);
    ctx.strokeStyle = ORANGE;
    ctx.fillStyle = "rgba(239, 143, 31, 0.18)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-pad.width * 0.5, 16);
    ctx.lineTo(-22, 16);
    ctx.lineTo(0, -8);
    ctx.lineTo(24, 16);
    ctx.lineTo(pad.width * 0.5, 16);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-pad.width * 0.38, 8);
    ctx.lineTo(-8, 8);
    ctx.lineTo(10, -12);
    ctx.lineTo(pad.width * 0.32, -12);
    ctx.lineTo(pad.width * 0.32, 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function drawDraftZones(ctx, level) {
  for (const zone of level.draftZones) {
    const centerX = (zone.start + zone.end) * 0.5;
    const terrainY = getTerrainHeight(centerX, level.index);
    const top = terrainY - zone.floorOffset;
    ctx.save();
    ctx.strokeStyle = "rgba(43, 183, 168, 0.36)";
    ctx.fillStyle = "rgba(43, 183, 168, 0.08)";
    ctx.lineWidth = 3;
    ctx.fillRect(zone.start, top, zone.end - zone.start, zone.floorOffset - 34);
    ctx.strokeRect(zone.start, top, zone.end - zone.start, zone.floorOffset - 34);
    for (let x = zone.start + 48; x < zone.end - 18; x += 112) {
      const y = top + 42 + Math.sin(x * 0.01) * 8;
      ctx.beginPath();
      ctx.moveTo(x - 28, y + 18);
      ctx.lineTo(x + 20, y + 2);
      ctx.lineTo(x + 8, y - 12);
      ctx.moveTo(x + 20, y + 2);
      ctx.lineTo(x + 2, y + 14);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawTerrain(ctx, levelIndex) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, CANVAS_HEIGHT);
  for (let x = 0; x <= COURSE_LENGTH; x += 12) {
    ctx.lineTo(x, getTerrainHeight(x, levelIndex));
  }
  ctx.lineTo(COURSE_LENGTH, CANVAS_HEIGHT);
  ctx.closePath();
  const ground = ctx.createLinearGradient(0, 280, 0, CANVAS_HEIGHT);
  ground.addColorStop(0, "#fff2b8");
  ground.addColorStop(1, "#ef8f1f");
  ctx.fillStyle = ground;
  ctx.fill();

  ctx.strokeStyle = INK;
  ctx.lineWidth = 6;
  ctx.beginPath();
  for (let x = 0; x <= COURSE_LENGTH; x += 8) {
    const y = getTerrainHeight(x, levelIndex);
    if (x === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y + Math.sin(x * 0.06) * 1.5);
    }
  }
  ctx.stroke();
  ctx.restore();
}

function drawCheckpoints(ctx, level) {
  ctx.font = "bold 22px 'Trebuchet MS', sans-serif";
  ctx.textAlign = "center";
  for (let i = 0; i < level.checkpointXs.length; i += 1) {
    const x = level.checkpointXs[i];
    const y = getTerrainHeight(x, level.index);
    const label = level.checkpointLabels[i];
    ctx.strokeStyle = "rgba(29, 28, 38, 0.7)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x, y - 8);
    ctx.lineTo(x, y - 126);
    ctx.stroke();
    ctx.fillStyle = "#fffef7";
    ctx.fillRect(x - 64, y - 152, 128, 28);
    ctx.strokeRect(x - 64, y - 152, 128, 28);
    ctx.fillStyle = INK;
    ctx.fillText(label.toUpperCase(), x, y - 130);
  }
}

function drawCollectibles(ctx, collectibles) {
  for (const collectible of collectibles) {
    if (collectible.taken) {
      continue;
    }
    ctx.save();
    ctx.translate(collectible.x, collectible.y);
    ctx.rotate(Math.sin(collectible.x * 0.02) * 0.1);
    ctx.strokeStyle = TEAL;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, collectible.radius, 0.4, Math.PI * 1.8);
    ctx.stroke();
    ctx.fillStyle = "rgba(43, 183, 168, 0.12)";
    ctx.fill();
    ctx.restore();
  }
}

function drawTrickGates(ctx, trickGates) {
  for (const gate of trickGates) {
    if (gate.taken) {
      continue;
    }
    ctx.save();
    ctx.translate(gate.x, gate.y);
    ctx.rotate(Math.sin(gate.x * 0.01) * 0.16);
    ctx.strokeStyle = BLUE;
    ctx.fillStyle = "rgba(123, 194, 255, 0.12)";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.ellipse(0, 0, gate.radius, gate.radius * 0.76, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, 0, gate.radius - 14, (gate.radius - 14) * 0.76, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fill();
    ctx.strokeStyle = "rgba(29, 28, 38, 0.65)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-gate.radius - 14, 0);
    ctx.lineTo(gate.radius + 14, 0);
    ctx.stroke();
    ctx.restore();
  }
}

function drawFinish(ctx, levelIndex) {
  const x = COURSE_LENGTH - 120;
  const y = getTerrainHeight(x, levelIndex);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(x, y - 10);
  ctx.lineTo(x, y - 170);
  ctx.stroke();

  for (let i = 0; i < 7; i += 1) {
    const cellY = y - 168 + i * 22;
    ctx.fillStyle = i % 2 === 0 ? "#fffef7" : INK;
    ctx.fillRect(x, cellY, 92, 22);
    ctx.fillStyle = i % 2 === 0 ? INK : "#fffef7";
    ctx.fillRect(x + 92, cellY, 92, 22);
  }
}

function drawInkWaves(ctx, inkWaves) {
  for (const wave of inkWaves) {
    ctx.save();
    ctx.fillStyle = `rgba(29, 28, 38, ${wave.alpha})`;
    ctx.beginPath();
    ctx.ellipse(wave.x, wave.y, wave.width, wave.height, Math.sin(wave.x * 0.01) * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawParticles(ctx, particles) {
  for (const particle of particles) {
    ctx.save();
    ctx.globalAlpha = particle.life / particle.maxLife;
    ctx.strokeStyle = particle.color;
    ctx.lineWidth = particle.size;
    ctx.beginPath();
    ctx.moveTo(particle.x - particle.vx * 2, particle.y - particle.vy * 2);
    ctx.lineTo(particle.x, particle.y);
    ctx.stroke();
    ctx.restore();
  }
}

function drawPlayer(ctx, player) {
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(player.angle);
  ctx.lineCap = "round";
  ctx.strokeStyle = INK;
  ctx.lineWidth = 6;

  const lean = Math.max(-0.32, Math.min(0.32, player.vx * 0.018));
  const stride = player.onGround ? Math.sin(player.stepPhase) * 18 : 6;
  const armSwing = Math.sin(player.stepPhase + Math.PI * 0.5) * 16;

  ctx.beginPath();
  ctx.arc(0, -48, 14, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(0, -34);
  ctx.lineTo(0, -2);
  ctx.lineTo(-18 + lean * 20, 28);
  ctx.moveTo(0, -2);
  ctx.lineTo(18 + lean * 20, 28);
  ctx.moveTo(0, -20);
  ctx.lineTo(-24 - armSwing * 0.4, -4);
  ctx.moveTo(0, -18);
  ctx.lineTo(22 + armSwing * 0.4, 2);
  ctx.moveTo(0, -2);
  ctx.lineTo(-14, 34 + stride);
  ctx.moveTo(0, -2);
  ctx.lineTo(18, 32 - stride);
  ctx.stroke();

  ctx.fillStyle = ORANGE;
  ctx.fillRect(-12, -30, 24, 10);

  if (player.onGround && Math.abs(player.vx) > 8) {
    ctx.strokeStyle = BLUE;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-12, 18);
    ctx.lineTo(-42, 12);
    ctx.moveTo(14, 18);
    ctx.lineTo(-20, 34);
    ctx.stroke();
  }

  ctx.restore();
}
