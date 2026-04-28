# F-Zero Mode-7 Velocity

F-Zero Mode-7 Velocity is a standalone race entry built as a shell around a modular `Game` API. The page presents the race, forwards input and resize data into the simulation, and reflects the game snapshot back into the menu, HUD, and restart flow.

## Concept

- Pseudo-3D arcade racing with a strong sense of speed
- Drift-heavy handling on a narrow ribbon track
- Energy management through recharge strips and clean driving
- Three-lap sprint pressure against authored rival machines
- Fast restart flow for repeated attempts

## Controls

- `Arrow Up` or `W` accelerate
- `Arrow Down` or `S` brake
- `Arrow Left` and `Arrow Right` steer
- `Enter` or `Space` start the race
- `R` restart
- `Esc` pause or resume if supported by the game module

## Structure

- `index.html` hosts the standalone canvas entry and overlay shell
- `src/main.js` owns boot, input wiring, resize handling, animation, and `Game` integration
- `src/styles.css` provides the arcade presentation and responsive layout
- `src/Game.js` is the simulation module the shell expects to drive

## Notes

- The shell is designed to work as a direct folder entry in the catalog
- HUD text and overlay visibility are driven by `Game.getFrameState()` snapshots
- The README stays at the concept level so game implementation details remain in the source files
