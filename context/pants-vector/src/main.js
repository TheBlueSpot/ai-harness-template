import { Game } from "./Game.js";

const canvas = document.getElementById("game");

const assets = {
  player: "./public/assets/player.svg",
  finish: "./public/assets/finish.svg",
  hazard: "./public/assets/hazard.svg",
  background: "./public/assets/ink-bg.svg"
};

const game = new Game(canvas, assets);
(async () => {
  await game.loadAssets();
  game.start();
})();
