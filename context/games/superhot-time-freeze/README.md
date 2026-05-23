# SUPERHOT Time Freeze

Catalog entry for a browser-playable arena shooter inside `./superhot-time-freeze/`.

## Premise

Time barely crawls when you stand still, then snaps forward when you move. You survive short glass-box rooms by sidestepping red attack vectors, scavenging fresh guns off the floor, and clearing each wave before the arena fills with overlapping lines.

## Controls

- `WASD` or arrow keys: move
- Mouse: aim
- Click or `Space`: fire
- `E`: scavenge a nearby floor weapon
- `Enter`: start or retry
- `R`: instant restart

## Run Shape

The run stays compact: read the vector, move to unfreeze the room, grab a better weapon, and finish the wave before the next one stacks more pressure. Retry is immediate so failed reads stay inside the learning loop.

## Sweep Notes

- Onboarding: the opener was over-seeding floor weapons, which front-loaded scavenging noise before the player had learned the basic `move -> read vector -> fire` loop. The opening room now starts from one pickup-seed pass instead of stacking multiple passes.
- Browser sweep found the remaining version of that same problem in the live shell: the title screen could still show multiple floor weapons before the run even began, and wave 1 could still random into several pickups at once. That made `Press E to scavenge` compete with the first movement/vector lesson before the player had earned a reason to care.
- Fixed locally: title state no longer seeds floor weapons, and wave 1 now guarantees exactly one pickup seed instead of several random pads. The room still advertises scavenging, but only after the core freeze/shoot read is already clearer.
- Player feedback said it was unclear when the next shot was available. The run HUD had ammo in the corner, but cooldown state still lived off-axis from the actual dodge-and-aim read.
- Fixed locally: the active weapon now advertises readiness in the focal lane with a live reticle ring, a player halo refill, and a compact corner recovery bar. `READY`, `RECOVER`, and `EMPTY` all read from shape plus color instead of only timing feel.
- Controls: time-freeze plus instant restart still reads clearly and keeps failure inside the learning loop.
- Pacing: first room pressure is strongest when weapon choice arrives after the first dodge/shoot read, not at the same time as every other tutorial demand.
- Durable lens: in cooldown-driven arena shooters, weapon readiness must read near aim or avatar space. Corner ammo alone is too far from the decision when the next shot decides whether a dodge worked.

## Local Play

Open [index.html](./index.html) in a browser to play the isolated entry directly.
