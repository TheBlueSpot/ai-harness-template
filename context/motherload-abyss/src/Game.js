import { GridManager } from "./gridmanager.js";
import { DrillPhysics } from "./drillphysics.js";
import { ResourceHUD, formatRunTime } from "./resourcehud.js";
import { assets } from "./assets.js";
import { SFX } from "./sfx.js";

const STATE = Object.freeze({
  MENU: "MENU",
  PLAYING: "PLAYING",
  DEAD: "DEAD"
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const createInput = () => {
  const pressed = new Set();
  const held = new Set();
  const map = new Map([
    ["ArrowLeft", "left"],
    ["KeyA", "left"],
    ["ArrowRight", "right"],
    ["KeyD", "right"],
    ["ArrowUp", "up"],
    ["KeyW", "up"],
    ["ArrowDown", "down"],
    ["KeyS", "down"],
    ["Space", "boost"],
    ["Enter", "start"],
    ["KeyR", "restart"],
    ["Escape", "menu"]
  ]);

  const onKeyDown = (event) => {
    const code = map.get(event.code);
    if (!code) {
      return;
    }
    event.preventDefault();
    held.add(code);
    pressed.add(code);
  };

  const onKeyUp = (event) => {
    const code = map.get(event.code);
    if (!code) {
      return;
    }
    event.preventDefault();
    held.delete(code);
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  return {
    isDown: (code) => held.has(code),
    wasPressed: (...codes) => codes.some((code) => pressed.has(code)),
    clearFrame() {
      pressed.clear();
    },
    destroy() {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    }
  };
};

const formatDepth = (depth) => `${Math.round(clamp(depth, 0, 100))}%`;

export class Game {
  constructor({ canvas, overlayRoot }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.overlayRoot = overlayRoot;
    this.assets = assets;
    this.sfx = new SFX();
    this.input = createInput();
    this.grid = new GridManager();
    this.physics = new DrillPhysics({ startX: 360, startY: 52 });
    this.hud = new ResourceHUD(overlayRoot);
    this.state = STATE.MENU;
    this.running = false;
    this.lastTime = 0;
    this.accumulator = 0;
    this.step = 1 / 60;
    this.pointerStarted = false;
    this.cameraY = 0;
    this.viewWidth = 0;
    this.viewHeight = 0;
    this.runSummary = null;
    this.overlays = {
      menu: null,
      death: null
    };
    this.boundResize = () => this.resize();
    this.boundPointerStart = () => {
      if (this.state === STATE.MENU || this.state === STATE.DEAD) {
        this.pointerStarted = true;
      }
    };
    this.boundOverlayClick = (event) => {
      const button = event.target.closest("[data-action]");
      if (!button) {
        return;
      }
      const action = button.dataset.action;
      if (action === "start" || action === "restart") {
        this.beginRun();
      }
    };
    this.overlayRoot.addEventListener("click", this.boundOverlayClick);
    window.addEventListener("resize", this.boundResize);
    window.addEventListener("pointerdown", this.boundPointerStart, { passive: true });
    this.resize();
    this.showMenu();
  }

  start() {
    if (this.running) {
      return;
    }
    this.running = true;
    this.lastTime = performance.now();
    requestAnimationFrame(this.frame);
  }

  destroy() {
    this.running = false;
    this.input.destroy();
    this.hud.destroy();
    window.removeEventListener("resize", this.boundResize);
    window.removeEventListener("pointerdown", this.boundPointerStart);
    this.overlayRoot.removeEventListener("click", this.boundOverlayClick);
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.canvas.getBoundingClientRect();
    this.viewWidth = rect.width;
    this.viewHeight = rect.height;
    this.canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = true;
  }

  showMenu() {
    this.overlayRoot.innerHTML = "";
    this.overlays.menu = document.createElement("section");
    this.overlays.menu.className = "modal modal-menu";
    this.overlays.menu.innerHTML = `
      <div class="panel hero">
        <p class="eyebrow">Motherload Abyss</p>
        <h1>Dig. Mine. Survive the pressure.</h1>
        <p class="lede">Click or press Enter to start. Drill downward, extract ore, and manage fuel before the shaft caves in.</p>
        <div class="actions">
          <button data-action="start" class="primary">Start run</button>
          <div class="keys">Move: WASD / Arrows · Boost: Space · Restart: R</div>
        </div>
      </div>
    `;
    this.overlayRoot.append(this.overlays.menu);
  }

  showDeath(summary) {
    this.overlayRoot.innerHTML = "";
    this.overlays.death = document.createElement("section");
    this.overlays.death.className = "modal modal-death";
    this.overlays.death.innerHTML = `
      <div class="panel hero danger">
        <p class="eyebrow">Run ended</p>
        <h1>${summary.reason}</h1>
        <p class="lede">Ore value ${summary.oreValue}. Max depth ${formatDepth(summary.maxDepth)}. Time survived ${formatRunTime(summary.timeSurvived)}.</p>
        <dl class="summary">
          <div><dt>Reason</dt><dd>${summary.reason}</dd></div>
          <div><dt>Max depth</dt><dd>${formatDepth(summary.maxDepth)}</dd></div>
          <div><dt>Ore value</dt><dd>${summary.oreValue}</dd></div>
          <div><dt>Time</dt><dd>${formatRunTime(summary.timeSurvived)}</dd></div>
        </dl>
        <div class="actions">
          <button data-action="restart" class="primary">Restart</button>
        </div>
      </div>
    `;
    this.overlayRoot.append(this.overlays.death);
  }

  beginRun() {
    this.sfx.unlock();
    this.sfx.uiAccept();
    this.grid.generate();
    this.physics.reset({ startX: 360, startY: 52 });
    this.runSummary = null;
    this.pointerStarted = false;
    this.overlayRoot.innerHTML = "";
    this.hud = new ResourceHUD(this.overlayRoot);
    this.state = STATE.PLAYING;
    this.input.clearFrame();
  }

  endRun(reason) {
    this.state = STATE.DEAD;
    this.runSummary = {
      reason,
      maxDepth: this.physics.maxDepth,
      oreValue: this.physics.oreValue,
      timeSurvived: this.physics.timeSurvived
    };
    this.sfx.death();
    this.showDeath(this.runSummary);
  }

  updatePlaying(dt) {
    this.grid.update(dt);
    const snapshot = this.physics.update(dt, this.input, this.grid);
    this.cameraY = clamp(this.physics.y - this.viewHeight * 0.55, 0, this.grid.rows * this.grid.cellSize - this.viewHeight);
    this.hud.update(snapshot);
    if (snapshot.lastMineValue > 0) {
      this.sfx.mine();
    } else if (this.input.isDown("boost")) {
      this.sfx.drill();
    }
    if (snapshot.dead) {
      this.endRun(snapshot.reason || "Run failed");
    }
  }

  handleMenuInput() {
    if (this.input.wasPressed("start", "boost", "restart") || this.pointerStarted) {
      this.pointerStarted = false;
      this.beginRun();
    }
  }

  handleDeathInput() {
    if (this.input.wasPressed("start", "boost", "restart") || this.pointerStarted) {
      this.pointerStarted = false;
      this.beginRun();
    }
  }

  drawBackground() {
    const ctx = this.ctx;
    const w = this.viewWidth;
    const h = this.viewHeight;
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, "#081018");
    gradient.addColorStop(0.6, "#0b141c");
    gradient.addColorStop(1, "#05080d");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(255, 185, 84, 0.08)";
    ctx.fillRect(0, 0, w, 160);
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    for (let index = 0; index < 72; index += 1) {
      const x = (index * 211) % w;
      const y = ((index * 97) % h) + ((index % 4) * 8);
      ctx.fillRect(x, y, 2, 2);
    }
  }

  drawDrill(snapshot) {
    const ctx = this.ctx;
    const x = snapshot.x;
    const y = snapshot.y - this.cameraY;
    const angle = Math.atan2(this.physics.vy, this.physics.vx);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle + Math.PI / 2);
    ctx.drawImage(this.assets.drill, -24, -24, 48, 48);
    ctx.restore();
    ctx.fillStyle = "rgba(255,176,83,0.14)";
    ctx.beginPath();
    ctx.arc(x, y, 28 + snapshot.heat * 0.08, 0, Math.PI * 2);
    ctx.fill();
  }

  drawHud(snapshot) {
    const ctx = this.ctx;
    const w = this.viewWidth;
    ctx.fillStyle = "rgba(6,10,14,0.88)";
    ctx.fillRect(0, 0, w, 88);
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.strokeRect(0.5, 0.5, w - 1, 87);
    ctx.fillStyle = "#f7f1e6";
    ctx.font = "700 18px system-ui, sans-serif";
    ctx.fillText("MOTHERLOAD ABYSS", 24, 28);
    ctx.font = "500 13px system-ui, sans-serif";
    ctx.fillStyle = "rgba(247,241,230,0.72)";
    ctx.fillText("Mine ore, keep fuel above zero, and stay out of deep pressure.", 24, 50);
    ctx.fillStyle = "#ffbf69";
    ctx.fillText(`Ore ${snapshot.oreValue}`, 24, 72);
    ctx.fillStyle = "#a8d0da";
    ctx.fillText(`Depth ${formatDepth(snapshot.maxDepth)} · Time ${formatRunTime(snapshot.timeSurvived)}`, 160, 72);
  }

  drawPlaying(snapshot) {
    this.drawBackground();
    this.grid.draw(this.ctx, this.assets, this.cameraY, this.viewHeight);
    this.drawDrill(snapshot);
    this.drawHud(snapshot);
  }

  drawOverlayBackdrop() {
    const ctx = this.ctx;
    const w = this.viewWidth;
    const h = this.viewHeight;
    ctx.fillStyle = "rgba(2,5,8,0.28)";
    ctx.fillRect(0, 0, w, h);
  }

  frame = (now) => {
    if (!this.running) {
      return;
    }
    const dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;
    this.accumulator += dt;
    while (this.accumulator >= this.step) {
      if (this.state === STATE.MENU) {
        this.handleMenuInput();
      } else if (this.state === STATE.PLAYING) {
        this.updatePlaying(this.step);
      } else if (this.state === STATE.DEAD) {
        this.handleDeathInput();
      }
      this.input.clearFrame();
      this.accumulator -= this.step;
    }

    this.ctx.clearRect(0, 0, this.viewWidth, this.viewHeight);
    if (this.state === STATE.PLAYING) {
      const snapshot = this.physics.snapshot(this.grid);
      this.drawPlaying(snapshot);
    } else {
      this.drawBackground();
      this.drawOverlayBackdrop();
      if (this.state === STATE.MENU) {
        this.drawMenuDecor();
      } else if (this.state === STATE.DEAD && this.runSummary) {
        this.drawDeathDecor();
      }
    }
    requestAnimationFrame(this.frame);
  };

  drawMenuDecor() {
    const ctx = this.ctx;
    const w = this.viewWidth;
    const h = this.viewHeight;
    ctx.strokeStyle = "rgba(255,191,105,0.3)";
    ctx.lineWidth = 2;
    ctx.strokeRect(22, 110, w - 44, h - 132);
    ctx.fillStyle = "rgba(255,191,105,0.08)";
    ctx.fillRect(36, 132, 240, 132);
    ctx.fillStyle = "#f7f1e6";
    ctx.font = "700 32px system-ui, sans-serif";
    ctx.fillText("Click or press Enter", 54, 184);
    ctx.font = "500 15px system-ui, sans-serif";
    ctx.fillStyle = "rgba(247,241,230,0.72)";
    ctx.fillText("Start the drill, then carve tunnels toward richer ore pockets.", 54, 214);
  }

  drawDeathDecor() {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(255,107,107,0.08)";
    ctx.fillRect(0, 0, this.viewWidth, this.viewHeight);
  }
}
