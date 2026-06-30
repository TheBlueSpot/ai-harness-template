# Recovery

Use for paused assistants, bootstrap failures, repeated job failures, and circuit breakers.

## Pause And Resume

Flow:

1. Resolve assistant.
2. Use `assistant.pause` / `assistant.resume` or `pause <assistant>` / `resume <assistant>`.
3. Pause or resume only the matched assistant.
4. On resume, release pending reprioritize work unless global execution remains paused.
5. Verify run state and report pending questions or failed jobs that still need attention.

## Pause All Or Subset

Use for explicit bulk pause such as:

```text
pause all assistants for this project
pause Release watcher and Docs watcher
pause all assistants
```

Flow:

1. Resolve target scope before mutation.
2. Dry-run first:

```powershell
bun.cmd .agents/skills/assistant-actions/scripts/assistant-maintenance.ts --action pause-assistants --project "Docs"
```

For named subsets, repeat `--assistant`:

```powershell
bun.cmd .agents/skills/assistant-actions/scripts/assistant-maintenance.ts --action pause-assistants --assistant "Release watcher" --assistant "Docs watcher" --project "Docs"
```

For workspace-wide pause:

```powershell
bun.cmd .agents/skills/assistant-actions/scripts/assistant-maintenance.ts --action pause-assistants --all
```

3. Execute only after the matched assistant list is correct:

```powershell
bun.cmd .agents/skills/assistant-actions/scripts/assistant-maintenance.ts --action pause-assistants --project "Docs" --execute
```

4. Verify with `assistant-state.ts` or the Assistants surface; each matched assistant should have run state `paused`.

Project-scoped bulk pause does not pause global assistants unless they are named explicitly or `--all` is used without `--project`.

## Resume All Or Subset

Use for explicit bulk resume such as:

```text
resume all assistants for this project
resume Release watcher and Docs watcher
resume all assistants
```

Dry-run first:

```powershell
bun.cmd .agents/skills/assistant-actions/scripts/assistant-maintenance.ts --action resume-assistants --project "Docs"
```

Execute only after the matched assistant list is correct:

```powershell
bun.cmd .agents/skills/assistant-actions/scripts/assistant-maintenance.ts --action resume-assistants --project "Docs" --execute
```

Verify each matched assistant has run state `active`; global execution pause still blocks immediate work launch.

## Bootstrap Retry

Flow:

1. Resolve assistant.
2. Check global execution pause.
3. Reject if assistant is deleted or circuit-tripped unless user explicitly asks to recover.
4. Use `assistant.bootstrap.retry`.
5. Retry bootstrap as a single-flight operation.
6. Verify bootstrap state, latest bootstrap log, and created initial todos.

## Rebootstrap From Script

Use when the user asks to reset bootstrap state outside the UI. Dry-run first:

```powershell
bun.cmd .agents/skills/assistant-actions/scripts/assistant-maintenance.ts --action rebootstrap --assistant "Release watcher" --project "Docs"
```

Then execute only after the matched assistant list is correct:

```powershell
bun.cmd .agents/skills/assistant-actions/scripts/assistant-maintenance.ts --action rebootstrap --assistant "Release watcher" --project "Docs" --execute
```

For all project assistants:

```powershell
bun.cmd .agents/skills/assistant-actions/scripts/assistant-maintenance.ts --action rebootstrap --project "Docs" --execute
```

The script marks matched assistants active, clears breaker/failure state, and sets bootstrap to pending. Use the live harness retry action when immediate runtime execution is required.

## Circuit Breaker

Flow:

1. Inspect critical logs and pending assistant questions.
2. Explain latest failure and failure streak.
3. In the UI, open `Inspect failure` from the assistant card to view breaker reason, latest logs, latest assistant-owned job runs, and pending questions.
4. Use `Retry` to send `assistant.circuit-breaker.retry`; this clears the breaker, resumes the assistant, then retries bootstrap or schedules reprioritize.
5. Ask user whether to edit config or keep paused only when the failure reason needs human correction before retry.

## Scheduler Safety

Assistant-owned jobs must use the same launch gate as direct assistant chat: global pause, assistant pause, deleted state, circuit breaker, and project ownership.
