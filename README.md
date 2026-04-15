# Pi Harness Template

Local-first coding harness built around a Bun full-stack server, a SolidJS UI, local SQLite persistence, and a pi SDK integration that can run through GPT or Gemini.

## What It Is

- A same-origin web app and websocket server started through Bun
- A multi-project workspace where each project root keeps its own local chat history and multiple switchable threads
- Empty workspace startup with no synthetic default project
- A single public agent profile, `pi`
- Brand-aware defaults for GPT or Gemini execution
- Gemini planning defaults to `google/gemini-3-flash-preview`
- Gemini subagents default to `google/gemini-2.5-flash-lite` when planner difficulty is above 40
- Git worktree isolation for subagents so parallel coding tasks do not mutate one checkout in place
- Bun cache-backed worktree provisioning through `bun install` instead of shared `node_modules`
- SQLite-backed persistence for projects, active selection, threads, and messages
- Interactive planning questions that pause execution until the user answers in chat, with three typed quick options and one recommended path
- Plan-first execution that persists a full execution plan, posts a plan summary into chat, and waits in `ready` before any code work starts
- Transcript-level plan summary cards with shared plan modal access from chat and trace panel
- Global execution preferences for dirty-git chat restriction, dirty change threshold, plan gate mode, countdown delay, subagent worktree strategy, and correctness iteration policy
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
- `Pi fork` clones only source transcript into new thread and leaves run state, traces, errors, and drafts behind
- Thread titles auto-generate from first user message until user renames them
- Active chat header uses thread title, supports inline rename, and exposes copyable thread id
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
- Bun runtime serves explicit built UI assets; the Solid transform runs through one shared build path
- Tailwind v4 styling processed through Bun's Tailwind plugin path
- Local Solid primitives for buttons, inputs, dialogs, tooltips, sheets, and toast presentation
- `lucide-solid` icons across project actions and workspace controls
- Tooltips render through a body-level portal so panel overflow does not clip them
- Chat and trace panel share one execution plan modal that exposes summary, prerequisites, bucket strategy, worktree mode, contracts, verification scope, and correctness history

## Local Workflow

- `bun run dev` starts the Bun server with hot reload and serves the Solid app
- `bun run dev:cli` starts the websocket server without the UI route
- `bun run build:ui` builds the browser bundle through `Bun.build(...)` with Solid and Tailwind plugin support
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
- Browser localStorage mirrors API key presence and global workspace defaults for the current browser profile
- Browser localStorage also mirrors execution gate, worktree strategy, countdown, and correctness iteration defaults for the current browser profile
- Browser localStorage also stores per-thread draft text keyed by project and thread id
- Provider brand switching is gated by matching saved key presence
- The UI sends typed project and chat commands only
- Plan execution starts through a typed `run.execute` command after plan presentation, not as an implicit side effect of `chat.send`
- Ready plans can be replaced through a typed `planning.refine` command that starts a fresh planning cycle in the same thread
- Project open responses report whether a new project was created or an existing project was reopened with a new thread
- Thread lifecycle, planning answers, resume requests, retry requests, and preflight warnings use typed websocket contracts
- Refresh requests use a typed `run.refresh` command for active run-level and subagent-level recovery
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
- Post-merge correctness review checks the delivered workspace against the frozen plan, catches obvious runnable or quality gaps, and can queue a corrective plan-first follow-up iteration
- Subagent startup timing is captured in debug logs plus developer trace events so slow spawn phases are measurable
- Caught UI and command errors surface through toast notifications
- Development builds re-surface swallowed UI and command errors after toast display so local debugging keeps mapped stacks visible

## Context

- [Architecture Overview](context/architecture/overview.md)
- [Websocket Contract](context/command-protocol/websocket-contract.md)
- [Pi OpenAI Provider Notes](context/model-provider/pi-openai.md)
- [Operational Rules](context/prompts/operational-rules.md)
- [Roadmap TODOs](docs/todo.md)
