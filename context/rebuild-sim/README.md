# Rebuild Sim

Browser-playable settlement-defense sim built as a local catalog entry.

- Core hook: a turn-based settlement defense run where daytime survivor assignments feed a single night resolution pass.
- Session flow: assign survivors to city sectors, resolve scavenging, repairs, and border defense, then stabilize food and walls through the next dawn.
- Gameplay texture: border sectors carry the clearest breach pressure, survivors infer jobs from district type, and the event log keeps each night readable without covering the main board.

Open [index.html](./index.html) in a browser to play.

## Kojima Notes

- Durable learning: strategy-management runs need one visible survive-to milestone and one ranked next action. Faster assignment tools help, but they do not fix "what is the point?" if the player still cannot see the mission horizon.
- Fresh May 6, 2026 review follow-up stayed on the live onboarding complaint instead of redesign. The run now surfaces `Dawns Left` plus `Border Open` in the HUD, the status strip names the hottest open sector before nightfall, and the command brief priority cards are directly clickable so the first useful action takes fewer steps.
- Re-review whether the new border-open readback plus clickable priority stack is enough to calm the `too many clicks` note, or if the next cheap lift is an even stronger first-turn lockstep walkthrough after `Start Run`.
