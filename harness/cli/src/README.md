# Harness CLI Source

Backend websocket handlers and runtime orchestration for harness.

- Activation handlers clear runtime-only transient state before reloading persisted project or thread snapshots so switching context keeps durable chat, run, and planner-question state intact.
- Repository-backed project snapshots remain source of truth for active thread session, run state, and history while runtime store layers on ephemeral execution data.
- Run lifecycle guards, deferred planning questions, and emitted transcript updates are scoped to the target thread so separate project threads can plan or execute in parallel while project-level destructive actions still wait for streaming to finish.
- Run startup status rows surface active composer controls like fast mode early so refresh or reconnect still leaves control choices visible in transcript context.
- Background-job commands validate project ownership and allowed run-status transitions before mutating persisted runs.
- Live CLI session commands validate the session's owning thread, reject unsupported resize instead of faking terminal dimensions, keep terminal output bounded, and store captured terminal context for the next prompt on that thread.
- Assistant-linked assets are resolved to scoped capabilities before persistence or runtime launch so missing or out-of-scope refs fail early.
- Assistant creation can be routed from chat intent through typed websocket commands and persisted planning-question choices, keeping ambiguous prompts from silently becoming one-off project runs.
- Websocket streaming paths batch high-frequency assistant and terminal output, use heartbeat checks for stale sockets, and keep hot transcript updates narrow.
- Prompt attachments are accepted only from trusted upload metadata and can be reused on planning answers or refinements.
- Top-level CLI and support scripts share explicit flag parsing for help, usage failures, and doctor JSON output.
- Integration coverage for project and thread switching lives through the shared server test harness entrypoints under this folder.

See [root README](../../../README.md) for product overview.
