const BAR_MAX = 4;

export function renderGame(ctx, frameState = {}) {
  if (!ctx) return;

  const width = ctx.canvas?.width ?? 1280;
  const height = ctx.canvas?.height ?? 720;
  const combatants = frameState.combatants ?? [];
  const log = frameState.log ?? "Ready";

  ctx.clearRect(0, 0, width, height);
  drawBackdrop(ctx, width, height);
  drawLane(ctx, width, height, frameState);
  drawCombatants(ctx, width, height, combatants);
  drawCommandPanel(ctx, width, height, frameState);
  drawEnemyIntentPanel(ctx, width, height, frameState);
  drawHudBanner(ctx, width, height, frameState, log);
}

function drawBackdrop(ctx, width, height) {
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, "#0d1422");
  grad.addColorStop(1, "#05070b");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "rgba(120, 200, 255, 0.08)";
  for (let i = 0; i < 10; i += 1) {
    ctx.fillRect(0, i * (height / 10), width, 1);
  }
}

function drawLane(ctx, width, height, frameState) {
  const laneY = height * 0.58;
  const laneW = Math.min(width * 0.76, 980);
  const laneX = (width - laneW) / 2;
  const prog = clamp01(frameState.battle?.progress ?? 0);
  const pulse = 0.5 + Math.sin((frameState.time ?? 0) * 5) * 0.5;

  ctx.save();
  ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
  ctx.fillRect(laneX, laneY, laneW, 150);
  ctx.strokeStyle = "rgba(120, 240, 255, 0.36)";
  ctx.lineWidth = 3;
  ctx.strokeRect(laneX, laneY, laneW, 150);

  ctx.fillStyle = `rgba(104, 232, 255, ${0.08 + pulse * 0.08})`;
  ctx.fillRect(laneX, laneY + 58, laneW, 8);

  for (let i = 0; i < BAR_MAX; i += 1) {
    const x = laneX + (laneW / BAR_MAX) * i;
    ctx.fillStyle = "rgba(255,255,255,0.07)";
    ctx.fillRect(x, laneY, 2, 150);
  }

  ctx.fillStyle = "rgba(255, 214, 106, 0.7)";
  ctx.fillRect(laneX, laneY + 118, laneW * prog, 6);
  ctx.restore();
}

function drawCombatants(ctx, width, height, combatants) {
  const baseY = height * 0.55;
  const left = width * 0.22;
  const span = width * 0.56;
  const sorted = [...combatants].sort((a, b) => (b.gauge ?? 0) - (a.gauge ?? 0));

  for (const actor of sorted) {
    const isEnemy = actor.side === "enemy";
    const gauge = clamp01(actor.gauge ?? 0);
    const x = left + span * gauge;
    const y = baseY + (isEnemy ? 68 : -40) + (actor.row ?? 0) * 20;
    const size = 28 + gauge * 18;
    const orbRadius = size * (isEnemy ? 0.36 : 0.72) * 0.5;
    const fill = isEnemy ? "#ff8b6d" : "#69f0ff";

    if (actor.cursor) {
      ctx.strokeStyle = isEnemy ? "#ffd36d" : "#f7f2ea";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(x, y, orbRadius + 10, 0, Math.PI * 2);
      ctx.stroke();
    } else if (actor.ready) {
      ctx.strokeStyle = "rgba(255, 211, 109, 0.85)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, orbRadius + 7, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.globalAlpha = actor.alive ? 1 : 0.26;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(x, y, orbRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillRect(x - size * 0.18, y - size * 0.18, size * 0.36, size * 0.36);
    drawActorCard(ctx, actor, x, y, isEnemy);
    ctx.globalAlpha = 1;
  }
}

function drawActorCard(ctx, actor, x, y, isEnemy) {
  const gauge = clamp01(actor.gauge ?? 0);
  const hpRatio = actor.maxHp > 0 ? clamp01(actor.hp / actor.maxHp) : 0;
  const cardWidth = 132;
  const cardHeight = 58;
  const cardX = x - cardWidth / 2;
  const cardY = isEnemy ? y + 24 : y - 74;

  ctx.save();
  ctx.fillStyle = "rgba(4, 8, 13, 0.84)";
  ctx.fillRect(cardX, cardY, cardWidth, cardHeight);
  ctx.strokeStyle = actor.cursor
    ? "rgba(255, 211, 109, 0.92)"
    : actor.ready
      ? "rgba(255, 211, 109, 0.5)"
      : "rgba(255, 255, 255, 0.14)";
  ctx.lineWidth = actor.cursor ? 2.5 : 1.5;
  ctx.strokeRect(cardX, cardY, cardWidth, cardHeight);

  ctx.fillStyle = "#f7f2ea";
  ctx.font = "700 13px Trebuchet MS, sans-serif";
  ctx.fillText(actor.name ?? "Unit", cardX + 8, cardY + 15);
  if (isEnemy && actor.role) {
    const badgeWidth = Math.min(52, Math.max(38, ctx.measureText(actor.role).width + 12));
    ctx.fillStyle = "rgba(255, 139, 109, 0.18)";
    ctx.fillRect(cardX + cardWidth - badgeWidth - 8, cardY + 6, badgeWidth, 14);
    ctx.strokeStyle = "rgba(255, 139, 109, 0.44)";
    ctx.lineWidth = 1;
    ctx.strokeRect(cardX + cardWidth - badgeWidth - 8, cardY + 6, badgeWidth, 14);
    ctx.fillStyle = "#ffbfad";
    ctx.font = "700 9px Trebuchet MS, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(actor.role.toUpperCase(), cardX + cardWidth - badgeWidth * 0.5 - 8, cardY + 16);
    ctx.textAlign = "left";
  }
  ctx.font = "600 12px Trebuchet MS, sans-serif";
  ctx.fillStyle = "rgba(247, 242, 234, 0.84)";
  ctx.fillText(`HP ${Math.max(0, actor.hp ?? 0)} / ${Math.max(0, actor.maxHp ?? 0)}`, cardX + 8, cardY + 30);
  if (isEnemy && actor.roleHint) {
    ctx.font = "600 10px Trebuchet MS, sans-serif";
    ctx.fillStyle = "rgba(255, 191, 173, 0.82)";
    ctx.fillText(actor.roleHint, cardX + 8, cardY + 42);
  }

  const meterX = cardX + 8;
  const meterY = cardY + 48;
  const meterW = cardWidth - 16;
  ctx.fillStyle = "rgba(255,255,255,0.1)";
  ctx.fillRect(meterX, meterY, meterW, 6);
  ctx.fillStyle = isEnemy ? "#ff8b6d" : "#69f0ff";
  ctx.fillRect(meterX, meterY, meterW * hpRatio, 6);

  ctx.fillStyle = "rgba(255, 211, 109, 0.92)";
  ctx.fillRect(meterX, meterY - 7, meterW * gauge, 3);
  ctx.restore();
}

function drawHudBanner(ctx, width, height, frameState, log) {
  const state = String(frameState.state ?? "menu");
  const prompt = frameState.prompt ?? frameState.command ?? log;
  const banner = `${state.toUpperCase()}  |  ${prompt}`;
  ctx.save();
  ctx.fillStyle = "rgba(4, 7, 12, 0.58)";
  ctx.fillRect(24, 24, width - 48, 44);
  ctx.fillStyle = "#f7f2ea";
  ctx.font = "600 18px Trebuchet MS, sans-serif";
  ctx.fillText(banner, 40, 52);
  ctx.restore();
}

function drawCommandPanel(ctx, width, height, frameState) {
  const commands = frameState.menus?.commands ?? [];
  const targets = frameState.menus?.targets ?? [];
  const activeCommand = commands.find((entry) => entry.active) ?? commands[0] ?? null;
  const x = width * 0.08;
  const y = height * 0.66;
  const panelW = Math.min(360, width * 0.3);
  const rowH = 36;
  const panelH = 260;

  ctx.save();
  ctx.fillStyle = "rgba(4, 8, 13, 0.84)";
  ctx.fillRect(x, y, panelW, panelH);
  ctx.strokeStyle = "rgba(105, 240, 255, 0.26)";
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, panelW, panelH);

  ctx.fillStyle = "#69f0ff";
  ctx.font = "700 15px Trebuchet MS, sans-serif";
  ctx.fillText("COMMANDS", x + 18, y + 26);

  commands.forEach((entry, index) => {
    const rowY = y + 42 + index * rowH;
    if (entry.active) {
      ctx.fillStyle = "rgba(105, 240, 255, 0.16)";
      ctx.fillRect(x + 12, rowY - 18, panelW - 24, 28);
    }
    ctx.fillStyle = entry.active ? "#f7f2ea" : "rgba(247, 242, 234, 0.7)";
    ctx.font = entry.active ? "700 18px Trebuchet MS, sans-serif" : "600 17px Trebuchet MS, sans-serif";
    ctx.fillText(`${entry.active ? ">" : " "} ${entry.name}`, x + 22, rowY);
    ctx.font = "600 11px Trebuchet MS, sans-serif";
    ctx.fillStyle = entry.active ? "rgba(247, 242, 234, 0.86)" : "rgba(247, 242, 234, 0.45)";
    ctx.fillText(entry.detail ?? "", x + 140, rowY);
  });

  ctx.fillStyle = "#ffd36d";
  ctx.font = "700 15px Trebuchet MS, sans-serif";
  ctx.fillText("TARGET", x + 18, y + 172);
  ctx.fillStyle = "#f7f2ea";
  ctx.font = "600 16px Trebuchet MS, sans-serif";
  ctx.fillText(targets.find((entry) => entry.active)?.name ?? "Wait for enemy", x + 96, y + 172);

  ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
  ctx.fillRect(x + 14, y + 188, panelW - 28, 56);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.strokeRect(x + 14, y + 188, panelW - 28, 56);
  ctx.fillStyle = "#69f0ff";
  ctx.font = "700 13px Trebuchet MS, sans-serif";
  ctx.fillText(activeCommand?.name?.toUpperCase?.() ?? "COMMAND", x + 24, y + 208);
  ctx.fillStyle = "rgba(247, 242, 234, 0.86)";
  ctx.font = "600 12px Trebuchet MS, sans-serif";
  wrapText(ctx, activeCommand?.hint ?? "Wait for a party member to fill the ATB gauge.", x + 24, y + 226, panelW - 48, 14);
  ctx.restore();
}

function drawEnemyIntentPanel(ctx, width, height, frameState) {
  const intents = frameState.enemyIntents ?? [];
  if (!intents.length) return;

  const panelW = Math.min(300, width * 0.24);
  const rowH = 42;
  const panelH = 52 + intents.length * rowH;
  const x = width - panelW - width * 0.08;
  const y = height * 0.66;

  ctx.save();
  ctx.fillStyle = "rgba(4, 8, 13, 0.84)";
  ctx.fillRect(x, y, panelW, panelH);
  ctx.strokeStyle = "rgba(255, 139, 109, 0.26)";
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, panelW, panelH);

  ctx.fillStyle = "#ff8b6d";
  ctx.font = "700 15px Trebuchet MS, sans-serif";
  ctx.fillText("ENEMY NEXT", x + 18, y + 26);

  intents.forEach((intent, index) => {
    const rowY = y + 50 + index * rowH;
    ctx.fillStyle = intent.ready ? "rgba(255, 211, 109, 0.14)" : "rgba(255, 255, 255, 0.04)";
    ctx.fillRect(x + 12, rowY - 18, panelW - 24, 34);
    ctx.fillStyle = intent.ready ? "#ffd36d" : "#f7f2ea";
    ctx.font = intent.ready ? "700 13px Trebuchet MS, sans-serif" : "600 13px Trebuchet MS, sans-serif";
    ctx.fillText(`${intent.name} -> ${intent.targetName}`, x + 20, rowY - 4);
    ctx.textAlign = "right";
    ctx.fillText(intent.ready ? `${intent.damage} now` : `${Math.round(clamp01(intent.gauge) * 100)}%`, x + panelW - 20, rowY - 4);
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(255, 191, 173, 0.78)";
    ctx.font = "600 10px Trebuchet MS, sans-serif";
    ctx.fillText(
      `${intent.role?.toUpperCase?.() ?? "ROLE"} - ${intent.roleHint ?? "front pressure"}`,
      x + 20,
      rowY + 10,
    );
  });

  ctx.restore();
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  let line = "";
  let cursorY = y;
  for (const word of words) {
    const probe = line ? `${line} ${word}` : word;
    if (ctx.measureText(probe).width <= maxWidth || !line) {
      line = probe;
      continue;
    }
    ctx.fillText(line, x, cursorY);
    line = word;
    cursorY += lineHeight;
  }
  if (line) ctx.fillText(line, x, cursorY);
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}
