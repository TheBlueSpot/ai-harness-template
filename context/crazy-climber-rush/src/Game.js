import {
  createLedges,
  FACADE_LEFT,
  FACADE_RIGHT,
  HEIGHT,
  LANE_X,
  MAX_LIVES,
  MAX_STAMINA,
  ROW_HEIGHT,
  START_TIME,
  SUMMIT_Y,
  WIDTH,
  getBlockedLanes,
  getPotLane,
  getStageIndex,
  getStageName,
} from "./data.js";

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

export class Game {
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
      stageIndex: 0,
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
      score: this.state.score,
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
        lanes.push((leadLane + 1 + (seed % 2)) % LANE_X.length);
      }
      if (hazardStage >= 3 && seed % 4 === 0) {
        lanes.push((leadLane + 2) % LANE_X.length);
      }
      queueTelegraphs(state, [...new Set(lanes)], state.spawnCursor, baseTimer + (seed % 3) * 0.1);
      state.spawnCursor += baseSpacing + (seed % 4) * 28;
    }

    for (const telegraph of state.telegraphs) {
      telegraph.timer -= dt;
      if (telegraph.timer <= 0) {
        const hazardStage = getStageIndex(telegraph.y);
        state.pots.push({
          lane: telegraph.lane,
          y: telegraph.y,
          speed: 230 + hazardStage * 28 + ((telegraph.y / 180) % 4) * 24,
          spin: (telegraph.lane % 2 === 0 ? 1 : -1) * 4,
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
      this.message =
        upcomingCheckpoint >= SUMMIT_Y
          ? "Roof line ahead. Finish the climb."
          : "Checkpoint awning reached. Recover, then push. +5s rescue window.";
    }

    const nextStageIndex = getStageIndex(state.y);
    if (nextStageIndex > state.stageIndex) {
      state.stageIndex = nextStageIndex;
      this.message =
        nextStageIndex === 1
          ? "Billboard run. Telegraphs tighten, so route before you pull."
          : nextStageIndex === 2
            ? "Service shafts. Double drops start showing, so keep one escape lane alive."
            : "Helipad push. Triple-lane barrages can arrive now, use each ledge cleanly.";
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
    const overlay =
      this.mode === "menu"
        ? {
            type: "menu",
          }
        : this.result;

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
        hand: state.lastHand,
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
      message:
        state.hintTimer > 0 && state.y < 240
          ? "Alternate Q and E. Move sideways before a shutter or pot hits your lane."
          : this.message,
      overlay,
      result: this.result,
    };
  }
}
