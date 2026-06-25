# Discovered Patterns

Living catalog for repeated correctness and product-quality gaps found while using `correctness-scan`.

Update this file when a scan finds a reusable failure pattern, missing probe, or recurring category that future scans should check by default.

## 2026-04-24

### Transcript vs runtime drift

- Watch for flows that promise "clean transcript forks" or "runtime-only state" while persistence helpers clone or replay every message row.
- Probe thread fork, retry, restore, and import flows for plan cards, milestone rows, system errors, and other transcript noise leaking into supposedly clean clones.

### Command ownership and state-transition validation

- Typed websocket contracts are not enough by themselves.
- Check that mutating commands validate project ownership, current status, and one-way lifecycle rules before changing persisted rows.
- Background jobs, approvals, retries, stop actions, and notification commands are common drift points.

### Schema-only transport promises

- A contract can validate while the runtime behavior behind it stays under-tested.
- Treat attach or reconnect transport, background control commands, and browser approval flows as risky whenever coverage stops at protocol parsing or UI dispatch.

### Top-level CLI ergonomics as product surface

- Scan `index-main.ts`, launch scripts, and packaging scripts as real user-facing CLI, not only bootstrap glue.
- Verify help text, flag validation, stdout vs stderr, machine-readable modes, and exit-code classes for `--doctor`, `bootstrap`, packaging, and startup recovery paths.

### Disabled affordance vs submit-path drift

- A disabled button is not enough when keyboard shortcuts, form submit handlers, or alternate triggers dispatch the same command through a different path.
- For chat composers, dialogs, approval forms, and schedule editors, verify that `Enter`, hotkeys, and imperative submit use the same eligibility predicate as the visible button state and tooltip reason.

### Thread-owned runtime state stored at project scope

- Watch for transport or runtime overlays that belong to one thread but are cached on whole-project state and then reused after thread activation changes.
- Live CLI sessions, terminal attach state, browser approvals, pending questions, and similar bridge-owned overlays should validate ownership on every command and rehydrate the right thread-scoped surface after reconnect.
- Probe thread switch during active bridge state, then try stop, attach, resize, retry, or capture actions from the new thread. If caller-supplied ids win over persisted ownership, UI and backend can relabel or mutate the wrong session.

### Development instrumentation as hidden product behavior

- Treat dev-only telemetry, debug fetches, local ingest hooks, and prompt or output logging as shipped risk until proven removable or explicitly configured.
- Probe runtime adapters, assistant managers, and launch paths for hardcoded URLs, swallowed debug failures, prompt snippets, terminal tails, cwd, environment data, and provider details.
- Debug code should use one shared logger, avoid sensitive prompt or output content by default, and surface local failures during development.

### Fire-and-forget async boundaries

- `void someAsyncWork()` is only safe when the callee cannot reject or the caller attaches a visible `.catch()` path.
- Probe websocket data planes, scheduler ticks, delayed timers, hot reload builders, assistant bootstrap queues, and process exit handlers.
- Failures should become durable state, toast or command rejection, job or run event, or at least a development console error that includes the triggering operation.

### Repository UI rules without enforcement

- Shared UI rules drift when they are only documented and not linted or tested.
- Probe dense run, trace, inbox, and settings surfaces for raw `title` tooltips, direct button-like markup, margin spacing utilities, arbitrary Tailwind values with canonical equivalents, and duplicated dialog or overlay shells.
- Prefer focused lint rules or small static tests for repo-specific UI bans so reviewers do not rediscover the same style regressions manually.

## 2026-04-25

### Ambient capability namespace vs scoped refs

- Treat linked skills, scripts, modes, templates, connectors, and assistant assets as risky unless they are resolved to scoped capabilities before runtime.
- Probe whether refs are only persisted or printed into prompts, or whether save and launch paths validate existence, provenance, scope, stale deletion, duplicate labels, and clone behavior.
- Broad repo-level discovery should be discoverability, not authority. Runtime prompts should make clear which capabilities are explicitly attached to the actor and which are merely available in the workspace.

### Metadata validation without resource ownership

- Treat payloads that carry remote URLs, attachment refs, session ids, or file keys as risky when schemas validate shape but not server ownership.
- Probe whether clients can bypass intended upload, auth, or attach-token flows by sending plausible metadata directly over the websocket.
- Resource-bearing commands should validate provenance, allowed origin, bounded size, active ownership, stale deletion, and whether the server can resolve the resource from trusted state.

### Unbounded stream accumulation before preview truncation

- Truncating output when persisting events is not enough if stdout, stderr, terminal buffers, or server logs are accumulated fully in memory first.
- Probe CLI runtimes, background shell jobs, screenshot/dev-server helpers, terminal sessions, and build watchers for full-string buffers fed by untrusted or long-running processes.
- Prefer bounded ring buffers, byte caps, temp-file spill for debug artifacts, and explicit failure or detach behavior when caps are exceeded.

### Passive liveness contracts

- A ping/pong schema does not prove zombie detection unless a heartbeat loop drives it and missed heartbeats change state.
- Probe control websockets, PTY attach sockets, browser approvals, and run/session ownership after sleep, network changes, reloads, and reconnects.
- Stale sockets should detach owned runtime state and reconnect should rehydrate from server-owned session identity, not caller-supplied ids.

### Streaming without workload boundaries

- Treat live token, terminal, trace, and status streams as risky unless batching, bounded persistence cadence, and slow-client behavior are explicit.
- Probe whether raw provider deltas, process chunks, or progress events emit one websocket message per tiny chunk and whether each chunk triggers database writes or full markdown rerenders.
- Streaming paths should coalesce by time or byte size, flush final state synchronously, cap per-connection queues, and degrade or detach slow consumers.

### Typed snapshots used as hot-path deltas

- A typed websocket payload can still be too broad for frequent events.
- Probe append, status, trace, and subtask updates for whole-session, whole-project, whole-workspace, or whole-run snapshots that grow with unrelated history.
- Hot events should be narrow id-addressed deltas; full snapshots should be reserved for connection ready, explicit refresh, and recovery.

### Live markdown and dense DOM growth

- Markdown correctness tests do not prove streamed markdown is cheap enough under long code blocks or frequent deltas.
- Probe live markdown surfaces for repeated syntax highlighting, full parse work, and unvirtualized transcript, trace, tool, browser replay, or log rows.
- In-flight markdown can use a cheaper renderer or debounced parse path, then run full highlighting after the message locks. Dense panes need row caps, windowing, or explicit "show more" affordances.

### Actor launch gates split across status fields

- Treat actor-owned execution as risky when pause, circuit breaker, deleted state, global pause, and project ownership are checked in separate places.
- Probe every launch path, not only scheduled work: direct chat, retry, bootstrap, manual run, resume release, scheduler catch-up, and reprioritize timers.
- Prefer one shared launch predicate that blocks on every relevant state field and is used before runtime dispatch, queue release, and background-run start.

### Hidden surface contamination

- A feature can have a dedicated surface while still writing its transcript or logs into the older main surface.
- Probe background jobs, assistants, browser approvals, and automation threads for project-chat writes, persisted prompts, or promoted summaries that later become normal chat context.
- Dedicated surfaces should own their raw transcript. Main chat should only receive explicit user-approved promotions or narrow linked status rows.

### Single-flight bootstrap and retry

- Any retryable setup, bootstrap, or self-repair flow needs an attempt id or in-memory single-flight guard.
- Probe repeated clicks, reconnect release, process reload during `running`, and stale async completions that race with newer attempts.
- Retry should join, reject, cancel, or supersede the active attempt explicitly, then persist enough state to explain which attempt won.

### Overlay stack without ownership

- Independent `Escape`, outside-click, focus, and z-index handling looks fine in single-layer tests but breaks when popovers sit inside dialogs, sheets, tutorials, or header overlays.
- Probe nested overlay priority, focus trap and release, scroll containment, tooltip/toaster layering, and whether only the topmost dismissible surface closes.
- Shared overlay primitives should own layer tokens, active-stack identity, focus cycling, and dismissal routing instead of each surface registering global listeners independently.

### Global hotkeys without input ownership

- Keyboard shortcuts can become hostile when global handlers opt out of input ignoring or only special-case one focused control.
- Probe every global shortcut from chat, assistant, scheduler, notification, preferences, and modal text inputs.
- Submit shortcuts should share the same eligibility predicate as the visible button, avoid duplicate form and hotkey paths, and leave `Shift+Enter` behavior explicit.

### Attachment affordance vs upload lifecycle

- File selection support does not imply drag/drop confidence or unsent upload durability.
- Probe drag-over/drop feedback, blocked drop states, thread or project switching with unsent chips, reload behavior, and orphan cleanup when an upload is removed before send.
- Attachment text drafts and attachment refs need an explicit ownership model so the UI does not preserve one while silently dropping the other.

### Stable test hooks vs style-coupled assertions

- Treat UI tests that assert Tailwind, syntax-highlighter, or DOM-shape classes as drift risk unless the class is itself the contract.
- Probe modal, overlay, markdown, status badge, and dense panel tests for selectors that should use `data-test-*`, accessible roles, or visible text instead.
- Style-coupled tests can make visual refactors noisy while still missing semantic regressions such as focus ownership, disabled reasons, portal clipping, and overlay priority.

### Capability-backed magic affordances

- Treat "magic" UI polish as suspect when it infers product state from local component hints instead of typed backend or store contracts.
- Probe project switchers, setup flows, run visualizations, proof bundles, and file-drop flows for missing metadata, stale ownership, OS/browser capability limits, and recovery after deletion or reconnect.
- Browser drag/drop of local folders is especially risky: without a trusted directory handle or native bridge, it should fall back to browse or explicit path entry instead of pretending an absolute root path exists.

### Motion polish as correctness surface

- Animations, glows, ambient tints, skeletons, confetti, shortcut overlays, smooth-scroll magnets, and selection popovers need shared ownership instead of one-off component state.
- Probe `prefers-reduced-motion`, keyboard focus, editable-target hotkey ownership, non-color status cues, no layout shift, and teardown on fast project/thread switches.
- Add stable hooks and accessibility assertions before treating visual delight as shippable polish.

## 2026-05-12

### Cleanup paths derived from caller cwd

- Treat any cleanup, doctor, reset, or repair command that deletes `dist`, cache, temp, or DB files as risky when the target is derived from `process.cwd()`.
- Probe packaged launchers, shell aliases, nested project cwd, and paths with unrelated build outputs.
- Destructive repair work should resolve against a trusted harness root or a verified workspace-owned path before deleting anything.

### Hidden test shims as product surface

- Hidden `sr-only` controls, duplicate headings, or fake buttons added to satisfy tests still ship to assistive technology and can mask broken visible UI.
- Probe dense panels and refactors for hidden interactive fallbacks that tests target instead of real controls.
- Prefer stable `data-test-*` hooks and accessible names on the real UI; tests should not rely on duplicate hidden controls unless they are genuinely part of the accessibility contract.

### Raw proof artifacts need redaction budgets

- Proof-rich tool details can leak secrets or prompt-like data when raw args/results are persisted and made copyable.
- Probe tool activity, browser replay, MCP payload, provider error, and shell output capture for field-level caps plus aggregate run-level budgets.
- Add shared sanitization before persistence, not only before rendering.

## 2026-06-01

### Public lifecycle commands need state-machine authority

- Treat client-visible lifecycle commands as risky when they can finalize, resume, refresh, retry, archive, or stop work without proving the current runtime owner and status.
- Probe public completion commands, deferred refresh, batch answer, thread archive, retry, and destructive delete for stale-client or forged transitions.
- Final assistant text, terminal status, run status, and notifications should commit atomically or have idempotency keys and recovery tests.

### Optimistic UI sends need acknowledgement-backed draft cleanup

- Clearing drafts or closing inbox rows immediately after dispatch is unsafe when websocket send can queue, fail, or be rejected by backend state.
- Probe disconnected send, stale project/thread rejection, global pause, preflight rejection, quick-choice buttons, and side-surface submit paths.
- Draft text, attachment refs, and expanded inbox state should clear only after an accepted acknowledgement, or restore on command rejection and dropped queues.

### Lexical path guards are not filesystem trust

- `../` checks and normalized strings do not stop symlink escapes, nested-root fingerprint drift, Windows case differences, or repo-relative paths joined under the wrong root.
- Probe IDE file reads/writes, BranchFS materialization, promotion, dirty-state fingerprints, project search/open, and cleanup commands with symlinks and nested projects.
- Prefer one realpath-aware trust helper that knows repo root, selected project root, symlink policy, and nested-project scope.

### Semantic plan invariants need validation beyond schema shape

- Zod shape checks do not prove planner contracts make sense together.
- Probe contradictory `usesSubagents`, difficulty, subtasks, same-worktree paths, prerequisites, verification scope, and isolation strategy.
- Normalize or reject inconsistent LLM plans before they persist as ready execution contracts.

### Post-slice caps can hide unbounded hydration

- UI row caps and protocol array limits do not protect startup when code loads, parses, or stringifies all rows before slicing.
- Probe assistant logs/messages, tool activities, terminal scrollback, markdown streams, and expanded sidebar rows with large single-owner fixtures.
- Move limits into SQL, selectors, virtualization boundaries, and lazy copy/export paths.

### Provider caches need credential and namespace identity

- Model ids and cached remote content are scoped by provider namespace, account, credential, and sometimes model.
- Probe provider brand switches, stale persisted model ids, API key rotation, attachment cache reuse, and provider-specific fallback.
- Cache keys should include account or credential identity when provider resources are not portable across keys.

### Portable launchers need release-specific health contracts

- Source repair commands can become false guidance inside packaged launchers.
- Probe extracted release directories without source `node_modules`, lockfiles, or dev scripts.
- Runtime health should either package native assets or explain launcher-specific reinstall/update repair, not silently run source checkout repair in the release folder.

## 2026-06-15

### Derived readiness snapshots must follow source mutations

- Treat setup health, activation checklists, tutorial progress, and similar readiness sidecars as stale unless every source-state mutation refreshes or invalidates them.
- Probe project add, activate, remove, preference save, runtime refresh, and repair actions for paired source event plus readiness event ordering.
- Dismiss or completion UI should not imply progress when the underlying readiness predicate still fails.

## 2026-06-24

### Browser-layout primitives can outgrow Happy DOM coverage

- Treat virtualizers, resize-driven panes, sticky scroll regions, split panels, and tab-mounted dense lists as risky when tests only assert DOM rows under Happy DOM.
- Probe first browser paint before any tab switch, then compare after tab switch or remount; remounts can hide zero-height, stale measurement, and scroll-anchor defects.
- Browser coverage should assert visible row geometry, scroll canvas height, row non-overlap, and anchor position with deterministic seeded data. Happy DOM tests remain useful for pure helpers and dispatch behavior, but not for layout correctness.

## 2026-06-25

### Collapsed intervention labels

- Treat "approval", "blocked", and "needs input" as risky labels when multiple gates can stop the same run.
- Probe background jobs, assistants, browser tools, global pause, circuit breakers, and planner questions for distinct reason metadata, policy readback, inline actions, and matching filters.
- Auto-run settings should name exactly which gates they bypass and which gates remain human- or reviewer-mediated.
