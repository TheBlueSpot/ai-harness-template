# Osmos Drift Pool

Catalog entry for a browser-playable fluid-growth survival run inside `./osmos-drift/`.

## Play

Open [index.html](./index.html) in a browser to play.

## Premise

You steer a fragile cell through three pressure pools. Each stage mixes edible drift cells, larger roaming hunters, current wells that pull the route off center, and cyan bloom anchors that must be charged before the exit ring stabilizes. The gate only opens after both the mass target and bloom-anchor goal are met, so greedy pathing, routing, and safe pathing keep trading places.

## Controls

- `WASD` or `Arrow keys`: drift thrust
- `Space`: burst pulse that clears space but costs mass
- `Enter` or click: start
- `R`: restart campaign

## Catalog Fit

This entry stays isolated in its own folder, launches directly from `index.html`, and keeps the README focused on the loop instead of code detail.

## Recent Learning

The review ask for `more objectives per level` was real: only showing a mass threshold made the pools read like one repeated task. A small second goal works better here when it stays visible in the live HUD and points the route toward authored landmarks instead of hidden bookkeeping.

Fresh May 6 movement follow-up stayed on the narrow feel complaint instead of broader content work. Starting the player noticeably lighter and trimming tiny-cell thrust makes the opening read more like cautious drift than instant pinball, which better matches the `40% smaller starting speed` and `40% slower accell when small` review signal without changing the later route structure.

Fresh May 6 particle follow-up stayed on the remaining polish ask instead of adding systems. Charged blooms, vortex lanes, and the exit gate now shed more ambient motes with brighter cores, so the pool reads livelier even in calm routing beats and the review-store `more particles` note is answered in the shipped play space instead of only during collisions.

## Next Todo

Re-review the first 20 seconds and early stage handoff in a live browser pass. If the richer ambient motes start masking prey-size reads near charged blooms or the open gate, keep the calmer movement tuning and trim particle density before reopening gameplay balance.
