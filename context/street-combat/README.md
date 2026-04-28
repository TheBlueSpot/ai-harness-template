# Street Combat

Street Combat is a standalone fighting-game entry focused on readable frame-data interactions instead of content breadth. The shell keeps the match directly playable from the folder while the game module owns timing, combat rules, round flow, and AI behavior.

## Concept

- Compact one-on-one fighter with best-of-three rounds
- Frame-driven attacks with startup, active, recovery, and cancel windows
- Hitstun and blockstun pressure with buffered follow-ups
- Decision-tree rival that reacts to spacing, advantage, and repeated player habits
- Optional debug overlay for hitboxes and hurtboxes

## Controls

- `A` and `D` walk
- `W` jumps
- `S` crouches
- `J`, `K`, and `L` attack
- Hold away from the opponent to block
- `H` toggles hitbox and hurtbox debug
- `Enter` starts the match
- `R` restarts

## Structure

- `index.html` hosts the standalone shell, canvas, and overlays
- `src/main.js` handles input, animation, resize, and DOM updates
- `src/Game.js` owns round flow, combat timing, AI, and rendering
- `src/data.js` defines the move list and shared frame-data values
- `src/styles.css` provides the cabinet-like presentation and responsive layout

## Notes

- The entry is isolated under `street-combat/` and does not depend on repo-wide runtime code
- Combat feedback is intentionally explicit so state changes remain legible without opening the source
- The README stays high level and links understanding back to the local entry structure
