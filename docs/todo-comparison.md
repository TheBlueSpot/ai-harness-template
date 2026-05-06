# Todo Comparison Dossier

## Pending Items

This dossier compares the pending roadmap items in [todo.md](todo.md) using the same lens across the queue: leverage, evidence freshness, blocker severity, dependency risk, implementation scope, and expected catalog impact.

## Comparison Axes

- Leverage: how much one change improves multiple workflows
- Evidence freshness: how directly the item reflects current queue signals and adjacent docs
- Blocker severity: whether the item unblocks other work or removes a hard trust break
- Dependency risk: how many other systems or surfaces it touches
- Implementation scope: how large the delivery surface is
- Catalog impact: how visibly the item improves day-to-day use across entries

## Per-Item Assessment

### Current Product Focus

- Keep coding harness local-first, single-user, plan-first: not a delivery item; it is the constraint set that keeps the rest of the queue coherent.
- Prioritize trust, context control, and fast task startup over broader assistant surfaces: highest-level steering signal; it favors all activation, runs, and memory work.
- Increase PMF by making first-task activation faster, daily coding loops tighter, and provider choice less risky: broad strategy signal with strong leverage, but it depends on downstream queue items.
- Keep new features capability-aware, retry-safe, and inspectable instead of silently degrading: cross-cutting trust rule; high leverage and high evidence freshness.
- Preserve typed websocket contracts, resumable runs, trace visibility, and worktree safety while making normal flow feel simpler: foundational guardrail, especially for risky run and worktree changes.
- Treat roadmap order below as priority order from highest to lowest: ordering rule, not a candidate item.

### April 2026 Market Signals

- Treat safe away-from-keyboard execution, durable review artifacts, explicit rule or memory control, preview-to-fix loops, and connector health as must-have coding-harness features, not stretch goals: strong evidence freshness and direct alignment with trust surfaces.
- Prefer proof-rich execution and recovery over adding more assistant surfaces or persona features: pushes low-risk, inspectable workflow work ahead of expansion work.
- Keep roadmap focused on workflows that reduce trust breaks: failed setup, lost context, opaque tool failures, invisible background work, and weak rollback or review paths: high leverage because it describes the queue’s common failure modes.
- Treat spend control, stale-run detection, and phone-friendly review or approval as core trust features because reply patterns keep punishing silent failures and surprise quota burn: high urgency for trust and background work, moderate scope.

### May 2026 Reddit And GitHub Signals

- Treat visible session continuity as a sticky loop: users keep returning when the harness remembers what is done, broken, next, learned, and expensive without forcing them to maintain a sidecar progress file: very high leverage across runs, threads, and memory.
- Treat context lifecycle as product surface, not invisible prompt plumbing: stale files, verbose old turns, and accidental large reads hurt quality and cost, so compression and eviction need user-visible control: high urgency, especially for long-lived sessions.
- Treat autonomy as policy presets tied to task risk: read-only planning, trusted-repo auto-run, sandboxed full-run, and explicit risk summaries matter more than one global approval mode: medium scope, strong trust impact.
- Treat checkpoint restore as trust-critical only when it is git-safe, disk-bounded, and context-safe; unreliable restore is worse than no restore: high blocker severity because unsafe restore erodes confidence.
- Treat expert subagents as review and planning amplifiers before broad code-writing fanout; users value separate judgment when it stays transparent and scoped: moderate scope, good leverage, but dependent on clear orchestration.

### May 2026 Deep Tooling Market Scan

- Treat a unified local cockpit for many agent runtimes as useful only when setup health, model capability, tool access, run state, and usage exposure are visible before execution starts: broad ambition, but lower priority than making the existing core safer and clearer.
- Move proof bundles, run ledgers, and stale-run recovery ahead of broader agent surfaces; public Cursor and Kilo threads punish stuck or runaway agents, while T3 and Hermes signals reward workflows that keep terminal output, diffs, branches, messages, and recovery state inspectable: high leverage and strong evidence freshness.
- Promote MCP and tool health into a first-class readiness surface, not a settings drawer; Kilo's marketplace, Cursor MCP demand, and Hermes toolsets show tool breadth matters, but missing auth, remote incompatibility, and degraded browser or shell access must fail early: high blocker severity because broken tools waste launch time.
- Treat remote, mobile, and background work as review-inbox problems before control problems; users value phone-friendly starts and status checks, but only when summaries, branch names, screenshots, approvals, cost state, and stop or resume actions are trustworthy: medium-high leverage, but gated by trust artifacts.
- Treat memory, skills, and reusable playbooks as governed assets with source, freshness, hit history, and clear update controls; Hermes-style learning loops are sticky, but opaque or over-broad memory would conflict with this harness's local-first trust model: high leverage once foundation surfaces are stable.
- Source caveat: YouTube signals were gathered from public pages, search snippets, transcripts, and mirrors only; direct comment coverage is incomplete, so GitHub, docs, forums, and Reddit carry more weight: evidence qualifier, not a queue item.

### Activation And Onboarding

- Add signed installers, update channels, and polish around portable launcher distribution without pulling the product into a full desktop-shell rewrite: useful distribution work, but lower immediate leverage than activation and recovery.
- Deepen doctor and reset flows for stale auth, broken local config, and launcher drift so repair stays explicit after the first successful run: high blocker severity because it restores broken installs.
- Expand typed setup and repair coverage for MCP servers, remote targets, and local scripts so unsupported placeholders become real health surfaces: good leverage and strong dependency value, especially for external integrations.
- Keep first-task activation centered on project-open plus task-send flow instead of adding a separate blocking wizard: very high leverage; it protects activation speed and avoids unnecessary friction.
- Preserve current approval and autonomy defaults while improving setup clarity and recovery: stable foundation work, but mostly dependent on surrounding guidance and health surfaces.

### Daily Coding Loop

- Add explicit thread archive and restore controls, plus auto-archive preferences, so stale threads move out of the active surface without losing history: high leverage for navigation and continuity.
- Add explicit thread-scoped or project-scoped saved composer presets for mode, agent, provider, and model, while keeping current browser-global restore as default and making preset scope obvious: medium-high leverage, but scope clarity matters.
- Add a global search surface reachable with `Cmd/Ctrl+F` via `TanStack Hotkeys`, with debounced input and tiered streamed results so names, quick matches, and fuzzy matches surface in stages: high catalog impact, moderate implementation scope.
- Add terminal-first workflow support such as embedded terminals, project scripts, command palette actions, keyboard shortcuts, and searchable branch or run names: broad leverage, but larger scope and more dependency risk.
- Add one-step handoff into the user's editor and keep active thread or run context attached to that project flow: high PMF leverage if editor bridging is reliable.
- Add step-level diff review, incremental change views, and checkpoint restore so users can inspect or roll back agent work before trust is lost: very high trust leverage and strong blocker reduction.
- Add disposable experiment branches with fast compare, promote, and discard flow so risky ideas can be tested without polluting the main checkout or current trusted thread: strong safety and experimentation leverage.
- Add durable proof bundles for each run or checkpoint so diffs, tests, terminal output, review notes, browser evidence, approvals, and follow-up prompts stay inspectable after refresh or restart: one of the highest-leverage trust items.
- Add an inspectable session ledger for each thread or run so progress, broken states, next steps, learned rules, context used, and notable token or cost spikes survive across sessions: high leverage and strong freshness for continuity.
- Add a tight preview-to-fix loop that can send selected elements, screenshots, console errors, and runtime failures back into the active thread without manual copy-paste: very high leverage for frontend and browser-heavy workflows.
- Add run heartbeat, stale-run detection, and explicit `last verified`, `next step`, and `waiting on` summaries so quiet agents feel inspectable instead of broken: high blocker reduction and strong trust visibility.
- Keep thread sorting and recent-thread trimming strong so long-lived projects stay navigable: smaller scope, but important hygiene for the active surface.
- Keep inspectability high without forcing trace-heavy UI on every normal coding task: design guardrail, not a standalone delivery target.

### Provider Portability

- Support more bring-your-own-agent backends so users can use existing subscriptions and quotas without switching tools: medium-high leverage, but broader and riskier than core trust work.
- Surface provider auth state, runtime availability, discovered models, and capability differences before execution starts: high blocker reduction; it prevents opaque launch failures.
- Surface tool and connector health with the same honesty as model capabilities so missing MCP, browser, git, editor, remote, or runtime dependencies fail before execution instead of mid-run: very high urgency and strong cross-cutting value.
- Add provider failover and credential rotation so long-running work can survive quota, auth, and transient provider failures without losing session state: high trust value, but dependency-heavy.
- Add clearer provider exhaustion and auth-expiry guidance with explicit fallback or recovery suggestions instead of opaque API errors: medium-high leverage, smaller scope than failover.
- Keep provider selection and model switching honest about missing tools, degraded features, and approval semantics: important guardrail that protects trust in selection flows.
- Prefer one typed provider contract path instead of provider-specific UI forks: strong architecture simplifier, but more of an implementation discipline than a user-visible feature.

### Background Runs

- Add optional OS-level scheduler bridges so local jobs can continue while desktop harness process is fully closed: high value for background continuity, but only after the local flow is stable.
- Support Windows Task Scheduler, macOS LaunchAgent, and Linux systemd user service or cron bridges behind explicit opt-in: broad portability, but high dependency risk.
- Add away-from-desk approval and review inbox flows so another device can inspect evidence, answer approvals, search the relevant branch or run, or resume stopped work without taking over full local control: high leverage if evidence artifacts are already strong.
- Make those away-from-desk review flows artifact-first and phone-friendly so users can approve from summary cards, screenshots, short demos, and diff highlights instead of raw traces: strong evidence-backed fit with current market signals.
- Add pattern-based output watches so users can get notified when long-running jobs hit errors, readiness signals, or other important milestones: medium scope, useful once run visibility exists.
- Deepen risk summaries around branch, environment, network, and filesystem scope before launch or approval: strong trust support, especially for remote or background launches.
- Keep safeguards around long-running tasks and external side effects: guardrail statement, not a candidate item.

### Remote Targets

- Add first-class backend targets for local, WSL, and later headless or SSH-backed environments instead of shell-specific hacks: high leverage for portability, but broader scope.
- Support secure pairing and reconnect flows so another device can monitor runs, answer approvals, or resume work: high trust value, especially with background work.
- Add a low-friction remote observer flow for control, approval, and status checks from another machine without exposing broad remote execution by default: medium-high leverage, but must stay cautious about scope.
- Keep target capabilities explicit in UI copy before users hit path, shell, or toolchain mismatches: cheap trust win with immediate diagnostic value.
- Preserve local-first source of truth even when backend runs outside desktop process: foundational constraint for the whole remote surface.

### Usage And Quota Visibility

- Show per-thread or per-run usage when providers expose it so users can understand cost and token burn: high leverage because it supports trust in every long run.
- Surface account quota, rate-limit, or credit state in a lightweight status area when providers expose it: high blocker reduction for launch decisions.
- Add per-run budget caps, soft or hard stop rules, and preflight warnings before long-running work can burn through included usage unexpectedly: very high trust and spend-control value.
- Add cross-runtime local usage import where possible so users can compare token burn and spend across bundled CLI runtimes and provider-backed runs from one place: useful comparison work, but depends on provider support.
- Add lightweight burn-rate, recursive-call, and remaining-headroom hints during execution so users can decide whether to let an agent keep running: high operational value, medium implementation scope.
- Explain model speed, cost, and capability tradeoffs in selection flows without cluttering the main chat surface: strong selection clarity with low UI risk.
- Degrade gracefully when providers do not expose usage details: guardrail, not a separate feature.

### Browser Automation

- Wire an installable browser tool or skill into the new browser session + approval pipeline by default: high leverage for browser-centric verification, but integration-heavy.
- Add richer replay artifacts such as screenshots, DOM snapshots, and step-level verification evidence: very high leverage because it feeds review, bug fix, and proof flows.
- Expand approval policy beyond per-step manual gating with read-only auto-allow and stronger risk buckets: useful, but only once the pipeline is trustworthy.
- Add preview handoff controls so the user can point at broken UI state and send structured browser evidence back into planning or implementation without narrating every detail: high PMF value and strong feedback-loop leverage.
- Add dedicated frontend QA flows so browser verification can hand findings back into the coding plan cleanly: good catalog impact, but dependent on the evidence pipeline.

### Upload Hygiene / Cleanup

- Add OCR fallback for scan-only PDFs and image-only documents: targeted capability lift, useful when attachment workflows expand.
- Wire attachments into `planning.answer` and `planning.refine` flows, not only new top-level sends: medium-high leverage for continuity and context retention.
- Add orphan-upload cleanup when users remove unsent attachments or abandon a draft: hygiene item with moderate user-visible impact.
- Add attachment lifecycle visibility for expired, deleted, or fetch-failed remote files: useful trust work because it reduces silent attachment failure.
- Add explicit attachment limits and cleanup policy in UI copy and settings docs: low scope, good support value.

### Markdown Polish

- Reduce visual churn during long streaming markdown responses so live code and prose updates feel steadier under heavy token output: narrow UI polish item with low dependency risk.

### Workspace Sync

- Add local backup, export, and import flows for threads, settings, skills, and lightweight memory before multi-device sync work: high leverage as a safety and migration base.
- Evaluate optional multi-device sync only after local workflow and background history are stable: sequencing rule, not an immediate feature.
- Keep local SQLite as source of truth during offline work: foundation constraint for sync and recovery.
- Define reconciliation, conflict rules, and visible sync state before any remote rollout: high blocker severity for any future sync feature.

### Memory And Skill Platform

- Expand local modes into reusable skill and playbook distribution: high leverage if it stays scoped and inspectable.
- Support install, import, export, and workspace discovery for custom workflows: strong ecosystem value, moderate scope.
- Add versioned workspace and repo rules with visible source, last-used signal, and promote-from-chat or review flows instead of opaque auto-memory: very high trust value and strong evidence freshness.
- Add a shared execution cache for planner, main agent, and subagents so proven repo heuristics, fallback plans, prompt fragments, and verification recipes can be reused without bloating every live context window: high leverage, but architecture-heavy.
- Keep that shared cache explicit and inspectable with source links, freshness markers, hit history, pin or expire controls, and easy clear or rebuild actions: critical for trust if cache reuse expands.
- Add context lifecycle controls that recommend compressing, pinning, or evicting stale files and old turns before context bloat becomes cost or quality loss: directly aligned with current context-pressure signals.
- Add skill provenance, trust signals, and per-workspace allowlists so reusable automation stays inspectable instead of silently privileged: high blocker reduction for safe reuse.
- Add managed update flows for installed skills with visible source, version, freshness, hit history, and review state: strong operational hygiene, medium scope.
- Keep memory lightweight, inspectable, and editable instead of opaque long-term agent state: top-level design constraint for the whole platform.

### GitHub Operations

- Add issue and pull-request workflows around `pi`: useful external workflow expansion, but not as central as local coding loop work.
- Support diff-aware review summaries, issue execution, and PR follow-up loops: medium-high leverage for collaboration and review.
- Add review-specific rule capture from accepted or dismissed findings so repeated repo feedback can improve future review runs without hiding the reasoning: strong compounding value if review work grows.
- Keep repository automation behind explicit opt-in and clear approval points: trust guardrail that should stay intact.

### Broader Assistant Surfaces

- Revisit voice, Google Workspace, messaging channels, and remote nodes only after coding PMF is stable: intentionally deferred, low immediate priority.
- Avoid broad personal-assistant, full IDE clone, and cloud-first execution scope until core harness workflow is clearly sticky: top-level boundary that keeps the queue focused.

### Non-Goals For Current Phase

- No remote execution by default: hard constraint.
- No shared multi-user editing: hard constraint.
- No automatic cloud dependency for normal local use: hard constraint.
- No full personal-assistant persona stack: hard constraint.

## Relative Ordering Signals

- Highest urgency: setup health, tool health, first-task activation, durable proof bundles, run/session visibility, usage visibility, and checkpoint or restore safety.
- Highest leverage: items that improve the whole loop at once, especially session continuity, proof artifacts, context lifecycle control, and preview-to-fix feedback.
- Highest blocker severity: anything that prevents a user from trusting a run, recovering from failure, or seeing why work stopped.
- Highest dependency risk: provider portability, remote targets, background runs, browser automation, and multi-device sync.
- Lowest scope with quick payoff: archive/restore hygiene, quota copy, attachment lifecycle visibility, markdown stability, and explicit capability copy.
- Best near-term catalog impact: items that remove friction from the active daily loop before adding new surfaces, especially activation, run inspection, and safe recovery.
- Best deferred bets: broader assistant surfaces, remote-by-default behavior, full sync, and large expansion of persona or IDE-like scope.

