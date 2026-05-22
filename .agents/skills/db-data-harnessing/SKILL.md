---
name: db-data-harnessing
description: >
  Investigate harness SQLite data for `/lookup-thread <id>` and nearby
  persistence questions. Use when Codex needs to trace a project or assistant
  thread through `~/.ai-harness-template/harness.db` (or `HARNESS_DB_PATH`), explain which
  tables and records belong to a thread id, debug missing history, runs,
  notifications, automation jobs, or memory, or refresh this skill after schema
  changes or new DB lookup patterns are discovered.
---

Use this skill for DB-backed thread forensics in the local harness database.

## Quick Start

Run the bundled lookup first, then load the references only as needed:

```powershell
bun.cmd .agents/skills/db-data-harnessing/scripts/lookup-thread.ts <thread-id>
```

If `bun.ps1` is blocked by PowerShell execution policy, keep using `bun.cmd`.

## What This Skill Can Investigate

- Which project or assistant owns a thread id.
- Full or recent transcript rows for that thread.
- Thread title, kind, archive state, fork lineage, and active-thread wiring.
- Agent run lifecycle, planning questions, subtasks, experiments, and failures tied to the thread.
- Memory entries and retrievals tied to the thread or its runs.
- Notifications pointing at the thread or its runs.
- Background job state when the thread is an automation thread.
- Assistant-side todos, learnings, questions, logs, and assets when the id belongs to `assistant_threads`.
- Missing-data cases caused by reading the wrong DB file, BranchFS fresh state, or recovery fallback DBs.

## Workflow

1. Resolve the DB path. Default is `~/.ai-harness-template/harness.db`; `HARNESS_DB_PATH` overrides it.
2. Treat `/lookup-thread <id>` as a lookup workflow, not a built-in harness command.
3. Run `scripts/lookup-thread.ts` for a first pass before writing ad hoc SQL.
4. Read [lookup-thread.md](references/lookup-thread.md) for investigation order and interpretation hints.
5. Read [table-map.md](references/table-map.md) when you need table scope or adjacent entities.
6. Summarize findings in terms of user-visible behavior, not just raw rows.

## Maintenance

Update this skill whenever any of these change:

- The schema or migration logic for the harness SQLite database.
- A new thread-adjacent table, column, status, or relationship appears.
- A better `/lookup-thread` usage pattern is discovered during debugging.
- Assistant, notification, memory, or background-job flows start attaching to threads in a new way.

When updating:

1. Refresh `references/table-map.md`.
2. Refresh `references/lookup-thread.md`.
3. Refresh `scripts/lookup-thread.ts` if output shape or joins changed.
4. Re-run the skill validator and the helper script.

## Source Of Truth

- Schema and migrations: `harness/cli/src/workspace-repository.ts`
- DB path and recovery behavior: `harness/cli/src/dev-db-recovery.ts`
