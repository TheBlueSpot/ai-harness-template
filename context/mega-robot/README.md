# Mega Robot

Mega Robot is a self-contained browser platformer about climbing a robot fortress, timing jumps, and clearing enemy
armor with a simple weapon loop.

## Concept

The entry focuses on compact movement and readable combat states. The player can run, jump with variable height, fire
shots, and recover from wall contact with a short kick lockout. Stage pressure comes from robot patrols, shielded
targets, and a core fight at the top of the fortress.

## Controls

- `A` / `Left`: move left
- `D` / `Right`: move right
- `W`, `Up`, or `Space`: jump and hold for a higher arc
- `J` or `Ctrl`: fire the current weapon
- `1` / `2`: swap weapons after boss reward unlocks the sniper shot
- `Enter`: start or restart from menu states
- `R`: restart the current run

## Entry Shape

The game stays inside `mega-robot/` and opens directly from `index.html` with local module files only.
