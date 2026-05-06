# thps-combo-lines

Browser-playable skate score attack built around readable combo lines, grind timing, manuals, and fast retry.

Latest local review pass tightened trick-state reliability by recomputing rail and manual collisions after landing snaps, and by giving hard landings a slightly fairer fail threshold so clean line reads survive normal ramp drops.

## Controls

- `Enter` or Start: begin a run
- `R`: restart
- Arrow keys or `WASD`: movement and line control
- `Space` or `Z`: jump
- `Down` or `S`: manual through the marked pads

## Use

- Open [`./index.html`](./index.html) directly in a browser.
- The entry is self-contained in this folder.
- Build score by hitting ramps, latching rails, and keeping manuals alive before the timer closes the line.
