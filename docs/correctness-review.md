# Correctness Review

Static review date: 2026-04-24.
Last merged targeted CLI scan: 2026-04-24.
Last merged targeted UI thread-state scan: 2026-04-24.
Last merged targeted UI/CLI bridge scan: 2026-04-24.
Last merged targeted harness anti-pattern scan: 2026-04-24.
Last merged targeted assistant skill-scope scan: 2026-04-25.
Last merged targeted harness slop-category scan: 2026-04-25.
Last merged targeted websocket and streaming performance scan: 2026-04-25.
Last merged targeted assistant surface scan: 2026-04-25.
Last merged targeted overlay, hotkey, and attachment-affordance scan: 2026-04-25.
Last merged targeted UI rendering, OS/CLI, websocket continuity, execution, and test-strictness scan: 2026-04-25.
Last merged targeted UI-magic affordance scan: 2026-04-25.

Source of truth: [user-stories.md](user-stories.md), [coverage-matrix.md](coverage-matrix.md), [architecture overview](../context/architecture/overview.md), and harness implementation under [harness](../harness).

This review focuses on correctness gaps outside the expected happy path. It does not replace `bun test`; it maps shipped stories to likely edge failures and extraction opportunities.

## Story To Code Map

| Story area | Main implementation surfaces | Highest edge risk |
| --- | --- | --- |
| WORKSPACE, SEARCH | [server](../harness/cli/src/server.ts), [workspace repository](../harness/cli/src/workspace-repository.ts), [project search](../harness/cli/src/project-search-service.ts), [project switcher](../harness/ui/src/components/project-switcher-dialog.tsx) | Project open flows are repeated across add, create, and browse; validation behavior can drift. |
| THREADS, PERSISTENCE | [workspace repository](../harness/cli/src/workspace-repository.ts), [runtime store](../harness/cli/src/workspace-runtime-store.ts), [UI store](../harness/ui/src/harness-store.ts), [chat panel](../harness/ui/src/components/chat-panel.tsx), [sidebar](../harness/ui/src/components/project-sidebar.tsx) | Thread-local runtime overlays now preserve background execution; remaining risk is drift between persisted run summaries and UI affordances. |
| PLANNING, RUNS | [server lifecycle](../harness/cli/src/server.ts), [planner](../harness/cli/src/pi-planner.ts), [orchestrator](../harness/cli/src/pi-orchestrator.ts), [trace panel](../harness/ui/src/components/trace-panel.tsx), [chat panel](../harness/ui/src/components/chat-panel.tsx) | Repeated run lifecycle guards and controller state make stale or cross-thread commands risky. |
| WORKTREE | [BranchFS manager](../harness/cli/src/branchfs-manager.ts), [subagent integration](../harness/cli/src/branchfs-subagent-integration.ts), [orchestrator](../harness/cli/src/pi-orchestrator.ts), [subagent scheduler](../harness/cli/src/pi-subagents.ts) | Same-worktree ownership now covers Windows case and already-dirty drift; remaining risk is broader BranchFS promotion and integration behavior. |
| PROVIDERS, RUNTIMES | [runtime registry](../harness/cli/src/agent-runtimes/runtime-registry.ts), [Codex adapter](../harness/cli/src/agent-runtimes/codex-sdk-adapter.ts), [Pi adapter](../harness/cli/src/pi-agent-adapter.ts), [protocol](../harness/shared/protocol.ts), [CLI session manager](../harness/cli/src/agent-runtimes/cli-session-manager.ts), [UI store](../harness/ui/src/harness-store.ts) | Live CLI session ownership is now thread-checked; remaining risk is liveness and slow-client transport behavior. |
| ATTACHMENTS | [attachment prompt builder](../harness/cli/src/chat-attachment-prompt.ts), [document extractors](../harness/cli/src/document-extractors), [attachment UI](../harness/ui/src/components/chat-panel-attachments.test.tsx) | Attachments now bind to trusted upload metadata; remaining risk is remote object expiry and richer upload cleanup UX. |
| ASSISTANTS, JOBS, NOTIFICATIONS | [assistant manager](../harness/cli/src/assistant-manager.ts), [background scheduler](../harness/cli/src/background-job-scheduler.ts), [background executor](../harness/cli/src/background-job-executor.ts), [assistant panel](../harness/ui/src/components/assistants-panel.tsx), [notification inbox](../harness/ui/src/components/notification-inbox.tsx) | Assistant pause, circuit-breaker, bootstrap, job routing, and linked assets cross several paths and can drift from the dedicated assistant surface contract. |
| UI, MARKDOWN | [UI store](../harness/ui/src/harness-store.ts), [run status helpers](../harness/ui/src/lib/run-status.ts), [markdown content](../harness/ui/src/components/markdown-content.tsx), [primitives](../harness/ui/src/components/primitives), [app shell](../harness/ui/src/app.tsx) | Overlay dismissal, focus isolation, hotkey ownership, and live markdown workload can drift across dense surfaces. |
| DEV, ACTIVATION | [launch harness](../harness/cli/src/launch-harness.ts), [CLI entry](../harness/cli/src/cli-entry.ts), [scripts](../scripts), [setup health](../harness/cli/src/setup-health.ts) | Top-level CLI parsing is covered; remaining activation risk is end-to-end first-run recovery. |
| MAGIC UI AFFORDANCES | [project switcher](../harness/ui/src/components/project-switcher-dialog.tsx), [composer](../harness/ui/src/components/chat-panel.tsx), [setup checklist](../harness/ui/src/components/setup-checklist-card.tsx), [trace panel](../harness/ui/src/components/trace-panel.tsx), [notification inbox](../harness/ui/src/components/notification-inbox.tsx) | High-polish interactions need typed state, OS capability checks, reduced-motion paths, and stable test hooks before they can feel magical without lying. |

## Findings

### CR-026: Assistant pause and circuit-breaker state is not a single launch gate

Stories: `US-ASSISTANTS-001`, `US-ASSISTANTS-004`, `US-RUNS-013`, `US-JOBS-003`.

Code map: [assistant commands](../harness/cli/src/server.ts), [assistant manager](../harness/cli/src/assistant-manager.ts), [background scheduler](../harness/cli/src/background-job-scheduler.ts), [background launch](../harness/cli/src/server.ts).

Impact: Assistant runtime starts are guarded in some paths but not all. Scheduled assistant jobs check `runState`, and reprioritize checks `runState`, but direct assistant chat does not reject paused or tripped assistants. Background launch also checks `runState` and deletion, not the circuit-breaker field directly. If persisted state ever has `circuitBreakerState = tripped` without `runState = paused`, new work can still launch.

Edge case: A user pauses an assistant, or a circuit breaker trips, then a stale client sends `assistant.chat.send` or a stored queued run is released. The request can still start because no shared assistant launch predicate is used across chat, bootstrap, reprioritize, scheduled jobs, and manual retries.

Fix direction: Create one assistant execution gate that validates existence, project ownership for project assistants, `runState`, `circuitBreakerState`, global execution pause, and deleted state. Use it before every assistant-owned runtime call and every background run launch.

### CR-027: Assistant-owned background AI output still writes into project chat

Stories: `US-ASSISTANTS-002`, `US-ASSISTANTS-004`, `US-JOBS-002`, `US-JOBS-003`.

Code map: [background executor](../harness/cli/src/background-job-executor.ts), [background launch](../harness/cli/src/server.ts), [assistant manager](../harness/cli/src/assistant-manager.ts), [assistant jobs tab](../harness/ui/src/components/assistants-panel.tsx).

Impact: Assistant-linked background AI jobs are inspectable from the assistant Jobs tab, but the executor also appends scheduled job system, user, and assistant messages into the automation project thread. That makes assistant job output part of project chat history, which contradicts the dedicated assistant/jobs surface and can pollute normal coding threads.

Edge case: A proactive assistant job runs overnight. On next project open, the user sees automation prompt and result rows in project chat instead of only in the assistant's Jobs and Log tabs. If the project thread is later used for normal work, assistant job output becomes prompt context.

Fix direction: Keep assistant-owned job transcript and result summaries in assistant/job persistence. Only project chat should receive a user-approved promotion or a short linked status row, and that promotion should be explicit.

### CR-028: Bootstrap retry is not single-flight

Stories: `US-ASSISTANTS-001`, `US-ASSISTANTS-003`, `US-PERSISTENCE-007`.

Code map: [assistant create and retry commands](../harness/cli/src/server.ts), [assistant manager bootstrap](../harness/cli/src/assistant-manager.ts), [assistant persistence](../harness/cli/src/workspace-repository.ts).

Impact: `assistant.create` and `assistant.bootstrap.retry` launch bootstrap work fire-and-forget. The manager persists `running`, but it does not keep a per-assistant bootstrap controller or promise registry. Repeated retry clicks, reconnect release of pending bootstrap, or a stale running state can start duplicate bootstrap prompts.

Edge case: Retry is clicked while the first bootstrap is slow. Two bootstrap prompts save learnings and todos, then both set completed or failed. The UI cannot tell which result is authoritative.

Fix direction: Add single-flight bootstrap state with cancellation or join semantics. Retry should either cancel and mark the previous attempt stale, or reject until the current attempt finishes. Persist attempt id and latest bootstrap phase so refresh recovery can reconcile old work.

### CR-029: Project deletion cascades assistant rows in SQLite but not live assistant UI state

Stories: `US-WORKSPACE-005`, `US-ASSISTANTS-001`, `US-ASSISTANTS-003`, `US-JOBS-004`.

Code map: [project remove command](../harness/cli/src/server.ts), [workspace repository schema](../harness/cli/src/workspace-repository.ts), [UI assistant hydration](../harness/ui/src/harness-store.ts), [assistant panel](../harness/ui/src/components/assistants-panel.tsx).

Impact: Project-scoped assistants have a project foreign key with cascade, so SQLite removes them when the project is deleted. The websocket command only emits `project.removed`; it does not emit refreshed assistant, job, or notification state. Connected clients can keep stale assistant rows in memory until a later full refresh.

Edge case: A user deletes the active project while the Assistants surface is open. The project assistant is gone in SQLite, but the UI can still show it, keep its selected id, or try actions that then fail as unknown assistant.

Fix direction: After project removal, emit refreshed assistants, background jobs, and notifications. Add a UI reducer test that deleting the active project removes project-scoped assistants from the visible assistant list without requiring reconnect.

### CR-030: Assistant inbox answer ownership is only partially enforced

Stories: `US-ASSISTANTS-002`, `US-NOTIFICATIONS-001`, `US-RUNS-013`.

Code map: [assistant question answer command](../harness/cli/src/server.ts), [assistant manager answers](../harness/cli/src/assistant-manager.ts), [assistant question persistence](../harness/cli/src/workspace-repository.ts), [notification inbox](../harness/ui/src/components/notification-inbox.tsx).

Impact: The update query answers by `(assistantId, questionId)`, but the repository then reloads the question by `questionId` alone. A stale or forged command with the wrong assistant id can return another assistant's question object after updating zero rows, while the manager logs and reprioritizes the requested assistant.

Edge case: Two clients hold old inbox state. One answers or archives a question, while another sends an answer with a stale assistant id and the same question id. The command can report success-like state while routing follow-up work to the wrong assistant.

Fix direction: Make `answerAssistantQuestion` read back by both assistant id and question id and throw if no row changed. Only archive the matching notification after the answer transition succeeds.

### CR-031: Assistant prompt and asset refs are weakly structured runtime input

Stories: `US-ASSISTANTS-001`, `US-ASSISTANTS-003`, `US-MODES-001`, `US-PROVIDERS-002`.

Code map: [assistant prompt builder](../harness/cli/src/assistant-manager.ts), [assistant editor](../harness/ui/src/components/assistant-editor-dialog.tsx), [assistant asset persistence](../harness/cli/src/workspace-repository.ts), [runtime model resolution](../harness/cli/src/assistant-manager.ts).

Impact: Assistant prompts concatenate name, personality prompt, job prompt, assets, todos, questions, learnings, and transcript with plain text headings. Asset refs are parsed as `kind | label | value` but not resolved or validated at save or launch. The execution model id is passed through directly when present, so stale model ids fail at runtime instead of falling back through the same capability-aware path used by normal project execution.

Edge case: A deleted skill path or deprecated model remains on an assistant. The prompt advertises the asset, the runtime tries the stale model, and failure is recorded as assistant failure instead of a recoverable config issue.

Fix direction: Build assistant prompts from structured sections with explicit boundaries and validated resolved assets. Validate linked asset existence and scope at save and launch. Route assistant model selection through the runtime's supported-model fallback before dispatch.

### CR-032: Assistant surface has no workload boundary for todos, learnings, jobs, and logs

Stories: `US-ASSISTANTS-001`, `US-ASSISTANTS-002`, `US-ASSISTANTS-003`, `US-UI-017`.

Code map: [assistant panel](../harness/ui/src/components/assistants-panel.tsx), [assistant schemas](../harness/shared/protocol.ts), [assistant persistence](../harness/cli/src/workspace-repository.ts).

Impact: The assistant UI renders selected todos, learnings, runs, and logs as full lists with no pagination or row cap. Logs can include raw JSON details and persisted error stacks. The database caps total assistant logs and learnings, but a single assistant can still accumulate enough rows or large detail payloads to freeze the panel when the tab opens.

Edge case: A failing assistant loops through reprioritize and job failures, appending many log rows with serialized error details. Opening Log renders every row and stringifies the expanded details payload in the browser.

Fix direction: Add per-tab empty states for todos, learnings, logs, and recent runs, plus list windowing or "show more" caps. Keep raw log details bounded and paged, and store summarized learning memory with compaction instead of appending indefinitely.

### CR-033: Overlay dismissal and focus behavior has no stack owner

Stories: `US-UI-002`, `US-UI-005`, `US-ACTIVATION-004`, `US-NOTIFICATIONS-003`.

Code map: [dialog primitive](../harness/ui/src/components/primitives/dialog.tsx), [sheet primitive](../harness/ui/src/components/primitives/sheet.tsx), [popover primitive](../harness/ui/src/components/primitives/popover.tsx), [tutorial overlay](../harness/ui/src/components/tutorial-overlay.tsx), [notification inbox](../harness/ui/src/components/notification-inbox.tsx), [chat composer popovers](../harness/ui/src/components/chat-panel.tsx).

Impact: Popovers are portaled and outside-click dismissal exists, but modal, sheet, popover, and tutorial layers each own independent global `Escape` listeners and fixed `z-index` values. Dialogs and sheets focus their surface on open but do not trap focus. When a popover is opened inside a modal or tutorial flow, `Escape` and `Tab` behavior depends on event propagation and DOM order rather than an explicit overlay stack.

Edge cases:

- Pressing `Escape` inside a composer or inbox popover can also reach the dialog, sheet, or tutorial listener underneath.
- `Tab` can leave an active modal or sheet and move into blurred background controls.
- Hardcoded layer values for sheet, dialog, popover, toaster, tooltip, and tutorial overlays can regress when a new dense panel adds another overlay.
- Current tests verify single-layer Escape and backdrop dismissal, but not nested overlay priority or focus containment.

Fix direction: Add a shared overlay stack primitive that owns topmost Escape handling, focus trap and release, outside-click policy, and layer tokens. Route `Dialog`, `Sheet`, `Popover`, tutorial spotlight, and inbox popovers through it, then add tests for nested popover-in-dialog dismissal, keyboard focus cycling, and tooltip or toaster layering.

### CR-034: Global hotkeys and composer submit paths do not fully respect input ownership

Stories: `US-SEARCH-001`, `US-THREADS-007`, `US-PLANNING-006`, `US-UI-016`, `US-UI-017`.

Code map: [app shortcuts](../harness/ui/src/app.tsx), [chat composer shortcuts](../harness/ui/src/components/chat-panel.tsx), [assistant panel textareas](../harness/ui/src/components/assistants-panel.tsx), [notification inbox answers](../harness/ui/src/components/notification-inbox.tsx), [chat panel tests](../harness/ui/src/components/chat-panel.test.tsx).

Impact: The project switcher shortcuts register with input ignoring disabled and only guard the project-switcher input itself. That means `Mod+K` or `Mod+Space` can open navigation while the user is typing in chat, assistant, notification, preferences, or scheduler inputs. The chat composer also has both a TanStack `Enter` hotkey and a textarea `onKeyDown` submit path, while the actual submit handler still does not consume the full disabled-state predicate.

Edge cases:

- A user typing in a textarea hits `Mod+K` and loses flow to the project switcher.
- The focused composer can submit through two keyboard paths that are harder to keep aligned than one form-level path.
- `Enter` submit can still bypass disabled button state for streaming, setup-gated, or attachment-gated sends unless every path shares the same eligibility helper.
- Tests cover shortcut registration and happy-path keyboard submit, but not shortcut suppression across all text inputs or double-path submit prevention.

Fix direction: Centralize hotkey ownership with an `isEditableTarget` guard or TanStack input-ignore configuration, then opt in only where a shortcut is explicitly meant to work inside text input. Make composer `Enter`, form submit, and send button use one authoritative submit-state helper and add tests for input-owned `Mod+K`, `Shift+Enter`, disabled `Enter`, and no duplicate dispatch.

### CR-035: Attachment drag-and-drop has no visible affordance or durable unsent state

Stories: `US-ATTACHMENTS-001`, `US-ATTACHMENTS-002`, `US-PERSISTENCE-008`, roadmap upload hygiene stories.

Code map: [chat attachments UI](../harness/ui/src/components/chat-panel.tsx), [attachment guardrail tests](../harness/ui/src/components/chat-panel-attachments.test.tsx), [attachment prompt builder](../harness/cli/src/chat-attachment-prompt.ts), [draft persistence](../harness/ui/src/harness-store.ts).

Impact: The composer supports file selection and per-thread text draft persistence, but there is no drag-over or drop-zone state for files and unsent attachment chips are component-local. A user can drag files over the chat surface without visual confirmation, or switch threads and lose unsent uploaded attachment context even though the text draft survives.

Edge cases:

- Dragging an image or PDF over the app gives no target feedback before release.
- Switching project, thread, or active surface clears component-local attachment chips while the text draft remains restored.
- Removed or abandoned unsent uploads have no visible cleanup lifecycle yet.
- Tests cover attachment gating and upload guardrails, but not drag-over UI, thread-switch preservation, or abandoned-upload cleanup.

Fix direction: Add an explicit composer drop-zone overlay with clear enabled, blocked, and uploading states. Decide whether unsent attachment refs belong in per-thread browser draft state or need server-side orphan cleanup; then cover drag/drop, thread switch, reload, and removal flows.

### CR-036: Project switcher polish lacks typed project metadata and activity signals

Stories: `US-WORKSPACE-002`, `US-WORKSPACE-006`, `US-SEARCH-001`, `US-SEARCH-003`, `US-JOBS-002`, `US-NOTIFICATIONS-001`, `US-PROVIDERS-ROADMAP-003`.

Code map: [project switcher](../harness/ui/src/components/project-switcher-dialog.tsx), [project search service](../harness/cli/src/project-search-service.ts), [sidebar thread badges](../harness/ui/src/components/project-sidebar.tsx), [notification inbox](../harness/ui/src/components/notification-inbox.tsx), [workspace repository](../harness/cli/src/workspace-repository.ts).

Impact: The switcher currently distinguishes recent projects, filesystem matches, exact paths, and git folders, but it does not carry framework metadata, active background job counts, pending approval counts, or thread previews. Sidebar cards know thread badge state, and the inbox knows pending prompts or approvals, but the spotlight flow cannot show that activity before switching. A folder dragged from the OS into the browser also cannot be treated as a trustworthy local project root unless the browser or launcher provides a real directory handle or native path bridge; normal web drag/drop exposes files, not a safe absolute folder path.

Edge case: A user opens `Cmd/Ctrl+K` while another project has a paused approval or failing background job. The switcher shows only name, path, and `Git repo`, so the user must switch projects or open the inbox to discover the action item. If folder drag/drop is implemented as plain browser `DataTransfer` file handling, it can silently degrade to file uploads, lose the absolute root path, or create a project from an untrusted synthetic name.

Fix direction: Add a server-derived project metadata summary for switcher rows: root type, detected frameworks or runtimes, active run state, pending approval or question counts, and recent user-thread previews. Treat drag-to-open folder as capability-gated: prefer the File System Access API when available, otherwise fall back to the existing typed `project.browse` or exact path flow instead of pretending browser drop can reveal trusted local paths. Add keyboard tests for right-arrow peek behavior, stale previews after thread deletion, and activity badges after background job or notification updates.

### CR-037: Composer "magic" is local polish without a complete draft contract

Stories: `US-MODES-001`, `US-MODES-004`, `US-RUNTIMES-006`, `US-PROVIDERS-001`, `US-PROVIDERS-ROADMAP-012`, `US-ATTACHMENTS-001`, `US-ATTACHMENTS-002`, `US-PERSISTENCE-008`, `US-MARKDOWN-ROADMAP-001`.

Code map: [composer controls](../harness/ui/src/components/chat-panel.tsx), [model capabilities](../harness/shared/capabilities.ts), [capability schema](../harness/shared/protocol.ts), [browser draft store](../harness/ui/src/harness-store.ts), [markdown renderer](../harness/ui/src/components/markdown-content.tsx).

Impact: The composer has useful typed controls, but several polish affordances are not backed by enough state. Placeholders are based mostly on run state and selected agent, not the selected workflow mode. Model metadata has tags and summaries, but no normalized speed, quality, or cost scores for compact tradeoff visuals. Draft attachments are component-local while text drafts persist per thread. The textarea resizes to eight lines, not a viewport-bound 50% cap, and live draft code-fence formatting would require a real editor model instead of styling a plain textarea.

Edge case: A user selects Debug mode and gets a generic "Ask agent to work inside path" placeholder instead of stack-trace-oriented guidance. They upload attachments, switch threads, and return to a restored text draft with missing unsent chips. They compare GPT Mini and Gemini Flash but see only prose summaries, so "fast" and "expensive" tags cannot support a compact sparkline without hardcoded UI guesses.

Fix direction: Define one draft state model covering text, attachments, mode, selected runtime, selected model, and upload lifecycle per `(projectId, threadId)`. Add mode-specific placeholder copy through the mode contract, numeric or bucketed model tradeoff metadata in the capability schema, and a viewport-bound composer height policy with internal scroll. Keep draft syntax highlighting as a deliberate editor upgrade with accessibility and performance tests, not textarea CSS.

### CR-038: Run and trace surfaces do not yet provide proof-level visual review

Stories: `US-THREADS-008`, `US-RUNS-002`, `US-RUNS-003`, `US-RUNS-007`, `US-RUNS-011`, `US-WORKTREE-001`, `US-WORKTREE-002`, `US-WORKTREE-003`, `US-RUNS-ROADMAP-001`, `US-RUNS-ROADMAP-002`, `US-RUNS-ROADMAP-003`.

Code map: [trace panel](../harness/ui/src/components/trace-panel.tsx), [chat run pane](../harness/ui/src/components/chat-panel.tsx), [run milestone protocol](../harness/shared/protocol.ts), [BranchFS manager](../harness/cli/src/branchfs-manager.ts), [server experiment commands](../harness/cli/src/server.ts).

Impact: Subagents and tool activity render as lists, while the plan has prerequisite and contract data that could drive swimlanes or dependency state. BranchFS experiment review opens a dialog with one whole diff block, not a per-file, side-by-side diff with changed-path navigation. Copy actions cover messages and plan summaries, but not a structured share bundle that combines environment, recent logs, run state, and failing commands. This keeps the system inspectable, but not yet proof-rich enough for fast trust decisions.

Edge case: A parallel run stalls because one prerequisite or subagent is waiting. The user sees subtask cards and latest status text, but cannot visually distinguish queued, blocked, running, and completed lanes over time. After an isolated experiment finishes, the user can inspect a monolithic diff, but large changes are hard to review without file navigation or side-by-side context before promote.

Fix direction: Model run visualization as typed evidence, not decorative animation. Add prerequisite and subagent timing events, per-file diff summaries or hunks, and a share-context formatter fed by bounded run artifacts. Keep full snapshots for recovery, but add narrow UI deltas for live swimlanes, roll-up milestone pills, and structured proof bundles that survive refresh.

### CR-039: Motion-heavy polish needs a shared accessibility and state contract

Stories: `US-UI-002`, `US-UI-005`, `US-UI-016`, `US-UI-017`, `US-NOTIFICATIONS-001`, `US-NOTIFICATIONS-003`, `US-RUNS-005`, `US-MARKDOWN-ROADMAP-001`.

Code map: [app shell](../harness/ui/src/app.tsx), [notification inbox](../harness/ui/src/components/notification-inbox.tsx), [chat transcript](../harness/ui/src/components/chat-panel.tsx), [project sidebar](../harness/ui/src/components/project-sidebar.tsx), [UI primitives](../harness/ui/src/components/primitives), [store event reducer](../harness/ui/src/harness-store.ts).

Impact: Several requested "magic" effects would currently be one-off UI state: notification bounce, ambient transcript tint, dirty-git caution tape, thread-swap skeletons, hold-to-reveal shortcuts, confetti, smooth scroll magnet, deterministic avatars, and quote-reply selection. These are attractive fit-and-finish ideas, but adding them independently would duplicate overlay, hotkey, animation, color-status, and focus behavior that is already a known drift point.

Edge case: A bounce or confetti animation ignores `prefers-reduced-motion`; ambient tint becomes the only visible state cue; a shortcut overlay appears while a textarea owns `Ctrl`; a quote tooltip fights browser text selection or markdown code-copy buttons; thread-swap skeletons render stale shapes after a quick project switch.

Fix direction: Create shared primitives for reduced-motion-aware attention animation, status tinting with non-color labels, skeleton surfaces, selection popovers, and shortcut overlays. Each should have `data-test-*` hooks, keyboard and focus rules, and tests for nested overlays, editable targets, reduced motion, fast thread switching, and no layout shift.

## Critical Duplicate Logic To Extract

1. Project open response path.

Repeated in `project.add`, `project.create`, and `project.browse`. Extract one `openProjectAndEmit` helper that owns repository open, runtime activation, `project.opened`, and setup refresh. This reduces drift across `US-WORKSPACE-008`, `US-WORKSPACE-009`, and `US-SEARCH-003`.

2. Run lifecycle wrapper.

`chat.send`, `planning.refine`, `planning.answer`, `run.execute`, `run.resume`, and `run.retry` repeat: assert not paused, set streaming, create abort controller, call lifecycle, handle abort, handle failure, clear streaming/controller. Extract a typed `runWithProjectExecutionController` that takes target `(projectId, threadId, runId?)` and owns cleanup.

3. Run status policy.

Working, blocking, refreshable, retryable, resumable, badge, and phase mappings are spread across server, repository, UI store, and UI status helpers. Move shared predicates into [harness/shared](../harness/shared) so UI affordances and backend rejection logic stay aligned.

4. Local storage parsing and persistence.

Composer, provider, trace, execution defaults, background notifications, tutorial progress, and browser UI state all live in one large UI store file. Extract a small typed browser preferences adapter so malformed values, bounds, and defaults stay testable outside the global store.

## Coverage Priorities

Use [coverage-matrix.md](coverage-matrix.md) as the baseline. Highest-value additions:

1. `US-JOBS-001`, `US-JOBS-003`, and `US-JOBS-004`: background job commands reject stale, cross-project, and invalid-state transitions.
2. `US-RUNTIMES-003` and `US-RUNTIMES-005`: websocket integration for CLI attach, reconnect, wrong-thread command rejection, resize fidelity, stop behavior, and capture-to-follow-up flow, plus direct `CliSessionManager` lifecycle coverage.
3. `US-DEV-002` and `US-DEV-007`: explicit tests for bootstrap and doctor CLI contract, including exit codes and flag behavior.
4. `US-UI-016` and `US-UI-017`: assert `Enter` cannot bypass disabled composer states during active streaming or setup-gated top-level sends.
5. `US-RUNTIMES-002`, `US-RUNTIMES-003`, and `US-ASSISTANTS-001`: ensure development instrumentation cannot leak prompt or output snippets through hardcoded network calls.
6. `US-SEARCH-001`: prove project search cannot block unrelated websocket traffic under slow filesystem conditions.
7. `US-RUNTIMES-005` and `US-JOBS-001`: cover rejected PTY writes and failed background scheduler launches as durable visible events.
8. `US-UI-005`, `US-DEV-017`, and `US-DEV-022`: add a focused guard against native `title` tooltips, non-exception margin utilities, and UI tests that assert arbitrary CSS classes instead of stable `data-test-*` hooks.
9. `US-ASSISTANTS-001` and `US-MODES-ROADMAP-003`: cover assistant asset refs as scoped capabilities rather than ambient prompt text.
10. `US-ASSISTANTS-001` and `US-ASSISTANTS-004`: prove every assistant launch path rejects paused, deleted, or circuit-tripped assistants, including direct chat, retry bootstrap, reprioritize, manual job release, and scheduler catch-up.
11. `US-ASSISTANTS-002` and `US-JOBS-003`: assert assistant-owned background AI output stays out of normal project chat unless explicitly promoted.
12. `US-ASSISTANTS-003` and `US-PERSISTENCE-007`: cover bootstrap retry as single-flight with stale attempt cleanup after reconnect or duplicate retry.
13. `US-WORKSPACE-005` and `US-ASSISTANTS-003`: verify project removal emits refreshed assistant, job, and notification state to connected clients.
14. `US-NOTIFICATIONS-001` and `US-RUNS-013`: reject assistant question answers when `(assistantId, questionId)` ownership does not match, and archive only after a successful answer transition.
15. `US-ASSISTANTS-002` and `US-UI-017`: add large assistant todo, learning, job, and log fixtures that prove empty states, caps, and raw log detail expansion stay bounded.
16. `US-ATTACHMENTS-001` and `US-ATTACHMENTS-003`: reject untrusted attachment URLs and large `data:` payloads at the websocket boundary.
17. `US-RUNTIMES-002`, `US-RUNTIMES-003`, `US-JOBS-001`, and `US-DEV-023`: enforce bounded stdout and stderr buffers for spawned processes.
18. `US-RUNTIMES-003`, `US-RUNTIMES-005`, and `US-RUNS-010`: cover missed websocket heartbeat, PTY stale detach, unused attach-token invalidation after control disconnect, and reconnect recovery.
19. `US-THREADS-008`, `US-RUNTIMES-002`, and `US-MARKDOWN-001`: assert assistant and PTY streams are coalesced, persisted at bounded cadence, and fail or detach slow websocket clients before queues grow without limit.
20. `US-RUNS-009` and `US-PERSISTENCE-007`: add long-thread payload-size regression tests for append, run-status, subtask, and trace events.
21. `US-UI-010`, `US-UI-015`, and `US-MARKDOWN-ROADMAP-001`: add a large streamed-code and large-trace UI fixture that proves live markdown and dense panes stay bounded.
22. `US-UI-002`, `US-UI-005`, and `US-NOTIFICATIONS-003`: test nested overlay Escape priority, focus trapping, outside-click dismissal, and layer order across dialog, sheet, popover, tooltip, toaster, and tutorial surfaces.
23. `US-SEARCH-001`, `US-UI-016`, and `US-UI-017`: prove global shortcuts do not fire from editable controls unless explicitly opted in, and that composer keyboard submit cannot bypass disabled state or dispatch twice.
24. `US-ATTACHMENTS-001`, `US-ATTACHMENTS-002`, and `US-PERSISTENCE-008`: cover drag/drop affordance, unsent attachment preservation or cleanup, and attachment chip behavior across thread switch and reload.
25. `US-SEARCH-001`, `US-JOBS-002`, and `US-NOTIFICATIONS-001`: cover switcher framework metadata, pending approval or job activity badges, and right-arrow thread preview with stale project/thread deletion.
26. `US-MODES-001`, `US-RUNTIMES-006`, and `US-PROVIDERS-ROADMAP-012`: cover mode-specific placeholders and normalized model tradeoff metadata without hardcoded provider assumptions.
27. `US-RUNS-007`, `US-WORKTREE-001`, and `US-RUNS-ROADMAP-001`: cover per-file BranchFS diff inspection, changed-path navigation, and promote disabled states while diff inspection is stale or failed.
28. `US-UI-002`, `US-UI-016`, `US-RUNS-005`, and `US-MARKDOWN-ROADMAP-001`: cover reduced-motion behavior, status-tint non-color cues, skeleton teardown on fast thread switches, smooth-scroll affordance state, and quote-reply focus ownership.

## Bottom Line

Happy-path flow is broad and mostly wired. The highest remaining correctness risk is now in lifecycle commands, synchronous search, debug instrumentation, attachment trust boundaries, overlay and hotkey ownership, unbounded process output, passive websocket liveness, streaming backpressure, payload growth, live markdown workload, assistant capability scope, and high-polish UI ideas that need typed capability contracts before they can become trustworthy "magic."
