# Correctness Review

Static review date: 2026-04-24.
Last merged targeted CLI scan: 2026-04-24.
Last merged targeted UI thread-state scan: 2026-04-24.
Last merged targeted UI/CLI bridge scan: 2026-04-24.

Source of truth: [user-stories.md](user-stories.md), [coverage-matrix.md](coverage-matrix.md), [architecture overview](../context/architecture/overview.md), and harness implementation under [harness](../harness).

This review focuses on correctness gaps outside the expected happy path. It does not replace `bun test`; it maps shipped stories to likely edge failures and extraction opportunities.

## Story To Code Map

| Story area | Main implementation surfaces | Highest edge risk |
| --- | --- | --- |
| WORKSPACE, SEARCH | [server](../harness/cli/src/server.ts), [workspace repository](../harness/cli/src/workspace-repository.ts), [project search](../harness/cli/src/project-search-service.ts), [project switcher](../harness/ui/src/components/project-switcher-dialog.tsx) | Project open flows are repeated across add, create, and browse; validation behavior can drift. |
| THREADS, PERSISTENCE | [workspace repository](../harness/cli/src/workspace-repository.ts), [runtime store](../harness/cli/src/workspace-runtime-store.ts), [UI store](../harness/ui/src/harness-store.ts), [chat panel](../harness/ui/src/components/chat-panel.tsx), [sidebar](../harness/ui/src/components/project-sidebar.tsx) | Thread-local runtime overlays now preserve background execution; remaining risk is drift between persisted run summaries and UI affordances. |
| PLANNING, RUNS | [server lifecycle](../harness/cli/src/server.ts), [planner](../harness/cli/src/pi-planner.ts), [orchestrator](../harness/cli/src/pi-orchestrator.ts), [trace panel](../harness/ui/src/components/trace-panel.tsx), [chat panel](../harness/ui/src/components/chat-panel.tsx) | Repeated run lifecycle guards and controller state make stale or cross-thread commands risky. |
| WORKTREE | [BranchFS manager](../harness/cli/src/branchfs-manager.ts), [subagent integration](../harness/cli/src/branchfs-subagent-integration.ts), [orchestrator](../harness/cli/src/pi-orchestrator.ts), [subagent scheduler](../harness/cli/src/pi-subagents.ts) | Same-worktree ownership checks miss Windows case conflicts and edits to already-dirty files. |
| PROVIDERS, RUNTIMES | [runtime registry](../harness/cli/src/agent-runtimes/runtime-registry.ts), [Codex adapter](../harness/cli/src/agent-runtimes/codex-sdk-adapter.ts), [Pi adapter](../harness/cli/src/pi-agent-adapter.ts), [protocol](../harness/shared/protocol.ts), [CLI session manager](../harness/cli/src/agent-runtimes/cli-session-manager.ts), [UI store](../harness/ui/src/harness-store.ts) | Live CLI sessions still mix thread-scoped intent with project-scoped view state, so attach, resize, and capture flows can drift from real runtime ownership. |
| ATTACHMENTS | [attachment prompt builder](../harness/cli/src/chat-attachment-prompt.ts), [document extractors](../harness/cli/src/document-extractors), [attachment UI](../harness/ui/src/components/chat-panel-attachments.test.tsx) | Upload lifecycle and planning-answer/refine attachment paths are roadmap-only. |
| ASSISTANTS, JOBS, NOTIFICATIONS | [assistant manager](../harness/cli/src/assistant-manager.ts), [background scheduler](../harness/cli/src/background-job-scheduler.ts), [background schedule parser](../harness/cli/src/background-job-schedule.ts), [notification inbox](../harness/ui/src/components/notification-inbox.tsx) | One-off scheduling is now terminal after first fire; remaining risk sits in notification id collisions and thin lifecycle guards. |
| UI, MARKDOWN | [UI store](../harness/ui/src/harness-store.ts), [run status helpers](../harness/ui/src/lib/run-status.ts), [markdown content](../harness/ui/src/components/markdown-content.tsx), [primitives](../harness/ui/src/components/primitives) | Tooltip and popover portal behavior has important coverage gaps, but lower data-loss risk. |
| DEV, ACTIVATION | [launch harness](../harness/cli/src/launch-harness.ts), [CLI entry](../harness/cli/src/cli-entry.ts), [scripts](../scripts), [setup health](../harness/cli/src/setup-health.ts) | Bootstrap and doctor remain high coverage gaps in the matrix. |

## Findings

### CR-004: Notification ids can collide after 128-character truncation

Stories: `US-NOTIFICATIONS-001`, `US-NOTIFICATIONS-002`, `US-RUNS-013`, `US-BROWSER-002`, `US-ASSISTANTS-004`.

Code map: [notification creation](../harness/cli/src/server.ts), [notification persistence](../harness/cli/src/workspace-repository.ts), [notification inbox UI](../harness/ui/src/components/notification-inbox.tsx).

Impact: Planning question, assistant question, and browser approval notification ids are built from semantic ids and then sliced to 128 characters. Long ids that share the same prefix can overwrite or archive each other. Browser approval ids include four separate identifiers, so collision risk is practical if tool call ids or provider ids grow.

Fix direction: Replace truncation with a stable hash suffix. Keep readable prefixes, but make uniqueness depend on full input.

### CR-005: Same-worktree path ownership is not Windows-correct

Stories: `US-WORKTREE-004`, `US-WORKTREE-005`, `US-WORKTREE-006`, `US-WORKTREE-010`.

Code map: [same-worktree scheduler](../harness/cli/src/pi-orchestrator.ts), [subagent tests](../harness/cli/src/pi-subagents.test.ts), [planner contract rules](../harness/cli/src/pi-planner.ts).

Impact: Owned-path overlap checks normalize path separators but not case. On Windows, `src/Foo.ts` and `src/foo.ts` refer to the same path for normal checkouts, but the scheduler can treat them as disjoint and run workers concurrently.

Fix direction: Normalize paths with platform-aware case handling before overlap, drift, and scope checks. Tests should include mixed-case owned paths on Windows semantics.

### CR-006: Same-worktree drift checks miss edits to files already changed before a worker starts

Stories: `US-WORKTREE-005`, `US-WORKTREE-006`.

Code map: [same-worktree drift inspection](../harness/cli/src/pi-orchestrator.ts).

Impact: Drift detection compares changed files after a task to the set of files changed before that task. If a later worker edits a path that was already dirty from a previous worker, that path is excluded from `changedByTask` and out-of-scope drift can be missed.

Why happy path misses it: Existing tests cover clean disjoint paths and queueing overlaps. They do not cover "worker B modifies worker A's already-modified file."

Fix direction: Track per-task file snapshots or content hashes for owned and forbidden paths, not only membership in `git status`.

### CR-007: Thread fork is not clearly transcript-only

Stories: `US-THREADS-004`, `US-THREADS-008`, `US-PLANNING-004`.

Code map: [thread fork persistence](../harness/cli/src/workspace-repository.ts), [thread fork command](../harness/cli/src/server.ts), [chat rendering](../harness/ui/src/components/chat-panel.tsx).

Impact: Fork copies every persisted thread message, including message kind, attachments, and metadata. That carries plan-summary cards, run-milestone rows, and other execution residue into a supposedly clean fork. The fork does not copy active run rows, but copied transcript metadata can still make old plan cards or milestone rows appear to belong to the new branch.

Fix direction: Define "source transcript" explicitly. If plan cards, run milestones, or other execution-only transcript rows are not part of forkable transcript, filter message kinds and metadata during fork instead of cloning every message row.

### CR-008: Terminal run timestamps only mark `completed`

Stories: `US-RUNS-002`, `US-RUNS-003`, `US-PERSISTENCE-005`, `US-PERSISTENCE-006`.

Code map: [run status persistence](../harness/cli/src/workspace-repository.ts), [run lifecycle](../harness/cli/src/server.ts).

Impact: `completedAt` is set only when status is `completed`. Failed, stopped, and partial-complete runs keep no terminal timestamp. That weakens ordering, stale-run detection, and future proof-bundle work for the exact statuses most likely to need recovery.

Fix direction: Add a terminal timestamp for all terminal or user-actionable stopped states, or introduce a separate `endedAt`.

### CR-009: Plan prerequisites are presentation-only today

Stories: `US-PLANNING-010`, `US-WORKTREE-009`.

Code map: [execution plan prerequisite flow](../harness/cli/src/server.ts), [planner rules](../harness/cli/src/pi-planner.ts).

Impact: Prerequisites are marked complete with trace events before execution starts, but no actual prerequisite command or agent action runs. If a plan depends on shared setup work, subagents can still start without the foundation being created.

Fix direction: Either rename these as planning annotations, or execute prerequisite work through a real main-executor step before fan-out.

### CR-010: Background job approval and scheduler policy has thin non-happy coverage

Stories: `US-JOBS-001`, `US-JOBS-003`, `US-JOBS-004`, `US-RUNS-013`.

Code map: [scheduler](../harness/cli/src/background-job-scheduler.ts), [background executor](../harness/cli/src/background-job-executor.ts), [server background commands](../harness/cli/src/server.ts), [coverage matrix](coverage-matrix.md).

Risk cases:

- One-off jobs after first fire.
- Approval policy changes while runs are queued.
- Paused global execution during schedule catch-up.
- Assistant-linked jobs when assistant is paused, deleted, or fails during bootstrap.
- Retry of cancelled or awaiting-input background runs.

Fix direction: Add integration tests around each status transition and scheduler tick after restart.

### CR-011: Background job lifecycle commands trust ids more than ownership or valid state

Stories: `US-JOBS-001`, `US-JOBS-003`, `US-JOBS-004`, `US-RUNS-013`.

Code map: [server background commands](../harness/cli/src/server.ts), [background run persistence](../harness/cli/src/workspace-repository.ts), [background scheduler](../harness/cli/src/background-job-scheduler.ts).

Impact: `run-now`, `stop-run`, `retry-run`, `approve-run`, and `reject-run` mostly mutate rows by id and assume the caller is targeting the right project and a still-valid lifecycle state. That leaves stale or cross-project ids able to rewrite persisted background-run state more easily than they should.

Edge cases:

- A command can target a run id without first proving it belongs to the request project.
- Stop or reject can rewrite a run that is already terminal.
- Retry and approve flows depend more on existing row shape than an explicit allowed-transition table.

Fix direction: Centralize background job command guards so ownership, current status, and allowed transition checks happen before any persistence mutation.

### CR-012: Attachment lifecycle correctness is mostly prompt-time only

Stories: `US-ATTACHMENTS-001`, `US-ATTACHMENTS-002`, `US-ATTACHMENTS-003`, roadmap upload hygiene stories.

Code map: [attachment prompt builder](../harness/cli/src/chat-attachment-prompt.ts), [document extractors](../harness/cli/src/document-extractors), [attachment UI](../harness/ui/src/components/chat-panel-attachments.test.tsx).

Impact: Fetch failures are converted into transcript notes, which is good for graceful execution. The missing edge is lifecycle truth: expired/deleted remote files, removed unsent uploads, and attachments on planning answer/refine are not represented yet. That means the user can believe context was attached when only an unavailable note reached the model.

Fix direction: Treat attachment availability as part of preflight for all prompt-bearing commands, or surface degraded attachment status before execution.

### CR-013: Live CLI session stories are schema-heavy, behavior-light

Stories: `US-RUNTIMES-003`, `US-RUNTIMES-005`.

Code map: [CLI session manager](../harness/cli/src/agent-runtimes/cli-session-manager.ts), [CLI process manager](../harness/cli/src/agent-runtimes/cli-process-manager.ts), [server websocket handlers](../harness/cli/src/server.ts), [UI websocket bridge](../harness/ui/src/harness-websocket.ts), [UI store](../harness/ui/src/harness-store.ts), [CLI session panel](../harness/ui/src/components/cli-session-panel.tsx), [coverage matrix](coverage-matrix.md).

Impact: Bridge now has a few concrete correctness gaps, not only generic thin coverage.

Edge cases:

- Session ownership is thread-unsound. `cli-session.start` proves the target thread is active, but `stop`, `resize`, `attach`, and `capture-visible-buffer` trust `sessionId` and caller-supplied `threadId` more than the session's real owner. After a thread switch, the UI can keep showing the old thread's session through project-level `activeCliSession`, and later commands can mutate or relabel that session as if it belonged to the newly active thread.
- Resize is metadata-only. The bridge accepts `cli-session.resize` and updates stored `cols` and `rows`, but interactive process wiring exposes no resize primitive, so the child process keeps its original terminal dimensions while the UI and protocol claim resize succeeded.
- Visible-buffer capture is dead-end today. The UI offers `Capture visible state for follow-up`, and the manager stores `visibleBuffer` plus `stderrTail`, but no later command or execution path reads that stored snapshot back into prompts or recovery flows. The affordance implies follow-up context that never actually reaches the agent.
- Hang-detected transport looks incomplete. `cli-session.hang-detected` exists in protocol and the UI reducer, but the server never emits it. That makes a user-visible contract look supported without runtime behavior behind it.

Why happy path misses it: Coverage matrix still marks `US-RUNTIMES-003` and `US-RUNTIMES-005` as schema-only, and current tests do not exercise thread switching during an active live CLI session, reconnect after thread drift, resize fidelity, or follow-up capture consumption.

Fix direction: Treat live CLI sessions as thread-owned state end to end. Store them per thread instead of one project-wide slot, validate every mutating CLI-session command against the session's real project and thread, and make emitted events use manager-owned identity rather than caller-supplied thread ids. Either implement true interactive resize and captured-buffer reuse, or narrow the UI plus protocol claims until runtime behavior exists. Add websocket integration coverage with thread switching, wrong-thread commands, reconnect, resize, and capture-to-follow-up flows.

### CR-014: Top-level CLI ergonomics are still glue-code grade

Stories: `US-DEV-002`, `US-DEV-007`, `US-DEV-008`.

Code map: [CLI main](../harness/cli/src/index-main.ts), [launch recovery](../harness/cli/src/launch-harness.ts), [bootstrap script](../scripts/bootstrap.ts), [launcher packaging](../scripts/package-launcher.ts), [coverage matrix](coverage-matrix.md).

Impact: Entry scripts parse raw flags directly and expose no first-class `--help` contract, no stable machine-readable doctor mode, and only light validation around bootstrap and packaging paths. These are user-facing CLI surfaces, so weak contracts here create confusing startup and automation failures.

Fix direction: Define the supported top-level CLI contract explicitly, add help output and stronger flag validation, and cover exit-code and stdout or stderr behavior for doctor, bootstrap, and packaging flows.

### CR-015: Disabled composer state can be bypassed with keyboard submit

Stories: `US-THREADS-007`, `US-PLANNING-006`, `US-RUNS-008`, `US-UI-016`, `US-UI-017`.

Code map: [chat panel](../harness/ui/src/components/chat-panel.tsx), [UI store](../harness/ui/src/harness-store.ts), [chat panel tests](../harness/ui/src/components/chat-panel.test.tsx).

Impact: The send button disables correctly for several blocked states, but the textarea stays submittable with `Enter` and `handleSubmit` does not reuse the same predicate. In practice the user can still send while the active thread is streaming or while setup gating says the send button is disabled.

Edge cases:

- `composerSubmitState` disables send with `Project is streaming`, but `handleSubmit` never checks `project.session.isStreaming`, so pressing `Enter` can still dispatch `chat.send`, `planning.answer`, or `planning.refine`.
- `composerSubmitState` disables fresh top-level sends behind setup gating, but `handleSubmit` never checks `setupBlockedReason`, so keyboard submit can bypass the disabled button.
- Current tests cover click-disabled button states and happy-path `Enter` submit, but they do not assert that disabled keyboard submit is blocked for the same reasons as the button.

Fix direction: Make `handleSubmit` and the `Enter` hotkey consume one authoritative submit-state helper instead of duplicating a partial guard list. Add focused tests for keyboard submit while streaming, while setup-blocked, and while other disabled reasons are active.

## Critical Duplicate Logic To Extract

1. Project open response path.

Repeated in `project.add`, `project.create`, and `project.browse`. Extract one `openProjectAndEmit` helper that owns repository open, runtime activation, `project.opened`, and setup refresh. This reduces drift across `US-WORKSPACE-008`, `US-WORKSPACE-009`, and `US-SEARCH-003`.

2. Run lifecycle wrapper.

`chat.send`, `planning.refine`, `planning.answer`, `run.execute`, `run.resume`, and `run.retry` repeat: assert not paused, set streaming, create abort controller, call lifecycle, handle abort, handle failure, clear streaming/controller. Extract a typed `runWithProjectExecutionController` that takes target `(projectId, threadId, runId?)` and owns cleanup.

3. Run status policy.

Working, blocking, refreshable, retryable, resumable, badge, and phase mappings are spread across server, repository, UI store, and UI status helpers. Move shared predicates into [harness/shared](../harness/shared) so UI affordances and backend rejection logic stay aligned.

4. Notification id generation.

Planning, assistant, browser, and background notification ids are hand-built in server helpers. Extract a shared id builder with readable prefixes and hash suffixes.

5. Local storage parsing and persistence.

Composer, provider, trace, execution defaults, background notifications, tutorial progress, and browser UI state all live in one large UI store file. Extract a small typed browser preferences adapter so malformed values, bounds, and defaults stay testable outside the global store.

6. Same-worktree path normalization.

Planner path normalization, scheduler overlap, scope checks, and drift checks each do partial normalization. Extract a single path-contract helper that handles separators, case, sentinels like `(planner-unspecified)`, and project-root relative paths.

## Coverage Priorities

Use [coverage-matrix.md](coverage-matrix.md) as the baseline. Highest-value additions:

1. `US-WORKTREE-004` and `US-WORKTREE-005`: Windows case-insensitive owned-path overlap and already-dirty drift detection.
2. `US-THREADS-004`: fork filters or preserves only explicitly allowed transcript message kinds.
3. `US-NOTIFICATIONS-002`: long ids from planning questions and browser approvals do not collide.
4. `US-JOBS-001`, `US-JOBS-003`, and `US-JOBS-004`: background job commands reject stale, cross-project, and invalid-state transitions.
5. `US-RUNTIMES-003` and `US-RUNTIMES-005`: websocket integration for CLI attach, reconnect, wrong-thread command rejection, resize fidelity, stop behavior, and capture-to-follow-up flow, plus direct `CliSessionManager` lifecycle coverage.
6. `US-DEV-002` and `US-DEV-007`: explicit tests for bootstrap and doctor CLI contract, including exit codes and flag behavior.
7. `US-PLANNING-010`: prerequisite behavior either executes real setup or is tested as non-executing metadata.
8. `US-UI-016` and `US-UI-017`: assert `Enter` cannot bypass disabled composer states during active streaming or setup-gated top-level sends.

## Bottom Line

Happy-path flow is broad and mostly wired. The highest remaining correctness risk is now in normalization-sensitive and identity-sensitive edges: notification ids, worktree path ownership, transcript fork scoping, and background or CLI lifecycle commands that still lean on thin state-transition coverage.
