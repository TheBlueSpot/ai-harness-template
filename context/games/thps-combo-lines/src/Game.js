import { comboRules, scoreTrick } from "./tricks.js";
import {
  getCourse,
  getFinishGates,
  getLandingZones,
  getLineGoals,
  getPickups,
  getRamps,
  getRails,
} from "./level.js";

export class Game {
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

  update(dt, input = {}) {
    this.lastInput = { ...input };
    if (input.restart) {
      this.restart();
    }
    if (input.start && this.state !== "playing") {
      this.beginRun();
    }
    if (this.state !== "playing") {
      return;
    }

    this.timeLeft = Math.max(0, this.timeLeft - dt);
    this.distance = Math.min(this.course.finishDistance, this.distance + this.speed * dt);

    this.applyInput(dt, input);
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
        groundY: this.course.groundY,
      },
      skater: {
        ...this.skater,
        worldX: this.getPlayerWorldX(),
        x: this.skaterAnchorX,
      },
      ramps: this.ramps.map((item) => this.projectWorldItem(item)),
      rails: this.rails.map((item) => this.projectWorldItem(item)),
      landingZones: this.landingZones.map((item) => this.projectWorldItem(item)),
      pickups: this.pickups.map((item) => this.projectWorldItem(item)),
      finishGates: this.finishGates.map((item) => ({
        ...this.projectWorldItem(item),
        active: this.course.runTime - this.timeLeft >= item.openAt,
      })),
      manuals: this.manualPath.map((item) => this.projectWorldItem(item)),
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
    this.overlayCopy = inMenu
      ? "Press Enter to drop into a longer street line with three trick goals."
      : "Run reset. Press Enter to start another full street line.";
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

  applyInput(dt, input) {
    const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    this.skater.vx = steer * 180;
    const accel = input.right ? 80 : input.left ? -110 : 14;
    this.speed = Math.max(150, Math.min(460, this.speed + accel * dt));
    if (input.jump && this.grounded) {
      this.jump();
    }
    this.onManual = Boolean(input.down) && this.grounded;
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
    this.overlayCopy = cleared
      ? "Target hit. Press R to run the full street line again."
      : "Target missed. Press R to retry and finish more of the named lines.";
    this.result = cleared ? "win" : "lose";
    this.resultStats = {
      score: this.score,
      combo: this.comboMultiplier,
      pickups: this.pickups.filter((pickup) => pickup.taken).length,
      goals: this.goalStates.filter((goal) => goal.completed).length,
      timeLeft: this.timeLeft,
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
      h: this.skater.h,
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
      taken: Boolean(item.taken),
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
      landing: "clean landing",
    };
    this.goalLabel = nextGoal.label;
    this.goalCopy =
      state.step === 0
        ? nextGoal.copy
        : `Keep ${nextGoal.label.toLowerCase()} alive with a ${readable[nextRequirement] ?? nextRequirement}.`;
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
}
