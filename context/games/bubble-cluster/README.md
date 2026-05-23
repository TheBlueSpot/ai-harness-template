# Bubble Cluster

Browser bubble shooter entry for the catalog.

Open [index.html](./index.html) in a browser to play.

## Concept

The board hangs from the ceiling while the player banks shots off the side walls to connect color groups. Matching clusters pop, unsupported bubbles fall, and the ceiling drops lower whenever too many shots fail to convert.

## Play Loop

- Aim with the mouse or arrow keys.
- Fire with click or `Space`.
- Clear four escalating boards before the descending stack reaches the shooter line.

## Sweep Learnings

- Bank shots and falling detached clusters are still the core feel hook here, so the strongest polish is to make those reads louder before adding new mechanics. Reactive chirps, drop thumps, and short screen-space toasts make good angles feel earned without slowing the loop.
- Bubble shooters benefit from a light music bed that tracks danger instead of a full melody. A sparse bass pulse with brighter top notes as the stack descends adds tension without competing with aim reads.
- Pop and fall feedback land better with clean rings, sparks, and motion tails than with larger raw flashes. The board stays readable while successful clears still feel noticeably stronger than dry shots.
- Pointer-first aiming had a small control hitch: once the mouse touched the canvas, arrow-key aiming no longer reclaimed control until the pointer left. Clearing stale pointer aim on keyboard input keeps recovery shots reliable for players who swap between mouse and keys.
- The review-store "could there be power ups" ask fits best as a low-frequency reward that amplifies the existing bank-and-pop loop instead of replacing it. The shipped prism shot now comes from strong clears, surfaces in the live HUD, and locks to the best adjacent color so variety arrives through better reads rather than a separate subsystem.

## Next Todo Notes

- Re-review the round-three and round-four board seeds for one or two cleaner comeback lanes. The new prism shot adds comeback texture, but a few low rows can still front-load too many same-color dead ends after a ceiling drop.
- Add a compact mute toggle if this entry keeps the generated music pass. The current audio layer is intentionally light, but longer replay sessions still need a fast silent option.
- Re-smoke a late round and confirm prism cadence stays special instead of crowding out normal bank-shot reads once higher-color boards start producing bigger pops.
