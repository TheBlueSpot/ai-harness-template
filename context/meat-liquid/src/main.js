import { Game } from "./Game.js";
import { PhysicsCore } from "./core/PhysicsCore.js";
import { GhostEngine } from "./core/GhostEngine.js";
import { parseLevel } from "./core/LevelParser.js";
import { CAMPAIGN_LEVELS } from "./data/campaign.js";
import { InputManager } from "./input/InputManager.js";
import { loadAssets } from "./render/AssetLoader.js";

const canvas = document.getElementById("game-canvas");
const overlayRoot = document.getElementById("overlay-root");

const assets = await loadAssets().catch(() => ({}));
const game = new Game({
  canvas,
  overlayRoot,
  assets,
  inputManager: new InputManager(),
  physicsCore: new PhysicsCore(),
  levelParser: parseLevel,
  campaign: CAMPAIGN_LEVELS,
  ghostEngine: new GhostEngine(),
});

const MAX_INTERNAL_PIXELS = 1_600 * 900 * 1.15;

function resolveRenderScale(rect) {
  const viewportArea = Math.max(1, rect.width * rect.height);
  const maxAreaScale = Math.sqrt(MAX_INTERNAL_PIXELS / viewportArea);
  const deviceScale = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  return Math.max(1, Math.min(deviceScale, maxAreaScale));
}

function resize() {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = resolveRenderScale(rect);
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  game.renderer?.resize(canvas.width, canvas.height);
}

window.addEventListener("resize", resize);
resize();
game.init();
game.start();
