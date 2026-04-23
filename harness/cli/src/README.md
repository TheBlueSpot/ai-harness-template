# Harness CLI Source

Backend websocket handlers and runtime orchestration for harness.

- Activation handlers clear runtime-only transient state before reloading persisted project or thread snapshots so switching context keeps durable chat, run, and planner-question state intact.
- Repository-backed project snapshots remain source of truth for active thread session, run state, and history while runtime store layers on ephemeral execution data.
- Run startup status rows surface active composer controls like fast mode early so refresh or reconnect still leaves control choices visible in transcript context.
- Integration coverage for project and thread switching lives through the shared server test harness entrypoints under this folder.

See [root README](../../../README.md) for product overview.
