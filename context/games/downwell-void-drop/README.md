# Downwell Void Drop

Browser descent action game about dropping through a longer hostile shaft, waking relay stations, and managing gunboot ammo on the way down.

## Premise

Drop through a maintenance shaft where each safe ledge refills your gunboots, each relay extends the dive into a clear new objective beat, and every enemy telegraph stays readable enough to support fast route choices instead of blind damage.

## Controls

- `A/D` or arrow keys: drift left and right
- `Space`: jump from a ledge
- Hold `J`: fire gunboots downward while airborne
- `Enter`: start the dive or retry after the run ends
- `R`: restart immediately

## Loop

- Safe touch-downs refill ammo and keep the descent under control.
- Relay checkpoints break the fall into three visible goals before the extraction gate opens.
- Dash drones and wall guns pressure the route without hiding the next move.

## Play

Open `./index.html` in a browser to play locally.

## Sweep Learnings

- Short browser patrol confirmed the start flow is live and the extraction win state still triggers once all relays are hot, so the old `can't win` report should not drive current fixes by itself.
- Random review pick from `./user-reviews.sqlite` stayed game-local: the still-actionable `can't pick up health packs` complaint was real because the run had health on the HUD but no actual hull pickup in the shaft.
- The shaft now seeds visible red patch kits on a light subset of ledges, restores one hull on contact, and gives a direct pickup message so recovery reads as an actual route reward instead of a missing feature.
- The next meaningful patrol target is final-leg readability: verify whether the bottom camera framing and extraction-gate reveal stay legible during a real full-depth run, because that is the remaining place where success can still feel misleading even when the logic works.

## Next Feedback

- Re-check whether the new patch kits appear often enough to feel like real recovery routing, or if the next cheap pass should tune placement density before touching ammo or recoil.
