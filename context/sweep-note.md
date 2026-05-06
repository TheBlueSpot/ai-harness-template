# Queue Review Note

Scope: keep one durable queue snapshot for the catalog landing folder, separate current evidence from inference, and point future passes at the highest-leverage next work without replaying stale slug churn.

## 2026-05-06 Snapshot

### Evidence

- `bun.cmd .agents/skills/catalog-sweep/scripts/queue_reconcile.ts --json` still reports `0` pending records, `132` playable folders, `132` tracked playable folders, and no mixed-state or duplicate slugs.
- That same queue helper still recommends `seed-next-pending`, so zero-pending queue guidance and live maintenance ranking are still separate signals.
- `bun.cmd .agents/skills/catalog-sweep/scripts/workflow_lane_packet.ts --json` still ranks `verify-smoke` first and `docs-rewrite` second, but still mis-samples stale-proof `arkanoid-prism`.
- `bun.cmd .agents/skills/catalog-sweep/scripts/workflow_lane_packet.ts --json` now reports `85` smoke-drift slugs:
  - `17` missing proof
  - `68` stale proof
- `bun.cmd .agents/skills/catalog-sweep/scripts/smoke_refresh_pack.ts --group missing --limit 5 --json` currently ranks:
  - `portal-engine`
  - `r-type-biofront`
  - `rampage-city-smash`
  - `rebuild-sim`
  - `relic-swarm-arena`
- `bun.cmd .agents/skills/catalog-sweep/scripts/docs_rewrite_pack.ts --group launch --limit 10 --json` still reports `37` launch-line rewrites inside `44` README issue slugs.
- `bun.cmd .agents/skills/catalog-sweep/scripts/review_freshness_pack.ts --json` now splits review debt into `1` missing row, `122` blocked rows, and `10` pre-edit reflag targets, but the only missing row is the repo-meta `context` slug rather than a live game entry.
- Local per-game todo notes still exist for `bloons-pop`, `crazy-climber-rush`, `mario-game`, `meat-liquid`, `pants-vector`, `pikmin-swarm`, `qix-fracture`, `slug-hail`, `simtower-elevator-ops`, and `stick-empire-logic`; each remains conditional, proof-dependent, or feedback-gated, so none outrank the shared smoke lane.
- Parent roadmap truth still stays contextual rather than executable here: [../docs/todo.md](../docs/todo.md) keeps `Activation And Onboarding` first by area, but its selected next pass is still `Daily Coding Loop` thread archive/restore controls.

### Primary-source recheck

- Apple `Onboarding for Games` still supports fast entry, short contextual teaching, delayed non-essentials, and replayable help. Rechecked 2026-05-06.
- Apple `Adapting your game interface for smaller screens` still supports adaptable labels, legible text, multiple input methods, and test-on-device discipline. Rechecked 2026-05-06.
- Microsoft XAG 107, 108, 109, 116, 117, plus XAG version history, still support accepted-input trust, progress-safe difficulty changes, reviewable goals, player-paced timed information, and motion-safe readability. Rechecked 2026-05-06.
- Game Accessibility Guidelines still support quick start, replayable reminders, readable defaults, mid-run recovery knobs, and remembered settings. Rechecked 2026-05-06.
- Playwright trace docs still support artifact-first browser verification. Rechecked 2026-05-06.
- Cursor public changelog now splits broader harness evidence across two areas instead of one: April 29, 2026 backs archive or restore lifecycle controls, and May 4, 2026 backs model controls plus spend visibility. Rechecked 2026-05-06.

### Inference

- Keep `verify-smoke` first. Current-source guidance still favors trusted first-play and replay trust over broader workflow expansion.
- Keep `docs-rewrite` second. It is good throughput work, but it does not restore browser-proof trust as directly.
- Keep zero-pending queue seeding behind live maintenance selection. `seed-next-pending` is still the right queue-clean action, but not the right next execution item while the missing-proof lane is still large and concrete.
- Keep the grouped local per-game follow-up notes behind those two shared lanes. They are narrower than the missing-proof batch and still depend on fresher smoke or fresher player feedback.
- Keep later shared bets in this order:
  1. `action-certainty-audit` plus `accepted_input_probe.ts`
  2. `compact-screen-readability-smoke.ts`
  3. `settings-and-assists` as a recovery-surface audit
  4. `probe-load-smoke.ts`

## Practical Next Step

- Concrete next maintenance target from lane-level helper truth: refresh browser smoke proof for `portal-engine`.
- Queue-clean follow-up stays separate: if maintenance ranking were not in play, `queue_reconcile.ts --json` would still point at seeding one fresh pending row.
- Keep treating any named slug in prose as provisional until `smoke_refresh_pack.ts` is re-run, because zero-pending maintenance notes drift quickly after each proof closeout.

## Gaps Worth Keeping Visible

- `queue_reconcile.ts --json` still recommends `seed-next-pending` once queue rows hit zero, even when the larger live maintenance lane is already obvious.
- `workflow_lane_packet.ts --json` still exposes stale-proof `arkanoid-prism` as its sample slug while lane-level helpers rank missing-proof work first.
- Named next-slug prose still drifts too quickly; this same-day rerun moved the front again, so markdown needs an explicit `rerun before trust` rule for slug mentions.
- `review_freshness_pack.ts --json` still spends the missing-review lane on repo-meta `context` instead of a game entry, so that helper is still noisier than the maintenance ranking actually needs.
- `./todo.md` still has no queue-native field for `queue clean, but this maintenance target is next`.
- `docs/research/todo-comparison-baseline.md` had drifted behind current parent docs paths and the now-existing [../docs/user-stories.md](../docs/user-stories.md), so comparison notes needed a path and corroboration refresh instead of preserving a closed missing-file gap.
- Broader roadmap notes still need one source-routing rule so multi-topic vendor updates do not get attached to the wrong area.
- The repo still lacks durable shared helpers for accepted-action certainty, compact-screen readability smoke, recovery-surface reachability, and blocker-first overload scoring.
- Future branch-quality evidence still needs cleaner routing boundaries between `mastery-motivation`, `readable-progression`, and `choice-readback`.

## Linked Notes

- Queue and active maintenance pick: [./todo.md](./todo.md)
- Current-source memo: [./.local/kojima/research-game-quality-2026-05-06-current-source-sync.md](./.local/kojima/research-game-quality-2026-05-06-current-source-sync.md)
- Deep web refresh: [./.local/kojima/research-game-quality-2026-05-06-deep-web-refresh.md](./.local/kojima/research-game-quality-2026-05-06-deep-web-refresh.md)
