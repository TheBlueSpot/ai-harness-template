# Rampage City Smash

Rampage City Smash is a browser-playable monster-climb destruction arcade entry.

## Concept

Scale the city, smash buildings, and survive anti-air pressure long enough to clear the target.

## Controls

- `Enter`: start or restart
- Arrow keys: move
- `Space`: punch
- `J`: kick
- `K` or `Down` + `Space`: slam
- `R`: restart after a failed or cleared run

## Play

Open [`./index.html`](./index.html) directly in a browser, or serve the folder locally and load the same entry.

## Sweep notes

- The start overlay now launches the run directly on click instead of only queuing a keyboard-style input, so the menu handoff cannot strand the player on the title layer.
- The opener copy now names climb and attack verbs in the first prompt, because this entry needs move, punch, kick, and slam readable before the first tower.
- The live HUD now carries a `Next` goal row, and the playfield marks the active tower with a `NEXT` or `BREAK` chip so `gameplay not clear` no longer starts as a pure score chase.
- Health and survivor pickups now render `HEAL` and `SAVE` labels, because the old unlabelled orbs hid both reward meaning and why detouring off the tower could be worth it.

## Next todo

- Re-check whether first-wave helicopter pressure now reads early enough once the new tower marker is in place, or if the air lane still needs a stronger dodge-path telegraph.
