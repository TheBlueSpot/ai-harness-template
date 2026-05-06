# Gradius Option-Drive

Gradius Option-Drive is a stand-alone browser shmup entry built around a local canvas shell, a trailing option system, and a power-up bar loop.

Open [index.html](./index.html) in a browser to play.

## Concept

The run focuses on lane pressure, shield management, and boss phases that make the player read the screen quickly. The shell keeps the game playable from the folder root and leaves all combat rules inside the `Game` module.

## Controls

- `Arrow Keys`: move through the lane grid and line up shots
- `Hold Space`: fire and confirm menu actions
- `Shift` or `X`: activate the current power-up bar slot
- `Enter`: start or restart from overlays

## Play Loop

- Build the power-up bar with capsule pickups, then trigger the selected reward when you need it
- Keep the shield up while clearing waves and side threats
- Push through the boss phase, expose the core, and restart cleanly after a clear or failure

## Sweep Notes

- Durable strength: the loop reaches meaningful phase pressure quickly, and retry remains brisk enough for sticky arcade replay.
- First-contact clarity now teaches the signature power bar in live play: the opening overlay names the first `SPEED` spend, the HUD points to the first capsule, and the meter stays visibly unarmed until that pickup lands.
- Durable clarity fix already landed: boss guidance and power-bar readiness now stay visible together, and stale post-spend readiness text no longer lingers after activation.
- Fresh May 6, 2026 review follow-up stayed narrow around the remaining `too fast`, `bullets should be bigger`, and `where are the powerups?` residue: player fire and weapon variants now read chunkier, capsules draw larger in the lane, and the first enemy waves arrive a beat later so the opening power-up lesson has room to land.
- Next local focus: re-check whether the calmer opener still preserves enough mid-run threat, or if only the boss/core phase now needs the old density back.
