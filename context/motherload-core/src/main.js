const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const overlayRoot = document.getElementById("overlay-root");
const dockPanel = document.getElementById("dock-panel");
const GameClass = window.MotherloadCoreGame;
const game = new GameClass({ canvas, overlayRoot, dockPanel });

const input = {
  left: false,
  right: false,
  up: false,
  down: false,
  start: false,
  restart: false,
  shop1: false,
  shop2: false,
  shop3: false,
  shop4: false,
  pointerStart: false,
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
  input.restart = false;
  input.shop1 = false;
  input.shop2 = false;
  input.shop3 = false;
  input.shop4 = false;
  input.pointerStart = false;
  requestAnimationFrame(frame);
}

window.addEventListener("keydown", (event) => {
  if (event.code === "KeyA" || event.code === "ArrowLeft") input.left = true;
  if (event.code === "KeyD" || event.code === "ArrowRight") input.right = true;
  if (event.code === "KeyW" || event.code === "ArrowUp") input.up = true;
  if (event.code === "KeyS" || event.code === "ArrowDown") input.down = true;
  if (event.code === "KeyR") {
    input.start = true;
    input.restart = true;
  }
  if (event.code === "Digit1") input.shop1 = true;
  if (event.code === "Digit2") input.shop2 = true;
  if (event.code === "Digit3") input.shop3 = true;
  if (event.code === "Digit4") input.shop4 = true;
  if (event.code === "Enter" || event.code === "Space") {
    input.start = true;
    input.pointerStart = true;
    event.preventDefault();
  }
});

window.addEventListener("keyup", (event) => {
  if (event.code === "KeyA" || event.code === "ArrowLeft") input.left = false;
  if (event.code === "KeyD" || event.code === "ArrowRight") input.right = false;
  if (event.code === "KeyW" || event.code === "ArrowUp") input.up = false;
  if (event.code === "KeyS" || event.code === "ArrowDown") input.down = false;
});

window.addEventListener("pointerdown", () => {
  input.pointerStart = true;
  input.start = true;
});

window.addEventListener("resize", resizeCanvas);

resizeCanvas();
requestAnimationFrame(frame);
