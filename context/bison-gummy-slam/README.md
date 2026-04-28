# Bison Gummy Slam

Catalog entry for a browser-playable launcher game inside `./bison-gummy-slam/`.

## Premise

Send the bison into a gummy-filled run, keep momentum through rebounds, and push for a longer chain before the course ends.

## Controls

- `Space` or the on-screen `Slam` button: slam during the run
- `Enter`: start a run
- `P` or `Esc`: pause and resume
- `R` or the on-screen `Restart` button: restart the current attempt

## Progression Loop

Each run earns coins and feeds a persistent shop. Upgrades carry across retries, so the loop is about timing slams, stretching the chain, and spending progress on stronger future runs.

## Catalog Fit

This entry is self-contained and meant to be launched directly from its own folder. It follows the catalog pattern used by the other top-level games: a direct browser loop, clear controls, and run-to-run progression that stays local to the entry.

## Patrol Notes

### 2026-04-27

- Earlier patrol work already established a strong base: the loop wakes up quickly once rebounds start, the shell restarts cleanly, and first-run clarity improved after menu and shop presentation bugs were fixed.
- This patrol found the main current sabotage bug and fixed it: the launcher could auto-fire again while the bison was still airborne, so long arcs kept getting overwritten by surprise relaunches instead of letting rebound control breathe.
- After the fix, launch cadence is easier to read. A simple sim pass dropped from about `20` launches in `30s` to about `5-6`, and the first boss contact in a no-slam run now lands around `9.8s` instead of being front-loaded by constant midair boosts.
- Onboarding is now concise enough for a first look. `Enter`, `Space`, restart, and the persistent shop all read quickly from the shell, so remaining friction is more about mechanic value than basic controls.
- The next feel problem is slam payoff. In a short logic patrol, a no-slam line cleared more queue than a naive slam-heavy line, so the signature button is not yet obviously the sticky, exciting choice.
- Next todo: tune slam payoff or timing readability so the player learns a strong `bounce -> slam -> rebound` rhythm, and keep watching whether the opening lane naturally pulls a fresh player toward the first gummy.
- Another patrol found a real clarity and progression sabotage: slam was paying score and coins immediately on button press, even in empty air, and showing `Slam hit` before any collision happened. That made the core button feel dishonest and let failed timing still drip rewards into the shop.
- Fixed: slam now only pays out on real follow-through contact instead of free midair activation. Short post-fix sim confirmed naive early mashing no longer earns fake currency, while a better-timed first slam can still push the opening chain further than a pure launch line.
- New feel takeaway: the loop is more truthful now, but it also exposes the next design problem more clearly. The first slam window still needs stronger readability or stronger payoff because the no-slam opener remains competitive unless the player catches the descent at the right moment.

### 2026-04-28

- Direct browser patrol of the opening loop found another mechanic lie: `Space` could prime a full slam before the first auto-launch ever fired, so the first input bypassed the launch rhythm and taught the wrong timing model.
- Fixed: first slam is now locked until at least one launch has happened. Early `Space` now answers with a short wait message instead of secretly kicking the bison forward from the pad.
- Current feel read after the fix: onboarding is simpler because the game now teaches one causal chain at a time: `start -> auto-launch -> descend -> slam`. That better fits the sticky-loop goal than letting standstill slam and launcher timing overlap in frame one.
- Remaining todo stays same shape: once first-launch truth is preserved, the next stickiness problem is proving that the first well-timed slam is stronger and more exciting than simply riding rebounds.
- Live browser patrol found the next honesty bug: grazing a gummy while still rising could award coins, score, and combo even though the hit dealt no damage and the queue did not advance. That made passive contact look like progress and blurred what the player should actually learn.
- Fixed: only damaging downward hits now pay coins, score, combo, and queue progress. Upward glances still bounce physically, but they no longer pretend to be successful play.
- Current opening read after that fix: the game is more truthful, but also harsher. A passive opener can still miss the intended first clear entirely, so the next patrol target is first-contact readability and whether the first good slam becomes obviously stronger than a drift-through line.
- This patrol found a smaller but still real onboarding lie in progression: the baseline bounce upgrade was flagged as already owned while still starting at `Lv 0/1`, so the shop claimed launcher control existed before its effect was actually active.
- Fixed: default-owned upgrades now initialize and load at their first real level. `Spring Hocks` starts at `Lv 1/1`, the bounce effect is active from frame one, and the shop no longer asks the player to mentally reconcile "owned" with "off."
- Current feel read after this fix: the opening is more honest because the first run now begins with the exact baseline movement the shell advertises. The next sticky-loop question is still slam value, not progression truth.
- Another patrol pass tightened readability around the opener instead of broadening the system: the track now visibly marks the first target lane, the slam window shows on the player, and the first soft opening graze tells the player to drop deeper or slam instead of silently pretending that weak contact was enough.
- Current read after that pass: onboarding truth is better and the mechanic language is clearer, but the stickiness question is still open. Sim patrol still does not prove that the first deliberate slam reliably outperforms passive drift in live-feel terms, so both active todos remain live.
- Direct browser patrol on desktop found a new onboarding sabotage in presentation, not rules: the persistent shop slab covered most of the launcher side during live play, so the player could read upgrades while missing the first visible `auto-launch -> descend -> slam` chain.
- Fixed: the live HUD now stays compact on desktop. Stats stay centered across the top, while the shop and control buttons collapse into a smaller right-side rail with a scrollable list. The opening lane and launcher side stay visible during actual play instead of hiding behind the upgrade slab.
- Current read after this fix: first-run causality is easier to parse because the player can watch the bison leave the pad and enter the target lane while still seeing coins, queue, and upgrades. The remaining feel question is still mechanic value, not shell honesty: the first strong slam needs to become obviously more exciting than passive drift.
