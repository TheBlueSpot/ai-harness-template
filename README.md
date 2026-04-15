# Pi Harness Template

Local-first coding harness built around a Bun full-stack server, a SolidJS UI, local SQLite persistence, and a pi SDK integration that can run through GPT or Gemini.

## What It Is

- A same-origin web app and websocket server started through Bun
- A multi-project workspace where each project root keeps its own local chat history and multiple switchable threads
- A single public agent profile, `pi`
- Brand-aware defaults for GPT or Gemini execution
- Gemini planning defaults to `google/gemini-3-flash-preview`
- Gemini subagents default to `google/gemini-2.5-flash-lite` when planner difficulty is above 40
- Git worktree isolation for subagents so parallel coding tasks do not mutate one checkout in place
- Bun cache-backed worktree provisioning through `bun install` instead of shared `node_modules`
- SQLite-backed persistence for projects, active selection, threads, and messages
- Interactive planning questions that pause execution until the user answers in chat, with three typed quick options and one recommended path
- Resumable partial subagent runs that keep completed work after failure or stop
- Persistent retry for full runs and individual subagents, including successful runs
- Dirty-git preflight that warns on small working tree drift and refuses very dirty repos
- Live context usage meter sourced from pi session context stats

## Workspace Model

- Each project maps to a validated local folder path
- Each project keeps multiple named threads and one selected active thread
- `New thread` creates blank thread in same project and switches to it immediately
- `Pi fork` clones only source transcript into new thread and leaves run state, traces, errors, and drafts behind
- Thread titles auto-generate from first user message until user renames them
- Thread badges summarize status: purple `User Input`, orange `Planning`, yellow `Executing`, red `Error`, green `Done`
- OpenAI and Google API keys plus provider brand preference can be persisted locally for the current machine
- Agent run state, planning questions, and subtask progress persist locally with the active thread
- Completed run metadata persists so retry stays available after refresh or restart
- Completed subagent metadata can persist across partial runs so follow-up work can continue from prior branch commits
- Planner traces, stream buffers, and toasts remain transient runtime state
- Draft text persists per thread in browser localStorage so typed input survives thread switches and reloads
- Preflight warnings, context meter snapshots, and chat status cards remain transient runtime state
- Folder browse uses a typed backend bridge; websocket payloads never carry raw shell commands

## UI Stack

- SolidJS app shell
- Bun runtime serves explicit built UI assets; the Solid transform runs through one shared build path
- Tailwind v4 styling processed through Bun's Tailwind plugin path
- Local Solid primitives for buttons, inputs, dialogs, tooltips, sheets, and toast presentation
- `lucide-solid` icons across project actions and workspace controls
- Tooltips render through a body-level portal so panel overflow does not clip them

## Local Workflow

- `bun run dev` starts the Bun server with hot reload and serves the Solid app
- `bun run dev:cli` starts the websocket server without the UI route
- `bun run build:ui` builds the browser bundle through `Bun.build(...)` with Solid and Tailwind plugin support
- `bun run test` runs the Bun test suite
- `bun run typecheck` validates TypeScript contracts

## Runtime Shape

- The backend validates every websocket payload before processing it
- SQLite persistence stays local-first and single-machine
- Browser localStorage mirrors API key presence and global workspace defaults for the current browser profile
- Browser localStorage also stores per-thread draft text keyed by project and thread id
- Provider brand switching is gated by matching saved key presence
- The UI sends typed project and chat commands only
- Thread lifecycle, planning answers, resume requests, retry requests, and preflight warnings use typed websocket contracts
- pi tool use stays behind the backend adapter boundary
- Subagent edits merge inside a separate integration worktree before verified changes sync back to the main project root
- Debug mode can preserve failed worktrees locally for inspection while successful worktrees are cleaned up automatically
- Developer traces stay out of the user-visible transcript
- Significant orchestration milestones can surface in chat as transient status cards
- Caught UI and command errors surface through toast notifications

## Context

- [Architecture Overview](context/architecture/overview.md)
- [Websocket Contract](context/command-protocol/websocket-contract.md)
- [Pi OpenAI Provider Notes](context/model-provider/pi-openai.md)
- [Operational Rules](context/prompts/operational-rules.md)
- [Roadmap TODOs](docs/todo.md)
