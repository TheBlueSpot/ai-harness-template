# Metroid Bio-Labyrinth

Standalone browser exploration slice for the catalog.

## Play

Open [index.html](./index.html) in a browser to play.

## Loop

- Cross a connected lab made of hand-authored sectors and mark each room on the minimap.
- Recover the morph ball and high jump upgrades to unlock alternate routes through the facility.
- Dodge wall-crawling zoomers, clear infected drones, and push into the reactor chamber for extraction.

## Latest Pass

- Fresh May 6, 2026 random review follow-up confirmed the stored `main menu doesnt start game` report was still real in direct browser play. The folder was still booting through a module entry that Chromium blocks from `file:///`, so clicking `Start Mission` never left the menu even though the runtime code itself was fine.
- The browser entry now ships a single bundled runtime inside the game folder, which restores direct local boot and lets the menu hand off to live play from `./index.html` again without requiring a server.

## Controls

- `A/D` or arrow keys: move
- `Space`, `W`, or `ArrowUp`: jump
- `J`, `X`, or `Ctrl`: fire
- `Shift`, `S`, or `ArrowDown`: morph / un-morph after unlock
- `Enter`: start
- `R`: restart after mission end

## Next Todo

- Re-review whether the restored direct-file boot is enough for first-run trust or if the next cheap pass should move to route readback inside the first two rooms now that the menu handoff is honest again.
