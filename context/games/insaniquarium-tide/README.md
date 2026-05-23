# Insaniquarium Tide

Browser aquarium entry in the catalog.

Open [index.html](./index.html) in a browser to play.

## Concept

- Keep the tank readable at a glance.
- Feed fish, read alien pressure early, and keep the next goal visible.
- Preserve a short restart loop so mistakes stay inside the learning cycle.

## Notes

- HUD stays edge-anchored and minimal.
- Warning cues should show up near the action, not buried in the corners.
- Keep the folder isolated from other catalog entries.

## Sweep Learnings

- Review-selected pass stayed local to `insaniquarium-tide/`: the actionable feedback was pure clarity, not systems depth. The runtime already had coin collection, alien shooting, and egg progression, but the live copy did not explain those verbs clearly enough.
- The HUD and start copy now say the exact verbs the player needs: press to drop food, sweep through coins to collect sun, release near aliens to fire, win by filling the egg meter, and lose if the fish count collapses.
- Context warnings now switch between `Sweep coins to collect` and `Release to fire` near the play space so the must-do action stays readable when the tank gets busy.
- Fresh May 6 re-review said text-only reminders still left `how do I collect money`, `why only one fish`, and `how do I win or lose` too implicit during live play. The runtime now keeps a right-edge `Run Coach` card visible after start with live feed, coin, win/lose, and school-growth readback.
- Fresh May 6 browser-entry follow-up found one shipped-runtime mismatch: the notes promised a switching in-world verb cue, but `index.html` still shipped a `game.js` build that only raised the alien warning. The shipped entry now swaps that cue between `Sweep coins to collect` and `Release to fire`, and the school coach line now says when the next fish joins so the opening tank growth reads as staged instead of missing.

## Next Todo

- Re-review whether the restored coin-side warning plus explicit `next fish joins` timer fully close the first-run clarity complaint, or if the first alien release shot still needs one stronger in-world cue near the breach line.
