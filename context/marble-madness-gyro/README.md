# Marble Madness Gyro

Standalone browser marble run built as one isolated catalog entry.

## Concept

Guide a momentum-heavy marble across three authored stages by tilting the board, locking checkpoint rings, collecting enough gems to open each finish ring, and surviving rotating gyro hazards.

## Play Loop

- Tilt with arrow keys or `WASD`.
- Hit the glowing next checkpoint ring to secure progress.
- Collect the required gems for the current stage before entering its exit ring.
- Avoid pits, use bumpers to recover speed, and restart with `R` when needed.

## Structure

- `./index.html` boots the standalone page.
- `./src/Game.js` owns simulation state, stage flow, and collision rules.
- `./src/levels.js` keeps course data local to this game.
- `./src/render.js` draws the board, HUD callouts, and hazards.

## Verification

Use a modern browser or local static server and open `./marble-madness-gyro/index.html`.
