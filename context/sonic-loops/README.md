# Sonic Loop-the-Loop Physics

Standalone browser entry for a momentum platformer about building speed, holding loop lines, and keeping rings alive through hazards.

## Controls

- `Arrow keys` or `WASD` to move
- `Space` or `Up` to jump
- `R` or the restart button to rerun

## Play Loop

- Start from the menu screen
- Build momentum through the track
- Keep rings through loop sections and hazard contact
- Finish the run or restart immediately from the overlay

## Run

Open [index.html](./index.html) in a browser or serve this folder with the repo's usual static host.

## Sweep Note

Sweep note: the ring-loss loop now pays back its own premise. Spilled rings can be recollected after a brief delay instead of turning every hit into permanent invisible loss.
The opener now puts shield rings directly in the first lane and avoids same-spike chain hits, so the first hazard teaches the ring rule instead of reading as random instant failure.
High-ring hits now spill the full carried stash instead of a hidden capped subset, so enemy contact matches the expected `rings save one hit, zero rings means death` rule.

## Next todo

- Recheck whether slope exit momentum still feels Sonic-like after the full-ring spill rule, or whether the next pass needs to target loop adhesion and launch carry instead of ring logic.
