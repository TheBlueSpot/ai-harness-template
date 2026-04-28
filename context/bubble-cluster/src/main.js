const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const game = new window.BubbleClusterGame();

const input = {
  dt: 0,
  leftHeld: false,
  rightHeld: false,
  firePressed: false,
  startPressed: false,
  restartPressed: false,
  pointerX: null,
  pointerY: null,
};

function resize() {
  const ratio = 960 / 540;
  const bounds = canvas.getBoundingClientRect();
  const width = Math.min(bounds.width || 960, 960);
  const height = width / ratio;
  canvas.width = 960;
  canvas.height = 540;
  canvas.style.height = `${height}px`;
  game.resize(canvas.width, canvas.height);
}

function clearPressedFlags() {
  input.firePressed = false;
  input.startPressed = false;
  input.restartPressed = false;
}

function toCanvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  };
}

window.addEventListener("resize", resize);

window.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") {
    input.leftHeld = true;
  }
  if (event.key === "ArrowRight") {
    input.rightHeld = true;
  }
  if (event.key === " " || event.key === "Spacebar") {
    event.preventDefault();
    input.firePressed = true;
  }
  if (event.key === "Enter") {
    input.startPressed = true;
  }
  if (event.key.toLowerCase() === "r") {
    input.restartPressed = true;
  }
});

window.addEventListener("keyup", (event) => {
  if (event.key === "ArrowLeft") {
    input.leftHeld = false;
  }
  if (event.key === "ArrowRight") {
    input.rightHeld = false;
  }
});

canvas.addEventListener("mousemove", (event) => {
  const point = toCanvasPoint(event);
  input.pointerX = point.x;
  input.pointerY = point.y;
});

canvas.addEventListener("mouseleave", () => {
  input.pointerX = null;
  input.pointerY = null;
});

canvas.addEventListener("click", (event) => {
  const point = toCanvasPoint(event);
  input.pointerX = point.x;
  input.pointerY = point.y;
  const frameState = game.getFrameState();
  if (frameState.mode === "ready" || frameState.mode === "win" || frameState.mode === "lose") {
    input.startPressed = true;
  } else {
    input.firePressed = true;
  }
});

resize();

let lastTime = performance.now();
function loop(now) {
  const dt = Math.min((now - lastTime) / 1000, 1 / 30);
  lastTime = now;
  input.dt = dt;
  game.update(dt, input);
  window.renderBubbleCluster(ctx, game.getFrameState());
  clearPressedFlags();
  requestAnimationFrame(loop);
}

window.renderBubbleCluster(ctx, game.getFrameState());
requestAnimationFrame(loop);
