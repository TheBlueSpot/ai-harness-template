# Street Combat

Street Combat is a standalone fighting-game entry focused on readable frame-data interactions instead of content breadth. The shell keeps the match directly playable from the folder while the game module owns timing, combat rules, round flow, and AI behavior.

Open [index.html](./index.html) in a browser to play.

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

## Core Loop

- Walk into range, test safe pressure, and buffer follow-ups during recovery windows.
- Read the rival's spacing habits, then convert clean openings into cancel strings before the round timer runs out.
- Reset quickly after each set so the loop stays about adaptation and matchup reads instead of menu friction.

## Notes

- Combat feedback stays explicit so advantage shifts remain readable without pausing to inspect frame data.
