# Architecture Overview

This project is a local AI harness with two main surfaces:

- a Bun full-stack server that owns websocket transport, same-origin UI delivery, and pi SDK orchestration
- a SolidJS UI that handles project selection, chat interactions, and developer trace visibility

The backend is the authority for request validation and command routing.
The UI is responsible for presenting transient state, collecting user input, and sending typed commands.

Workspace state is split into two layers:

- SQLite-backed persistent state for projects, active project selection, active or archived threads, chat messages, agent runs, planning questions, and subtask progress
- transient runtime state for traces, active stream buffers, abort controllers, local drafts, toast notifications, preflight warnings, and context meter snapshots

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
Those questions render in the main chat surface and execution stays blocked until the user replies.

Subagent fan-out is resumable at the workflow level.
Completed subtask outputs persist locally so failed or stopped runs can rerun only pending or failed work after reconnect or restart.
Completed runs also persist enough state to remain retryable after success, refresh, or restart.

Project and thread history persist locally in SQLite.
Planner traces and stream buffers stay transient for the current process only.
Before execution starts, the backend can run a dirty-git preflight.
Small working tree drift surfaces as a warning while larger drift is rejected before the run begins.
