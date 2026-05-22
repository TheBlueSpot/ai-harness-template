# Harness DB Table Map

This is a high-level map for the harness SQLite database. Use it to decide which tables matter for a `/lookup-thread` investigation.

## Thread-Critical Tables

| Table | Description | Why `/lookup-thread` cares |
| --- | --- | --- |
| `projects` | Workspace projects keyed by root path, with selected mode and active thread pointers. | Tells you which project owns a project thread and whether it is active. |
| `project_threads` | User and automation threads for a project, including title, archive state, fork lineage, and thread memory summary. | Primary table for normal thread ids. |
| `thread_messages` | Ordered chat transcript rows for project threads. | Explains visible chat history, previews, and plan-summary messages. |
| `agent_runs` | Run lifecycle records for project threads, including status, models, plans, failures, and browser session payloads. | Explains thread badges, execution history, and failures. |
| `agent_run_questions` | Planner/user questions attached to a run. | Shows why execution paused for input. |
| `agent_run_subtasks` | Subagent tasks, outputs, worktree info, and errors for a run. | Explains subagent progress and failures. |
| `agent_run_experiments` | BranchFS experiment metadata for a run. | Shows virtual branch mounts and promotion/discard state. |
| `memory_entries` | Durable memory bank entries scoped to project, thread, or run. | Shows what durable memory was recorded for the thread. |
| `memory_retrievals` | Retrieval events that loaded memory entries into a run. | Explains when thread-related memory was used. |
| `notifications` | Inbox items for planning questions, assistant questions, browser approvals, and background run status. | Cross-links thread ids to user-visible alerts and approvals. |

## Automation And Background Work

| Table | Description | Why `/lookup-thread` cares |
| --- | --- | --- |
| `background_jobs` | Scheduled or manual automation definitions, each bound to an automation thread. | Matters when the thread is `kind = 'automation'`. |
| `background_job_runs` | Individual executions of a background job, with approval and run linkage. | Shows queueing, approval, success, and failure history. |
| `background_job_run_events` | Timeline events within one background job run. | Gives fine-grained automation milestones. |
| `background_job_templates` | Reusable template definitions for background jobs. | Useful when debugging how a job was seeded. |

## Modes, Rules, And Workspace State

| Table | Description | Why `/lookup-thread` cares |
| --- | --- | --- |
| `workspace_meta` | Key/value store for global settings, rules, and workspace memory summaries. | Helps when thread behavior depends on workspace-wide defaults. |
| `workspace_modes` | Global mode definitions. | Explains selected mode behavior inherited by projects. |
| `project_modes` | Project-local mode overrides or additions. | Explains project-specific execution behavior tied to the thread's project. |

## Assistant-Side Tables

| Table | Description | Why `/lookup-thread` cares |
| --- | --- | --- |
| `assistants` | Assistant definitions, scope, prompts, run state, and lifecycle health. | Owns assistant threads and related assistant records. |
| `assistant_threads` | One durable thread per assistant, with session id and memory summary. | Secondary thread model; check if a thread id is not in `project_threads`. |
| `assistant_messages` | Ordered transcript for an assistant thread. | Explains assistant conversation history. |
| `assistant_todos` | Assistant todo list with state and ordering. | Shows pending or blocked assistant work around a thread. |
| `assistant_learnings` | Assistant-learned facts with confidence. | Explains durable assistant memory. |
| `assistant_questions` | Questions an assistant asked the user. | Shows assistant-side pauses for input. |
| `assistant_log_entries` | Assistant operational log records. | Explains failures, warnings, and milestones. |
| `assistant_asset_refs` | References from an assistant to skills, scripts, modes, or templates. | Useful for understanding what assets influenced assistant behavior. |

## Relationship Notes

- `projects.active_thread_id -> project_threads.id`
- `project_threads.id -> thread_messages.thread_id`
- `project_threads.id -> agent_runs.thread_id`
- `agent_runs.id -> agent_run_questions.run_id`
- `agent_runs.id -> agent_run_subtasks.run_id`
- `agent_runs.id -> agent_run_experiments.run_id`
- `agent_runs.id -> memory_retrievals.run_id`
- `project_threads.id -> memory_entries.thread_id`
- `project_threads.id -> notifications.thread_id`
- `project_threads.id -> background_jobs.automation_thread_id`
- `background_job_runs.linked_agent_run_id -> agent_runs.id`
- `assistants.id -> assistant_threads.assistant_id`
- `assistant_threads.id -> assistant_messages.assistant_thread_id`

## When To Update This Reference

Update whenever the schema changes, a new table starts participating in thread debugging, or a new relationship becomes important enough to mention in `/lookup-thread` investigations.
