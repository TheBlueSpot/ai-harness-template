# DK Barrel-Blast

DK Barrel-Blast is a self-contained browser entry in the catalog. It plays directly from the folder `index.html` and keeps its own run state, drawing, and input bridge inside the game folder.

## Loop

- Start from the menu or press `Enter`
- Climb the girders with ladders, then use blast barrels to skip dangerous gaps
- Dodge rolling barrel pressure and circular zinger hazards
- Collect the bananas, reach the top lane, and finish the run
- Restart immediately from win or lose states

## Controls

- `Left` / `Right` or `A` / `D` move
- `Up` / `Down` or `W` / `S` climb ladders
- `Space` jumps
- `Up` inside a blast barrel also triggers the launch
- `Enter` starts play
- `R` restarts from any state
- The start button in the overlay also begins the run

## File Roles

- `index.html` holds the shell, HUD, and overlay
- `src/Game.js` owns the run state and frame snapshot
- `src/render.js` draws the playfield and actors
- `src/main.js` bridges DOM input, animation, HUD text, and restart flow
- `src/styles.css` handles the entry styling
