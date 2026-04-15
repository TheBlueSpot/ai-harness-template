# Architecture Overview

This project is a local AI harness with two main surfaces:

- a Bun full-stack server that owns websocket transport, same-origin UI delivery, and pi SDK orchestration
- a SolidJS UI that handles project selection, chat interactions, and developer trace visibility

The backend is the authority for request validation and command routing.
The UI is responsible for presenting transient state, collecting user input, and sending typed commands.

Workspace state is split into two layers:

- SQLite-backed persistent state for projects, active project selection, thread summaries, active thread selection, chat messages, agent runs, planning questions, and subtask progress
- transient runtime state for traces, active stream buffers, abort controllers, local drafts, toast notifications, preflight warnings, and context meter snapshots

Each project is now a thread container, not a single transcript.
Users can create blank threads or use `Pi fork` to branch from an existing transcript.
Forking copies message history only.
Run state, planning traces, draft text, and error state stay isolated to target thread.

The public agent surface is intentionally narrow:

- one user-facing agent profile, `pi`
- planner-first execution with `openai/gpt-5.4`
- automatic internal `pi-subagents` fan-out when planner difficulty exceeds 40

Each project owns its own filesystem root.
The backend routes pi execution using that project root as the working directory.

Tracing is split from chat output.
The main transcript shows user and assistant messages.
The developer panel shows planning, routing, and subagent lifecycle details.
Significant orchestration milestones can also appear as transient status cards in the chat surface without being persisted as transcript messages.

Planning can pause for a blocking question.
Those questions render in main chat surface with exactly three typed options and one recommended answer.
Execution stays blocked until user replies through quick option or freeform text.

Subagent fan-out is resumable at the workflow level.
Completed subtask outputs persist locally so failed or stopped runs can rerun only pending or failed work after reconnect or restart.
Completed runs also persist enough state to remain retryable after success, refresh, or restart.

Project and thread history persist locally in SQLite.
Per-thread draft text persists in browser localStorage so in-progress input survives reload and thread switches.
Planner traces and stream buffers stay transient for current process only.
Before execution starts, the backend can run a dirty-git preflight.
Small working tree drift surfaces as a warning while larger drift is rejected before the run begins.

Thread status is summarized in UI through badge states derived from persisted run state.
Current badge set is:

- purple for user input needed
- orange for planning
- yellow for executing
- red for error
- green for done
