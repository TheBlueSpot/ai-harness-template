# Panel Panic Rising

`./panel-panic/` is a browser-playable rising-stack swap puzzler inspired by versus panel-clear games. The loop is about holding the stack below the ceiling, finding quick 3-in-a-row clears, and manually raising the board only when you can convert that pressure into combos or chains.

## Play

Open [index.html](./index.html) in a browser.

## Controls

- `Arrow keys`: Move the cursor
- `Space`: Swap adjacent panels
- `Shift`: Raise the stack faster
- `Enter`: Start or restart

## Goal

Reach the target score before the stack touches the ceiling. Speed rises as score climbs, so the safest route is to keep one clearable section near the cursor instead of overbuilding the whole board.

## Sweep Learnings

- Fresh May 5, 2026 polish pick stayed game-local and browser-safe: `./panel-panic/index.html` still boots directly, and the strongest leverage was feedback, not new systems.
- This puzzler benefits from a metronomic audio bed instead of busy melody. A light bass pulse plus short move, swap, rise, clear, danger, win, and lose cues makes the stack feel active without drowning cursor reads.
- Clear payoff lands best as layered punctuation: spark bursts, expanding rings, restrained shake, and a small board pulse make combos feel earned while keeping panel colors legible.
- A low-cost post pass helps danger read faster here. Scanlines, vignette pressure, and warm combo flashes strengthen the arcade tone without adding HUD clutter.
- One small correctness miss was hiding in plain sight: the README promised `R` restart, but the runtime only handled `Enter`. Wiring `R` back in keeps retry speed aligned with the documented controls.

## Next Todo Notes

- Re-review whether the danger pulse is the right intensity once the stack sits near the ceiling for longer stretches; if fatigue shows up, trim the red vignette before cutting clear effects.
- Watch longer sessions for audio repetition. If the bass loop starts to feel too samey, vary the high-note rhythm before adding more instruments.
