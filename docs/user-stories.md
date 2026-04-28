# User Stories

Canonical product-behavior inventory for the harness. Every shipped capability in [README.md](../README.md) and every roadmap bullet in [todo.md](todo.md) maps to one `US-*` entry here. [coverage-matrix.md](coverage-matrix.md) tracks which stories have tests and where the gaps are.

Story IDs are stable. When behavior changes, update the matching story in the same change. See the `User Stories And Coverage` section of [../.agents/skills/update-harness/SKILL.md](../.agents/skills/update-harness/SKILL.md).

Format: `US-<AREA>-<NNN>: As a <role>, I <capability> so that <outcome>. (source)`

Roles: `user`, `developer`, `reviewer`.

## Area Index

### Shipped (from README.md)

| Area | Count |
|------|------:|
| WORKSPACE | 9 |
| THREADS | 9 |
| PLANNING | 10 |
| RUNS | 13 |
| PROVIDERS | 7 |
| RUNTIMES | 6 |
| WORKTREE | 8 |
| ATTACHMENTS | 4 |
| MODES | 7 |
| ASSISTANTS | 4 |
| JOBS | 4 |
| NOTIFICATIONS | 3 |
| BROWSER | 3 |
| ACTIVATION | 6 |
| UI | 19 |
| PERSISTENCE | 15 |
| PREFERENCES | 3 |
| DEV | 26 |
| SEARCH | 2 |
| MARKDOWN | 2 |

### Roadmap (from docs/todo.md)

| Area | Count |
|------|------:|
| ACTIVATION-ROADMAP | 5 |
| THREADS-ROADMAP | 2 |
| PREFERENCES-ROADMAP | 1 |
| SEARCH-ROADMAP | 1 |
| UI-ROADMAP | 4 |
| RUNS-ROADMAP | 3 |
| WORKTREE-ROADMAP | 1 |
| PROVIDERS-ROADMAP | 13 |
| JOBS-ROADMAP | 7 |
| RUNTIMES-ROADMAP | 5 |
| BROWSER-ROADMAP | 5 |
| ATTACHMENTS-ROADMAP | 5 |
| MARKDOWN-ROADMAP | 1 |
| PERSISTENCE-ROADMAP | 4 |
| MODES-ROADMAP | 4 |
| PLANNING-ROADMAP | 4 |
| WORKSPACE-ROADMAP | 4 |

---

## Shipped

### WORKSPACE

US-WORKSPACE-001: As a user, I use a multi-project workspace where each project root keeps its own local chat history and multiple switchable threads so that work stays separated by repo or folder. (README L8)

US-WORKSPACE-002: As a user, I start from an empty workspace with no synthetic default project so that I only see projects I explicitly add. (README L9)

US-WORKSPACE-003: As a user, I map each project to a validated local folder path so that paths are trustworthy before chat or runs proceed. (README L55)

US-WORKSPACE-004: As a user, I open a project at the repository root or a nested folder inside a larger git repository so that monorepos and subfolders work naturally. (README L56)

US-WORKSPACE-005: As a user, I return to an empty workspace after removing the final project so that "no project open" is a normal state. (README L57)

US-WORKSPACE-006: As a user, I activate an already-open project directly through the switcher instead of getting a fresh thread so that context-switching preserves my current thread. (README L61)

US-WORKSPACE-007: As a user, I browse folders through a typed backend bridge that never puts raw shell commands on the websocket so that browsing stays safe and structured. (README L80)

US-WORKSPACE-008: As a user, I get project open flows that resolve through one typed result path whether the root is new or already known. (README L81)

US-WORKSPACE-009: As a user, I see project open responses that say whether a new project was created or an existing project was reopened with a new thread so that UI reflects what actually happened. (README L160)

### THREADS

US-THREADS-001: As a user, I keep multiple named threads per project with one selected active thread so that I can hold parallel conversations in the same repo. (README L58)

US-THREADS-002: As a user, I create a blank thread in the same project and switch to it immediately with "New thread" so that starting fresh is one click. (README L59)

US-THREADS-003: As a user, I reopen an already-known project root and get a fresh thread created and activated instead of an error so that reopen always moves me forward. (README L60)

US-THREADS-004: As a user, I fork a thread with pi-fork that clones only the source transcript and leaves run state, traces, errors, and drafts behind so that branches are clean. (README L62)

US-THREADS-005: As a user, I see thread titles auto-generated from the first user message until I rename them so that threads stay identifiable without manual labeling. (README L63)

US-THREADS-006: As a user, I see the active chat header show the thread title, support inline rename, and expose a copyable thread id so that I can reference threads elsewhere. (README L64)

US-THREADS-007: As a user, I switch projects and threads while another thread keeps streaming in the background so that long runs do not block navigation; only destructive removal stays blocked during active execution. (README L68)

US-THREADS-008: As a user, I see high-signal lifecycle run milestones stream through one live tail message during active work and then persist as compact phase rows before the final assistant answer, with raw tool chatter hidden, so that run history is readable in context. (README L67)

US-THREADS-009: As a user, I see thread badges summarize status as purple User Input, orange Planning, yellow Executing, red Error, green Done so that I can scan a project at a glance. (README L66)

### PLANNING

US-PLANNING-001: As a user, I use a shared local memory bank for planner, main executor, and subagents with bounded retrieval cards so proven context reuses without dumping raw cache into every prompt. (README L31)

US-PLANNING-002: As a user, I answer interactive planning questions that pause execution until I reply, with three typed quick options and one recommended path so that clarification is fast and structured. (README L35)

US-PLANNING-003: As a user, I rely on plan-first execution that persists a full execution plan, posts a durable plan summary into chat, and lets ready cards execute the stored run by id so that I can review before the agent acts. (README L37)

US-PLANNING-004: As a user, I open transcript-level plan summary cards and reach the shared plan modal from chat or trace so that the plan stays one click away while I read the thread. (README L44)

US-PLANNING-005: As a user, I get workspace and project instruction context with lightweight working-memory summaries feeding planning and execution so that the harness respects how I want this repo worked. (README L43)

US-PLANNING-006: As a developer, I see planner-ready and planner-question transcript messages stop reporting `isStreaming` before the UI accepts refinement or answer input so that composer affordances become enabled at the right moment. (README L137)

US-PLANNING-007: As a developer, I see repeated clarification turns scope planner-question ids per run so that later runs in the same thread do not collide with older pending or answered questions. (README L152)

US-PLANNING-008: As a user, I replace a ready plan through a typed `planning.refine` command that starts a fresh planning cycle in the same thread so that I can redirect without losing thread history. (README L159)

US-PLANNING-009: As a user, I open one execution plan modal from chat or trace that lays out summary, prerequisites, bucket strategy, isolation mode, contracts, verification scope, and correctness history so that I can review the full contract before and during execution. (README L110)

US-PLANNING-010: As a user, I rely on shared setup work modeled as prerequisites that finish before any subagent fan-out starts so that parallel work does not begin on unfinished foundations. (README L170)

### RUNS

US-RUNS-001: As a user, I pause and resume workspace-global execution so that new launches and follow-up asks block until I resume, while in-flight work continues. (README L21, L36)

US-RUNS-002: As a user, I get resumable partial subagent runs whose plan cards show durable Resume state after failure or stop so that I can continue without redoing work. (README L47)

US-RUNS-003: As a user, I retry full runs and individual subagents persistently from durable run state, including failed and successful plan cards, so that iteration is cheap. (README L48)

US-RUNS-004: As a user, I manually refresh active runs and active subagents, with deferred refresh while work is still streaming so that I can pull fresh state on demand. (README L49)

US-RUNS-005: As a user, I get a dirty-git preflight with configurable chat-run restriction and tracked-plus-untracked threshold so that risky runs fail before they start. (README L50)

US-RUNS-006: As a user, I see a new top-level task or plan refinement clear prior transient traces, plan cards, countdown, and context snapshots for that thread so that follow-up runs do not inherit stale execution noise. (README L78)

US-RUNS-007: As a user, I see a run cockpit that includes virtual-branch experiment review, promote, and discard actions plus a shared memory tab so that experiment lifecycle lives with the run. (README L101)

US-RUNS-008: As a developer, I trigger plan execution through a typed `run.execute` command after plan presentation, not as an implicit side effect of `chat.send`. (README L158)

US-RUNS-009: As a developer, I trigger run lifecycle commands (execute, resume, retry, refresh, preflight) through typed websocket contracts. (README L161, L165)

US-RUNS-010: As a user, I see workspace-global execution pause and resume propagate to every connected client through a shared execution-control event so that clients stay in sync. (README L162)

US-RUNS-011: As a user, I get a post-merge correctness review that checks the delivered workspace against the frozen plan, catches obvious runnable or quality gaps, and can queue a corrective plan-first follow-up iteration. (README L180)

US-RUNS-012: As a user, I see a live context usage meter sourced from pi session context stats so that I know how close I am to compaction. (README L51)

US-RUNS-013: As a user, I get deferred planner questions, assistant questions, and browser approvals queued during global pause and released on resume so that nothing gets dropped. (README L21)

US-RUNS-014: As a user, I get a clear non-git repair choice before dirty-git-protected runs so that I can initialize git, disable the preference, or cancel instead of hitting a hidden failure. (README L50)

### PROVIDERS

US-PROVIDERS-001: As a user, I see capability-aware model metadata so the UI explains tool, vision, browser, context, speed, and cost expectations before execution starts. (README L17)

US-PROVIDERS-002: As a user, I get runtime-aware model selection so Codex CLI sticks to Codex-compatible GPT choices for planning and execution, and stale unsupported picks fall back before a run starts. (README L18)

US-PROVIDERS-003: As a user, I get brand-aware defaults for GPT or Gemini execution so first-run behavior matches the provider I selected. (README L27)

US-PROVIDERS-004: As a user, I get Gemini planning defaulting to `google/gemini-3-flash-preview` so planning stays fast on that provider. (README L28)

US-PROVIDERS-005: As a user, I get spawned subagents dropping to the cheapest runtime-compatible sibling in the same model family and inheriting fast mode when supported so parallel work stays aligned with the chosen model while keeping cost in check. (README L29)

US-PROVIDERS-006: As a user, I persist OpenAI and Google API keys plus provider brand preference locally for this machine so that setup survives restart. (README L69)

US-PROVIDERS-007: As a user, I see provider brand switching gated by matching saved key presence so that I cannot enter a broken state. (README L150)

### RUNTIMES

US-RUNTIMES-001: As a user, I pick from multiple agent runtimes: pi, GitHub Copilot CLI, and Codex CLI so that I can use the agent that fits the task. (README L10)

US-RUNTIMES-002: As a user, I get Codex CLI noninteractive runs through the bundled official Codex SDK and CLI with live web search plus writable shell network access, keep review mode prompt-driven inside the harness instead of special native review routing, and on Windows writable runs auto-use full access because bundled Codex currently downgrades `workspace-write` to read-only there while read-only tasks stay sandboxed. (README L19)

US-RUNTIMES-003: As a user, I use optional live CLI sessions for Copilot CLI and Codex CLI over Bun-managed piped transport with attach tokens, reconnect, and follow-up capture so that terminal-style agents stay inspectable. (README L39)

US-RUNTIMES-004: As a developer, I see thread continuity stay harness-owned even for CLI runtimes so fresh CLI invocations rebuild context from persisted transcript and plan state. (README L151)

US-RUNTIMES-005: As a developer, I see live CLI sessions run behind typed lifecycle commands while terminal bytes flow through a separate short-lived attach channel so that control and data planes stay separated. (README L166)

US-RUNTIMES-006: As a user, I use one composer dropdown for reasoning effort and fast mode, see unsupported options stay visible but disabled, and get runtime-specific honoring across Pi GPT, Gemini effort, and Codex CLI direct-or-fallback execution so that model control stays explicit without guesswork. (README L108, L151)

### WORKTREE

US-WORKTREE-001: As a user, I run risky work on run-only virtual experiment branches via BranchFS-style isolated mounts so that execution stays off physical disk until I promote. (README L30)

US-WORKTREE-002: As a user, I rely on isolated BranchFS subagent mounts so that parallel coding tasks do not mutate one checkout in place. (README L32)

US-WORKTREE-003: As a developer, I replay isolated subagent results inside a separate BranchFS integration mount, verify there, and flush only after success so that failed integration does not dirty the host checkout. (README L33)

US-WORKTREE-004: As a user, I default to same-worktree subagent mode when contracts path-split cleanly, fan those subtasks out in parallel until owned paths overlap, and serialize ambiguous same-worktree work so execution speed matches real path safety. (README L172)

US-WORKTREE-005: As a user, I drive subagent work with contracts (prerequisites, owned paths, scoped verification, merge notes) instead of freeform subtask text so that parallel or serialized same-worktree work is enforceable. (README L169)

US-WORKTREE-006: As a user, I replay subagent edits inside a separate BranchFS integration mount when isolated mode is selected; same-worktree mode reports contract drift back to main correctness review without discarding useful worker edits. (README L175)

US-WORKTREE-007: As a user, I keep repo-level context available when my project points at a nested folder while execution stays scoped to the selected project folder so that subagents understand both cwd and repo-root files. (README L176)

US-WORKTREE-008: As a user, I still fan out subagent work in repositories with no commits yet using ephemeral snapshot state so that greenfield repos are usable. (README L173)

US-WORKTREE-009: As a user, I see same-worktree scaffold and import-root work run before dependent sibling subagents so parallel work does not read missing files. (README L174)

US-WORKTREE-010: As a user, I see subagents avoid visible browser or dev-server verification, guessed skill paths, unnecessary media conversion probes, and brittle Windows search quoting so background work stays focused. (README L176)

### ATTACHMENTS

US-ATTACHMENTS-001: As a user, I attach screenshots, PDFs, and text or office-doc specs through UploadThing-backed attachments that persist with chat history and route into prompts. (README L16)

US-ATTACHMENTS-002: As a user, I see composer support for attachment chips, UploadThing upload flow, vision-aware image gating by selected model, and document ingestion for PDF, DOCX, XLSX, PPTX, and ODT on new top-level tasks. (README L107)

US-ATTACHMENTS-003: As a developer, I see chat message persistence include uploaded attachment metadata while planner and execution stages resolve remote image, text, and supported document context on demand. (README L156)

US-ATTACHMENTS-004: As a developer, I use runtime-safe PDF handling on the server so that Bun development startup does not depend on browser-only globals. (README L157)

### MODES

US-MODES-001: As a user, I use built-in workflow modes for asking, planning, implementing, debugging, and review, plus local custom modes at workspace or project scope. (README L26)

US-MODES-002: As a user, I see obvious low-complexity workspace actions such as direct file or folder requests, plus correction-style follow-ups that refine where the edit should land, auto-switch into implement mode and skip planner turn-taking, and simple leading-slash task paths like `/breakout` normalize to workspace-relative targets when the request is clearly local. (README L38)

US-MODES-003: As a user, I get built-in modes with different confirmation defaults: plan stays approval-first, ask suppresses transcript plan cards for direct Q&A, and implement auto-runs unless the frozen plan fans out to multiple subagents. (README L40)

US-MODES-004: As a user, I see composer input auto-switch built-in modes when message intent is clear enough, using recent thread context to repair correction follow-ups, so direct questions, review requests, debugging prompts, planning asks, and local workspace edits do not depend only on stale sticky mode state, while an explicit manual mode selection stays pinned for that send. (README L41)

US-MODES-005: As a developer, I see mode selection, rule sources, and memory summaries travel through typed contracts and persist with workspace state. (README L154)

US-MODES-006: As a developer, I see built-in modes as policy presets, not separate pipelines: ask and plan bias toward read-heavy planning, execution access is configured separately from that intent, implement biases toward delivery, debug biases toward root-cause, and review biases toward findings-first. (README L155)

US-MODES-007: As a developer, I see the UI send typed project and chat commands only so that modes stay behind a narrow contract. (README L153)

### ASSISTANTS

US-ASSISTANTS-001: As a user, I use local assistant operators with named personas, role prompts, project or global scope, synced routing defaults, chat-addressable actions from project chat, assistant-owned background job creation, pause and resume controls, chat, todo lists, learnings, open questions, clone-to-project flow, and high-level plus deep-debug logs. (README L24)

US-ASSISTANTS-002: As a user, I get a dedicated Assistants surface that keeps assistant chat, todos, questions, learnings, logs, and assistant-owned jobs inspectable outside normal project chat. (README L103)

US-ASSISTANTS-003: As a developer, I see assistant state persist locally in SQLite, including canonical thread memory summaries, active todo list, learnings, pending questions, structured logs, and assistant-linked background jobs. (README L144)

US-ASSISTANTS-004: As a user, I see assistant-owned jobs share the same scheduler path while assistant circuit breakers can auto-pause failing assistants and surface blocking questions for user intervention. (README L179)

US-ASSISTANTS-005: As a user, assistant operators make reasonable assumptions, suppress duplicate or already-answered questions, and keep working on useful async tasks unless a high-confidence blocker truly needs my input.

### JOBS

US-JOBS-001: As a user, I use local scheduled tasks and background jobs with durable SQLite history, startup catch-up, approval policy defaults, hidden automation threads, and a dedicated inbox surface. (README L22)

US-JOBS-002: As a user, I use the Jobs tab to inspect scheduled work, approval-needed runs, failures, and concise execution milestones outside normal project chat threads. (README L102)

US-JOBS-003: As a user, I see background AI runs that need clarification pause in awaiting-user-input instead of failing and surface their prompts through the shared inbox flow. (README L177)

US-JOBS-004: As a user, I see scheduled jobs persist separately from user chat and can promote finished AI runs into reusable routines with explicit schedules. (README L178)

### NOTIFICATIONS

US-NOTIFICATIONS-001: As a user, I use a header-level notification inbox for deferred planner questions, assistant questions, browser approvals, and passive background-run status updates. (README L23, L89)

US-NOTIFICATIONS-002: As a developer, I see notification inbox state travel as a typed websocket payload with durable local persistence, unread counts, and explicit read or archive commands. (README L164)

US-NOTIFICATIONS-003: As a user, I see shared popovers (including the inbox) render through a portal-backed primitive so compact overlays do not get clipped by parent overflow or expand parent layout. (README L93)

### BROWSER

US-BROWSER-001: As a user, I use typed browser session tracking with explicit per-step approval gates when browser-capable tools are active. (README L20)

US-BROWSER-002: As a user, I see the trace panel surface browser activity, pending approvals, replay snippets, and lightweight verification results when a run touches browser tools. (README L110)

US-BROWSER-003: As a developer, I see browser approval decisions use a typed websocket command and persist on the active run record. (README L163)

### ACTIVATION

US-ACTIVATION-001: As a user, I get a bootstrap-first startup path for source users plus portable Bun launcher packaging for release users. (README L12)

US-ACTIVATION-002: As a user, I see runtime health visibility so install, auth, and degraded interactive support show before a run starts. (README L13)

US-ACTIVATION-003: As a user, I use a shared activation checklist that keeps first-run setup inside the main chat cockpit instead of a blocking wizard. (README L14, L86, L87)

US-ACTIVATION-004: As a user, I open guided help tutorials with spotlight overlays for opening a project, connecting provider/runtime, sending the first task, and reviewing plans. (README L15, L104)

US-ACTIVATION-005: As a user, I use a shared project switcher dialog that replaces duplicated add-path inputs across sidebar and first-run onboarding. (README L88)

US-ACTIVATION-006: As a developer, I see setup health be server-derived per machine while tutorial progress and dismissal state stay local to the current browser profile. (README L143)

US-ACTIVATION-007: As a user, I can complete onboarding when at least one agent path is usable, whether that is Pi with a provider key or an authenticated CLI runtime. (README L13)

### UI

US-UI-001: As a user, I use a SolidJS app shell so that the frontend stays reactive and local-first. (README L85)

US-UI-002: As a user, I rely on shared Solid primitives for buttons, inputs, dialogs, tooltips, sheets, and toast presentation so that UI feels consistent. (README L92)

US-UI-003: As a user, I see disabled actions explain their blocking reason in tooltips, and reusable compact overlays route through shared primitives instead of ad hoc markup. (README L94)

US-UI-004: As a user, I see lucide-solid icons across project actions and workspace controls so that iconography stays coherent. (README L95)

US-UI-005: As a user, I see tooltips render through a body-level portal so that panel overflow does not clip them. (README L96)

US-UI-006: As a user, I use left workspace tabs for Projects, Assistants, and Jobs so the selected tab controls both left list content and center detail content. (README L98)

US-UI-007: As a user, I see project chat keep transcript first and expose plan, run, memory, and events through a compact local pane strip instead of a larger cockpit card. (README L99)

US-UI-008: As a user, I see the chat transcript auto-stick only when already at bottom and expose an explicit Scroll to latest affordance when I scroll away. (README L100)

US-UI-009: As a user, I see the composer keep mode, agent, provider, and model controls together in the bottom row so runtime and model choice stay local to active task. (README L105)

US-UI-010: As a user, I see the transcript, plan, run, and trace surfaces render readable markdown with code fences, tables, blockquotes, and safe external-link behavior. (README L108)

US-UI-011: As a developer, I see shared primitives and major shells expose stable `data-test-*` hooks for UI automation and harness tests. (README L111)

US-UI-012: As a user, I see thread badges render with consistent status colors (purple/orange/yellow/red/green) per thread state. (README L66)

US-UI-013: As a user, I see caught UI and command errors surface through toast notifications so that failures become visible. (README L182)

US-UI-014: As a user, I open a Cmd/Ctrl+K keyboard project open flow via TanStack Hotkeys with best-effort Cmd/Ctrl+Space when the browser cooperates. (README L97)

US-UI-015: As a developer, I keep developer traces out of the user-visible transcript, hide aggregation-only trace stages from user-facing status surfaces, and surface only significant orchestration milestones through the live tail and finalized phase rows. (README L175, L176)

US-UI-016: As a user, I see all in-flight status and assistant text stay in one final-position live tail message until the run completes, then become finalized transcript rows. (README L67)

US-UI-017: As a user, I see run cockpit expose virtual-branch experiment review, promote, and discard actions plus a shared memory tab for local reusable learnings. (README L101)

US-UI-020: As a user, I inspect shell tool activity from a run pane with command status, concise output previews, classified failure detail, and copyable summaries while chat keeps only interpreted progress and blocking failures. (README L68)

US-UI-018: As a user, I see shared popovers render through portal-backed primitives so that compact overlays (inbox, quick replies, interaction panels) stay well-positioned. (README L93)

US-UI-019: As a user, I see the live context usage meter sourced from pi session context stats. (README L51)

### PERSISTENCE

US-PERSISTENCE-001: As a developer, I use SQLite-backed persistence for projects, active selection, threads, and messages so that local state survives restart. (README L34)

US-PERSISTENCE-002: As a developer, I see agent run state, planning questions, and subtask progress persist locally with the active thread. (README L70)

US-PERSISTENCE-003: As a developer, I see plan-summary assistant messages persist with typed plan metadata so that restart preserves the frozen plan shown to the user. (README L71)

US-PERSISTENCE-004: As a developer, I see agent runs persist frozen execution plans and correctness reviews, not only loose subtask text. (README L72)

US-PERSISTENCE-005: As a developer, I see completed run metadata persist so that retry stays available after refresh or restart. (README L73)

US-PERSISTENCE-006: As a developer, I see completed subagent metadata persist across partial runs so that follow-up work can continue from prior branch commits. (README L74)

US-PERSISTENCE-007: As a developer, I persist in-flight assistant transcript rows for refresh recovery while keeping planner traces, status stream buffers, and toasts as transient runtime state. (README L75)

US-PERSISTENCE-008: As a user, I see draft text persist per thread in browser localStorage so that typed input survives thread switches and reloads. (README L76)

US-PERSISTENCE-009: As a user, I see the browser session remember last active project and each project's last active thread, restored on reopen when targets still exist. (README L65)

US-PERSISTENCE-010: As a developer, I keep SQLite persistence local-first and single-machine. (README L142)

US-PERSISTENCE-011: As a developer, I see browser localStorage mirror API key presence and global workspace defaults for the current browser profile. (README L145)

US-PERSISTENCE-012: As a developer, I see browser localStorage mirror execution gate, isolation strategy, countdown, and correctness iteration defaults for the current browser profile. (README L149)

US-PERSISTENCE-013: As a developer, I see browser localStorage mirror background-job approval defaults and local notification opt-in. (README L147)

US-PERSISTENCE-014: As a developer, I see browser localStorage store per-thread draft text keyed by project and thread id. (README L148)

US-PERSISTENCE-015: As a developer, I see browser localStorage store chat-composer session state including current trace panel open state as a session override separate from the saved default-open preference. (README L149)

### PREFERENCES

US-PREFERENCES-001: As a user, I set global execution preferences for dirty-git chat restriction, dirty change threshold, plan gate mode, countdown delay, subagent isolation strategy, and correctness iteration policy. (README L45)

US-PREFERENCES-002: As a user, I set a workspace preference for Pi auto-compaction threshold so long runs trim context earlier and continue with current intent intact. (README L46)

US-PREFERENCES-003: As a user, I see the main project-chat composer restore mode, agent, provider, and model from browser-local session state instead of reusing project-persisted backend selections. (README L106)

### DEV

US-DEV-001: As a developer, I run a same-origin web app and websocket server started through Bun. (README L7)

US-DEV-002: As a developer, I run `bun run bootstrap` to install missing dependencies, build the UI, start the server, and open the browser by default. (README L115)

US-DEV-003: As a developer, I run `bun run dev` to start the Bun server with hot reload, open the browser only on first ready boot, wait for a 30s quiet window before applying dev UI or backend reloads, auto-reload the browser after successful debounced UI rebuilds, and keep backend state best-effort across same-process hot reloads. (README L118)

US-DEV-004: As a developer, I run `bun run dev:cli` to start the websocket server without the UI route through the same Bun hot-reload path. (README L119)

US-DEV-005: As a developer, I see dev and bootstrap retry on a random open port when `HARNESS_PORT` is unset and `8787` is occupied. (README L118)

US-DEV-006: As a developer, I run `bun run build:ui` which builds the browser bundle through `Bun.build` with Solid and Tailwind plugin support. (README L119)

US-DEV-007: As a developer, I run `bun run doctor` which prints the shared activation and runtime health report and exits non-zero when required first-task checks fail. (README L120)

US-DEV-008: As a developer, I run `bun run package:launcher` which builds a portable Bun launcher folder for the current OS target, and launcher startup failures write a timestamped crash log beside the executable before exit. (README L121)

US-DEV-009: As a developer, I see development UI builds emit external source maps for browser debugging. (README L122)

US-DEV-010: As a developer, I run `bun run test` to execute the Bun test suite in parallel with a tuned worker cap and simple local override. (README L123)

US-DEV-011: As a developer, I run `bun run typecheck` to validate TypeScript contracts. (README L124)

US-DEV-012: As a developer, I see development startup auto-purge broken local SQLite artifacts, retry delete on transient Windows file locks, then retry boot once if legacy migration drift makes the dev DB unloadable. (README L125)

US-DEV-013: As a developer, I see dev DB recovery log the triggering startup error first and only auto-purge on concrete corruption or schema-drift signatures instead of generic SQLite failures. (README L126)

US-DEV-014: As a developer, I see background job run schema repair rebuild dependent notification and event tables when an older migration left them pointing at legacy table names. (README L127)

US-DEV-015: As a developer, I see dev DB recovery fall back to a fresh sibling DB path when corrupted local SQLite artifacts stay locked, instead of failing on the busy file. (README L128)

US-DEV-016: As a developer, I see malformed legacy thread rows pruned during migration or load recovery in development instead of blocking workspace startup. (README L79)

US-DEV-017: As a developer, I see Solid UI tests live next to core components as sibling `*.test.tsx` files, sharing one Bun plus Happy DOM harness. (README L132, L133)

US-DEV-018: As a developer, I see the backend validate every websocket payload before processing it. (README L141)

US-DEV-019: As a developer, I see pi tool use stay behind the backend adapter boundary. (README L167)

US-DEV-020: As a developer, I see subagent startup timing captured in debug logs plus developer trace events so slow spawn phases are measurable. (README L181)

US-DEV-021: As a developer, I see development builds re-surface swallowed UI and command errors after toast display so local debugging keeps mapped stacks visible. (README L183)

US-DEV-022: As a developer, I see Tailwind class canonicalization enforced through editor diagnostics and focused linting so shared UI utilities stay in one preferred form. (README L184)

US-DEV-025: As a developer, I see bundled ripgrep added to the agent toolchain path so subagent search does not depend on the user's global shell PATH. (README L185)

US-DEV-026: As a developer, I see Bun hot reload reuse one live harness server instance with stable websocket listeners, delaying handler swaps until the quiet window ends so active dev chats and runtime state are preserved best-effort instead of restarting on every save. (README L118)

US-DEV-023: As a developer, I run `bun run screenshot` to capture isolated Playwright chromium PNGs of the UI inside a BranchFS mount on a random free port, with outputs written to `.local/screenshots/<runId>/` so agents can inspect visual bugs without touching the host `:8787` server. (README L129)

US-DEV-024: As a developer, I see debug and dev startup telemetry stream current boot phase, weighted progress and ETA, slow-phase hints, and a temp startup log path so stalled boots stop looking dead. (README L119)

### SEARCH

US-SEARCH-001: As a user, I open a spotlight-style project switcher for recent roots, local folder search, and fast project activation from one shared flow. (README L11)

US-SEARCH-002: As a user, I activate an already-open project from the switcher without creating a fresh thread when the exact path matches. (README L61)

US-SEARCH-003: As a user, I create and open a folder-only project from an absolute path in the project switcher so that I can start a new project without a template or git requirement. (README L11)

### MARKDOWN

US-MARKDOWN-001: As a user, I see formatted markdown rendering across chat, plan, and trace surfaces with safe links, GFM tables and task lists, footnotes, and copyable highlighted code blocks. (README L42, L108)

US-MARKDOWN-002: As a user, I see code fences in markdown surfaces include a copy affordance and surface copy failures through toast notifications. (README L42, L108, L182)

---

## Roadmap

### ACTIVATION-ROADMAP

US-ACTIVATION-ROADMAP-001: As a user, I install and update the harness through signed installers and update channels while portable launcher distribution improves. (todo.md L21)

US-ACTIVATION-ROADMAP-002: As a user, I repair stale auth, broken local config, and launcher drift through deeper doctor and reset flows after the first successful run. (todo.md L22)

US-ACTIVATION-ROADMAP-003: As a user, I see typed setup and repair coverage for browser tools and MCP servers so unsupported placeholders become real health surfaces. (todo.md L23)

US-ACTIVATION-ROADMAP-004: As a user, I keep first-task activation centered on project-open plus task-send flow instead of a separate blocking wizard. (todo.md L24)

US-ACTIVATION-ROADMAP-005: As a user, I keep current approval and autonomy defaults while setup clarity and recovery improve. (todo.md L25)

### THREADS-ROADMAP

US-THREADS-ROADMAP-001: As a user, I archive and restore threads with optional auto-archive preferences so stale threads leave the active surface without losing history. (todo.md L29)

US-THREADS-ROADMAP-002: As a user, I rely on strong thread sorting and recent-thread trimming so long-lived projects stay navigable. (todo.md L39)

### PREFERENCES-ROADMAP

US-PREFERENCES-ROADMAP-001: As a user, I save thread-scoped or project-scoped composer presets for mode, agent, provider, and model while browser-global restore stays the default and preset scope stays obvious. (todo.md L30)

### SEARCH-ROADMAP

US-SEARCH-ROADMAP-001: As a user, I open a global search surface with `Cmd/Ctrl+F` via TanStack Hotkeys, debounced input, and tiered streamed results. (todo.md L31)

### UI-ROADMAP

US-UI-ROADMAP-001: As a user, I use a terminal-first workflow with embedded terminals, project scripts, command palette actions, and keyboard shortcuts. (todo.md L32)

US-UI-ROADMAP-002: As a user, I hand off one step into my editor with active thread or run context attached. (todo.md L33)

US-UI-ROADMAP-003: As a user, I send selected UI elements, screenshots, console errors, and runtime failures back into the active thread through a tight preview-to-fix loop without manual copy-paste. (todo.md L37)

US-UI-ROADMAP-004: As a user, I keep inspectability high without forcing trace-heavy UI on every normal coding task. (todo.md L40)

### RUNS-ROADMAP

US-RUNS-ROADMAP-001: As a user, I review step-level diffs, incremental change views, and checkpoint restore so I can inspect or roll back agent work before trust is lost. (todo.md L34)

US-RUNS-ROADMAP-002: As a user, I keep durable proof bundles per run or checkpoint so diffs, tests, review notes, browser evidence, and follow-up prompts stay inspectable after refresh or restart. (todo.md L36)

US-RUNS-ROADMAP-003: As a user, I see run heartbeats, stale-run detection, and explicit `last verified`, `next step`, and `waiting on` summaries so quiet agents feel inspectable instead of broken. (todo.md L38)

### WORKTREE-ROADMAP

US-WORKTREE-ROADMAP-001: As a user, I use disposable experiment branches with fast compare, promote, and discard so risky ideas do not pollute my main checkout or trusted thread. (todo.md L35)

### PROVIDERS-ROADMAP

US-PROVIDERS-ROADMAP-001: As a user, I bring more of my own agent backends so I can use existing subscriptions and quotas without switching tools. (todo.md L44)

US-PROVIDERS-ROADMAP-002: As a user, I see provider auth state, runtime availability, discovered models, and capability differences before execution starts. (todo.md L45)

US-PROVIDERS-ROADMAP-003: As a user, I see tool and connector health as honestly as model capabilities so missing MCP, browser, git, or runtime dependencies fail before execution instead of mid-run. (todo.md L46)

US-PROVIDERS-ROADMAP-004: As a user, I use provider failover and credential rotation so long-running work survives quota, auth, and transient provider failures without losing session state. (todo.md L47)

US-PROVIDERS-ROADMAP-005: As a user, I get clearer provider exhaustion and auth-expiry guidance with explicit fallback or recovery suggestions instead of opaque API errors. (todo.md L48)

US-PROVIDERS-ROADMAP-006: As a user, I see honest provider selection and model switching when tools are missing, features degrade, or approval semantics differ. (todo.md L49)

US-PROVIDERS-ROADMAP-007: As a developer, I keep one typed provider contract path instead of provider-specific UI forks. (todo.md L50)

US-PROVIDERS-ROADMAP-008: As a user, I see per-thread or per-run usage when providers expose it so I understand cost and token burn. (todo.md L72)

US-PROVIDERS-ROADMAP-009: As a user, I see account quota, rate-limit, or credit state in a lightweight status area when providers expose it. (todo.md L73)

US-PROVIDERS-ROADMAP-010: As a user, I set per-run budget caps and soft or hard stop rules with preflight warnings before long-running work burns usage unexpectedly. (todo.md L74)

US-PROVIDERS-ROADMAP-011: As a user, I see lightweight burn-rate and remaining-headroom hints during execution. (todo.md L75)

US-PROVIDERS-ROADMAP-012: As a user, I understand model speed, cost, and capability tradeoffs in selection flows without cluttering the main chat surface. (todo.md L76)

US-PROVIDERS-ROADMAP-013: As a user, I still get a usable experience when providers do not expose usage details. (todo.md L77)

### JOBS-ROADMAP

US-JOBS-ROADMAP-001: As a user, I optionally bridge to OS-level schedulers so local jobs continue when the desktop harness process is fully closed. (todo.md L54)

US-JOBS-ROADMAP-002: As a user, I opt into Windows Task Scheduler, macOS LaunchAgent, or Linux systemd user service or cron bridges behind explicit consent. (todo.md L55)

US-JOBS-ROADMAP-003: As a user, I use away-from-desk approval and review inbox flows so another device can inspect evidence, answer approvals, or resume stopped work without taking over full local control. (todo.md L56)

US-JOBS-ROADMAP-004: As a user, I complete away-from-desk reviews from summary cards, screenshots, short demos, and diff highlights on a phone-friendly surface instead of raw traces. (todo.md L57)

US-JOBS-ROADMAP-005: As a user, I define pattern-based output watches so I get notified when long-running jobs hit errors, readiness signals, or other milestones. (todo.md L58)

US-JOBS-ROADMAP-006: As a user, I see deeper risk summaries around branch, environment, network, and filesystem scope before launch or approval. (todo.md L59)

US-JOBS-ROADMAP-007: As a user, I keep safeguards around long-running tasks and external side effects. (todo.md L60)

### RUNTIMES-ROADMAP

US-RUNTIMES-ROADMAP-001: As a user, I target local, WSL, and later headless or SSH-backed environments as first-class backends instead of shell-specific hacks. (todo.md L64)

US-RUNTIMES-ROADMAP-002: As a user, I pair and reconnect securely so another device can monitor runs, answer approvals, or resume work. (todo.md L65)

US-RUNTIMES-ROADMAP-003: As a user, I use a low-friction remote observer flow for control, approval, and status checks from another machine without exposing broad remote execution by default. (todo.md L66)

US-RUNTIMES-ROADMAP-004: As a user, I see target capabilities spelled out in UI copy before path, shell, or toolchain mismatches bite me. (todo.md L67)

US-RUNTIMES-ROADMAP-005: As a user, I keep local-first source of truth even when the backend runs outside the desktop process. (todo.md L68)

### BROWSER-ROADMAP

US-BROWSER-ROADMAP-001: As a user, I get an installable browser tool or skill wired into the browser session and approval pipeline by default. (todo.md L81)

US-BROWSER-ROADMAP-002: As a user, I review richer replay artifacts such as screenshots, DOM snapshots, and step-level verification evidence. (todo.md L82)

US-BROWSER-ROADMAP-003: As a user, I tune approval policy beyond per-step manual gating with read-only auto-allow and stronger risk buckets. (todo.md L83)

US-BROWSER-ROADMAP-004: As a user, I use preview handoff controls to point at broken UI state and send structured browser evidence back into planning or implementation. (todo.md L84)

US-BROWSER-ROADMAP-005: As a user, I run dedicated frontend QA flows so browser verification hands findings back into the coding plan cleanly. (todo.md L85)

### ATTACHMENTS-ROADMAP

US-ATTACHMENTS-ROADMAP-001: As a user, I get OCR fallback for scan-only PDFs and image-only documents. (todo.md L89)

US-ATTACHMENTS-ROADMAP-002: As a user, I attach files into `planning.answer` and `planning.refine` flows, not only new top-level sends. (todo.md L90)

US-ATTACHMENTS-ROADMAP-003: As a user, I get orphan-upload cleanup when I remove unsent attachments or abandon a draft. (todo.md L91)

US-ATTACHMENTS-ROADMAP-004: As a user, I see attachment lifecycle visibility for expired, deleted, or fetch-failed remote files. (todo.md L92)

US-ATTACHMENTS-ROADMAP-005: As a user, I see explicit attachment limits and cleanup policy in UI copy and settings docs. (todo.md L93)

### MARKDOWN-ROADMAP

US-MARKDOWN-ROADMAP-001: As a user, I see less visual churn during long streaming markdown responses so live code and prose updates feel steadier. (todo.md L97)

### PERSISTENCE-ROADMAP

US-PERSISTENCE-ROADMAP-001: As a user, I back up, export, and import threads, settings, skills, and lightweight memory locally before any multi-device sync work. (todo.md L101)

US-PERSISTENCE-ROADMAP-002: As a user, I see multi-device sync only evaluated after local workflow and background history feel stable. (todo.md L102)

US-PERSISTENCE-ROADMAP-003: As a user, I keep local SQLite as source of truth during offline work. (todo.md L103)

US-PERSISTENCE-ROADMAP-004: As a user, I see reconciliation rules, conflict handling, and visible sync state defined before any remote rollout. (todo.md L104)

### MODES-ROADMAP

US-MODES-ROADMAP-001: As a user, I expand local modes into reusable skill and playbook distribution. (todo.md L108)

US-MODES-ROADMAP-002: As a user, I install, import, export, and discover custom workflows across my workspace. (todo.md L109)

US-MODES-ROADMAP-003: As a user, I rely on skill provenance, trust signals, and per-workspace allowlists so reusable automation stays inspectable. (todo.md L113)

US-MODES-ROADMAP-004: As a user, I manage updates for installed skills with visible source, version, and review state. (todo.md L114)

### PLANNING-ROADMAP

US-PLANNING-ROADMAP-001: As a user, I use versioned workspace and repo rules with visible source, last-used signal, and promote-from-chat or review flows instead of opaque auto-memory. (todo.md L110)

US-PLANNING-ROADMAP-002: As a user, I share an execution cache across planner, main agent, and subagents so proven heuristics, fallback plans, prompt fragments, and verification recipes reuse without bloating every context window. (todo.md L111)

US-PLANNING-ROADMAP-003: As a user, I inspect that shared cache with source links, freshness markers, hit history, pin or expire controls, and easy clear or rebuild actions. (todo.md L112)

US-PLANNING-ROADMAP-004: As a user, I keep memory lightweight, inspectable, and editable instead of opaque long-term agent state. (todo.md L115)

### WORKSPACE-ROADMAP

US-WORKSPACE-ROADMAP-001: As a user, I run issue and pull-request workflows around `pi`. (todo.md L119)

US-WORKSPACE-ROADMAP-002: As a user, I use diff-aware review summaries, issue execution, and PR follow-up loops. (todo.md L120)

US-WORKSPACE-ROADMAP-003: As a user, I capture review-specific rules from accepted or dismissed findings so repeated repo feedback improves future review runs without hiding reasoning. (todo.md L121)

US-WORKSPACE-ROADMAP-004: As a user, I keep repository automation behind explicit opt-in and clear approval points. (todo.md L122)
