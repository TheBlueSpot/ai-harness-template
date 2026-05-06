# Super Meat Boy: Liquid Velocity

Standalone browser platformer built as its own folder in the game collection.

Open [index.html](./index.html) in a browser to play.

## Controls

- `A` / `D` or arrow keys move
- `W`, `Up`, or `Space` jumps
- `R` or `Enter` restarts and also advances the run overlays

## Core Loop

- Air-strafe through a short cave route built around frame-cut jumps, wall-slides, and forgiving corner kicks.
- Every failed run becomes a ghost on the next attempt, so the route slowly fills with your previous bad lines.
- Push through three routes and watch the death counter turn each retry into part of the challenge.

## Notes

- The route teaches movement tech through repeated retries instead of a front-loaded tutorial.
- Local pass: the ghost swarm now keeps only a bounded recent history per route, so long death chains stop growing replay memory and per-frame ghost scanning forever.
- Local pass: the canvas now caps its internal pixel budget on large high-DPI viewports, which keeps the same framed play area but cuts the worst fill-rate spike that was dragging live FPS down.
- Local pass: the cave backdrop and tilefield now render from cached offscreen layers, so each frame only repaints the moving mist, ghosts, player, and HUD instead of rebuilding every static block and gradient.
- Next re-review target: confirm the cache pass removes the reported low-FPS feel on repeated retries, then decide whether the next change should raise route threat instead of adding more spectacle.
