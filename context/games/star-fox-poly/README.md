# Star Fox Polygon Strike

Star Fox Polygon Strike is a stand-alone browser rail shooter about banked flight, formation pressure, and surviving a short mission without losing control clarity.

## Play

Open [index.html](./index.html) in a browser to play.

## Concept

- 3D-to-2D rail shooter with banked flight and formation pressure
- Enemy waves that read as polygons, squadrons, and boss weakpoints
- Fast restart flow with a clear mission state and end-of-run feedback

## Notes

- The shell stays light so score, health, progress, and boss alerts read quickly during flight.
- Control honesty matters before feel tuning. If the shell advertises alternate steering paths, they must be live on frame one or the player learns distrust before they learn the mechanic.
- First-run trust improved once the menu stopped depending on one tiny CTA. The route now launches from any overlay tap/click, which matches how players probe browser games before reading full instructions.
- The opening stretch now runs slower for longer so lane-dodge onboarding lands before wave pressure spikes.

## Next Todo

- If another review still calls the route too fast, trim enemy and projectile speed during the first non-boss stage instead of only slowing forward scroll.
