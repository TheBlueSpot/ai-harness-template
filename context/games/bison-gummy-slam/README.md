# Bison Gummy Slam

Catalog entry for a browser-playable launcher game inside `./bison-gummy-slam/`.

Open [index.html](./index.html) in a browser to play.

## Premise

Send the bison into a gummy-filled run, keep momentum through rebounds, and push for a longer chain before the course ends.

## Controls

- `Space` or the on-screen `Slam` button: slam during the run
- `Enter`: start a run
- `P` or `Esc`: pause and resume
- `R` or the on-screen `Restart` button: restart the current attempt

## Progression Loop

Each run earns coins and feeds a persistent shop. Upgrades carry across retries, so the loop is about timing slams, stretching the chain, and spending progress on stronger future runs.

## Local Notes

- Durable strength: the loop now teaches one readable causal chain at a time. Launch, descent, slam timing, compact HUD, follow camera, and between-run upgrades all align with the core rebound fantasy instead of fighting it.
- Durable fixes already landed: fake slam rewards are gone, rising-contact and pre-launch slam exploits are closed, result-screen coin duplication is closed, focus loss pauses the run, and live upgrades no longer mutate a run mid-attempt.
- Current pass: the opening now coaches the player more directly. A live `Next move` card, stronger first-target beam, and a modest opener burst make the first good slam easier to read and more obviously worth chasing.
- Durable onboarding risk: the opening lane is finally reachable across common desktop sizes, but the first strong slam still is not obviously better than passive drift unless the player catches the descent cleanly.
- Next local focus: improve first-slam payoff or readability so `bounce -> slam -> rebound` becomes the clear sticky choice rather than merely one viable opener.
