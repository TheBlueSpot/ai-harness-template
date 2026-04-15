# TODO

## Current Product Focus

- Keep coding harness local-first, single-user, plan-first
- Prioritize trust, context control, and fast task startup over broader assistant surfaces
- Increase PMF by making first-task activation faster, daily coding loops tighter, and provider choice less risky
- Keep new features capability-aware, retry-safe, and inspectable instead of silently degrading
- Preserve typed websocket contracts, resumable runs, trace visibility, and worktree safety while making normal flow feel simpler
- Treat roadmap order below as priority order from highest to lowest

## Activation And Onboarding

- Add zero-install and packaged startup paths so new users can reach first task before manual environment wiring
- Tighten first-run onboarding around opening a project and sending a task before deeper provider or settings setup
- Ask users whether they want guided human-in-the-loop flow or more agentic autonomy, then set initial approval and visibility defaults accordingly
- Make setup blockers explicit with concrete next steps instead of silent missing-tool failures
- Add doctor, preflight, and repair flows so updates, broken auth, and bad local config fail with actionable recovery instead of manual debugging
- Preserve local-first defaults while reducing time-to-first-success on Windows, macOS, and Linux

## Daily Coding Loop

- Add terminal-first workflow support such as embedded terminals, project scripts, command palette actions, and keyboard shortcuts
- Add one-step handoff into the user's editor and keep active thread or run context attached to that project flow
- Add step-level diff review, incremental change views, and checkpoint restore so users can inspect or roll back agent work before trust is lost
- Improve thread hygiene with archiving, better sorting, and recent-thread trimming so long-lived projects stay navigable
- Keep inspectability high without forcing trace-heavy UI on every normal coding task

## Provider Portability

- Support more bring-your-own-agent backends so users can use existing subscriptions and quotas without switching tools
- Surface provider auth state, runtime availability, discovered models, and capability differences before execution starts
- Add provider failover and credential rotation so long-running work can survive quota, auth, and transient provider failures without losing session state
- Add clearer provider exhaustion and auth-expiry guidance with explicit fallback or recovery suggestions instead of opaque API errors
- Keep provider selection and model switching honest about missing tools, degraded features, and approval semantics
- Prefer one typed provider contract path instead of provider-specific UI forks

## Background Runs

- Add queued and scheduled runs with pause, stop, retry, and history
- Surface run state, failures, and notifications without requiring live tab focus
- Add pattern-based output watches so users can get notified when long-running jobs hit errors, readiness signals, or other important milestones
- Add system notifications for completion, approval-needed states, and failed long-running work
- Keep safeguards around long-running tasks and external side effects

## Remote Targets

- Add first-class backend targets for local, WSL, and later headless or SSH-backed environments instead of shell-specific hacks
- Support secure pairing and reconnect flows so another device can monitor runs, answer approvals, or resume work
- Add a low-friction remote observer flow for control, approval, and status checks from another machine without exposing broad remote execution by default
- Keep target capabilities explicit in UI copy before users hit path, shell, or toolchain mismatches
- Preserve local-first source of truth even when backend runs outside desktop process

## Usage And Quota Visibility

- Show per-thread or per-run usage when providers expose it so users can understand cost and token burn
- Surface account quota, rate-limit, or credit state in a lightweight status area when providers expose it
- Explain model speed, cost, and capability tradeoffs in selection flows without cluttering the main chat surface
- Degrade gracefully when providers do not expose usage details

## Browser Automation

- Wire an installable browser tool or skill into the new browser session + approval pipeline by default
- Add richer replay artifacts such as screenshots, DOM snapshots, and step-level verification evidence
- Expand approval policy beyond per-step manual gating with read-only auto-allow and stronger risk buckets
- Add dedicated frontend QA flows so browser verification can hand findings back into the coding plan cleanly

## Upload Hygiene / Cleanup

- Add OCR fallback for scan-only PDFs and image-only documents
- Wire attachments into `planning.answer` and `planning.refine` flows, not only new top-level sends
- Add orphan-upload cleanup when users remove unsent attachments or abandon a draft
- Add attachment lifecycle visibility for expired, deleted, or fetch-failed remote files
- Add explicit attachment limits and cleanup policy in UI copy and settings docs

## Markdown Polish

- Reduce visual churn during long streaming markdown responses so live code and prose updates feel steadier under heavy token output

## Workspace Sync

- Add local backup, export, and import flows for threads, settings, skills, and lightweight memory before multi-device sync work
- Evaluate optional multi-device sync only after local workflow and background history are stable
- Keep local SQLite as source of truth during offline work
- Define reconciliation, conflict rules, and visible sync state before any remote rollout

## Memory And Skill Platform

- Expand local modes into reusable skill and playbook distribution
- Support install, import, export, and workspace discovery for custom workflows
- Add skill provenance, trust signals, and per-workspace allowlists so reusable automation stays inspectable instead of silently privileged
- Add managed update flows for installed skills with visible source, version, and review state
- Keep memory lightweight, inspectable, and editable instead of opaque long-term agent state

## GitHub Operations

- Add issue and pull-request workflows around `pi`
- Support diff-aware review summaries, issue execution, and PR follow-up loops
- Keep repository automation behind explicit opt-in and clear approval points

## Broader Assistant Surfaces

- Revisit voice, Google Workspace, messaging channels, and remote nodes only after coding PMF is stable
- Avoid broad personal-assistant scope until core harness workflow is clearly sticky

## Non-Goals For Current Phase

- No remote execution by default
- No shared multi-user editing
- No automatic cloud dependency for normal local use
- No full personal-assistant persona stack
