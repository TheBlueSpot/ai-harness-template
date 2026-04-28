# Gauntlet Hero-Crawl

Standalone browser horde crawler built around class choice, generator pressure, and floor-to-floor key-door progression.

## Loop

- Choose one of four hero classes before the run begins.
- Break ghost generators while kiting swarms across a single oversized dungeon floor.
- Claim the dropped key, open the north door, and descend into harder endless floors.
- Survive as long as possible for final floor, score, kill, and generator totals.

## Heroes

- `Warrior`: high-health cleave fighter.
- `Valkyrie`: fast spear skirmisher with long melee reach.
- `Wizard`: piercing ranged caster.
- `Elf`: rapid-fire archer built for kiting.

## Controls

- `WASD` or arrow keys: move
- Mouse: aim
- Hold mouse button or `Space`: attack
- `Enter`: start run or return after result
- `R`: restart run

## Files

- `index.html`: direct browser entry
- `src/Game.js`: run state, floor generation, combat, and progression
- `src/render.js`: dungeon, enemies, player, and HUD canvas draw
- `src/main.js`: DOM, input, and animation loop
- `src/data.js`: hero and room constants
