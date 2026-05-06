# SimTower Elevator Ops

Browser-playable tower management about keeping passenger flow moving through a vertical shaft system.

## Play

Open [index.html](./index.html) in a browser to play.

## Loop

Shift the active focus between floors and elevators, clear building queues, and react to surge floors before they stall the tower.

## Controls

- Arrow keys or WASD move focus
- Enter or Space confirms
- H or ? opens help
- R restarts instantly

## Notes

The shell keeps the HUD minimal and edge-anchored so the tower stays readable while queue pressure climbs and surge floors demand fast reroutes.
The opener now stages the work through a lower-floor warmup before the full tower opens, so the dispatch fantasy lands before late-shift pressure hits every floor at once.
The live dock now names the current phase, next rotation timer, and why the active surge wants a different routing pattern, which makes the loop read as shift management instead of abstract queue math.

Sweep note: reviewed for local queue and HUD blockers; no folder-local entrypoint issue found.

## Sweep Notes

### 2026-05-02

- The shipped loop now makes dispatch ownership explicit: idle elevators stay put until you assign them, while loaded cars still auto-return to the lobby.
- Win state now requires sustained control instead of a short accidental clear: survive two surge calls and clear sixty riders before the tower counts as stable.
- Early queue growth is softer than the previous sweep draft so the opening reads as a controllable routing problem instead of an instant collapse.
- A new right-side dispatch brief keeps the live goal, hottest floor, and selected car visible so the first move reads as `pick floor -> pick car -> confirm` without detouring into help.

### 2026-05-06

- Major-gap sweep kept the direct boot intact but found the remaining taste risk in pacing and loop identity: the run still asked the player to parse the whole building before the dispatch pattern had landed.
- The opener now teaches the loop through a lower-tower warmup, then escalates into explicit Atrium and Roof surge phases with a visible rotation timer so the run reads as `learn dispatch -> open tower -> survive named pressure`.
- Locked upper floors stay visibly dim until the tower opens, which keeps the first target set smaller and stops the HUD from advertising calls the player is not meant to solve yet.
