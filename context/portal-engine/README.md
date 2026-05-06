# Portal Engine

Browser-playable 2D portal puzzle-platformer built as an isolated catalog entry.

## Play

Open [index.html](./index.html) in a browser to play.

## What It Is

This entry focuses on chamber-by-chamber problem solving with momentum redirection, cube-and-button routing, and portal placement on readable lab surfaces.

## Play Loop

- Enter a chamber and read the immediate objective.
- Place blue and orange portals to reroute yourself or a weighted cube.
- Open doors by holding buttons with body positioning or cube placement.
- Clear chambers in sequence until the final cake screen.

## Controls

- Move: `A` / `D` or arrow keys
- Jump: `W`, `Space`, or `Up Arrow`
- Fire blue portal: left click
- Fire orange portal: right click
- Grab or drop cube: `E`
- Reset chamber: `R`
- Return to menu: `Esc`

## Notes

- Bright lab plates accept portals. Dark stone surfaces do not.
- Fresh May 2, 2026 review pass widened portal-entry forgiveness so edge touches now match the visible frame more closely instead of demanding near-perfect center overlap.
- Fresh May 6, 2026 polish pass added a live portal-placement preview: the cursor now shows whether the aimed surface will accept a stable portal before click, and the HUD echoes why a shot will lock or fail.
- Re-review whether the wider edge catch feels fair on both wall and floor portals, or if cube teleports now need a slightly different grace band than the player.
