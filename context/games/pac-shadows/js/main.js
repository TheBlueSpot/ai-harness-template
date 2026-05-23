import { createPacShadowsApp } from "./app.js";

const canvas = document.getElementById("game");

if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error("Pac Shadows canvas not found");
}

const app = await createPacShadowsApp(canvas);
app.start();
