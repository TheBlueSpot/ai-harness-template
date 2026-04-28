# Age Evolution

Age Evolution is a browser-playable lane-war entry about pushing a three-front siege from stone tools to future war machines. Each run is built around pressure management: choose a lane, field counters into that front, then spend into the next era before the opposing base does.

## Core Loop

- Hold three horizontal lanes that feed directly into both bases
- Spawn units from the current era while gold income ticks upward over time
- Read lane pressure and pivot into counters instead of flooding one unit type
- Tech into stronger eras to unlock fresh rosters and tougher base forms

## Controls

- `1`, `2`, `3` select top, middle, or bottom lane
- `Q`, `W`, `E` deploy the three unit types from the current era into selected lane
- `F` advances to the next era when enough gold is stored
- `Space`, `Enter`, or click starts or restarts a run

## Local Notes

- The entry lives entirely inside `age-evolution/`
- Enemy AI watches lane pressure, counter-picks against the role you are leaning on, and also levels eras over time
- Base visuals and durability shift with each era so the war front changes as tech progresses
