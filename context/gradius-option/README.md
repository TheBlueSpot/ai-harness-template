# Gradius Option-Drive

Gradius Option-Drive is a stand-alone browser shmup entry built around a local canvas shell, a trailing option system, and a power-up bar loop.

## Concept

The run focuses on lane pressure, shield management, and boss phases that make the player read the screen quickly. The shell keeps the game playable from the folder root and leaves all combat rules inside the `Game` module.

## Controls

- `Arrow Keys`: move through the lane grid and line up shots
- `Hold Space`: fire and confirm menu actions
- `Shift` or `X`: activate the current power-up bar slot
- `Enter`: start or restart from overlays

## Play Loop

- Build the power-up bar with capsule pickups, then trigger the selected reward when you need it
- Keep the shield up while clearing waves and side threats
- Push through the boss phase, expose the core, and restart cleanly after a clear or failure

## Patrol Notes

### 2026-04-27

- Browser patrol found and fixed a launch blocker: starting from the menu threw a runtime error and left the overlay stuck on screen.
- Early loop is readable once the run starts: enemy packs enter from the right in clean lanes, pickups stand out, and restart remains immediate.
- Main friction in the first short run is onboarding clarity. The game depends on `Shift` or `X` to cash in the power bar, but the shell does not teach that in the moment the first pickup lands.
- Feedback also muddies reward payoff a bit after activation. In patrol, the alert still read `MISSILE ready` after the weapon had already switched, which makes the reward state feel less crisp than the shooting itself.
- Short progression pass reached `720` score and the `MISSILE` weapon in about 18 seconds, but did not naturally reach the boss phase yet. Next patrol should check whether the boss arrives soon enough to keep the loop sticky.
- Follow-up patrol hit boss shield at about `9.5s` and boss core at about `20.4s` in a safe-fire run, so macro pacing is tighter than the first pass suggested. Run reaches a meaningful phase change fast enough to support sticky arcade replay.
- New friction showed up once boss pressure started. Boss directive text overwrote power-up readiness, so capsules still advanced the bar but the moment-to-moment choice got quieter exactly when the player most needed clarity.
- Control teaching still weakest part of first-contact feel. Shooting, movement, and restart all read cleanly, but power-bar spend remains hidden knowledge unless the player already guesses `Shift` or `X`.
- Failure state is readable and brisk. Losing a life dropped shield pressure immediately, restored the ship, and kept the run moving instead of stalling in a long reset.
- Short browser verification confirmed play surface still loads cleanly from menu into live run with no launch regressions.
- Short simulated play pushed harder and exposed a sharper loop issue: first meaningful score landed around `2.8s`, boss shield around `6.1s`, boss core around `8.9s`, and full clear around `11.9s`, but the first collected capsule did not register on the power bar until after the core phase had already opened. That makes the signature power-up economy arrive too late to anchor first-contact stickiness.
- Starting ship lane also sits below the earliest enemy corridor, so a passive or timid first run can read flatter than the combat system really is until the player climbs upward into traffic.
- Next todo: teach power-bar spend at first non-zero pickup, and keep boss guidance plus current power slot visible at same time instead of letting one erase the other.
- Next todo: pull first power-bar reward forward so the player makes at least one clear upgrade choice before or right as the boss begins, not after the boss loop is already dominating attention.
- Logic patrol confirmed why the first upgrade feels late instead of merely hidden: the boss wakes at `>800` score, while each kill drops a slow left-drifting capsule from the enemy's death lane, so an accurate forward-fire run can start the boss before the first pickup physically reaches the ship.
- Fixed one clarity break in the boss loop: HUD alerts now keep boss directive text and power-bar readiness visible together, so `MISSILE ready` or later slots no longer disappear the moment shield/core messaging starts.
- Another short sim pass showed the first-contact lane read is still doing too much work. The first wave does not arrive until about `1.9s`, and a cautious low-line run did not land its first kill until about `8.0s` or collect its first capsule until about `16.9s`, so the opening can feel emptier than the combat loop really is unless the player already climbs into the active corridor.
- Harder pickup-chase play also exposed a feel trap: rushing upward or rightward to meet the first capsule tends to cause earlier damage before the reward loop has paid anything back. That makes the intended risk-reward read feel punitive instead of exciting on first contact.
- Logic patrol found one more clarity leak after reward use: spending a primed slot reset the bar and switched the weapon, but the HUD alert could keep the old readiness message alive because it only replaced alerts when a new boss or power message existed. That stale text undermined payoff readability exactly at the moment the reward should feel crisp.
- Fixed that alert leak in the game state update. A short state simulation now shows `MISSILE` equip, power bar reset to `SPEED`, and empty alert text in the same frame after activation instead of carrying the old primed callout forward.
- Next todo: reduce first-wave lane-guess friction so the starting ship line, first enemy corridor, and first capsule path overlap sooner. The early loop wants a near-immediate "shoot, move, collect, spend" lesson instead of making the player discover the correct vertical band first.
