# Pac Ghost-Hunt AI

Catalog entry for a browser-playable maze chase inside `./pac-ghost-ai/`.

## Play

Open [index.html](./index.html) in a browser to play.

## Premise

Clear the board while four ghosts pressure the same maze with distinct target logic. Power pellets temporarily flip the pursuit, turning the escape route into a scoring window.

## Controls

- `Arrow keys` or `WASD`: move
- `Enter` or click: start
- `R`: restart

## Ghost Read

Blinky runs direct chase pressure, Pinky aims ahead of your path, Inky bends its route from Blinky's position, and Clyde abandons the chase when you get too close. The run is about reading those differences early enough to keep clean lanes open.

## Catalog Fit

This entry is self-contained, launches directly from its own folder, and keeps the README high level so the playable logic stays local to the game directory.

## Sweep Notes

### 2026-05-02

- Review follow-up: raised Pac movement speed and shortened the round-ready delay so first turns stop reading as sluggish before the ghost script even matters.
- Learning: in maze chases, perceived slowness comes from both tile speed and dead time before control starts; trimming only one of those still leaves the opener feeling sticky.

### 2026-05-06

- Sweep follow-up: collision checks now use relative swept motion instead of only the final overlap frame, so same-tile crossings stop ghosting through Pac during fast lane changes.
- Local todo: re-check whether the remaining pressure complaints are true route difficulty or just frightened-window tuning now that missed body-check deaths should be gone.
