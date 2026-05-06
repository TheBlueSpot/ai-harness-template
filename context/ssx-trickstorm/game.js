(() => {
  // ssx-trickstorm/src/track.js
  var TRACK_LENGTH = 5600;
  var CHECKPOINTS = [1700, 3400, TRACK_LENGTH];
  var RAMPS = [
    { x: 420, width: 160, height: 44, airtime: 1.08 },
    { x: 980, width: 220, height: 62, airtime: 1.22 },
    { x: 1580, width: 180, height: 48, airtime: 1.15 },
    { x: 2320, width: 260, height: 74, airtime: 1.34 },
    { x: 3140, width: 200, height: 58, airtime: 1.2 },
    { x: 3940, width: 260, height: 82, airtime: 1.42 },
    { x: 4700, width: 180, height: 60, airtime: 1.24 }
  ];
  var HAZARDS = [
    { x: 640, lane: 0, type: "rock" },
    { x: 720, lane: 2, type: "tree" },
    { x: 1280, lane: 1, type: "rock" },
    { x: 1420, lane: 2, type: "tree" },
    { x: 1920, lane: 0, type: "ice" },
    { x: 2080, lane: 1, type: "tree" },
    { x: 2760, lane: 2, type: "rock" },
    { x: 2920, lane: 0, type: "tree" },
    { x: 3520, lane: 1, type: "ice" },
    { x: 3680, lane: 0, type: "rock" },
    { x: 4260, lane: 2, type: "tree" },
    { x: 4460, lane: 1, type: "rock" },
    { x: 5040, lane: 0, type: "ice" },
    { x: 5200, lane: 2, type: "tree" }
  ];
  var PICKUPS = [
    { x: 560, lane: 1, type: "boost" },
    { x: 1140, lane: 0, type: "boost" },
    { x: 1760, lane: 2, type: "boost" },
    { x: 2460, lane: 1, type: "boost" },
    { x: 3300, lane: 0, type: "boost" },
    { x: 4100, lane: 2, type: "boost" },
    { x: 4860, lane: 1, type: "boost" }
  ];
  var GATES = [
    { x: 1180, width: 180 },
    { x: 2860, width: 220 },
    { x: 4520, width: 200 }
  ];
  function triangleFalloff(distance, halfWidth) {
    const t = 1 - Math.abs(distance) / halfWidth;
    return Math.max(0, t);
  }
  function sampleTerrain(x) {
    const clampedX = Math.max(0, Math.min(TRACK_LENGTH, x));
    let y = 474 + Math.sin(clampedX / 180) * 28 + Math.sin(clampedX / 82) * 12 + Math.sin(clampedX / 420) * 48;
    for (const ramp of RAMPS) {
      const center = ramp.x + ramp.width * 0.5;
      const lift = triangleFalloff(clampedX - center, ramp.width * 0.5) * ramp.height;
      y -= lift;
    }
    return y;
  }
  function sampleSlope(x) {
    const prev = sampleTerrain(x - 4);
    const next = sampleTerrain(x + 4);
    return (next - prev) / 8;
  }
  function getRampAt(x) {
    return RAMPS.find((ramp) => x >= ramp.x && x <= ramp.x + ramp.width) ?? null;
  }
  function getWindowObjects(centerX, distance = 900) {
    const min = centerX - distance * 0.35;
    const max = centerX + distance;
    return {
      ramps: RAMPS.filter((item) => item.x + item.width >= min && item.x <= max),
      hazards: HAZARDS.filter((item) => item.x >= min && item.x <= max),
      pickups: PICKUPS.filter((item) => item.x >= min && item.x <= max),
      gates: GATES.filter((item) => item.x >= min && item.x <= max)
    };
  }
  function getTrackCatalog() {
    return {
      ramps: RAMPS,
      hazards: HAZARDS,
      pickups: PICKUPS,
      gates: GATES
    };
  }

  // ssx-trickstorm/src/Game.js
  var GRAVITY = 1180;
  var MAX_SPEED = 1240;
  var MIN_SPEED = 180;
  var CRASH_RECOVER_MS = 1400;
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
  function wrapDegrees(value) {
    const wrapped = (value % 360 + 360) % 360;
    return wrapped > 180 ? wrapped - 360 : wrapped;
  }
  function createRunState() {
    return {
      mode: "menu",
      width: 1280,
      height: 720,
      time: 0,
      checkpointIndex: 0,
      checkpointX: 0,
      score: 0,
      boost: 35,
      comboLabel: "None",
      comboBank: 0,
      trickSpin: 0,
      trickGrabFrames: 0,
      pendingCrashReason: "",
      result: null,
      passedGates: 0,
      gateMisses: 0,
      rider: {
        x: 0,
        lane: 1,
        laneVisual: 1,
        y: sampleTerrain(0),
        vy: 0,
        speed: 320,
        grounded: true,
        angle: 0,
        spinVelocity: 0,
        canJump: true
      },
      collected: new Set,
      hitHazards: new Set
    };
  }

  class Game {
    constructor({ width = 1280, height = 720 } = {}) {
      this.track = getTrackCatalog();
      this.state = createRunState();
      this.resize(width, height);
    }
    start() {
      if (this.state.mode === "menu") {
        this.state.mode = "playing";
      }
    }
    restart() {
      const { width, height } = this.state;
      this.state = createRunState();
      this.resize(width, height);
      this.state.mode = "playing";
    }
    resize(width, height) {
      this.state.width = width;
      this.state.height = height;
    }
    update(rawDt, input) {
      const dt = Math.min(rawDt || 0, 1 / 30);
      const state = this.state;
      if (state.mode === "menu") {
        if (input.startPressed) {
          this.start();
        }
        return;
      }
      if (state.mode === "clear" || state.mode === "failed") {
        if (input.restartPressed || input.startPressed) {
          this.restart();
        }
        return;
      }
      if (state.mode === "crashed") {
        state.time += dt;
        state.result.timer -= dt * 1000;
        if (state.result.timer <= 0) {
          this.resumeFromCheckpoint();
        }
        return;
      }
      state.time += dt;
      this.updateLane(input, dt);
      this.updateMotion(input, dt);
      this.updateTrackCollisions(input);
      this.updateProgress();
    }
    updateLane(input, dt) {
      const rider = this.state.rider;
      if (!rider.grounded) {
        rider.laneVisual += (rider.lane - rider.laneVisual) * Math.min(1, dt * 6);
        return;
      }
      if (input.leftPressed) {
        rider.lane = clamp(rider.lane - 1, 0, 2);
      } else if (input.rightPressed) {
        rider.lane = clamp(rider.lane + 1, 0, 2);
      }
      rider.laneVisual += (rider.lane - rider.laneVisual) * Math.min(1, dt * 9);
    }
    updateMotion(input, dt) {
      const state = this.state;
      const rider = state.rider;
      const terrainY = sampleTerrain(rider.x);
      const slope = sampleSlope(rider.x);
      if (rider.grounded) {
        let accel = 210 - slope * 180;
        if (input.tuck) {
          accel += 160;
        }
        if (input.brake) {
          accel -= 340;
        }
        if (input.boost && state.boost > 0) {
          accel += 430;
          state.boost = clamp(state.boost - dt * 24, 0, 100);
        }
        rider.speed = clamp(rider.speed + accel * dt, MIN_SPEED, MAX_SPEED);
        rider.x += rider.speed * dt;
        rider.y = sampleTerrain(rider.x);
        rider.angle = clamp(-slope * 45, -22, 22);
        const ramp = getRampAt(rider.x);
        const wantsJump = input.jumpPressed && rider.canJump;
        const launchNow = ramp && rider.x > ramp.x + ramp.width * 0.52;
        if (wantsJump || launchNow) {
          rider.grounded = false;
          rider.vy = -(210 + rider.speed * 0.24 + (ramp?.height ?? 0) * 4.1);
          rider.y = sampleTerrain(rider.x);
          rider.canJump = false;
          rider.spinVelocity = 0;
          state.comboBank = 0;
          state.comboLabel = "Airborne";
        }
        if (!input.jumpHeld) {
          rider.canJump = true;
        }
      } else {
        rider.x += rider.speed * dt;
        rider.vy += GRAVITY * dt;
        rider.y += rider.vy * dt;
        rider.speed = clamp(rider.speed - dt * 24, MIN_SPEED, MAX_SPEED);
        if (input.spinLeft) {
          rider.spinVelocity -= 680 * dt;
          state.comboBank += 26 * dt;
        }
        if (input.spinRight) {
          rider.spinVelocity += 680 * dt;
          state.comboBank += 26 * dt;
        }
        if (input.grab) {
          state.trickGrabFrames += 1;
          state.comboBank += 22 * dt;
        }
        rider.angle += rider.spinVelocity * dt;
        rider.spinVelocity *= 0.986;
        state.trickSpin = wrapDegrees(rider.angle);
        const landingY = sampleTerrain(rider.x);
        if (rider.y >= landingY) {
          rider.y = landingY;
          rider.grounded = true;
          const landedClean = Math.abs(state.trickSpin) < 24 && rider.vy < 760;
          if (landedClean) {
            const spinCount = Math.round(Math.abs(rider.angle) / 360);
            const spinText = spinCount > 0 ? `${spinCount * 360} spin` : "clean landing";
            const grabText = state.trickGrabFrames > 10 ? " + grab" : "";
            const banked = Math.round(state.comboBank + spinCount * 320 + state.trickGrabFrames * 3);
            state.score += banked;
            state.boost = clamp(state.boost + 14 + spinCount * 8, 0, 100);
            state.comboLabel = `${spinText}${grabText}  +${banked}`;
          } else {
            this.crash("Hard landing");
            return;
          }
          rider.angle = 0;
          rider.vy = 0;
          rider.spinVelocity = 0;
          state.comboBank = 0;
          state.trickSpin = 0;
          state.trickGrabFrames = 0;
        }
      }
      const expectedCheckpoint = CHECKPOINTS[state.checkpointIndex] ?? TRACK_LENGTH;
      if (rider.x >= expectedCheckpoint && state.checkpointIndex < CHECKPOINTS.length - 1) {
        state.checkpointX = expectedCheckpoint;
        state.checkpointIndex += 1;
        state.boost = clamp(state.boost + 18, 0, 100);
        state.comboLabel = `Checkpoint ${state.checkpointIndex}`;
      }
      if (rider.x >= TRACK_LENGTH) {
        state.mode = "clear";
        state.result = {
          title: "Summit Cleared",
          body: `Score ${Math.round(state.score)} | Gates ${state.passedGates}/3 | Boost ${Math.round(state.boost)}%`
        };
      }
    }
    updateTrackCollisions(input) {
      const state = this.state;
      const rider = state.rider;
      const hitRadius = rider.grounded ? 44 : 32;
      for (const pickup of this.track.pickups) {
        const key = `pickup-${pickup.x}-${pickup.lane}`;
        if (state.collected.has(key)) {
          continue;
        }
        if (Math.abs(pickup.x - rider.x) < 44 && Math.abs(pickup.lane - rider.laneVisual) < 0.45) {
          state.collected.add(key);
          state.boost = clamp(state.boost + 28, 0, 100);
          state.score += 90;
          state.comboLabel = "Boost canister";
        }
      }
      for (const hazard of this.track.hazards) {
        const key = `hazard-${hazard.x}-${hazard.lane}`;
        if (state.hitHazards.has(key)) {
          continue;
        }
        if (Math.abs(hazard.x - rider.x) < hitRadius && Math.abs(hazard.lane - rider.laneVisual) < 0.35) {
          state.hitHazards.add(key);
          if (hazard.type === "ice" && rider.grounded) {
            rider.speed = clamp(rider.speed - 160, MIN_SPEED, MAX_SPEED);
            rider.angle += input.left || input.right ? 18 : 42;
            state.comboLabel = "Ice wobble";
          } else {
            this.crash(hazard.type === "tree" ? "Clipped a tree" : "Caught a rock");
            return;
          }
        }
      }
      for (const gate of this.track.gates) {
        const key = `gate-${gate.x}`;
        if (state.collected.has(key)) {
          continue;
        }
        if (rider.x >= gate.x) {
          state.collected.add(key);
          const centerAligned = Math.abs(rider.laneVisual - 1) < 0.42;
          if (centerAligned) {
            state.passedGates += 1;
            state.score += 220;
            state.boost = clamp(state.boost + 10, 0, 100);
            state.comboLabel = "Gate threaded";
          } else {
            state.gateMisses += 1;
            state.comboLabel = "Gate missed";
          }
        }
      }
    }
    updateProgress() {
      const state = this.state;
      const rider = state.rider;
      if (rider.x > state.checkpointX + 420) {
        state.checkpointX = rider.x - 160;
      }
    }
    resumeFromCheckpoint() {
      const state = this.state;
      const rider = state.rider;
      state.mode = "playing";
      state.result = null;
      state.score = Math.max(0, state.score - 220);
      state.boost = Math.max(28, state.boost - 16);
      state.comboBank = 0;
      state.comboLabel = "Back on line";
      state.trickSpin = 0;
      state.trickGrabFrames = 0;
      rider.x = state.checkpointX;
      rider.y = sampleTerrain(rider.x);
      rider.vy = 0;
      rider.speed = Math.max(320, rider.speed * 0.72);
      rider.grounded = true;
      rider.angle = 0;
      rider.spinVelocity = 0;
      rider.lane = 1;
      rider.laneVisual = 1;
      rider.canJump = true;
    }
    crash(reason) {
      const state = this.state;
      const rider = state.rider;
      state.mode = "crashed";
      state.pendingCrashReason = reason;
      state.result = {
        title: "Crash",
        body: `${reason}. Dropping back to the last clean line.`,
        timer: CRASH_RECOVER_MS
      };
      rider.grounded = false;
    }
    getFrameState() {
      const state = this.state;
      const rider = state.rider;
      const cameraX = clamp(rider.x - state.width * 0.24, 0, Math.max(0, TRACK_LENGTH - state.width * 0.4));
      return {
        mode: state.mode,
        width: state.width,
        height: state.height,
        cameraX,
        terrainBase: sampleTerrain,
        viewport: getWindowObjects(rider.x, state.width * 0.9),
        rider: {
          x: rider.x,
          y: rider.y,
          lane: rider.laneVisual,
          grounded: rider.grounded,
          speed: rider.speed,
          angle: rider.angle
        },
        hud: {
          speed: Math.round(rider.speed),
          boost: Math.round(state.boost),
          score: Math.round(state.score),
          distance: `${Math.min(TRACK_LENGTH, Math.round(rider.x))} m`,
          combo: state.comboLabel,
          gate: `${state.passedGates} / 3`
        },
        overlay: state.mode === "menu" ? {
          eyebrow: "Downhill Jam",
          title: "SSX Trickstorm",
          body: "Chain spins and grabs off the big ramps, then land clean to bank the score and keep your boost alive.",
          button: "Start Run"
        } : state.mode === "clear" ? {
          eyebrow: "Course Cleared",
          title: state.result.title,
          body: state.result.body,
          button: "Run Again"
        } : state.mode === "failed" ? {
          eyebrow: "Wipeout",
          title: state.result.title,
          body: state.result.body,
          button: "Retry"
        } : state.mode === "crashed" ? {
          eyebrow: "Resetting Line",
          title: state.result.title,
          body: state.result.body,
          button: "Recovering",
          disabled: true
        } : null,
        trackLength: TRACK_LENGTH
      };
    }
  }

  // ssx-trickstorm/src/render.js
  var LANE_OFFSETS = [-36, 0, 36];
  function drawBackdrop(ctx, width, height) {
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, "#102245");
    sky.addColorStop(0.5, "#2c5f8c");
    sky.addColorStop(1, "#d7ecff");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    for (let i = 0;i < 7; i += 1) {
      ctx.beginPath();
      ctx.ellipse(140 + i * 180, 110 + i % 3 * 28, 100, 28, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#17355b";
    ctx.beginPath();
    ctx.moveTo(0, height * 0.42);
    for (let x = 0;x <= width; x += 60) {
      const y = height * 0.42 + Math.sin(x / 120) * 18 + Math.cos(x / 70) * 12;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(width, 0);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fill();
  }
  function worldToScreen(frame, x, y, lane = 1) {
    const screenX = x - frame.cameraX;
    const terrainOffset = LANE_OFFSETS[lane] ?? 0;
    return {
      x: screenX,
      y: y + terrainOffset
    };
  }
  function drawTerrain(ctx, frame) {
    const { width, height } = frame;
    const floorGradient = ctx.createLinearGradient(0, height * 0.45, 0, height);
    floorGradient.addColorStop(0, "#eef7ff");
    floorGradient.addColorStop(0.52, "#d0e6f7");
    floorGradient.addColorStop(1, "#8eb7d6");
    ctx.fillStyle = floorGradient;
    ctx.beginPath();
    ctx.moveTo(0, height);
    for (let screenX = -20;screenX <= width + 20; screenX += 16) {
      const worldX = frame.cameraX + screenX;
      const y = sampleTerrain(worldX);
      ctx.lineTo(screenX, y + 64);
    }
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fill();
    for (let lane = 0;lane < 3; lane += 1) {
      ctx.strokeStyle = lane === 1 ? "rgba(255,255,255,0.62)" : "rgba(255,255,255,0.28)";
      ctx.lineWidth = lane === 1 ? 5 : 3;
      ctx.beginPath();
      for (let screenX = -20;screenX <= width + 20; screenX += 16) {
        const worldX = frame.cameraX + screenX;
        const y = sampleTerrain(worldX) + LANE_OFFSETS[lane];
        if (screenX === -20) {
          ctx.moveTo(screenX, y);
        } else {
          ctx.lineTo(screenX, y);
        }
      }
      ctx.stroke();
    }
  }
  function drawRamp(ctx, frame, ramp) {
    const p1 = worldToScreen(frame, ramp.x, sampleTerrain(ramp.x), 1);
    const p2 = worldToScreen(frame, ramp.x + ramp.width * 0.5, sampleTerrain(ramp.x + ramp.width * 0.5), 1);
    const p3 = worldToScreen(frame, ramp.x + ramp.width, sampleTerrain(ramp.x + ramp.width), 1);
    ctx.fillStyle = "rgba(232, 108, 55, 0.9)";
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y + 18);
    ctx.lineTo(p2.x, p2.y - 12);
    ctx.lineTo(p3.x, p3.y + 18);
    ctx.closePath();
    ctx.fill();
  }
  function drawHazard(ctx, frame, hazard) {
    const pos = worldToScreen(frame, hazard.x, sampleTerrain(hazard.x), hazard.lane);
    if (hazard.type === "tree") {
      ctx.fillStyle = "#1d6733";
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y - 42);
      ctx.lineTo(pos.x - 24, pos.y + 10);
      ctx.lineTo(pos.x + 24, pos.y + 10);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#5d3118";
      ctx.fillRect(pos.x - 4, pos.y + 8, 8, 18);
    } else if (hazard.type === "rock") {
      ctx.fillStyle = "#5d7389";
      ctx.beginPath();
      ctx.arc(pos.x, pos.y + 4, 16, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = "#b8f4ff";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y + 2, 18, Math.PI * 0.15, Math.PI * 0.92);
      ctx.stroke();
    }
  }
  function drawPickup(ctx, frame, pickup) {
    const pos = worldToScreen(frame, pickup.x, sampleTerrain(pickup.x), pickup.lane);
    ctx.fillStyle = "#f4ff8a";
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y - 20);
    ctx.lineTo(pos.x - 15, pos.y);
    ctx.lineTo(pos.x, pos.y + 18);
    ctx.lineTo(pos.x + 15, pos.y);
    ctx.closePath();
    ctx.fill();
  }
  function drawGate(ctx, frame, gate) {
    const left = worldToScreen(frame, gate.x, sampleTerrain(gate.x), 0);
    const right = worldToScreen(frame, gate.x, sampleTerrain(gate.x), 2);
    ctx.strokeStyle = "#ff6a7d";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(left.x, left.y - 60);
    ctx.lineTo(left.x, left.y + 10);
    ctx.moveTo(right.x, right.y - 60);
    ctx.lineTo(right.x, right.y + 10);
    ctx.moveTo(left.x, left.y - 60);
    ctx.lineTo(right.x, right.y - 60);
    ctx.stroke();
  }
  function drawRider(ctx, frame) {
    const rider = frame.rider;
    const pos = worldToScreen(frame, rider.x, rider.y, Math.round(rider.lane));
    ctx.save();
    ctx.translate(pos.x, pos.y - 26);
    ctx.rotate(rider.angle * Math.PI / 180);
    ctx.fillStyle = "#16161f";
    ctx.fillRect(-32, 18, 64, 6);
    ctx.fillStyle = "#de3342";
    ctx.fillRect(-10, -28, 20, 28);
    ctx.fillStyle = "#ffe9bf";
    ctx.beginPath();
    ctx.arc(0, -38, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#0f1115";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-4, 0);
    ctx.lineTo(-18, 18);
    ctx.moveTo(4, 0);
    ctx.lineTo(18, 18);
    ctx.moveTo(-4, -16);
    ctx.lineTo(-22, -2);
    ctx.moveTo(4, -16);
    ctx.lineTo(22, -6);
    ctx.stroke();
    ctx.restore();
    if (!rider.grounded) {
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.setLineDash([10, 10]);
      ctx.beginPath();
      ctx.arc(pos.x, pos.y - 26, 44, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  function renderFrame(ctx, frame) {
    ctx.clearRect(0, 0, frame.width, frame.height);
    drawBackdrop(ctx, frame.width, frame.height);
    drawTerrain(ctx, frame);
    for (const ramp of frame.viewport.ramps) {
      drawRamp(ctx, frame, ramp);
    }
    for (const gate of frame.viewport.gates) {
      drawGate(ctx, frame, gate);
    }
    for (const pickup of frame.viewport.pickups) {
      drawPickup(ctx, frame, pickup);
    }
    for (const hazard of frame.viewport.hazards) {
      drawHazard(ctx, frame, hazard);
    }
    drawRider(ctx, frame);
    ctx.fillStyle = "rgba(15, 23, 42, 0.72)";
    ctx.fillRect(frame.width - 232, frame.height - 82, 192, 42);
    ctx.fillStyle = "#eaf7ff";
    ctx.font = "600 18px Arial";
    ctx.fillText(`Finish ${Math.max(0, Math.round(frame.trackLength - frame.rider.x))} m`, frame.width - 212, frame.height - 54);
  }

  // ssx-trickstorm/src/main.js
  var canvas = document.getElementById("gameCanvas");
  var ctx = canvas.getContext("2d");
  var overlay = document.getElementById("overlay");
  var overlayEyebrow = document.getElementById("overlayEyebrow");
  var overlayTitle = document.getElementById("overlayTitle");
  var overlayBody = document.getElementById("overlayBody");
  var overlayButton = document.getElementById("overlayButton");
  var speedValue = document.getElementById("speedValue");
  var boostValue = document.getElementById("boostValue");
  var scoreValue = document.getElementById("scoreValue");
  var distanceValue = document.getElementById("distanceValue");
  var comboValue = document.getElementById("comboValue");
  var gateValue = document.getElementById("gateValue");
  var pressed = new Set;
  var justPressed = new Set;
  var game = new Game({ width: canvas.width, height: canvas.height });
  function resize() {
    const width = Math.min(window.innerWidth - 24, 1280);
    const height = Math.min(window.innerHeight - 24, 720);
    canvas.width = Math.max(960, width);
    canvas.height = Math.max(540, height);
    game.resize(canvas.width, canvas.height);
  }
  function mapInput() {
    return {
      left: pressed.has("KeyA") || pressed.has("ArrowLeft"),
      right: pressed.has("KeyD") || pressed.has("ArrowRight"),
      leftPressed: justPressed.has("KeyA") || justPressed.has("ArrowLeft"),
      rightPressed: justPressed.has("KeyD") || justPressed.has("ArrowRight"),
      tuck: pressed.has("KeyW") || pressed.has("ArrowUp"),
      brake: pressed.has("KeyS") || pressed.has("ArrowDown"),
      jumpHeld: pressed.has("Space"),
      jumpPressed: justPressed.has("Space"),
      spinLeft: pressed.has("KeyJ"),
      spinRight: pressed.has("KeyL"),
      grab: pressed.has("KeyK"),
      boost: pressed.has("ShiftLeft") || pressed.has("ShiftRight"),
      startPressed: justPressed.has("Enter"),
      restartPressed: justPressed.has("KeyR")
    };
  }
  function syncHud(frame) {
    speedValue.textContent = `${frame.hud.speed}`;
    boostValue.textContent = `${frame.hud.boost}%`;
    scoreValue.textContent = `${frame.hud.score}`;
    distanceValue.textContent = frame.hud.distance;
    comboValue.textContent = frame.hud.combo;
    gateValue.textContent = frame.hud.gate;
    if (frame.overlay) {
      overlay.hidden = false;
      overlayEyebrow.textContent = frame.overlay.eyebrow;
      overlayTitle.textContent = frame.overlay.title;
      overlayBody.textContent = frame.overlay.body;
      overlayButton.textContent = frame.overlay.button;
      overlayButton.disabled = Boolean(frame.overlay.disabled);
    } else {
      overlay.hidden = true;
    }
  }
  window.addEventListener("keydown", (event) => {
    if (!pressed.has(event.code)) {
      justPressed.add(event.code);
    }
    pressed.add(event.code);
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) {
      event.preventDefault();
    }
  });
  window.addEventListener("keyup", (event) => {
    pressed.delete(event.code);
  });
  window.addEventListener("resize", resize);
  overlayButton.addEventListener("click", () => {
    const frame = game.getFrameState();
    if (frame.mode === "menu") {
      game.start();
    } else if (frame.mode === "clear" || frame.mode === "failed") {
      game.restart();
    }
  });
  resize();
  var last = performance.now();
  function frame(now) {
    const dt = (now - last) / 1000;
    last = now;
    game.update(dt, mapInput());
    const state = game.getFrameState();
    renderFrame(ctx, state);
    syncHud(state);
    justPressed.clear();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
