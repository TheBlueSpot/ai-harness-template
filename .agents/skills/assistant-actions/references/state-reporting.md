# State Reporting

Use for deterministic answers about what an assistant has queued, open, learned, logged, or scheduled.

## Script First

Run:

```powershell
bun.cmd .agents/skills/assistant-actions/scripts/assistant-state.ts --assistant "<name-or-id>" --project "<project-name-or-id>" --limit 10
```

Use `--json` for automation:

```powershell
bun.cmd .agents/skills/assistant-actions/scripts/assistant-state.ts --assistant "<name-or-id>" --json
```

## Summaries

Prioritize:

1. Assistant run state, bootstrap state, and circuit breaker.
2. Pending or blocked todos.
3. Pending questions.
4. Queued/running/recent failed jobs.
5. Recent learnings.
6. Recent error or critical logs.

## Handoff Checks

After a mutation, verify the matching rows:

- Assistant create/update/clone/pause/resume/recover: assistant row plus latest logs.
- Chat: assistant messages and `assistant.chat.complete` event if visible.
- Question answer: question status and linked todo/log changes.
- Todo update: todo state and reprioritize log.
- Job create/run/pause/resume: `backgroundJobs`, `backgroundJobRuns`, and next run time.

## Answer Style

State what is known from persistence. If no rows exist, say no saved rows were found. Do not infer hidden work from prompts alone.
