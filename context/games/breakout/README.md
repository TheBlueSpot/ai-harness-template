# Breakout: Gravity Well

Breakout remix centered on a mouse-driven gravity well.

- Core hook: the paddle is replaced by a mouse-driven gravity well, so route planning is about curvature and timing.
- Pressure: moving gates, patrol drones, and falling pulse shots force detours through the brick field.
- Session flow: quick start, short retry loop, and clean win or loss reset screens keep runs readable.

Open [index.html](./index.html) in a browser to play.

## Sweep learnings

- The live HUD stays compact so the main playfield keeps priority.
- The help overlay explains the gravity sling without crowding the shot lane.
- Sweep note: the shot lane stays the focus during active play, so future guidance should stay edge-anchored.
- Patrol note: no new blocker found in this cohort pass; the playfield read still stays focused.
- Latest learning: the old bottom-right control strip read like shorthand and collided with the help dock, so active play now keeps the no-paddle reminder in a clearer bottom-left chip row.
- Latest learning: post-life-loss waiting needed its own louder relaunch chip, so the bottom-left strip now swaps to a relaunch-ready prompt until the next launch.
- Latest learning: the top HUD still read too much like debug shorthand, so score, lives, wave, and bricks-left now live in separate labeled chips instead of one compressed `S/L/W` bar.
- Next re-review target: capture one pressure frame after a life loss and confirm the relaunch hint still wins against drones, shots, and the live control chips.
