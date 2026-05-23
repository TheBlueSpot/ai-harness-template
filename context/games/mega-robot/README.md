# Mega Robot

Browser platformer about climbing a robot fortress, timing jumps, and clearing enemy armor.

## Play

Open [index.html](./index.html) in a browser to play.

## Concept

The entry focuses on compact movement and readable combat states. The player can run, jump with variable height, fire shots, and recover from wall contact with a short kick lockout. Stage pressure comes from robot patrols, shielded targets, and a core fight at the top of the fortress.

## Controls

- `A` / `Left`: move left
- `D` / `Right`: move right
- `W`, `Up`, or `Space`: jump and hold for a higher arc
- `J` or `Ctrl`: fire the current weapon
- `1` / `2`: swap weapons after boss reward unlocks the sniper shot
- `Enter`: start or restart from menu states
- `R`: restart the current run

## Sweep Note

- Opening route and wall-kick forgiveness were tuned so the first climb reads as a learnable movement test instead of a brittle opener.
- The wall catch window stays a little wider so the first climb keeps intent after small miss-taps.
- The opening route keeps a reachable next goal visible while the fortress climb teaches wall contact, weapon swap, and the core shutdown loop in order.
- Wall launch timing stays loose enough that the first climb still reads under pressure.
- The first ascent stays framed as one climb path, so the player sees the next ledge while the recovery window does the teaching.
- Side grazes now stay side grazes, so wall contact no longer jumps the player onto the roof of a platform.
- Fresh pass from the latest review tightened wall-kick collision so jump-outs stop phasing through tower walls, while the run speed and camera lead now make the climb read faster and keep the active route centered.
- Fresh May 6 follow-up stayed on the same review row instead of broadening scope. Ground and air acceleration now step up again, and the camera uses a stronger forward lead plus faster airborne catch-up so the next ledge and landing space stay in frame during climbs instead of lagging behind the player.
- Durable learning: in side-view climb shooters, speed buffs alone do not fix `camera feels bad`. The view needs to lead the committed direction and climb arc early enough that the next landing read arrives before the player does.

## Patrol Notes

- Keep the opening climb readable before adding more fortress complexity.
- Preserve the wall-contact forgiveness that makes the first route learnable.
- The first climb now keeps side grazes from snapping into roof landings, so wall contact stays readable.
- Next check: verify the new airborne camera catch-up still feels stable during boss volleys on shorter laptop-height windows and does not oversell vertical motion near the top arena.
