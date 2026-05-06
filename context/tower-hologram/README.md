# Tower Hologram

Browser-playable tower defense about shaping a safe route instead of sealing one off. Place hologram towers across the field, keep at least one path open, and survive all 22 waves.

## Play Loop

- Start the run and place towers anywhere inside the board.
- Mix splash, slow, burn, needle, relay, and disrupt roles to answer different enemy traits.
- Upgrade placed towers into one of two branches once enough energy is available.
- Hold the breach through all 22 waves without leaking the route dry.

## Controls

- `Mouse`: aim placement, select towers, and choose upgrades
- `1` to `6`: switch tower type
- `F`: toggle fast mode
- `R`: restart the run
- `Esc`: pause or resume

## Notes

- Open [index.html](./index.html) in a browser to play.
- Assets for the hologram core and placement sound live under `./assets/`.
- Late waves add `Gap Colossus`, `Lattice Seraph`, and `Holo Regent` on top of the earlier mirror-boss ladder.
- The HUD signal feed calls out the active wave pressure so boss transitions and late-game spawn gaps read faster.
- The playfield uses a fixed logical stage, so browser size changes do not retune tower ranges, route length, or wave pressure.
- The tower picker, upgrade panel, and wave HUD stay compact and edge-anchored so the center playfield stays readable during live placement.

Sweep note: moved the selected-tower panel and run controls into a narrow right-edge dock so the bottom route lane stays mostly clear for placement reads and live path tracking.

## Sweep Notes

### 2026-05-02

- Live browser recheck found the reported inert-upgrade bug does not reproduce in the shipped `./index.html` runtime. Selecting a placed tower and clicking an enabled branch still spends energy, changes the tower role, refreshes the panel, and leaves placement interaction intact.
- Current review-store feedback shifted from upgrade failure to readability pressure, and this pass answered it by pulling upgrade reading plus run controls out of the bottom lane and into a slimmer right-edge dock in the shipped runtime.

## Next Todo Notes

- Recheck one late-wave busy frame and confirm the right-edge dock still stays secondary once the signal feed, trait list, and boss pressure all light up together.
- If another upgrade report appears, capture it against shipped `./game.js` first before changing `./src/`, because this entry boots the built runtime directly from `./index.html`.
