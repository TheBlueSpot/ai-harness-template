# Fly Aerodynamics

Fly Aerodynamics is a self-contained browser flight game about launch, lift, and long-run progression.

Open [index.html](./index.html) in a browser to play.

## Concept

The player builds speed on takeoff, climbs through thermals, manages altitude and fuel, and lands to cash in distance for upgrades. Each run feeds the next one, so the loop is about learning when to push, when to glide, and when to spend earned currency.

## Controls

- `W` or `Up`: add thrust
- `A` / `D` or `Left` / `Right`: steer and bank
- `Enter`, `Space`, or pointer input: launch and continue
- `R`: reset the current run back to the launch menu
- Number keys: choose upgrades

## Progression

- Runs generate currency from distance traveled.
- The shop lets the player improve lift, launch acceleration, glide efficiency, and thermal gain.
- Upgrade choice and purchases carry forward through the same browser session, so stronger builds and preferred loadouts stay in place between runs.
- Sweep note: the session-local upgrade loop is the durable hook here, so keep launch, flight, landing, and shop choice readable without adding a separate boot flow.
