# FF Turn Engine

FF Turn Engine is a standalone active-time battle entry in the catalog. It is built as a direct folder boot with a small shell around a modular `Game` class, a frame-state renderer, and a restartable battle flow.

## Concept

- Menu-driven ATB combat
- Command selection with simple enemy AI
- Clear win and lose states
- Fast restart loop for repeated runs

## Controls

- `Arrow Up` and `Arrow Down` move through commands
- `Arrow Left` and `Arrow Right` change target
- `Enter` confirms
- `Escape` cancels
- `R` restarts

## Structure

- `index.html` is the direct browser entry
- `src/main.js` handles boot, input, resize, and game loop wiring
- `src/render.js` draws the current frame state
- `src/Game.js` owns combat state and turn resolution
- `src/styles.css` provides the shell presentation and responsive layout

## Notes

- The shell reads only `Game.getFrameState()` for display data
- Implementation details stay in source files so the README stays high level
- The folder is intended to open and play on its own
