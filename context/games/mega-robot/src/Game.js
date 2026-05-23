import { createStage, updateStage } from "./systems/stage.js";
import { resolveCombat, updateCombat } from "./systems/combat.js";
import { renderFrame } from "./render.js";

const VIEW = { width: 960, height: 540 };

export class Game {
  constructor(canvas = null, ui = {}) {
    this.canvas = canvas;
    this.ctx = canvas?.getContext?.("2d") ?? null;
    this.ui = ui;
    this.stage = createStage(VIEW);
    this.frame = this.buildFrameState();
  }

  start() {
    this.stage.mode = "play";
    this.frame = this.buildFrameState();
  }

  restart() {
    this.stage = createStage(this.stage.view);
    this.stage.mode = "play";
    this.frame = this.buildFrameState();
  }

  resize(width, height) {
    this.stage.view = { width, height };
    this.frame = this.buildFrameState();
  }

  update(dt, input = {}) {
    const seconds = Math.max(0, Math.min(0.05, Number(dt) || 0));
    if (this.stage.mode === "menu") {
      if (input.jump || input.start) {
        this.start();
      }
      return;
    }

    if (this.stage.mode === "win" || this.stage.mode === "lose") {
      if (input.restart || input.start) {
        this.restart();
      }
      return;
    }

    updateStage(this.stage, seconds, input);
    updateCombat(this.stage, seconds, input);
    resolveCombat(this.stage);
    this.frame = this.buildFrameState();
  }

  render(ctx = this.ctx) {
    if (!ctx) return;
    renderFrame(ctx, this.frame);
  }

  syncUI() {
    const frame = this.frame;
    if (this.ui.hudRoot) {
      const unlocked = frame.weapon.unlocked.join(", ");
      this.ui.hudRoot.innerHTML = `
        <div class="hud-card">
          <div class="hud-row"><span>Mode</span><strong>${frame.mode}</strong></div>
          <div class="hud-row"><span>HP</span><strong>${frame.player.hp}</strong></div>
          <div class="hud-row"><span>Boss</span><strong>${frame.boss.active ? `${frame.boss.hp}/${frame.boss.maxHp}` : "offline"}</strong></div>
          <div class="hud-row"><span>Core</span><strong>${frame.core.hp}</strong></div>
          <div class="hud-row"><span>Score</span><strong>${frame.score}</strong></div>
          <div class="hud-row"><span>Weapon</span><strong>${frame.weapon.equipped}</strong></div>
          <div class="hud-row"><span>Unlocks</span><strong>${unlocked}</strong></div>
          <div class="hud-row"><span>Shots</span><strong>${frame.projectiles.length}</strong></div>
        </div>
      `;
    }
    if (this.ui.menuRoot) {
      this.ui.menuRoot.innerHTML = frame.message
        ? `<div class="menu-card"><strong>${frame.message.title}</strong><p>${frame.message.body}</p></div>`
        : "";
    }
  }

  getFrameState() {
    return this.frame;
  }

  buildFrameState() {
    const s = this.stage;
    return {
      mode: s.mode,
      score: s.score,
      view: s.view,
      camera: { ...s.camera },
      player: { ...s.player },
      core: { ...s.core },
      enemies: s.enemies.map((enemy) => ({ ...enemy })),
      projectiles: s.combat?.projectiles.map((shot) => ({ ...shot })) ?? [],
      effects: s.combat?.effects.map((effect) => ({ ...effect })) ?? [],
      shots: s.shots.map((shot) => ({ ...shot })),
      boss: { ...s.boss, weakpoint: { ...s.boss.weakpoint } },
      attackIntents: [...(s.attackIntents ?? [])],
      events: [...(s.events ?? [])],
      groundY: s.groundY,
      weapon: s.combat?.weapon
        ? {
            equipped: s.combat.weapon.equipped,
            unlocked: [...s.combat.weapon.unlocked],
          }
        : { equipped: "buster", unlocked: ["buster"] },
      combat: {
        projectiles: s.combat?.projectiles.map((shot) => ({ ...shot })) ?? [],
        damageTotals: s.combat?.damageTotals ?? { player: 0, enemy: 0, boss: 0 },
        feedback: s.combat?.feedback ?? { playerFired: false, bossReward: null, shieldBlocked: false, playerHit: false },
        hitEvents: s.combat?.hitEvents ?? [],
        unlocks: s.combat?.unlocks ?? [],
      },
      message:
        s.mode === "menu"
          ? { title: "Ready", body: "Press Enter to deploy. Hold jump for height, kick off walls, and use the first wall as your opening route. Fire with J or Ctrl." }
          : s.mode === "win"
            ? { title: "Win", body: "Fortress cleared. Press Enter to retry with your new weapon." }
            : s.mode === "lose"
              ? { title: "Lose", body: "Robot frame cracked. Press Enter to relaunch." }
              : null,
      walls: s.walls,
    };
  }
}
