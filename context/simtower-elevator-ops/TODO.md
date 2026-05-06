# SimTower Elevator Ops Todo

## 2026-05-02

- Evidence: booted from `./simtower-elevator-ops/index.html`; the game now shows the live goal plus a concrete next dispatch card so the first action reads without opening help.
- Next: if feedback still says the loop feels flat, tune surge cadence or add one second-stage surge pattern instead of widening the ruleset.

## 2026-05-06

- Evidence: cheap sweep found no direct-boot break here, but the remaining blocker-grade taste gap was still pacing and loop clarity. The shipped pass now stages the run through a lower-floor warmup, opens the full tower only after a real dispatch or a short grace window, and exposes named surge phases plus a visible rotation timer.
- Verify: `node --check ./simtower-elevator-ops/game.js` passed. A Bun sim pass kept idle play in `phase=play` with `score=0` after about 35 seconds instead of drifting into an accidental win, while a small scripted dispatch sequence held max queue near `6.58` instead of the idle `22.809`.
- Next: if fresh feedback still says the game feels flat, add one more authored late-shift pattern or clearer passenger-direction tells before expanding the system surface.
