---
name: next-gap
description: >
  Execute the top unresolved correctness gap from docs/correctness-review.md end-to-end. Use when the user says
  "fix next gap", "work top correctness gap", "implement top review issue", or asks Codex to close the first
  listed CR-* item by planning, implementing, testing, and removing or rewriting the gap entry once covered.
---

Implement the first unresolved `CR-*` gap in `docs/correctness-review.md` end-to-end.

This skill is for implementation only. It consumes the review doc, closes the gap in code and tests, and then removes or rewrites the resolved `CR-*` entry. It is not the skill for broad scanning.

## Default Stack

Use `caveman` for terse updates.
Use `update-harness` for harness code, protocol, UI, tests, and docs.
Use `correctness-scan` only as a narrow read or refresh aid when the chosen gap wording or current code reality may have drifted before implementation starts.
Use `grill-me` when product boundaries or acceptance shape remain unclear after repo research.

## Workflow

1. Read `docs/correctness-review.md`, `docs/coverage-matrix.md`, nearest `README.md`, and repo instructions first.
2. Unless user overrides, pick the first listed unresolved `CR-*` item in `docs/correctness-review.md`.
3. Re-investigate that single gap in current code before coding.
   - Confirm it still exists.
   - Tighten acceptance shape from the gap text, stories, and nearby tests.
   - If it no longer exists, remove or rewrite the gap entry instead of coding phantom work.
   - Do not broaden into a new correctness survey; stay scoped to the chosen `CR-*` item unless the code forces a tightly related follow-up.
4. Summarize the implementation plan before major edits.
   - scope to close now
   - tests needed
   - doc updates needed
5. Use `grill-me` one question at a time for unresolved boundary choices.
   - Ask only what repo research cannot answer.
   - Include recommended answer.
   - If user does not answer quickly, proceed with explicit assumption.
6. Implement the smallest end-to-end slice that actually closes the gap.
   - Prefer real correctness closure over cosmetic cleanup.
   - Tighten guards at the contract or persistence boundary, not only the UI.
   - Extract shared helpers when the bug comes from drift-prone repeated logic.
7. Add or update tests for the touched behavior.
   - Favor backend integration tests for command, lifecycle, and persistence fixes.
   - Add focused unit tests when a new helper or edge predicate is introduced.
8. Run `bun.cmd run typecheck` and `bun.cmd run test`.
9. Update docs after code is covered:
   - remove the closed `CR-*` item from `docs/correctness-review.md`
   - if scope remains, replace it with narrower follow-up `CR-*` items lower in the list
   - update `docs/coverage-matrix.md` when coverage materially improves a mapped story
   - update nearest `README.md` only if user-visible behavior changed
10. In final response, include:
   - what gap was closed
   - what changed
   - verification status
   - any narrower follow-up gaps that remain

## Heuristics

- Remove a gap only when behavior plus tests now cover the edge case the finding described.
- If a fix only improves instrumentation or docs, rewrite the gap instead of deleting it.
- If the top gap is too broad, ship the highest-signal slice and replace the original entry with smaller follow-up items.
- Keep `docs/correctness-review.md` sorted from highest current risk to lower current risk.
