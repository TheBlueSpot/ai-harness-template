export function renderFrame(ctx, frameState, layout) {
  const { width, height, towerBox } = layout;
  drawBackground(ctx, width, height);
  drawTower(ctx, towerBox);
  drawFloors(ctx, frameState, towerBox, layout);
  drawElevators(ctx, frameState, towerBox, layout);
  drawQueues(ctx, frameState, towerBox, layout);
  drawAlerts(ctx, frameState, layout);
  drawHud(ctx, frameState, layout);
  drawOverlay(ctx, frameState, layout);
}

function drawBackground(ctx, width, height) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#091116";
  ctx.fillRect(0, 0, width, height);
}

function drawTower(ctx, towerBox) {
  ctx.fillStyle = "#10202a";
  ctx.fillRect(towerBox.x, towerBox.y, towerBox.w, towerBox.h);
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 2;
  ctx.strokeRect(towerBox.x, towerBox.y, towerBox.w, towerBox.h);
}

function drawFloors(ctx, frameState, towerBox, layout) {
  const floorH = towerBox.h / frameState.floors.length;
  ctx.strokeStyle = "rgba(173, 214, 255, 0.12)";
  ctx.font = "12px Arial, sans-serif";
  for (let i = 0; i < frameState.floors.length; i += 1) {
    const y = towerBox.y + towerBox.h - i * floorH;
    ctx.beginPath();
    ctx.moveTo(towerBox.x, y);
    ctx.lineTo(towerBox.x + towerBox.w, y);
    ctx.stroke();
    const floor = frameState.floors[i];
    ctx.fillStyle = i === frameState.selectedFloor ? "rgba(127, 204, 255, 0.12)" : floor.unlocked ? "transparent" : "rgba(7, 12, 16, 0.38)";
    ctx.fillRect(towerBox.x, y - floorH, towerBox.w, floorH);
    ctx.fillStyle = floor.unlocked ? "rgba(232, 244, 255, 0.72)" : "rgba(232, 244, 255, 0.3)";
    ctx.fillText(floor.label, towerBox.x + 12, y - floorH * 0.35);
  }
}

function drawElevators(ctx, frameState, towerBox, layout) {
  const shaftW = towerBox.w * 0.22;
  const floorH = towerBox.h / frameState.floors.length;
  const shaftGap = (towerBox.w - shaftW * frameState.elevators.length) / (frameState.elevators.length + 1);
  frameState.elevators.forEach((elevator, index) => {
    const x = towerBox.x + shaftGap + index * (shaftW + shaftGap);
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.fillRect(x, towerBox.y + 8, shaftW, towerBox.h - 16);
    const y = towerBox.y + towerBox.h - (elevator.floor + 1) * floorH + 10;
    ctx.fillStyle = index === frameState.selectedElevator ? "#ffcf6e" : "#9bd5ff";
    ctx.fillRect(x + 8, y, shaftW - 16, floorH - 18);
    if (elevator.doorOpen) {
      ctx.strokeStyle = "#081015";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x + shaftW / 2, y + 8);
      ctx.lineTo(x + shaftW / 2, y + floorH - 26);
      ctx.stroke();
    }
    ctx.fillStyle = "#091116";
    ctx.fillRect(x + 14, y + 10, shaftW - 28, 4);
    ctx.fillRect(x + 14, y + 20, shaftW - 28, 4);
    ctx.fillStyle = "#e8f4ff";
    ctx.font = "12px Arial, sans-serif";
    ctx.fillText(`${Math.round(elevator.load)}/${elevator.capacity}`, x + 14, y + floorH - 28);
  });
}

function drawQueues(ctx, frameState, towerBox, layout) {
  const floorH = towerBox.h / frameState.floors.length;
  frameState.floors.forEach((floor) => {
    if (!floor.unlocked) {
      return;
    }
    const y = towerBox.y + towerBox.h - (floor.floor + 1) * floorH;
    const queueW = Math.min(120, floor.queue * 10);
    ctx.fillStyle = floor.floor === frameState.surgeFloor ? "rgba(255, 104, 104, 0.9)" : "rgba(133, 220, 153, 0.8)";
    ctx.fillRect(towerBox.x + towerBox.w + 18, y + 8, queueW, floorH - 16);
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fillText(`F${floor.floor} ${Math.round(floor.queue)}`, towerBox.x + towerBox.w + 20, y + floorH * 0.58);
  });
}

function drawAlerts(ctx, frameState, layout) {
  if (frameState.alertTimer <= 0) return;
  ctx.fillStyle = "rgba(255, 104, 104, 0.92)";
  ctx.fillRect(layout.width - 18, layout.topMargin, 8, 110);
}

function drawHud(ctx, frameState, layout) {
  ctx.fillStyle = "rgba(7, 12, 16, 0.78)";
  ctx.fillRect(layout.pad, layout.height - 104, layout.width - layout.pad * 2, 80);
  ctx.fillStyle = "#e8f4ff";
  ctx.font = "600 16px Arial, sans-serif";
  ctx.fillText(frameState.hud.message, layout.pad + 16, layout.height - 72);
  ctx.font = "14px Arial, sans-serif";
  ctx.fillText(
    `Score ${frameState.hud.score}  Riders ${frameState.hud.ridersServed}/${frameState.hud.clearTargetServed}  Shift ${frameState.hud.surgesCleared}/${frameState.hud.clearTargetSurges}  Pressure ${frameState.hud.pressure}%`,
    layout.pad + 16,
    layout.height - 46,
  );
  ctx.fillStyle = "#ffcf6e";
  ctx.fillText(frameState.visibleControls, layout.pad + 16, layout.height - 24);
  ctx.fillStyle = "#e8f4ff";
  ctx.fillText(
    `${frameState.hud.phaseLabel}  |  ${frameState.hud.surgeLabel} F${frameState.hud.surgeFloor}  |  Rotate in ${frameState.hud.surgeCountdown}s`,
    layout.width - 420,
    layout.height - 24,
  );
}

function drawOverlay(ctx, frameState, layout) {
  if (!frameState.overlay?.visible) return;
  const boxW = Math.min(460, layout.width - 64);
  const boxH = 164;
  const boxX = (layout.width - boxW) / 2;
  const boxY = Math.max(56, (layout.height - boxH) / 2);

  ctx.fillStyle = "rgba(3, 8, 11, 0.78)";
  ctx.fillRect(0, 0, layout.width, layout.height);
  ctx.fillStyle = "rgba(10, 18, 24, 0.96)";
  ctx.fillRect(boxX, boxY, boxW, boxH);
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 2;
  ctx.strokeRect(boxX, boxY, boxW, boxH);

  ctx.fillStyle = "#e8f4ff";
  ctx.font = "700 28px Arial, sans-serif";
  ctx.fillText(frameState.overlay.title, boxX + 24, boxY + 48);
  ctx.font = "15px Arial, sans-serif";
  wrapText(ctx, frameState.overlay.body, boxX + 24, boxY + 84, boxW - 48, 22);
  ctx.fillStyle = "#ffcf6e";
  ctx.font = "600 15px Arial, sans-serif";
  ctx.fillText(frameState.overlay.cta, boxX + 24, boxY + boxH - 24);
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  let cursorY = y;

  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && line) {
      ctx.fillText(line, x, cursorY);
      line = word;
      cursorY += lineHeight;
    } else {
      line = testLine;
    }
  }

  if (line) ctx.fillText(line, x, cursorY);
}
