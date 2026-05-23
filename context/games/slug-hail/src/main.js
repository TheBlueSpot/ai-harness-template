import { Game } from "./Game.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const game = new Game();
const input = {
  up: false,
  down: false,
  left: false,
  right: false,
  slow: false,
  fire: false,
  switchWeapon: false,
  start: false,
  aimWorld: null,
};

let lastTime = performance.now();

function resizeCanvas() {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const width = Math.floor(window.innerWidth * dpr);
  const height = Math.floor(window.innerHeight * dpr);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function updateAimFromEvent(event) {
  const bounds = canvas.getBoundingClientRect();
  const x = ((event.clientX - bounds.left) / bounds.width) * game.view.width;
  const y = ((event.clientY - bounds.top) / bounds.height) * game.view.height;
  input.aimWorld = {
    x: x + game.camera.x,
    y: y + game.camera.y,
  };
}

function frame(now) {
  const dt = Math.min(0.033, (now - lastTime) / 1000 || 0);
  lastTime = now;
  resizeCanvas();
  game.update(dt, input);
  ctx.save();
  ctx.scale(canvas.width / game.view.width, canvas.height / game.view.height);
  game.render(ctx);
  ctx.restore();
  input.start = false;
  requestAnimationFrame(frame);
}

window.addEventListener("keydown", (event) => {
  if (event.code === "KeyW" || event.code === "ArrowUp") input.up = true;
  if (event.code === "KeyS" || event.code === "ArrowDown") input.down = true;
  if (event.code === "KeyA" || event.code === "ArrowLeft") input.left = true;
  if (event.code === "KeyD" || event.code === "ArrowRight") input.right = true;
  if (event.code === "ShiftLeft" || event.code === "ShiftRight") input.slow = true;
  if (event.code === "Space") {
    input.fire = true;
    input.start = true;
    event.preventDefault();
  }
  if (event.code === "Enter") input.start = true;
  if (event.code === "KeyQ") input.switchWeapon = true;
});

window.addEventListener("keyup", (event) => {
  if (event.code === "KeyW" || event.code === "ArrowUp") input.up = false;
  if (event.code === "KeyS" || event.code === "ArrowDown") input.down = false;
  if (event.code === "KeyA" || event.code === "ArrowLeft") input.left = false;
  if (event.code === "KeyD" || event.code === "ArrowRight") input.right = false;
  if (event.code === "ShiftLeft" || event.code === "ShiftRight") input.slow = false;
  if (event.code === "Space") input.fire = false;
  if (event.code === "KeyQ") input.switchWeapon = false;
});

window.addEventListener("pointermove", updateAimFromEvent);
window.addEventListener("pointerdown", (event) => {
  updateAimFromEvent(event);
  input.fire = true;
  input.start = true;
});
window.addEventListener("pointerup", () => {
  input.fire = false;
});
window.addEventListener("pointercancel", () => {
  input.fire = false;
});
window.addEventListener("resize", resizeCanvas);

resizeCanvas();
requestAnimationFrame(frame);
