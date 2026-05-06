# Galgia

Browser fixed-screen shooter inspired by classic space swarms.

## Play

Open `./galgia/index.html` in a modern desktop browser.

## Controls

- `A` or `Left Arrow`: move left
- `D` or `Right Arrow`: move right
- `Space`: fire

## Notes

This entry stays self-contained inside `./galgia/`. It uses a Three.js scene with score tracking and instant restart flow from the overlay.

## Sweep Notes

### 2026-04-29

- Browser play blocker: the original post-processing stack pulled CDN shader modules that failed cross-origin in the hosted catalog path, so `Start Game` left the player on a dead overlay instead of entering play.
- Sweep fix: reduced the render pipeline to a stable hosted-browser path with core bloom only. The game now boots, hides the menu on start, and shows a playable ship/enemy field instead of startup failure or full-screen static.
- Browser boot follow-up: the page still depended on an inline import map, which the local sweep flagged as a direct-boot risk. The browser path now uses direct ESM imports, so the menu can hand off to live play without import-map parsing or specifier resolution failures.
- Onboarding: current shell is simple and readable. `Start Game`, score, and high score stay clear without burying the playfield in extra HUD.
- HUD layout: score, high score, and controls now sit in compact edge cards so the lane stays readable while the game runs.
- In-run reminder: the live overlay now keeps the basic move/fire cue visible while play is active, so the menu does not have to carry all of the control teaching.
- Controls: keyboard-only lane movement and fire remain easy to infer, and the live overlay now keeps that reminder visible during play.
- Feedback: glow treatment now supports readability instead of sabotaging it. Remaining feel work is about enemy variety and pacing, not startup truth.
- Next todo: if visual flavor comes back, add it from local or proven-safe passes only. Do not reintroduce CDN shader dependencies that can blank or block the browser path.

### 2026-04-30

- Local sweep kept the current structure intact.
- The menu flow and score loop still read clearly enough for a quick catalog pass.
- Future tuning should favor formation variety and earlier dive telegraphs before raw spawn or fire density.
- Enemy silhouettes now read larger in the lane, so threat pressure is easier to parse at a glance.
- Follow-up clarity pass: the hostile cluster scale is now pushed further so first-wave threats read as targets instead of distant sparkles on large monitors.
- Local todo: after the size fix lands, re-check whether difficulty still feels fair or whether the next pass should focus on telegraph timing instead of more raw visibility changes.

### 2026-05-02

- Review follow-up stayed local to the swarm readability complaint instead of changing pace or rules.
- Enemy shards now carry a soft backside shell and a slightly larger overall scale, so the hostile clumps separate from the dark field more reliably on large monitors without changing hit logic.
- Verification note: this pass relied on current code inspection plus the existing local captures under `./.local-galgia-*.png`; no repo-local browser automation path exists for a fresh Galgia screenshot in this workspace.
- Local todo: next feedback pass should confirm whether readability is now solved or whether the remaining friction is pure telegraph timing rather than enemy visibility.

### 2026-05-05

- Random review pick stayed on the live `enemies appear too small` complaint instead of retuning difficulty.
- Enemy swarms now carry a bright central target core plus a stronger outer readability shell, so each threat resolves as one concrete target before the shard silhouette details matter.
- The camera now sits slightly closer to the play lane, which makes hostile units read larger without changing the control lane or adding more HUD.
- Verification note: fresh Playwright capture should confirm the new target cores show up clearly during title-to-run handoff and first-wave play.
- Local todo: if the next review still says the game feels hard, treat it as telegraph or pressure tuning first rather than another pure size increase.
