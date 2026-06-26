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
Last merged targeted reliability diagnostics and background ownership closeout: 2026-05-01.
Last merged working-tree branch scan: 2026-05-12.
Last merged deep harness scan: 2026-06-01.
Last merged targeted onboarding flow scan: 2026-06-15.
Last merged targeted virtual-list first-paint scan: 2026-06-24.
Last merged targeted chat file-link affordance scan: 2026-06-24.
Last merged targeted assistant/background approval flow scan: 2026-06-25.

Source of truth: [user-stories.md](user-stories.md), [coverage-matrix.md](coverage-matrix.md), [root README](../README.md), and harness implementation under [harness](../harness).

This review focuses on correctness gaps outside the expected happy path. It does not replace `bun test`; it maps shipped stories to likely edge failures and extraction opportunities.

Recent closeout note: assistant summary/detail loading now uses paged SQL-backed APIs, assistant bootstrap and reprioritize JSON is schema-validated with one repair attempt, background job deletion stops active runs before deleting durable rows, and the scheduler honors the assistant congestion-control preference. The remaining gaps below stay focused on broader assistant jobs paging, overlay behavior, lifecycle setup refresh, and non-assistant dense rendering.

Virtualized transcript, trace, and sidebar lists now depend on responsive row measurement: dynamic-height rows must be allowed to grow and shrink after container reflow, while reverse lists must continue opening at the latest content and preserve browsing position when older rows load.

Virtual-list first paint now has primitive-level browser coverage for real geometry, visibility, and scroll anchoring before and after tab switches. Keep extending it when app-specific tab surfaces add new virtualized panes.

Project chat path linking now uses a shared modifier-click contract for rendered chat, tool, trace, assistant, and execution-log text. Future non-chat file path surfaces should reuse the same project-owned link adapter.

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
| DEV, ACTIVATION | [launch harness](../harness/cli/src/launch-harness.ts), [CLI entry](../harness/cli/src/cli-entry.ts), [scripts](../scripts), [setup health](../harness/cli/src/setup-health.ts), [setup checklist](../harness/ui/src/components/setup-checklist-card.tsx), [tutorials](../harness/ui/src/components/tutorial-definitions.ts) | Top-level CLI parsing is covered; remaining activation risk is end-to-end first-run recovery plus keeping setup readiness paired with project lifecycle and local tutorial state. |
| MAGIC UI AFFORDANCES | [project switcher](../harness/ui/src/components/project-switcher-dialog.tsx), [composer](../harness/ui/src/components/chat-panel.tsx), [setup checklist](../harness/ui/src/components/setup-checklist-card.tsx), [trace panel](../harness/ui/src/components/trace-panel.tsx), [notification inbox](../harness/ui/src/components/notification-inbox.tsx) | High-polish interactions need typed state, OS capability checks, reduced-motion paths, and stable test hooks before they can feel magical without lying. |

## Findings

### CR-026: Closed - assistant launch gate is shared

Stories: `US-ASSISTANTS-001`, `US-ASSISTANTS-004`, `US-RUNS-013`, `US-JOBS-003`.

Status: Closed. Assistant chat, bootstrap, reprioritize, scheduler launch, and manual background launch now use the shared assistant launch gate. Paused, deleted, and circuit-tripped assistants are rejected before runtime work starts.

Remaining watch item: keep new assistant-owned runtime entry points behind the same gate instead of adding local pause checks.

### CR-027: Closed - assistant-owned background output stays out of normal project chat

Stories: `US-ASSISTANTS-002`, `US-ASSISTANTS-004`, `US-JOBS-002`, `US-JOBS-003`.

Status: Closed. Assistant-owned background work is routed through assistant/job state and the assistant Jobs surface instead of appending routine automation transcripts into normal project chat.

Remaining watch item: any future "promote to chat" behavior should be explicit user action with a compact linked summary.

### CR-028: Closed - bootstrap retry is single-flight

Stories: `US-ASSISTANTS-001`, `US-ASSISTANTS-003`, `US-PERSISTENCE-007`.

Status: Closed. Bootstrap attempts now join in-flight work unless force retry starts a newer attempt. Attempt ids prevent stale completions from winning.

Remaining watch item: keep stale persisted `running` recovery aligned with the same attempt-id model.

### CR-029: Closed - project and job deletion stop active background runs first

Stories: `US-WORKSPACE-005`, `US-JOBS-001`, `US-JOBS-004`.

Status: Closed. Job deletion and project removal now cancel active background runs, stop linked agent runs, emit run/job/notification updates, and abort live controllers before durable rows are removed.

Remaining watch item: future destructive lifecycle commands should use the same stop-first helper.

### CR-030: Closed - assistant inbox answer ownership is enforced

Stories: `US-ASSISTANTS-002`, `US-NOTIFICATIONS-001`, `US-RUNS-013`.

Status: Closed. Assistant question answer updates now require matching assistant ownership and fail when no matching row transitions.

Remaining watch item: stale already-answered question transitions are tracked under CR-053.

### CR-031: Assistant prompt and asset refs are weakly structured runtime input

Stories: `US-ASSISTANTS-001`, `US-ASSISTANTS-003`, `US-MODES-001`, `US-PROVIDERS-002`.

Code map: [assistant prompt builder](../harness/cli/src/assistant-manager.ts), [assistant editor](../harness/ui/src/components/assistant-editor-dialog.tsx), [assistant asset persistence](../harness/cli/src/workspace-repository.ts), [runtime model resolution](../harness/cli/src/assistant-manager.ts).

Impact: Assistant prompts concatenate name, personality prompt, job prompt, assets, todos, questions, learnings, and transcript with plain text headings. Asset refs are parsed as `kind | label | value` but not resolved or validated at save or launch. The execution model id is passed through directly when present, so stale model ids fail at runtime instead of falling back through the same capability-aware path used by normal project execution.

Edge case: A deleted skill path or deprecated model remains on an assistant. The prompt advertises the asset, the runtime tries the stale model, and failure is recorded as assistant failure instead of a recoverable config issue.

Fix direction: Build assistant prompts from structured sections with explicit boundaries and validated resolved assets. Validate linked asset existence and scope at save and launch. Route assistant model selection through the runtime's supported-model fallback before dispatch.

### CR-032: Assistant jobs tab still inherits broad background-job state

Stories: `US-ASSISTANTS-001`, `US-ASSISTANTS-002`, `US-ASSISTANTS-003`, `US-UI-017`.

Code map: [assistant panel](../harness/ui/src/components/assistants-panel.tsx), [assistant schemas](../harness/shared/protocol.ts), [assistant persistence](../harness/cli/src/workspace-repository.ts).

Impact: Assistant summaries, selected assistant detail, chat messages, todos, learnings, questions, and logs now have paged backend APIs and SQL limits. The remaining assistant workload risk is the Jobs tab, which still derives assistant jobs and runs from the broader background-jobs snapshot rather than an assistant-scoped page.

Edge case: One assistant owns many historical background runs. Opening its Jobs tab still filters a shared background-jobs payload instead of requesting a small assistant-scoped run window.

Fix direction: Add assistant-scoped background job and run pages, then hydrate the selected Jobs tab on demand like assistant detail.

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

### CR-040: Portable launcher still assumes source-style dependency repair

Stories: `US-DEV-007`, `US-DEV-002`, `US-ACTIVATION-001`.

Code map: [CLI entry](../harness/cli/src/index-main.ts), [doctor cleanup](../harness/cli/src/doctor-cleanup.ts), [dependency health](../harness/cli/src/dependency-health.ts), [launcher packaging](../scripts/package-launcher.ts), [launcher assets](../scripts/launcher-assets.ts), [runtime health](../harness/cli/src/setup-health.ts).

Impact: Doctor cleanup now resolves against a harness root sentinel instead of caller cwd, which closes the earlier arbitrary `dist` deletion risk. The remaining activation gap is that the packaged launcher copies `dist/ui`, `package.json`, agent rules, and skills, but not source `node_modules` or lockfile artifacts. Doctor then runs dependency repair from the launcher directory when `node_modules` is missing, and runtime health still reports `bun install` guidance for bundled Codex and ripgrep. That makes a portable launcher look source-checkout dependent instead of self-contained.

Edge case: A release user runs `pi-harness --doctor` from the portable folder. The command reports missing dependencies or tries `bun i` in the release directory, but the release folder was not packaged with the same install inputs as the source repo. Codex/ripgrep health can degrade even though the launcher binary itself starts.

Fix direction: Treat portable runtime assets as a separate contract. Either package the native runtime artifacts that health probes need, or make launcher health skip source dependency repair and show launcher-specific reinstall/update guidance. Cover doctor, Codex, ripgrep, and browser-tool checks from an extracted release directory.

### CR-041: Preferences panel contains hidden interactive test shims

Stories: `US-PREFERENCES-001`, `US-PREFERENCES-002`, `US-UI-005`, `US-UI-017`.

Code map: [preferences panel](../harness/ui/src/components/preferences-modal.tsx), [preferences tests](../harness/ui/src/components/preferences-modal.test.tsx), [UI store](../harness/ui/src/harness-store.ts).

Impact: The new preferences panel renders an `sr-only` block with extra headings, buttons, labels, and inputs that are not the actual visible controls. Screen reader and keyboard users can encounter duplicate or fake controls such as hidden reset buttons and hidden numeric inputs, and tests can pass by targeting the shim instead of the real settings UI.

Edge case: A screen reader user navigates the preferences panel and hears hidden "Planning and approval" or "Dirty git change limit" controls that are visually absent from the current section. A future visual refactor can break the real control while tests still pass because the hidden fallback remains.

Fix direction: Remove the hidden interactive shim. Give the real controls stable accessible names and `data-test-*` hooks, then update tests to target visible semantic controls or explicit test hooks.

### CR-042: Run lifecycle transitions can be forged, partial, or no-op

Stories: `US-RUNS-004`, `US-RUNS-009`, `US-RUNS-016`, `US-PLANNING-002`, `US-THREADS-010`, `US-PERSISTENCE-007`.

Code map: [run commands](../harness/cli/src/server.ts), [managed execution](../harness/cli/src/managed-agent-execution.ts), [planning answer persistence](../harness/cli/src/workspace-repository.ts), [shared protocol](../harness/shared/protocol.ts).

Impact: Several lifecycle commands validate shape but not enough state. Public `run.complete` can finalize a `planning`, `awaiting-user-input`, or `ready` run with arbitrary assistant text. Final assistant message append and run status update are not one transaction. Active `run.refresh` reports a deferred refresh, but the deferred path records completion without actually restarting or reconciling. Batch planning answers validate only supplied ids, so a stale client can answer one question and resume while sibling required questions remain pending. Thread archive persists before live CLI or run activity is stopped.

Edge case: A ready plan waiting for approval receives stale `run.complete`; the run becomes completed and a final assistant answer is persisted without execution. Or a refresh during streaming shows "refresh after current stream" while no refresh happens after completion.

Fix direction: Make run lifecycle transitions state-machine driven and transaction-backed. Restrict completion to execution-owned active states, commit final message plus status atomically, store and execute deferred refresh intent, require all required pending questions before resume, and stop live activity before archiving or expose a failed-archive state.

### CR-043: Background `partial-complete` is terminal in one layer but not in command policy

Stories: `US-JOBS-001`, `US-JOBS-002`, `US-JOBS-004`, `US-RUNS-003`.

Code map: [background command guards](../harness/cli/src/background-job-command-guards.ts), [background executor](../harness/cli/src/background-job-executor.ts), [background job panel](../harness/ui/src/components/background-jobs-panel.tsx), [shared protocol](../harness/shared/protocol.ts).

Impact: Repository and protocol treat `partial-complete` as terminal, but stop and retry guards do not share that policy. Stop can pass guard and then no-op in persistence, while retry rejects the exact partial run that should be recoverable.

Edge case: A background AI run partially succeeds after subagent failure. The UI shows a recoverable-looking terminal run, but Retry is unavailable or rejected and Stop appears possible even though the row is already terminal.

Fix direction: Move background run status predicates into one shared policy. Mark `partial-complete` terminal, decide whether it is retryable, and make UI affordances, command guards, and repository transitions use the same helper.

### CR-044: Draft, attachment, and inbox submit paths clear or close before backend acceptance

Stories: `US-PERSISTENCE-014`, `US-THREADS-007`, `US-PLANNING-002`, `US-ATTACHMENTS-002`, `US-RUNS-013`, `US-NOTIFICATIONS-001`.

Code map: [websocket queue](../harness/ui/src/harness-websocket.ts), [UI store command dispatch](../harness/ui/src/harness-store.ts), [chat composer](../harness/ui/src/components/chat-panel.tsx), [notification inbox](../harness/ui/src/components/notification-inbox.tsx).

Impact: Chat send clears text and attachment chips immediately after dispatch even when the websocket only queued the command while disconnected. `command.rejected` is a no-op in the store, so stale project, stale thread, preflight, or backend rejection does not restore the draft. Planner quick-choice buttons bypass the attachment-disabled send predicate, and notification inbox assistant answers can be submitted while global pause is active even though the backend rejects them.

Edge case: A user sends during reconnect and closes the tab before queued commands flush; the text draft and unsent attachment chips are gone. Or they attach a file, click a planner quick option, and the answer sends without the attachment context the UI still appears to hold.

Fix direction: Add a pending-send draft contract keyed by request id. Clear drafts only after accepted message or run-start acknowledgement, restore on reject or dropped queue, and make quick choices, inbox answers, Enter, and send buttons share one eligibility helper with pause and attachment reasons.

### CR-045: BranchFS and IDE path trust still miss nested-root and symlink cases

Stories: `US-WORKTREE-001`, `US-WORKTREE-002`, `US-WORKTREE-003`, `US-WORKTREE-007`, `US-WORKSPACE-003`, `US-UI-022`.

Code map: [BranchFS manager](../harness/cli/src/branchfs-manager.ts), [BranchFS integration](../harness/cli/src/branchfs-subagent-integration.ts), [IDE project service](../harness/cli/src/ide-project-service.ts), [server experiment commands](../harness/cli/src/server.ts).

Impact: BranchFS baseline dirty fingerprints are gathered from the repo root, but promotion can recompute hashes from the selected project root and join repo-relative paths under that nested root. Tracked symlinks are recreated in isolated mounts while hashing and diffing skip symlink targets, so writes through a symlink can pierce isolation or vanish from review. The IDE blocks lexical `../` paths, but file reads and writes follow symlinks inside the project. Isolated subagent integration also assumes root `package.json` exists before it can decide which verification steps to skip.

Edge case: A nested project has an unchanged dirty file outside its selected subfolder. Promotion says "Base dirty state changed" even though the user changed nothing. A symlink inside the project points outside the root; IDE preview or BranchFS execution can touch the external target.

Fix direction: Canonicalize project root, repo root, and real target paths through one filesystem trust helper. Include symlink metadata in BranchFS materialization and diff review, reject or sandbox writable symlinks, and let integration skip package-script verification when no package file exists.

### CR-046: Planner plan schemas validate shape but not semantic invariants

Stories: `US-PLANNING-003`, `US-PLANNING-010`, `US-WORKTREE-004`, `US-WORKTREE-005`.

Code map: [planner schema](../harness/shared/protocol.ts), [orchestrator plan parser](../harness/cli/src/pi-orchestrator.ts), [planner](../harness/cli/src/pi-planner.ts).

Impact: The planner prompt describes invariants such as difficulty thresholds for subagents, empty subtasks for non-subagent plans, prerequisite ordering, and non-overlapping same-worktree paths. The schema accepts contradictory plans, and the orchestrator can route from `difficultyScore` and contracts while ignoring `usesSubagents`.

Edge case: Model output says `usesSubagents: false` but includes conflicting subagent contracts, or says same-worktree while owned paths overlap. The plan persists as valid and later execution chooses surprising fan-out or isolation behavior.

Fix direction: Add semantic `superRefine` or normalization before persistence. Fail or repair contradictory `usesSubagents`, difficulty, contracts, prerequisites, and worktree strategy fields before any plan reaches the ready card.

### CR-047: Browser approval commands do not validate the run and thread locator they carry

Stories: `US-BROWSER-001`, `US-BROWSER-002`, `US-BROWSER-003`, `US-NOTIFICATIONS-001`.

Code map: [browser approval command](../harness/shared/protocol.ts), [browser approval handler](../harness/cli/src/server.ts), [browser session state](../harness/cli/src/browser-session-state.ts), [notification sync](../harness/cli/src/server.ts).

Impact: The protocol carries project, thread, session, and tool ids, but the handler searches only active or last runs and ignores thread ownership. Resolution looks up pending approval by session and tool, then records the owner as `main`. Background or older run approvals can be invisible, or a stale command can resolve the wrong pending approval.

Edge case: An inbox notification points to a browser approval from a background thread. The user answers it after switching threads; the server says the run is unavailable, or resolves another approval with matching session/tool ids.

Fix direction: Resolve approvals by a durable `(projectId, threadId, runId, sessionId, toolCallId, owner)` locator. Sync notifications from every pending approval run or explicitly archive stale notifications with a reason.

### CR-048: Debug artifacts bypass the normal redaction and budget path

Stories: `US-UI-020`, `US-DEV-020`, `US-RUNS-011`.

Code map: [tool artifact writes](../harness/cli/src/server.ts), [tool activity redaction](../harness/cli/src/tool-activity-state.ts), [trace panel](../harness/ui/src/components/trace-panel.tsx).

Impact: Normal tool activity persistence has redaction and bounded previews, but debug-mode artifact files write raw tool args and results with JSON serialization. Browser, shell, MCP, or provider payloads can persist secrets or prompt-like data under debug artifacts even when the UI trace is sanitized.

Edge case: A browser tool result includes cookies, auth headers, or a page payload with an API token. The trace view hides sensitive fields, but `.local/debug/tool-artifacts` keeps the raw value on disk.

Fix direction: Reuse the same sanitizer and aggregate budgets before debug artifact persistence. Store artifacts under a trusted harness or project debug root and add tests that raw secrets are redacted before disk write.

### CR-049: Provider model namespace and cache identity can drift after user choice changes

Stories: `US-PROVIDERS-001`, `US-PROVIDERS-002`, `US-PROVIDERS-006`, `US-RUNTIMES-006`, `US-RUNS-012`, `US-ATTACHMENTS-003`.

Code map: [model resolver](../harness/cli/src/server.ts), [Claude defaults](../harness/cli/src/pi-planner.ts), [Gemini cache persistence](../harness/cli/src/workspace-repository.ts), [Gemini cache helper](../harness/cli/src/gemini-cached-contents.ts).

Impact: Pi model availability accepts OpenAI ids by default and Google ids for Gemini, but Claude provider mode does not accept `anthropic/*` ids in the same path. A user-selected Claude model can be treated as unavailable and silently replaced by the default. Gemini cached content lookup is keyed by attachment/model/cache metadata but not by credential or account, so an API key rotation can reuse a cache name created under the old key.

Edge case: User selects a specific Claude Opus model and execution falls back to Sonnet. Later they replace the Google key and the next run reuses an old `cachedContents/...` name that the new account cannot access.

Fix direction: Centralize provider namespace mapping and fallback policy: `gpt` to `openai/*`, `gemini` to `google/*`, `claude` to `anthropic/*`. Include a credential/account fingerprint in Gemini cache identity or clear provider caches on key change.

### CR-050: Terminal and CLI streaming state still has process-lifecycle and hot-output gaps

Stories: `US-RUNTIMES-003`, `US-RUNTIMES-005`, `US-UI-023`.

Code map: [terminal session manager](../harness/cli/src/terminal/terminal-session-manager.ts), [CLI session manager](../harness/cli/src/agent-runtimes/cli-session-manager.ts), [terminal store](../harness/ui/src/terminal/terminal-store.ts), [xterm renderer](../harness/ui/src/terminal/renderers/xterm-renderer.tsx), [stream pump](../harness/cli/src/stream-pump.ts).

Impact: Terminal sessions are persisted as `starting` before process spawn succeeds, so a missing cwd or stale shell path can leave a zombie tab after reconnect. Stream pump batching reduces data-plane frames, but terminal and CLI managers can still persist metadata and broadcast updates per process chunk. On the UI side, once terminal scrollback trims, append detection can fail and force full xterm buffer rewrites on every new chunk.

Edge case: A project folder is deleted, then a terminal is created. The spawn path fails after persistence and the session remains stuck. Or a noisy watch command emits tiny chunks and the server hammers SQLite/control events while the renderer repeatedly resets megabytes of scrollback.

Fix direction: Wrap terminal spawn in a failure transition, mark or delete failed pre-start records, and throttle persistence/control updates separately from data frames. Track terminal output deltas or trim offsets instead of comparing whole strings after scrollback rollover.

### CR-051: Dense UI and state loaders still do unbounded work before visual caps help

Stories: `US-THREADS-001`, `US-THREADS-010`, `US-ASSISTANTS-002`, `US-ASSISTANTS-003`, `US-UI-010`, `US-UI-015`, `US-UI-020`, `US-UI-023`.

Code map: [assistant state loading](../harness/cli/src/workspace-repository.ts), [project sidebar](../harness/ui/src/components/project-sidebar.tsx), [markdown renderer](../harness/ui/src/components/markdown-content.tsx), [streamed tool block](../harness/ui/src/components/streamed-tool-block.tsx), [terminal renderer](../harness/ui/src/terminal/renderers/xterm-renderer.tsx).

Impact: Several surfaces cap what the user sees only after expensive work is already done. Assistant detail now uses SQL limits and on-demand paging, but sidebar virtualization still virtualizes project rows while one expanded project can render every thread inside one row. Live markdown keys the renderer by full content, remounting on each delta. Collapsed tool activity blocks still render every activity row and build a giant copy string.

Edge case: A long-lived project has one thousand active threads or a chat with many collapsed tool rows. Opening the app renders far more than the visible UI suggests, even when rows are collapsed or outside the viewport.

Fix direction: Continue moving limits into SQL and state selectors, flatten or page sidebar thread rows, keep live markdown mounted with a cheaper streaming renderer, and lazily build copy/export payloads only on user action.

### CR-052: IDE and terminal controls bypass shared overlay and button primitives

Stories: `US-UI-002`, `US-UI-022`, `US-UI-023`.

Code map: [IDE workbench](../harness/ui/src/ide/ide-workbench.tsx), [terminal tabs](../harness/ui/src/terminal/terminal-tabs.tsx), [dialog primitive](../harness/ui/src/components/primitives/dialog.tsx), [button primitive](../harness/ui/src/components/primitives/button.tsx).

Impact: The IDE command palette is a bespoke fixed overlay without dialog semantics, focus trap, or shared overlay-stack ownership. IDE editor tab close is a clickable icon inside a tab button rather than a named keyboard-reachable control. Terminal tabs put a `span role="button"` inside a `button`, which is invalid nested interaction and lacks normal Enter/Space handling.

Edge case: Keyboard focus can leave the command palette into the background, or land on a terminal close span where keypress does not close the tab and may activate the parent tab instead.

Fix direction: Route command palette through shared dialog or overlay-stack primitives. Split tabs into label and close sibling controls, use real button derivatives with tooltip and accessible labels, and add keyboard and focus tests for IDE and terminal tabs.

### CR-053: Assistant question and retry paths still bypass shared launch and question-state gates

Stories: `US-ASSISTANTS-002`, `US-ASSISTANTS-003`, `US-ASSISTANTS-004`, `US-JOBS-001`, `US-JOBS-003`, `US-NOTIFICATIONS-001`.

Code map: [assistant manager](../harness/cli/src/assistant-manager.ts), [assistant question persistence](../harness/cli/src/workspace-repository.ts), [assistant commands](../harness/cli/src/server.ts), [background run launch](../harness/cli/src/server.ts), [notification inbox](../harness/ui/src/components/notification-inbox.tsx).

Impact: The single assistant-question answer path can overwrite stale, resolved, or dismissed questions, while batch answer paths check pending or deferred state. Assistant-owned background retry creates a new run before checking pause or circuit-breaker state, so the launch gate later cancels a doomed run and leaves noisy history. The inbox also exposes answer actions under pause differently than the dedicated assistant panel.

Edge case: A stale inbox command answers an already answered assistant question, appends durable learning again, and reprioritizes the assistant. Or a circuit-tripped assistant job retry creates a fresh cancelled run instead of rejecting before history changes.

Fix direction: Make assistant question transitions require `(assistantId, questionId, status in pending/deferred)`. Run the shared assistant launch gate before retry-run creation, and feed the same pause and circuit-breaker reasons into assistant panel, jobs panel, and notification inbox affordances.

### CR-054: Setup health can go stale across project lifecycle changes

Stories: `US-WORKSPACE-005`, `US-ACTIVATION-003`, `US-ACTIVATION-006`.

Code map: [project lifecycle commands](../harness/cli/src/server.ts), [setup health](../harness/cli/src/setup-health.ts), [setup checklist](../harness/ui/src/components/setup-checklist-card.tsx), [project lifecycle tests](../harness/cli/src/test-support/server-test-harness.ts).

Impact: Setup state is meant to be server-derived per machine, but project lifecycle events do not all recompute and emit it. `project.add`, `project.create`, `project.browse`, and `project.activate` refresh setup after mutation; `project.remove` broadcasts `project.removed` and related surfaces without refreshing setup. After deleting the active or final project, clients can keep a stale `project-selected` ready check and ready-count summary.

Edge case: A first-run user opens a project, then removes it. The workspace returns to empty, but the activation center or help dialog can still report that the project requirement is ready until a manual refresh or reconnect.

Fix direction: Route project add, create, browse, activate, and remove through one lifecycle helper that updates repository/runtime state, emits the workspace/project event, recomputes setup, and broadcasts `setup.updated`. Add integration coverage that final-project removal emits `project-selected` as action-required.

### CR-055: The setup checklist exposes a Hide action that can be a no-op

Stories: `US-ACTIVATION-003`, `US-UI-017`.

Code map: [setup checklist](../harness/ui/src/components/setup-checklist-card.tsx), [chat onboarding surface](../harness/ui/src/components/chat-panel.tsx), [setup visibility predicate](../harness/ui/src/harness-store.ts).

Impact: The setup card always shows `Hide` when the parent passes `onDismiss`, but the visibility predicate forces the card to stay mounted whenever any required first-task check is not ready. During first-run blockers, clicking `Hide` sets local state false but the card remains visible, making the onboarding surface feel broken.

Edge case: A user with no project or no usable agent clicks `Hide` to focus on the empty-state sample task. The card immediately remains visible because required checks still block first task readiness.

Fix direction: Only show the hide control when it can actually hide the card, or add a dismissed-until-setup-version state with an explicit restore path. Cover the forced-blocker case in store and component tests.

### CR-056: Tutorial completion is detached from actual onboarding progress

Stories: `US-ACTIVATION-004`, `US-ACTIVATION-003`, `US-ACTIVATION-007`.

Code map: [tutorial definitions](../harness/ui/src/components/tutorial-definitions.ts), [tutorial overlay](../harness/ui/src/components/tutorial-overlay.tsx), [tutorial progress store](../harness/ui/src/harness-store.ts), [tutorial tests](../harness/ui/src/components/tutorial-overlay.test.tsx).

Impact: Guided tutorials are click-progressed overlays. `Finish` records local completion even when the target element is missing and no setup check changed. The help dialog can therefore show a walkthrough as completed while the actual activation checks still require project open, provider/runtime setup, or first task readiness.

Edge case: A user starts `Connect provider or runtime` before opening a project. The agent selector target is missing, the fallback text appears, and the user can click through to completion without connecting any provider or CLI runtime.

Fix direction: Give tutorial steps completion predicates tied to setup checks or concrete UI actions. Treat missing-target finish as skipped, not completed, and keep help status derived from current setup state where the tutorial maps to a readiness requirement. Add tests that missing-target tutorials do not become completed and provider/runtime completion requires an agent-ready state.

### CR-057: Virtualized lists can pass Happy DOM tests while first browser paint is blank or stale

Stories: `US-THREADS-008`, `US-UI-015`, `US-UI-017`, `US-DEV-017`.

Code map: [virtual list primitive](../harness/ui/src/components/primitives/virtual-list.tsx), [chat panel](../harness/ui/src/components/chat-panel.tsx), [assistant panel](../harness/ui/src/components/assistants-panel.tsx), [jobs panel](../harness/ui/src/components/background-jobs-panel.tsx), [trace panel](../harness/ui/src/components/trace-panel.tsx), [UI test harness](../harness/ui/src/utils/tests/test-harness.ts).

Status: Closed for the primitive and project chat transcript. `VirtualList` now has a real-browser first-paint smoke that mounts reverse and forward lists, delays viewport height stabilization, asserts visible row geometry and anchoring before any tab remount, then repeats the checks after tab switches. Project chat also has browser coverage for delayed workspace hydration while the transcript viewport is collapsed, including a no-`ResizeObserver` path that previously left the list on a stale virtual window until remount.

Impact: Happy DOM tests prove that virtualized transcript, trace, assistant, jobs, and run-detail lists render expected rows in a stubbed DOM, but they do not prove real browser first paint. Happy DOM has no layout engine, and several tests stub scroll metrics or row rectangles. A list can therefore pass because fallback estimates produce DOM rows, while the real browser first mount can still render an empty, clipped, or stale scroll window until a tab switch remounts or remeasures it.

Edge case: A user opens a tab whose active pane contains a virtual list. The pane mounts before its flex/grid height and row geometry are stable, so the virtualizer calculates the wrong visible window or scroll anchor. Switching away and back remounts the pane after layout has settled, making the content appear and hiding the first-load defect.

Fix direction: Keep the primitive and project-chat browser smokes as required guards for virtualization behavior. Extend browser coverage to memory/events, assistant detail, jobs/runs, and trace surfaces if a surface adds custom wrappers, scroll ownership, or anchoring rules that these fixtures no longer represent.

### CR-058: Closed - project chat file paths share one modifier-click contract

Stories: `US-UI-010`, `US-UI-022`, `US-THREADS-008`, `US-RUNS-009`.

Code map: [chat file-link parser](../harness/ui/src/lib/chat-file-links.ts), [markdown renderer](../harness/ui/src/components/markdown-content.tsx), [project chat panel](../harness/ui/src/components/chat-panel.tsx), [assistant panel](../harness/ui/src/components/assistants-panel.tsx), [streamed tool block](../harness/ui/src/components/streamed-tool-block.tsx), [jobs panel](../harness/ui/src/components/background-jobs-panel.tsx), [trace panel](../harness/ui/src/components/trace-panel.tsx), [execution plan dialog](../harness/ui/src/components/execution-plan-dialog.tsx), [IDE store](../harness/ui/src/ide/ide-store.ts).

Status: Closed for rendered project chat, assistant chat, assistant memory/todos/questions/learnings/logs, background job run events/details, streamed tool rows/details, trace summaries/peek/tool/browser rows, execution plan text, and execution-log rows/details. File references use primary-color underlined link styling with pointer cursor and open the IDE on Ctrl/Meta-click.

Remaining watch item: keep future path-bearing surfaces, such as new inspector cards and experiment diff sidebars, on the same project-owned file-link adapter instead of adding local path parsing.

Test coverage now includes known root-level files, log rows, tool rows, markdown content, assistant/background path surfaces, and IDE-open modifier-click behavior.

### CR-059: Background approval, input, and browser gates collapse into one unclear stop

Stories: `US-ASSISTANTS-001`, `US-ASSISTANTS-002`, `US-JOBS-001`, `US-JOBS-002`, `US-JOBS-003`, `US-RUNS-013`, `US-BROWSER-001`, `US-NOTIFICATIONS-001`.

Code map: [scheduler](../harness/cli/src/background-job-scheduler.ts), [background executor](../harness/cli/src/background-job-executor.ts), [server lifecycle](../harness/cli/src/server.ts), [jobs panel](../harness/ui/src/components/background-jobs-panel.tsx), [notification inbox](../harness/ui/src/components/notification-inbox.tsx), [run navigation](../harness/ui/src/background-run-navigation.ts), [preferences](../harness/ui/src/components/preferences-modal.tsx).

Impact: The background approval preference only controls scheduled and startup launch approval. Manual run-now already queues as approved, and background AI jobs execute after planning. Other stops still exist: assistant or planner input, browser per-tool approval, global pause, assistant pause, and circuit breaker. The UI then routes `awaiting-user-input` into the `approval` run filter, shows both launch approval and input with similar amber treatment, and makes launch approval notifications noninteractive while browser approval notifications are actionable inline.

Edge case: A user sets background approval to allow all, an assistant-owned job runs, then the planner asks for missing input or a browser step needs approval. The Jobs pane or toast still feels like "approval required" without showing which gate stopped the run, why the auto-run setting did not apply, or the smallest next action.

Fix direction: Replace the single approval bucket with a typed intervention model such as launch approval, user input, browser permission, pause, circuit breaker, and failure. Every stop should carry `why`, `scope`, `risk`, `affected job/run`, `blocking setting`, and `next action`. Make background-run launch approvals interactive in the inbox, split filters into Approval and Input, and add a local "why did this stop?" explanation surfaced from the same backend state used by guards.

Partial closeout note: non-blocking assistant questions now have an explicit auto-approval preference. The broader typed intervention model remains open for launch approvals, input lanes, browser permissions, pause, circuit breaker, and failure readback.

## Critical Duplicate Logic To Extract

1. Project lifecycle and setup refresh path.

Repeated across `project.add`, `project.create`, `project.browse`, `project.activate`, and `project.remove`. Extract one helper that owns repository/runtime mutation, workspace or project event emission, active skill discovery, and setup refresh. This reduces drift across `US-WORKSPACE-005`, `US-WORKSPACE-008`, `US-WORKSPACE-009`, `US-SEARCH-003`, and activation setup state.

2. Run lifecycle wrapper.

`chat.send`, `planning.refine`, `planning.answer`, `run.execute`, `run.resume`, and `run.retry` repeat: assert not paused, set streaming, create abort controller, call lifecycle, handle abort, handle failure, clear streaming/controller. Extract a typed `runWithProjectExecutionController` that takes target `(projectId, threadId, runId?)` and owns cleanup.

3. Run status policy.

Working, blocking, refreshable, retryable, resumable, badge, and phase mappings are spread across server, repository, UI store, and UI status helpers. Move shared predicates into [harness/shared](../harness/shared) so UI affordances and backend rejection logic stay aligned.

4. Local storage parsing and persistence.

Composer, provider, trace, execution defaults, background notifications, tutorial progress, and browser UI state all live in one large UI store file. Extract a small typed browser preferences adapter so malformed values, bounds, and defaults stay testable outside the global store.

5. Background run terminal and retry policy.

`partial-complete`, timeout, cancelled, failed, succeeded, stale, and awaiting-input behavior is repeated across scheduler, command guards, repository updates, notifications, and UI actions. Extract one shared background-run transition helper so stop, retry, delete, and display state cannot drift.

6. Filesystem trust and path canonicalization.

BranchFS, IDE file service, project open, and promotion code each normalize paths differently. Extract one helper that owns repo root, project root, realpath, symlink, Windows case, and nested-project scope checks.

7. Draft and command acknowledgement lifecycle.

The UI currently mixes optimistic command dispatch, websocket queuing, local draft persistence, attachment chip state, and backend rejection handling. Add a request-id based pending-command adapter that owns when drafts clear, restore, or remain pending.

8. Provider model namespace and cache identity.

Provider brand, model ids, cached attachment content, and credential changes need one resolver. Keep namespace validation, fallback choice, and cache invalidation together instead of duplicating provider-specific checks.

9. Stream and dense-render budgets.

Terminal, CLI session, markdown, tool activity, assistant logs, and sidebar lists each enforce caps differently. Extract shared cadence, row-window, copy-export, and redaction budgets so large hidden data does not still load or render eagerly.

10. Project file-link ownership.

Chat, assistant, trace, terminal, IDE, and experiment-review surfaces each resolve or display local paths differently. Extract one project-owned file-link adapter that covers detection, visible affordance, click behavior, and IDE open target so relative path links do not drift by surface.

11. Intervention reason ownership.

Launch approvals, planning questions, assistant questions, browser permissions, global pause, circuit breakers, and failed background runs each shape their own status text and UI bucket. Extract one shared intervention descriptor so notifications, filters, detail panes, toasts, and backend rejection messages all explain the same stop with the same action.

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
13. `US-WORKSPACE-005`, `US-JOBS-001`, and `US-JOBS-004`: prove project and job deletion reject or cancel active owned background runs before cascading durable rows.
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
29. `US-DEV-007` and `US-ACTIVATION-001`: run doctor and runtime health from an extracted portable launcher folder and prove it does not depend on source-checkout `node_modules`.
30. `US-PREFERENCES-001` and `US-UI-017`: ensure preferences tests target visible, real controls and that no hidden interactive controls are exposed only for tests.
31. `US-RUNS-004`, `US-RUNS-009`, and `US-RUNS-016`: reject `run.complete` outside executing states, make final message plus status atomic, and cover deferred `run.refresh` after active streaming.
32. `US-PLANNING-002` and `US-RUNS-013`: reject partial planning-answer batches when other required questions remain pending.
33. `US-THREADS-010` and `US-RUNTIMES-003`: archive threads only after live run and CLI activity stop succeeds, including stop-failure rollback tests.
34. `US-JOBS-002` and `US-JOBS-004`: cover `partial-complete` as terminal and retryable or explicitly non-retryable across guards, repository, UI, and notifications.
35. `US-PERSISTENCE-014`, `US-THREADS-007`, and `US-ATTACHMENTS-002`: preserve or restore chat drafts and unsent attachments when commands queue, reject, or fail to flush.
36. `US-WORKTREE-001`, `US-WORKTREE-002`, `US-WORKTREE-007`, and `US-UI-022`: add nested-project dirty fingerprint, BranchFS symlink, IDE symlink escape, and missing `package.json` integration tests.
37. `US-PLANNING-003`, `US-PLANNING-010`, and `US-WORKTREE-004`: validate semantic plan invariants beyond schema shape before ready plans persist.
38. `US-BROWSER-001`, `US-BROWSER-002`, and `US-BROWSER-003`: resolve browser approvals by durable run/thread/session/tool owner, including background-run inbox notifications.
39. `US-UI-020` and `US-DEV-020`: prove debug artifact files pass through the same redaction and budget path as persisted tool activity.
40. `US-PROVIDERS-002`, `US-PROVIDERS-006`, `US-RUNTIMES-006`, and `US-RUNS-012`: cover Claude model namespace acceptance and Gemini cache invalidation on Google key rotation.
41. `US-UI-023` and `US-RUNTIMES-003`: cover terminal spawn failure, high-output chunk cadence, scrollback rollover, and xterm append behavior.
42. `US-UI-010`, `US-UI-015`, `US-UI-020`, and `US-ASSISTANTS-002`: add large fixtures proving assistant loads, markdown streaming, collapsed tool blocks, and sidebar thread lists stay bounded before render.
43. `US-UI-002`, `US-UI-022`, and `US-UI-023`: test IDE command palette focus containment plus keyboard-accessible IDE and terminal tab close controls.
44. `US-WORKSPACE-005`, `US-ACTIVATION-003`, and `US-ACTIVATION-006`: assert final-project removal emits fresh setup state with `project-selected` action-required, and that project add, activate, and remove keep setup and workspace state paired.
45. `US-ACTIVATION-003` and `US-UI-017`: prove setup checklist hide behavior is either unavailable while blockers force display or persists until the next setup-version change.
46. `US-ACTIVATION-004` and `US-ACTIVATION-007`: prove tutorial completion cannot be recorded while the target is missing or the mapped setup check remains unresolved.
47. `US-THREADS-008`, `US-UI-015`, `US-UI-017`, and `US-DEV-017`: keep browser-backed first-paint virtual-list coverage current when tab-mounted transcript, assistant, jobs, runs, memory, or trace wrappers diverge from the primitive fixture.
48. `US-UI-010`, `US-UI-022`, `US-THREADS-008`, and `US-RUNS-009`: keep browser coverage for Ctrl/Meta-click IDE open from transcript, streamed tool, trace, log, and assistant-chat surfaces with pointer affordance and project-owned target scope.
49. `US-ASSISTANTS-001`, `US-JOBS-002`, `US-RUNS-013`, and `US-BROWSER-001`: prove allow-all background launch policy does not suppress required planner, assistant, or browser interventions, and prove each intervention renders with a distinct reason, inline action, and matching backend rejection rule.

## Bottom Line

Happy-path flow is broad and mostly wired. The highest remaining correctness risk is now in lifecycle command authority, active background ownership during destructive operations, unclear intervention reasons for assistant/background work, onboarding readiness drift, BranchFS and IDE path trust, debug artifact redaction, provider/cache identity, draft acknowledgement, browser approval ownership, terminal stream pressure, dense UI load budgets, app-specific virtualized layout drift, and overlay or button primitives in newer IDE/terminal surfaces.
