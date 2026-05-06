# Guitar Neo

Browser-playable rhythm game prototype focused on five-lane note timing, track selection, and fast replay flow.

## Play

Open `./guitar-neo/index.html` in a browser.

## Controls

- `D`, `F`, `J`, `K`, `Space`: hit the five fret lanes

## Loop

Pick a track, match incoming notes on time, build score and combo, and finish the chart to reach the results screen.

## Notes

- Uses local audio assets packaged inside the folder and falls back to a generated preview mix when a browser blocks direct file audio fetches.
- Keeps the HUD minimal so timing, lane reads, and note travel stay clear.

## Learnings

- First-pass feedback showed players needed in-lane key reminders and a more obvious strike target before the score layer mattered.
- Follow-up pass kept the same review thread local: the live HUD now reports truthful per-note judgement plus `Early` or `Late` timing readback, so players can correct rhythm from one glance instead of guessing whether the lane, score, or chart was wrong.
- May 6, 2026 browser recheck confirmed one live readability blocker still survived that logic work: the gameplay HUD sat directly over the strike zone and hid the left three lane labels during the opening seconds, so the `How do I even play?` complaint was still materially true on the direct browser surface.
- Current pass compresses that HUD into a shallower top dock and drops the strike line lower with a brighter double-line pulse, so all five lane labels and the timing target stay visible as soon as the set starts.

## Next Feedback

- Re-check the fastest chart once notes stack deeper on screen; if timing still feels muddy after the exposed strike zone fix, the next lift should be per-lane hit flashes or closer note travel, not more top HUD.
