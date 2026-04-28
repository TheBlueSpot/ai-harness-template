# Star Fox Polygon Strike

Star Fox Polygon Strike is a stand-alone catalog entry built around a canvas shell and a modular `Game` core. The page handles boot, input, resize, HUD state, and overlay presentation while the simulation owns the rail shooter rules.

## Concept

- 3D-to-2D rail shooter with banked flight and formation pressure
- Enemy waves that read as polygons, squadrons, and boss weakpoints
- Fast restart flow with a clear mission state and end-of-run feedback

## Structure

- `index.html` hosts the standalone canvas, HUD, and overlay scaffolding
- `src/main.js` owns page boot, input wiring, resize handling, and frame syncing
- `src/styles.css` provides the responsive presentation layer for the shell

## Notes

- The shell mirrors `Game.getFrameState()` for score, health, progress, boss alerts, and restart messaging
- The entry is meant to work from the folder root without extra app chrome
- Game rules stay inside the `Game` module; the shell only presents state
