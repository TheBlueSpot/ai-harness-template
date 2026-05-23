# Motherload Abyss

Browser-playable mining survival run. Drill downward through denser strata, pull ore out before fuel runs dry, and survive the pressure that builds as the shaft deepens.

Open [index.html](./index.html) in a browser to play.

## Controls

- `WASD` or arrow keys to steer
- `Space` to boost the drill
- `Enter` to start a run
- `R` to restart after a wipe

## Loop

Start near the surface, carve into richer ore bands, and balance fuel against risk. Deeper routes pay more, but pressure climbs hard enough that late decisions become the run.

## Sweep Notes

### 2026-04-30 Browser Sweep

- First contact is readable: start the run, steer into the dirt, and learn pressure by doing rather than by sitting through a tutorial wall.
- Failure loop is fast and honest. A reckless straight-down line dies to pressure in about eight seconds, then restarts cleanly from one input.
- Found one real mechanic break in the survival economy: ore pockets advertised a fuel return in the run data, but mining only paid score. That meant the game said "balance fuel against deeper value" while the player could not actually claw fuel back through smart routing.
- Fixed: mined ore now restores its intended fuel bonus, so richer pockets support the survival loop instead of only padding the score line.
- Fixed another playability friction after the sweep: deeper basalt and cave layers now carry stronger visual separation, and the duplicate always-on top strip is gone so route reading stays cleaner under pressure.
- Durable learning: in survival-mining loops, resource pickups must change survival state immediately, not just end-of-run value. If the player cannot feel a pocket buy them one more push, the dig-risk loop stops being trustworthy.
