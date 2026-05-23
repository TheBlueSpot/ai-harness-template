import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  ATTACK_INPUTS,
  GROUND_Y,
  INPUT_BUFFER_FRAMES,
  MAX_GUARD,
  MOVES,
  POST_ROUND_FRAMES,
  PRE_ROUND_FRAMES,
  ROUND_TIME,
  WIN_ROUNDS,
} from "./data.js";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const sign = (value) => (value < 0 ? -1 : 1);
const lerp = (from, to, amount) => from + (to - from) * amount;

function createFighter(id, side, x, tint) {
  return {
    id,
    side,
    x,
    y: GROUND_Y,
    vx: 0,
    vy: 0,
    width: 76,
    height: 164,
    crouchHeight: 116,
    color: tint,
    face: side === "left" ? 1 : -1,
    onGround: true,
    crouching: false,
    walkSpeed: 4.4,
    jumpPower: 16,
    gravity: 0.92,
    pushbox: 36,
    hurtbox: { x: -28, y: -148, width: 56, height: 148 },
    crouchHurtbox: { x: -30, y: -104, width: 60, height: 102 },
    currentMove: null,
    attackFrame: 0,
    attackConnected: false,
    cancelWindow: null,
    state: "idle",
    stateFrames: 0,
    stunFrames: 0,
    guard: MAX_GUARD,
    health: 100,
    wins: 0,
    hitstop: 0,
    flashFrames: 0,
    shake: 0,
    combo: 0,
    lastHitType: "none",
    input: {
      left: false,
      right: false,
      up: false,
      down: false,
    },
    buffer: [],
    recentActions: [],
    aiBrain: {
      cooldown: 0,
      lastDecision: "wait",
      jumpPunishBias: 0,
      lowBlockBias: 0,
    },
  };
}

function createProjectile(owner, move) {
  return {
    owner,
    label: move.label,
    x: owner.x + owner.face * 72,
    y: owner.y - 92,
    width: move.projectile.width,
    height: move.projectile.height,
    vx: owner.face * move.projectile.speed,
    life: move.projectile.life,
    moveId: move.id,
    damage: move.damage,
    hitstun: move.hitstun,
    blockstun: move.blockstun,
    guardDamage: move.guardDamage,
    pushback: move.pushback,
    hitLevel: move.hitLevel,
  };
}

export class Game {
  constructor() {
    this.canvasWidth = ARENA_WIDTH;
    this.canvasHeight = ARENA_HEIGHT;
    this.debugHitboxes = false;
    this.restart();
  }

  restart() {
    this.frame = 0;
    this.state = "menu";
    this.round = 1;
    this.roundTimer = ROUND_TIME * 60;
    this.roundIntroFrames = PRE_ROUND_FRAMES;
    this.roundOutroFrames = 0;
    this.roundWinner = null;
    this.projectiles = [];
    this.hitEffects = [];
    this.camera = { x: 0, shake: 0 };
    this.message = "Read the spacing.";
    this.frameText = "Neutral";
    this.player = createFighter("player", "left", 360, "#35f2ff");
    this.enemy = createFighter("enemy", "right", 920, "#ff7a66");
    this.enemy.aiBrain.cooldown = 40;
    this.syncFacing();
  }

  start() {
    if (this.state === "menu") {
      this.beginRound(true);
    }
  }

  toggleDebug() {
    this.debugHitboxes = !this.debugHitboxes;
    this.message = this.debugHitboxes ? "Hitbox debug enabled." : "Hitbox debug hidden.";
  }

  resize(width, height) {
    this.canvasWidth = width;
    this.canvasHeight = height;
  }

  getFrameState() {
    return {
      appState: this.state,
      debugHitboxes: this.debugHitboxes,
      round: this.round,
      timer: Math.ceil(this.roundTimer / 60),
      message: this.message,
      frameText: this.frameText,
      player: this.describeFighter(this.player),
      enemy: this.describeFighter(this.enemy),
      result:
        this.state === "finished"
          ? {
              eyebrow: this.player.wins > this.enemy.wins ? "player wins" : "ai rival wins",
              title: this.player.wins > this.enemy.wins ? "Set point secured." : "The rival closed it out.",
              copy: "Press restart to start another best-of-three set.",
            }
          : null,
    };
  }

  describeFighter(fighter) {
    return {
      health: fighter.health,
      guard: fighter.guard,
      wins: fighter.wins,
      state: this.describeState(fighter),
      combo: fighter.combo,
    };
  }

  describeState(fighter) {
    if (fighter.state === "attack" && fighter.currentMove) {
      return `${fighter.currentMove.label} f${fighter.attackFrame}`;
    }
    if (fighter.state === "hitstun") {
      return `Hitstun ${fighter.stunFrames}`;
    }
    if (fighter.state === "blockstun") {
      return `Blockstun ${fighter.stunFrames}`;
    }
    if (fighter.state === "jump") {
      return "Jump";
    }
    if (fighter.crouching) {
      return "Crouch";
    }
    return fighter.state[0].toUpperCase() + fighter.state.slice(1);
  }

  update(dt, input) {
    const step = dt > 0 ? dt : 1 / 60;
    const frames = Math.max(1, Math.round(step * 60));
    for (let i = 0; i < frames; i += 1) {
      this.step(input);
    }
  }

  step(input) {
    this.frame += 1;
    this.consumeMetaInput(input);

    if (this.state === "menu") {
      this.capturePlayerInput(input);
      return;
    }

    if (this.state === "finished") {
      this.capturePlayerInput(input);
      return;
    }

    this.capturePlayerInput(input);
    this.runAi();

    if (this.roundIntroFrames > 0) {
      this.roundIntroFrames -= 1;
      this.message = this.roundIntroFrames > 40 ? `Round ${this.round}` : "Fight";
      this.applyPassiveDecay();
      return;
    }

    if (this.roundOutroFrames > 0) {
      this.roundOutroFrames -= 1;
      this.applyPassiveDecay();
      if (this.roundOutroFrames === 0) {
        this.finishRoundTransition();
      }
      return;
    }

    this.roundTimer = Math.max(0, this.roundTimer - 1);
    this.player.distance = Math.abs(this.enemy.x - this.player.x);
    this.enemy.distance = this.player.distance;

    this.updateFighter(this.player, this.enemy);
    this.updateFighter(this.enemy, this.player);
    this.resolvePushboxes();
    this.updateProjectiles();
    this.updateEffects();
    this.syncFacing();
    this.updateFrameReadout();
    this.checkRoundEnd();
    this.applyPassiveDecay();
  }

  applyPassiveDecay() {
    this.player.flashFrames = Math.max(0, this.player.flashFrames - 1);
    this.enemy.flashFrames = Math.max(0, this.enemy.flashFrames - 1);
    this.camera.shake = Math.max(0, this.camera.shake - 1);
  }

  consumeMetaInput(input) {
    if (input.pressed.start || input.pressed.enter) {
      if (this.state === "menu") {
        this.beginRound(true);
      }
    }
    if (input.pressed.restart) {
      this.restart();
      this.beginRound(true);
    }
    if (input.pressed.debug) {
      this.toggleDebug();
    }
  }

  beginRound(resetScores) {
    if (resetScores) {
      this.player.wins = 0;
      this.enemy.wins = 0;
      this.round = 1;
    }
    this.state = "playing";
    this.roundTimer = ROUND_TIME * 60;
    this.roundIntroFrames = PRE_ROUND_FRAMES;
    this.roundOutroFrames = 0;
    this.roundWinner = null;
    this.projectiles = [];
    this.hitEffects = [];
    this.message = `Round ${this.round}`;
    this.resetFighterForRound(this.player, 360);
    this.resetFighterForRound(this.enemy, 920);
    this.syncFacing();
  }

  resetFighterForRound(fighter, x) {
    fighter.x = x;
    fighter.y = GROUND_Y;
    fighter.vx = 0;
    fighter.vy = 0;
    fighter.face = fighter.side === "left" ? 1 : -1;
    fighter.onGround = true;
    fighter.crouching = false;
    fighter.currentMove = null;
    fighter.attackFrame = 0;
    fighter.attackConnected = false;
    fighter.cancelWindow = null;
    fighter.state = "idle";
    fighter.stateFrames = 0;
    fighter.stunFrames = 0;
    fighter.guard = MAX_GUARD;
    fighter.health = 100;
    fighter.hitstop = 0;
    fighter.flashFrames = 0;
    fighter.shake = 0;
    fighter.combo = 0;
    fighter.lastHitType = "none";
    fighter.buffer = [];
    fighter.recentActions = [];
  }

  finishRoundTransition() {
    if (this.player.wins >= WIN_ROUNDS || this.enemy.wins >= WIN_ROUNDS) {
      this.state = "finished";
      this.message = this.player.wins > this.enemy.wins ? "Set to player." : "Set to rival.";
      return;
    }
    this.round += 1;
    this.beginRound(false);
  }

  capturePlayerInput(input) {
    this.player.input.left = input.down.left;
    this.player.input.right = input.down.right;
    this.player.input.up = input.down.up;
    this.player.input.down = input.down.down;

    if (input.pressed.light) {
      this.queueAction(this.player, "light");
    }
    if (input.pressed.medium) {
      this.queueAction(this.player, "medium");
    }
    if (input.pressed.heavy) {
      this.queueAction(this.player, "heavy");
    }
    if (input.pressed.up) {
      this.rememberAction(this.player, "jump");
    }
    if (input.down.down) {
      this.rememberAction(this.player, "crouch");
    }
    if (this.isBlocking(this.player, this.enemy)) {
      this.rememberAction(this.player, "block");
    }
  }

  queueAction(fighter, button) {
    fighter.buffer.push({ button, frame: this.frame });
    fighter.buffer = fighter.buffer.filter((entry) => this.frame - entry.frame <= INPUT_BUFFER_FRAMES);
  }

  rememberAction(fighter, action) {
    fighter.recentActions.push({ action, frame: this.frame });
    fighter.recentActions = fighter.recentActions.filter((entry) => this.frame - entry.frame <= 240);
  }

  runAi() {
    const ai = this.enemy;
    const opponent = this.player;
    ai.input.left = false;
    ai.input.right = false;
    ai.input.up = false;
    ai.input.down = false;

    if (this.state !== "playing" || this.roundIntroFrames > 0 || this.roundOutroFrames > 0) {
      return;
    }

    ai.aiBrain.cooldown = Math.max(0, ai.aiBrain.cooldown - 1);
    const spacing = Math.abs(opponent.x - ai.x);
    const playerJumps = this.countRecent(opponent, "jump");
    const playerBlocks = this.countRecent(opponent, "block");
    const playerCrouches = this.countRecent(opponent, "crouch");
    ai.aiBrain.jumpPunishBias = playerJumps;
    ai.aiBrain.lowBlockBias = playerCrouches + playerBlocks;

    if (ai.state === "hitstun" || ai.state === "blockstun") {
      if (this.isAwayPressed(ai, opponent)) {
        ai.input[opponent.x > ai.x ? "left" : "right"] = true;
      }
      return;
    }

    if (this.player.state === "attack" && spacing < 110 && ai.onGround) {
      ai.input[opponent.x > ai.x ? "left" : "right"] = true;
      if (opponent.currentMove?.hitLevel === "low") {
        ai.input.down = true;
      }
      return;
    }

    if (ai.aiBrain.cooldown > 0 && ai.state === "attack") {
      return;
    }

    const frameAdvantage = this.getAdvantage(ai, opponent);

    if (!ai.onGround) {
      ai.input[opponent.x > ai.x ? "right" : "left"] = true;
      return;
    }

    if (playerJumps >= 2 && spacing < 150 && ai.state === "idle") {
      ai.input.up = true;
      this.queueAction(ai, "light");
      ai.aiBrain.lastDecision = "anti-air";
      ai.aiBrain.cooldown = 12;
      return;
    }

    if (frameAdvantage > 2 && spacing < 140) {
      if (playerCrouches >= 3) {
        this.queueAction(ai, "medium");
        ai.aiBrain.lastDecision = "overhead";
      } else {
        this.queueAction(ai, "light");
        ai.aiBrain.lastDecision = "pressure";
      }
      ai.aiBrain.cooldown = 8;
      return;
    }

    if (spacing > 250) {
      if (this.frame % 60 < 18) {
        this.queueAction(ai, "heavy");
        ai.aiBrain.lastDecision = "fireball";
        ai.aiBrain.cooldown = 18;
      } else {
        ai.input[opponent.x > ai.x ? "right" : "left"] = true;
        ai.aiBrain.lastDecision = "walk-in";
      }
      return;
    }

    if (spacing > 142) {
      ai.input[opponent.x > ai.x ? "right" : "left"] = true;
      if (frameAdvantage >= 0 && this.frame % 45 === 0) {
        this.queueAction(ai, "heavy");
        ai.aiBrain.lastDecision = "step-kick";
        ai.aiBrain.cooldown = 15;
      }
      return;
    }

    if (spacing < 92 && frameAdvantage < 0) {
      ai.input[opponent.x > ai.x ? "left" : "right"] = true;
      ai.input.down = playerBlocks > 2;
      ai.aiBrain.lastDecision = "back-off";
      return;
    }

    if (playerBlocks >= 4 && spacing < 140) {
      this.queueAction(ai, "medium");
      ai.aiBrain.lastDecision = "guard-break";
      ai.aiBrain.cooldown = 14;
      return;
    }

    this.queueAction(ai, "light");
    ai.aiBrain.lastDecision = "poke";
    ai.aiBrain.cooldown = 10;
  }

  countRecent(fighter, action) {
    return fighter.recentActions.filter((entry) => entry.action === action).length;
  }

  updateFighter(fighter, opponent) {
    fighter.stateFrames += 1;
    fighter.distance = Math.abs(opponent.x - fighter.x);

    if (fighter.hitstop > 0) {
      fighter.hitstop -= 1;
      return;
    }

    if (fighter.state === "hitstun" || fighter.state === "blockstun") {
      fighter.stunFrames -= 1;
      fighter.vx *= 0.85;
      fighter.x += fighter.vx;
      if (fighter.stunFrames <= 0) {
        fighter.state = "idle";
        fighter.stateFrames = 0;
      }
      this.applyVerticalPhysics(fighter);
      return;
    }

    if (fighter.state === "attack") {
      this.updateAttackState(fighter, opponent);
      this.applyVerticalPhysics(fighter);
      fighter.x += fighter.vx;
      fighter.vx *= fighter.onGround ? 0.78 : 0.92;
      return;
    }

    this.tryConsumeBuffer(fighter, opponent);

    if (fighter.state !== "attack") {
      this.applyMovement(fighter, opponent);
      this.tryConsumeBuffer(fighter, opponent);
    }

    this.applyVerticalPhysics(fighter);
    fighter.x += fighter.vx;
    fighter.vx *= fighter.onGround ? 0.7 : 0.92;
    fighter.x = clamp(fighter.x, 90, ARENA_WIDTH - 90);
  }

  applyMovement(fighter, opponent) {
    const toward = opponent.x > fighter.x ? 1 : -1;
    const forwardHeld = toward === -1 ? fighter.input.left : fighter.input.right;
    const backwardHeld = toward === -1 ? fighter.input.right : fighter.input.left;

    fighter.crouching = fighter.onGround && fighter.input.down;
    fighter.face = toward;

    if (fighter.onGround && fighter.input.up) {
      fighter.vy = -fighter.jumpPower;
      fighter.onGround = false;
      fighter.state = "jump";
      fighter.stateFrames = 0;
    }

    if (fighter.state === "jump" && fighter.onGround) {
      fighter.state = "idle";
    }

    if (fighter.onGround) {
      if (forwardHeld) {
        fighter.vx += fighter.walkSpeed * 0.68;
        fighter.state = fighter.crouching ? "crouch-walk" : "walk";
      } else if (backwardHeld) {
        fighter.vx -= toward * fighter.walkSpeed * 0.58;
        fighter.state = fighter.crouching ? "crouch-block" : "walk";
      } else {
        fighter.state = fighter.crouching ? "crouch" : "idle";
      }
    }
  }

  tryConsumeBuffer(fighter, opponent) {
    fighter.buffer = fighter.buffer.filter((entry) => this.frame - entry.frame <= INPUT_BUFFER_FRAMES);
    if (fighter.buffer.length === 0) {
      return;
    }

    const next = fighter.buffer[0];
    const move = this.selectMove(next.button, fighter, opponent);
    if (!move) {
      fighter.buffer.shift();
      return;
    }

    const canCancel = fighter.state === "attack" && this.canCancelInto(fighter, next.button);
    const canAct =
      fighter.state === "idle" ||
      fighter.state === "walk" ||
      fighter.state === "crouch" ||
      fighter.state === "jump" ||
      fighter.state === "crouch-walk" ||
      fighter.state === "crouch-block" ||
      canCancel;

    if (!canAct) {
      return;
    }

    fighter.buffer.shift();
    this.startMove(fighter, move, canCancel);
  }

  selectMove(button, fighter, opponent) {
    const choices = ATTACK_INPUTS[button];
    if (!choices) {
      return null;
    }
    for (const choice of choices) {
      if (choice.when(fighter, opponent)) {
        return MOVES[choice.id];
      }
    }
    return null;
  }

  canCancelInto(fighter, button) {
    if (!fighter.currentMove || !fighter.cancelWindow) {
      return false;
    }
    const lists = fighter.attackConnected ? fighter.currentMove.cancelOnHit : fighter.currentMove.cancelOnBlock;
    const buttonToTags = {
      light: ["light"],
      medium: ["medium"],
      heavy: ["heavy", "special"],
    };
    return buttonToTags[button].some((tag) => lists.includes(tag));
  }

  startMove(fighter, move, canceled) {
    fighter.currentMove = move;
    fighter.attackFrame = 0;
    fighter.attackConnected = false;
    fighter.cancelWindow = null;
    fighter.state = "attack";
    fighter.stateFrames = 0;
    fighter.crouching = move.hitLevel === "low";
    if (canceled) {
      fighter.message = `${move.label} cancel`;
    }
    this.rememberAction(fighter, move.id);
  }

  updateAttackState(fighter, opponent) {
    const move = fighter.currentMove;
    fighter.attackFrame += 1;
    fighter.vx += fighter.face * (move.velocity || 0);

    const activeStart = move.startup;
    const activeEnd = move.startup + move.active - 1;
    const recoveryEnd = move.startup + move.active + move.recovery;
    fighter.cancelWindow =
      fighter.attackFrame >= move.cancelWindowStart && fighter.attackFrame <= move.cancelWindowEnd;

    if (fighter.attackFrame >= activeStart && fighter.attackFrame <= activeEnd) {
      this.resolveAttackHit(fighter, opponent, move);
      if (move.projectile && fighter.attackFrame === activeStart) {
        this.projectiles.push(createProjectile(fighter, move));
      }
    }

    if (fighter.attackFrame >= recoveryEnd) {
      fighter.currentMove = null;
      fighter.state = fighter.onGround ? "idle" : "jump";
      fighter.attackFrame = 0;
      fighter.attackConnected = false;
      fighter.cancelWindow = null;
    }
  }

  resolveAttackHit(attacker, defender, move) {
    if (defender.flashFrames > 0 && attacker.attackConnected) {
      return;
    }

    const hitbox = this.getHitbox(attacker, move);
    const hurtbox = this.getHurtbox(defender);
    if (!this.boxesOverlap(hitbox, hurtbox)) {
      return;
    }

    if (move.antiAirOnly && defender.onGround) {
      return;
    }

    const blocked = this.isBlocking(defender, attacker) && this.isBlockValid(defender, move);
    attacker.attackConnected = true;

    if (blocked) {
      this.applyBlock(attacker, defender, move);
    } else {
      this.applyHit(attacker, defender, move);
    }
  }

  updateProjectiles() {
    const remaining = [];
    for (const projectile of this.projectiles) {
      const defender = projectile.owner === this.player ? this.enemy : this.player;
      projectile.x += projectile.vx;
      projectile.life -= 1;
      if (projectile.life <= 0 || projectile.x < -80 || projectile.x > ARENA_WIDTH + 80) {
        continue;
      }

      const box = {
        left: projectile.x - projectile.width / 2,
        right: projectile.x + projectile.width / 2,
        top: projectile.y - projectile.height / 2,
        bottom: projectile.y + projectile.height / 2,
      };
      const hurtbox = this.getHurtbox(defender);

      if (this.boxesOverlap(box, hurtbox)) {
        const blocked = this.isBlocking(defender, projectile.owner) && this.isBlockValid(defender, projectile);
        if (blocked) {
          this.applyBlock(projectile.owner, defender, projectile, true);
        } else {
          this.applyHit(projectile.owner, defender, projectile, true);
        }
        continue;
      }
      remaining.push(projectile);
    }
    this.projectiles = remaining;
  }

  applyBlock(attacker, defender, move, projectile = false) {
    defender.state = "blockstun";
    defender.stateFrames = 0;
    defender.stunFrames = move.blockstun;
    defender.flashFrames = 6;
    defender.guard = clamp(defender.guard - move.guardDamage, 0, MAX_GUARD);
    defender.vx = attacker.face * move.pushback * 0.28;
    attacker.vx = -attacker.face * move.pushback * 0.08;
    attacker.hitstop = projectile ? 3 : 4;
    defender.hitstop = projectile ? 3 : 4;
    this.message = `${attacker.id === "player" ? "You" : "Rival"} forced block with ${move.label}.`;
    this.frameText = `${attacker.id === "player" ? "Player" : "Rival"} +${Math.max(1, move.blockstun - move.recovery)} on block buffer`;
    this.addHitEffect(defender, "#7de1ff", "BLOCK");
  }

  applyHit(attacker, defender, move, projectile = false) {
    defender.state = "hitstun";
    defender.stateFrames = 0;
    defender.stunFrames = move.hitstun;
    defender.flashFrames = 10;
    defender.health = clamp(defender.health - move.damage, 0, 100);
    defender.vx = attacker.face * move.pushback * 0.35;
    defender.vy = move.hitLevel === "antiAir" ? -8.5 : defender.vy;
    defender.onGround = move.hitLevel === "antiAir" ? false : defender.onGround;
    attacker.hitstop = projectile ? 4 : 5;
    defender.hitstop = projectile ? 4 : 5;
    attacker.combo += 1;
    defender.combo = 0;
    defender.lastHitType = move.hitLevel;
    this.camera.shake = 8;
    this.message = `${attacker.id === "player" ? "You" : "Rival"} landed ${move.label}.`;
    this.frameText = `${attacker.id === "player" ? "Player" : "Rival"} confirm: ${move.hitstun - move.recovery}f`;
    this.addHitEffect(defender, "#ffd166", `${move.damage}`);
  }

  addHitEffect(defender, color, label) {
    this.hitEffects.push({
      x: defender.x,
      y: defender.y - 132,
      color,
      label,
      life: 24,
    });
  }

  updateEffects() {
    this.hitEffects = this.hitEffects
      .map((effect) => ({ ...effect, y: effect.y - 1.3, life: effect.life - 1 }))
      .filter((effect) => effect.life > 0);
  }

  getHitbox(fighter, move) {
    const left = fighter.x + fighter.face * move.offsetX - (fighter.face < 0 ? move.width : 0);
    return {
      left,
      right: left + move.width,
      top: fighter.y + move.offsetY,
      bottom: fighter.y + move.offsetY + move.height,
    };
  }

  getHurtbox(fighter) {
    const source = fighter.crouching && fighter.onGround ? fighter.crouchHurtbox : fighter.hurtbox;
    return {
      left: fighter.x + source.x,
      right: fighter.x + source.x + source.width,
      top: fighter.y + source.y,
      bottom: fighter.y + source.y + source.height,
    };
  }

  boxesOverlap(a, b) {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  }

  isBlocking(defender, attacker) {
    if (!defender.onGround) {
      return false;
    }
    return this.isAwayPressed(defender, attacker);
  }

  isAwayPressed(defender, attacker) {
    const awayKey = attacker.x > defender.x ? "left" : "right";
    return !!defender.input[awayKey];
  }

  isBlockValid(defender, move) {
    if (move.hitLevel === "overhead") {
      return !defender.input.down;
    }
    if (move.hitLevel === "low") {
      return defender.input.down;
    }
    return true;
  }

  applyVerticalPhysics(fighter) {
    if (!fighter.onGround) {
      fighter.vy += fighter.gravity;
      fighter.y += fighter.vy;
      if (fighter.y >= GROUND_Y) {
        fighter.y = GROUND_Y;
        fighter.vy = 0;
        fighter.onGround = true;
        if (fighter.state === "jump") {
          fighter.state = "idle";
        }
      }
    }
  }

  resolvePushboxes() {
    const distance = Math.abs(this.player.x - this.enemy.x);
    const minDistance = this.player.pushbox + this.enemy.pushbox;
    if (distance >= minDistance) {
      return;
    }
    const overlap = minDistance - distance;
    const direction = this.player.x < this.enemy.x ? -1 : 1;
    this.player.x += direction * overlap * 0.5;
    this.enemy.x -= direction * overlap * 0.5;
    this.player.x = clamp(this.player.x, 80, ARENA_WIDTH - 80);
    this.enemy.x = clamp(this.enemy.x, 80, ARENA_WIDTH - 80);
  }

  syncFacing() {
    this.player.face = sign(this.enemy.x - this.player.x);
    this.enemy.face = sign(this.player.x - this.enemy.x);
    this.camera.x = lerp(this.camera.x, (this.player.x + this.enemy.x) * 0.5 - ARENA_WIDTH * 0.5, 0.1);
  }

  getAdvantage(fighter, opponent) {
    const selfLocked = fighter.state === "attack" ? Math.max(0, fighter.currentMove.startup + fighter.currentMove.active + fighter.currentMove.recovery - fighter.attackFrame) : fighter.stunFrames;
    const otherLocked = opponent.state === "attack" ? Math.max(0, opponent.currentMove.startup + opponent.currentMove.active + opponent.currentMove.recovery - opponent.attackFrame) : opponent.stunFrames;
    return otherLocked - selfLocked;
  }

  updateFrameReadout() {
    const spacing = Math.round(Math.abs(this.player.x - this.enemy.x));
    const playerAdv = this.getAdvantage(this.player, this.enemy);
    const enemyAdv = this.getAdvantage(this.enemy, this.player);
    if (this.player.state === "attack" && this.player.currentMove) {
      this.frameText = `Player ${this.player.currentMove.label} ${this.player.attackFrame}/${this.player.currentMove.startup + this.player.currentMove.active + this.player.currentMove.recovery}`;
    } else if (this.enemy.state === "attack" && this.enemy.currentMove) {
      this.frameText = `Rival ${this.enemy.currentMove.label} ${this.enemy.attackFrame}/${this.enemy.currentMove.startup + this.enemy.currentMove.active + this.enemy.currentMove.recovery}`;
    } else if (playerAdv !== 0 || enemyAdv !== 0) {
      this.frameText = playerAdv >= enemyAdv ? `Player advantage ${playerAdv}f` : `Rival advantage ${enemyAdv}f`;
    } else {
      this.frameText = `Neutral at ${spacing}px`;
    }
  }

  checkRoundEnd() {
    if (this.roundOutroFrames > 0) {
      return;
    }

    if (this.player.health <= 0 || this.enemy.health <= 0 || this.roundTimer <= 0) {
      if (this.player.health === this.enemy.health) {
        this.roundWinner = this.player.guard >= this.enemy.guard ? this.player : this.enemy;
      } else {
        this.roundWinner = this.player.health > this.enemy.health ? this.player : this.enemy;
      }
      this.roundWinner.wins += 1;
      this.roundOutroFrames = POST_ROUND_FRAMES;
      this.message = this.roundWinner === this.player ? "Round to player." : "Round to rival.";
    }
  }

  render(ctx) {
    const width = this.canvasWidth;
    const height = this.canvasHeight;
    ctx.clearRect(0, 0, width, height);

    ctx.save();
    ctx.fillStyle = "#0b1020";
    ctx.fillRect(0, 0, width, height);

    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "#1c2340");
    gradient.addColorStop(1, "#090b15");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    const shakeX = this.camera.shake > 0 ? Math.sin(this.frame * 1.7) * 5 : 0;
    ctx.translate(-this.camera.x * 0.24 + shakeX, 0);

    this.drawBackdrop(ctx);
    this.drawFloor(ctx);
    this.drawFighter(ctx, this.player);
    this.drawFighter(ctx, this.enemy);
    this.drawProjectiles(ctx);
    this.drawEffects(ctx);

    if (this.debugHitboxes) {
      this.drawDebugBoxes(ctx, this.player);
      this.drawDebugBoxes(ctx, this.enemy);
    }

    ctx.restore();
  }

  drawBackdrop(ctx) {
    for (let i = 0; i < 8; i += 1) {
      const x = 120 + i * 160;
      ctx.fillStyle = i % 2 === 0 ? "rgba(255, 78, 114, 0.18)" : "rgba(53, 242, 255, 0.18)";
      ctx.fillRect(x, 180, 80, 220);
      ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
      ctx.fillRect(x + 18, 206, 16, 160);
      ctx.fillRect(x + 44, 234, 16, 132);
    }
  }

  drawFloor(ctx) {
    ctx.fillStyle = "#171821";
    ctx.fillRect(-200, GROUND_Y + 10, ARENA_WIDTH + 400, 220);

    ctx.fillStyle = "#4c1130";
    for (let i = -300; i < ARENA_WIDTH + 300; i += 88) {
      ctx.fillRect(i, GROUND_Y + 8, 48, 10);
    }

    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-200, GROUND_Y + 8);
    ctx.lineTo(ARENA_WIDTH + 200, GROUND_Y + 8);
    ctx.stroke();
  }

  drawFighter(ctx, fighter) {
    const bodyHeight = fighter.crouching && fighter.onGround ? 116 : 160;
    const bodyTop = fighter.y - bodyHeight;
    const flash = fighter.flashFrames > 0;

    ctx.save();
    ctx.translate(fighter.x, fighter.y);
    ctx.scale(fighter.face, 1);

    ctx.fillStyle = flash ? "#fff6d8" : fighter.color;
    ctx.fillRect(-28, -bodyHeight, 56, bodyHeight - 20);

    ctx.fillStyle = flash ? "#fff6d8" : "#0d1328";
    ctx.fillRect(-22, -bodyHeight + 18, 44, 38);

    ctx.fillStyle = flash ? "#fff6d8" : "#f5c99f";
    ctx.beginPath();
    ctx.arc(0, -bodyHeight - 8, 22, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#f7f7f7";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(-12, -32);
    ctx.lineTo(-24, 0);
    ctx.moveTo(12, -32);
    ctx.lineTo(20, 0);
    ctx.moveTo(-18, -86);
    ctx.lineTo(-56, -58);
    ctx.moveTo(18, -86);
    ctx.lineTo(52, -60);
    ctx.stroke();

    if (fighter.state === "attack" && fighter.currentMove) {
      const move = fighter.currentMove;
      const activeStart = move.startup;
      const activeEnd = move.startup + move.active - 1;
      if (fighter.attackFrame >= activeStart && fighter.attackFrame <= activeEnd) {
        ctx.fillStyle = "rgba(255, 240, 130, 0.32)";
        ctx.fillRect(move.offsetX - 12, move.offsetY, move.width + 12, move.height);
      }
    }

    ctx.restore();
  }

  drawProjectiles(ctx) {
    for (const projectile of this.projectiles) {
      ctx.fillStyle = projectile.owner === this.player ? "#7df7ff" : "#ff916f";
      ctx.beginPath();
      ctx.ellipse(projectile.x, projectile.y, projectile.width / 2, projectile.height / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.fillRect(projectile.x - 10, projectile.y - 2, 20, 4);
    }
  }

  drawEffects(ctx) {
    ctx.textAlign = "center";
    ctx.font = "bold 22px 'Trebuchet MS', sans-serif";
    for (const effect of this.hitEffects) {
      ctx.fillStyle = effect.color;
      ctx.globalAlpha = effect.life / 24;
      ctx.fillText(effect.label, effect.x, effect.y);
    }
    ctx.globalAlpha = 1;
  }

  drawDebugBoxes(ctx, fighter) {
    const hurtbox = this.getHurtbox(fighter);
    ctx.strokeStyle = "rgba(53, 242, 255, 0.95)";
    ctx.lineWidth = 2;
    ctx.strokeRect(hurtbox.left, hurtbox.top, hurtbox.right - hurtbox.left, hurtbox.bottom - hurtbox.top);

    if (fighter.state === "attack" && fighter.currentMove) {
      const hitbox = this.getHitbox(fighter, fighter.currentMove);
      ctx.strokeStyle = "rgba(255, 122, 102, 0.95)";
      ctx.strokeRect(hitbox.left, hitbox.top, hitbox.right - hitbox.left, hitbox.bottom - hitbox.top);
    }
  }
}
