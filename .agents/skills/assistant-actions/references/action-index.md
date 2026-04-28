# Assistant Action Index

Canonical map from assistant user stories to project-chat actions. Load a branch doc only after choosing the matching row.

| Story | Chat actions | Branch |
|---|---|---|
| `US-ASSISTANTS-001` | create assistant, update config, clone to project, chat with assistant, add/update todos, answer questions, inspect learnings/logs, pause/resume, spawn assistant-owned background jobs | [create-configure.md](create-configure.md), [chat-todos-questions.md](chat-todos-questions.md), [jobs.md](jobs.md), [recovery.md](recovery.md) |
| `US-ASSISTANTS-002` | ask what an assistant has queued/open/learned/logged, inspect assistant-owned jobs without entering the Assistants surface | [state-reporting.md](state-reporting.md), [jobs.md](jobs.md) |
| `US-ASSISTANTS-003` | read persistent assistant state from SQLite: memory summary, todos, learnings, pending questions, logs, linked jobs | [state-reporting.md](state-reporting.md), [assistant-selection.md](assistant-selection.md) |
| `US-ASSISTANTS-004` | list/run/retry assistant-owned jobs, respect shared scheduler state, recover circuit breaker pauses, surface blocking questions | [jobs.md](jobs.md), [recovery.md](recovery.md), [clarification-policy.md](clarification-policy.md) |

## Default Flow

1. Classify the user request into one action.
2. Resolve assistant target and project scope.
3. For state questions, run the state script.
4. For mutations, use [operation-handoffs.md](operation-handoffs.md) and name the exact project-chat shape or harness action.
5. Ask clarification only when target, scope, schedule, or desired mutation is incomplete.

## Common Project-Chat Phrases

- `create a project assistant named Release watcher to watch release notes`
- `hey Release watcher what jobs do you have queued`
- `ask Release watcher what is blocking you`
- `schedule Release watcher to check docs every weekday morning`
- `pause Release watcher`
- `resume Release watcher and retry bootstrap`
- `clone Release watcher to this project`
- `mark Release watcher todo "check changelog" done`
