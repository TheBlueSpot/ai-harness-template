# Chat, Todos, Questions

Use for direct assistant chat, todo management, question answers, and learnings.

## Direct Chat

Flow:

1. Resolve assistant.
2. Check global execution pause, assistant pause, deletion, and circuit breaker.
3. Use `assistant.chat.send` or the project-chat `chat` handoff from [operation-handoffs.md](operation-handoffs.md).
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

Handoff:

- For completion from project chat, use `mark <assistant> todo "<title>" done`.
- For other states, use `assistant.todo.update`.
- Verify the todo row state and reprioritize log.

## Questions

Flow:

1. Resolve assistant.
2. Match pending question by id or prompt text.
3. Use `assistant.question.answer` or `answer <assistant>'s question: <answer>`.
4. Unblock linked todos.
5. Reprioritize assistant after answer unless globally paused.

Ask clarification if multiple pending questions match.

## Learnings

For "what has X learned", use [state-reporting.md](state-reporting.md). For "remember this for X", use `ask <assistant> remember this: <guidance>`; that is a chat handoff, and durable learning is only confirmed when reprioritize writes a new learning. Verify with the state script.
