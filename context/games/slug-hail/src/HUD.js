function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(/\s+/).filter(Boolean);
  let line = "";
  let lineY = y;

  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) {
      ctx.fillText(line, x, lineY);
      line = word;
      lineY += lineHeight;
    } else {
      line = next;
    }
  }

  if (line) {
    ctx.fillText(line, x, lineY);
  }

  return lineY;
}

function getMissionProgress(frame) {
  const { state, wave, targetWave, spawnRemaining, cleanupRemaining } = frame;
  const wavesCleared = state === "won"
    ? targetWave
    : wave >= targetWave && spawnRemaining === 0
      ? targetWave
      : Math.max(0, Math.min(targetWave, wave - 1));
  const cleanupReady = wave >= targetWave && spawnRemaining === 0;
  const cleanupDone = state === "won";

  if (state === "won") {
    return {
      wavesCleared,
      cleanupReady,
      cleanupDone,
      label: `Mission clear. ${targetWave}/${targetWave} waves and cleanup complete.`,
    };
  }

  if (cleanupReady) {
    return {
      wavesCleared,
      cleanupReady,
      cleanupDone,
      label: `${wavesCleared}/${targetWave} waves banked. ${cleanupRemaining} hostile${cleanupRemaining === 1 ? "" : "s"} left for cleanup.`,
    };
  }

  return {
    wavesCleared,
    cleanupReady,
    cleanupDone,
    label: `${wavesCleared}/${targetWave} waves banked. Clear this field to advance.`,
  };
}

function getObjectiveCopy(frame) {
  const { state, wave, targetWave, enemies, spawnRemaining, cleanupRemaining } = frame;
  const activeWave = wave > 0 ? Math.min(targetWave, wave) : 1;

  if (state === "won") {
    return {
      title: "Objective complete",
      detail: `All ${targetWave} waves held. Landing zone secure.`,
      footer: "Replay to test a cleaner hold or faster cleanup.",
    };
  }

  if (state === "dead") {
    return {
      title: "Objective failed",
      detail: `The holdout ends if the push breaks you before wave ${targetWave} is cleared.`,
      footer: "Restart, carve safer cover, and keep the lane from stacking.",
    };
  }

  if (state !== "playing") {
    return {
      title: "Mission",
      detail: `1. Start the drop. 2. Survive ${targetWave} waves. 3. After wave ${targetWave}, wipe the field clean.`,
      footer: "Click or press Space to deploy. Q rotates rifle, scatter, and piercer.",
    };
  }

  if (wave >= targetWave && spawnRemaining === 0) {
    return {
      title: "Final cleanup",
      detail: `No more drops. Remove the last ${cleanupRemaining} hostile${cleanupRemaining === 1 ? "" : "s"} to finish the run.`,
      footer: "The wave goal is done. This last sweep wins the mission.",
    };
  }

  if (wave >= targetWave) {
    return {
      title: `Final wave ${targetWave}/${targetWave}`,
      detail: `${spawnRemaining} drop${spawnRemaining === 1 ? "" : "s"} still incoming and ${enemies} hostile${enemies === 1 ? "" : "s"} already active.`,
      footer: "Hold until the last spawn lands, then clean up the field.",
    };
  }

  return {
    title: `Holdout wave ${activeWave}/${targetWave}`,
    detail: `${spawnRemaining} drop${spawnRemaining === 1 ? "" : "s"} left this wave and ${enemies} hostile${enemies === 1 ? "" : "s"} active now.`,
    footer: "Survive the current push. The next wave starts only after the field is clear.",
  };
}

function getPhaseBadge(frame) {
  const { state, wave, targetWave, spawnRemaining } = frame;

  if (state === "won") {
    return { label: "ZONE SECURE", fill: "rgba(127,240,180,0.18)", stroke: "rgba(127,240,180,0.55)", text: "#7ff0b4" };
  }
  if (state === "dead") {
    return { label: "HOLD LOST", fill: "rgba(255,125,115,0.18)", stroke: "rgba(255,125,115,0.52)", text: "#ffb0a8" };
  }
  if (state !== "playing") {
    return { label: "DEPLOY", fill: "rgba(248,200,74,0.16)", stroke: "rgba(248,200,74,0.48)", text: "#f8c84a" };
  }
  if (wave >= targetWave && spawnRemaining === 0) {
    return { label: "FINAL CLEANUP", fill: "rgba(142,230,255,0.16)", stroke: "rgba(142,230,255,0.52)", text: "#8ee6ff" };
  }
  return { label: "HOLD WAVE", fill: "rgba(248,200,74,0.16)", stroke: "rgba(248,200,74,0.48)", text: "#f8c84a" };
}

function getNowAndWinCopy(frame) {
  const { state, wave, targetWave, enemies, spawnRemaining, cleanupRemaining } = frame;

  if (state === "won") {
    return {
      now: "Mission clear. Replay for a cleaner holdout.",
      win: `Held all ${targetWave} waves and finished cleanup.`,
    };
  }

  if (state === "dead") {
    return {
      now: "Restart and keep the lane from stacking.",
      win: `Win by surviving ${targetWave} waves, then wiping the field clean.`,
    };
  }

  if (state !== "playing") {
    return {
      now: "Press Space or click to start the first drop.",
      win: `Win by surviving ${targetWave} waves, then wiping the field clean.`,
    };
  }

  if (wave >= targetWave && spawnRemaining === 0) {
    return {
      now: `Remove the last ${cleanupRemaining} hostile${cleanupRemaining === 1 ? "" : "s"}. No more drops are coming.`,
      win: "The run ends as soon as the field is clear.",
    };
  }

  if (enemies > 0) {
    return {
      now: `Clear ${enemies} active hostile${enemies === 1 ? "" : "s"} to stop this wave from stacking.`,
      win: `Wave ${Math.min(targetWave, wave)}/${targetWave}: survive the push, then clear the field for the next wave.`,
    };
  }

  return {
    now: `Hold ready for wave ${Math.min(targetWave, wave + 1)}/${targetWave}.`,
    win: `Finish all ${targetWave} waves, then clear the last cleanup sweep.`,
  };
}

export class HUD {
  render(ctx, frame) {
    const { width, height, player, wave, targetWave, score, message } = frame;
    const activeWave = wave > 0 ? Math.min(targetWave, wave) : 1;
    const objective = getObjectiveCopy(frame);
    const mission = getMissionProgress(frame);
    const phaseBadge = getPhaseBadge(frame);
    const objectiveStatus = getNowAndWinCopy(frame);
    const missionPanelX = 18;
    const missionPanelY = 122;
    const missionPanelWidth = Math.min(430, width - 36);
    const missionPanelHeight = 156;
    ctx.save();

    ctx.fillStyle = "rgba(7, 12, 20, 0.84)";
    roundRect(ctx, missionPanelX, missionPanelY, missionPanelWidth, missionPanelHeight, 20);
    ctx.fill();
    ctx.strokeStyle = "rgba(215,226,255,0.12)";
    ctx.stroke();

    ctx.fillStyle = "#f8c84a";
    ctx.font = '700 14px "Trebuchet MS", sans-serif';
    ctx.fillText("SLUG HAIL", missionPanelX + 18, missionPanelY + 22);
    ctx.fillStyle = "#edf4ff";
    ctx.font = '700 24px "Trebuchet MS", sans-serif';
    ctx.fillText(`Wave ${activeWave}/${targetWave}`, missionPanelX + 18, missionPanelY + 52);
    ctx.font = '700 18px "Trebuchet MS", sans-serif';
    ctx.fillText(`Score ${score.toString().padStart(5, "0")}`, missionPanelX + 18, missionPanelY + 78);
    roundRect(ctx, missionPanelX + 152, missionPanelY + 20, 118, 22, 11);
    ctx.fillStyle = phaseBadge.fill;
    ctx.fill();
    ctx.strokeStyle = phaseBadge.stroke;
    ctx.stroke();
    ctx.fillStyle = phaseBadge.text;
    ctx.font = '700 11px "Trebuchet MS", sans-serif';
    ctx.fillText(phaseBadge.label, missionPanelX + 165, missionPanelY + 35);
    ctx.fillStyle = "rgba(232,240,255,0.74)";
    ctx.font = '14px "Trebuchet MS", sans-serif';
    ctx.fillText(message, missionPanelX + 152, missionPanelY + 52);
    ctx.fillText(objective.title, missionPanelX + 152, missionPanelY + 76);
    ctx.fillStyle = "#f8c84a";
    const detailBottom = drawWrappedText(
      ctx,
      objective.detail,
      missionPanelX + 152,
      missionPanelY + 96,
      Math.min(250, width - 220),
      17,
    );
    ctx.fillStyle = "rgba(232,240,255,0.74)";
    drawWrappedText(ctx, mission.label, missionPanelX + 18, detailBottom + 16, Math.min(376, width - 72), 16);

    const barX = missionPanelX + 18;
    const barY = missionPanelY + missionPanelHeight - 10;
    const segmentGap = 6;
    const cleanupWidth = 58;
    const totalBarWidth = Math.min(376, width - 72);
    const waveSegmentWidth = Math.max(16, (totalBarWidth - cleanupWidth - targetWave * segmentGap) / targetWave);
    for (let i = 0; i < targetWave; i += 1) {
      const x = barX + i * (waveSegmentWidth + segmentGap);
      ctx.fillStyle = i < mission.wavesCleared ? "#7ff0b4" : "rgba(255,255,255,0.08)";
      roundRect(ctx, x, barY, waveSegmentWidth, 10, 5);
      ctx.fill();
    }
    const cleanupX = barX + targetWave * (waveSegmentWidth + segmentGap);
    ctx.fillStyle = mission.cleanupDone ? "#f8c84a" : mission.cleanupReady ? "#8ee6ff" : "rgba(255,255,255,0.08)";
    roundRect(ctx, cleanupX, barY, cleanupWidth, 10, 5);
    ctx.fill();

    ctx.fillStyle = "rgba(7, 12, 20, 0.84)";
    roundRect(ctx, width - 270, 16, 252, 122, 20);
    ctx.fill();
    ctx.strokeStyle = "rgba(215,226,255,0.12)";
    ctx.stroke();

    ctx.fillStyle = "#edf4ff";
    ctx.font = '700 18px "Trebuchet MS", sans-serif';
    ctx.fillText(player.weaponLabel, width - 250, 44);
    ctx.fillStyle = "rgba(232,240,255,0.74)";
    ctx.font = '14px "Trebuchet MS", sans-serif';
    ctx.fillText("HP", width - 250, 72);
    ctx.fillText("Heat", width - 250, 102);

    for (let i = 0; i < player.maxHp; i += 1) {
      ctx.fillStyle = i < player.hp ? (player.hp <= 3 ? "#ff7d73" : "#7ff0b4") : "rgba(255,255,255,0.08)";
      roundRect(ctx, width - 214 + i * 20, 58, 16, 12, 6);
      ctx.fill();
    }

    ctx.fillStyle = "rgba(255,255,255,0.08)";
    roundRect(ctx, width - 214, 88, 170, 14, 7);
    ctx.fill();
    ctx.fillStyle = player.heat > 0.7 ? "#ff7d73" : "#8ee6ff";
    roundRect(ctx, width - 214, 88, 170 * player.heat, 14, 7);
    ctx.fill();

    const bottomCardY = height - 74;
    const objectiveCardWidth = Math.min(470, width - 330);
    const controlsCompact = frame.controlsHintMode === "compact" && frame.state === "playing";
    const controlsCardWidth = controlsCompact ? Math.min(206, width - 36) : Math.min(286, width - 36);
    const controlsCardX = width - controlsCardWidth - 18;
    const objectiveCardX = 18;
    const objectiveCardHeight = 64;
    const controlsCardHeight = controlsCompact ? 46 : 56;

    ctx.fillStyle = "rgba(7, 12, 20, 0.84)";
    roundRect(ctx, objectiveCardX, bottomCardY, objectiveCardWidth, objectiveCardHeight, 18);
    ctx.fill();
    ctx.strokeStyle = "rgba(215,226,255,0.12)";
    ctx.stroke();
    ctx.fillStyle = "rgba(232,240,255,0.74)";
    ctx.font = '700 12px "Trebuchet MS", sans-serif';
    ctx.fillStyle = "#f8c84a";
    ctx.fillText("NOW", objectiveCardX + 16, bottomCardY + 18);
    ctx.fillStyle = "rgba(232,240,255,0.74)";
    ctx.font = '14px "Trebuchet MS", sans-serif';
    drawWrappedText(ctx, objectiveStatus.now, objectiveCardX + 56, bottomCardY + 18, objectiveCardWidth - 72, 15);
    ctx.font = '700 12px "Trebuchet MS", sans-serif';
    ctx.fillStyle = "#8ee6ff";
    ctx.fillText("WIN", objectiveCardX + 16, bottomCardY + 42);
    ctx.fillStyle = "rgba(232,240,255,0.74)";
    ctx.font = '14px "Trebuchet MS", sans-serif';
    drawWrappedText(ctx, objectiveStatus.win, objectiveCardX + 56, bottomCardY + 42, objectiveCardWidth - 72, 15);

    ctx.fillStyle = "rgba(7, 12, 20, 0.84)";
    roundRect(ctx, controlsCardX, bottomCardY, controlsCardWidth, controlsCardHeight, 18);
    ctx.fill();
    ctx.strokeStyle = "rgba(215,226,255,0.12)";
    ctx.stroke();
    ctx.fillStyle = "rgba(232,240,255,0.74)";
    if (controlsCompact) {
      ctx.fillText("WASD move  |  Mouse aim  |  Click or Space fire", controlsCardX + 16, bottomCardY + 20);
      ctx.fillText("Q switch  |  Shift slow-drift", controlsCardX + 16, bottomCardY + 38);
    } else {
      ctx.fillText("WASD move  |  Mouse aim  |  Click or Space fire", controlsCardX + 16, bottomCardY + 22);
      ctx.fillText("Q switch  |  Shift slow-drift", controlsCardX + 16, bottomCardY + 42);
    }

    ctx.restore();
  }
}
