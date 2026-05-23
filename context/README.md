# Context

Catalog landing folder for the browser-game archive.

## Repository Layout

- `./games/` contains browser-playable catalog entries, one folder per slug.
- `./.local/` contains local-only debug output, smoke proof, screenshots, browser profiles, and scratch traces.
- Root files keep catalog hosting, review data, shared docs, and automation.

## Current Queue Shape

- Rechecked on 2026-05-06.
- `./todo.md` still has `0` pending records.
- `bun.cmd .agents/skills/catalog-sweep/scripts/queue_reconcile.ts --json` still falls back to `seed-next-pending`, but that is queue-seeding guidance rather than the next executable maintenance pick.
- Live helper truth still ranks `verify-smoke` first and `docs-rewrite` second.
- The strongest reusable follow-up bets remain:
  - `action-certainty-audit` plus `accepted_input_probe.ts`
  - `compact-screen-readability-smoke.ts`
  - `settings-and-assists` as a recovery-surface audit
  - `probe-load-smoke.ts`
- New tightening from the 2026-05-06 market pass: compact-screen proof should use a fixed responsive width matrix, and a later `timed-info-readability-smoke.ts` bet is now better justified than a vague extra clutter lane.

## Current Maintenance Priority

- Lane: `verify-smoke`
- Why: `bun.cmd .agents/skills/catalog-sweep/scripts/workflow_lane_packet.ts --json` now reports `85` smoke-drift slugs, split into `17` missing proof and `68` stale proof, and `bun.cmd .agents/skills/catalog-sweep/scripts/smoke_refresh_pack.ts --group missing --limit 10 --json` still keeps the proof-refresh front ahead of every local follow-up note.
- Concrete next missing-proof batch from `smoke_refresh_pack.ts --group missing --limit 5 --json`:
  - `portal-engine`
  - `r-type-biofront`
  - `rampage-city-smash`
  - `rebuild-sim`
  - `relic-swarm-arena`
- Review-freshness helper state still stays behind executable maintenance work: `1` missing row, `122` blocked rows, and `10` pre-edit reflag targets, with the only missing row still on repo-meta `context`.
- Known helper drift: `workflow_lane_packet.ts --json --save-learning` still picks the right lane but mis-samples stale-proof `arkanoid-prism` while lane-level proof helpers now start with `portal-engine`.
- Local per-game todo notes remain behind the shared proof lane because they are conditional or feedback-gated: `bloons-pop`, `crazy-climber-rush`, `mario-game`, `meat-liquid`, `pants-vector`, `pikmin-swarm`, `qix-fracture`, `slug-hail`, `simtower-elevator-ops`, and `stick-empire-logic`.
- Broader harness comparison still stays behind catalog-local maintenance work: [../docs/todo.md](../docs/todo.md) still ranks `Activation And Onboarding` first by area, but its selected next executable pass is the `Daily Coding Loop` thread archive/restore item dated 2026-05-06, and that remains context outside this folder's faster proof closure.

## What Good Means Here

- Fast first useful action beats front-loaded explanation.
- Help, controls, and objectives should be recoverable after the opener.
- Critical reads must survive compact screens, motion, and busy frames.
- Recovery knobs matter: difficulty, assists, remap, sensitivity, speed relief, and progress-safe changes from useful states.
- Feel is not only latency. The player must see which action the game actually accepted.

## Evidence

- Apple `Onboarding for Games` still pushes fast entry, short stepwise teaching, delayed non-essentials, and replayable help. Rechecked 2026-05-06.
- Apple `Adapting your game interface for smaller screens` still treats adaptable labels, legible text, multiple input methods, and device testing as core game-interface work. Rechecked 2026-05-06.
- Microsoft XAG 107, 108, 109, 116, 117, plus XAG version history last updated 2026-03-04, still support input accessibility beyond remap alone, progress-safe difficulty changes, reviewable goals, player-paced timed information, and motion-safe readability. Rechecked 2026-05-06.
- Game Accessibility Guidelines still reinforce quick start, replayable reminders, readable defaults, mid-run difficulty changes, and remembered settings. Rechecked 2026-05-06.
- Playwright trace docs still support artifact-first browser verification with traces, DOM snapshots, screenshots, and console or network context. Rechecked 2026-05-06.
- BrowserStack Percy responsive docs now give the compact-screen lane a stronger proof shape: one DOM state reviewed across a small width matrix, not one phone screenshot. Rechecked 2026-05-06.
- Dovetail docs on insights and data fields still support source-linked findings plus consistent metadata like theme, confidence, and criticality instead of flattening raw notes into one uncited summary. Rechecked 2026-05-06.
- Zach Gage's `Controls You Can Feel` still supports the missing accepted-action readback lane: confidence depends on immediate primary acknowledgment, not just latency or FX.

## Inference

- External guidance still does not justify moving the queue lead off `verify-smoke`.
- The best next shared lane is still `action-certainty-audit`, because current audits can prove latency, clutter, onboarding, and impact without proving whether the intended action was visibly accepted.
- `compact-screen-readability-smoke.ts` stays next because current proof is still too desktop-biased, and the new best implementation shape is a fixed responsive width matrix rather than one narrow viewport check.
- `settings-and-assists` should stay scoped to recovery surfaces, not a generic options checklist.
- `probe-load-smoke.ts` is useful later, but it is still a verdict layer behind the more direct trust gaps above.
- A later `timed-info-readability-smoke.ts` bet is now stronger than a generic `more clutter tooling` note, because XAG 117 names the exact failure mode: auto-updating or motion-conflicted text.
- No new sharper shared skill or script beat the current later stack in the latest rerank check; replayable-help and objective-recall evidence is already better represented by the shipped reminder-reentry lane plus existing recovery audits.

## Research Notes

- Current-source sync: [./.local/kojima/research-game-quality-2026-05-06-current-source-sync.md](./.local/kojima/research-game-quality-2026-05-06-current-source-sync.md)
- Current priority rerank check: [./.local/kojima/research-game-quality-2026-05-06-current-priority-rerank-check.md](./.local/kojima/research-game-quality-2026-05-06-current-priority-rerank-check.md)
- Deep web refresh: [./.local/kojima/research-game-quality-2026-05-06-deep-web-refresh.md](./.local/kojima/research-game-quality-2026-05-06-deep-web-refresh.md)
- Evaluation workflows: [./.local/kojima/research-game-quality-2026-05-06-evaluation-workflows.md](./.local/kojima/research-game-quality-2026-05-06-evaluation-workflows.md)
- Market pass: [./.local/kojima/research-game-quality-2026-05-06-market-pass.md](./.local/kojima/research-game-quality-2026-05-06-market-pass.md)
- Recovery surfaces: [./.local/kojima/research-game-quality-2026-05-06-recovery-surfaces.md](./.local/kojima/research-game-quality-2026-05-06-recovery-surfaces.md)
- Local learnings: [./.local/kojima/learnings.md](./.local/kojima/learnings.md)

## Play

Run `bun.cmd run dev` from `context/`, then open the local catalog page in a browser.
