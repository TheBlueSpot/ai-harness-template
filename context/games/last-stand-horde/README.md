# The Last Stand Barricade Survival

The Last Stand Barricade Survival is a self-contained browser defense run in `last-stand-horde/`. Each run alternates between daylight scavenging and nighttime barricade defense, with the whole loop playable directly from the local folder.

## Loop

- Sweep three daytime scavenging stops for scrap, ammo, and occasional medical supplies
- Return to the barricade before sundown to repair boards, buy ammo, or install a sturdier wall tier
- Hold the lane at night against walkers, runners, and brutes that choose targets by scent and proximity
- Survive through the final dawn while keeping the player, barricade, and survivor group alive

## Controls

- `WASD` or arrow keys to move
- Mouse to aim
- Click or `Space` to fire
- `F` to shove with melee
- `E` to scavenge or patch the barricade
- `Enter` to start
- `R` to restart

## Notes

- `index.html` is the direct browser entry for the standalone game
- The simulation stays inside `src/` and feeds frame snapshots into the HUD and renderer
- The README stays high level so game-specific implementation detail remains in source files
