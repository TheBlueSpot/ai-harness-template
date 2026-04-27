import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import path from "node:path";

export type AssistantStateOptions = {
  dbPath: string;
  assistant?: string;
  project?: string;
  json: boolean;
  limit: number;
};

type CliParseResult = {
  help: boolean;
  options: AssistantStateOptions;
};

type Row = Record<string, unknown>;

const DEFAULT_LIMIT = 20;

const HELP_TEXT = `assistant-state.ts

Usage:
  bun.cmd .agents/skills/assistant-actions/scripts/assistant-state.ts --assistant <name-or-id> [--project <name-or-id>] [--db <path>] [--limit <n>] [--json]

Options:
  --assistant <value>  Assistant id or exact/fuzzy name
  --project <value>    Project id, name, or root path to disambiguate project assistants
  --db <path>          Override DB path. Default: HARNESS_DB_PATH or .local/harness.db
  --limit <n>          Limit rows shown per list section. Default: 20
  --json               Emit machine-readable JSON instead of a text report
  --help               Show this help
`;

if (import.meta.main) {
  try {
    const parsed = parseArgs(Bun.argv.slice(2));
    if (parsed.help) {
      console.log(HELP_TEXT);
      process.exit(0);
    }
    const report = buildAssistantStateReport(parsed.options);
    console.log(parsed.options.json ? JSON.stringify(report, null, 2) : renderAssistantStateReport(report));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    console.error("");
    console.error(HELP_TEXT);
    process.exit(1);
  }
}

export function parseArgs(argv: string[]): CliParseResult {
  let dbPath = Bun.env.HARNESS_DB_PATH ?? path.join(process.cwd(), ".local", "harness.db");
  let assistant: string | undefined;
  let project: string | undefined;
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
    if (token === "--assistant") {
      assistant = requireValue(argv, index, "--assistant");
      index += 1;
      continue;
    }
    if (token === "--project") {
      project = requireValue(argv, index, "--project");
      index += 1;
      continue;
    }
    if (token === "--db") {
      dbPath = requireValue(argv, index, "--db");
      index += 1;
      continue;
    }
    if (token === "--limit") {
      limit = parseLimit(requireValue(argv, index, "--limit"));
      index += 1;
      continue;
    }
    if (token.startsWith("--")) {
      throw new Error(`Unknown option: ${token}`);
    }
    throw new Error(`Unexpected argument: ${token}`);
  }

  if (!assistant && !help) {
    throw new Error("--assistant is required");
  }

  return {
    help,
    options: {
      dbPath,
      assistant,
      project,
      json,
      limit
    }
  };
}

export function buildAssistantStateReport(options: AssistantStateOptions) {
  if (!existsSync(options.dbPath)) {
    throw new Error(`DB not found: ${options.dbPath}`);
  }

  const db = new Database(options.dbPath, { readonly: true });
  try {
    const project = options.project ? resolveProject(db, options.project) : undefined;
    const assistantMatches = resolveAssistants(db, options.assistant ?? "", project?.id);
    if (assistantMatches.length !== 1) {
      return {
        lookup: {
          dbPath: options.dbPath,
          assistant: options.assistant,
          project: options.project,
          status: assistantMatches.length === 0 ? "missing" : "ambiguous"
        },
        matches: assistantMatches
      };
    }

    const assistant = assistantMatches[0]!;
    const assistantId = String(assistant.id);
    const thread = db
      .query(
        `SELECT id, session_id, memory_summary_content, memory_summary_updated_at, updated_at, created_at
         FROM assistant_threads
         WHERE assistant_id = ?1`
      )
      .get(assistantId) as Row | null;

    return {
      lookup: {
        dbPath: options.dbPath,
        assistant: options.assistant,
        project: options.project,
        status: "ok"
      },
      assistant,
      project: assistant.project_id ? readProjectById(db, String(assistant.project_id)) : null,
      thread,
      counts: [
        countRow(db, "messages", `SELECT COUNT(*) AS count FROM assistant_messages WHERE assistant_thread_id = ?1`, String(thread?.id ?? "")),
        countRow(db, "todos", `SELECT COUNT(*) AS count FROM assistant_todos WHERE assistant_id = ?1`, assistantId),
        countRow(db, "learnings", `SELECT COUNT(*) AS count FROM assistant_learnings WHERE assistant_id = ?1`, assistantId),
        countRow(db, "questions", `SELECT COUNT(*) AS count FROM assistant_questions WHERE assistant_id = ?1`, assistantId),
        countRow(db, "logs", `SELECT COUNT(*) AS count FROM assistant_log_entries WHERE assistant_id = ?1`, assistantId),
        countRow(db, "jobs", `SELECT COUNT(*) AS count FROM background_jobs WHERE assistant_id = ?1`, assistantId),
        countRow(db, "jobRuns", `SELECT COUNT(*) AS count FROM background_job_runs WHERE assistant_id = ?1`, assistantId)
      ],
      messages: thread?.id
        ? db
            .query(
              `SELECT id, role, content, created_at
               FROM assistant_messages
               WHERE assistant_thread_id = ?1
               ORDER BY created_at DESC
               LIMIT ?2`
            )
            .all(String(thread.id), options.limit)
        : [],
      todos: db
        .query(
          `SELECT id, title, description, state, sort_order, blocker_reason, source, updated_at
           FROM assistant_todos
           WHERE assistant_id = ?1
           ORDER BY sort_order ASC, updated_at DESC
           LIMIT ?2`
        )
        .all(assistantId, options.limit),
      learnings: db
        .query(
          `SELECT id, summary, source, confidence, created_at
           FROM assistant_learnings
           WHERE assistant_id = ?1
           ORDER BY created_at DESC
           LIMIT ?2`
        )
        .all(assistantId, options.limit),
      questions: db
        .query(
          `SELECT id, prompt, status, answer_text, asked_at, answered_at
           FROM assistant_questions
           WHERE assistant_id = ?1
           ORDER BY asked_at DESC
           LIMIT ?2`
        )
        .all(assistantId, options.limit),
      logs: db
        .query(
          `SELECT id, level, summary, detail, created_at
           FROM assistant_log_entries
           WHERE assistant_id = ?1
           ORDER BY created_at DESC
           LIMIT ?2`
        )
        .all(assistantId, options.limit),
      backgroundJobs: db
        .query(
          `SELECT id, project_id, automation_thread_id, kind, name, description, schedule_input, timezone, status, risk_level, next_run_at, last_run_at, updated_at
           FROM background_jobs
           WHERE assistant_id = ?1
           ORDER BY next_run_at ASC, updated_at DESC
           LIMIT ?2`
        )
        .all(assistantId, options.limit),
      backgroundJobRuns: db
        .query(
          `SELECT id, job_id, project_id, trigger_source, status, risk_level, approval_status, summary, failure_message, queued_at, started_at, completed_at, updated_at
           FROM background_job_runs
           WHERE assistant_id = ?1
           ORDER BY updated_at DESC
           LIMIT ?2`
        )
        .all(assistantId, options.limit)
    };
  } finally {
    db.close();
  }
}

export function renderAssistantStateReport(report: Row) {
  const lines: string[] = [];
  const lookup = report.lookup as Row;
  lines.push(`assistant-state ${lookup.assistant ?? ""}`);
  lines.push(`status: ${lookup.status}`);
  lines.push(`db: ${lookup.dbPath}`);

  if (lookup.status !== "ok") {
    const matches = report.matches as Row[] | undefined;
    lines.push("");
    lines.push(lookup.status === "missing" ? "No matching assistant." : "Multiple matching assistants.");
    for (const match of matches ?? []) {
      lines.push(`- ${match.name} (${match.id}) scope=${match.scope} project=${match.project_name ?? match.project_id ?? "global"}`);
    }
    return lines.join("\n");
  }

  lines.push("");
  lines.push("assistant:");
  lines.push(renderObject(report.assistant, 2));

  if (report.project) {
    lines.push("");
    lines.push("project:");
    lines.push(renderObject(report.project, 2));
  }

  lines.push("");
  lines.push("counts:");
  for (const count of (report.counts as Row[] | undefined) ?? []) {
    lines.push(`- ${count.label}: ${count.count}`);
  }

  for (const section of ["todos", "questions", "backgroundJobs", "backgroundJobRuns", "learnings", "logs", "messages"]) {
    const rows = report[section];
    if (!Array.isArray(rows) || rows.length === 0) {
      continue;
    }
    lines.push("");
    lines.push(`${section}:`);
    for (const row of rows as Row[]) {
      lines.push(renderObject(row, 2));
    }
  }

  return lines.join("\n");
}

function resolveAssistants(db: Database, assistant: string, projectId: string | undefined) {
  const needle = assistant.trim().toLowerCase();
  const rows = db
    .query(
      `SELECT
         a.id, a.name, a.scope, a.project_id, a.description, a.agent_id, a.mode_id, a.execution_model_id,
         a.run_state, a.bootstrap_state, a.failure_streak_count, a.circuit_breaker_state,
         a.circuit_breaker_reason, a.latest_activity_at, a.updated_at,
         p.name AS project_name, p.root_path AS project_root_path
       FROM assistants a
       LEFT JOIN projects p ON p.id = a.project_id
       WHERE a.deleted_at IS NULL`
    )
    .all() as Row[];

  const scopedRows = projectId
    ? rows.filter((row) => row.scope === "global" || row.project_id === projectId)
    : rows;
  const exact = scopedRows.filter((row) => String(row.id).toLowerCase() === needle || String(row.name).toLowerCase() === needle);
  if (exact.length > 0) {
    return exact;
  }
  return scopedRows.filter((row) => String(row.name).toLowerCase().includes(needle));
}

function resolveProject(db: Database, project: string) {
  const needle = project.trim().toLowerCase();
  const rows = db
    .query(`SELECT id, name, root_path FROM projects ORDER BY last_opened_at DESC, created_at ASC`)
    .all() as Row[];
  const exact = rows.filter(
    (row) =>
      String(row.id).toLowerCase() === needle ||
      String(row.name).toLowerCase() === needle ||
      String(row.root_path).toLowerCase() === needle
  );
  const matches = exact.length > 0 ? exact : rows.filter((row) => String(row.name).toLowerCase().includes(needle));
  if (matches.length !== 1) {
    throw new Error(matches.length === 0 ? `Project not found: ${project}` : `Project is ambiguous: ${project}`);
  }
  return matches[0] as { id: string; name: string; root_path: string };
}

function readProjectById(db: Database, projectId: string) {
  return db.query(`SELECT id, name, root_path FROM projects WHERE id = ?1`).get(projectId) as Row | null;
}

function countRow(db: Database, label: string, sql: string, value: string) {
  const row = db.query(sql).get(value) as { count?: number } | null;
  return { label, count: row?.count ?? 0 };
}

function requireValue(argv: string[], index: number, flagName: string) {
  const value = argv[index + 1];
  if (!value) {
    throw new Error(`${flagName} requires a value`);
  }
  return value;
}

function parseLimit(rawValue: string) {
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("--limit must be a positive integer");
  }
  return parsed;
}

function renderObject(value: unknown, indent: number) {
  return JSON.stringify(compactForText(value), null, 2)
    .split("\n")
    .map((line) => `${" ".repeat(indent)}${line}`)
    .join("\n");
}

function compactForText(value: unknown): unknown {
  if (typeof value === "string") {
    const collapsed = value.replace(/\s+/g, " ").trim();
    return collapsed.length <= 220 ? collapsed : `${collapsed.slice(0, 217)}...`;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => compactForText(entry));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, compactForText(entry)]));
  }
  return value;
}
