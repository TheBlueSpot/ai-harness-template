# Slug Hail

Slug Hail is browser run-and-gun survival remix about holding landing zone under wave pressure. You carve cover out terrain, swap weapons on fly, keep paratrooper assault from collapsing your lane.

## Controls

- `WASD` or arrow keys to move
- Mouse to aim
- Hold click or `Space` to fire
- `Q` to rotate weapons
- Hold `Shift` to slow drift

## Play Loop

- Survive escalating paratrooper drops
- Use terrain damage to open lanes or cut new cover pockets
- Swap between rifle, scatter, piercer to fit range and pressure
- Keep wave pressure contained before zone collapses

## Local Notes

- Entry stays self-contained inside `slug-hail/`
- Open `slug-hail/index.html` in browser to play
- HUD tracks health, heat, score, weapon, wave state
- Run tuned as short survival defense, not campaign
- Patrol note: the live HUD now keeps both the 7-wave target and the final-cleanup win condition visible so the run reads as a clear holdout instead of a pure score chase.
- Latest clarity pass turned the mission copy into short phase cards: ready state now spells out the 3-step goal, active waves show remaining drops plus current hostiles, and the cleanup phase says explicitly that no more enemies will spawn.
- Latest readability pass shrank the bottom reminder into two small edge cards so the lower-left lane no longer loses as much space to controls and repeated mission text.
- Latest HUD declutter pass keeps the full controls card only until the player actually moves, then collapses it to a smaller advanced-controls chip so the combat lane gets more room during live fire.
- Latest follow-up closes one remaining opener-case: if the player starts firing before moving, the controls card now still collapses on first combat input so the lower lane stops paying a wide HUD tax during stationary holdouts.
- Latest objective pass keeps the lower card in direct `NOW` and `WIN` language and adds a phase badge near the main mission panel, so late-wave clutter should no longer bury the exact current job versus the actual victory rule.
- Re-review target: confirm the bigger mission strip still stays readable once late-wave bullet clutter and terrain debris crowd the lower edge.

## Sweep learnings

- Review-selected pass stayed local to `slug-hail/`: the user note was `no clear objective or win condition`, so the HUD now adds a dedicated mission-progress strip with banked-wave count plus a separate cleanup segment instead of relying on score and footer copy alone.
- Browser verify on 2026-05-02 showed the first mission strip was hiding under the fixed HTML banner; moving it below the banner restored direct readability during live play without touching core combat or camera feel.
- Follow-up HUD pass kept the objective reminder but split the old wide bottom strip into a compact mission card plus a separate controls card, which should reduce lower-edge clutter during active fire without removing the win-condition cue.
- Current pass trims that control teaching one step further: once movement starts, the basic move/fire line is no longer repeated at full width, but `Q` and `Shift` stay visible as the less obvious advanced controls.
- Current pass also treats first combat input as real engagement, not only movement, so opening shots collapse the wide controls card immediately and preserve more live fire space for players who hold position.
- Current pass sharpens the remaining review residue by turning the footer reminder into explicit `NOW` and `WIN` lines and adding a colored phase badge (`DEPLOY`, `HOLD WAVE`, `FINAL CLEANUP`, `ZONE SECURE`) so the objective reads from shape and position before the player has to parse sentence copy.

## Next todos

- Re-smoke a late-wave run and confirm the new `NOW` and `WIN` card still stays readable once debris, bullets, and compact controls all share the lower edge.
- If the lower card still feels busy in live fire, test moving the `WIN` reminder into the upper mission panel and leaving only `NOW` on the bottom edge.
