# Excitebike Trackflow

Standalone browser motocross run with direct folder boot.

## Play

Open [index.html](./index.html) in a browser to play.

## Controls

- `A/D` or left and right arrows steer
- `W` or up arrow adds throttle
- `S` or down arrow brakes
- `Enter` starts or restarts

## Loop

Hold speed, stay balanced on the track, and clear the lap goal. The shell keeps the HUD on the edge and the result overlay in sync with the game state.

## Notes

- The entry is meant to boot from the folder without a harness step.
- The presentation stays compact so the track remains the main read.

## Sweep learnings

- May 2, 2026: the direct `file://` path was the real blocker, not the button logic. Browser module CORS stopped `./src/main.js` from loading, so the menu never initialized and `Start` looked dead. The entry now ships a classic `./game.js` boot path so folder-open play works again.
- May 5, 2026: fresh headless browser smoke showed the real onboarding miss had moved into active play. The first-crest guidance was crammed into tiny top-right HUD text while most of the frame was empty sky, so the opener now uses a dedicated hazard dock that names the next jump, mud patch, or boost before the bike reaches it.
- May 6, 2026: the cheapest follow-up was later-lap readback, not more speed tuning. The generic `Next jump` copy was fine for the opener but too vague once the triple crest immediately fed into the soft bend, so the dock now names that sequence as one chained move instead of two disconnected surprises.

## Next todo

- Re-check whether the chained triple-crest callout is enough once the bike is moving at full pace, or whether the late boost also needs the same `what happens right after this` readback treatment.
