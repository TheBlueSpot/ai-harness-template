# `/lookup-thread` Guide

Use this workflow when a user gives you a thread id and wants to know what is in the harness database.

Read [table-map.md](table-map.md) if you need the wider schema around a result.

## What You Can Look For

- Ownership: which project, project root, or assistant owns the thread.
- Transcript: ordered messages, message roles, `plan-summary` messages, and message metadata/attachments.
- Thread state: title, title source, archive state, kind (`user` vs `automation`), last update time, and fork parent/children.
- Run state: latest run, failed run, partial-complete run, execution target, browser session payloads, correctness review payloads, and plan payloads.
- Planning flow: pending or answered run questions.
- Subagent flow: subtasks, outputs, worktree paths, mount paths, and experiment promotion/discard status.
- Memory flow: thread-scoped memories plus retrievals from runs on that thread.
- Notifications: inbox items tied to the thread, run, job, or approval flow.
- Background automation: jobs and job runs when the thread is an automation thread.
- Assistant thread state: messages, todos, learnings, questions, logs, and skill/script/mode references if the id belongs to `assistant_threads`.
- Environment mistakes: wrong DB path, BranchFS-created fresh state, or recovered DB files after corruption/schema drift.

## Recommended Order

1. Confirm the DB file.
   Default path is `~/.ai-harness-template/harness.db`.
   `HARNESS_DB_PATH` can redirect reads somewhere else.
   In BranchFS, local state may start fresh unless the caller points back to the host DB.

2. Identify thread type.
   Check `project_threads.id` first.
   If not found, check `assistant_threads.id`.

3. Pull the primary record.
   For project threads, start from `project_threads` plus owning `projects` row.
   For assistant threads, start from `assistant_threads` plus owning `assistants` row.

4. Pull the transcript.
   `thread_messages` for project threads.
   `assistant_messages` for assistant threads.

5. Pull thread-adjacent execution state.
   Project thread path: `agent_runs`, `agent_run_questions`, `agent_run_subtasks`, `agent_run_experiments`, `memory_entries`, `memory_retrievals`, `notifications`.
   Automation thread path: also include `background_jobs`, `background_job_runs`, `background_job_run_events`.
   Assistant thread path: include `assistant_todos`, `assistant_learnings`, `assistant_questions`, `assistant_log_entries`, `assistant_asset_refs`.

6. Interpret against user-visible behavior.
   Examples:
   - Empty sidebar thread preview usually traces back to `thread_messages`.
   - Wrong badge usually traces back to latest `agent_runs.status`.
   - Missing automation history usually traces back to `background_job_runs` or `notifications`.
   - "Data disappeared" may really mean the user is looking at a different harness database.

## Fast Path

Prefer the helper before hand-writing SQL:

```powershell
bun.cmd .agents/skills/db-data-harnessing/scripts/lookup-thread.ts <thread-id>
bun.cmd .agents/skills/db-data-harnessing/scripts/lookup-thread.ts <thread-id> --db C:\path\to\harness.db --json
```

## Notable Discoveries From Current Context

- The harness default DB lives at `~/.ai-harness-template/harness.db`.
- BranchFS mounts should point back to that DB unless a fresh isolated database is intended.
- Project thread summaries are derived from `project_threads`, latest `agent_runs`, and latest non-system `thread_messages`.
- Fork lineage lives on `project_threads.forked_from_thread_id`.
- Thread memory summaries live on the thread rows themselves, while durable memory bank entries live in `memory_entries`.
- Background jobs use hidden automation threads stored in the same `project_threads` table with `kind = 'automation'`.
- Notifications can point at a thread, run, assistant, background run, and job at the same time, so inspect them as cross-links.

## When To Update This Reference

Update this file whenever schema changes, a new thread lookup shortcut proves useful, or a new cross-table relationship becomes important during real debugging.
