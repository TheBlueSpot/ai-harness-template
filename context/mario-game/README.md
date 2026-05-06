# Mushroom Stack

Browser-playable falling-block puzzle entry focused on clean stack management, readable next-piece planning, fast retry, and a lighter Mario-flavored shell.

## Controls

- `Left` and `Right` move
- `Down` soft drops
- `Up` or `Z` rotates
- `Space` hard drops
- `P` pauses
- `R` restarts

## Play Loop

- Keep the stack low enough to preserve reaction space
- Read the next piece early so the board stays stable under rising speed
- Use hard drops to cash in safe placements before pressure builds
- Restart instantly when the stack locks out

## Recent Learning

- Random review pass on 2026-05-06 found the core loop still read as plain Tetris, so the cheapest high-leverage answer was theme readback instead of new rules: the shell now frames progress as world climbing and line clears as Mario-style reward beats.

## Local Notes

- Entry is isolated inside `mario-game/`
- Open `mario-game/index.html` in a browser to play
- HUD stays edge-anchored so the playfield remains readable
