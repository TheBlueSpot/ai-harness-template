# Pikmin Swarm

Pikmin Swarm is a stand-alone browser game about leading a compact follower group through quick collect-and-return pressure.

## Play

Open [index.html](./index.html) in a browser to play.

## Concept

- Swarm-command play with one visible leader and a short-follow group
- Clear collect-and-return pressure with fast retry
- Minimal shell chrome so the playfield stays readable

## Notes

- Retry is designed to return to play immediately.
- Controls and objectives stay visible during the run.

## Sweep Learnings

- Full catalog sweep found `pikmin-swarm` is browser-playable and already teaches the broad loop cleanly, but one core interaction was lying about progress.
- Launch overlay now fully leaves the board on run start, so first-play analysis is not blocked by a menu that still sits over the action after the day begins.
- Launch intent now also accepts movement keys and direct stage clicks, and the overlay hides immediately on that first intent instead of waiting for the button-only path.
- Carry payloads now travel back to base with the assigned squad instead of scoring the moment the leader re-enters home range. That keeps `recruit -> lift -> escort -> deliver` as one readable mechanic chain instead of a fake pickup shortcut.
- If command game asks player to route pressure across map, objective actors must stay visibly rendered in-world; hidden gates or enemies make loop look broken even when sim still runs.
- Next patrol should check whether enemy pressure creates enough interesting routing while a carried payload is actually crossing the map, because that is where the loop can become sticky instead of merely understandable.
