// crazy-climber-rush/src/data.js
var WIDTH = 960;
var HEIGHT = 640;
var SUMMIT_Y = 7200;
var START_TIME = 132;
var MAX_LIVES = 3;
var MAX_STAMINA = 100;
var LEDGE_SPACING = 600;
var LANE_X = [280, 400, 560, 680];
var FACADE_LEFT = 180;
var FACADE_RIGHT = 780;
var ROW_HEIGHT = 120;
var STAGE_BREAKS = [0, 1800, 3600, 5400, SUMMIT_Y];
var STAGE_NAMES = ["Lobby Face", "Billboard Run", "Service Shafts", "Helipad Push"];
function createLedges() {
  const ledges = [0];
  for (let y = LEDGE_SPACING;y <= SUMMIT_Y; y += LEDGE_SPACING) {
    ledges.push(y);
  }
  return ledges;
}
function getBlockedLanes(rowIndex) {
  if (rowIndex < 5 || rowIndex % 6 === 0) {
    return [];
  }
  const blocked = [Math.abs((rowIndex * 3 + 1) % LANE_X.length)];
  if (rowIndex >= 18 && rowIndex % 5 === 0) {
    blocked.push((rowIndex + 1) % LANE_X.length);
  }
  if (rowIndex >= 32 && rowIndex % 6 === 0) {
    blocked.push((rowIndex + 2) % LANE_X.length);
  }
  return [...new Set(blocked)];
}
function getPotLane(seed) {
  return Math.abs((seed * 5 + 3) % LANE_X.length);
}
function getStageIndex(y) {
  if (y >= STAGE_BREAKS[3])
    return 3;
  if (y >= STAGE_BREAKS[2])
    return 2;
  if (y >= STAGE_BREAKS[1])
    return 1;
  return 0;
}
function getStageName(y) {
  return STAGE_NAMES[getStageIndex(y)];
}

// crazy-climber-rush/src/Game.js
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
function nearestLedgeBelow(y, ledges) {
  let best = 0;
  for (const ledge of ledges) {
    if (ledge <= y) {
      best = ledge;
    } else {
      break;
    }
  }
  return best;
}
function queueTelegraphs(state, lanes, y, timer) {
  for (const lane of lanes) {
    state.telegraphs.push({ lane, y, timer });
  }
}

class Game {
  constructor() {
    this.ledges = createLedges();
    this.resetMenu();
  }
  resetMenu() {
    this.mode = "menu";
    this.elapsed = 0;
    this.cameraY = 0;
    this.message = "Use arrows or A/D to shift lanes. Alternate Q / E to climb.";
    this.result = null;
    this.state = this.createRunState();
  }
  createRunState() {
    return {
      lane: 1,
      x: LANE_X[1],
      y: 0,
      vy: 0,
      stamina: MAX_STAMINA,
      timeLeft: START_TIME,
      lives: MAX_LIVES,
      checkpointY: 0,
      checkpointIndex: 0,
      score: 0,
      combo: 0,
      lastHand: "right",
      lastStrokeAt: -99,
      laneCooldown: 0,
      hitTimer: 0,
      onLedge: true,
      telegraphs: [],
      pots: [],
      spawnCursor: 560,
      rescued: false,
      hintTimer: 8,
      stageIndex: 0
    };
  }
  start() {
    this.mode = "playing";
    this.elapsed = 0;
    this.result = null;
    this.message = "Shift with arrows or A/D. Alternate Q / E, then rest on the next ledge.";
    this.state = this.createRunState();
  }
  restartRun() {
    this.resetMenu();
  }
  moveLane(direction) {
    if (this.mode !== "playing" || this.state.laneCooldown > 0 || this.state.hitTimer > 0) {
      return;
    }
    const nextLane = clamp(this.state.lane + direction, 0, LANE_X.length - 1);
    if (nextLane === this.state.lane) {
      return;
    }
    const rowIndex = Math.floor((this.state.y + 40) / ROW_HEIGHT);
    if (getBlockedLanes(rowIndex).includes(nextLane)) {
      this.message = "That window is shuttered. Shift to a free lane.";
      return;
    }
    this.state.lane = nextLane;
    this.state.laneCooldown = 0.12;
  }
  stroke(hand) {
    if (this.mode !== "playing" || this.state.hitTimer > 0) {
      return;
    }
    const blocked = getBlockedLanes(Math.floor((this.state.y + 36) / ROW_HEIGHT)).includes(this.state.lane);
    const sinceLast = this.elapsed - this.state.lastStrokeAt;
    const alternated = hand !== this.state.lastHand;
    let impulse = alternated ? 205 : 130;
    if (alternated && sinceLast < 0.55) {
      impulse += 52;
      this.state.combo = clamp(this.state.combo + 1, 0, 6);
    } else if (!alternated) {
      this.state.combo = 0;
      this.message = "Alternate Q and E. Repeating one hand wastes energy.";
    } else {
      this.state.combo = Math.max(0, this.state.combo - 1);
    }
    if (blocked) {
      impulse *= 0.55;
      this.message = "Shutter in the way. Move sideways, then pull.";
    }
    if (this.state.onLedge && alternated) {
      impulse += 22;
    }
    this.state.vy = Math.min(410, this.state.vy + impulse);
    this.state.stamina = clamp(this.state.stamina - (alternated ? 3.4 : 5.8), 0, MAX_STAMINA);
    this.state.lastHand = hand;
    this.state.lastStrokeAt = this.elapsed;
    this.state.onLedge = false;
  }
  loseLife(reason) {
    this.state.lives -= 1;
    if (this.state.lives <= 0) {
      this.finish("lose", "You lost your grip.", reason);
      return;
    }
    const checkpointY = this.state.checkpointY;
    this.state.y = checkpointY;
    this.state.vy = 0;
    this.state.stamina = MAX_STAMINA * 0.78;
    this.state.hitTimer = 1.2;
    this.state.onLedge = true;
    this.state.lane = 1;
    this.state.x = LANE_X[this.state.lane];
    this.state.telegraphs = this.state.telegraphs.filter((entry) => entry.y > checkpointY - 60);
    this.state.pots = this.state.pots.filter((entry) => entry.y > checkpointY - 60);
    this.message = reason;
  }
  finish(mode, title, copy) {
    this.mode = "result";
    this.result = {
      type: "result",
      eyebrow: mode === "win" ? "tower clear" : "climb failed",
      title,
      copy,
      score: this.state.score
    };
  }
  update(dt) {
    if (this.mode !== "playing") {
      return;
    }
    this.elapsed += dt;
    const state = this.state;
    state.timeLeft = Math.max(0, state.timeLeft - dt);
    state.laneCooldown = Math.max(0, state.laneCooldown - dt);
    state.hitTimer = Math.max(0, state.hitTimer - dt);
    state.hintTimer = Math.max(0, state.hintTimer - dt);
    while (state.spawnCursor < state.y + HEIGHT * 2 && state.spawnCursor < SUMMIT_Y + 260) {
      const seed = Math.floor(state.spawnCursor / 70);
      const hazardStage = getStageIndex(state.spawnCursor);
      const baseTimer = [1.2, 1.04, 0.9, 0.76][hazardStage];
      const baseSpacing = [320, 280, 240, 210][hazardStage];
      if (hazardStage === 0 && seed % 4 === 0) {
        state.spawnCursor += baseSpacing;
        continue;
      }
      const leadLane = getPotLane(seed);
      const lanes = [leadLane];
      if (hazardStage >= 2 && seed % 5 === 0) {
        lanes.push((leadLane + 1 + seed % 2) % LANE_X.length);
      }
      if (hazardStage >= 3 && seed % 4 === 0) {
        lanes.push((leadLane + 2) % LANE_X.length);
      }
      queueTelegraphs(state, [...new Set(lanes)], state.spawnCursor, baseTimer + seed % 3 * 0.1);
      state.spawnCursor += baseSpacing + seed % 4 * 28;
    }
    for (const telegraph of state.telegraphs) {
      telegraph.timer -= dt;
      if (telegraph.timer <= 0) {
        const hazardStage = getStageIndex(telegraph.y);
        state.pots.push({
          lane: telegraph.lane,
          y: telegraph.y,
          speed: 230 + hazardStage * 28 + telegraph.y / 180 % 4 * 24,
          spin: (telegraph.lane % 2 === 0 ? 1 : -1) * 4
        });
      }
    }
    state.telegraphs = state.telegraphs.filter((entry) => entry.timer > 0);
    for (const pot of state.pots) {
      pot.y -= pot.speed * dt;
    }
    state.pots = state.pots.filter((entry) => entry.y > this.cameraY - 100);
    state.vy -= 190 * dt;
    if (!state.onLedge) {
      state.stamina = clamp(state.stamina - (4.2 + state.combo * 0.1) * dt, 0, MAX_STAMINA);
    }
    state.y = Math.max(0, state.y + state.vy * dt);
    state.x += (LANE_X[state.lane] - state.x) * Math.min(1, dt * 18);
    const upcomingCheckpoint = this.ledges[state.checkpointIndex + 1];
    if (upcomingCheckpoint !== undefined && state.y >= upcomingCheckpoint) {
      state.checkpointIndex += 1;
      state.checkpointY = upcomingCheckpoint;
      state.stamina = Math.max(state.stamina, 48);
      if (upcomingCheckpoint < SUMMIT_Y) {
        state.timeLeft = Math.min(START_TIME + 26, state.timeLeft + 5);
      }
      this.message = upcomingCheckpoint >= SUMMIT_Y ? "Roof line ahead. Finish the climb." : "Checkpoint awning reached. Recover, then push. +5s rescue window.";
    }
    const nextStageIndex = getStageIndex(state.y);
    if (nextStageIndex > state.stageIndex) {
      state.stageIndex = nextStageIndex;
      this.message = nextStageIndex === 1 ? "Billboard run. Telegraphs tighten, so route before you pull." : nextStageIndex === 2 ? "Service shafts. Double drops start showing, so keep one escape lane alive." : "Helipad push. Triple-lane barrages can arrive now, use each ledge cleanly.";
    }
    const ledgeBelow = nearestLedgeBelow(state.y, this.ledges);
    if (state.vy <= 120 && state.y - ledgeBelow < 72) {
      if (ledgeBelow >= state.checkpointY) {
        state.onLedge = true;
        state.y = ledgeBelow;
        state.vy = Math.max(0, state.vy * 0.3);
        state.stamina = clamp(state.stamina + 56 * dt, 0, MAX_STAMINA);
      }
    } else {
      state.onLedge = false;
    }
    for (const pot of state.pots) {
      if (pot.lane === state.lane && Math.abs(pot.y - state.y) < 52 && state.hitTimer <= 0) {
        this.loseLife("Flowerpot hit. Restart from the last ledge.");
        break;
      }
    }
    if (state.timeLeft <= 0) {
      this.finish("lose", "The rescue window closed.", "You ran out of time before reaching the roof.");
      return;
    }
    if (state.stamina <= 0) {
      this.loseLife("You burned out. Land on ledges to refill stamina.");
      if (this.mode !== "playing") {
        return;
      }
    }
    if (state.y >= SUMMIT_Y) {
      state.score += Math.round(state.timeLeft * 10) + state.lives * 200;
      this.finish("win", "Roof secured.", "You reached the helicopter pad with time left.");
      return;
    }
    state.score = Math.max(state.score, Math.round(state.y) + state.checkpointIndex * 120);
    this.cameraY = clamp(state.y - 220, 0, SUMMIT_Y - 220);
  }
  getFrameState() {
    const state = this.state;
    const nextLedge = this.ledges.find((ledge) => ledge > state.y) ?? SUMMIT_Y;
    const overlay = this.mode === "menu" ? {
      type: "menu"
    } : this.result;
    return {
      mode: this.mode,
      width: WIDTH,
      height: HEIGHT,
      facadeLeft: FACADE_LEFT,
      facadeRight: FACADE_RIGHT,
      lanes: LANE_X,
      ledges: this.ledges,
      rowHeight: ROW_HEIGHT,
      summitY: SUMMIT_Y,
      cameraY: this.cameraY,
      player: {
        x: state.x,
        lane: state.lane,
        y: state.y,
        vy: state.vy,
        stamina: state.stamina,
        lives: state.lives,
        combo: state.combo,
        checkpointY: state.checkpointY,
        onLedge: state.onLedge,
        hitTimer: state.hitTimer,
        hand: state.lastHand
      },
      hazards: state.pots,
      telegraphs: state.telegraphs,
      altitudeText: `${Math.floor(state.y)} m`,
      staminaText: `${Math.ceil(state.stamina)}%`,
      livesText: `${state.lives}`,
      timeText: `${state.timeLeft.toFixed(1)}`,
      nextLedgeText: `${Math.max(0, Math.floor(nextLedge - state.y))} m`,
      stageText: getStageName(state.y),
      stageIndex: state.stageIndex,
      message: state.hintTimer > 0 && state.y < 240 ? "Alternate Q and E. Move sideways before a shutter or pot hits your lane." : this.message,
      overlay,
      result: this.result
    };
  }
}

// crazy-climber-rush/src/render.js
function toScreenY(worldY, cameraY) {
  return HEIGHT - 140 - (worldY - cameraY);
}
function renderScene(ctx, state) {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  sky.addColorStop(0, "#102038");
  sky.addColorStop(0.65, "#1b4060");
  sky.addColorStop(1, "#4c89a8");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  drawCity(ctx, state.cameraY);
  drawFacade(ctx, state);
  drawStageMarkers(ctx, state);
  drawLedges(ctx, state);
  drawTelegraphs(ctx, state);
  drawPots(ctx, state);
  drawPlayer(ctx, state);
  drawSummitMarker(ctx, state);
  drawPrompt(ctx, state);
}
function drawStageMarkers(ctx, state) {
  for (let index = 1;index < STAGE_NAMES.length; index += 1) {
    const marker = { y: STAGE_BREAKS[index], label: STAGE_NAMES[index] };
    const y = toScreenY(marker.y, state.cameraY);
    if (y < -40 || y > HEIGHT + 40) {
      continue;
    }
    ctx.strokeStyle = "rgba(248, 239, 174, 0.45)";
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.moveTo(state.facadeLeft + 20, y);
    ctx.lineTo(state.facadeRight - 20, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(10, 16, 24, 0.78)";
    ctx.fillRect(state.facadeLeft + 26, y - 24, 170, 24);
    ctx.fillStyle = "#f8efae";
    ctx.font = "700 13px Arial";
    ctx.fillText(marker.label, state.facadeLeft + 36, y - 8);
  }
}
function drawCity(ctx, cameraY) {
  const parallax = cameraY * 0.12;
  ctx.fillStyle = "rgba(9, 18, 30, 0.45)";
  for (let i = 0;i < 11; i += 1) {
    const x = -40 + i * 100;
    const width = 70 + i % 3 * 20;
    const height = 140 + i * 37 % 180;
    const y = 430 - height * 0.18 - parallax % 28;
    ctx.fillRect(x, y, width, height);
  }
}
function drawFacade(ctx, state) {
  ctx.fillStyle = "#2b3646";
  ctx.fillRect(state.facadeLeft, 0, state.facadeRight - state.facadeLeft, HEIGHT);
  ctx.fillStyle = "#1e2631";
  ctx.fillRect(state.facadeLeft + 22, 0, state.facadeRight - state.facadeLeft - 44, HEIGHT);
  const startRow = Math.max(0, Math.floor((state.cameraY - 120) / state.rowHeight));
  const endRow = Math.floor((state.cameraY + HEIGHT + 120) / state.rowHeight);
  for (let row = startRow;row <= endRow; row += 1) {
    const worldY = row * state.rowHeight;
    const screenY = toScreenY(worldY, state.cameraY);
    const blocked = getBlockedLanes(row);
    for (let lane = 0;lane < state.lanes.length; lane += 1) {
      const x = state.lanes[lane] - 40;
      ctx.fillStyle = blocked.includes(lane) ? "#8b4a45" : "#90d6ff";
      ctx.fillRect(x, screenY - 48, 80, 64);
      ctx.fillStyle = blocked.includes(lane) ? "#48211d" : "#d9f0ff";
      ctx.fillRect(x + 10, screenY - 38, 60, 44);
      if (blocked.includes(lane)) {
        ctx.strokeStyle = "rgba(28, 10, 8, 0.8)";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(x + 8, screenY - 44);
        ctx.lineTo(x + 72, screenY + 12);
        ctx.moveTo(x + 72, screenY - 44);
        ctx.lineTo(x + 8, screenY + 12);
        ctx.stroke();
      }
    }
  }
}
function drawLedges(ctx, state) {
  for (const ledge of state.ledges) {
    const y = toScreenY(ledge, state.cameraY);
    if (y < -30 || y > HEIGHT + 30) {
      continue;
    }
    ctx.fillStyle = ledge === 0 ? "#c6f0ff" : "#f2d689";
    ctx.fillRect(state.facadeLeft - 10, y + 16, state.facadeRight - state.facadeLeft + 20, 12);
    ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
    ctx.fillRect(state.facadeLeft - 10, y + 24, state.facadeRight - state.facadeLeft + 20, 8);
    if (ledge > 0 && ledge < state.summitY) {
      ctx.fillStyle = "#1d2732";
      ctx.font = "700 15px Arial";
      ctx.fillText(`Rest Ledge ${ledge} m`, state.facadeLeft + 18, y + 4);
    }
  }
}
function drawTelegraphs(ctx, state) {
  for (const telegraph of state.telegraphs) {
    const y = toScreenY(telegraph.y, state.cameraY);
    if (y < -60 || y > HEIGHT + 20) {
      continue;
    }
    const x = state.lanes[telegraph.lane];
    const pulse = 0.5 + Math.sin(telegraph.timer * 18) * 0.5;
    ctx.fillStyle = `rgba(255, 96, 72, ${0.45 + pulse * 0.35})`;
    ctx.fillRect(x - 34, y - 70, 68, 14);
    ctx.fillStyle = "#fff3d0";
    ctx.font = "700 13px Arial";
    ctx.fillText("DROP", x - 20, y - 78);
  }
}
function drawPots(ctx, state) {
  for (const pot of state.hazards) {
    const y = toScreenY(pot.y, state.cameraY);
    if (y < -40 || y > HEIGHT + 40) {
      continue;
    }
    const x = state.lanes[pot.lane];
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(pot.y / 60 * 0.2 * pot.spin);
    ctx.fillStyle = "#b65736";
    ctx.beginPath();
    ctx.moveTo(-14, -8);
    ctx.lineTo(14, -8);
    ctx.lineTo(11, 12);
    ctx.lineTo(-11, 12);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#f7c8a6";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, -10, 10, Math.PI, 0);
    ctx.stroke();
    ctx.restore();
  }
}
function drawPlayer(ctx, state) {
  const player = state.player;
  const x = player.x;
  const y = toScreenY(player.y, state.cameraY);
  const hitFlash = player.hitTimer > 0 && Math.floor(player.hitTimer * 12) % 2 === 0;
  ctx.save();
  ctx.translate(x, y);
  if (hitFlash) {
    ctx.globalAlpha = 0.45;
  }
  const sway = Math.sin(player.combo + player.y * 0.02) * 4;
  ctx.strokeStyle = "#f2f5f9";
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, -18);
  ctx.lineTo(0, 18);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -10);
  ctx.lineTo(player.hand === "left" ? -26 : -18, -34 + sway);
  ctx.moveTo(0, -10);
  ctx.lineTo(player.hand === "right" ? 26 : 18, -34 - sway);
  ctx.moveTo(0, 18);
  ctx.lineTo(-16, 40);
  ctx.moveTo(0, 18);
  ctx.lineTo(16, 40);
  ctx.stroke();
  ctx.fillStyle = "#ffd07c";
  ctx.beginPath();
  ctx.arc(0, -30, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = player.onLedge ? "#8af7b0" : "#ffce75";
  ctx.fillRect(-22, 44, 44 * (player.stamina / 100), 5);
  ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
  ctx.lineWidth = 2;
  ctx.strokeRect(-22, 44, 44, 5);
  ctx.restore();
}
function drawSummitMarker(ctx, state) {
  const y = toScreenY(state.summitY, state.cameraY);
  if (y > -120 && y < HEIGHT + 120) {
    ctx.fillStyle = "#dff8ff";
    ctx.fillRect(state.facadeLeft - 20, y - 14, state.facadeRight - state.facadeLeft + 40, 22);
    ctx.fillStyle = "#203040";
    ctx.font = "700 16px Arial";
    ctx.fillText("Helipad", state.facadeLeft + 24, y + 2);
  } else if (state.player.y < state.summitY) {
    ctx.fillStyle = "#dff8ff";
    ctx.beginPath();
    ctx.moveTo(WIDTH - 46, 44);
    ctx.lineTo(WIDTH - 24, 10);
    ctx.lineTo(WIDTH - 2, 44);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#203040";
    ctx.font = "700 14px Arial";
    ctx.fillText("Roof", WIDTH - 54, 62);
  }
}
function drawPrompt(ctx, state) {
  ctx.fillStyle = "rgba(10, 16, 24, 0.72)";
  ctx.fillRect(24, HEIGHT - 82, WIDTH - 48, 46);
  ctx.fillStyle = "#f4f8fb";
  ctx.font = "600 18px Arial";
  ctx.fillText(state.message, 40, HEIGHT - 52);
}

// crazy-climber-rush/src/main.js
var app = document.getElementById("app");
var hud = document.getElementById("hud");
var playSurface = document.getElementById("play-surface");
var canvas = document.getElementById("game");
var ctx = canvas.getContext("2d");
var altitudeValue = document.getElementById("altitude-value");
var staminaValue = document.getElementById("stamina-value");
var livesValue = document.getElementById("lives-value");
var timeValue = document.getElementById("time-value");
var ledgeValue = document.getElementById("ledge-value");
var stageValue = document.getElementById("stage-value");
var menuScreen = document.getElementById("menu-screen");
var resultScreen = document.getElementById("result-screen");
var resultEyebrow = document.getElementById("result-eyebrow");
var resultTitle = document.getElementById("result-title");
var resultCopy = document.getElementById("result-copy");
var startButton = document.getElementById("start-button");
var restartButton = document.getElementById("restart-button");
var heldDirections = {
  left: false,
  right: false
};
var laneRepeatTimer = 0;
canvas.width = WIDTH;
canvas.height = HEIGHT;
var game = new Game;
function syncUi(state) {
  app.dataset.mode = state.mode;
  hud.setAttribute("aria-hidden", state.mode === "playing" ? "false" : "true");
  altitudeValue.textContent = state.altitudeText;
  staminaValue.textContent = state.staminaText;
  livesValue.textContent = state.livesText;
  timeValue.textContent = state.timeText;
  ledgeValue.textContent = state.nextLedgeText;
  stageValue.textContent = state.stageText;
  menuScreen.hidden = state.overlay?.type !== "menu";
  menuScreen.setAttribute("aria-hidden", state.overlay?.type === "menu" ? "false" : "true");
  resultScreen.hidden = state.overlay?.type !== "result";
  resultScreen.setAttribute("aria-hidden", state.overlay?.type === "result" ? "false" : "true");
  if (state.overlay?.type === "result") {
    resultEyebrow.textContent = state.overlay.eyebrow;
    resultTitle.textContent = state.overlay.title;
    resultCopy.textContent = `${state.overlay.copy} Score ${state.overlay.score}.`;
  }
}
function startRun() {
  game.start();
  syncUi(game.getFrameState());
  playSurface.focus();
}
function resetToMenu() {
  game.restartRun();
  syncUi(game.getFrameState());
  playSurface.focus();
}
function moveDirection(direction) {
  if (direction === "left") {
    game.moveLane(-1);
  } else if (direction === "right") {
    game.moveLane(1);
  }
}
function getHeldDirection() {
  if (heldDirections.left === heldDirections.right) {
    return null;
  }
  return heldDirections.left ? "left" : "right";
}
function armHeldMovement(direction) {
  laneRepeatTimer = direction ? 0.18 : 0;
}
function pressDirection(direction) {
  heldDirections[direction] = true;
  moveDirection(direction);
  armHeldMovement(direction);
}
function releaseDirection(direction) {
  heldDirections[direction] = false;
  armHeldMovement(getHeldDirection());
}
function updateHeldMovement(dt) {
  const direction = getHeldDirection();
  if (!direction) {
    laneRepeatTimer = 0;
    return;
  }
  laneRepeatTimer -= dt;
  if (laneRepeatTimer > 0) {
    return;
  }
  moveDirection(direction);
  laneRepeatTimer = 0.18;
}
startButton.addEventListener("click", startRun);
restartButton.addEventListener("click", resetToMenu);
playSurface.addEventListener("pointerdown", () => {
  playSurface.focus();
});
window.addEventListener("keydown", (event) => {
  if (["ArrowLeft", "ArrowRight", "Space"].includes(event.code)) {
    event.preventDefault();
  }
  if ((event.code === "Enter" || event.code === "NumpadEnter") && !event.repeat) {
    if (game.mode === "menu") {
      startRun();
    } else if (game.mode === "result") {
      resetToMenu();
    }
    return;
  }
  if (event.code === "KeyR" && !event.repeat) {
    if (game.mode === "playing") {
      startRun();
    } else {
      resetToMenu();
    }
    return;
  }
  if ((event.code === "ArrowLeft" || event.code === "KeyA") && !event.repeat) {
    pressDirection("left");
  }
  if ((event.code === "ArrowRight" || event.code === "KeyD") && !event.repeat) {
    pressDirection("right");
  }
  if (event.code === "KeyQ" && !event.repeat) {
    game.stroke("left");
  }
  if (event.code === "KeyE" && !event.repeat) {
    game.stroke("right");
  }
});
window.addEventListener("keyup", (event) => {
  if (event.code === "ArrowLeft" || event.code === "KeyA") {
    releaseDirection("left");
  }
  if (event.code === "ArrowRight" || event.code === "KeyD") {
    releaseDirection("right");
  }
});
syncUi(game.getFrameState());
playSurface.focus();
var last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  updateHeldMovement(dt);
  game.update(dt);
  const state = game.getFrameState();
  renderScene(ctx, state);
  syncUi(state);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
