# Lunar Thrust Rescue

## Premise

Guide a fragile lunar rescue craft across a cratered valley, pick up stranded survivors from beacon pads, and bring them back to Command without running dry or slamming the hull apart.

## Play

Open `./lunar-thrust-rescue/index.html` in a browser.

## Loop

Follow the target marker to the next survivor or drop-off point, use the depot pad when fuel gets tight, and keep descents slow enough to stick precision landings on the small pads.

## Controls

- `Left` / `Right`: rotate
- `Up`: main thruster
- `Enter`: start mission
- `R`: restart

## Notes

- Run stays browser-playable and self-contained inside `./lunar-thrust-rescue/`.
- Latest feel pass loosened the route budget with stronger thrust, lighter gravity, and a larger fuel reserve so recovery windows stay alive longer between pads.

## Learnings

- Review-selected pass stayed local to this folder: the clearest high-leverage note was `10% more acceleration`, `10% less gravity`, and `25% more fuel`, so the ship now climbs and corrects earlier without turning depot routing into the whole game.

## Next Feedback

- Re-check whether the softer gravity plus bigger tank makes rescue hops feel confident without removing the need for careful landing speed on the small pads.
