import Game from "./Game.js";
import { renderGame } from "./render.js";
import { init } from "../../../engine/browser/engine.js";

const canvas = document.getElementById("game");
const game = new Game();

const viewport = { width: 1280, height: 720 };

function restartRun() {
  game.restart();
}

window.addEventListener("keydown", (event) => {
  const mode = game.getFrameState().mode;
  if (event.key === "Backspace") {
    event.preventDefault();
    game.handleBackspace();
    return;
  }
  if (event.key === "Enter") {
    event.preventDefault();
    if (mode === "win" || mode === "lose") {
      restartRun();
      return;
    }
    game.submitWord();
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    restartRun();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "r") {
    event.preventDefault();
    restartRun();
    return;
  }
  if (event.key.length === 1 && /[a-z]/i.test(event.key)) {
    game.handleCharacter(event.key);
  }
});

const app = init({
  canvas,
  width: viewport.width,
  height: viewport.height,
  scaleMode: "letterbox",
  globals: false,
  update(deltaTime) {
    game.update(deltaTime);
  },
  render() {
    renderGame(app.context, game.getFrameState(), viewport);
  }
});

game.resize(viewport.width, viewport.height);
renderGame(app.context, game.getFrameState(), viewport);
