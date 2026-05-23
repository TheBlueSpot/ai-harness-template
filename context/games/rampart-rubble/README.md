# Rampart Rubble

## Concept

- Browser-playable castle defense where each wave has two readable jobs: rebuild a broken wall, then survive the fleet bombardment behind it.
- Pressure comes from deciding which gaps to patch, when to end rebuild early, and which ships to sink before their reload cycles collapse the keep.

## Loop

- Rebuild phase: place stone pieces onto the wall grid with the mouse and rotate them with `Q` and `E`.
- Defend phase: aim the keep cannon with the mouse, hold click to fire, and break the fleet before the keep health runs out.
- Session goal: survive four waves and finish with the highest keep and score total you can preserve.

## Notes

- Open [./index.html](./index.html) directly in a modern browser.
- The entry stays isolated inside `./rampart-rubble/` and keeps direct folder boot without shared runtime dependencies.
- Local review pass fixed the corner-shot complaint by making cannon shells solve toward the mouse aim point instead of using a fixed arc that overshot edge ships.
- Re-review target: confirm the outermost ships on both flanks now read as fair hits without making center-lane shots feel too flat.
