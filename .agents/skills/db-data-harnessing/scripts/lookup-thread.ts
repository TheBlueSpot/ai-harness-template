import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import path from "node:path";

type CliOptions = {
  dbPath: string;
  json: boolean;
  limit: number;
};

type SectionCount = {
  label: string;
  count: number;
};

const DEFAULT_LIMIT = 20;

const HELP_TEXT = `lookup-thread.ts

Usage:
  bun.cmd .agents/skills/db-data-harnessing/scripts/lookup-thread.ts <thread-id> [--db <path>] [--limit <n>] [--json]

Options:
  --db <path>    Override DB path. Default: HARNESS_DB_PATH or .local/harness.db
  --limit <n>    Limit rows shown per list section. Default: 20
  --json         Emit machine-readable JSON instead of a text report
  --help         Show this help
`;

try {
  const args = parseArgs(Bun.argv.slice(2));
  if (args.help) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  if (!existsSync(args.options.dbPath)) {
    console.error(`DB not found: ${args.options.dbPath}`);
    process.exit(1);
  }

  const db = new Database(args.options.dbPath, { readonly: true });

  try {
    const report = buildReport(db, args.threadId, args.options);
    if (args.options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(renderReport(report));
    }
  } finally {
    db.close();
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  console.error("");
  console.error(HELP_TEXT);
  process.exit(1);
}

function parseArgs(argv: string[]) {
  let threadId: string | undefined;
  let dbPath = Bun.env.HARNESS_DB_PATH ?? path.join(process.cwd(), ".local", "harness.db");
  let json = false;
  let limit = DEFAULT_LIMIT;
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) {
      continue;
    }
    if (token === "--help" || token === "-h") {
      help = true;
      continue;
    }
    if (token === "--json") {
      json = true;
      continue;
    }
    if (token === "--db") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--db requires a path");
      }
      dbPath = value;
      index += 1;
      continue;
    }
    if (token === "--limit") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--limit requires a number");
      }
      const parsed = Number.parseInt(value, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error("--limit must be a positive integer");
      }
      limit = parsed;
      index += 1;
      continue;
    }
    if (token.startsWith("--")) {
      throw new Error(`Unknown option: ${token}`);
    }
    if (!threadId) {
      threadId = token;
      continue;
    }
    throw new Error(`Unexpected argument: ${token}`);
  }

  if (!threadId && !help) {
    throw new Error("thread id is required");
  }

  return {
    help,
    threadId: threadId ?? "",
    options: {
      dbPath,
      json,
      limit
    } satisfies CliOptions
  };
}

function buildReport(db: Database, threadId: string, options: CliOptions) {
  const projectThread = db
    .query(
      `SELECT
         t.id,
         t.project_id,
         t.status,
         t.kind,
         t.title,
         t.title_source,
         t.updated_at,
         t.forked_from_thread_id,
         t.memory_summary_content,
         t.memory_summary_updated_at,
         t.created_at,
         t.archived_at,
         p.name AS project_name,
         p.root_path AS project_root_path,
         p.active_thread_id AS project_active_thread_id,
         p.selected_mode_id AS project_selected_mode_id
       FROM project_threads t
       JOIN projects p ON p.id = t.project_id
       WHERE t.id = ?1`
    )
    .get(threadId) as Record<string, unknown> | null;

  if (projectThread) {
    const runIds = db
      .query(`SELECT id FROM agent_runs WHERE thread_id = ?1 ORDER BY updated_at DESC`)
      .all(threadId)
      .map((row) => String((row as Record<string, unknown>).id));

    const report = {
      lookup: {
        threadId,
        threadType: "project",
        dbPath: options.dbPath,
        limit: options.limit
      },
      thread: projectThread,
      lineage: {
        parent: projectThread.forked_from_thread_id
          ? db.query(`SELECT id, title, kind, status, updated_at FROM project_threads WHERE id = ?1`).get(projectThread.forked_from_thread_id)
          : null,
        children: db
          .query(
            `SELECT id, title, kind, status, updated_at
             FROM project_threads
             WHERE forked_from_thread_id = ?1
             ORDER BY updated_at DESC, created_at DESC`
          )
          .all(threadId)
      },
      counts: [
        countRow(db, "messages", `SELECT COUNT(*) AS count FROM thread_messages WHERE thread_id = ?1`, threadId),
        countRow(db, "agentRuns", `SELECT COUNT(*) AS count FROM agent_runs WHERE thread_id = ?1`, threadId),
        countRow(db, "memoryEntries", `SELECT COUNT(*) AS count FROM memory_entries WHERE thread_id = ?1`, threadId),
        countRow(db, "notifications", `SELECT COUNT(*) AS count FROM notifications WHERE thread_id = ?1`, threadId),
        countRow(db, "backgroundJobs", `SELECT COUNT(*) AS count FROM background_jobs WHERE automation_thread_id = ?1`, threadId),
        countRow(
          db,
          "backgroundJobRuns",
          `SELECT COUNT(*) AS count FROM background_job_runs WHERE automation_thread_id = ?1`,
          threadId
        )
      ],
      recentMessages: db
        .query(
          `SELECT id, role, kind, content, attachments_json, metadata_json, created_at
           FROM thread_messages
           WHERE thread_id = ?1
           ORDER BY created_at DESC
           LIMIT ?2`
        )
        .all(threadId, options.limit),
      agentRuns: db
        .query(
          `SELECT
             id, status, execution_target, latest_user_prompt, planning_model_id, execution_model_id,
             difficulty_score, summary, final_execution_brief, failure_message, created_at, updated_at, completed_at
           FROM agent_runs
           WHERE thread_id = ?1
           ORDER BY updated_at DESC
           LIMIT ?2`
        )
        .all(threadId, options.limit),
      agentRunQuestions: db
        .query(
          `SELECT
             q.id, q.run_id, q.ordinal, q.prompt, q.placeholder, q.choices_json, q.status, q.answer_text, q.asked_at, q.answered_at
           FROM agent_run_questions q
           JOIN agent_runs r ON r.id = q.run_id
           WHERE r.thread_id = ?1
           ORDER BY q.asked_at DESC, q.ordinal DESC
           LIMIT ?2`
        )
        .all(threadId, options.limit),
      agentRunSubtasks: db
        .query(
          `SELECT
             s.id, s.run_id, s.planner_task_id, s.title, s.instruction, s.status, s.attempt_count,
             s.output, s.error_message, s.commit_sha, s.worktree_path, s.mount_path, s.started_at,
             s.completed_at, s.updated_at
           FROM agent_run_subtasks s
           JOIN agent_runs r ON r.id = s.run_id
           WHERE r.thread_id = ?1
           ORDER BY s.updated_at DESC
           LIMIT ?2`
        )
        .all(threadId, options.limit),
      agentRunExperiments: db
        .query(
          `SELECT
             e.id, e.run_id, e.status, e.virtual_branch_name, e.repo_mount_path, e.project_mount_path,
             e.base_commit_sha, e.base_branch_name, e.base_dirty_fingerprint, e.head_commit_sha,
             e.files_changed, e.insertions, e.deletions, e.promoted_at, e.discarded_at, e.created_at, e.updated_at
           FROM agent_run_experiments e
           JOIN agent_runs r ON r.id = e.run_id
           WHERE r.thread_id = ?1
           ORDER BY e.updated_at DESC
           LIMIT ?2`
        )
        .all(threadId, options.limit),
      memoryEntries: db
        .query(
          `SELECT
             id, run_id, kind, status, title, summary, evidence, tags_json, path_globs_json,
             confidence, pinned, hit_count, last_hit_at, source_commit_sha, created_at, updated_at
           FROM memory_entries
           WHERE thread_id = ?1
           ORDER BY updated_at DESC
           LIMIT ?2`
        )
        .all(threadId, options.limit),
      memoryRetrievals: db
        .query(
          `SELECT
             mr.id, mr.run_id, mr.owner, mr.subagent_id, mr.query_text, mr.entry_ids_json, mr.created_at
           FROM memory_retrievals mr
           JOIN agent_runs r ON r.id = mr.run_id
           WHERE r.thread_id = ?1
           ORDER BY mr.created_at DESC
           LIMIT ?2`
        )
        .all(threadId, options.limit),
      notifications: db
        .query(
          `SELECT
             id, kind, interactive, run_id, assistant_id, question_id, session_id, tool_call_id,
             background_run_id, job_id, payload_json, created_at, read_at, archived_at
           FROM notifications
           WHERE thread_id = ?1
           ORDER BY created_at DESC
           LIMIT ?2`
        )
        .all(threadId, options.limit),
      backgroundJobs: db
        .query(
          `SELECT
             id, project_id, assistant_id, template_id, created_from_run_id, kind, name, description,
             schedule_input, timezone, status, risk_level, next_run_at, last_run_at, last_enqueued_at,
             created_at, updated_at
           FROM background_jobs
           WHERE automation_thread_id = ?1
           ORDER BY updated_at DESC
           LIMIT ?2`
        )
        .all(threadId, options.limit),
      backgroundJobRuns: db
        .query(
          `SELECT
             id, job_id, project_id, assistant_id, trigger_source, status, risk_level, approval_status,
             skipped_occurrence_count, linked_agent_run_id, summary, failure_message, queued_at,
             started_at, completed_at, created_at, updated_at
           FROM background_job_runs
           WHERE automation_thread_id = ?1
           ORDER BY updated_at DESC
           LIMIT ?2`
        )
        .all(threadId, options.limit),
      backgroundJobRunEvents: db
        .query(
          `SELECT
             e.id, e.run_id, e.ordinal, e.stage, e.message, e.detail_json, e.created_at
           FROM background_job_run_events e
           JOIN background_job_runs r ON r.id = e.run_id
           WHERE r.automation_thread_id = ?1
           ORDER BY e.created_at DESC, e.ordinal DESC
           LIMIT ?2`
        )
        .all(threadId, options.limit),
      runIds
    };

    return report;
  }

  const assistantThread = db
    .query(
      `SELECT
         t.id,
         t.assistant_id,
         t.session_id,
         t.memory_summary_content,
         t.memory_summary_updated_at,
         t.updated_at,
         t.created_at,
         a.name AS assistant_name,
         a.scope AS assistant_scope,
         a.project_id AS assistant_project_id,
         a.agent_id,
         a.mode_id,
         a.execution_model_id,
         a.run_state,
         a.bootstrap_state,
         a.latest_activity_at
       FROM assistant_threads t
       JOIN assistants a ON a.id = t.assistant_id
       WHERE t.id = ?1`
    )
    .get(threadId) as Record<string, unknown> | null;

  if (assistantThread) {
    const assistantId = String(assistantThread.assistant_id);
    return {
      lookup: {
        threadId,
        threadType: "assistant",
        dbPath: options.dbPath,
        limit: options.limit
      },
      thread: assistantThread,
      counts: [
        countRow(db, "assistantMessages", `SELECT COUNT(*) AS count FROM assistant_messages WHERE assistant_thread_id = ?1`, threadId),
        countRow(db, "assistantTodos", `SELECT COUNT(*) AS count FROM assistant_todos WHERE assistant_id = ?1`, assistantId),
        countRow(db, "assistantLearnings", `SELECT COUNT(*) AS count FROM assistant_learnings WHERE assistant_id = ?1`, assistantId),
        countRow(db, "assistantQuestions", `SELECT COUNT(*) AS count FROM assistant_questions WHERE assistant_id = ?1`, assistantId),
        countRow(db, "assistantLogEntries", `SELECT COUNT(*) AS count FROM assistant_log_entries WHERE assistant_id = ?1`, assistantId),
        countRow(db, "assistantAssetRefs", `SELECT COUNT(*) AS count FROM assistant_asset_refs WHERE assistant_id = ?1`, assistantId),
        countRow(db, "backgroundJobs", `SELECT COUNT(*) AS count FROM background_jobs WHERE assistant_id = ?1`, assistantId)
      ],
      assistantMessages: db
        .query(
          `SELECT id, role, kind, content, metadata_json, created_at
           FROM assistant_messages
           WHERE assistant_thread_id = ?1
           ORDER BY created_at DESC
           LIMIT ?2`
        )
        .all(threadId, options.limit),
      assistantTodos: db
        .query(
          `SELECT
             id, title, description, state, sort_order, blocker_reason, source,
             created_at, updated_at, completed_at, cancelled_at
           FROM assistant_todos
           WHERE assistant_id = ?1
           ORDER BY sort_order ASC, updated_at DESC
           LIMIT ?2`
        )
        .all(assistantId, options.limit),
      assistantLearnings: db
        .query(
          `SELECT id, summary, source, confidence, created_at
           FROM assistant_learnings
           WHERE assistant_id = ?1
           ORDER BY created_at DESC
           LIMIT ?2`
        )
        .all(assistantId, options.limit),
      assistantQuestions: db
        .query(
          `SELECT
             id, prompt, status, answer_text, linked_todo_ids_json, asked_at, answered_at
           FROM assistant_questions
           WHERE assistant_id = ?1
           ORDER BY asked_at DESC
           LIMIT ?2`
        )
        .all(assistantId, options.limit),
      assistantLogEntries: db
        .query(
          `SELECT id, level, summary, detail, details_json, created_at
           FROM assistant_log_entries
           WHERE assistant_id = ?1
           ORDER BY created_at DESC
           LIMIT ?2`
        )
        .all(assistantId, options.limit),
      assistantAssetRefs: db
        .query(
          `SELECT id, kind, label, value, created_at
           FROM assistant_asset_refs
           WHERE assistant_id = ?1
           ORDER BY created_at DESC
           LIMIT ?2`
        )
        .all(assistantId, options.limit),
      backgroundJobs: db
        .query(
          `SELECT
             id, automation_thread_id, template_id, created_from_run_id, kind, name, description,
             schedule_input, timezone, status, risk_level, next_run_at, last_run_at, last_enqueued_at,
             created_at, updated_at
           FROM background_jobs
           WHERE assistant_id = ?1
           ORDER BY updated_at DESC
           LIMIT ?2`
        )
        .all(assistantId, options.limit)
    };
  }

  return {
    lookup: {
      threadId,
      threadType: "missing",
      dbPath: options.dbPath,
      limit: options.limit
    },
    error: "Thread id not found in project_threads or assistant_threads",
    hints: [
      "Check HARNESS_DB_PATH or pass --db.",
      "If you are inside a BranchFS mount, the mount may have a fresh .local/harness.db.",
      "If recovery created a fallback DB, inspect the recovered file instead of the default path."
    ]
  };
}

function countRow(db: Database, label: string, sql: string, value: string): SectionCount {
  const row = db.query(sql).get(value) as { count?: number } | null;
  return { label, count: row?.count ?? 0 };
}

function renderReport(report: Record<string, unknown>) {
  const lines: string[] = [];
  const lookup = report.lookup as Record<string, unknown>;
  lines.push(`lookup-thread ${lookup.threadId}`);
  lines.push(`type: ${lookup.threadType}`);
  lines.push(`db: ${lookup.dbPath}`);

  if (report.error) {
    lines.push("");
    lines.push(`error: ${report.error}`);
    const hints = report.hints as string[] | undefined;
    if (hints?.length) {
      lines.push("hints:");
      for (const hint of hints) {
        lines.push(`- ${hint}`);
      }
    }
    return lines.join("\n");
  }

  lines.push("");
  lines.push("counts:");
  for (const count of (report.counts as SectionCount[] | undefined) ?? []) {
    lines.push(`- ${count.label}: ${count.count}`);
  }

  lines.push("");
  lines.push("thread:");
  lines.push(renderObject(report.thread as Record<string, unknown>, 2));

  if (report.lineage) {
    lines.push("");
    lines.push("lineage:");
    lines.push(renderObject(report.lineage as Record<string, unknown>, 2));
  }

  const orderedSections = [
    "recentMessages",
    "agentRuns",
    "agentRunQuestions",
    "agentRunSubtasks",
    "agentRunExperiments",
    "memoryEntries",
    "memoryRetrievals",
    "notifications",
    "backgroundJobs",
    "backgroundJobRuns",
    "backgroundJobRunEvents",
    "assistantMessages",
    "assistantTodos",
    "assistantLearnings",
    "assistantQuestions",
    "assistantLogEntries",
    "assistantAssetRefs"
  ];

  for (const section of orderedSections) {
    const value = report[section];
    if (!Array.isArray(value) || value.length === 0) {
      continue;
    }
    lines.push("");
    lines.push(`${section}:`);
    for (const row of value as Record<string, unknown>[]) {
      lines.push(renderObject(row, 2));
    }
  }

  return lines.join("\n");
}

function renderObject(value: unknown, indent: number) {
  const printable = compactForText(value);
  const spacing = " ".repeat(indent);
  return JSON.stringify(printable, null, 2)
    .split("\n")
    .map((line) => `${spacing}${line}`)
    .join("\n");
}

function compactForText(value: unknown): unknown {
  if (typeof value === "string") {
    const collapsed = value.replace(/\s+/g, " ").trim();
    if (collapsed.length <= 220) {
      return collapsed;
    }
    return `${collapsed.slice(0, 217)}...`;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => compactForText(entry));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, compactForText(entry)])
    );
  }
  return value;
}
