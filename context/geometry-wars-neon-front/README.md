# Geometry Wars Neon Front

Catalog entry for a browser-playable twin-stick survival shooter inside `./geometry-wars-neon-front/`.

## Premise

You hold the center of a neon arena while hot lanes on the walls telegraph the next enemy surge. Clearing shapes is only half the score game: every kill drops a short-lived cell, and routing through those pickups is how you keep the multiplier alive before the next wave spike arrives.

## Controls

- `WASD` or arrow keys: move
- Mouse: aim
- Click or `Space`: fire
- `Enter`: start
- `R`: instant retry

## Run Shape

Each run is six compact waves. Red lane bars mark where the next enemies will break in, yellow snipers draw their shot lines before firing, and green cells reward aggressive route planning between kills. Retry is immediate so failed pathing stays inside the learning loop.

## Local Play

Open `./geometry-wars-neon-front/index.html` in a browser to play the isolated entry directly.

## Sweep Notes

- Onboarding: title card teaches the core loop clearly enough; no extra copy sweep was needed in this pass.
- Controls: mouse aim plus movement reads cleanly once the run starts.
- Feedback: fixed a misleading HUD route meter. It used a separate long-drain value instead of the real multiplier hold timer, so the green bar could stay mostly full after the route bonus had already started falling. The bar now tracks the actual `chainClock` window.
- Pacing: early waves come online fast and retry stays instant, which supports the intended sticky arcade loop.
- Next todo: watch whether first cell collection happens early enough in natural play to teach `kill -> collect -> hold multiplier` before survival pressure dominates.
