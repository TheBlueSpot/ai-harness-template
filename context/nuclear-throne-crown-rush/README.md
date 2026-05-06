# Nuclear Throne Crown Rush

Catalog entry for a browser-playable arena shooter inside `./nuclear-throne-crown-rush/`.

## Premise

Fight through a three-stage crown run instead of one static room. Each biome swaps the pillar layout and floor treatment, every third wave spikes into a boss push, and every clear still hands you one mutation draft before the next surge lands.

## Controls

- `WASD` or arrow keys: move
- Mouse: aim
- Click or `Space`: fire
- `1` `2` `3`: choose a mutation between waves
- `Enter`: start run or retry
- `R`: instant restart

## Run Shape

The loop stays compact but longer: clear a room, scoop toxic canisters, pick one mutation, then survive a denser next wave until the run breaks through Scorch Yard, Toxic Sump, and the Crown Vault. Boss waves punctuate the pacing while stronger hit rings, heavier impact sparks, and a harsher post-process pass make room pressure read faster.

## Latest Pass

- Late-wave continuation pass re-checked the crowded wave 6+ mix and moved the next readability lift into the room itself: sniper lanes now carry darker underpaint plus marching chevrons, brute dashes land on clearer endpoint boxes, and short source pulses separate `warning` from `fire` events without adding more HUD chrome.
- The same pass split the synthesized cue stacks harder so late rooms read by role faster: sniper warnings now climb in two quick high pings before a lower firing crack, guardian volleys add a heavier follow-through layer, and the strongest threat beats duck the music a little deeper so stacked pressure does not flatten into one blur.
- Local polish pass answered the current 5-star feedback directly: player gunfire no longer adds screen shake, enemy hits now throw brighter burst rings and denser kill payoffs, and the whole run now carries a low-fi scanline plus vignette grade instead of a flatter raw canvas.
- The run now has procedural WebAudio layers for BGM and event SFX. Title, combat, draft, damage, pickup, enemy fire, and end-state beats all have lightweight synthesized cues that stay local to this folder and unlock on first input.
- Spawn safety moved farther away from the player, especially on direct sightlines, so early wave pressure reads as routing and cover play instead of surprise edge spawns.
- Headless Chrome re-check on 2026-05-05 tightened the live read again: music now ducks under damage, mutation, guardian, and telegraph beats; sniper and brute windups paint fuller future-path warnings; and enemy bullets carry brighter glow so pressure survives the stronger scanline grade.
- Two small taste bugs also closed in that pass: gameplay keys now suppress browser-default scrolling/arrow behavior, and transient hit sparks or rings keep animating under draft and end-state overlays instead of freezing mid-burst.
- Fresh May 5 play-first polish pass pushed the run past static grading: the mutation draft now has three extra options, canister pickups burst with stronger room-read punctuation, short stage and boss banners call out pacing beats, and the post-grade gains heat streaks plus pressure pulses instead of one flat filter.
- That same pass closed a small retry-trust bug: `resetRun()` now clears held keys and mouse fire state, so restart no longer leaks stale movement or shooting into the next life.

## Next Todo

- Run one audible live-browser pass, not just headless or sim, to confirm the new warning/fire split still reads once repeated guardian volleys and hurt cues overlap.
- Re-review wave 6+ survival in direct play and watch whether the clearer lane markers improve dodge choice without making pillar kiting solve the late boss rooms for free.
- Watch whether `Phase Shells` is the right power floor. If pierce starts erasing crowd-routing decisions, trim damage carry-through before cutting the new pickup or banner punctuation.

## Catalog Fit

This entry stays isolated in its own top-level folder, launches directly from `./nuclear-throne-crown-rush/index.html`, and keeps local docs high level so the catalog stays easy to scan.

Open `index.html` directly for play; `Enter` starts or retries and `R` jumps straight back into the run.
