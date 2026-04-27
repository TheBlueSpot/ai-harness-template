# Chat, Todos, Questions

Use for direct assistant chat, todo management, question answers, and learnings.

## Direct Chat

Flow:

1. Resolve assistant.
2. Check global execution pause, assistant pause, deletion, and circuit breaker.
3. Send message to assistant thread.
4. Stream response into assistant-owned chat state.
5. Summarize only the user-visible result in project chat when requested.

If the assistant is paused or tripped, use [recovery.md](recovery.md).

## Todos

Supported actions:

- Add todo.
- Mark todo pending, in-progress, blocked, completed, failed, or cancelled.
- Reorder todos when user gives an explicit priority.
- Ask for blockers or active todos.

Ask clarification when a todo title matches multiple rows.

## Questions

Flow:

1. Resolve assistant.
2. Match pending question by id or prompt text.
3. Persist answer only when `(assistantId, questionId)` matches.
4. Unblock linked todos.
5. Reprioritize assistant after answer unless globally paused.

Ask clarification if multiple pending questions match.

## Learnings

For "what has X learned" or "remember this for X", use [state-reporting.md](state-reporting.md) for read paths and the typed assistant persistence path for write paths.
