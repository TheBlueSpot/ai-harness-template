# R-Type Biofront

R-Type Biofront is a stand-alone browser shooter about surviving a living trench, timing charge releases through tight lanes, and cracking a biomechanical guardian at the end of the run.

## Play

Open [index.html](./index.html) in a browser to play.

## Concept

The run stays short and replayable. Terrain creates readable choke points, small organic defenders punish flat routing, and the charge shot is the main answer when the lane compresses or armored threats stack up.

## Controls

- `Arrow Keys`: move
- `Z`: rapid fire
- `Hold Space`: charge and release the blast cannon
- `Enter`: start or retry

## Play Loop

- Hold the center line when the tunnel is open, then shift early when the floor or ceiling pinches.
- Use rapid fire to trim drones and save full charge for turrets, pods, or boss weakpoint windows.
- Reach the hive gate, survive the boss phases, and restart instantly after a win or crash.

## Local Notes

- Entry stays self-contained inside `r-type-biofront/`.
- Open [index.html](./index.html) directly in browser to play.
- Current review-selected pass keeps core trench route intact, trims a few mid-run enemy beats, and adds breakable wall sacs that drop either repair cores or near-full charge pickups.

## Sweep Learnings

- Review-selected pass used fresh `r-type-biofront` feedback asking for lighter pressure plus breakable environmental support. The run now has five wall-mounted cache targets that give either one hull repair or a near-full charge refill, so the player gets readable recovery windows without changing the ship controls or boss structure.
- Same pass cut a small slice of the fixed spawn plan instead of retuning every enemy family, because this review asked for about 20% less pressure and the cheapest safe answer was fewer overlapping mid-run bodies, not slower ship response or weaker bullets.

## Next Todos

- Re-smoke the full trench and confirm the new cache pickups feel worth detouring for once striker and vent pressure stack in the back half.
- If pressure still spikes too hard near the hive gate, trim one more fixed spawn beat there before touching weapon tuning or boss cadence.
