# Katamari Clump Rollup

Browser game about rolling a growing clump through a city and clearing district gates.

Open [index.html](./index.html) in a browser to play.

## Controls

- `Arrow keys` or `WASD`: move
- `Enter` or `Space`: start or restart
- `R`: quick restart

## Objective

Collect smaller props to grow, then reach each district gate at the required mass.

## Distinct Notes

- Small props stay safe early, but larger props wait until the clump grows.
- Red hazards end the run on contact.
- Each district opens only after the mass threshold is met, so growth controls progression.
- The current sweep pass keeps movement on direct stick-like steering instead of tank turns, so the nose arrow matches the pressed direction immediately.

## Sweep learnings

- Keep isolated browser entries truly direct-bootable. If the first `Start` press lands in a dead shell, the growth loop never gets a chance to prove itself.

## Next todo

- Re-check whether the faster direct steering now feels readable once the clump gets heavy, or if the late districts still want a little more drag before adding any new lane hazards.
