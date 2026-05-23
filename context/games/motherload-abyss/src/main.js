import { Game } from "./Game.js";

const canvas = document.getElementById("game");
const overlayRoot = document.getElementById("overlay-root");

const game = new Game({ canvas, overlayRoot });
game.start();

window.__MOTHERLOAD_ABYSS__ = game;
