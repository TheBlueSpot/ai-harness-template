---
name: correctness-scan
description: Deep correctness and product-quality review workflow for this harness. Use when Codex is asked to scan user stories, map behavior to code, find edge/corner-case gaps, evaluate UI/UX quality, review harness CLI capabilities, identify duplicate logic worth extracting, or update `docs/correctness-review.md` with new findings, coverage gaps, and reusable review patterns.
---

# Correctness Scan

## Goal

Investigate correctness gaps beyond happy paths first, then merge the findings into `docs/correctness-review.md`. This skill is for scanning only, not implementing fixes. Bias toward shipped behavior in `docs/user-stories.md`, code reality, tests in `docs/coverage-matrix.md`, user-facing UI/UX polish, CLI ergonomics, and duplicate logic that can drift.

For UI/UX or CLI quality scans, read [source-lens.md](references/source-lens.md) before writing findings.
Read [discovered-patterns.md](references/discovered-patterns.md) before starting a new scan so prior gap categories and failure patterns keep compounding instead of getting rediscovered from scratch.

## Workflow

1. Load repo rules and harness guidance.
   - Read `agents.md`.
   - Use `update-harness` when touching or judging `harness/**`, `scripts/**`, root Bun or TypeScript config, or harness docs.

2. Build behavior inventory.
   - Read `docs/user-stories.md`, `docs/coverage-matrix.md`, `docs/todo.md`, and relevant `README.md`.
   - Treat shipped `US-*` stories as expected behavior.
   - Treat roadmap stories as explicit non-shipped gaps unless code already claims them.

3. Map stories to code.
   - Search with `rg` first.
   - Map each story area to backend command handlers, persistence, protocol schema, runtime state, UI store/components, tests, and scripts.
   - Prefer exact code references over broad claims.

4. Probe correctness seams.
   - Check stale ids, repeated commands, reconnect/reload, concurrent clients, thread/project switching, background runs, partial failures, retries, cancellation, pause/resume, deleted resources, malformed persisted data, unavailable providers, missing files, Windows path/case behavior, and dirty git states.
   - Compare UI affordances with backend rejection rules.
   - Compare persisted state with runtime-only state.
   - Look for statuses represented in one layer but not another.

5. Probe UI/UX.
   - Check status visibility, recoverability, error wording, discoverability, keyboard access, focus flow, dialogs, tooltips, disabled-state reasons, contrast, responsive constraints, and whether dense work surfaces avoid decorative noise.
   - For visual work, verify with screenshots when feasible.

6. Probe CLI and dev scripts.
   - Check help, examples, stdout/stderr split, exit codes, machine-readable output, idempotence, dry-run/safe modes, config/env precedence, Windows shell behavior, and actionable errors.
   - Ensure scripts fail before destructive work when preconditions are missing.

7. Identify duplicate logic worth extracting.
   - Prioritize duplicate status predicates, command wrappers, path normalization, id generation, localStorage parsing, protocol payload shaping, project open flows, run lifecycle wrappers, and error formatting.
   - Only recommend extraction when drift risk or bug surface is real.

8. Update findings in `docs/correctness-review.md`.
   - Treat `docs/correctness-review.md` as the canonical output unless the user explicitly asks for a different artifact too.
   - Merge with existing `CR-*` items when the new scan deepens an existing category.
   - Add new `CR-*` items only when the gap is genuinely new.
   - Keep the doc high-level with links to code, not long code excerpts.
   - Do not implement fixes while using this skill unless the user explicitly changes the task from scan to fix.

9. Refresh the skill when new patterns appear.
   - If the scan reveals a reusable gap category, probe prompt, or review heuristic that is not already captured, update `references/discovered-patterns.md` in the same turn.
   - If the new pattern changes how future scans should run, also update this `SKILL.md` in the same turn.
   - Keep pattern notes high-level: category, why it matters, common seams, and what to verify next time.

10. Write findings to the user.
   - Summarize what changed in `docs/correctness-review.md`.
   - Lead with impact, story ids, code map, edge case, why tests miss it, and fix direction.
   - Separate confirmed bugs, likely risks, test gaps, and extraction opportunities.

## Output Shape

Use this order:

1. Scope and sources reviewed.
2. Story-to-code map.
3. Findings sorted by severity or risk.
4. Duplicate logic to extract.
5. Coverage priorities.
6. New patterns discovered.
7. Bottom line.

Each finding should include:

- `Stories`
- `Code map`
- `Impact`
- `Edge case`
- `Fix direction`

## Stop Conditions

Do not rewrite product requirements during the scan. If code and stories disagree, record the disagreement and name the deciding source. Always update `docs/correctness-review.md` before ending the turn unless the user explicitly says not to. If a new reusable scan pattern is found, capture it before ending the turn. Do not implement code fixes as part of this skill unless the user explicitly asks to switch from scanning to fixing.
