# Tempest Vector Tube

Catalog entry for a browser-playable tube shooter inside `./tempest-vector-tube/`.

## Premise

You surf the outer rim of a glowing tube while climbers race up each lane toward the edge. Straight crawlers pressure your aim, magenta flippers hop across neighboring lanes mid-climb, and orange spikers harden specific rim lanes until you break them or spend a superzap.

## Controls

- `A` / `D` or left / right: slide around the rim
- `W`, up arrow, or `Space`: fire down the current lane
- `X` or `Shift`: superzap
- `Enter`: start
- `R`: instant retry

## Run Shape

Each run is six fast waves. The HUD stays edge-anchored, the must-react signals live on the tube itself, and retry is immediate so missed lane reads stay inside the learning loop. Superzap is limited, so the decision is whether to spend it on stacked flippers now or hold it for a later rim collapse.

## Local Play

Open [index.html](./index.html) in a browser to play the isolated entry directly.

## Kojima Sweep Notes

- `Controls`: Rim movement and one-button fire read quickly, so the game stays inside the desired simple arcade loop.
- `Failure states`: Sweep found a real break where stacked rim contacts could remove multiple lives in a single frame. That undercut the learning loop by turning one missed read into an instant collapse. The entry now applies a short hurt lock after damage so one cresting stack costs one life, not the whole run.
- `Onboarding`: The spike warning in the top-right HUD now stays within the panel and keeps the rim-spike response readable.
- `Control read`: Left and right lane movement now match the visible tube direction so the rim no longer feels inverted during play.
- `Pacing`: Waves start fast enough to feel sticky without long downtime, so no tuning change was made in this pass.

## Next Todo

- Watch whether the first flipper lane-swap needs a stronger in-tube telegraph than the current magenta burst once repeated patrol notes exist.
