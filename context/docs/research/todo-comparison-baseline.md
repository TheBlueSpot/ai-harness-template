# Todo Comparison Baseline

Frozen comparison brief for the current pending roadmap queue in [../../../docs/todo.md](../../../docs/todo.md). This note stays high-level on purpose: it records each still-pending root-roadmap area once, keeps the comparison criteria stable, and defers source detail to the dated memo under `.local/kojima/`.

## Queue Shape

Source evidence comes from [../../../docs/todo.md](../../../docs/todo.md), [../../../docs/user-stories.md](../../../docs/user-stories.md), and the current repo-local planning notes in [../../README.md](../../README.md) and [../../sweep-note.md](../../sweep-note.md). The user-story inventory now exists, so this baseline can corroborate the broader roadmap against a shipped-story list instead of comparing only roadmap areas and market signals.

## Pending Areas

## Activation And Onboarding

- Signed installers and update channels for portable launcher distribution.
- Doctor and reset flows for stale auth, broken local config, and launcher drift.
- Typed setup and repair coverage for MCP servers, remote targets, and local scripts.
- Keep first-task activation centered on project-open plus task-send flow.
- Preserve current approval and autonomy defaults while improving setup clarity and recovery.

## Daily Coding Loop

- Thread sorting and recent-thread trimming remain the active thread-lane follow-up now that archive and restore controls ship.
- Saved composer presets for mode, agent, provider, and model.
- Global search with `Cmd/Ctrl+F`, debounced input, and tiered streamed results.
- Terminal-first workflow support, command palette actions, keyboard shortcuts, and searchable branch or run names.
- One-step handoff into the user editor with active thread or run context attached.
- Step-level diff review, incremental change views, and checkpoint restore.
- Disposable experiment branches with fast compare, promote, and discard flow.
- Durable proof bundles for each run or checkpoint.
- Inspectable session ledger for each thread or run.
- Preview-to-fix loop for selected elements, screenshots, console errors, and runtime failures.
- Run heartbeat, stale-run detection, and explicit `last verified`, `next step`, and `waiting on` summaries.
- Strong thread sorting and recent-thread trimming.

## Provider Portability

- More bring-your-own-agent backends.
- Provider auth state, runtime availability, discovered models, and capability differences before execution starts.
- Tool and connector health shown with the same honesty as model capabilities.
- Provider failover and credential rotation for long-running work.
- Clearer provider exhaustion and auth-expiry guidance.
- Honest provider selection and model switching when tools are missing or features degrade.
- One typed provider contract path instead of provider-specific UI forks.

## Background Runs

- Optional OS-level scheduler bridges.
- Windows Task Scheduler, macOS LaunchAgent, and Linux systemd user service or cron bridges behind opt-in.
- Away-from-desk approval and review inbox flows.
- Artifact-first and phone-friendly away-from-desk review flows.
- Pattern-based output watches for milestones and errors.
- Deeper risk summaries around branch, environment, network, and filesystem scope before launch or approval.
- Safeguards around long-running tasks and external side effects.

## Remote Targets

- First-class backend targets for local, WSL, and later headless or SSH-backed environments.
- Secure pairing and reconnect flows.
- Low-friction remote observer flow for control, approval, and status checks.
- Target capabilities explicit in UI copy before path, shell, or toolchain mismatches.
- Local-first source of truth even when backend runs outside the desktop process.

## Usage And Quota Visibility

- Per-thread or per-run usage when providers expose it.
- Account quota, rate-limit, or credit state in a lightweight status area.
- Per-run budget caps, soft or hard stop rules, and preflight warnings.
- Cross-runtime local usage import where possible.
- Lightweight burn-rate and remaining-headroom hints during execution.
- Model speed, cost, and capability tradeoffs in selection flows.
- Graceful fallback when providers do not expose usage details.

## Browser Automation

- Installable browser tool or skill wired into the browser session and approval pipeline.
- Richer replay artifacts such as screenshots, DOM snapshots, step-level verification evidence, and durable trace bundles.
- Approval policy beyond per-step manual gating.
- Preview handoff controls for structured browser evidence back into planning or implementation.
- Dedicated frontend QA flows that hand findings back into the coding plan.

## Upload Hygiene / Cleanup

- OCR fallback for scan-only PDFs and image-only documents.
- Attachments into `planning.answer` and `planning.refine` flows.
- Orphan-upload cleanup when users remove unsent attachments or abandon a draft.
- Attachment lifecycle visibility for expired, deleted, or fetch-failed remote files.
- Explicit attachment limits and cleanup policy in UI copy and settings docs.

## Markdown Polish

- Less visual churn during long streaming markdown responses.

## Workspace Sync

- Local backup, export, and import flows for threads, settings, skills, and lightweight memory.
- Optional multi-device sync only after local workflow and background history are stable.
- Local SQLite as source of truth during offline work.
- Reconciliation, conflict rules, and visible sync state before any remote rollout.

## Memory And Skill Platform

- Expand local modes into reusable skill and playbook distribution.
- Support install, import, export, and workspace discovery for custom workflows.
- Versioned workspace and repo rules with visible source, last-used signal, and promote-from-chat or review flows.
- Shared execution cache for planner, main agent, and subagents.
- Explicit and inspectable cache controls with source links, freshness markers, hit history, pin or expire controls, and easy clear or rebuild actions.
- Context lifecycle controls for compressing, pinning, or evicting stale files and old turns.
- Skill provenance, trust signals, and per-workspace allowlists.
- Managed update flows for installed skills.
- Memory that stays lightweight, inspectable, and editable.

## GitHub Operations

- Issue and pull-request workflows around `pi`.
- Diff-aware review summaries, issue execution, and PR follow-up loops.
- Review-specific rule capture from accepted or dismissed findings.
- Repository automation behind explicit opt-in and clear approval points.

## Broader Assistant Surfaces

- Revisit voice, Google Workspace, messaging channels, and remote nodes only after coding PMF is stable.
- Avoid broad personal-assistant, full IDE clone, and cloud-first execution scope until the core harness workflow is clearly sticky.

## Comparison Matrix

| Area | Leverage | Scope | Verification Burden | Dependency Risk |
|---|---|---|---|---|
| Activation And Onboarding | Very high | Broad | High | High |
| Daily Coding Loop | Very high | Broad | High | High |
| Provider Portability | High | Broad | High | High |
| Background Runs | High | Broad | High | High |
| Remote Targets | High | Broad | High | High |
| Usage And Quota Visibility | Medium-High | Medium | Medium | Medium-High |
| Browser Automation | Medium-High | Medium | Medium-High | Medium |
| Upload Hygiene / Cleanup | Medium | Medium | Medium | Medium |
| Markdown Polish | Medium | Narrow-Medium | Medium | Low-Medium |
| Workspace Sync | High | Broad | High | High |
| Memory And Skill Platform | High | Broad | High | High |
| GitHub Operations | Medium-High | Medium | Medium-High | Medium |
| Broader Assistant Surfaces | Low for current phase | Broad | High | High |

## Live Comparison

| Area | Relative priority now | Read on the lane |
|---|---|---|
| Activation And Onboarding | 1 | Still the strongest trust and recovery win for first-run activation. |
| Daily Coding Loop | 2 | Owns the sticky day-to-day workflow once activation succeeds. |
| Provider Portability | 3 | Prevents silent capability or auth failure across runtimes and models. |
| Background Runs | 4 | Matters once normal runs are trusted and reviewable. |
| Remote Targets | 5 | Expands execution contexts, but adds security and reconnect coupling. |
| Usage And Quota Visibility | 6 | Reduces surprise spend after the core workflow is already reliable. |
| Browser Automation | 7 | Improves proof and replay, but remains downstream of core trust surfaces. |
| Upload Hygiene / Cleanup | 8 | Narrow cleanup work, useful but not core to execution trust. |
| Markdown Polish | 9 | Readability improvement, not a capability unlock. |
| Workspace Sync | 10 | Important later, after local history and recovery are stable. |
| Memory And Skill Platform | 11 | Valuable, but should not outrun core local loop trust. |
| GitHub Operations | 12 | Deepens the product after the base harness is sticky. |
| Broader Assistant Surfaces | 13 | Intentionally deferred until coding PMF is stable. |

## Decision

- The broader roadmap does not outrank the catalog-local next pick.
- Reason: this repo slice is still bounded to local execution and comparison work, while the roadmap areas above are all higher-level product bets that depend on the local harness lane staying stable.
- Repo-local helper truth stays the tie-breaker for the next executable item here; the broader roadmap only supplies context, and `queue_reconcile.ts --json` falling back to `seed-next-pending` does not override the larger live maintenance lane.
- Keep both comparison signals visible instead of flattening them: area rank still starts with `Activation And Onboarding`, while the current concrete root-roadmap execution candidate is the remaining `Daily Coding Loop` thread sorting and trimming follow-up, and neither outranks the catalog-local next pass of `portal-engine` smoke refresh.

## Evidence Notes

- Current repo-local planning notes keep the local-first, trust-first lane ahead of broader assistant scope.
- Current queue helper truth is split on purpose: queue structure is clean enough to seed one future pending row, but live maintenance ranking still points at shared smoke-proof refresh first.
- Latest public Cursor signals now split cleanly across two broader roadmap areas: April 29, 2026 adds archive, unarchive, and permanent delete for agent lifecycle control, while May 4, 2026 adds model controls plus spend and usage visibility. That keeps `Daily Coding Loop` and `Usage And Quota Visibility` market-backed without changing their relative order here.
- The shipped thread archive and restore pass is now reflected in [../../../README.md](../../../README.md) and [../../../docs/user-stories.md](../../../docs/user-stories.md), so the remaining lane is narrower thread sorting and trimming.
- The shipped-story inventory in [../../../docs/user-stories.md](../../../docs/user-stories.md) now exists, but this baseline still uses it only as corroboration, not as a new rank override.
- Detailed current-source notes, including recheck dates and external citations, live in [../../.local/kojima/research-game-quality-2026-05-06-deep-web-refresh.md](../../.local/kojima/research-game-quality-2026-05-06-deep-web-refresh.md).
- That memo keeps the queue lead on `verify-smoke`, keeps `docs-rewrite` second, and places later shared bets in this order: `action-certainty-audit`, `compact-screen-readability-smoke.ts`, `settings-and-assists` as a recovery-surface audit, then `probe-load-smoke.ts`.
- The same memo does not promote broader telemetry or event-taxonomy work ahead of those later bets, so the durable comparison stays centered on proof trust first and workflow instrumentation only after the more player-facing lanes.
