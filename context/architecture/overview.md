# Architecture Overview

This project is a local AI harness with two main surfaces:

- a Bun full-stack server that owns websocket transport, same-origin UI delivery, and pi SDK orchestration
- a SolidJS UI that handles project selection, chat interactions, and developer trace visibility

The backend is the authority for request validation and command routing.
The UI is responsible for presenting transient state, collecting user input, and sending typed commands.

Workspace state is split into two layers:

- SQLite-backed persistent state for projects, active project selection, thread summaries, active thread selection, chat messages, agent runs, planning questions, and subtask progress
- transient runtime state for traces, active stream buffers, abort controllers, local drafts, toast notifications, preflight warnings, and context meter snapshots

Workspace can be empty.
No synthetic default project is created at startup.
When a known root is opened again, backend reuses project identity and creates a fresh active thread instead of rejecting the request.

Each project is now a thread container, not a single transcript.
Users can create blank threads or use `Pi fork` to branch from an existing transcript.
Forking copies message history only.
Run state, planning traces, draft text, and error state stay isolated to target thread.

The public agent surface is intentionally narrow:

- one user-facing agent profile, `pi`
- planner-first execution with `openai/gpt-5.4`
- automatic internal `pi-subagents` fan-out when planner difficulty exceeds 40

Planning and execution are now separate lifecycle phases.
`chat.send` and planner answers stop after the backend persists a frozen execution plan, appends a plan-summary assistant message, emits plan metadata for the developer panel, and leaves the run in `ready`.
Actual code work starts only after a typed execution command or an allowed auto-run gate fires.
Built-in modes can change that gate after planning.
`plan` stays approval-first, `ask` can auto-run without a transcript plan card, and `implement` auto-runs only while the frozen plan stays on the main executor or a single-task path.
Before planning starts, chat input can also auto-switch between built-in modes when prompt intent is strong enough, so the persisted selected mode follows the task instead of blindly reusing the previous picker value.

Execution plans are richer than legacy subtask lists.
They can include prerequisites, explicit technical contracts per subagent bucket, worktree strategy, verification scope, bucket sizing, and correctness iteration policy.
Those plan snapshots persist with the run so the transcript, trace panel, and restart recovery all point at the same plan.

Run execution can also target an isolated virtual branch.
That flow mounts a BranchFS-style experiment workspace that inherits current tracked and untracked local state without forcing a commit.
Experiment changes stay inside the mount until explicit promote or discard.
Review reads the experiment diff layer, and promotion flushes the virtual branch back to physical disk before the final git commit.

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

Subagent routing is contract-aware.
The planner prefers same-worktree fan-out by default, but only when owned paths can be split cleanly and bucket effort stays reasonably balanced.
If work cannot be split safely, execution collapses bucket count or falls back to broader isolated-worktree flow.
Shared setup work such as dependencies, config scaffolds, constants, or type baselines belongs in prerequisites before parallel work begins.

Project and thread history persist locally in SQLite.
Per-thread draft text persists in browser localStorage so in-progress input survives reload and thread switches.
Planner traces and stream buffers stay transient for current process only.
Development browser builds emit source maps, and swallowed UI command errors are rethrown after toast display during local debugging so mapped stacks stay visible.
Before execution starts, the backend can run a dirty-git preflight.
Small working tree drift surfaces as a warning while larger drift is rejected before the run begins.

Prompt memory now has two layers:

- user-managed workspace and thread summaries
- auto-written shared memory bank entries with bounded retrieval for planner, main executor, and subagents

The memory bank stays local and inspectable.
Only selected compact cards enter prompts, and retrieval plus write activity persists with the run.

After execution, the backend runs a correctness review against the frozen plan and current workspace result.
That review can surface runnable gaps, missed commitments, or suspicious low-quality output.
When gaps are found, the system generates a corrective plan and re-enters the same plan-first presentation flow instead of silently claiming success.

Transient execution state is intentionally reset when a new top-level task or ready-plan refinement starts.
Chat history remains persisted, but traces, context meter snapshots, countdown state, and active plan UI do not bleed from one run into the next.

Thread status is summarized in UI through badge states derived from persisted run state.
Current badge set is:

- purple for user input needed
- orange for planning
- yellow for executing
- red for error
- green for done
