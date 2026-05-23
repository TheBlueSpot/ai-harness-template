# Diner Dash Rush

Standalone browser diner loop built around floor routing under patience pressure. The run is about keeping seats open, turning orders quickly, and preventing queue walkouts from snowballing into a failed shift.

## Loop

- Seat the waiting line from the host stand whenever a clean table opens.
- Take table orders, grab finished dishes from the kitchen, and deliver the right plate to the right table.
- Clear dirty tables immediately so the next party can sit before the queue collapses.

## Controls

- `WASD` or arrow keys: move
- `Space` or `E`: interact
- `Enter`: start
- `R`: restart

## Notes

- Open [index.html](./index.html) in a browser to play.
- The diner teaches itself in motion: the host stand seats, the kitchen hands off plated food, and table labels show what each station needs next.
- Latest review-backed tuning keeps the floor-local guidance intact but trims two remaining friction points from the random draw: the server now crosses the room faster, and first-shift patience drains slower so one early detour does not instantly turn into a queue collapse.

## Learnings

- Route pressure reads better when one live next-stop cue points to the host stand, kitchen, or the most urgent table.
- Early floor tension improves when recovery windows survive one mistake instead of collapsing immediately.
- Small opener relief can stay game-local: a modest move-speed bump plus shift-scaled patience keeps the rush active while making the first minute less brittle.

## Next Todo

- Recheck late-shift pacing after another playtest now that opener movement is faster and shift-one patience is softer.
