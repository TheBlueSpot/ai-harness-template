# Age Evolution

Age Evolution is a browser-playable lane-war entry about pushing a three-front siege from stone tools to future war machines. Each run is built around pressure management: choose a lane, field counters into that front, then spend into the next era before the opposing base does.

Open [index.html](./index.html) in a browser to play.

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

- Enemy AI watches lane pressure, counter-picks against the role you are leaning on, and also levels eras over time
- Base visuals and durability shift with each era so the war front changes as tech progresses
- The first age jump now lands sooner, so Bronze and Iron show up inside a normal session instead of feeling hidden behind a long grind.
- Early enemy pressure now arrives as slower mixed-unit waves, with later acts unlocking denser formations and occasional side-lane harass instead of flat same-lane spam.
- Sweep note: tightened the persistent HUD footprint so the top lane and lower flank stay readable during live play instead of the headline and control panels eating the battlefield
- Patrol note: no new blocker found in this cohort pass; the lane read still stays clear during live play.
