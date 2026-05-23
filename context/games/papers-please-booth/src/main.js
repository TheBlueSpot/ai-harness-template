import { Game } from "./Game.js";
import { renderFrame } from "./render.js";

const game = new Game();

const root = {
  meta: document.getElementById("meta"),
  documents: document.getElementById("documents"),
  decision: document.getElementById("decision"),
  hud: document.getElementById("hud"),
  rules: document.getElementById("rules"),
  hint: document.getElementById("hint"),
  overlay: document.getElementById("overlay"),
  approve: document.getElementById("approve"),
  reject: document.getElementById("reject"),
};

function sync() {
  renderFrame(root, game.getFrameState());
}

function trigger(action) {
  game.handleAction(action);
  sync();
}

root.approve.addEventListener("click", () => trigger("approve"));
root.reject.addEventListener("click", () => trigger("reject"));

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (["enter", " ", "backspace", "a", "d", "arrowleft", "arrowright"].includes(key) || event.key === " ") {
    event.preventDefault();
  }
  if (event.key === "Enter") {
    trigger(game.getFrameState().mode === "menu" ? "start" : "restart");
  } else if (event.key === " ") {
    trigger("approve");
  } else if (event.key === "Backspace") {
    trigger("reject");
  } else if (key === "a" || key === "arrowleft") {
    trigger("prev");
  } else if (key === "d" || key === "arrowright") {
    trigger("next");
  } else if (key === "r") {
    trigger("restart");
  }
});

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  game.update(dt);
  sync();
  requestAnimationFrame(frame);
}

sync();
requestAnimationFrame(frame);
