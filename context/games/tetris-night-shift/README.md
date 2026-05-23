# Tetris Night Shift

Tetris Night Shift is a browser-playable falling-block puzzle entry about keeping a late-shift warehouse stack stable as gravity ramps up.

## Controls

- `Left` and `Right` move
- `Down` soft drops
- `Up` or `X` rotates clockwise
- `Z` rotates counter-clockwise
- `Space` hard drops
- `C` holds
- `P` pauses

## Play Loop

- Clear lines to keep the intake ceiling open
- Use the ghost piece to place cleanly under rising speed
- Save hold for bad fits or four-line setup recovery
- Survive longer by preserving one clean well for long pieces

## Local Notes

- Entry is isolated inside `tetris-night-shift/`
- Open `tetris-night-shift/index.html` in a browser to play
- HUD stays edge-anchored so the board remains readable under pressure
- The in-play prompt uses inline code styling so the rotation hint stays legible at a glance
