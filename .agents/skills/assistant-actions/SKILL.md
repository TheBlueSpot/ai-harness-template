---
name: assistant-actions
description: Master runbook for chat-driven harness assistant actions. Use when Codex needs to handle assistant requests from project chat, inspect assistant state, answer assistant job or queue questions, manage assistant todos/questions/learnings/logs, create or clone assistants, create/list/run assistant-owned background jobs, or recover paused, failed, or circuit-tripped assistants.
---

# Assistant Actions

Use this skill as the entrypoint for assistant work that should be doable from project chat.

## Start

1. Read [action-index.md](references/action-index.md).
2. Resolve the assistant target with [assistant-selection.md](references/assistant-selection.md).
3. If the request asks for current state, run [assistant-state.ts](scripts/assistant-state.ts) before guessing.
4. Load only the branch doc needed for the action.

## Branches

- Create, edit, clone, or configure assistants: [create-configure.md](references/create-configure.md)
- Chat, todos, questions, or learnings: [chat-todos-questions.md](references/chat-todos-questions.md)
- Assistant-owned background jobs: [jobs.md](references/jobs.md)
- Queued/open/learned/logged/status questions: [state-reporting.md](references/state-reporting.md)
- Pause, resume, bootstrap retry, failures, or circuit breakers: [recovery.md](references/recovery.md)
- Missing assistant, scope, project, schedule, or action target: [clarification-policy.md](references/clarification-policy.md)

## Script Rule

For deterministic state lookup, prefer:

```powershell
bun.cmd .agents/skills/assistant-actions/scripts/assistant-state.ts --assistant "<name-or-id>" --project "<name-or-id>" --limit 10
```

Use `--json` when another script or agent needs machine-readable output.
