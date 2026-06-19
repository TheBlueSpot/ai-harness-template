# Testing, Docs, And Coverage

Use this when deciding verification scope, updating README/docs, changing user-facing behavior, or touching story/coverage inventory.

## Testing Preferences

- Core functionality updates must be thoroughly covered with both unit tests and integration tests before done.
- LLM/provider structured-output changes must test canonical valid payloads, known alias normalization, unknown invalid values, repair success, repair failure, and persisted canonical output.
- Treat websocket protocol, workspace persistence, planning or run lifecycle, preferences storage, worktree orchestration, and shared UI state or transport logic as core functionality.
- Pure copy, content, or visual-only layout tweaks without behavior change only need unit testing.
- Prefer colocated harness tests next to source files.
- Backend websocket integration tests are authoritative for command, protocol, and run lifecycle behavior.
- Add focused UI or store tests for local branching logic, plus integration tests when behavior crosses component or transport boundaries.

## Verification Commands

- For core harness changes, run `bun test` and `bun run typecheck` unless blocked. If blocked, state the exact blocker.
- If `bun.ps1` is blocked by PowerShell execution policy, use `bun.cmd`.
- Run `bun run build:ui` only when the change meaningfully risks production build output or asset delivery behavior.

## Docs

- Keep README updates high-level.
- Prefer linking to durable docs and skill docs over embedding code-heavy explanations.
- Do not turn Markdown files into code mirrors. Keep them focused on concepts, workflows, and links to deeper docs.

## User Stories And Coverage

- Treat `docs/user-stories.md` as the canonical product-behavior inventory for `/harness`.
- Any change that adds, removes, or meaningfully alters a capability listed in `README.md` or `docs/todo.md` must also add, update, or remove the matching `US-*` entry in `docs/user-stories.md` in the same change.
- Any change that lands behavior for a shipped `US-*` story must update `docs/coverage-matrix.md` with the new covering test file and a non-`GAP-HIGH` depth.
- New `US-*` stories start as `GAP-HIGH` in `docs/coverage-matrix.md` until at least one colocated or integration test covers them.
- Reviewers should reject harness PRs that change `README.md` behavior bullets without updating the stories and coverage files.
