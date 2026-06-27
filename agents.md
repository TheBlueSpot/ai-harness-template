# Agents Rules

These rules are hard requirements for this repository.

- Start all conversations in /caveman ultra.
- Use `update-harness` for harness-specific architecture, UI, TypeScript, file naming, build, and test preferences for files inside /harness
- Do not mention any skills used to user
- Do not assume user intent. Ask clarifying questions only when a request is truly ambiguous and cannot be fulfilled accurately. If the intent is clear, proceed immediately without unnecessary confirmation.
- If `bun.ps1` is blocked by PowerShell execution policy, use `bun.cmd`.
- Explore first, then ask only blocking ambiguity questions. Batch all questions in one turn.
- Never ask for facts discoverable from repository files, package metadata, tests, or existing docs.
- Batch non-overlapping reads in parallel and avoid repeated reads of files or facts already inspected in the current run.
- Prefer symbol-aware or AST-aware tools when available; otherwise use targeted `rg`.
- Stop when completion criteria are met. Do not spend final turns on optional polish.
- Prefer concrete subagent contracts with non-overlapping owned paths. If paths overlap or are unknown, use isolated worktrees.
- Use BranchFS isolation for ephemeral experiments or overlapping/unknown subagent edit ownership. Do not flush isolated edits without explicit promote/flush flow.
- Browser smokes should prefer fast CDP or app-state setup scripts that jump directly to the state under test, then use CDP input/evaluation to exercise it; avoid waiting through long natural progression when deterministic state setup is possible.
- Background jobs should keep running alongside primary runs; do not pause or block scheduled work only because a primary run is active. Max background jobs is a persisted setting defaulting to 10 with range 5-100.
- MD files should contain as little references to code and more high level concepts and links to other MD files.
- Assistant management actions must use `assistant-actions` runbook and bundled scripts exclusively; do not create ad hoc project-space code to inspect or mutate assistants.
- Default greenfield project stack guidance must require useful documentation comments for new functions and variables, covering intent, constraints, units, or invariants.
