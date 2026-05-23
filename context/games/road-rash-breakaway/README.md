# Road Rash Breakaway

Standalone browser combat racer built as one isolated catalog entry.

Open [index.html](./index.html) in a browser to play.

## Concept

- The run is checkpoint-led. Every gate refills the sprint clock, so the player is always balancing clean traffic lines against short, risky takedown windows.
- Rival riders teach the melee rhythm in play: when they drift up on a flank, the near-bike warning and side arc telegraph that it is time to swipe instead of over-steering.
- Traffic pressure stays readable because the HUD only carries speed, timer, bike integrity, and run pressure while the must-react cues stay on the road around the bike.

## Notes

- Retry is instant so failed passes and missed swipes stay inside the learning loop.
- Controls stay simple: steer, throttle, and one melee input.
- Direct folder boot uses only local files, so the entry can open straight from `index.html`.
- 2026-05-06 improvement pass: corrected the road projection so checkpoints, traffic, and lane bands now travel toward the player instead of reading like reverse motion.
