# TODO

## Current Product Focus

- Keep coding harness local-first, single-user, plan-first
- Prioritize trust, context control, and fast task startup over broader assistant surfaces
- Increase PMF by making first-task activation faster, daily coding loops tighter, and provider choice less risky
- Keep new features capability-aware, retry-safe, and inspectable instead of silently degrading
- Preserve typed websocket contracts, resumable runs, trace visibility, and worktree safety while making normal flow feel simpler
- Treat roadmap order below as priority order from highest to lowest

## Selected Next Todo

- Ship a run ledger and proof bundle v1 before adding more runtime breadth: every run should show stop reason, last verified state, waiting-on state, next action, key diff or branch links, terminal/test/browser evidence, approval history, and usage/context spikes in one durable review surface

## April 2026 Market Signals

- Treat safe away-from-keyboard execution, durable review artifacts, explicit rule or memory control, preview-to-fix loops, and connector health as must-have coding-harness features, not stretch goals
- Prefer proof-rich execution and recovery over adding more assistant surfaces or persona features
- Keep roadmap focused on workflows that reduce trust breaks: failed setup, lost context, opaque tool failures, invisible background work, and weak rollback or review paths
- Treat spend control, stale-run detection, and phone-friendly review or approval as core trust features because reply patterns keep punishing silent failures and surprise quota burn

## May 2026 Reddit And GitHub Signals

- Treat visible session continuity as a sticky loop: users keep returning when the harness remembers what is done, broken, next, learned, and expensive without forcing them to maintain a sidecar progress file
- Treat context lifecycle as product surface, not invisible prompt plumbing: stale files, verbose old turns, and accidental large reads hurt quality and cost, so compression and eviction need user-visible control
- Treat autonomy as policy presets tied to task risk: read-only planning, trusted-repo auto-run, sandboxed full-run, and explicit risk summaries matter more than one global approval mode
- Treat checkpoint restore as trust-critical only when it is git-safe, disk-bounded, and context-safe; unreliable restore is worse than no restore
- Treat expert subagents as review and planning amplifiers before broad code-writing fanout; users value separate judgment when it stays transparent and scoped

## May 2026 Deep Tooling Market Scan

- Treat a unified local cockpit for many agent runtimes as useful only when setup health, model capability, tool access, run state, and usage exposure are visible before execution starts; T3 Code, Kilo, Cursor, and Hermes all push portability, but user pain keeps clustering around opacity
- Move proof bundles, run ledgers, and stale-run recovery ahead of broader agent surfaces; public Cursor and Kilo threads punish stuck or runaway agents, while T3 and Hermes signals reward workflows that keep terminal output, diffs, branches, messages, and recovery state inspectable
- Promote MCP and tool health into a first-class readiness surface, not a settings drawer; Kilo's marketplace, Cursor MCP demand, and Hermes toolsets show tool breadth matters, but missing auth, remote incompatibility, and degraded browser or shell access must fail early
- Treat remote, mobile, and background work as review-inbox problems before control problems; users value phone-friendly starts and status checks, but only when summaries, branch names, screenshots, approvals, cost state, and stop or resume actions are trustworthy
- Treat memory, skills, and reusable playbooks as governed assets with source, freshness, hit history, and clear update controls; Hermes-style learning loops are sticky, but opaque or over-broad memory would conflict with this harness's local-first trust model
- Source caveat: YouTube signals were gathered from public pages, search snippets, transcripts, and mirrors only; direct comment coverage is incomplete, so GitHub, docs, forums, and Reddit carry more weight

## June 2026 Approval And Autonomy Signals

- Treat "why did this stop?" as the core background-work affordance: every stop needs a typed reason, risk summary, evidence, next action, and the setting that did or did not apply
- Split autonomy policy by gate instead of one broad approval knob: launch approval, plan questions, assistant questions, browser permissions, network or filesystem boundary crossing, and merge/release review need distinct defaults
- First gate split shipped: non-blocking assistant questions have their own auto-approval preference while higher-risk questions still stop
- Make safe auto-run feel magic through proof, not silence: run in isolated work, gather diffs/logs/screenshots/tests, then ask only for the smallest human decision when needed
- Prefer reviewer or classifier handoff for routine safe approvals, but keep exact denial reasons and manual override paths visible so users do not learn to ignore prompts

## June 2026 Deep Harness Audit

- Treat the market center as an agent-ops cockpit, not a chat box: Cursor, Kilo, Hermes, Claude Code, OpenHands, Aider, Cline, and Goose all point toward runs, tools, memory, environment setup, and review artifacts as the sticky surface
- Move liveness, stop, cancel, retry, and stale-run recovery above new agent surfaces; repeated public pain clusters around stuck agents, terminal hangs, blocked startup scripts, missing cancel paths, and unclear "working" states
- Treat target capability as a first-class object: local, WSL, cloud, worktree, self-hosted VM, and container runs need visible support matrices for secrets, MCP, hooks, browser, shell, git, network, and artifact capture
- Make proof bundles the daily review primitive: branch, diff, tests, terminal output, screenshots, videos, browser replay, approvals, and cost/context markers should survive refresh and support phone-friendly review
- Keep checkpoint and rollback narrow until restore is git-safe, disk-bounded, and explainable; public issue patterns show users want restore, but broken checkpoint behavior destroys trust faster than missing checkpoint behavior
- Treat context, rules, memories, and skills as governed assets with source, freshness, scope, and hit history because serious users now mix multiple coding tools and need portable discipline more than opaque auto-memory
- Defer broad remote-control and personal-assistant surfaces; the higher-PMF version is remote review, evidence inspection, approval, stop, retry, and resume for coding runs

## Engine Package Priorities

- P1: Keep root and browser exports restrained until every public primitive has clear consumer proof, strong naming, and a defensible reason to live outside a game-local helper
- P1: Treat packed-artifact consumer proof as the release gate for engine DX, including explicit exports, declaration output, subpath imports, and WASM asset reachability from real package installs
- P1: Make authoritative multiplayer proof real end-to-end before widening MMO claims: joined clients must receive initial state, streamed deltas or snapshots, reconnect-safe baselines, and an example that renders replicated state from the public package surface
- P1: Add package-consumer examples that use published subpaths instead of repo source or dist paths so every getting-started path proves install-time DX, not only monorepo-local wiring
- P1: Grow 3D camera support through `@catalog/engine/render/3d` consumer proof: third-person orbit, smooth follow, chained transitions, framing offsets, and obstacle/deocclusion hooks should feel like a premium default without leaking game-local controls or content into root exports
- P1: Keep performance promises tied to stable evidence: reduce allocation-heavy protocol and interest-grid hot paths before tightening benchmark thresholds, and make perf gates deterministic enough to avoid CI noise
- P2: Preserve generated declaration hygiene; camera declarations are currently green, but every generated surface must stay free of elided `any` leaks before API growth resumes
- P2: Keep WASM boundaries narrow and boring: deterministic TypeScript fallback, MIME-aware streaming fallback, opt-in diagnostics, parity tests, and benchmark gates before any new kernel is admitted
- P2: Split prototype-heavy rendering helpers away from the root mental model; cost metadata helps, but root discovery should emphasize proven loop, input, map, collision, animation, and replication primitives over spectacle helpers
- P2: Add a tiny browser-playable multiplayer client with interpolation, debug stats, and failure readback so server APIs have the same activation proof as canvas/map APIs
- P3: Delay benchmark threshold tightening until migrated games provide real hot-path evidence; synthetic parity remains necessary but should not pretend to be product proof
- P3: Keep native WASM asset-hosting proof documented as a lower-risk release lane, not a reason to widen the runtime surface

## Activation And Onboarding

- Add signed installers, update channels, and polish around portable launcher distribution without pulling the product into a full desktop-shell rewrite
- Deepen doctor and reset flows for stale auth, broken local config, and launcher drift so repair stays explicit after the first successful run
- Expand typed setup and repair coverage for MCP servers, remote targets, and local scripts so unsupported placeholders become real health surfaces
- Keep first-task activation centered on project-open plus task-send flow instead of adding a separate blocking wizard
- Preserve current approval and autonomy defaults while improving setup clarity and recovery

## Daily Coding Loop

- Tighten thread sorting and recent-thread trimming so stale items stay out of the active surface without hiding history
- Clarify which thread visibility changes are manual versus preference-driven, especially when auto-archive is limited to stale or low-activity threads
- Add explicit thread-scoped or project-scoped saved composer presets for mode, agent, provider, and model, while keeping current browser-global restore as default and making preset scope obvious
- Add a global search surface reachable with `Cmd/Ctrl+F` via `TanStack Hotkeys`, with debounced input and tiered streamed results so names, quick matches, and fuzzy matches surface in stages
- Add terminal-first workflow support such as embedded terminals, project scripts, command palette actions, keyboard shortcuts, and searchable branch or run names
- Add one-step handoff into the user's editor and keep active thread or run context attached to that project flow
- Add step-level diff review, incremental change views, and checkpoint restore so users can inspect or roll back agent work before trust is lost
- Add disposable experiment branches with fast compare, promote, and discard flow so risky ideas can be tested without polluting the main checkout or current trusted thread
- Add durable proof bundles for each run or checkpoint so diffs, tests, terminal output, review notes, browser evidence, approvals, and follow-up prompts stay inspectable after refresh or restart
- Add an inspectable session ledger for each thread or run so progress, broken states, next steps, learned rules, context used, and notable token or cost spikes survive across sessions
- Add a tight preview-to-fix loop that can send selected elements, screenshots, console errors, and runtime failures back into the active thread without manual copy-paste
- Add run heartbeat, stale-run detection, and explicit `last verified`, `next step`, and `waiting on` summaries so quiet agents feel inspectable instead of broken
- Keep thread sorting and recent-thread trimming strong so long-lived projects stay navigable
- Keep inspectability high without forcing trace-heavy UI on every normal coding task

## Provider Portability

- Support more bring-your-own-agent backends so users can use existing subscriptions and quotas without switching tools
- Surface provider auth state, runtime availability, discovered models, and capability differences before execution starts
- Surface tool and connector health with the same honesty as model capabilities so missing MCP, browser, git, editor, remote, or runtime dependencies fail before execution instead of mid-run
- Add provider failover and credential rotation so long-running work can survive quota, auth, and transient provider failures without losing session state
- Add clearer provider exhaustion and auth-expiry guidance with explicit fallback or recovery suggestions instead of opaque API errors
- Keep provider selection and model switching honest about missing tools, degraded features, and approval semantics
- Prefer one typed provider contract path instead of provider-specific UI forks

## Background Runs

- Add optional OS-level scheduler bridges so local jobs can continue while desktop harness process is fully closed
- Support Windows Task Scheduler, macOS LaunchAgent, and Linux systemd user service or cron bridges behind explicit opt-in
- Add away-from-desk approval and review inbox flows so another device can inspect evidence, answer approvals, search the relevant branch or run, or resume stopped work without taking over full local control
- Make those away-from-desk review flows artifact-first and phone-friendly so users can approve from summary cards, screenshots, short demos, and diff highlights instead of raw traces
- Replace the single approvals bucket with typed intervention lanes for launch approval, input needed, browser permission, pause, circuit breaker, and failure
- Add inline approve/reject/answer actions to background-run inbox cards, with a visible reason and policy readback before navigating to deep details
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
- Add cross-runtime local usage import where possible so users can compare token burn and spend across bundled CLI runtimes and provider-backed runs from one place
- Add lightweight burn-rate, recursive-call, and remaining-headroom hints during execution so users can decide whether to let an agent keep running
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
- Add context lifecycle controls that recommend compressing, pinning, or evicting stale files and old turns before context bloat becomes cost or quality loss
- Add skill provenance, trust signals, and per-workspace allowlists so reusable automation stays inspectable instead of silently privileged
- Add managed update flows for installed skills with visible source, version, freshness, hit history, and review state
- Keep memory lightweight, inspectable, and editable instead of opaque long-term agent state

## GitHub Operations

- Add issue and pull-request workflows around `pi`
- Support diff-aware review summaries, issue execution, and PR follow-up loops
- Add review-specific rule capture from accepted or dismissed findings so repeated repo feedback can improve future review runs without hiding the reasoning
- Keep repository automation behind explicit opt-in and clear approval points

## Broader Assistant Surfaces

- Revisit voice, Google Workspace, messaging channels, and remote nodes only after coding PMF is stable
- Avoid broad personal-assistant, full IDE clone, and cloud-first execution scope until core harness workflow is clearly sticky

## Non-Goals For Current Phase

- No remote execution by default
- No shared multi-user editing
- No automatic cloud dependency for normal local use
- No full personal-assistant persona stack
