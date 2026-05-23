# Line Rider Rush

Browser downhill routing game where you sketch one sled line from the launch flag to the finish beacon, thread visible gates in order, and survive high-speed corners across a seven-stage mountain circuit with instant retry.

## Play

Open `./line-rider-rush/index.html` in a browser.

Controls:

- Drag to draw the route
- `Enter` rides the current line
- `C` clears and redraws
- `[` and `]` switch unlocked stages from the menu or edit state
- Click a stage chip on the menu to revisit any unlocked mountain

## Notes

- Seven handcrafted stages unlock in order and store best clear times locally
- The menu now shows a stage rail with unlock state and best-time progress for the full circuit
- The next required gate stays highlighted so the route always has one visible goal
- Crashes keep the drawn line intact for immediate retry
- Menu and result overlays now own the start and retry flow so the action bar does not advertise a dead `Ride` click before a valid route exists
- During sketch mode, clicking `Ride` on an incomplete line now surfaces a direct hint instead of feeling like a dead button
- Follow-up pass on 2026-05-06 tightened launch clarity: valid routes now say `Press Enter or Ride`, and keyboard `Enter` failures reuse the same demo-track recovery hint as the `Ride` button so mouse and keyboard starts teach the same next step
