import { COMMAND_DETAILS, COMMANDS, ENEMY_TEMPLATES, PARTY_TEMPLATES } from "./data.js";
import { createBattleState, createResultState, createUiState } from "./state.js";
import { renderGame } from "./render.js";

const PLAYER_ATB_RATE = 34;
const ENEMY_ATB_RATE = 26;
const PLAYER_TURN_DELAY = 0.35;
const ENEMY_TURN_DELAY = 0.4;
const MAX_LOG_LINES = 6;

export class Game {
  constructor(options = {}) {
    this.options = options;
    this.width = options.width ?? 1280;
    this.height = options.height ?? 720;
    this.ctx = options.canvas?.getContext?.("2d") ?? null;
    this.frame = null;
    this.restart();
  }

  start() {
    if (this.mode === "menu") {
      this.mode = "battle";
      this.ui.overlay = "battle";
      this.ui.message = "Battle start";
      this.ui.selectionMode = "command";
      this.ui.commandIndex = 0;
      this.ui.targetIndex = 0;
      this.pushLog("Battle start");
    }
  }

  restart() {
    this.mode = "menu";
    this.time = 0;
    this.turnTimer = 0;
    this.enemyTimer = 0;
    this.turnOwner = null;
    this.pendingAction = null;
    this.result = createResultState();
    this.ui = createUiState({
      state: "menu",
      overlay: "menu",
      commandIndex: 0,
      targetIndex: 0,
      cursor: 0,
      message: "Press Start Battle",
      selectionMode: "command",
    });
    this.battle = createBattleState({
      party: PARTY_TEMPLATES,
      enemies: ENEMY_TEMPLATES,
    });
    this.log = ["Press Start Battle"];
    this.frame = this.buildFrameState();
  }

  resize(width, height) {
    this.width = width ?? this.width;
    this.height = height ?? this.height;
  }

  update(dt, input = {}) {
    const seconds = clamp(Number(dt) || 0, 0, 0.05);
    this.time += seconds;

    if (this.mode === "menu") {
      if (input.start || input.confirm) this.start();
      this.syncFrame();
      return;
    }

    if (this.mode === "victory" || this.mode === "defeat") {
      if (input.start || input.restart) this.restart();
      this.syncFrame();
      return;
    }

    this.advanceAtb(seconds);
    this.handleInput(input);
    this.resolveTurn(seconds);
    this.updateEnemies(seconds);
    this.checkVictoryDefeat();
    this.syncFrame();
  }

  render(ctx = this.ctx) {
    renderGame(ctx, this.frame);
  }

  getFrameState() {
    return this.frame;
  }

  handleInput(input) {
    const commandCount = COMMANDS.length;
    const livingEnemies = this.getAliveEnemies();

    if (input.cancel && this.ui.selectionMode !== "command") {
      this.ui.selectionMode = "command";
      this.ui.message = "Command canceled";
      this.pendingAction = null;
      this.turnOwner = null;
      return;
    }

    if (this.ui.selectionMode === "command") {
      if (input.up) this.ui.commandIndex = wrapIndex(this.ui.commandIndex - 1, commandCount);
      if (input.down) this.ui.commandIndex = wrapIndex(this.ui.commandIndex + 1, commandCount);

      if (input.left || input.right) {
        this.ui.targetIndex = wrapIndex(
          this.ui.targetIndex + (input.right ? 1 : -1),
          Math.max(1, livingEnemies.length),
        );
      }

      if (input.confirm && this.hasReadyActor()) {
        const actor = this.getReadyActor();
        if (!actor) return;
        this.turnOwner = actor.id;
        this.ui.selectionMode = "target";
        this.ui.message = `${COMMANDS[this.ui.commandIndex]} ready`;
        this.ui.targetIndex = normalizeIndex(this.ui.targetIndex, livingEnemies.length);
      } else if (input.confirm) {
        const leader = this.getLeadingActor();
        const charge = Math.round((leader?.gauge ?? 0));
        this.ui.message = leader ? `${leader.name} charging ${charge}%` : "ATB charging";
      }
      return;
    }

    if (this.ui.selectionMode === "target") {
      if (input.left) this.ui.targetIndex = wrapIndex(this.ui.targetIndex - 1, Math.max(1, livingEnemies.length));
      if (input.right) this.ui.targetIndex = wrapIndex(this.ui.targetIndex + 1, Math.max(1, livingEnemies.length));
      if (input.confirm) {
        const actor = this.getPartyMemberById(this.turnOwner);
        if (!actor) {
          this.ui.selectionMode = "command";
          this.turnOwner = null;
          return;
        }
        this.pendingAction = this.createAction(actor, livingEnemies);
        this.ui.selectionMode = "queue";
        this.ui.message = "Action queued";
        this.ui.targetIndex = normalizeIndex(this.ui.targetIndex, livingEnemies.length);
      }
    }
  }

  resolveTurn(seconds) {
    if (this.pendingAction && this.turnOwner) {
      this.turnTimer += seconds;
      if (this.turnTimer < PLAYER_TURN_DELAY) return;
      this.turnTimer = 0;
      this.executeAction(this.pendingAction);
      this.pendingAction = null;
      this.turnOwner = null;
      this.ui.selectionMode = "command";
      this.ui.commandIndex = 0;
      this.ui.targetIndex = 0;
      this.ui.message = "Choose a command";
      return;
    }

    const enemy = this.getReadyEnemy();
    if (!enemy) return;

    this.enemyTimer += seconds;
    if (this.enemyTimer < ENEMY_TURN_DELAY) return;
    this.enemyTimer = 0;
    this.executeEnemyTurn(enemy);
  }

  advanceAtb(seconds) {
    for (const member of this.battle.party) {
      if (!member.alive) continue;
      if (member.locked) continue;
      member.gauge = Math.min(100, member.gauge + seconds * PLAYER_ATB_RATE);
    }

    for (const enemy of this.battle.enemies) {
      if (!enemy.alive) continue;
      enemy.gauge = Math.min(100, enemy.gauge + seconds * ENEMY_ATB_RATE);
    }
  }

  updateEnemies(seconds) {
    for (const enemy of this.battle.enemies) {
      if (!enemy.alive) continue;
      enemy.statusTimers.poison = Math.max(0, enemy.statusTimers.poison - seconds);
      if (enemy.status.poisoned && enemy.statusTimers.poison <= 0) {
        enemy.status.poisoned = false;
      }
    }
  }

  executeAction(action) {
    const actor = this.getPartyMemberById(action.actorId);
    if (!actor || !actor.alive) return;
    const target = this.getTargetForAction(action);
    const command = action.command;

    actor.gauge = 0;
    actor.locked = false;

    if (command === "Attack") {
      this.applyDamage(actor, target, 18);
      actor.gauge = 20;
      this.pushLog(`${actor.name} hits ${target.name} for 18`);
      return;
    }

    if (command === "Skill") {
      const dealt = this.applyDamage(actor, target, 28, { pierceGuard: true });
      const splashTargets = this.getAliveEnemies().filter((enemy) => enemy.id !== target?.id);
      for (const splashTarget of splashTargets) {
        this.applyDamage(actor, splashTarget, 8, { pierceGuard: true });
      }
      const splashLabel = splashTargets.length ? ` + ${splashTargets.length} splash` : "";
      this.pushLog(`${actor.name} casts on ${target.name} for ${dealt}${splashLabel}`);
      return;
    }

    if (command === "Guard") {
      actor.status.guard = true;
      actor.statusTimers.guard = 6;
      actor.gauge = 35;
      this.pushLog(`${actor.name} guards`);
      return;
    }

    if (command === "Item") {
      const healed = this.healLowestParty(24);
      this.pushLog(`${actor.name} uses an item for ${healed.amount} HP on ${healed.targetName}`);
      return;
    }
  }

  executeEnemyTurn(enemy) {
    if (!enemy.alive) return;
    const target = this.chooseEnemyTarget(enemy);
    if (!target) return;

    enemy.gauge = 0;
    const damage = enemy.power;
    const mitigated = this.applyDamage(enemy, target, damage);
    this.pushLog(`${enemy.name} strikes ${target.name} for ${mitigated}`);
  }

  applyDamage(source, target, amount, options = {}) {
    if (!target || !target.alive) return 0;
    const guarded = target.status.guard && !options.pierceGuard;
    const mitigated = Math.max(1, Math.round(amount * (guarded ? 0.5 : 1)));
    target.hp = Math.max(0, target.hp - mitigated);
    if (target.hp === 0) target.alive = false;
    if (guarded) {
      target.status.guard = false;
      target.statusTimers.guard = 0;
    }
    if (source?.type === "enemy" || source?.type === "party") {
      source.lastAction = target.id;
    }
    return mitigated;
  }

  healLowestParty(amount) {
    const alive = this.getAliveParty();
    if (!alive.length) return { amount: 0, targetName: "nobody" };
    const target = [...alive].sort(
      (left, right) => left.hp / Math.max(1, left.maxHp) - right.hp / Math.max(1, right.maxHp),
    )[0];
    const before = target.hp;
    target.hp = Math.min(target.maxHp, target.hp + amount);
    return { amount: target.hp - before, targetName: target.name };
  }

  checkVictoryDefeat() {
    const partyAlive = this.battle.party.some((member) => member.alive);
    const enemiesAlive = this.battle.enemies.some((enemy) => enemy.alive);

    if (!partyAlive) {
      this.mode = "defeat";
      this.ui.overlay = "result";
      this.result = createResultState({ kind: "defeat", summary: "Party down" });
      this.pushLog("Defeat");
      return;
    }

    if (!enemiesAlive) {
      this.mode = "victory";
      this.ui.overlay = "result";
      this.result = createResultState({ kind: "victory", summary: "Enemy line broken" });
      this.pushLog("Victory");
    }
  }

  createAction(actor, livingEnemies) {
    const command = COMMANDS[this.ui.commandIndex] ?? COMMANDS[0];
    const target = livingEnemies[this.ui.targetIndex] ?? livingEnemies[0] ?? null;
    return {
      actorId: actor.id,
      command,
      targetId: target?.id ?? null,
    };
  }

  getTargetForAction(action) {
    if (action.command === "Item" || action.command === "Guard") {
      return this.getPartyMemberById(action.actorId);
    }
    return this.getEnemyById(action.targetId) ?? this.getAliveEnemies()[0];
  }

  getReadyActor() {
    return this.battle.party.find((member) => member.alive && member.gauge >= 100) ?? null;
  }

  getReadyEnemy() {
    return this.battle.enemies.find((enemy) => enemy.alive && enemy.gauge >= 100) ?? null;
  }

  hasReadyActor() {
    return Boolean(this.getReadyActor());
  }

  getAliveParty() {
    return this.battle.party.filter((member) => member.alive);
  }

  getAliveEnemies() {
    return this.battle.enemies.filter((enemy) => enemy.alive);
  }

  getPartyMemberById(id) {
    return this.battle.party.find((member) => member.id === id) ?? null;
  }

  getEnemyById(id) {
    return this.battle.enemies.find((enemy) => enemy.id === id) ?? null;
  }

  pushLog(message) {
    if (!message) return;
    this.log.unshift(String(message));
    this.log = this.log.slice(0, MAX_LOG_LINES);
  }

  syncFrame() {
    this.frame = this.buildFrameState();
  }

  buildFrameState() {
    const overlay = this.mode === "menu" ? "menu" : this.mode === "victory" || this.mode === "defeat" ? "result" : "battle";
    const command = COMMANDS[this.ui.commandIndex] ?? COMMANDS[0];
    const livingEnemies = this.getAliveEnemies();
    const target = livingEnemies[normalizeIndex(this.ui.targetIndex, livingEnemies.length)] ?? livingEnemies[0] ?? null;
    const readyActor = this.getReadyActor();
    const readyEnemy = this.getReadyEnemy();
    const leadingActor = this.getLeadingActor();
    const activePrompt = this.buildPrompt(command, readyActor, target, leadingActor);
    const battleProgress = this.pendingAction
      ? this.turnTimer / PLAYER_TURN_DELAY
      : readyEnemy
        ? this.enemyTimer / ENEMY_TURN_DELAY
        : (leadingActor?.gauge ?? 0) / 100;

    return {
      state: this.mode,
      overlay,
      time: this.time,
      log: this.log[0] ?? this.ui.message,
      logs: [...this.log],
      command: activePrompt,
      prompt: activePrompt,
      cursor: this.ui.cursor,
      selectionMode: this.ui.selectionMode,
      selectedCommand: this.ui.commandIndex,
      selectedTarget: this.ui.targetIndex,
      battle: {
        phase: this.pendingAction ? "player-turn" : this.getReadyEnemy() ? "enemy-turn" : "atb",
        progress: battleProgress,
      },
      party: this.battle.party.map((member) => ({
        id: member.id,
        name: member.name,
        hp: member.hp,
        maxHp: member.maxHp,
        gauge: member.gauge / 100,
        row: member.row,
        side: "party",
        alive: member.alive,
        status: { ...member.status },
      })),
      enemies: this.battle.enemies.map((enemy) => ({
        id: enemy.id,
        name: enemy.name,
        hp: enemy.hp,
        maxHp: enemy.maxHp,
        gauge: enemy.gauge / 100,
        row: enemy.row,
        side: "enemy",
        alive: enemy.alive,
        status: { ...enemy.status },
      })),
      menus: {
        commands: COMMANDS.map((name, index) => ({
          name,
          detail: COMMAND_DETAILS[name]?.summary ?? "",
          hint: COMMAND_DETAILS[name]?.hint ?? "",
          index,
          active: index === this.ui.commandIndex,
        })),
        targets: livingEnemies.map((enemy, index) => ({
          id: enemy.id,
          name: enemy.name,
          index,
          active: enemy.id === target?.id,
        })),
      },
      enemyIntents: this.battle.enemies
        .filter((enemy) => enemy.alive)
        .map((enemy) => this.buildEnemyIntent(enemy)),
      combatants: [
        ...this.battle.party.map((member) => this.mapCombatant(member, "party")),
        ...this.battle.enemies.map((enemy) => this.mapCombatant(enemy, "enemy")),
      ],
      gauges: {
        party: this.battle.party.map((member) => ({ id: member.id, value: member.gauge / 100 })),
        enemies: this.battle.enemies.map((enemy) => ({ id: enemy.id, value: enemy.gauge / 100 })),
      },
      result: this.result,
    };
  }

  mapCombatant(entity, side) {
    const targetEnemy = this.getAliveEnemies()[normalizeIndex(this.ui.targetIndex, this.getAliveEnemies().length)] ?? null;
    return {
      id: entity.id,
      name: entity.name,
      side,
      role: entity.role ?? "",
      roleHint: entity.roleHint ?? "",
      hp: entity.hp,
      maxHp: entity.maxHp,
      alive: entity.alive,
      row: entity.row,
      gauge: entity.gauge / 100,
      status: { ...entity.status },
      ready: entity.alive && entity.gauge >= 100,
      cursor: side === "enemy" ? entity.id === targetEnemy?.id : entity.id === this.turnOwner,
    };
  }

  getLeadingActor() {
    return [...this.battle.party]
      .filter((member) => member.alive)
      .sort((left, right) => (right.gauge ?? 0) - (left.gauge ?? 0))[0] ?? null;
  }

  buildEnemyIntent(enemy) {
    const target = this.chooseEnemyTarget(enemy);
    return {
      id: enemy.id,
      name: enemy.name,
      role: enemy.role ?? "",
      roleHint: enemy.roleHint ?? "",
      targetName: target?.name ?? "nobody",
      damage: enemy.power,
      ready: enemy.alive && enemy.gauge >= 100,
      gauge: enemy.gauge / 100,
    };
  }

  buildPrompt(command, readyActor, target, leadingActor) {
    if (this.mode === "menu") return "Press Start Battle";
    if (this.mode === "victory") return "Victory";
    if (this.mode === "defeat") return "Party down";
    const readyEnemy = this.getReadyEnemy();
    if (readyEnemy) {
      const targetMember = this.chooseEnemyTarget(readyEnemy);
      return `${readyEnemy.name} pressuring ${targetMember?.name ?? "party"} | ${readyEnemy.power} dmg incoming`;
    }
    if (this.pendingAction && this.turnOwner) {
      const actor = this.getPartyMemberById(this.turnOwner);
      return `${actor?.name ?? "Party"} queued ${this.pendingAction.command}`;
    }
    if (this.ui.selectionMode === "target") {
      return `${command} -> ${target?.name ?? "target"} | ${COMMAND_DETAILS[command]?.summary ?? "Left/Right target"}`;
    }
    if (readyActor) {
      return `${readyActor.name} ready | ${command}: ${COMMAND_DETAILS[command]?.summary ?? "Choose action"}`;
    }
    return `${leadingActor?.name ?? "Party"} charging ${Math.round(leadingActor?.gauge ?? 0)}%`;
  }

  chooseEnemyTarget(enemy) {
    const aliveParty = this.getAliveParty();
    if (!aliveParty.length) return null;

    switch (enemy?.targetRule) {
      case "weakest":
        return [...aliveParty].sort(
          (left, right) => left.hp / Math.max(1, left.maxHp) - right.hp / Math.max(1, right.maxHp),
        )[0];
      case "highestGauge":
        return [...aliveParty].sort((left, right) => (right.gauge ?? 0) - (left.gauge ?? 0))[0];
      case "front":
      default:
        return aliveParty[0];
    }
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function wrapIndex(value, size) {
  if (size <= 0) return 0;
  return ((value % size) + size) % size;
}

function normalizeIndex(value, size) {
  if (size <= 0) return 0;
  return wrapIndex(value, size);
}
