import { AssetLoader } from "./js/assets.js";
import { AudioManager } from "./js/audio.js";
import { HEIGHT, STATE, WIDTH } from "./js/config.js";
import { InputManager } from "./js/input.js";
import { Renderer } from "./js/render.js";
import { SceneController } from "./js/scenes.js";

class SkylordDefenderApp {
  constructor(canvas) {
    this.canvas = canvas;
    this.assets = {
      images: new Map(),
      audio: new Map(),
      status: {
        imagesRequested: 0,
        imagesLoaded: 0,
        imagesMissing: 0,
        audioRequested: 0,
        audioLoaded: 0,
        audioMissing: 0,
      },
    };
    this.input = new InputManager(canvas);
    this.renderer = new Renderer(canvas, this.assets);
    this.audio = new AudioManager(this.assets);
    this.scenes = new SceneController(this);
    this.play = this.scenes.play;
    this.time = 0;
    this.last = 0;
    this.running = false;
  }

  async boot() {
    const loader = new AssetLoader({
      images: [
        { id: "grid-bg", path: "./assets/images/grid_bg.png" },
        { id: "player-ship", path: "./assets/images/og_002_1.png" },
        { id: "enemy-raider", path: "./assets/images/og_001.png" },
        { id: "enemy-bomber", path: "./assets/images/og_003.png" },
      ],
      audio: [
        { id: "music-main", path: "./assets/audio/space_echo.ogg" },
        { id: "sfx-laser", path: "./assets/audio/laserthing.wav" },
        { id: "sfx-explosion", path: "./assets/audio/explosion2.ogg" },
      ],
    });

    this.assets = await loader.load();
    this.renderer.assets = this.assets;
    this.audio.setAssets(this.assets);
    this.renderer.resize();
    window.addEventListener("resize", () => this.renderer.resize());
    window.addEventListener("keydown", () => this.primeAudio(), { once: true });
    window.addEventListener("pointerdown", () => this.primeAudio(), { once: true });
    this.showMenu();
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this.frame);
  }

  primeAudio() {
    this.audio.prime();
  }

  showMenu() {
    this.scenes.go(STATE.MENU);
    this.audio.requestMusic("music-main", { volume: 0.22 });
  }

  startGame() {
    this.scenes.go(STATE.PLAY);
    this.play = this.scenes.play;
    this.audio.requestMusic("music-main", { volume: 0.34 });
  }

  pauseGame() {
    this.scenes.go(STATE.PAUSE, { playState: this.scenes.play });
    this.play = this.scenes.play;
    this.audio.requestMusic("music-main", { volume: 0.2 });
  }

  resumeGame() {
    this.scenes.go(STATE.PLAY, { resume: true });
    this.play = this.scenes.play;
    this.audio.requestMusic("music-main", { volume: 0.34 });
  }

  winGame(payload) {
    this.scenes.go(STATE.WIN, {
      ...payload,
      outcome: "win",
      title: "Skyline Held",
      subtitle: "Civilian line survived. The fleet can regroup.",
      hint: "Enter, Space, or R runs another drill. M returns to menu.",
    });
    this.audio.requestMusic("music-main", { volume: 0.18 });
  }

  loseGame(payload) {
    this.scenes.go(STATE.LOSE, {
      ...payload,
      outcome: "lose",
      title: "Defeat",
      subtitle: "Civilian protection failed before the orbit gate closed.",
      hint: "Enter, Space, or R restarts. M returns to menu.",
    });
    this.audio.requestMusic("music-main", { volume: 0.18 });
  }

  frame = (now) => {
    if (!this.running) {
      return;
    }

    const dt = Math.min(0.033, (now - this.last) / 1000 || 0.016);
    this.last = now;
    this.time += dt;
    this.scenes.update(dt);
    this.renderer.clear();
    this.scenes.render();
    this.input.beginFrame();
    requestAnimationFrame(this.frame);
  };
}

const canvas = document.getElementById("game");

if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error("Missing #game canvas");
}

const app = new SkylordDefenderApp(canvas);
window.__SKYLORD_DEFENDER__ = app;
app.boot().catch((error) => {
  console.error(error);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }
  ctx.fillStyle = "#04070d";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = "#ff8f7c";
  ctx.font = "700 28px Trebuchet MS, sans-serif";
  ctx.fillText("Skylord Defender boot failed", 40, 80);
  ctx.fillStyle = "#f4f8ff";
  ctx.font = "400 18px Trebuchet MS, sans-serif";
  ctx.fillText(String(error?.message ?? error), 40, 120);
});
