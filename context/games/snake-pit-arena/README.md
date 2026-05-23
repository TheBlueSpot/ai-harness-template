# Snake Pit Arena

Standalone browser arcade game about surviving a crowded snake pit one stage at a time.

## Loop

Guide the player snake through each arena, eat enough pellets to unlock the gate, then cross the exit before rival snakes trap the route. Later stages add more rocks, more rivals, and tighter escape lanes.

## Controls

- `WASD` or arrow keys: steer
- `Space`: boost for a faster cut across the grid
- `Enter`: start or continue
- `R`: restart the full run

## Notes

Open [index.html](./index.html) in a browser to play. The game is fully isolated inside `./snake-pit-arena/`.

## Sweep Learnings

- Fresh May 2, 2026 review target was valid for a polish-only pass: `snake-pit-arena` already held a 4-star rating, with the main taste ask centered on SFX, BGM, and general feel rather than structural redesign.
- Fresh May 6, 2026 direct browser re-smoke kept that read intact. The stored 4-star review still points at presentation polish, not missing mechanics or a broken loop.
- Fresh May 6, 2026 follow-up polish after that re-smoke found the best remaining leverage in immediate board readback, not more constant spectacle. The pit already had warning lines and ambient mix, but it still hid two small but important reads: where heads were committing next and when boost had actually come back online after a panic sprint.
- Fresh May 6, 2026 polish follow-up stayed on the same local ask and found the cheapest remaining taste bug in the boost loop, not the route logic: holding boost was retriggering the chirp every accelerated step, so the move had energy but not discipline once the player feathered speed under pressure.
- The latest local pass leans into authored readback instead of bigger systems. Projected next-cell guides for the player and rivals, a recharge sting plus pulse when boost refills after heavy spend, stronger rock bevels, and failure copy that distinguishes walls, rocks, self-folds, and rival cuts make short deaths easier to parse on the next attempt.
- This follow-up pass makes the pit feel more authored between collisions too. Stage-tinted floor glow, drifting ambient motes, cleaner centered body segments, gate orbit sparks, and a brighter boost wake add motion and readability without changing snake routing or HUD load.
- The audio bed now has more shape than one repeating synth line. Layered impact cues, a low kick pulse, light offbeat hiss, and threat stabs under pressure give stage momentum and danger escalation without hiding the warning chirp or gate-open readback.
- The biggest hidden correctness drag was stage seeding, not combat math. Random rocks could land too close to the player lane, enemy spawns, or the exit corner, which made some openings feel unfair before the first real decision.
- This loop benefits more from punctuation than from new systems. Lightweight synth cues, a pressure-reactive bass pulse, gate bursts, cutoff debris, boost trails, shake, and a restrained vignette made the pit feel more alive without changing the core snake-routing read.
- The next worthwhile clarity layer was imminent-rival pressure, not more constant FX. A short warning chirp, red lane tell, and player danger ring make closing head-on lanes easier to read before a rival body suddenly owns the space.
- Short-lived toast messages read better than permanent state text here. Gate-open and cutoff callouts now teach the next move, then get out of the way before the arena clutters.
- The stored broken-note was accurate: particles were drawing under the snakes, which dulled boost dust and cutoff payoff right when the player needed the hit punctuation most. Keeping the burst layer above bodies fixes the read without changing the board state.
- Browser boot also had a quiet polish bug: the audio engine eagerly created `AudioContext` during load and triggered autoplay warnings before the first gesture. Deferring audio startup to the real start input keeps boot clean and still preserves the mix once play begins.
- UI parity bug worth keeping fixed: the overlay button was missing the stage-sting cue that the Enter path already had, which made mouse-driven stage starts feel flatter than keyboard starts for no design reason.
- Local browser verification passed again on May 6, 2026 through direct `index.html` boot in headless Chromium, a successful Enter-to-start smoke, and fresh screenshots at `./.local/snake-pit-arena-post-title.png` plus `./.local/snake-pit-arena-post-play.png`.
- Fresh May 6, 2026 direct-file smoke after this pass still booted cleanly with no console or page errors. The bounded Playwright probe reached live play, consumed pellets/boost, then returned a valid overlay state later in the short session; fresh proof lives at `./.local/snake-pit-arena-verify-2026-05-06.png` and `./.local/snake-pit-arena-smoke-2026-05-06.json`.

## Next Todo Notes

- Re-review whether the new warning chirp and red threat wash stay helpful under repeated near-misses, or whether stage-three and stage-four pressure want the same telegraph with a slightly quieter mix.
- Re-review whether `Audio Full` is the right default once the new mix has more repeated exposure; if fatigue shows up, reduce music gain before trimming event cues.
- Re-review whether the new kick-plus-hiss bed stays supportive instead of repetitive during a longer four-stage clear; if fatigue shows up, vary rhythm first before cutting event punctuation.
- Re-review whether the new next-cell guides stay helpful under stage-four crowding, or whether enemy intent boxes should fade earlier once the threat-line telegraphs already cover the same read.
- Re-review whether the new boost-frame border and wake stay helpful under panic sprints, or whether late-stage danger already has enough edge treatment without that extra speed read.
- Re-review whether the new boost-ready sting is satisfying or too eager during safe cleanup laps; if it starts to feel chatty, gate it behind active threats before lowering its gain.
- Watch late-stage busy frames for particle excess around repeated boosts and rival cutoffs. If the arena starts to smear, thin boost dust first before cutting gate feedback.
- Re-review whether the new crash burst plus crash cue are strong enough to teach failure cause immediately, or whether rival-body collisions still need one clearer directional tell before impact.
- If future feedback still wants more polish, prefer one stronger stage-transition card or finale punctuation over adding more always-on HUD chrome.
