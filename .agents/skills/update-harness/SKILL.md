---
name: update-harness
description: >
  ONLY USE WHEN EDITING FILES IN /harness
  Harness-specific engineering defaults for Bun-first runtime/build/test flow,
  typed websocket contracts, zod validation, local-first persistence, Solid UI
  behavior, and required coverage for core changes. Use when changing harness
  CLI/UI/shared protocol/docs or when applying harness repository preferences.
---

# Update Harness

Use this file only to choose references.

## Scope

- Use for `harness/**`, `scripts/**`, root Bun or TypeScript config, websocket contract docs, and harness-facing README updates.

## Loading Rule

- Load the smallest reference set that can safely guide the edit.
- Do not read every reference by default.
- Put new harness rules in the most specific owning reference file, not here.

## Reference Index

Read only the relevant file(s):

- `references/general-conventions.md`: repo-wide harness conventions, context budget, naming, docs touch policy, default workflow.
- `references/runtime-architecture.md`: backend runtime, websocket bridge, zod/provider boundaries, run lifecycle, BranchFS/subagents, server completion.
- `references/typescript-build.md`: TypeScript style, Bun runtime/build command preferences, scripts, automation glue.
- `references/ui.md`: Solid UI, lucide-solid icons, primitives, shared behavior, dialogs, tooltips, buttons, Tailwind, reactive state.
- `references/testing-docs-coverage.md`: test expectations, verification commands, README/docs, user stories, coverage matrix.
