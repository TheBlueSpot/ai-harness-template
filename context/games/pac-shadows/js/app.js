import { createPacShadowsConfig, installPacShadowsHooks } from "./config.js";
import { ASSET_MANIFEST, AudioFallback, createAssetCatalog } from "./assets.js";
import { InputManager } from "./input.js";
import { createSceneMachine } from "./state-machine.js";
import { createMenuScene } from "./scenes/menu-scene.js";
import { createPlayScene } from "./scenes/play-scene.js";
import { createWinScene } from "./scenes/win-scene.js";
import { createLoseScene } from "./scenes/lose-scene.js";

export const createPacShadowsApp = async (canvas) => {
  const input = new InputManager();
  const config = createPacShadowsConfig();
  installPacShadowsHooks(config);
  const audio = new AudioFallback();
  const assets = await createAssetCatalog(ASSET_MANIFEST);
  assets.audio = audio;

  const sceneMachine = createSceneMachine(
    {
      menu: createMenuScene({ assets }),
      play: createPlayScene({ assets, config }),
      win: createWinScene({ assets }),
      lose: createLoseScene({ assets })
    },
    "menu",
    {
      input,
      config
    }
  );

  return new PacShadowsApp(canvas, input, sceneMachine);
};

class PacShadowsApp {
  constructor(canvas, input, sceneMachine) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.input = input;
    this.sceneMachine = sceneMachine;
    this.time = 0;
    this.lastFrame = performance.now();
    this.raf = 0;
    this.resize = this.resize.bind(this);
    this.loop = this.loop.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
  }

  start() {
    this.input.attach();
    window.addEventListener("resize", this.resize);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    this.resize();
    this.sceneMachine.start();
    this.raf = requestAnimationFrame(this.loop);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.input.detach();
    window.removeEventListener("resize", this.resize);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
  }

  onKeyDown(event) {
    this.sceneMachine.onKeyDown(event);
  }

  onKeyUp(event) {
    this.sceneMachine.onKeyUp(event);
  }

  resize() {
    const scale = window.devicePixelRatio || 1;
    const bounds = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.round(bounds.width * scale);
    this.canvas.height = Math.round(bounds.height * scale);
    this.context.setTransform(scale, 0, 0, scale, 0, 0);
  }

  loop(now) {
    const dt = Math.min(0.033, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.time += dt;
    this.sceneMachine.update(dt);
    this.sceneMachine.render(this.context);
    this.input.beginFrame();
    this.raf = requestAnimationFrame(this.loop);
  }
}
