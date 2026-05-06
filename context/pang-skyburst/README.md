# Pang Skyburst

Pang Skyburst is a compact browser arcade entry built around vertical tether play, split blobs, and fast restarts.

## Concept

Stay under the falling threat line, launch the harpoon, and keep the arena readable while blobs split into smaller hazards.

## Controls

- `Enter` or `Start` to begin
- `Left` / `Right` or `A` / `D` to move
- `Up` or `W` to jump across platform gaps
- `X`, `J`, or `Ctrl` to fire the tether
- `R` to restart

## Launch

Open `./pang-skyburst/index.html` directly in a browser.

## Patrol Notes

- The opening loop is simple to read: one blob, one tether, fast restart.
- A real browser blocker showed up in patrol: the title overlay stayed visually on top after `Start`, which hid the actual play state and undercut the first-run teachable moment.
- Local sweep fixed that blocker so the start flow now cleanly transitions from menu to live play.
- Another live friction point showed up in patrol: `R` was documented as instant retry, but active play ignored it. Local sweep fixed that so the taught restart rhythm now works mid-run as expected.
- The next useful check is still not broader polish; it is whether the first split teaches `fire once, reposition, finish small blobs` quickly enough to feel sticky on the first death-retry cycle.
