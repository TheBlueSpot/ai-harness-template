# Super Meat Boy: Liquid Velocity

Standalone browser platformer built as its own folder in the game collection.

## Concept

- Precision movement centers on air-strafing, frame-cut jump height, wall-slides, and forgiving corner kicks.
- Every failed run becomes a ghost on the next attempt, so the level slowly fills with a swarm of prior deaths.
- The route ends with a cumulative death total on the fail and clear screens.

## Structure

- `index.html` boots the game directly from this folder.
- `src/` holds the runtime modules for physics, level parsing, ghosts, input, rendering, and scene flow.
- `assets/README.md` tracks the public-domain image sources used for the cave environment.

## Notes

- The campaign is a short three-route climb focused on learning movement tech one layer at a time.
- Ghosts stay frame-accurate because they are recorded on the same fixed simulation step used by the live run.
