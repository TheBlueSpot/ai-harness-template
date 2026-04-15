# Pi OpenAI Provider Notes

The current MVP integrates pi through the `@mariozechner/pi-coding-agent` SDK and keeps the provider surface OpenAI-only.

The backend should:

- treat agent ids and model ids as validated data
- keep pi usage behind a single adapter boundary
- use provider-qualified OpenAI model ids
- reject non-OpenAI model requests immediately
- keep pi session management in memory for the current run only
- return structured failures when planning, execution, or subagent routing fails

The harness owns plan mode and subagent orchestration itself.
pi is embedded as the coding runtime, not as the planner or subagent policy layer.

Resuming a failed or stopped run is workflow-level, not in-flight session continuation.
Completed subtask outputs can be reused from SQLite, but a resumed subagent starts a fresh pi session because session managers stay in memory per process.
