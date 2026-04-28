# Metroid Bio-Labyrinth

Standalone browser exploration slice for the catalog.

## Loop

- Cross a connected lab made of hand-authored sectors and mark each room on the minimap.
- Recover the morph ball and high jump upgrades to unlock alternate routes through the facility.
- Dodge wall-crawling zoomers, clear infected drones, and push into the reactor chamber for extraction.

## Controls

- `A/D` or arrow keys: move
- `Space`, `W`, or `ArrowUp`: jump
- `J`, `X`, or `Ctrl`: fire
- `Shift`, `S`, or `ArrowDown`: morph / un-morph after unlock
- `Enter`: start
- `R`: restart after mission end

## Files

- `index.html`: direct browser entry
- `src/world.js`: room graph, pickups, gates, and enemy routes
- `src/Game.js`: simulation, collision, combat, and state flow
- `src/render.js`: world, HUD map, and combat effect rendering
- `src/main.js`: input and DOM wiring
