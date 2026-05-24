import { createMagicMapShmup } from "./game.ts";

const root = document.querySelector<HTMLElement>("#game-root");
if (!root) throw new Error("Game root missing");

void createMagicMapShmup(root).catch((error) => {
  console.error(error);
  root.textContent = "Magic Map Shmup failed to load assets.";
});
