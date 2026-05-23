# Battle City Ricochet

Browser-playable tank defense about holding one bunker lane, then adapting as the maze opens up.

- Core hook: a base-defense tank maze where brick cover is temporary, steel lanes create ricochet shots, and one exposed bunker angle can end the run.
- Session flow: hold the eagle through one compact wave, break open safer firing routes, and clean up the last flankers before they line up on the base.
- Gameplay texture: the opening teaches one simple bank shot through the center, then falling brick walls force faster lane rotation and stricter shell reading without adding HUD clutter.

Open [index.html](./index.html) in a browser to play.

## Notes

- Fresh May 5, 2026 review pass found a real first-wave blocker in the shipped runtime: enemy tanks were spawning inside steel tiles, which made the opening pressure read broken instead of deliberate. The top spawn points now sit on open top-lane cells so the first wave enters cleanly and the ricochet lesson starts with moving threats instead of trapped armor.
- After failure, the HUD should switch to truthful end-state language instead of live-count telemetry.
- Re-review whether the restored top-lane spawns create enough early pressure variety, or if the center entry still needs one lighter route tell before the side lanes start opening.
