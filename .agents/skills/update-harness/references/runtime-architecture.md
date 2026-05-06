# Runtime And Architecture

Use this when touching backend runtime, websocket protocol, provider structured output, run lifecycle, subagents, worktrees, BranchFS, or server completion.

## Runtime Shape

- Runtime turn budgets are typed run contracts.
- Budgeted model turns must reserve before prompts, persist current usage, hard-fail with a categorized exhaustion state, and include protocol, repository, orchestrator, subagent concurrency, and server lifecycle tests.
- `run.complete` is the typed run finalization command.
- Server completion paths should share the same helper, persist the final assistant message, clear streaming and abort state, emit `run.updated`, then emit `chat.complete`.
- Overlapping or unknown subagent ownership must upgrade same-worktree plans to isolated BranchFS worktrees before execution.
- Trace BranchFS isolation upgrades and keep BranchFS flush behind explicit promote/flush flow.

## Boundaries And Validation

- Never execute raw shell commands from websocket input.
- Keep command handling behind a narrow, typed bridge.
- Fail fast on invalid input, malformed payloads, and unexpected message types.
- Validate unknown payloads with zod at boundaries.
- Treat all LLM/provider JSON as hostile boundary input.
- Never rely on prompt-only enum compliance for provider-generated structured payloads.

## Structured LLM Output

- For LLM-generated structured payloads, keep exact zod schemas and add deterministic alias normalization only for known-safe synonyms before parsing.
- For recoverable LLM schema failures, make one bounded repair attempt before failing a user-visible run.
- Do not widen domain types to accept invalid model vocabulary.

## Runtime Defaults

- Prefer Bun APIs and Bun runtime features when possible.
- Use Bun TypeScript for harness internals unless lower-level code gives a clear extreme performance win.
- Keep development local-first.
- Do not reintroduce old OpenAI-only restriction. Current harness can support multiple providers.
- Debug-only code should key off `process.env.NODE_ENV !== "production"`; do not add separate debug env toggles like `HARNESS_DEBUG`.

## Subagents And Worktrees

- Prefer concrete subagent contracts with non-overlapping owned paths.
- If paths overlap or are unknown, use isolated worktrees.
- Use BranchFS isolation for ephemeral experiments or overlapping/unknown subagent edit ownership.
- Do not flush isolated edits without explicit promote/flush flow.
