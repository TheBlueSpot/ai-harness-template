export function createRenderer(canvas, ctx) {
  let width = 0;
  let height = 0;
  let dpr = 1;

  function resize(next) {
    width = Math.max(1, Math.floor(next.width));
    height = Math.max(1, Math.floor(next.height));
    dpr = Math.max(1, next.dpr || 1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function render(frameState = {}) {
    drawBackdrop(ctx, width, height, frameState);
    drawWorld(ctx, width, height, frameState);
    drawSkater(ctx, width, height, frameState);
    drawHud(ctx, width, height, frameState);
    drawComboCallouts(ctx, width, height, frameState);
    drawOverlayHints(ctx, width, height, frameState);
  }

  return { resize, render };
}

function getWorldLayout(width, height, frameState) {
  const world = frameState.world ?? {};
  const cameraWindow = Math.max(640, world.cameraWindow ?? width);
  const worldHeight = Math.max(420, world.worldHeight ?? height);
  const scale = Math.max(0.7, Math.min(width / cameraWindow, (height - 96) / worldHeight));
  const offsetX = Math.max(18, (width - cameraWindow * scale) * 0.5);
  const offsetY = Math.max(24, (height - worldHeight * scale) * 0.58);
  return { cameraWindow, worldHeight, scale, offsetX, offsetY, groundY: world.groundY ?? worldHeight * 0.78 };
}

function worldX(layout, value) {
  return layout.offsetX + value * layout.scale;
}

function worldY(layout, value) {
  return layout.offsetY + value * layout.scale;
}

function drawBackdrop(ctx, width, height, frameState) {
  const layout = getWorldLayout(width, height, frameState);
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#0c1324");
  sky.addColorStop(0.6, "#151f33");
  sky.addColorStop(1, "#1d1525");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "rgba(255,255,255,0.05)";
  ctx.fillRect(0, worldY(layout, layout.groundY - 12), width, height - worldY(layout, layout.groundY - 12));

  const trailY = worldY(layout, layout.groundY - 24);
  ctx.strokeStyle = "rgba(120, 214, 255, 0.24)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(worldX(layout, 16), trailY + 8);
  ctx.lineTo(worldX(layout, 390), trailY - 18);
  ctx.lineTo(worldX(layout, 720), trailY + 3);
  ctx.lineTo(worldX(layout, 910), trailY + 14);
  ctx.stroke();

  if (frameState.manuals) {
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    for (const manual of frameState.manuals) {
      ctx.fillRect(
        worldX(layout, manual.screenX),
        worldY(layout, manual.screenY),
        manual.w * layout.scale,
        manual.h * layout.scale
      );
    }
  }
}

function drawWorld(ctx, width, height, frameState) {
  const layout = getWorldLayout(width, height, frameState);
  const groundY = worldY(layout, layout.groundY);
  ctx.fillStyle = "#0d0f14";
  ctx.fillRect(0, groundY, width, height - groundY);

  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, groundY);
  ctx.lineTo(width, groundY);
  ctx.stroke();

  const rails = frameState.rails ?? [];
  ctx.fillStyle = "rgba(180, 204, 255, 0.6)";
  for (const rail of rails) {
    ctx.fillRect(
      worldX(layout, rail.screenX),
      worldY(layout, rail.screenY),
      rail.w * layout.scale,
      rail.h * layout.scale
    );
  }

  const ramps = frameState.ramps ?? [];
  ctx.fillStyle = "#ffcf6b";
  for (const ramp of ramps) {
    ctx.beginPath();
    ctx.moveTo(worldX(layout, ramp.screenX), worldY(layout, ramp.screenY + ramp.h));
    ctx.lineTo(worldX(layout, ramp.screenX + ramp.w), worldY(layout, ramp.screenY + ramp.h));
    ctx.lineTo(worldX(layout, ramp.screenX + ramp.w), worldY(layout, ramp.screenY));
    ctx.closePath();
    ctx.fill();
  }

  const pickups = frameState.pickups ?? [];
  for (const pickup of pickups) {
    if (pickup.taken) continue;
    ctx.fillStyle = "#7ce0ff";
    ctx.beginPath();
    ctx.arc(
      worldX(layout, pickup.screenX),
      worldY(layout, pickup.screenY),
      pickup.radius * layout.scale,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }

  const gates = frameState.finishGates ?? [];
  for (const gate of gates) {
    ctx.fillStyle = gate.active ? "rgba(124, 224, 255, 0.7)" : "rgba(255, 255, 255, 0.14)";
    ctx.fillRect(
      worldX(layout, gate.screenX),
      worldY(layout, gate.screenY),
      gate.w * layout.scale,
      gate.h * layout.scale
    );
  }
}

function drawSkater(ctx, width, height, frameState) {
  const layout = getWorldLayout(width, height, frameState);
  const x = worldX(layout, frameState.skater?.x ?? 220);
  const y = worldY(layout, frameState.skater?.y ?? layout.groundY);
  const boardW = (frameState.skater?.w ?? 64) * layout.scale;
  const boardH = Math.max(8, (frameState.skater?.h ?? 12) * 0.22 * layout.scale);

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((frameState.skater?.angle ?? 0) * Math.PI / 180);
  ctx.fillStyle = "#ffe08a";
  ctx.fillRect(-boardW * 0.5, -boardH * 0.5, boardW, boardH);
  ctx.fillStyle = "#f3f7ff";
  ctx.fillRect(-10 * layout.scale, -42 * layout.scale, 20 * layout.scale, 34 * layout.scale);
  ctx.restore();
}

function drawHud(ctx, width, height, frameState) {
  ctx.fillStyle = "#f8fbff";
  ctx.font = "700 18px system-ui, sans-serif";
  ctx.textBaseline = "top";
  ctx.fillText(`Score ${Math.round(frameState.score ?? 0)}`, 20, 18);
  ctx.fillText(`Combo x${Math.round(frameState.combo ?? 1)}`, 20, 42);
  ctx.fillText(`Time ${Math.ceil(frameState.timer ?? 0)}`, width - 150, 18);
  ctx.fillText(`Speed ${Math.round(frameState.speed ?? 0)}`, width - 150, 42);
  ctx.fillText(`Target ${Math.round(frameState.targetScore ?? 0)}`, width - 180, 66);
  ctx.fillText(`Lines ${frameState.goalsCompleted ?? 0}/${frameState.goalCount ?? 0}`, width - 180, 90);
}

function drawComboCallouts(ctx, width, height, frameState) {
  const comboText = frameState.comboCallout;
  if (!comboText) return;
  ctx.fillStyle = "rgba(10, 17, 30, 0.82)";
  ctx.fillRect(width * 0.32, height * 0.12, width * 0.36, 56);
  ctx.strokeStyle = "rgba(120, 214, 255, 0.7)";
  ctx.strokeRect(width * 0.32, height * 0.12, width * 0.36, 56);
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 22px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(comboText, width * 0.5, height * 0.12 + 16);
  ctx.textAlign = "start";
}

function drawOverlayHints(ctx, width, height, frameState) {
  if (frameState.state === "playing") return;
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fillRect(0, 0, width, height);
}
