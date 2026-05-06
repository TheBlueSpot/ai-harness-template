# Relic Swarm Arena

Standalone browser arena survival game about reading enemy tells, cutting a compact swarm, and choosing one of three relics between waves.

## Loop

- Move the vault warden through four short breach waves with immediate eight-direction movement and a short dash.
- Auto-fire keeps the main read on route choice while skitters rush, dashers draw amber charge lines, and shard casters paint red aim beams before they fire.
- Each cleared wave pauses for one of three relic picks so the next push always starts from a visible tradeoff instead of hidden stat drift.
- The active HUD always names one next goal: clear the current threat quota, earn the next relic break, then finish the final seal wave.

## Controls

- `WASD` or arrow keys: move
- `Space` or `Shift`: dash
- `1` `2` `3` or click: choose a relic during breaks
- `Enter`: start or retry
- `R`: full restart

## Notes

Open [index.html](./index.html) in a browser to play. This entry stays isolated inside `./relic-swarm-arena/` and boots directly without a server.

## Sweep Learnings

- Durable learning: compact arena runs stay readable when the only live goal is explicit in the HUD and every enemy tell also previews the future collision path, not just that danger exists.
- Durable learning: relic breaks work better as short wave punctuation than as long shop scenes when the game wants restart-fast pressure and one immediate next decision.
- Local browser verification passed on May 2, 2026 with direct `index.html` Chrome headless screenshots at `./.local-relic-swarm-arena-title-2026-05-02.png` and `./.local-relic-swarm-arena-play-2026-05-02.png`, including a live-play boot through `?autostart=1`.
