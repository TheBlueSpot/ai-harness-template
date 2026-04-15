# Websocket Contract

The websocket layer uses typed commands and typed server events.

Client commands are restricted to a fixed set of actions:

- connection ping
- agent list
- project add
- project browse
- project remove
- project activate
- thread create
- thread activate
- thread fork
- thread rename
- chat send
- planning answer
- run resume
- run retry
- chat stop
- session reset as legacy alias for thread create

Server responses are structured events that report:

- readiness and workspace state
- agent catalogs
- project open results, removals, and activation changes
- thread creation, activation, and rename changes
- planner summaries
- developer trace updates
- execution preflight warnings
- project context usage updates
- assistant message updates
- agent run updates
- structured errors
- session resets

Project commands carry:

- project id or validated root path
- no raw shell input

Chat requests carry:

- project id
- thread id
- agent id
- user content
- optional execution model override
- optional debug flag

Planning answer requests carry:

- project id
- thread id
- run id
- question id
- user content

Resume requests carry:

- project id
- thread id
- run id
- optional guidance text
- optional subagent ids

Retry requests carry:

- project id
- thread id
- run id
- optional subagent id

Thread management requests carry:

- project id
- thread id for activation and rename
- source thread id for fork
- validated title text for rename

Connection readiness reports:

- full workspace snapshot
- optional active project id when at least one project exists
- active thread id per project
- thread summary list per project
- persisted active thread messages for each project

Planner events report:

- planning model
- difficulty score
- whether subagents were used
- execution model
- subtask count
- project id
- thread id

Trace events report:

- orchestration stage
- human-readable status
- optional detail
- optional subagent id
- optional model id
- optional duration
- project id
- thread id

Chat completion and reset events report:

- project id
- thread id
- current session state snapshot

Message append events report:

- project id
- thread id
- appended message
- current session state snapshot

Run update events report:

- project id
- thread id
- run status
- persisted planning questions
- persisted subtask progress
- resumable state
- retryable state

Execution preflight events report:

- project id
- warning severity
- preflight kind
- changed file count
- user-facing warning message

Project context events report:

- project id
- thread id
- source kind
- source label
- model id
- current context token count when available
- model context window
- derived usage percent when available

Folder browsing is backend-owned.
The UI issues a typed browse request and the backend decides whether native folder selection is available.

Project open results are unified.
Opening new root reports created project.
Opening known root reports same project plus new active thread.

All payloads must be validated before they are processed.
Invalid payloads are rejected immediately.

Planner question payloads are shape-constrained.
Each question must include exactly three typed choices and exactly one recommended choice.
