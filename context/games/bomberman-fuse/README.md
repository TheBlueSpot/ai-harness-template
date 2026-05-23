# Bomberman Fuse

Browser-playable blast-maze arcade entry about planting bombs, breaking routes open, and escaping once the arena is clear enough to read.

## Why It Exists

This catalog slot covers grid-based territory control instead of lane pressure, freeform platforming, or direct projectile aiming. The run is about claiming space with timed blasts, reading future collision paths, and using destructible cover without a bulky HUD.

## Core Loop

- Move tile to tile through a boxed arena while hard pillars and soft crates shape the route.
- Plant bombs to open lanes, reveal the key, and remove the roamers guarding the far side.
- Grab the key, wait for the gate to unlock, then route through the safest opening before the next fuse turns the maze hostile again.

## Play Pattern

The first teaching moment sits on the nearest crate so the player learns bomb spacing at the exact obstacle that needs it. Later pressure comes from patrol crossings and longer blast lines, so danger stays readable through in-world telegraphs instead of a front-loaded rules dump.

Open [index.html](./index.html) in a browser to play.

## Sweep learnings

- Run shape: the one-room prototype had a good base lesson but stopped before the mechanic stack could get sticky. This pass turns the run into a short three-district push so bomb spacing, loadout growth, and patrol pressure can build on each other instead of ending right after first contact.
- Variety: for arcade maze-bomb games, variety reads better from new route shapes and enemy behaviors than from a larger rules dump. Distinct districts and patrol roles deepen the loop without making the first minute harder to parse.
