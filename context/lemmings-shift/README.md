# Lemmings Shift

Browser-playable rescue puzzle about redirecting a small crowd through one hazardous route.

Open [index.html](./index.html) in a browser to play.

## Why It Exists

This catalog entry covers autonomous crowd routing instead of direct-avatar action. The run is about reading the lane, spending a tiny skill budget, and timing each intervention close to the obstacle that needs it.

## Core Loop

- Runners leave the hatch one by one and keep walking until terrain or assignments redirect them.
- The player spends limited Builder, Digger, and Blocker assignments on individual runners.
- The round ends when enough runners reach the exit or too many are lost along the way.

## Play Pattern

The route teaches itself in motion. The first trench asks for a bridge, the mid-run shelf asks for a dig, and the late crowd-control risk leaves room for a blocker if the line starts to bunch up near danger.

The opener should stay readable before the first assignment: terrain loads immediately, and the live status and assignment counts stay plain text instead of broken glyphs.
