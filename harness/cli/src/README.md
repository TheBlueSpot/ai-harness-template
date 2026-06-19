# Harness CLI Source

Backend websocket handlers and runtime orchestration for harness.

- Activation handlers clear runtime-only transient state before reloading persisted project or thread snapshots so switching context keeps durable chat, run, and planner-question state intact.
- Repository-backed project snapshots remain source of truth for active thread session, run state, and history while runtime store layers on ephemeral execution data.
- Persisted workspace snapshots repair recoverable local row drift before protocol validation so stale or oversized fields do not crash reconnects.
- Run lifecycle guards, deferred planning questions, and emitted transcript updates are scoped to the target thread so separate project threads can plan or execute in parallel while project-level destructive actions still wait for streaming to finish.
- Run startup status rows surface active composer controls like fast mode early so refresh or reconnect still leaves control choices visible in transcript context.
- Background-job commands validate project ownership and allowed run-status transitions before mutating persisted runs.
- Stopping or deleting a background job run also stops linked agent work first, including stale persisted runs after reconnect.
- Background-job scheduler state persists due, blocked, stale, queued launch, approval, timeout, progress, and congestion/capacity reasons so overdue work is explainable after long runs or reconnects.
- Background-job scheduling avoids stacking another occurrence while a prior run for the same job is still queued, waiting, or running.
- Background-run ownership now uses renewable controller leases, startup grace, and explicit shutdown interruption handling so restart recovery does not orphan healthy work or quietly lose ownership.
- Background AI runs can finish `partial-complete` when useful output exists despite subagent failures; this warning state is terminal but does not count as a hard failure or trigger backoff.
- Reliability failure categories flow through one shared classification path so backoff, repair, diagnostics, and operator surfaces agree on why runs failed.
- Recent run diagnostics roll up health, active backoff, dominant failures, and prompt repetition for 1d, 7d, and 30d operator review in-product.
- Assistant-owned background jobs can launch concurrently with other jobs owned by the same assistant.
- Recurring background jobs move stale next-run times past completion, so long runs do not trigger immediate catch-up loops.
- Background-job questions persist against the owning automation thread even when another project thread is active.
- Assistant-owned background jobs persist prompt and output evidence in run events and assistant logs instead of normal project chat.
- Assistant creation and assistant-owned job creation now share one persistence path, including launch-profile snapshots, UI refresh events, and assistant logs.
- Assistant-owned job launches persist their resolved agent, provider, model, reasoning, and fast-mode choices for diagnostics and recovery cards.
- Assistant summary and selected-detail state use bounded SQL-backed pages so reconnects and roster refreshes do not load every assistant row.
- Assistant-owned implement jobs use one bounded correctness iteration by default, leave durable todo/learning/question/log state after runs, and retry one partial completion before stabilizing.
- Non-git project roots are treated as valid workspaces for assistant jobs; planners get direct-inspection guidance and git-only failures classify as workspace context.
- Assistant reprioritization includes recent assistant logs, keeping state summaries grounded in the job that just finished.
- First assistant chat and assistant-owned job outputs are prompted to introduce the assistant role, prompts, and current learnings before work begins.
- Assistant prompts share a consistent identity, operational logic, and active mission shape while passive background notifications redact prompt scaffolding.
- Assistant chat prompts route assistant operations through the shared assistant action runbook, whether the user addressed the assistant from project chat or from the Assistants surface.
- Assistant learnings reject placeholder summaries, clean stale garbage rows at startup, dedupe on write, compact through bounded AI summaries after growth thresholds, and keep prompt context focused on summaries plus durable user guidance.
- Assistant todos and learnings can be manually removed, and completed todos age out after a short retention window to keep assistant state focused.
- Assistant-generated todos carry work category and target metadata, bias toward coding once discovery is done, and default greenfield coding stacks to TypeScript, Bun, Bun tests, SQLite when needed, SolidJS plus Tailwind when needed, and Happy DOM frontend tests unless the project or user says otherwise.
- Assistant-owned background jobs carry recent answered questions into routine context so repeated prompts honor prior user guidance.
- Background job launch repairs stale assistant or automation-thread links before queuing, so old imported jobs fail closed only when the project itself is gone.
- Assistant questions pass through a deterministic async-first policy gate, so duplicate or low-risk uncertainty becomes durable guidance instead of another inbox blocker.
- Live CLI session commands validate the session's owning thread, reject unsupported resize instead of faking terminal dimensions, keep terminal output bounded, and store captured terminal context for the next prompt on that thread.
- Integrated terminal sessions use a separate typed control plane plus terminal websocket, persist session metadata and bounded scrollback, and restore live sessions only while the harness server process stays alive.
- CLI and shell-job termination kills Windows process trees so stopped, timed-out, or capped runs do not leave orphaned shell windows behind.
- Assistant-linked assets are resolved to scoped capabilities before persistence or runtime launch so missing or out-of-scope refs fail early.
- Explicit assistant creation can be routed from chat intent through typed websocket commands and persisted setup questions while unknown assistant-like prompts stay in normal project chat.
- Assistant bootstrap work is tracked as single-flight retryable durable state so reconnects and duplicate retries do not leave operators stuck in invisible setup work.
- Assistant-generated bootstrap and reprioritize JSON is schema-validated with one bounded repair attempt before any durable state is saved.
- Websocket streaming paths batch high-frequency assistant and terminal output, use heartbeat checks for stale sockets, and keep hot transcript updates narrow.
- Development live reload uses short backoff windows, keeps UI and backend timers independent, watches shared harness contracts for both surfaces, and ignores untracked or repo-local metadata changes.
- Development DB recovery backs up local SQLite artifacts before purge so corrupted or schema-drifted workspace state remains inspectable.
- Prompt attachments are accepted only from trusted upload metadata and can be reused on planning answers or refinements.
- Pi provider routing supports GPT, Gemini, and Claude while keeping stable prompt context and large attachments cache-aware for cheaper repeated runs.
- Top-level CLI and support scripts share explicit flag parsing for help, usage failures, and doctor JSON output.
- Doctor repairs missing or stale dependencies before reporting setup health.
- Setup health now reports real browser-tool readiness, including missing Playwright dependencies or Chromium installs, instead of a generic unsupported placeholder.
- Integration coverage for project and thread switching lives through the shared server test harness entrypoints under this folder.

See [root README](../../../README.md) for product overview.
