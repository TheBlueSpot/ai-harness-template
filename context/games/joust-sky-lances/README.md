# Joust Sky Lances

Standalone browser arcade entry about hover duels and nest denial.

Open [index.html](./index.html) in a browser to play.

## Concept

You are a sky knight clearing a four-wave circuit of airborne riders. The clash rule stays simple: win from above. Every dismounted rider drops an egg, and each egg becomes a fresh threat if you do not swoop in and secure it first.

## Play Shape

- Hover-lift movement keeps the player near the action instead of on a heavy HUD tutorial loop.
- Enemy danger tells appear around riders before hard dives, so reads happen where the duel is happening.
- Retry is immediate with `Enter` from the result screen or `R` at any time.

## Controls

- `WASD` or arrow keys: steer
- `Space`: flap for lift
- `Shift`: spend surge meter for a fast recovery burst
- `Enter`: start or restart after a result
- `R`: reset the run immediately

## Files

- `./index.html` boots the game directly in a browser.
- `./src/` contains the isolated game logic, rendering, and styling for this entry only.
