# Rocket Mice Maze

Rocket Mice Maze is a browser-playable real-time routing puzzle. Mice stream out of their nest, and you place arrow tiles to bend the route toward rocket bays before roaming cats break the lane.

Open [index.html](./index.html) in a browser to play.

## Play Loop

- Place or erase arrow tiles on open floor.
- Rescue the target number of mice for the current stage.
- Keep losses under the cap so the route does not collapse.
- Clear three escalating stages to finish the run.

## Controls

- `1` `2` `3` `4`: Select arrow direction
- `X`: Select erase
- Left click: Place selected tool on a floor tile
- `Enter` or button: Start / continue
- `R`: Restart the full run after a loss or clear

## Notes

- The HUD keeps the next goal visible: quota saved, loss cap, and arrows remaining.
- Cats chase the nearest active mouse, so sloppy detours turn into immediate pressure.
- Everything for this entry stays inside `./rocket-mice-maze/`.
