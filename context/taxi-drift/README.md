# Crazy Taxi Neon Fare Rush

Standalone browser taxi game built as one isolated catalog entry.

## Play

Open [index.html](./index.html) in a browser to play.

## Concept

- The loop is short-horizon city routing: grab a fare, burn through traffic, brake inside the drop-off ring, and chain the next call before the clock fades.
- Handling leans arcade-heavy. Handbrake drifts build a short boost, so clean corner exits matter more than perfect lines.
- Traffic is the main pressure source. Crashes chew through cab integrity and break combo momentum, so the shift rewards confident but readable risk.

## Notes

- Retry is instant so failure stays in the route-learning loop.
- Pickup and drop-off instructions stay visible near the action instead of front-loading a long tutorial.
- Reusable evaluation learning kept from this pass: in high-speed driving loops, interaction goals should telegraph a larger preview zone before the true confirm zone so players can read braking intent early instead of discovering tiny pickup windows by failure.
- Durable local learning: AI traffic must follow the same painted road affordances the player reads. When NPC cars cut through block interiors, off-road penalties and collision blame feel inconsistent even if the raw physics are stable.
