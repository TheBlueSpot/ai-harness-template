# Discovered Gaps

## 1. Zero-pending queue state still has no durable maintenance slot
- Once `./todo.md` has `0` pending rows, the next execution target lives in helper output and prose instead of one stable field.
- That makes the active maintenance pick easy to drift across assistant memory, notes, and the latest rerun, especially when `queue_reconcile.ts --json` correctly says `seed-next-pending` for queue hygiene while the live maintenance lane still says `verify-smoke`.

## 2. Lane ranking and lane sampling can disagree
- The top maintenance lane is stable, but the lane picker can still sample a stale-proof slug while the live missing-proof front has already moved.
- That mismatch is enough to send the next operator into the right lane with the wrong first target.
- The same-day rerun also showed that prose notes can lag behind the helper front multiple times, so stale named slugs are now their own maintenance-risk signal.

## 3. Review-freshness output still injects repo-meta noise
- The current missing-review lane surfaces the `context` meta row instead of a live game entry.
- Latest helper split is `1` missing, `122` blocked, and `10` pre-edit reflag targets.
- That is useful for data hygiene, but weak for choosing the next catalog maintenance pass.

## 4. Root-roadmap comparison still lacks one durable rule
- The broader roadmap keeps priority by area and also carries one concrete selected next pass.
- Comparison notes drift when they flatten those two signals together instead of recording both.

## 5. Broader roadmap source routing is still easy to misattribute
- Fresh public Cursor evidence now splits across two different roadmap areas: April 29, 2026 backs archive or restore lifecycle work, while May 4, 2026 backs spend and usage visibility.
- Without a small source-routing rule, later comparison notes can attach both signals to one area and muddy why the broader harness ranking stayed stable.

## 6. Broader roadmap corroboration is still underused
- [../../docs/user-stories.md](../../docs/user-stories.md) now exists, but the comparison baseline still does not consume it.
- That means broader harness prioritization can use a shipped-story inventory now, but the local comparison note still leans more on roadmap notes and market signals than it should.

## 7. Later shared maintenance bets are still capability gaps, not ready lanes
- The current follow-on bets still need executable support around accepted-input certainty, compact-screen readability smoke, repair-surface settings reachability, and overload scoring.
- Because those helpers are not landed yet, they remain correct future bets but weaker immediate picks than proof refresh, even after comparing them against the current local per-game todo set.
- The 2026-05-06 market pass tightened two of those future bets: compact-screen proof wants a small responsive width matrix, and the later readability follow-up should narrow to timed or motion-conflicted text instead of broad clutter language.
- The latest same-day rerank check did not reveal a sharper new shared lane: replayable-help and objective-recall work is already better covered by the shipped reminder-reentry smoke plus existing recovery audits than by inventing another near-duplicate skill.

## 8. Choice and progression lane boundaries are still soft
- The repo can now capture richer branch evidence, but it still lacks a durable rule for when the same moment should route to mastery, readable progression, or choice readback.
- That can blur future queue writing and audit handoff.

# Why It Matters

- Maintenance choice needs one stable place to live once the build queue is empty.
- Sample-slug drift wastes time even when the top lane rank is right.
- Meta review noise can push attention away from game work.
- Area rank and concrete next-pass selection should not be conflated during roadmap review.
- Misattributed market signals can make a stable broader ranking look like it changed.
- Missing helper coverage keeps good ideas stuck as theory instead of executable lanes.

# Impact Level

- High: Zero-pending maintenance slot
- High: Queue-seed versus maintenance-lane split
- High: Lane rank versus sample-slug mismatch
- Medium: Root-roadmap comparison rule
- Medium: Broader roadmap source-routing rule
- Medium: Review-freshness meta noise
- Medium: Missing later-lane helpers
- Medium: Choice or progression routing boundary
- Low-Medium: Existing broader story inventory not yet folded into comparison

# Suggested Closure Path

- Add one durable `next maintenance target` surface for zero-pending queue states.
- Separate `queue structurally clean` from `next executable maintenance item` so `seed-next-pending` does not read like a contradiction when smoke debt still leads.
- Make lane pickers prefer the same front slug batch used by the lane-level proof helpers.
- Treat any named next slug in markdown as disposable unless it is tied to the latest helper rerun date.
- Separate repo-meta review hygiene from game-entry maintenance selection.
- Record both broader area order and concrete selected next pass in roadmap comparison notes.
- Record which external source backs which broader roadmap area when one vendor update touches more than one lane.
- Land the smallest reusable helpers for action certainty, compact-screen readability, repair-surface settings access, and overload scoring before trying to rank them above proof refresh.
- When the compact-screen helper is defined, make it width-matrix based from the start so the repo does not hard-code a one-device screenshot habit.
- After that, prefer a narrow `timed-info-readability-smoke.ts` helper for auto-updating text and motion-behind-text failures before inventing another broad HUD-clutter lane.
- Add one short routing rule for mastery, readable progression, and choice-readback evidence reuse.
