# Gauntlet Hero-Crawl

Standalone browser horde crawler built around class choice, generator pressure, and floor-to-floor key-door progression.

## Loop

- Choose one of four hero classes before the run begins.
- Break ghost generators while kiting swarms across a single oversized dungeon floor.
- Claim the dropped key, open the north door, then choose one relic at camp before the next chapter.
- Survive as long as possible for final floor, score, kill, and generator totals.

## Wanting More Pass

- Each new floor now carries its own chapter name, lore beat, and gameplay omen.
- Between floors, camp offers one of three relics with explicit stat tradeoffs so build direction is legible.
- Relics stack into longer runs through health, damage, speed, pierce, sustain, and score-routing upgrades.
- Live run meta now explains what the core stats actually buy in play, and each relic card adds a `pick if...` line so the next choice reads as a tactical answer to current pressure instead of raw numbers alone.
- Camp relic buttons no longer rebuild every frame, which fixes the reported end-of-floor click bug where a valid pick could vanish before the browser delivered the `click` event.
- Combat now has a native synth score, sharper hit and clear stingers, stronger impact flashes, and screen-space pulse/shake feedback so swarms, key beats, and relic picks read faster.
- Dungeon rendering now adds stronger generator glows, projectile halos, exit-beam reads, and low-cost post processing so threat density rises without burying the play space in text.

## Sweep learnings

- If overlay choice cards rebuild on every animation frame, browser `click` can die between pointer down and pointer up even though the game logic is correct. Stable DOM ownership matters as much as correct progression state.
- Horde crawlers benefit from short event-owned audio and screen cues more than constant loud ambience. The best polish is brief confirmation for damage, clears, and rewards, then immediate return to readable movement.
- Raw stat abbreviations are not enough once runs add relic drafting. Players need one short line that says what each stat changes in play and why a new relic is the right answer for the pressure they just felt.

## Heroes

- `Warrior`: high-health cleave fighter.
- `Valkyrie`: fast spear skirmisher with long melee reach.
- `Wizard`: piercing ranged caster.
- `Elf`: rapid-fire archer built for kiting.

## Controls

- `WASD` or arrow keys: move
- Mouse: aim
- Hold mouse button or `Space`: attack
- `Enter`: start run or retry instantly after result
- `R`: restart immediately from play or result
- `Esc`: return to hero select from the result screen

## Notes

- Open [index.html](./index.html) in a browser to play.
- The strongest runs come from balancing generator denial against survival pathing instead of full-clearing each room on instinct.

## Next todos

- Re-smoke one intermission after floor clear and confirm the new `pick if...` readback stays legible on smaller browser widths and still fits beside the relic flavor line.
- Re-review floor-three and floor-four enemy pressure now that the new audio/flash layer makes danger clearer; tougher late layouts may be safe again.
- Smoke one full relic run with mouse-only camp picks and confirm no browser still loses the click on slower machines.
