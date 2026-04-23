import { STATE } from "./config.js";
import { GameSession } from "./gameplay.js";

class BaseScene {
  constructor(app) {
    this.app = app;
    this.time = 0;
  }

  enter() {}

  exit() {}

  update(dt) {
    this.time += dt;
  }
}

class MenuScene extends BaseScene {
  update(dt) {
    super.update(dt);
    const input = this.app.input;
    if (input.wasPressed("Enter", "Space") || input.pointer.pressed) {
      this.app.startGame();
    }
  }
}

class PlayScene extends BaseScene {
  enter() {
    this.time = 0;
    this.session = new GameSession(this.app.audio);
    this.sync();
  }

  sync() {
    const session = this.session;
    this.elapsed = session.elapsed;
    this.score = session.score;
    this.integrity = session.player.health;
    this.wave = session.wave;
    this.timerMax = Math.max(1, session.waveEnemyTotal);
    this.timer = Math.max(0, session.spawnQueue.length + session.enemiesAlive);
    this.missionLabel = `wave ${session.progressLabel}`;
    this.missionNote = `${session.civiliansAlive}/${session.civilians.length} civilians alive - ${session.turretCharges} turrets ready`;
    this.phaseLabel = session.phaseLabel;
    this.civiliansAlive = session.civiliansAlive;
    this.civiliansTotal = session.civilians.length;
    this.civiliansSaved = session.rescuedTotal;
    this.turretsBuilt = session.turretsBuilt;
    this.enemiesDestroyed = session.enemiesDestroyed;
    this.bonusBanner = session.bonusBanner;
  }

  update(dt) {
    super.update(dt);
    const input = this.app.input;
    this.session.update(dt, input);
    this.sync();

    if (input.wasPressed("Escape", "KeyP")) {
      this.app.pauseGame();
      return;
    }

    if (this.session.status === "win") {
      this.app.winGame(this.snapshot("all waves cleared"));
      return;
    }

    if (this.session.status === "lose") {
      this.app.loseGame(this.snapshot(this.session.finishReason));
    }
  }

  snapshot(message) {
    const session = this.session;
    return {
      title: "Command Held",
      subtitle: "Sky line stayed intact long enough for the evacuation fleet to cycle through.",
      hint: "Enter, Space, or R runs another drill. M returns to menu.",
      outcome: session.status,
      score: session.score,
      integrity: Math.round(session.player.health),
      elapsed: session.elapsed,
      wave: session.wave,
      rescued: session.rescuedTotal,
      lost: session.lostTotal,
      turretsBuilt: session.turretsBuilt,
      enemiesDestroyed: session.enemiesDestroyed,
      message,
    };
  }
}

class PauseScene extends BaseScene {
  enter(payload) {
    this.time = 0;
    this.playState = payload.playState;
  }

  update(dt) {
    super.update(dt);
    const input = this.app.input;
    if (input.wasPressed("Escape", "KeyP")) {
      this.app.resumeGame();
      return;
    }

    if (input.wasPressed("KeyR", "Enter", "Space")) {
      this.app.startGame();
      return;
    }

    if (input.wasPressed("KeyM")) {
      this.app.showMenu();
    }
  }
}

class ResultScene extends BaseScene {
  enter(payload) {
    this.time = 0;
    this.outcome = payload.outcome;
    this.title = payload.title;
    this.subtitle = payload.subtitle;
    this.hint = payload.hint;
    this.score = payload.score;
    this.integrity = payload.integrity;
    this.elapsed = payload.elapsed;
    this.wave = payload.wave;
    this.message = payload.message;
    this.rescued = payload.rescued ?? 0;
    this.lost = payload.lost ?? 0;
    this.turretsBuilt = payload.turretsBuilt ?? 0;
    this.enemiesDestroyed = payload.enemiesDestroyed ?? 0;
  }

  update(dt) {
    super.update(dt);
    const input = this.app.input;
    if (input.wasPressed("Enter", "Space", "KeyR")) {
      this.app.startGame();
      return;
    }

    if (input.wasPressed("KeyM", "Escape")) {
      this.app.showMenu();
    }
  }
}

export class SceneController {
  constructor(app) {
    this.app = app;
    this.menu = new MenuScene(app);
    this.play = new PlayScene(app);
    this.pause = new PauseScene(app);
    this.result = new ResultScene(app);
    this.current = this.menu;
    this.mode = STATE.MENU;
    this.payload = null;
  }

  go(mode, payload = null) {
    const keepPlay = mode === STATE.PLAY && payload?.resume;
    this.current.exit?.();

    this.mode = mode;
    this.payload = payload;
    switch (mode) {
      case STATE.MENU:
        this.current = this.menu;
        break;
      case STATE.PLAY:
        this.current = this.play;
        break;
      case STATE.PAUSE:
        this.current = this.pause;
        break;
      case STATE.WIN:
      case STATE.LOSE:
        this.current = this.result;
        break;
      default:
        this.current = this.menu;
        this.mode = STATE.MENU;
        break;
    }

    if (!keepPlay) {
      this.current.enter?.(payload ?? {});
    }
  }

  update(dt) {
    this.current.update(dt);
  }

  render() {
    const renderer = this.app.renderer;
    switch (this.mode) {
      case STATE.MENU:
        renderer.drawBackground(this.app.time, "menu");
        renderer.drawMenu(this.menu);
        break;
      case STATE.PLAY:
        renderer.drawBackground(this.app.time, "play");
        renderer.drawPlay(this.play);
        renderer.drawHud(this.play);
        break;
      case STATE.PAUSE:
        renderer.drawBackground(this.app.time, "pause");
        renderer.drawPlay(this.app.play);
        renderer.drawPause(this.app.play);
        break;
      case STATE.WIN:
      case STATE.LOSE:
        renderer.drawBackground(this.app.time, this.mode);
        renderer.drawResult(this.result);
        break;
      default:
        renderer.drawBackground(this.app.time, "menu");
        renderer.drawMenu(this.menu);
    }
  }
}
