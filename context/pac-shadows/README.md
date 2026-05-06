# Pac Shadows

`pac-shadows` is a browser-playable stealth maze built around light management instead of pellet clearing. You move through a dark maze, keep your beam under control, avoid escalating ghost pressure, and reach the glowing exit before a spirit closes the gap.

## Play

- Open [index.html](./index.html) in a browser.
- Move with `WASD` or the arrow keys.
- Reach the exit marker without getting caught.
- Use `Escape` to return to the menu.

## Design Notes

- The game keeps feedback near the play space with a compact edge HUD instead of a full-screen overlay.
- The danger ring points toward nearby ghost pressure and shifts from cyan to amber to red as the room wakes up.
- Ghosts escalate from patrol to search to hunt when you overexpose them, so the safest route is to light the path briefly and then slip back into darkness.
- Missing external art or audio falls back to generated placeholders, so the folder still boots cleanly on its own.
- Shared asset policy lives in [Assets README](../assets/README.md).
