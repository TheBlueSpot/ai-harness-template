# Punch-Out Parry Counter

One-screen boxing duel built as an isolated browser entry.

## Play

Open [index.html](./index.html) in a browser.

## Hook

Read the rival's telegraph near the gloves, evade with a slip or duck, then cash the opening into quick counters before the next pressure cycle starts.

## Controls

- `Enter`: start or restart
- `Left` / `Right`: slip
- `Up`: reset to center
- `Down`: duck
- `Space`: jab
- `X`: hook
- `Z`: star punch when the star meter is full

## Notes

- The HUD keeps hearts, phase, and rival health visible at once so the next decision stays readable under pressure.
- Restart is immediate, so failed reads stay inside the same lesson loop.
- The opponent telegraph and center-reset flow stay visible without forcing a long recovery pause.
- The opening cue stays near the gloves, so the player can read the next slip or duck without pulling attention away from the bout.
- The star punch now gives a direct meter reminder when the finisher is empty instead of failing silently.
- Patrol note: keep telegraphs near the gloves and preserve the fast restart loop.

## Learnings

- Fresh polish pass confirmed the strongest improvement was not more verbs but stronger punctuation on the existing ones: generated BGM, sharper punch/parry SFX, impact sparks, and a warmer counter-window wash make the same read-counter loop feel more decisive without adding HUD clutter.
- The high-rating dislike about low damage was directionally right. Raising clean counter payoff makes each successful read feel worth the risk and keeps the fight from overstaying the core lesson.
- Direct browser play had one real interruption bug: if the tab lost focus while a movement key was held, the boxer could return stuck slipping or ducking. Clearing held input on blur and tab hide keeps resume behavior trustworthy.
- The ring benefits from mild post-processing more than larger UI. Scanlines, vignette, and crowd-light pulses add bout atmosphere while keeping cue text and glove telegraphs readable.

## Todo

- Re-review whether the stronger counter damage plus star punch burst now land in the right range, or if phase-three health still asks for one more trim.
- If future readability slips, prefer moving more cue emphasis onto glove silhouettes before growing the center cue card further.
- Add one compact mute toggle if longer repeat sessions start making the generated soundtrack fatiguing.
