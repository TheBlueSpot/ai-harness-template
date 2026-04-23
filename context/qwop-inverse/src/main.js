import { CONFIG } from "./config.js";
import { InputMapper } from "./InputMapper.js";
import { GameWorld } from "./game/GameWorld.js";
import { renderMenuView } from "./ui/MenuView.js";
import { renderHUDView } from "./ui/HUDView.js";
import { renderLoseView } from "./ui/LoseView.js";

const canvas = document.getElementById("game");
const menuRoot = document.getElementById("menu-root");
const hudRoot = document.getElementById("hud-root");
const loseRoot = document.getElementById("lose-root");

if (!(canvas instanceof HTMLCanvasElement) || !menuRoot || !hudRoot || !loseRoot) throw new Error("qwop-inverse shell missing");

const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("qwop-inverse canvas context missing");

const input = new InputMapper();
input.attach(window);
const world = new GameWorld({ config: CONFIG });
let last = performance.now();

const actions = {
  start: () => world.startRun(),
  restart: () => world.startRun(),
};

function resize() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
}

function getScale() {
  return canvas.height / CONFIG.canvasHeight;
}

function getCameraX(model) {
  return (model.centerOfMass?.x ?? 0) - 220;
}

function drawGround(model) {
  const scale = getScale();
  const ground = CONFIG.groundY * scale;
  const cameraX = getCameraX(model);

  ctx.save();
  ctx.fillStyle = "#09111b";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "rgba(255,255,255,0.03)";
  for (let i = 0; i < 12; i += 1) ctx.fillRect(0, canvas.height * 0.1 * i, canvas.width, 1);

  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = Math.max(1, scale);
  for (let i = -2; i < 20; i += 1) {
    const laneX = ((i * 120 - (cameraX % 120)) * scale) % (canvas.width + 180);
    ctx.beginPath();
    ctx.moveTo(laneX, ground + 8);
    ctx.lineTo(laneX + 48 * scale, ground + 8);
    ctx.stroke();
  }

  ctx.fillStyle = "#d9b46a";
  ctx.fillRect(0, ground, canvas.width, Math.max(4, canvas.height * 0.004));

  for (const hurdle of model.hurdles) {
    const worldX = model.originX + hurdle.distance / CONFIG.distanceScale;
    const screenX = (worldX - cameraX) * scale;
    const width = (CONFIG.hurdleWorldWidth ?? 18) * scale;
    const height = (CONFIG.hurdleWorldHeight ?? 84) * scale;
    if (screenX + width < 0 || screenX - width > canvas.width) continue;
    ctx.fillStyle = hurdle.hit ? "#ff6f84" : hurdle.cleared ? "#8be28d" : "#ffbc5b";
    ctx.fillRect(screenX - width * 0.5, ground - height, width, height);
    ctx.fillRect(screenX - width, ground - height, width * 2, Math.max(4, 6 * scale));
  }

  ctx.restore();
}

function drawRunner(model) {
  const pose = model.ragdoll;
  if (!pose?.bodies || !pose?.joints) return;

  const scale = getScale();
  const cameraX = getCameraX(model);
  const toScreen = (body) => ({
    x: (body.x - cameraX) * scale,
    y: body.y * scale,
  });

  ctx.save();
  ctx.strokeStyle = pose.fallLatched ? "#ff6f84" : "#f2d7ad";
  ctx.lineWidth = 9 * scale;
  ctx.lineCap = "round";

  for (const joint of pose.joints) {
    const a = pose.bodies[joint.a];
    const b = pose.bodies[joint.b];
    if (!a || !b) continue;
    const from = toScreen(a);
    const to = toScreen(b);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }

  for (const [name, body] of Object.entries(pose.bodies)) {
    const point = toScreen(body);
    ctx.fillStyle = name === "torso" ? "#8be28d" : name.includes("Sole") ? "#ffbc5b" : "#f8f1e7";
    if (pose.fallLatched && name === "torso") ctx.fillStyle = "#ff6f84";
    ctx.beginPath();
    ctx.arc(point.x, point.y, (name === "torso" ? 18 : 10) * scale, 0, Math.PI * 2);
    ctx.fill();
  }

  if (pose.com) {
    const com = toScreen(pose.com);
    ctx.fillStyle = "#5bd9ff";
    ctx.beginPath();
    ctx.arc(com.x, com.y, 6 * scale, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;

  const controlState = input.getControlState();
  const uiAction = input.consumeUiAction();
  if (uiAction === "start") controlState.start = true;
  if (uiAction === "restart") controlState.restart = true;
  world.update(dt, controlState);
  const model = world.getViewModel();
  resize();
  drawGround(model);
  drawRunner(model);
  renderMenuView(menuRoot, model, actions);
  renderHUDView(hudRoot, model);
  renderLoseView(loseRoot, model, actions);
  requestAnimationFrame(frame);
}

window.addEventListener("resize", resize);
window.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() === "r" && world.state.phase === "lose") actions.restart();
});

resize();
requestAnimationFrame(frame);
