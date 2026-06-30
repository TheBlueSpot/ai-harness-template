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

## Recent Background Jobs

Use for project-wide recent job inspection when the user has not named one assistant:

```powershell
bun.cmd .agents/skills/assistant-actions/scripts/assistant-jobs.ts --project "Docs" --limit 10
```

Read `recentRuns` and summarize statuses, failures, assistant names, job names, and run times. Prefer the current project path for `--project` when the request comes from project chat and no project name is given. Omit `--project` only for explicit workspace-wide inspection.

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

## Start All Jobs For Assistant Or Scope

Use for explicit bulk launch such as:

```text
start all jobs for Release watcher
start all assistant jobs for this project
```

Flow:

1. Resolve assistant subset: named assistants, current project assistants, or explicit workspace all.
2. Dry-run first:

```powershell
bun.cmd .agents/skills/assistant-actions/scripts/assistant-maintenance.ts --action start-jobs --assistant "Release watcher" --project "Docs"
```

For a whole project:

```powershell
bun.cmd .agents/skills/assistant-actions/scripts/assistant-maintenance.ts --action start-jobs --project "Docs"
```

3. Confirm matched assistants and `jobs to start`. Active queued/running/waiting jobs are skipped.
4. Execute through the live harness bulk command path so launch gates, notifications, and in-memory controllers stay correct:

```powershell
bun.cmd .agents/skills/assistant-actions/scripts/assistant-maintenance.ts --action start-jobs --assistant "Release watcher" --project "Docs" --execute --url http://localhost:8787
```

5. Verify with `assistant-state.ts`; new rows should appear under `backgroundJobRuns`.

Do not create `background_job_runs` directly in SQLite for this action. Manual starts must use the live `bulk-operation.apply` `run-now` path.

## Recovery Link

If a job failed repeatedly or tripped the assistant circuit breaker, load [recovery.md](recovery.md).

## Remove All Jobs For Assistant

Use for explicit cleanup such as:

```text
remove all jobs for Release watcher
```

Flow:

1. Resolve the assistant and project scope.
2. Dry-run first:

```powershell
bun.cmd .agents/skills/assistant-actions/scripts/assistant-maintenance.ts --action remove-jobs --assistant "Release watcher" --project "Docs"
```

3. If the target is correct, execute:

```powershell
bun.cmd .agents/skills/assistant-actions/scripts/assistant-maintenance.ts --action remove-jobs --assistant "Release watcher" --project "Docs" --execute
```

4. Verify with `assistant-state.ts`; `backgroundJobs` should be empty for that assistant.
