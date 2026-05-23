# Ikaruga Polarity Drift

Browser-playable rail shooter remix built as an isolated catalog entry.

Open [index.html](./index.html) in a browser to play.

## What It Is

You steer a fixed-forward ship through color-coded bullet patterns. Matching enemy fire can be absorbed into shield charge, while opposite-color fire breaks the hull. The scoring layer rewards keeping a live kill chain through the wave set and boss phase.

## Play Loop

- Move up and down to stay inside narrow firing lanes.
- Swap polarity late when boss telegraphs color-specific beam lanes.
- Absorb same-color rounds to refill shield before taking opposite-color risks.
- Keep deleting targets before the chain timer expires.

## Controls

- `W` / `S` or arrow keys: move
- `J`: fire
- `Space`: swap polarity
- `Enter`: start or restart

## Sweep Learnings

- Review praise says controls and visuals already work, so best first pass is pacing relief and clearer run-state reads instead of bigger structural change.
- Wave-to-boss progression was implicit during play. A small live sector readout keeps objective context visible without adding focal-screen clutter.

## Next Todo

- Add at least one more wave set with a new lane rhythm or polarity bait so the "wanted more levels" note turns into shipped variety, not only slower tuning.
