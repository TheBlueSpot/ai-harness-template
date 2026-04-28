import { PHASES } from "./config.js";
import { updatePlayerCombat } from "./entities/player.js";
import { renderWorld } from "./render/world.js";
import { updateAI, updateThreatRouting } from "./systems/ai.js";
import { resolveCombat } from "./systems/combat.js";
import { advanceDayNight } from "./systems/dayNight.js";
import { applyProgression, resolveOutcome } from "./systems/progression.js";
import { spawnWave, updateNightSpawns } from "./systems/spawn.js";
import { applyViewport, beginDay, beginNight, cloneState, createInitialState, enterRun, getBarricadeRatio, getNightPressure } from "./state.js";

export class Game {
  constructor(canvas = null) {
    this.canvas = canvas;
    this.ctx = canvas?.getContext?.("2d") ?? null;
    this.state = createInitialState();
    this.frame = this.buildFrameState();
  }

  start() {
    this.state = enterRun(this.state);
    this.frame = this.buildFrameState();
  }

  restart() {
    this.state = enterRun(applyViewport(createInitialState(), this.state.viewport));
    this.frame = this.buildFrameState();
  }

  resize(width, height) {
    const viewport = typeof width === "object" ? width : { width, height };
    this.state = applyViewport(this.state, viewport);
    this.frame = this.buildFrameState();
  }

  update(dt, input = {}) {
    const seconds = Math.max(0, Math.min(0.05, Number(dt) || 0));
    if (this.state.phase === PHASES.MENU) {
      if (input.confirm || input.start) {
        this.start();
      }
      return;
    }

    if (this.state.phase === PHASES.WIN || this.state.phase === PHASES.LOSE) {
      if (input.restart || input.confirm) {
        this.restart();
      }
      return;
    }

    const next = cloneState(this.state);
    updatePlayerCombat(next, input, seconds);
    applyProgression(next, seconds, input);

    if (next.phase === PHASES.NIGHT) {
      if (!next.spawn.spawnedThisNight) {
        spawnWave(next, next.spawn.waveSeed);
      } else {
        updateNightSpawns(next, seconds);
      }
      updateAI(next, seconds);
      resolveCombat(next, seconds);
    }

    const transition = advanceDayNight(next, seconds);
    if (transition === PHASES.NIGHT) {
      beginNight(next);
      spawnWave(next, next.spawn.waveSeed);
    } else if (transition === PHASES.DAY) {
      beginDay(next);
    }

    if (input.restart) {
      this.restart();
      return;
    }

    resolveOutcome(next);
    this.state = next;
    this.frame = this.buildFrameState();
  }

  render(ctx = this.ctx) {
    if (!ctx) {
      return;
    }
    renderWorld(ctx, this.frame);
  }

  getFrameState() {
    return this.frame;
  }

  buildFrameState() {
    const state = this.state;
    return {
      phase: state.phase,
      state: state.phase,
      day: state.day,
      clock: state.cycleClock,
      clockRatio: Math.max(0, Math.min(1, state.cycleClock / Math.max(1, state.cycleLength))),
      night: getNightPressure(state),
      scrap: Math.round(state.scrap),
      ammo: Math.round(state.ammo),
      score: Math.round(state.score),
      player: {
        x: state.player.x,
        y: state.player.y,
        radius: state.player.radius,
        health: state.player.health,
        maxHealth: state.player.maxHealth,
        stamina: state.player.stamina,
        aimX: state.player.aimX,
        aimY: state.player.aimY,
      },
      barricade: {
        ...state.barricade,
        hpRatio: getBarricadeRatio(state),
      },
      survivorsAlive: state.survivorsAlive,
      survivorsTotal: state.survivorsTotal,
      survivors: state.survivors,
      threats: state.zombies.filter((zombie) => !zombie.dead),
      routes: updateThreatRouting(state),
      scavengeSites: state.scavengeSites,
      message: state.message,
      status: state.status,
      combatLog: state.combatLog,
      world: {
        width: state.viewport.width,
        height: state.viewport.height,
        groundY: state.arena.groundY,
      },
    };
  }
}
