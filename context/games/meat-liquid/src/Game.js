import { Renderer } from "./render/Renderer.js";
import { renderLoseOverlay, renderMenuOverlay, renderWinOverlay } from "./ui/OverlayView.js";
import { createInitialGameState, enterLose, enterMenu, enterPlaying, enterWin, SCENES } from "./state/GameState.js";

const STEP = 1 / 60;
const MAX_FRAME = 0.25;
const MAX_CATCHUP_STEPS = 5;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function blendNumber(previous, current, alpha) {
  return previous + (current - previous) * alpha;
}

function cloneCamera(camera) {
  return camera ? { x: camera.x, y: camera.y, zoom: camera.zoom } : { x: 0, y: 0, zoom: 1 };
}

function blendCamera(previous, current, alpha) {
  if (!previous) return cloneCamera(current);
  if (!current) return cloneCamera(previous);
  return {
    x: blendNumber(previous.x, current.x, alpha),
    y: blendNumber(previous.y, current.y, alpha),
    zoom: blendNumber(previous.zoom, current.zoom, alpha),
  };
}

function blendPlayer(previous, current, alpha) {
  if (!current) return null;
  if (!previous) return { ...current };
  return {
    ...current,
    x: blendNumber(previous.x, current.x, alpha),
    y: blendNumber(previous.y, current.y, alpha),
    vx: blendNumber(previous.vx ?? current.vx ?? 0, current.vx ?? 0, alpha),
    vy: blendNumber(previous.vy ?? current.vy ?? 0, current.vy ?? 0, alpha),
  };
}

export class Game {
  constructor({
    canvas,
    overlayRoot,
    assets = {},
    inputManager,
    physicsCore,
    levelParser,
    campaign = [],
    ghostEngine,
  } = {}) {
    this.canvas = canvas;
    this.overlayRoot = overlayRoot;
    this.assets = assets;
    this.inputManager = inputManager;
    this.physicsCore = physicsCore;
    this.levelParser = levelParser;
    this.campaign = campaign;
    this.ghostEngine = ghostEngine;
    this.renderer = canvas ? new Renderer(canvas.getContext("2d"), assets) : null;
    this.levels = [];
    this.activeLevel = null;
    this.player = null;
    this.camera = { x: 0, y: 0, zoom: 1 };
    this.previousPlayer = null;
    this.previousCamera = { x: 0, y: 0, zoom: 1 };
    this.state = createInitialGameState();
    this.accumulator = 0;
    this.lastTimestamp = 0;
    this.frameIndex = 0;
    this.running = false;
    this.animationFrame = 0;
    this.overlayMarkup = null;
    this.handleOverlayClick = this.handleOverlayClick.bind(this);
  }

  init() {
    this.levels = this.campaign.map((definition) => this.levelParser(definition));
    this.state = createInitialGameState(this.levels.length);
    this.inputManager?.attach(window);
    this.overlayRoot?.addEventListener("click", this.handleOverlayClick);
    this.loadLevel(0, false);
    this.render();
  }

  start() {
    if (this.running) return;
    this.running = true;
    const frame = (timestamp) => {
      if (!this.running) return;
      const delta = this.lastTimestamp ? (timestamp - this.lastTimestamp) / 1000 : STEP;
      this.lastTimestamp = timestamp;
      this.update(Math.min(delta, MAX_FRAME));
      this.render();
      this.animationFrame = window.requestAnimationFrame(frame);
    };
    this.animationFrame = window.requestAnimationFrame(frame);
  }

  stop() {
    this.running = false;
    if (this.animationFrame) {
      window.cancelAnimationFrame(this.animationFrame);
      this.animationFrame = 0;
    }
  }

  loadLevel(levelIndex, beginRun) {
    this.activeLevel = this.levels[levelIndex] ?? this.levels[0] ?? null;
    if (!this.activeLevel) return;
    this.frameIndex = 0;
    this.player = this.physicsCore.spawn(this.activeLevel);
    this.camera = this.computeCamera(this.player);
    this.previousPlayer = this.player ? { ...this.player } : null;
    this.previousCamera = cloneCamera(this.camera);
    if (beginRun) {
      this.ghostEngine.restartRun(this.activeLevel.id);
    }
    this.ghostEngine.update(0, this.activeLevel.id);
  }

  startLevel(levelIndex = this.state.levelIndex) {
    this.loadLevel(levelIndex, true);
    this.state = enterPlaying(
      { ...this.state, totalDeaths: this.ghostEngine.getTotalDeaths() },
      levelIndex,
      this.activeLevel,
      this.levels.length
    );
    this.accumulator = 0;
    this.lastTimestamp = 0;
  }

  restartLevel() {
    this.startLevel(this.state.levelIndex);
  }

  resetCampaign() {
    this.state = enterMenu(
      { ...createInitialGameState(this.levels.length), totalDeaths: this.ghostEngine.getTotalDeaths() },
      this.levels[0],
      this.levels.length
    );
    this.loadLevel(0, false);
  }

  handleOverlayClick(event) {
    const trigger = event.target.closest("[data-action]");
    if (!trigger) return;
    event.preventDefault();
    const action = trigger.getAttribute("data-action");
    if (action === "start" || action === "retry") {
      this.startLevel(this.state.levelIndex);
    } else if (action === "play-again") {
      this.resetCampaign();
    }
    this.render();
  }

  update(frameTime) {
    const input = this.inputManager?.sampleFrame?.() ?? null;
    this.accumulator += frameTime;
    let catchupSteps = 0;
    while (this.accumulator >= STEP && catchupSteps < MAX_CATCHUP_STEPS) {
      this.step(STEP, input);
      this.accumulator -= STEP;
      catchupSteps += 1;
    }
    if (catchupSteps === MAX_CATCHUP_STEPS && this.accumulator >= STEP) {
      this.accumulator = Math.min(this.accumulator, STEP);
    }
  }

  step(dt, input) {
    if (this.state.scene === SCENES.MENU) {
      if (input?.jumpPressed || input?.restartPressed) {
        this.startLevel(this.state.levelIndex);
      }
      return;
    }

    if (this.state.scene === SCENES.LOSE) {
      if (input?.jumpPressed || input?.restartPressed) {
        this.restartLevel();
      }
      return;
    }

    if (this.state.scene === SCENES.WIN) {
      if (input?.jumpPressed || input?.restartPressed) {
        this.resetCampaign();
      }
      return;
    }

    if (input?.restartPressed) {
      this.restartLevel();
      return;
    }

    if (!this.activeLevel || !this.player) return;

    this.previousPlayer = { ...this.player };
    this.previousCamera = cloneCamera(this.camera);
    const result = this.physicsCore.step(this.player, input, dt, this.activeLevel);
    this.player = result.player;
    this.camera = this.computeCamera(this.player);
    this.ghostEngine.captureFrame({
      ...result.sample,
      frameIndex: this.frameIndex,
      levelId: this.activeLevel.id,
      alive: true,
    });
    this.frameIndex += 1;

    if (result.outcome === "lose") {
      this.ghostEngine.captureFrame({
        ...result.sample,
        frameIndex: this.frameIndex,
        levelId: this.activeLevel.id,
        alive: false,
        deathTint: 1,
        force: true,
      });
      this.ghostEngine.finalizeDeath({
        cause: result.cause ?? "hazard",
        deathFrameIndex: this.frameIndex,
      });
      this.state = enterLose(
        { ...this.state, totalDeaths: this.ghostEngine.getTotalDeaths() },
        this.ghostEngine.getTotalDeaths(),
        this.activeLevel,
        this.levels.length
      );
      this.ghostEngine.update(this.frameIndex, this.activeLevel.id);
      return;
    }

    if (result.outcome === "win") {
      const nextLevelIndex = this.state.levelIndex + 1;
      if (nextLevelIndex < this.levels.length) {
        this.startLevel(nextLevelIndex);
        return;
      }
      this.state = enterWin(
        { ...this.state, totalDeaths: this.ghostEngine.getTotalDeaths() },
        this.ghostEngine.getTotalDeaths(),
        this.activeLevel,
        this.levels.length
      );
    } else {
      this.state = {
        ...this.state,
        totalDeaths: this.ghostEngine.getTotalDeaths(),
        levelName: this.activeLevel.name,
        justTransitioned: false,
      };
    }

    this.ghostEngine.update(this.frameIndex, this.activeLevel.id);
  }

  computeCamera(player) {
    if (!player || !this.activeLevel || !this.renderer) {
      return { x: 0, y: 0, zoom: 1 };
    }

    const viewWidth = this.renderer.width || this.canvas?.width || 1600;
    const viewHeight = this.renderer.height || this.canvas?.height || 900;
    const zoom = clamp(Math.min(viewWidth / 960, viewHeight / 540), 0.8, 1.35);
    const halfWorldWidth = viewWidth / (2 * zoom);
    const halfWorldHeight = viewHeight / (2 * zoom);
    const worldWidth = this.activeLevel.render?.width ?? 0;
    const worldHeight = this.activeLevel.render?.height ?? 0;

    return {
      x: clamp(player.x, halfWorldWidth, Math.max(halfWorldWidth, worldWidth - halfWorldWidth)),
      y: clamp(player.y, halfWorldHeight, Math.max(halfWorldHeight, worldHeight - halfWorldHeight)),
      zoom,
    };
  }

  buildViewModel() {
    const activeLevel = this.activeLevel ?? this.levels[this.state.levelIndex] ?? null;
    const alpha = clamp(this.accumulator / STEP, 0, 1);
    const camera = blendCamera(this.previousCamera, this.camera, alpha);
    return {
      scene: this.state,
      currentLevel: activeLevel,
      level: activeLevel,
      playerPose: blendPlayer(this.previousPlayer, this.player, alpha),
      ghostPoses: this.ghostEngine.getRenderableGhosts(activeLevel?.id, camera, {
        width: this.renderer?.width ?? this.canvas?.width ?? 1600,
        height: this.renderer?.height ?? this.canvas?.height ?? 900,
      }),
      camera,
      counters: {
        totalDeaths: this.ghostEngine.getTotalDeaths(),
        levelIndex: this.state.levelIndex + 1,
        levelCount: this.levels.length,
      },
    };
  }

  render() {
    const viewModel = this.buildViewModel();
    this.renderer?.render(viewModel);

    if (!this.overlayRoot) return;
    let markup = "";
    if (this.state.scene === SCENES.MENU) {
      markup = renderMenuOverlay(viewModel);
    } else if (this.state.scene === SCENES.LOSE) {
      markup = renderLoseOverlay(viewModel);
    } else if (this.state.scene === SCENES.WIN) {
      markup = renderWinOverlay(viewModel);
    }
    if (markup !== this.overlayMarkup) {
      this.overlayRoot.innerHTML = markup;
      this.overlayMarkup = markup;
    }
  }
}
