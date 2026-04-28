# Assistant Jobs

Use for assistant-owned background job questions and actions.

## Queued Jobs Question

Example:

```text
hey Release watcher what background jobs do you have queued up
```

Flow:

1. Resolve `Release watcher` with [assistant-selection.md](assistant-selection.md).
2. Run state lookup:

```powershell
bun.cmd .agents/skills/assistant-actions/scripts/assistant-state.ts --assistant "Release watcher" --limit 10
```

3. Read `backgroundJobs` and `backgroundJobRuns`.
4. Summarize:
   - enabled or paused job definitions
   - queued, awaiting approval, running, or recent failed runs
   - next run time and last run result when present
5. Ask clarification only if assistant or project target is ambiguous.

## Create Or Spawn Job

Flow:

1. Resolve assistant.
2. Resolve project. Global assistants need current or named project.
3. Capture job purpose and schedule.
4. If schedule is missing, ask whether this is one-shot manual run or recurring schedule.
5. Use the exact handoff in [operation-handoffs.md](operation-handoffs.md): `schedule <assistant> to <job prompt> every <schedule>`.
6. Confirm the `create-job` result by reading `backgroundJobs` for enabled status and next run time.
7. Keep output out of normal project chat except for a compact linked status card.

## Run Existing Job

Flow:

1. Resolve assistant.
2. Resolve job by exact id/name or unique fuzzy name.
3. Check global pause, assistant pause, deletion, and circuit breaker.
4. Use the exact handoff in [operation-handoffs.md](operation-handoffs.md): `run <assistant> job now`.
5. Confirm a queued or running row appears in `backgroundJobRuns`.

Ask clarification if multiple jobs match.

## Recovery Link

If a job failed repeatedly or tripped the assistant circuit breaker, load [recovery.md](recovery.md).
