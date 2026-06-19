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
4. For any mutation, check [operation-handoffs.md](references/operation-handoffs.md) before acting.
5. Load only the branch doc needed for the action.

## Branches

- Create, edit, clone, or configure assistants: [create-configure.md](references/create-configure.md)
- Chat, todos, questions, or learnings: [chat-todos-questions.md](references/chat-todos-questions.md)
- Assistant-owned background jobs: [jobs.md](references/jobs.md)
- Queued/open/learned/logged/status questions: [state-reporting.md](references/state-reporting.md)
- Pause, resume, bootstrap retry, failures, or circuit breakers: [recovery.md](references/recovery.md)
- Missing assistant, scope, project, schedule, or action target: [clarification-policy.md](references/clarification-policy.md)
- Exact operation handoffs: [operation-handoffs.md](references/operation-handoffs.md)

## Script Rule

For deterministic state lookup, prefer:

```powershell
bun.cmd .agents/skills/assistant-actions/scripts/assistant-state.ts --assistant "<name-or-id>" --project "<name-or-id>" --limit 10
```

Use `--json` when another script or agent needs machine-readable output.

For bulk pause or assistant-job launch planning, use:

```powershell
bun.cmd .agents/skills/assistant-actions/scripts/assistant-maintenance.ts --action pause-assistants --project "<project-name-or-id>"
bun.cmd .agents/skills/assistant-actions/scripts/assistant-maintenance.ts --action start-jobs --assistant "<name-or-id>" --project "<project-name-or-id>"
```

Dry-run first. Use `--execute` only after matched assistants/jobs are correct.

## Companion Workflows

- Use `db-data-harnessing` when the task is mainly SQLite/thread persistence investigation instead of a normal assistant action.
- Use `update-harness` when the requested assistant action needs harness command, protocol, scheduler, or UI changes.
- Use `screenshot-ui` only when validating the Assistants or Jobs surfaces visually.
- Use `branchfs` only for isolated experiments; normal assistant action maintenance should operate on the real harness DB after dry-run confirmation.
