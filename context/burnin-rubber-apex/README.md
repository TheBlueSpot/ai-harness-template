# Burnin' Rubber Apex

Standalone browser racer built as one isolated catalog entry.

Open [index.html](./index.html) in a browser to play.

## Concept

- The route is timer-led rather than lap-led: each checkpoint keeps the run alive, so every corner asks whether to hold the racing line or break it for a takedown window.
- Drifting is the core skill. Holding a fast slide banks boost, then spending that boost on the next straight lets the player convert a clean apex into a traffic pass.
- Rival cars matter beyond score because checkpoint extension scales up when the player clears takedowns between gates.

## Notes

- Retry is instant so failed checkpoint reads stay inside the learning loop.
- HUD stays edge-anchored and only carries speed, timer, checkpoint, boost, and traffic pressure state.
- Threat teaching stays in play: the road surface, checkpoint gates, and boost-line message do the heavy lifting instead of a long tutorial.
