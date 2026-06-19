# Docs

High-level product and planning notes live here.

- [Roadmap TODOs](todo.md) tracks current bets, sequencing, and deferred work.
- [User stories](user-stories.md) canonicalizes every shipped and roadmap capability as a stable `US-*` entry.
- [Coverage matrix](coverage-matrix.md) maps shipped user stories to test files and flags gaps; new stories start `GAP-HIGH` until a test covers them.
- Current roadmap emphasis, in priority order: stronger activation repair loops, stronger trust and review controls, tighter daily coding flow, shared memory and playbook control that stays inspectable, resilient provider portability, budget-aware long runs with visible progress, deeper remote-target and away-from-desk review follow-through beyond shipped local background jobs, disposable experiment branches for risky work, and cleaner thread retrieval and cleanup for long-lived projects.
- Root [README](../README.md) covers overall product shape, workflow, and durable links.
- Current shipped runtime shape now includes SDK and CLI-backed agent paths, with harness-owned session continuity and health-aware live terminal support.
- Activation now ships as bootstrap, doctor, portable launcher packaging, an in-chat checklist, and guided help tutorials. `todo.md` focuses on narrower repair and packaging follow-up instead of first-pass onboarding delivery.
- Dense surfaces stay tight by default. Extra cockpit chrome should only ship when it unlocks otherwise hidden workflow value.
- Current chat composer state is browser-global for normal project chat. Future roadmap work should only add narrower thread- or project-scoped presets when that scoping is explicit and inspectable.

Keep docs in this folder conceptual. Prefer linking to deeper references instead of embedding implementation detail.
