# Bionic Grapple Breakout

Browser-playable grapple platformer about chaining swings, rebounds, and boost rings through a five-sector prison break.

Open [index.html](./index.html) in a browser to play.

## Loop

Build speed with grapples, bounce pads, and boost rings, dodge turret and drone pressure, collect every battery, and reach the exit gate. Checkpoints keep retries short so the run stays about route execution.

## Controls

- `A/D` or arrow keys move
- `Space` jumps
- Hold mouse or `E` to fire and hold the grapple
- `Enter` starts
- `R` restarts

## Latest pass

- Fresh May 6 grounded browser repro kept the live 5-star row valid and exposed one concrete trust bug: `R` from the down state was doing a full restart even though the HUD promised checkpoint retry. That retry path now returns to the last activated checkpoint instead of throwing the player back to spawn.
- The audio pass deepened the run without widening scope: the music bed now carries more low-end pulse and percussion, and start, retry, latch, boost, checkpoint, and turret warning beats all read more clearly in the moment.
- The render pass adds stronger active-checkpoint, battery-guide, and threat-callout readback plus fuller glow on trails, rings, and sparks, while keeping the grade slightly more controlled instead of simply making every particle louder.

## Next check

- Re-review a live Stage 2 into Stage 4 route and confirm the fuller mix plus louder checkpoint and threat callouts stay supportive under sustained turret pressure instead of tipping into fatigue or visual clutter.
