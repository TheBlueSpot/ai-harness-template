---
name: next-todo
description: >
  Execute the next high-priority item from docs/todo.md end-to-end. Use when the user says
  "implement next todo", "work next item", "pick next roadmap item", or asks for product-minded
  implementation plus research, grilling, docs cleanup, and todo removal.
---

Implement next `docs/todo.md` item end-to-end. Optimize for PMF, not checkbox parity.

## Default Stack

Use `caveman` for terse updates.
Use `update-harness` for harness code, protocol, UI, tests, and docs.
Use `grill-me` when product boundaries, preferences, or aesthetic taste are unclear.

## Workflow

1. Read `docs/todo.md`, nearest `README.md`, and repo instructions first.
2. Unless user overrides, pick highest remaining todo item.
3. If item changes product shape, do official-source research first:
   - competitor docs
   - official repos/docs
   - issue trackers for pain signals
4. Summarize PMF pain points before coding:
   - setup friction
   - unclear capability limits
   - frozen or unrecoverable sessions
   - context drift / missing persistent instructions
   - opaque background work
5. Use `grill-me` one question at a time for unresolved boundary choices.
   - Ask only what codebase research cannot answer.
   - Include recommended answer.
   - If user does not answer quickly, proceed with explicit assumption.
6. Implement smallest slice that is end-to-end useful now.
   - Prefer real utility over fake surface parity.
   - Capability-gate unsupported paths.
   - Degrade explicitly, never silently.
   - Keep local-first and typed-contract shape intact.
7. Add or update tests for protocol, persistence, server/runtime, and UI logic touched by the change.
8. Run `bun.cmd run typecheck` and `bun.cmd run test`.
9. Update docs:
   - remove completed todo item from `docs/todo.md`
   - if scope remains, replace it with narrower follow-up items
   - update nearest `README.md` at high level
10. In final response, include:
   - what shipped
   - PMF/pain-point read
   - assumptions from grilling
   - verification status
   - residual risks

## Heuristics

- Features win PMF when they improve first 5 minutes, not when they look broad on a checklist.
- Favor inspectable state, resumability, and explicit reasons for disabled actions.
- If transport/storage works but agent cannot truly use the data, do not claim feature complete.
- For multimodal or external-tool features, wire real model/tool consumption before polishing UI.
- When roadmap item is too broad, ship the highest-signal slice and rewrite remainder as smaller follow-up todos.
