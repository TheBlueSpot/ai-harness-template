const TAU = Math.PI * 2;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function worldToScreen(camera, width, height, x, y) {
  return {
    x: (x - camera.x) * camera.zoom + width * 0.5,
    y: (y - camera.y) * camera.zoom + height * 0.5,
  };
}

export class Renderer {
  constructor(ctx, assets = {}) {
    this.ctx = ctx;
    this.assets = assets;
    this.width = ctx.canvas.width;
    this.height = ctx.canvas.height;
    this.patterns = new Map();
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
  }

  render(viewModel = {}) {
    const ctx = this.ctx;
    const width = this.width || ctx.canvas.width;
    const height = this.height || ctx.canvas.height;
    const level = viewModel.level ?? null;
    const camera = viewModel.camera ?? { x: 0, y: 0, zoom: 1 };

    ctx.save();
    ctx.clearRect(0, 0, width, height);
    this.drawBackdrop(width, height, camera);
    this.drawLevel(level, camera, width, height);
    this.drawGoal(level, camera, width, height);
    this.drawGhosts(viewModel.ghostPoses ?? [], camera, width, height);
    this.drawPlayer(viewModel.playerPose, camera, width, height);
    this.drawHud(viewModel, width, height);
    ctx.restore();
  }

  getPattern(key, image) {
    if (!image) return null;
    if (!this.patterns.has(key)) {
      this.patterns.set(key, this.ctx.createPattern(image, "repeat"));
    }
    return this.patterns.get(key);
  }

  drawBackdrop(width, height, camera) {
    const ctx = this.ctx;
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, "#1c1110");
    sky.addColorStop(0.48, "#120b0a");
    sky.addColorStop(1, "#050304");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = "rgba(255, 140, 98, 0.08)";
    ctx.fillRect(0, height * 0.56, width, height * 0.44);

    const mist = this.assets.backgroundMist;
    if (mist) {
      const drift = (camera.x * 0.1) % (width * 0.35 || 1);
      ctx.save();
      ctx.globalAlpha = 0.32;
      ctx.filter = "brightness(1.8) contrast(0.9)";
      for (let pass = -1; pass <= 1; pass += 1) {
        const drawWidth = width * 0.72;
        const drawHeight = drawWidth * (mist.height / mist.width);
        ctx.drawImage(mist, pass * drawWidth - drift, height * 0.14, drawWidth, drawHeight);
      }
      ctx.restore();
    }

    const glow = ctx.createRadialGradient(width * 0.55, height * 0.22, 30, width * 0.55, height * 0.3, height * 0.65);
    glow.addColorStop(0, "rgba(255, 189, 133, 0.15)");
    glow.addColorStop(1, "rgba(255, 189, 133, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
  }

  drawLevel(level, camera, width, height) {
    if (!level) return;
    const ctx = this.ctx;
    const tileSize = level.tileSize ?? 48;
    const terrainPattern = this.getPattern("terrain", this.assets.terrainCavern);

    const topLeft = worldToScreen(camera, width, height, 0, 0);
    const boundsWidth = (level.render?.width ?? 0) * camera.zoom;
    const boundsHeight = (level.render?.height ?? 0) * camera.zoom;
    ctx.save();
    ctx.fillStyle = "rgba(14, 10, 10, 0.72)";
    ctx.fillRect(topLeft.x, topLeft.y, boundsWidth, boundsHeight);
    ctx.restore();

    for (const cell of level.solids ?? []) {
      const screen = worldToScreen(
        camera,
        width,
        height,
        cell.x * tileSize + tileSize * 0.5,
        cell.y * tileSize + tileSize * 0.5
      );
      const drawSize = tileSize * camera.zoom;
      const drawX = screen.x - drawSize * 0.5;
      const drawY = screen.y - drawSize * 0.5;

      ctx.save();
      ctx.beginPath();
      ctx.rect(drawX, drawY, drawSize, drawSize);
      ctx.clip();
      if (terrainPattern) {
        ctx.translate(drawX, drawY);
        ctx.scale(camera.zoom, camera.zoom);
        ctx.fillStyle = terrainPattern;
        ctx.fillRect(0, 0, tileSize / camera.zoom + tileSize, tileSize / camera.zoom + tileSize);
      } else {
        ctx.fillStyle = "#402824";
        ctx.fillRect(drawX, drawY, drawSize, drawSize);
      }
      ctx.restore();

      ctx.strokeStyle = "rgba(255, 210, 176, 0.12)";
      ctx.strokeRect(drawX + 0.5, drawY + 0.5, drawSize - 1, drawSize - 1);
    }

    const spikes = this.assets.spikesStrip;
    for (const cell of level.hazards ?? []) {
      const screen = worldToScreen(
        camera,
        width,
        height,
        cell.x * tileSize + tileSize * 0.5,
        cell.y * tileSize + tileSize * 0.5
      );
      const drawSize = tileSize * camera.zoom;
      const drawX = screen.x - drawSize * 0.5;
      const drawY = screen.y - drawSize * 0.5;

      ctx.fillStyle = "rgba(255, 56, 56, 0.18)";
      ctx.fillRect(drawX, drawY, drawSize, drawSize);
      if (spikes) {
        ctx.drawImage(spikes, drawX, drawY, drawSize, drawSize);
      } else {
        ctx.fillStyle = "#ff4444";
        ctx.beginPath();
        ctx.moveTo(drawX, drawY + drawSize);
        ctx.lineTo(drawX + drawSize * 0.5, drawY);
        ctx.lineTo(drawX + drawSize, drawY + drawSize);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  drawGoal(level, camera, width, height) {
    if (!level?.goal) return;
    const ctx = this.ctx;
    const gate = this.assets.goalGate;
    const screen = worldToScreen(camera, width, height, level.goal.x, level.goal.y);
    const radius = (level.goal.radius ?? 24) * camera.zoom;

    ctx.save();
    ctx.translate(screen.x, screen.y);
    const halo = ctx.createRadialGradient(0, 0, radius * 0.2, 0, 0, radius * 2.6);
    halo.addColorStop(0, "rgba(255, 216, 133, 0.32)");
    halo.addColorStop(1, "rgba(255, 216, 133, 0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 2.6, 0, TAU);
    ctx.fill();
    if (gate) {
      const gateHeight = radius * 3.2;
      const gateWidth = gateHeight * (gate.width / gate.height);
      ctx.filter = "brightness(1.5) sepia(0.6) saturate(0.8)";
      ctx.drawImage(gate, -gateWidth * 0.5, -gateHeight * 0.75, gateWidth, gateHeight);
      ctx.filter = "none";
    } else {
      ctx.strokeStyle = "#ffd277";
      ctx.lineWidth = 4;
      ctx.strokeRect(-radius, -radius * 1.3, radius * 2, radius * 2.6);
    }
    ctx.restore();
  }

  drawGhosts(ghostPoses, camera, width, height) {
    const ctx = this.ctx;
    for (const ghost of ghostPoses) {
      const { x, y } = worldToScreen(camera, width, height, ghost.x, ghost.y);
      const opacity = clamp(ghost.opacity ?? 0.5, 0.18, 0.9);
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(ghost.flip ? -1 : 1, 1);
      ctx.globalAlpha = opacity;
      ctx.fillStyle = ghost.alive ? "rgba(130, 226, 255, 0.25)" : "rgba(255, 108, 108, 0.3)";
      ctx.beginPath();
      ctx.roundRect(-14, -19, 28, 38, 10);
      ctx.fill();
      ctx.strokeStyle = ghost.alive ? "rgba(196, 245, 255, 0.75)" : "rgba(255, 172, 172, 0.72)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#ebffff";
      ctx.fillRect(-7, -7, 4, 4);
      ctx.fillRect(3, -7, 4, 4);
      ctx.restore();
    }
  }

  drawPlayer(playerPose, camera, width, height) {
    if (!playerPose?.alive) return;
    const ctx = this.ctx;
    const { x, y } = worldToScreen(camera, width, height, playerPose.x, playerPose.y);
    const wallLean = playerPose.wallSide ? playerPose.wallSide * 0.12 : 0;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(wallLean);
    ctx.fillStyle = "#ff6c4e";
    ctx.beginPath();
    ctx.roundRect(-14, -19, 28, 38, 10);
    ctx.fill();
    ctx.fillStyle = "#ffe9d7";
    ctx.fillRect(-7, -8, 4, 4);
    ctx.fillRect(3, -8, 4, 4);
    ctx.fillStyle = "#7c1f17";
    ctx.fillRect(-6, 5, 12, 3);
    if (playerPose.grounded) {
      ctx.fillStyle = "rgba(255, 228, 201, 0.28)";
      ctx.beginPath();
      ctx.ellipse(0, 24, 18, 6, 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  drawHud(viewModel, width, height) {
    const ctx = this.ctx;
    const deaths = viewModel.counters?.totalDeaths ?? 0;
    const levelName = viewModel.currentLevel?.name ?? "Unknown";
    const levelIndex = viewModel.counters?.levelIndex ?? 1;
    const levelCount = viewModel.counters?.levelCount ?? 1;

    ctx.save();
    ctx.fillStyle = "rgba(9, 6, 6, 0.6)";
    ctx.fillRect(18, 18, 340, 94);
    ctx.fillStyle = "#f8e7d8";
    ctx.font = "700 18px Trebuchet MS, sans-serif";
    ctx.fillText(`${levelIndex}/${levelCount}  ${levelName}`, 34, 48);
    ctx.font = "700 14px Trebuchet MS, sans-serif";
    ctx.fillStyle = "rgba(248, 231, 216, 0.8)";
    ctx.fillText(`Total Deaths: ${deaths}`, 34, 74);
    ctx.fillText("Move: A/D or arrows   Jump: Space/W/Up   Retry: R/Enter", 34, 96);
    ctx.restore();
  }
}
