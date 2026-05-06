# Missile Command: Kinetic Deflector

Browser defense game built around kinetic line drawing and missile ricochet.

## Play

Open [index.html](./index.html) in a browser to play.

- Core idea: replace explosions with temporary kinetic trampolines that bounce falling warheads back into space.
- Session flow: title screen, active defense loop, and clear win or loss resets.
- HUD layout: the defense prompt stays pinned to the edge so it does not cover the launcher lane or incoming arcs, and the score/wave readout stays visible during play.
- HUD layout: the readout panel is tall enough to keep the city count and win condition on the same surface as the wave info.
- Clarity pass: the top-left readout now breaks out missiles left in the current barrage and a live status line so the four-wave win rule stays visible during play instead of hiding in flavor copy.
- Clarity pass: the title card now clears once a run starts so the live score and wave readout do not sit under duplicate copy.
- Sweep note: the opening prompt now names the top-left wave and city readout so first-run orientation stays on the same lane read as the defense.
- Asset plan: runtime manifest points at transparent CC0 Kenney images and SFX, but play remains intact with vector art and synthesized fallback audio when files are absent.
- Sweep note: the field reads from shape and position first, so incoming arcs stay easy to track even when the fallback art is active.
- Sweep note: the opening prompt now calls out the launcher lane and wave counter more directly so first-run orientation stays on the same read as the defense itself.
- Patrol note: keep the lane readable before adding more effects or denser shots.

## Sweep learnings

- Night-sky defense HUDs need a much brighter readout floor than the playfield, or score and win-state text will disappear exactly when the player is trying to read the barrage plan.

## Next todo

- If fresh feedback still wants more spectacle, add it around successful deflections or wave clears, not by weakening the contrast of the live score and win-condition panel.
