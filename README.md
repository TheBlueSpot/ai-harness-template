# Pi Harness Template

Local-first coding harness built around a Bun full-stack server, a SolidJS UI, local SQLite persistence, and a pi SDK integration that can run through GPT or Gemini.

## What It Is

- A same-origin web app and websocket server started through Bun
- A multi-project workspace where each project root keeps its own local chat history and multiple switchable threads
- Empty workspace startup with no synthetic default project
- Multiple agent runtimes: `pi`, `GitHub Copilot CLI`, and `Codex CLI`
- Spotlight-style project switcher for recent roots, local folder search, and fast project activation from one shared flow
- Bootstrap-first startup path for source users, plus portable Bun launcher packaging for release users
- Runtime health visibility so install, auth, and degraded interactive support show before a run starts
- Shared activation checklist that keeps first-run setup inside the main chat cockpit instead of a blocking wizard
- Guided help tutorials with spotlight overlays for opening a project, connecting provider/runtime, sending the first task, and reviewing plans
- `UploadThing`-backed attachments for screenshots, PDFs, and text or office-doc specs, persisted with chat history and routed into prompts
- Capability-aware model metadata so UI can explain tool, vision, browser, context, speed, and cost expectations before execution starts
- Typed browser session tracking with explicit per-step approval gates when browser-capable tools are active
- Workspace-global pause and resume for execution starts, with deferred planner questions, assistant questions, and browser approvals released on resume
- Local scheduled tasks and background jobs with durable SQLite history, startup catch-up, approval policy defaults, hidden automation threads, and a dedicated inbox surface
- Local assistant operators with named personas, role prompts, project or global scope, pause and resume controls, chat, todo lists, learnings, open questions, clone-to-project flow, and high-level plus deep-debug logs
- Product direction currently favors safe background execution, connector health visibility, explicit rule and memory control, preview-to-fix loops, durable review artifacts, budget-aware long runs, remote review from another device, and cleaner thread retrieval and cleanup over broader assistant surfaces
- Built-in workflow modes for asking, planning, implementing, debugging, and review, plus local custom modes at workspace or project scope
- Brand-aware defaults for GPT or Gemini execution
- Gemini planning defaults to `google/gemini-3-flash-preview`
- Gemini subagents default to `google/gemini-2.5-flash-lite` when planner difficulty is above 40
- Run-only virtual experiment branches through BranchFS-style isolated mounts so risky execution can stay off physical disk until promote
- Shared local memory bank for planner, main executor, and subagents, with bounded retrieval cards instead of dumping raw cache into every prompt
- Git worktree isolation for subagents so parallel coding tasks do not mutate one checkout in place
- Bun cache-backed worktree provisioning through `bun install` instead of shared `node_modules`
- SQLite-backed persistence for projects, active selection, threads, and messages
- Interactive planning questions that pause execution until the user answers in chat, with three typed quick options and one recommended path
- Global execution pause does not cancel in-flight work; it only blocks new launches and queues new follow-up asks until resume
- Plan-first execution that persists a full execution plan, posts a plan summary into chat, and waits in `ready` before any code work starts
- Optional live CLI sessions for Copilot CLI and Codex CLI over Bun-managed piped transport, with attach tokens, reconnect, and follow-up capture
- Built-in modes now differ on confirmation defaults: `plan` stays approval-first, `ask` suppresses transcript plan cards for direct Q&A, and `implement` auto-runs unless the frozen plan fans out to multiple subagents
- Composer input can auto-switch built-in modes when message intent is clear enough, so direct questions, review requests, debugging prompts, and planning asks do not depend only on the last manual mode selection
- Formatted markdown rendering across chat, plan, and trace surfaces with safe links, GFM tables and task lists, footnotes, and copyable highlighted code blocks
- Workspace and project instruction context with lightweight working-memory summaries that feed planning and execution
- Transcript-level plan summary cards with shared plan modal access from chat and trace panel
- Global execution preferences for dirty-git chat restriction, dirty change threshold, plan gate mode, countdown delay, subagent worktree strategy, and correctness iteration policy
- Workspace preference for Pi auto-compaction threshold so long runs trim context earlier and continue with current intent intact
- Resumable partial subagent runs that keep completed work after failure or stop
- Persistent retry for full runs and individual subagents, including successful runs
- Manual refresh for active runs and active subagents, with deferred refresh while work is still streaming
- Dirty-git preflight with a configurable chat-run restriction toggle and tracked plus untracked change threshold
- Live context usage meter sourced from pi session context stats

## Workspace Model

- Each project maps to a validated local folder path
- A project can be the repository root or a nested folder inside a larger git repository
- Workspaces can start empty and return to empty after removing the final project
- Each project keeps multiple named threads and one selected active thread
- `New thread` creates blank thread in same project and switches to it immediately
- Reopening an already-known project root creates and activates a fresh thread instead of rejecting the action
- Project switcher activates already-open projects directly instead of creating a fresh thread when the user is switching context
- `Pi fork` clones only source transcript into new thread and leaves run state, traces, errors, and drafts behind
- Thread titles auto-generate from first user message until user renames them
- Active chat header uses thread title, supports inline rename, and exposes copyable thread id
- Browser session remembers last active project and each project's last active thread, then restores that context on reopen when targets still exist
- Thread badges summarize status: purple `User Input`, orange `Planning`, yellow `Executing`, red `Error`, green `Done`
- High-signal run status updates persist inline in chat as `system` messages instead of floating badges above the transcript
- OpenAI and Google API keys plus provider brand preference can be persisted locally for the current machine
- Agent run state, planning questions, and subtask progress persist locally with the active thread
- Plan-summary assistant messages persist with typed plan metadata so restart preserves the frozen plan shown to the user
- Agent runs persist frozen execution plans and correctness reviews, not only loose subtask text
- Completed run metadata persists so retry stays available after refresh or restart
- Completed subagent metadata can persist across partial runs so follow-up work can continue from prior branch commits
- Planner traces, stream buffers, and toasts remain transient runtime state
- Draft text persists per thread in browser localStorage so typed input survives thread switches and reloads
- Preflight warnings, context meter snapshots, and chat status cards remain transient runtime state
- Starting a new top-level task or plan refinement clears prior transient traces, plan cards, countdown state, and context snapshots for that thread so follow-up runs do not inherit stale execution noise
- In development, malformed legacy thread rows are pruned during migration/load recovery instead of blocking workspace startup
- Folder browse uses a typed backend bridge; websocket payloads never carry raw shell commands
- Project open flows resolve through one typed result path whether root is new or already known

## UI Stack

- SolidJS app shell
- Task-first empty-state onboarding with import path before provider setup and a sample-task starting point
- Activation center stays in chat and exposes repair actions for missing project, provider, runtime, and git requirements
- Shared project switcher dialog replaces duplicated add-path inputs across sidebar and first-run onboarding
- Bun runtime serves explicit built UI assets; the Solid transform runs through one shared build path
- Tailwind v4 styling processed through Bun's Tailwind plugin path
- Shared Solid primitives for buttons, inputs, dialogs, tooltips, sheets, and toast presentation
- `lucide-solid` icons across project actions and workspace controls
- Tooltips render through a body-level portal so panel overflow does not clip them
- Keyboard project open flow uses TanStack Hotkeys for `Cmd/Ctrl+K` as the reliable shortcut, plus best-effort `Cmd/Ctrl+Space` when the browser receives it
- Center surface tabs keep `Project chat`, `Assistants`, and `Background jobs` above main panel shell so navigation stays tied to active work area
- Project chat keeps transcript first and exposes plan, run, memory, and events through a compact local pane strip instead of a larger cockpit card
- Run cockpit now includes virtual-branch experiment review, promote, and discard actions plus a shared memory tab for local reusable learnings
- Dedicated `Background jobs` surface keeps scheduled work, approval-needed runs, failures, and concise execution milestones out of normal project chat threads
- Dedicated `Assistants` surface keeps assistant chat, todos, questions, learnings, logs, and assistant-owned jobs inspectable outside normal project chat
- Header-level help opens guided walkthroughs instead of pushing setup into a separate onboarding funnel
- Composer keeps mode, agent, provider, and model controls together in bottom row so runtime and model choice stay local to active task
- Main project-chat composer restores mode, agent, provider, and model from browser-local session state instead of reusing project-persisted backend selections
- Composer supports attachment chips, UploadThing-backed upload flow, vision-aware image gating by selected model, and document ingestion for PDF, DOCX, XLSX, PPTX, and ODT on new top-level tasks
- Transcript, plan, run, and trace surfaces render readable markdown with code fences, tables, blockquotes, and safe external-link behavior
- Chat and trace panel share one execution plan modal that exposes summary, prerequisites, bucket strategy, worktree mode, contracts, verification scope, and correctness history
- Trace panel surfaces browser activity, pending approvals, replay snippets, and lightweight verification results when a run touches browser tools
- Shared primitives and major shells expose stable `data-test-*` hooks for UI automation and harness tests

## Local Workflow

- `bun run bootstrap` installs missing dependencies, builds the UI, starts the server, and opens the browser by default
- `bun run dev` starts the Bun server with hot reload and serves the Solid app
- `bun run dev:cli` starts the websocket server without the UI route
- When `HARNESS_PORT` is unset, dev and bootstrap retry on a random open port if `8787` is already occupied
- `bun run build:ui` builds the browser bundle through `Bun.build(...)` with Solid and Tailwind plugin support
- `bun run doctor` prints the shared activation and runtime health report and exits non-zero when required first-task checks fail
- `bun run package:launcher` builds a portable Bun launcher folder for the current OS target
- Development UI builds emit external source maps for browser debugging
- `bun run test` runs the Bun test suite
- `bun run typecheck` validates TypeScript contracts
- Development startup auto-purges broken local SQLite artifacts, retries delete on transient Windows file locks, then retries boot once if legacy migration drift makes the dev DB unloadable

## Testing

- Solid UI tests live next to core components as sibling `*.test.tsx` files
- UI specs share one Bun plus Happy DOM harness so modal, sheet, chat, sidebar, and trace interactions run in one lightweight browser-like path
- Core UI branching is unit tested directly at the component level, including ready-plan followups, planner questions, retry and resume actions, modal dismissal, and status icon branches
- Store reducer tests lock transient reset rules so follow-up runs clear traces, plan state, stream buffers, and modal selection without losing persisted chat history
- Backend websocket tests remain the authoritative integration layer for planner-ready, planner-question, follow-up, retry, and context-update flows
- Planner-ready and planner-question transcript messages explicitly stop reporting `isStreaming` before the UI accepts refinement or answer input

## Runtime Shape

- The backend validates every websocket payload before processing it
- SQLite persistence stays local-first and single-machine
- Setup health is server-derived per machine, while tutorial progress and dismissal state stay local to the current browser profile
- Assistant state persists locally in SQLite, including canonical thread memory summaries, active todo list, learnings, pending questions, structured logs, and assistant-linked background jobs
- Browser localStorage mirrors API key presence and global workspace defaults for the current browser profile
- Browser localStorage also mirrors execution gate, worktree strategy, countdown, and correctness iteration defaults for the current browser profile
- Browser localStorage also mirrors background-job approval defaults and local notification opt-in for the current browser profile
- Browser localStorage also stores per-thread draft text keyed by project and thread id
- Browser localStorage also stores chat-composer session state, including current trace panel open state as a session override separate from the saved default-open preference
- Provider brand switching is gated by matching saved key presence
- Thread continuity stays harness-owned even for CLI runtimes, so fresh CLI invocations rebuild context from persisted transcript and plan state
- The UI sends typed project and chat commands only
- Mode selection, rule sources, and memory summaries travel through typed contracts and persist with workspace state
- Built-in modes are policy presets, not separate pipelines: `ask` and `plan` bias toward read-heavy planning, `implement` biases toward active delivery, `debug` biases toward root-cause and narrow fixes, and `review` biases toward findings-first analysis
- Chat message persistence now includes uploaded attachment metadata, while planner and execution stages resolve remote image, text, and supported document context on demand
- Server-side document parsing uses runtime-safe PDF handling so Bun development startup does not depend on browser-only globals
- Plan execution starts through a typed `run.execute` command after plan presentation, not as an implicit side effect of `chat.send`
- Ready plans can be replaced through a typed `planning.refine` command that starts a fresh planning cycle in the same thread
- Project open responses report whether a new project was created or an existing project was reopened with a new thread
- Thread lifecycle, planning answers, resume requests, retry requests, and preflight warnings use typed websocket contracts
- Workspace-global execution pause and resume use typed websocket commands and a shared execution-control event so every connected client stays in sync
- Browser approval decisions use a typed websocket command and persist on the active run record
- Refresh requests use a typed `run.refresh` command for active run-level and subagent-level recovery
- Live CLI sessions also stay behind typed lifecycle commands, while terminal bytes flow through a separate short-lived attach channel
- pi tool use stays behind the backend adapter boundary
- Same-worktree subagent mode is the default when contracts can be cleanly path-split; broader or overlapping work falls back to isolated worktree flow
- Subagent work is contract-driven with prerequisites, owned paths, scoped verification, and merge notes instead of freeform subtask text
- Shared setup work is modeled as prerequisites that finish before any subagent fan-out starts
- Subagent edits merge inside a separate integration worktree when isolated worktree mode is selected; same-worktree mode validates edits against contract-owned paths and limits verification scope
- When a project points at a nested folder, repo-level worktrees still back execution while edit sync stays scoped to the selected folder
- Repositories with no commits yet can still fan out through ephemeral snapshot state instead of failing on missing git history
- Debug mode can preserve failed worktrees locally for inspection while successful worktrees are cleaned up automatically
- Developer traces stay out of the user-visible transcript
- Significant orchestration milestones surface in chat as persisted inline status rows
- Scheduled jobs persist separately from user chat and can promote finished AI runs into reusable routines with explicit schedules
- Assistant-owned jobs share the same scheduler path, while assistant circuit breakers can auto-pause failing assistants and surface blocking questions for user intervention
- Post-merge correctness review checks the delivered workspace against the frozen plan, catches obvious runnable or quality gaps, and can queue a corrective plan-first follow-up iteration
- Subagent startup timing is captured in debug logs plus developer trace events so slow spawn phases are measurable
- Caught UI and command errors surface through toast notifications
- Development builds re-surface swallowed UI and command errors after toast display so local debugging keeps mapped stacks visible
- Tailwind class canonicalization is enforced through editor diagnostics and focused linting so shared UI utilities stay in one preferred form

## Context

- Product direction: maximize PMF by reducing setup friction, making capability limits explicit, preserving recoverability, keeping active context inspectable, and making unattended work easier to trust
- Dense UI preference: keep default layouts tight, and require secondary controls or summaries to earn their visual footprint
- [Architecture Overview](context/architecture/overview.md)
- [Websocket Contract](context/command-protocol/websocket-contract.md)
- [Pi OpenAI Provider Notes](context/model-provider/pi-openai.md)
- [Operational Rules](context/prompts/operational-rules.md)
- [Roadmap TODOs](docs/todo.md)
