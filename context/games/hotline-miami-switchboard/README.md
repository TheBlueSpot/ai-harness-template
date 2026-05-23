# Hotline Miami Switchboard

Browser-playable top-down breach shooter about clearing four neon switchboard rooms with one-hit lethality, limited weapons, and readable entry telegraphs before each crossfire starts.

## Play

Open [index.html](./index.html) in a browser to play.

## Controls

- `WASD`: move
- Mouse: aim
- Click: fire
- `E`: swap to a nearby dropped weapon
- `F`: toggle a nearby neon switch
- `R`: restart after a death or clear

## Loop

Each room locks until every operator is down. Enemies telegraph their first firing lane after a breach, dropped guns create constant pickup churn, and the exit line only opens once the room is clean.

## Kojima Sweep Notes

- Fresh May 5, 2026 polish pass found three small feel gaps during direct browser play: the room loop had no audio bed at all, hostile takedowns burst in player-cyan instead of hostile-red, and empty magazines failed silently unless a dropped gun happened to be nearby.
- That pass now ships a lightweight synth BGM/SFX layer, bigger muzzle and impact particles, bullet trails, screen shake, and a darker vignette/scanline pass so breach reads land harder without hiding the lane geometry.
- Empty clicks now answer with a dry-fire tick plus a small muzzle sputter, so `why did nothing happen` no longer blurs together with input doubt during one-hit pressure.
- This pass sharpened enemy lane behavior so rooms pressure from different roles instead of every operator solving to the same firing line. Flank, hold, push, and perch reads now matter more than raw enemy count.
- In breach shooters, role variety dies if AI agents collapse into the same lane. Distinct flank, hold, and push jobs need anti-clump scoring or separation pressure so the room geometry actually matters.
- In breach shooters, switches and elevated lanes need strong in-arena reads. If a flank route or catwalk changes the room plan, mark it on the floor instead of leaving it as pure level trivia.
- In breach shooters, route tech should read at breach time and again in the arena. A short tactical callout plus visible switch-to-gate wiring keeps buttons and catwalks from feeling like hidden trivia.
- In breach shooters, route variety only matters if hostile pathing can cash it out. A flank lane, bypass gate, or catwalk is dead content when enemies still solve every problem with direct-line walks into cover.
- Fresh May 6, 2026 review pass kept the existing AI roles but made the route tech stay readable after the opener: archive and core switches now stamp locked/open flank chips on the floor, while relay/core catwalk and pressure lanes carry persistent labeled callouts with dashed links into the threatened lane.

## Re-Review Target

- Re-review whether the new floor-route chips stay legible once late-room muzzle flash, telegraphs, and pickup prompts stack in relay hall and core switchboard.
