# Crazy Climber Rush

Browser climbing game about alternating hand rhythm, hazard reads, and short recovery stops on rest ledges.

## Loop

- Start from street level and climb one lane at a time toward the rooftop helipad.
- Alternate left and right pulls to build upward speed without burning stamina too fast.
- Shift sideways around shutters and falling flowerpot lanes, then pause on ledges to recover.
- Reach the roof before the timer or your last life runs out.

## Controls

- `A/D` or left/right arrows: move across window lanes
- `Q`: left-hand pull
- `E`: right-hand pull
- `Enter`: start climb or return after result
- `R`: instant restart

## Play

Open `./index.html` in a browser to play locally.

## Notes

- The browser entry now boots through bundled local `./game.js`, so opening `./index.html` directly keeps the start screen, lane shifts, and alternating climb inputs on one file-safe runtime.
- The earlier `cant move left or right` complaint was a boot-path issue, not a lane-shift bug.
