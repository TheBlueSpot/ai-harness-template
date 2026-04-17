# TODO

## Current Product Focus

- Keep coding harness local-first, single-user, plan-first
- Prioritize trust, context control, and fast task startup over broader assistant surfaces
- Increase PMF by making first-task activation faster, daily coding loops tighter, and provider choice less risky
- Keep new features capability-aware, retry-safe, and inspectable instead of silently degrading
- Preserve typed websocket contracts, resumable runs, trace visibility, and worktree safety while making normal flow feel simpler
- Treat roadmap order below as priority order from highest to lowest

## April 2026 Market Signals

- Treat safe away-from-keyboard execution, durable review artifacts, explicit rule or memory control, preview-to-fix loops, and connector health as must-have coding-harness features, not stretch goals
- Prefer proof-rich execution and recovery over adding more assistant surfaces or persona features
- Keep roadmap focused on workflows that reduce trust breaks: failed setup, lost context, opaque tool failures, invisible background work, and weak rollback or review paths
- Treat spend control, stale-run detection, and phone-friendly review or approval as core trust features because reply patterns keep punishing silent failures and surprise quota burn

## Activation And Onboarding

- Add signed installers, update channels, and polish around portable launcher distribution without pulling the product into a full desktop-shell rewrite
- Deepen doctor and reset flows for stale auth, broken local config, and launcher drift so repair stays explicit after the first successful run
- Expand typed setup and repair coverage for browser tools and MCP servers so unsupported placeholders become real health surfaces
- Keep first-task activation centered on project-open plus task-send flow instead of adding a separate blocking wizard
- Preserve current approval and autonomy defaults while improving setup clarity and recovery

## Daily Coding Loop

- Add explicit thread archive and restore controls, plus auto-archive preferences, so stale threads move out of the active surface without losing history
- Add explicit thread-scoped or project-scoped saved composer presets for mode, agent, provider, and model, while keeping current browser-global restore as default and making preset scope obvious
- Add a global search surface reachable with `Cmd/Ctrl+F` via `TanStack Hotkeys`, with debounced input and tiered streamed results so names, quick matches, and fuzzy matches surface in stages
- Add terminal-first workflow support such as embedded terminals, project scripts, command palette actions, and keyboard shortcuts
- Add one-step handoff into the user's editor and keep active thread or run context attached to that project flow
- Add step-level diff review, incremental change views, and checkpoint restore so users can inspect or roll back agent work before trust is lost
- Add disposable experiment branches with fast compare, promote, and discard flow so risky ideas can be tested without polluting the main checkout or current trusted thread
- Add durable proof bundles for each run or checkpoint so diffs, tests, review notes, browser evidence, and follow-up prompts stay inspectable after refresh or restart
- Add a tight preview-to-fix loop that can send selected elements, screenshots, console errors, and runtime failures back into the active thread without manual copy-paste
- Add run heartbeat, stale-run detection, and explicit `last verified`, `next step`, and `waiting on` summaries so quiet agents feel inspectable instead of broken
- Keep thread sorting and recent-thread trimming strong so long-lived projects stay navigable
- Keep inspectability high without forcing trace-heavy UI on every normal coding task

## Provider Portability

- Support more bring-your-own-agent backends so users can use existing subscriptions and quotas without switching tools
- Surface provider auth state, runtime availability, discovered models, and capability differences before execution starts
- Surface tool and connector health with the same honesty as model capabilities so missing MCP, browser, git, or runtime dependencies fail before execution instead of mid-run
- Add provider failover and credential rotation so long-running work can survive quota, auth, and transient provider failures without losing session state
- Add clearer provider exhaustion and auth-expiry guidance with explicit fallback or recovery suggestions instead of opaque API errors
- Keep provider selection and model switching honest about missing tools, degraded features, and approval semantics
- Prefer one typed provider contract path instead of provider-specific UI forks

## Background Runs

- Add optional OS-level scheduler bridges so local jobs can continue while desktop harness process is fully closed
- Support Windows Task Scheduler, macOS LaunchAgent, and Linux systemd user service or cron bridges behind explicit opt-in
- Add away-from-desk approval and review inbox flows so another device can inspect evidence, answer approvals, or resume stopped work without taking over full local control
- Make those away-from-desk review flows artifact-first and phone-friendly so users can approve from summary cards, screenshots, short demos, and diff highlights instead of raw traces
- Add pattern-based output watches so users can get notified when long-running jobs hit errors, readiness signals, or other important milestones
- Deepen risk summaries around branch, environment, network, and filesystem scope before launch or approval
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
- Add per-run budget caps, soft or hard stop rules, and preflight warnings before long-running work can burn through included usage unexpectedly
- Add lightweight burn-rate and remaining-headroom hints during execution so users can decide whether to let an agent keep running
- Explain model speed, cost, and capability tradeoffs in selection flows without cluttering the main chat surface
- Degrade gracefully when providers do not expose usage details

## Browser Automation

- Wire an installable browser tool or skill into the new browser session + approval pipeline by default
- Add richer replay artifacts such as screenshots, DOM snapshots, and step-level verification evidence
- Expand approval policy beyond per-step manual gating with read-only auto-allow and stronger risk buckets
- Add preview handoff controls so the user can point at broken UI state and send structured browser evidence back into planning or implementation without narrating every detail
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
- Add versioned workspace and repo rules with visible source, last-used signal, and promote-from-chat or review flows instead of opaque auto-memory
- Add a shared execution cache for planner, main agent, and subagents so proven repo heuristics, fallback plans, prompt fragments, and verification recipes can be reused without bloating every live context window
- Keep that shared cache explicit and inspectable with source links, freshness markers, hit history, pin or expire controls, and easy clear or rebuild actions
- Add skill provenance, trust signals, and per-workspace allowlists so reusable automation stays inspectable instead of silently privileged
- Add managed update flows for installed skills with visible source, version, and review state
- Keep memory lightweight, inspectable, and editable instead of opaque long-term agent state

## GitHub Operations

- Add issue and pull-request workflows around `pi`
- Support diff-aware review summaries, issue execution, and PR follow-up loops
- Add review-specific rule capture from accepted or dismissed findings so repeated repo feedback can improve future review runs without hiding the reasoning
- Keep repository automation behind explicit opt-in and clear approval points

## Broader Assistant Surfaces

- Revisit voice, Google Workspace, messaging channels, and remote nodes only after coding PMF is stable
- Avoid broad personal-assistant scope until core harness workflow is clearly sticky

## Non-Goals For Current Phase

- No remote execution by default
- No shared multi-user editing
- No automatic cloud dependency for normal local use
- No full personal-assistant persona stack
