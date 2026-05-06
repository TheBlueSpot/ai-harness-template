"use strict";
(() => {
  // thps-combo-lines/src/tricks.js
  var trickTable = {
    ollie: { name: "Ollie", type: "jump", baseScore: 120, comboBonus: 1 },
    manual: { name: "Manual", type: "manual", baseScore: 90, comboBonus: 1.1 },
    grind: { name: "Grind", type: "grind", baseScore: 140, comboBonus: 1.25 },
    air: { name: "Air", type: "air", baseScore: 160, comboBonus: 1.2 },
    landing: { name: "Clean Landing", type: "landing", baseScore: 60, comboBonus: 0.8 }
  };
  var comboRules = {
    multiplierStep: 0.25,
    maxMultiplier: 6,
    bailPenalty: 0.5,
    hardLandingSpeed: 380,
    manualWindow: 0.75,
    grindWindow: 0.55,
    jumpWindow: 0.8
  };
  function scoreTrick(kind, comboMultiplier = 1) {
    const trick = trickTable[kind] ?? trickTable.ollie;
    return Math.round(trick.baseScore * (1 + comboMultiplier * trick.comboBonus));
  }

  // thps-combo-lines/src/level.js
  var ramps = [
    { id: "start-roll", x: 80, y: 416, w: 112, h: 22, type: "ramp", launch: 1.04 },
    { id: "bank-pop", x: 250, y: 376, w: 124, h: 28, type: "ramp", launch: 1.18 },
    { id: "spine-kick", x: 690, y: 398, w: 136, h: 30, type: "ramp", launch: 1.24 },
    { id: "hip-boost", x: 1040, y: 352, w: 126, h: 34, type: "ramp", launch: 1.34 },
    { id: "gap-floater", x: 1360, y: 328, w: 140, h: 36, type: "ramp", launch: 1.42 },
    { id: "finisher-lip", x: 1910, y: 318, w: 164, h: 42, type: "ramp", launch: 1.5 }
  ];
  var rails = [
    { id: "rail-a", x: 206, y: 312, w: 176, h: 10, type: "rail" },
    { id: "rail-b", x: 568, y: 294, w: 212, h: 10, type: "rail" },
    { id: "rail-c", x: 930, y: 260, w: 186, h: 10, type: "rail" },
    { id: "rail-d", x: 1270, y: 238, w: 222, h: 10, type: "rail" },
    { id: "rail-e", x: 1710, y: 248, w: 248, h: 10, type: "rail" }
  ];
  var landingZones = [
    { id: "manual-pad-1", x: 148, y: 448, w: 188, h: 18, type: "manual" },
    { id: "manual-pad-2", x: 462, y: 448, w: 172, h: 18, type: "manual" },
    { id: "manual-pad-3", x: 820, y: 448, w: 174, h: 18, type: "manual" },
    { id: "manual-pad-4", x: 1170, y: 448, w: 198, h: 18, type: "manual" },
    { id: "manual-pad-5", x: 1608, y: 448, w: 196, h: 18, type: "manual" }
  ];
  var pickups = [
    { id: "score-1", x: 156, y: 362, radius: 14, score: 220 },
    { id: "score-2", x: 328, y: 316, radius: 14, score: 320 },
    { id: "score-3", x: 622, y: 284, radius: 14, score: 360 },
    { id: "score-4", x: 884, y: 338, radius: 14, score: 380 },
    { id: "score-5", x: 1072, y: 252, radius: 14, score: 420 },
    { id: "score-6", x: 1436, y: 230, radius: 14, score: 480 },
    { id: "score-7", x: 1770, y: 214, radius: 14, score: 520 },
    { id: "score-8", x: 2050, y: 256, radius: 16, score: 640 }
  ];
  var finishGates = [
    { id: "gate-1", x: 2238, y: 232, w: 24, h: 206, openAt: 0 },
    { id: "gate-2", x: 2276, y: 216, w: 26, h: 222, openAt: 0 }
  ];
  var lineGoals = [
    {
      id: "warmup-flow",
      start: 0,
      end: 620,
      label: "Warmup flow",
      copy: "Pop the opening bank, then settle into the first manual pad.",
      requirements: ["air", "manual"],
      bonus: 700
    },
    {
      id: "transfer-spine",
      start: 620,
      end: 1450,
      label: "Transfer spine",
      copy: "Link a rail, then a manual, then launch the hip clean.",
      requirements: ["grind", "manual", "air"],
      bonus: 1200
    },
    {
      id: "crown-finisher",
      start: 1450,
      end: 2280,
      label: "Crown finisher",
      copy: "Hold the long crown rail and stomp the final landing.",
      requirements: ["grind", "landing"],
      bonus: 1600
    }
  ];
  var course = {
    width: 2360,
    cameraWindow: 920,
    worldHeight: 540,
    groundY: 468,
    runTime: 84,
    startTime: 0,
    finishTime: 84,
    finishDistance: 2260,
    targetScore: 8200
  };
  function getCourse() {
    return course;
  }
  function getRamps() {
    return ramps;
  }
  function getRails() {
    return rails;
  }
  function getLandingZones() {
    return landingZones;
  }
  function getPickups() {
    return pickups;
  }
  function getFinishGates() {
    return finishGates;
  }
  function getLineGoals() {
    return lineGoals;
  }

  // thps-combo-lines/src/Game.js
  var Game = class {
    constructor() {
      this.width = 1280;
      this.height = 720;
      this.start();
    }
    start() {
      this.course = getCourse();
      this.ramps = getRamps();
      this.rails = getRails();
      this.landingZones = getLandingZones();
      this.lineGoals = getLineGoals();
      this.pickups = getPickups().map((pickup) => ({ ...pickup, taken: false }));
      this.finishGates = getFinishGates();
      this.state = "menu";
      this.overlayMode = "menu";
      this.overlayTitle = "Combo Lines";
      this.overlayCopy = "Press Enter to drop in and chain grinds, manuals, and airs.";
      this.overlayEyebrow = "Skate score attack";
      this.resetRun(true);
      return this;
    }
    restart() {
      this.resetRun(false);
    }
    resize(width, height) {
      this.width = width;
      this.height = height;
    }
    update(dt, input2 = {}) {
      this.lastInput = { ...input2 };
      if (input2.restart) {
        this.restart();
      }
      if (input2.start && this.state !== "playing") {
        this.beginRun();
      }
      if (this.state !== "playing") {
        return;
      }
      this.timeLeft = Math.max(0, this.timeLeft - dt);
      this.distance = Math.min(this.course.finishDistance, this.distance + this.speed * dt);
      this.applyInput(dt, input2);
      this.integrateMotion(dt);
      this.resolveTrack();
      this.updateCombo(dt);
      this.collectPickups();
      this.updateGoals();
      this.checkFinish();
    }
    getFrameState() {
      return {
        state: this.state,
        mode: this.overlayMode,
        overlayTitle: this.overlayTitle,
        overlayCopy: this.overlayCopy,
        overlayEyebrow: this.overlayEyebrow,
        score: this.score,
        speed: this.speed,
        combo: this.comboMultiplier,
        comboCallout: this.comboText,
        lineName: this.lineName,
        message: this.message,
        timer: this.timeLeft,
        result: this.result,
        resultStats: { ...this.resultStats },
        targetScore: this.course.targetScore,
        worldDistance: this.distance,
        elapsed: this.course.runTime - this.timeLeft,
        goalLabel: this.goalLabel,
        goalCopy: this.goalCopy,
        goalProgress: this.goalProgress,
        goalsCompleted: this.goalStates.filter((goal) => goal.completed).length,
        goalCount: this.goalStates.length,
        world: {
          cameraWindow: this.course.cameraWindow,
          worldHeight: this.course.worldHeight,
          groundY: this.course.groundY
        },
        skater: {
          ...this.skater,
          worldX: this.getPlayerWorldX(),
          x: this.skaterAnchorX
        },
        ramps: this.ramps.map((item) => this.projectWorldItem(item)),
        rails: this.rails.map((item) => this.projectWorldItem(item)),
        landingZones: this.landingZones.map((item) => this.projectWorldItem(item)),
        pickups: this.pickups.map((item) => this.projectWorldItem(item)),
        finishGates: this.finishGates.map((item) => ({
          ...this.projectWorldItem(item),
          active: this.course.runTime - this.timeLeft >= item.openAt
        })),
        manuals: this.manualPath.map((item) => this.projectWorldItem(item))
      };
    }
    beginRun() {
      this.resetRun(false);
      this.state = "playing";
      this.overlayMode = "run";
      this.overlayTitle = "Run live";
      this.overlayCopy = "Build the three named lines, then cash out before the gate closes.";
      this.overlayEyebrow = "Full street run";
      this.message = "Drop in";
    }
    resetRun(inMenu) {
      this.state = inMenu ? "menu" : "ready";
      this.overlayMode = inMenu ? "menu" : "ready";
      this.overlayTitle = "Combo Lines";
      this.overlayCopy = inMenu ? "Press Enter to drop into a longer street line with three trick goals." : "Run reset. Press Enter to start another full street line.";
      this.overlayEyebrow = inMenu ? "Skate score attack" : "Ready";
      this.result = null;
      this.resultStats = { score: 0, combo: 1, pickups: 0, goals: 0, timeLeft: this.course.runTime };
      this.score = 0;
      this.speed = 220;
      this.timeLeft = this.course.runTime;
      this.distance = 0;
      this.comboMultiplier = 1;
      this.comboText = "";
      this.lineName = "Idle";
      this.message = inMenu ? "Idle" : "Reset";
      this.manualPath = getLandingZones();
      this.pickups = getPickups().map((pickup) => ({ ...pickup, taken: false }));
      this.skaterAnchorX = 170;
      this.skater = { x: 0, y: this.course.groundY, vx: 0, vy: 0, w: 42, h: 48, angle: 0 };
      this.grounded = true;
      this.onRail = false;
      this.railId = null;
      this.onManual = false;
      this.manualLatched = false;
      this.comboAlive = false;
      this.comboClock = 0;
      this.goalStates = this.lineGoals.map((goal) => ({ id: goal.id, step: 0, completed: false }));
      this.goalIndex = 0;
      this.goalLabel = "Warmup flow";
      this.goalCopy = "Pop the opening bank, then settle into the first manual pad.";
      this.goalProgress = "1/3 lines banked";
      this.refreshGoalUi();
    }
    applyInput(dt, input2) {
      const steer = (input2.right ? 1 : 0) - (input2.left ? 1 : 0);
      this.skater.vx = steer * 180;
      const accel = input2.right ? 80 : input2.left ? -110 : 14;
      this.speed = Math.max(150, Math.min(460, this.speed + accel * dt));
      if (input2.jump && this.grounded) {
        this.jump();
      }
      this.onManual = Boolean(input2.down) && this.grounded;
    }
    integrateMotion(dt) {
      if (!this.grounded) {
        this.skater.vy += 880 * dt;
      }
      this.skater.x += this.skater.vx * dt;
      this.skater.y += this.skater.vy * dt;
      this.skater.angle = this.onRail ? 12 : this.onManual ? -6 : 0;
    }
    resolveTrack() {
      const ground = this.course.groundY;
      const wasAirborne = !this.grounded;
      if (this.skater.y >= ground) {
        if (!this.grounded && Math.abs(this.skater.vy) > comboRules.hardLandingSpeed) {
          this.bail("hard landing");
          return;
        }
        this.skater.y = ground;
        this.skater.vy = 0;
        this.grounded = true;
        if (this.onManual && !this.manualLatched) {
          this.addCombo("manual", "Manual");
          this.manualLatched = true;
        } else if (wasAirborne && this.comboAlive) {
          this.addCombo("landing", "Clean landing");
        }
      } else {
        this.grounded = false;
        this.manualLatched = false;
      }
      let skaterWorld = this.getSkaterWorldRect();
      const rail = this.rails.find((item) => this.overlaps(skaterWorld, item));
      this.onRail = Boolean(rail);
      if (rail) {
        this.skater.y = rail.y - this.skater.h * 0.45;
        this.skater.vy = 0;
        this.grounded = true;
        if (this.railId !== rail.id) {
          this.railId = rail.id;
          this.addCombo("grind", "Grind");
        }
        skaterWorld = this.getSkaterWorldRect();
      } else {
        this.railId = null;
      }
      const ramp = this.ramps.find((item) => this.overlaps(skaterWorld, item));
      if (ramp && this.grounded) {
        this.jump(ramp.launch);
        this.addCombo("air", "Ramp air");
      }
      skaterWorld = this.getSkaterWorldRect();
      const manualZone = this.landingZones.find((item) => this.overlaps(skaterWorld, item));
      if (manualZone && this.onManual && !this.manualLatched) {
        this.addCombo("manual", "Manual");
        this.manualLatched = true;
      }
    }
    updateCombo(dt) {
      if (!this.comboAlive) {
        return;
      }
      this.comboClock += dt;
      if (this.comboClock > comboRules.manualWindow + comboRules.grindWindow + comboRules.jumpWindow) {
        this.comboAlive = false;
        this.comboMultiplier = 1;
        this.comboText = "";
        this.message = "Line dropped";
      }
    }
    collectPickups() {
      for (const pickup of this.pickups) {
        if (pickup.taken) continue;
        const skaterWorld = this.getSkaterWorldRect();
        const dx = skaterWorld.x + skaterWorld.w * 0.5 - pickup.x;
        const dy = skaterWorld.y + skaterWorld.h * 0.5 - pickup.y;
        if (dx * dx + dy * dy > (pickup.radius + 24) ** 2) continue;
        pickup.taken = true;
        this.score += pickup.score;
        this.resultStats.pickups += 1;
        this.message = "Pickup";
      }
    }
    checkFinish() {
      const reachedGate = this.getPlayerWorldX() >= this.course.finishDistance;
      if (this.timeLeft > 0 && !reachedGate) {
        return;
      }
      const cleared = this.score >= this.course.targetScore;
      this.state = cleared ? "win" : "lose";
      this.overlayMode = this.state;
      this.overlayTitle = cleared ? "Line cleared" : "Line dropped";
      this.overlayEyebrow = cleared ? "Result" : "Time up";
      this.overlayCopy = cleared ? "Target hit. Press R to run the full street line again." : "Target missed. Press R to retry and finish more of the named lines.";
      this.result = cleared ? "win" : "lose";
      this.resultStats = {
        score: this.score,
        combo: this.comboMultiplier,
        pickups: this.pickups.filter((pickup) => pickup.taken).length,
        goals: this.goalStates.filter((goal) => goal.completed).length,
        timeLeft: this.timeLeft
      };
    }
    jump(boost = 1) {
      this.grounded = false;
      this.skater.vy = -480 * boost;
      this.comboAlive = true;
      this.comboClock = 0;
      this.addCombo("jump", "Ollie");
    }
    addCombo(kind, label) {
      const gain = scoreTrick(kind, this.comboMultiplier);
      this.score += gain;
      this.comboMultiplier = Math.min(
        comboRules.maxMultiplier,
        this.comboMultiplier + comboRules.multiplierStep
      );
      this.comboText = `${label} +${gain}`;
      this.lineName = label;
      this.comboAlive = true;
      this.comboClock = 0;
      this.resolveGoalHit(kind);
    }
    bail(reason) {
      this.score = Math.max(0, Math.round(this.score * comboRules.bailPenalty));
      this.comboMultiplier = 1;
      this.comboText = `Bail: ${reason}`;
      this.lineName = "Bail";
      this.message = "Reset combo";
      this.comboAlive = false;
      this.grounded = true;
      this.skater.y = this.course.groundY;
      this.skater.vy = 0;
      this.railId = null;
      this.manualLatched = false;
      this.state = "playing";
    }
    getSkaterWorldRect() {
      return {
        x: this.distance + this.skaterAnchorX + this.skater.x - this.skater.w * 0.5,
        y: this.skater.y - this.skater.h,
        w: this.skater.w,
        h: this.skater.h
      };
    }
    getPlayerWorldX() {
      const rect = this.getSkaterWorldRect();
      return rect.x + rect.w * 0.5;
    }
    getCameraX() {
      return Math.max(0, Math.min(this.distance, this.course.width - this.course.cameraWindow));
    }
    projectWorldItem(item) {
      const cameraX = this.getCameraX();
      const radius = item.radius ?? 0;
      return {
        ...item,
        screenX: item.x - cameraX,
        screenY: item.y,
        radius,
        taken: Boolean(item.taken)
      };
    }
    overlaps(a, b) {
      return a.x + a.w > b.x && a.x < b.x + b.w && a.y + a.h > b.y && a.y < b.y + b.h;
    }
    updateGoals() {
      while (this.goalIndex < this.lineGoals.length) {
        const goal = this.lineGoals[this.goalIndex];
        const state = this.goalStates[this.goalIndex];
        if (state.completed) {
          this.goalIndex += 1;
          continue;
        }
        if (this.getPlayerWorldX() > goal.end) {
          this.goalIndex += 1;
          continue;
        }
        break;
      }
      this.refreshGoalUi();
    }
    refreshGoalUi() {
      const completed = this.goalStates.filter((goal) => goal.completed).length;
      this.goalProgress = `${completed}/${this.goalStates.length} lines banked`;
      const nextGoal = this.lineGoals[this.goalIndex];
      if (!nextGoal) {
        this.goalLabel = "Final push";
        this.goalCopy = "Finish clean and cash out above the target.";
        return;
      }
      const state = this.goalStates[this.goalIndex];
      const nextRequirement = nextGoal.requirements[state.step] ?? nextGoal.requirements.at(-1);
      const readable = {
        air: "air",
        manual: "manual",
        grind: "grind",
        landing: "clean landing"
      };
      this.goalLabel = nextGoal.label;
      this.goalCopy = state.step === 0 ? nextGoal.copy : `Keep ${nextGoal.label.toLowerCase()} alive with a ${readable[nextRequirement] ?? nextRequirement}.`;
    }
    resolveGoalHit(kind) {
      while (this.goalIndex < this.lineGoals.length && this.goalStates[this.goalIndex].completed) {
        this.goalIndex += 1;
      }
      const goal = this.lineGoals[this.goalIndex];
      if (!goal) {
        this.refreshGoalUi();
        return;
      }
      const playerX = this.getPlayerWorldX();
      if (playerX > goal.end) {
        this.goalIndex += 1;
        this.refreshGoalUi();
        this.resolveGoalHit(kind);
        return;
      }
      if (playerX < goal.start || playerX > goal.end) {
        this.refreshGoalUi();
        return;
      }
      const state = this.goalStates[this.goalIndex];
      const required = goal.requirements[state.step];
      if (required !== kind) {
        this.refreshGoalUi();
        return;
      }
      state.step += 1;
      if (state.step >= goal.requirements.length) {
        state.completed = true;
        this.score += goal.bonus;
        this.comboText = `${goal.label} +${goal.bonus}`;
        this.lineName = goal.label;
        this.message = `${goal.label} banked`;
        this.goalIndex += 1;
      }
      this.refreshGoalUi();
    }
  };

  // thps-combo-lines/src/render.js
  function createRenderer(canvas2, ctx2) {
    let width = 0;
    let height = 0;
    let dpr = 1;
    function resize2(next) {
      width = Math.max(1, Math.floor(next.width));
      height = Math.max(1, Math.floor(next.height));
      dpr = Math.max(1, next.dpr || 1);
      ctx2.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function render(frameState = {}) {
      drawBackdrop(ctx2, width, height, frameState);
      drawWorld(ctx2, width, height, frameState);
      drawSkater(ctx2, width, height, frameState);
      drawHud(ctx2, width, height, frameState);
      drawComboCallouts(ctx2, width, height, frameState);
      drawOverlayHints(ctx2, width, height, frameState);
    }
    return { resize: resize2, render };
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
  function drawBackdrop(ctx2, width, height, frameState) {
    const layout = getWorldLayout(width, height, frameState);
    const sky = ctx2.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, "#0c1324");
    sky.addColorStop(0.6, "#151f33");
    sky.addColorStop(1, "#1d1525");
    ctx2.fillStyle = sky;
    ctx2.fillRect(0, 0, width, height);
    ctx2.fillStyle = "rgba(255,255,255,0.05)";
    ctx2.fillRect(0, worldY(layout, layout.groundY - 12), width, height - worldY(layout, layout.groundY - 12));
    const trailY = worldY(layout, layout.groundY - 24);
    ctx2.strokeStyle = "rgba(120, 214, 255, 0.24)";
    ctx2.lineWidth = 2;
    ctx2.beginPath();
    ctx2.moveTo(worldX(layout, 16), trailY + 8);
    ctx2.lineTo(worldX(layout, 390), trailY - 18);
    ctx2.lineTo(worldX(layout, 720), trailY + 3);
    ctx2.lineTo(worldX(layout, 910), trailY + 14);
    ctx2.stroke();
    if (frameState.manuals) {
      ctx2.fillStyle = "rgba(255,255,255,0.08)";
      for (const manual of frameState.manuals) {
        ctx2.fillRect(
          worldX(layout, manual.screenX),
          worldY(layout, manual.screenY),
          manual.w * layout.scale,
          manual.h * layout.scale
        );
      }
    }
  }
  function drawWorld(ctx2, width, height, frameState) {
    const layout = getWorldLayout(width, height, frameState);
    const groundY = worldY(layout, layout.groundY);
    ctx2.fillStyle = "#0d0f14";
    ctx2.fillRect(0, groundY, width, height - groundY);
    ctx2.strokeStyle = "rgba(255,255,255,0.12)";
    ctx2.lineWidth = 4;
    ctx2.beginPath();
    ctx2.moveTo(0, groundY);
    ctx2.lineTo(width, groundY);
    ctx2.stroke();
    const rails2 = frameState.rails ?? [];
    ctx2.fillStyle = "rgba(180, 204, 255, 0.6)";
    for (const rail of rails2) {
      ctx2.fillRect(
        worldX(layout, rail.screenX),
        worldY(layout, rail.screenY),
        rail.w * layout.scale,
        rail.h * layout.scale
      );
    }
    const ramps2 = frameState.ramps ?? [];
    ctx2.fillStyle = "#ffcf6b";
    for (const ramp of ramps2) {
      ctx2.beginPath();
      ctx2.moveTo(worldX(layout, ramp.screenX), worldY(layout, ramp.screenY + ramp.h));
      ctx2.lineTo(worldX(layout, ramp.screenX + ramp.w), worldY(layout, ramp.screenY + ramp.h));
      ctx2.lineTo(worldX(layout, ramp.screenX + ramp.w), worldY(layout, ramp.screenY));
      ctx2.closePath();
      ctx2.fill();
    }
    const pickups2 = frameState.pickups ?? [];
    for (const pickup of pickups2) {
      if (pickup.taken) continue;
      ctx2.fillStyle = "#7ce0ff";
      ctx2.beginPath();
      ctx2.arc(
        worldX(layout, pickup.screenX),
        worldY(layout, pickup.screenY),
        pickup.radius * layout.scale,
        0,
        Math.PI * 2
      );
      ctx2.fill();
    }
    const gates = frameState.finishGates ?? [];
    for (const gate of gates) {
      ctx2.fillStyle = gate.active ? "rgba(124, 224, 255, 0.7)" : "rgba(255, 255, 255, 0.14)";
      ctx2.fillRect(
        worldX(layout, gate.screenX),
        worldY(layout, gate.screenY),
        gate.w * layout.scale,
        gate.h * layout.scale
      );
    }
  }
  function drawSkater(ctx2, width, height, frameState) {
    const layout = getWorldLayout(width, height, frameState);
    const x = worldX(layout, frameState.skater?.x ?? 220);
    const y = worldY(layout, frameState.skater?.y ?? layout.groundY);
    const boardW = (frameState.skater?.w ?? 64) * layout.scale;
    const boardH = Math.max(8, (frameState.skater?.h ?? 12) * 0.22 * layout.scale);
    ctx2.save();
    ctx2.translate(x, y);
    ctx2.rotate((frameState.skater?.angle ?? 0) * Math.PI / 180);
    ctx2.fillStyle = "#ffe08a";
    ctx2.fillRect(-boardW * 0.5, -boardH * 0.5, boardW, boardH);
    ctx2.fillStyle = "#f3f7ff";
    ctx2.fillRect(-10 * layout.scale, -42 * layout.scale, 20 * layout.scale, 34 * layout.scale);
    ctx2.restore();
  }
  function drawHud(ctx2, width, height, frameState) {
    ctx2.fillStyle = "#f8fbff";
    ctx2.font = "700 18px system-ui, sans-serif";
    ctx2.textBaseline = "top";
    ctx2.fillText(`Score ${Math.round(frameState.score ?? 0)}`, 20, 18);
    ctx2.fillText(`Combo x${Math.round(frameState.combo ?? 1)}`, 20, 42);
    ctx2.fillText(`Time ${Math.ceil(frameState.timer ?? 0)}`, width - 150, 18);
    ctx2.fillText(`Speed ${Math.round(frameState.speed ?? 0)}`, width - 150, 42);
    ctx2.fillText(`Target ${Math.round(frameState.targetScore ?? 0)}`, width - 180, 66);
    ctx2.fillText(`Lines ${frameState.goalsCompleted ?? 0}/${frameState.goalCount ?? 0}`, width - 180, 90);
  }
  function drawComboCallouts(ctx2, width, height, frameState) {
    const comboText = frameState.comboCallout;
    if (!comboText) return;
    ctx2.fillStyle = "rgba(10, 17, 30, 0.82)";
    ctx2.fillRect(width * 0.32, height * 0.12, width * 0.36, 56);
    ctx2.strokeStyle = "rgba(120, 214, 255, 0.7)";
    ctx2.strokeRect(width * 0.32, height * 0.12, width * 0.36, 56);
    ctx2.fillStyle = "#ffffff";
    ctx2.font = "700 22px system-ui, sans-serif";
    ctx2.textAlign = "center";
    ctx2.fillText(comboText, width * 0.5, height * 0.12 + 16);
    ctx2.textAlign = "start";
  }
  function drawOverlayHints(ctx2, width, height, frameState) {
    if (frameState.state === "playing") return;
    ctx2.fillStyle = "rgba(0,0,0,0.22)";
    ctx2.fillRect(0, 0, width, height);
  }

  // thps-combo-lines/src/main.js
  var canvas = document.getElementById("gameCanvas");
  var app = document.getElementById("app");
  var hudScore = document.getElementById("hudScore");
  var hudSpeed = document.getElementById("hudSpeed");
  var hudCombo = document.getElementById("hudCombo");
  var hudLine = document.getElementById("hudLine");
  var hudGoal = document.getElementById("hudGoal");
  var overlay = document.getElementById("overlay");
  var overlayEyebrow = document.getElementById("overlayEyebrow");
  var overlayTitle = document.getElementById("overlayTitle");
  var overlayCopy = document.getElementById("overlayCopy");
  var overlayStart = document.getElementById("overlayStart");
  var overlayRestart = document.getElementById("overlayRestart");
  if (!canvas || !app || !hudScore || !hudSpeed || !hudCombo || !hudLine || !hudGoal || !overlay || !overlayEyebrow || !overlayTitle || !overlayCopy || !overlayStart || !overlayRestart) {
    throw new Error("Missing shell nodes");
  }
  var ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas context unavailable");
  }
  var game = new Game();
  var renderer = createRenderer(canvas, ctx);
  var input = createInputState();
  var lastTime = performance.now();
  overlayStart.addEventListener("click", () => triggerStart());
  overlayRestart.addEventListener("click", () => triggerRestart());
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", clearInput);
  window.addEventListener("resize", resize);
  resize();
  syncShell(game.getFrameState());
  requestAnimationFrame(step);
  function createInputState() {
    return {
      start: false,
      restart: false,
      left: false,
      right: false,
      up: false,
      down: false,
      grind: false,
      jump: false
    };
  }
  function normalizeKey(event) {
    return event.code || event.key || "";
  }
  function clearInput() {
    for (const key of Object.keys(input)) {
      input[key] = false;
    }
  }
  function resize() {
    const width = Math.max(320, Math.floor(window.innerWidth));
    const height = Math.max(240, Math.floor(window.innerHeight));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    renderer.resize({ width, height, dpr });
    game.resize(width, height);
  }
  function triggerStart() {
    input.start = true;
  }
  function triggerRestart() {
    input.restart = true;
  }
  function onKeyDown(event) {
    const key = normalizeKey(event);
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space", "Enter", "KeyZ", "KeyX", "KeyR"].includes(key)) {
      event.preventDefault();
    }
    if (event.repeat && key !== "KeyR") {
      return;
    }
    switch (key) {
      case "ArrowLeft":
      case "KeyA":
        input.left = true;
        break;
      case "ArrowRight":
      case "KeyD":
        input.right = true;
        break;
      case "ArrowUp":
      case "KeyW":
        input.up = true;
        break;
      case "ArrowDown":
      case "KeyS":
        input.down = true;
        break;
      case "Space":
      case "KeyZ":
        input.jump = true;
        break;
      case "KeyX":
        input.grind = true;
        break;
      case "Enter":
        triggerStart();
        break;
      case "KeyR":
        triggerRestart();
        break;
      default:
        break;
    }
  }
  function onKeyUp(event) {
    switch (normalizeKey(event)) {
      case "ArrowLeft":
      case "KeyA":
        input.left = false;
        break;
      case "ArrowRight":
      case "KeyD":
        input.right = false;
        break;
      case "ArrowUp":
      case "KeyW":
        input.up = false;
        break;
      case "ArrowDown":
      case "KeyS":
        input.down = false;
        break;
      case "Space":
      case "KeyZ":
        input.jump = false;
        break;
      case "KeyX":
        input.grind = false;
        break;
      default:
        break;
    }
  }
  function step(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1e3 || 1 / 60);
    lastTime = now;
    game.update?.(dt, input);
    const frameState = game.getFrameState();
    renderer.render(frameState);
    syncShell(frameState);
    input.start = false;
    input.restart = false;
    requestAnimationFrame(step);
  }
  function syncShell(frameState = {}) {
    const state = frameState.state ?? frameState.mode ?? "menu";
    app.dataset.state = state;
    overlay.hidden = state === "playing" || state === "play" || state === "run";
    hudScore.textContent = formatNumber(frameState.score ?? 0);
    hudSpeed.textContent = formatNumber(frameState.speed ?? 0);
    hudCombo.textContent = frameState.combo ? `x${formatNumber(frameState.combo)}` : "x1";
    hudLine.textContent = frameState.lineName ?? frameState.message ?? "Idle";
    hudGoal.textContent = frameState.goalLabel ?? frameState.goalProgress ?? "Build score";
    overlayEyebrow.textContent = frameState.overlayEyebrow ?? (state === "playing" ? "Line live" : "Skate line");
    overlayTitle.textContent = frameState.overlayTitle ?? "Combo Lines";
    overlayCopy.textContent = frameState.overlayCopy ?? (state === "playing" ? frameState.goalCopy ?? "Chain manuals, grinds, and gaps before the line drops." : "Press Start or Enter to drop in.");
  }
  function formatNumber(value) {
    return Number.isFinite(value) ? String(Math.round(value)) : "0";
  }
})();
