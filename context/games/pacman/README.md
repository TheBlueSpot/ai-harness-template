# Pac-Man Power Circuit

`pacman` is a browser-playable pellet-chase maze built as an isolated catalog entry. The loop stays close to the arcade original: route cleanly through the grid, use power cells to reverse pressure, and retry fast when a ghost closes the lane.

## Play

- Open [index.html](./index.html) in a browser.
- Move with `WASD` or the arrow keys.
- Eat every pellet to clear the board.
- Press `Space` to start or instantly restart.
- Press `Escape` to return to the menu.

## Design Notes

- The HUD stays edge-anchored so score, lives, and state stay readable without covering the maze.
- Power-cell feedback appears near the playfield instead of relying on audio or a large overlay.
- The folder is self-contained and boots directly with no build step or shared runtime.
