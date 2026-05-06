# Arkanoid Prism-Strike

Arkanoid Prism-Strike is a browser-playable brick-breaker about shaping one clean rebound into a controlled chaos clear.

Open [index.html](./index.html) in a browser to play.

## Premise

Route the ball through seven layered prism walls, bend rebounds off the paddle, and turn one clean angle into a controlled snowball clear.

## Controls

- Mouse or `A/D`: move the paddle
- `Enter`: start the run
- `Space`: fire lasers while the laser power-up is active
- `R`: restart the current run

## Power Loop

Prism bricks split the active ball into extra angles, while rarer multi-ball, focus, laser, and phase capsules act as occasional accelerants instead of constant bailouts. Focus capsules widen the paddle for the current layer so late-board recovery gets another texture besides raw multi-ball spam, and phase capsules let active balls cut through standard bricks for a short cleanup window.

## Local Notes

- Serve hold after launches gives the player a beat to aim the first rebound instead of reacting to surprise auto-fire.
- Power-up drops now arrive later and in tighter caps so the run escalates through control, not constant bailout items.
- Ball vectors now enforce a minimum vertical commit after launches, rebounds, splits, and surge retunes so late-board cleanup cannot collapse into near-horizontal stall loops.
- Phase capsules add one more cleanup tool without turning the run into constant bailout spam; they briefly let active balls cut through standard bricks while prism bricks still demand routing.
- The prism ladder now runs one layer deeper, so the late-board cleanup has a real final chamber instead of ending right after the first hard squeeze.
- Adding one narrowly scoped power-up answered the `more variety` note better than broad drop-rate inflation: the new focus capsule changes recovery texture without drowning the rebound loop in constant freebies.
- Patrol note: no new blocker found in this cohort pass; the rebound loop still favors control over noise.
- Next todo: if a later review still wants more power-up depth, add one offensive-only drop that changes brick routing rather than more recovery insurance.
