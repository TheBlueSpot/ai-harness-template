(() => {
  const LEVEL = window.BraidTimeEchoData;
  const { VIEW_HEIGHT, VIEW_WIDTH } = LEVEL;

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function render(ctx, frame) {
    const cameraX = frame.cameraX;
    const gradient = ctx.createLinearGradient(0, 0, 0, VIEW_HEIGHT);
    gradient.addColorStop(0, "#101a34");
    gradient.addColorStop(0.6, "#213b58");
    gradient.addColorStop(1, "#382948");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

    drawBackground(ctx, cameraX);
    drawPlatforms(ctx, cameraX);
    drawSwitches(ctx, frame, cameraX);
    drawDoors(ctx, frame, cameraX);
    drawShards(ctx, frame, cameraX);
    drawSpikes(ctx, cameraX);
    drawExit(ctx, frame, cameraX);
    drawEchoes(ctx, frame, cameraX);
    drawPlayer(ctx, frame.player, cameraX);
    drawTimeline(ctx, frame);
  }

  function drawBackground(ctx, cameraX) {
    for (let i = 0; i < 7; i += 1) {
      const offset = ((cameraX * 0.16) + (i * 220)) % 1540;
      const x = -offset + 180;
      ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.04)" : "rgba(129,231,255,0.06)";
      ctx.fillRect(x, 90 + (i * 24), 140, 260);
    }

    ctx.strokeStyle = "rgba(188, 242, 255, 0.14)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 18; i += 1) {
      const x = ((i * 180) - (cameraX * 0.32)) % 1180;
      ctx.beginPath();
      ctx.arc(x, 160 + ((i % 4) * 56), 28 + ((i % 3) * 6), 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawPlatforms(ctx, cameraX) {
    for (const platform of LEVEL.platforms) {
      const x = platform.x - cameraX;
      ctx.fillStyle = "#372845";
      ctx.fillRect(x, platform.y, platform.w, platform.h);
      ctx.fillStyle = "#4a3959";
      ctx.fillRect(x, platform.y, platform.w, 8);
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.strokeRect(x + 0.5, platform.y + 0.5, platform.w - 1, platform.h - 1);
    }
  }

  function drawSwitches(ctx, frame, cameraX) {
    for (const plate of frame.switches) {
      const x = plate.x - cameraX;
      ctx.fillStyle = plate.active ? "#8ef7df" : "#234851";
      roundRect(ctx, x, plate.y, plate.w, plate.h, 6);
      ctx.fill();
      ctx.fillStyle = plate.active ? "#032422" : "#b9f5ee";
      ctx.font = "bold 12px monospace";
      ctx.textAlign = "center";
      ctx.fillText(plate.label, x + (plate.w / 2), plate.y - 6);
    }
  }

  function drawDoors(ctx, frame, cameraX) {
    for (const door of frame.doors) {
      const x = door.x - cameraX;
      ctx.fillStyle = door.open ? "rgba(133, 255, 222, 0.16)" : "rgba(46, 231, 255, 0.65)";
      ctx.fillRect(x, door.y, door.w, door.h);
      ctx.strokeStyle = door.open ? "rgba(182,255,238,0.5)" : "#b7f8ff";
      ctx.lineWidth = 3;
      ctx.strokeRect(x + 1.5, door.y + 1.5, door.w - 3, door.h - 3);
    }
  }

  function drawShards(ctx, frame, cameraX) {
    for (const shard of frame.shards) {
      if (shard.collected) {
        continue;
      }
      const x = shard.x - cameraX;
      ctx.save();
      ctx.translate(x, shard.y);
      ctx.rotate(frame.time * 0.002 + shard.x * 0.002);
      ctx.fillStyle = "#fff0b3";
      ctx.beginPath();
      ctx.moveTo(0, -14);
      ctx.lineTo(11, 0);
      ctx.lineTo(0, 14);
      ctx.lineTo(-11, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function drawSpikes(ctx, cameraX) {
    ctx.fillStyle = "#ff5d73";
    for (const spike of LEVEL.spikes) {
      const x = spike.x - cameraX;
      const step = 14;
      for (let cursor = 0; cursor < spike.w; cursor += step) {
        ctx.beginPath();
        ctx.moveTo(x + cursor, spike.y + spike.h);
        ctx.lineTo(x + cursor + (step / 2), spike.y);
        ctx.lineTo(x + cursor + step, spike.y + spike.h);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  function drawExit(ctx, frame, cameraX) {
    const x = LEVEL.exit.x - cameraX;
    ctx.fillStyle = frame.exitReady ? "#dfffa0" : "#56606c";
    ctx.fillRect(x, LEVEL.exit.y, LEVEL.exit.w, LEVEL.exit.h);
    ctx.fillStyle = frame.exitReady ? "#f3ffca" : "#778090";
    ctx.fillRect(x + 8, LEVEL.exit.y + 8, LEVEL.exit.w - 16, LEVEL.exit.h - 16);
  }

  function drawEchoes(ctx, frame, cameraX) {
    for (const echo of frame.echoes) {
      const x = echo.x - cameraX;
      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = echo.tint;
      roundRect(ctx, x, echo.y, echo.w, echo.h, 10);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawPlayer(ctx, player, cameraX) {
    const x = player.x - cameraX;
    ctx.fillStyle = player.rewinding ? "#ffd37a" : "#f4f7ff";
    roundRect(ctx, x, player.y, player.w, player.h, 10);
    ctx.fill();

    ctx.fillStyle = "#101a34";
    const eyeX = player.facing > 0 ? x + 28 : x + 12;
    ctx.fillRect(eyeX, player.y + 13, 6, 6);
  }

  function drawTimeline(ctx, frame) {
    const barX = 24;
    const barY = 496;
    const barW = 240;
    const barH = 12;
    ctx.fillStyle = "rgba(12, 18, 34, 0.65)";
    roundRect(ctx, barX, barY, barW, barH, 8);
    ctx.fill();
    ctx.fillStyle = "#57f0d0";
    roundRect(ctx, barX, barY, barW * frame.rewindRatio, barH, 8);
    ctx.fill();
    if (frame.rewinding) {
      ctx.strokeStyle = "#ffe08a";
      ctx.lineWidth = 2;
      ctx.strokeRect(barX + 0.5, barY + 0.5, barW - 1, barH - 1);
    }
  }

  window.BraidTimeEchoRender = { render };
})();
