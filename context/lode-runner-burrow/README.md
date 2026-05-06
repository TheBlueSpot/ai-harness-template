# Lode Runner Burrow

Lode Runner Burrow is a direct browser catalog entry built as a self-contained arcade run. The shell stays thin, the HUD stays minimal, and the overlay always keeps one clear next action visible.

## Concept

- Burrow-and-escape play with a narrow tunnel map
- Gold collection under guard pressure
- Fast retry so failure stays inside the learning loop
- Direct folder boot from `index.html`

## Controls

- Move with `Arrow` keys or `WASD`
- Dig left with `Z`
- Dig right with `X`
- `Space` digs the side you are facing
- Start or restart with `Enter` or `R`

## Play

Open [index.html](./index.html) in a browser to play.

## Sweep Notes

### 2026-04-30

- Control path tightened: the overlay button now starts or restarts the run directly instead of relying on a synthetic key tap.
- Overlay now actually leaves the screen once the run starts, so tunnel reads and dig choices are no longer hidden behind the menu card.
- Current shell stays intentionally thin so the burrow, dig, and escape loop remains the focus.
- Dig now matches the genre's actual first-use expectation: no jump verb, explicit left/right digging, and `Space` digging toward the current facing side for one-key play.
- Review note: if a future pass revisits controls, keep the restart affordance obvious and avoid reintroducing jump-only dig behavior.

### 2026-05-02

- Review evidence still showed first-run confusion about the loop, so the live HUD now keeps the objective visible during play instead of relying on the opening overlay alone.
- The hidden exit now leaves a locked marker at the target location, which tells the player what the gold unlocks before they discover it by wandering.
- Next re-review target: confirm the added reminder plus locked exit marker are enough to explain the loop without making the top-right goal read like an active ladder too early.
