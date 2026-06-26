import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { resolveHarnessDbPath } from "./harness-db-path";

export type AssistantJobsOptions = {
  dbPath: string;
  assistant?: string;
  project?: string;
  json: boolean;
  limit: number;
};

type CliParseResult = {
  help: boolean;
  options: AssistantJobsOptions;
};

type Row = Record<string, unknown>;

const DEFAULT_LIMIT = 10;

const HELP_TEXT = `assistant-jobs.ts

Usage:
  bun.cmd .agents/skills/assistant-actions/scripts/assistant-jobs.ts [--assistant <name-or-id>] [--project <name-or-id-or-root>] [--db <path>] [--limit <n>] [--json]

Options:
  --assistant <value>  Optional assistant id or exact/fuzzy name
  --project <value>    Optional project id, name, or root path
  --db <path>          Override DB path. Default: HARNESS_DB_PATH or ~/.ai-harness-template/harness.db
  --limit <n>          Recent job runs to show. Default: 10
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
    const report = buildAssistantJobsReport(parsed.options);
    console.log(parsed.options.json ? JSON.stringify(report, null, 2) : renderAssistantJobsReport(report));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    console.error("");
    console.error(HELP_TEXT);
    process.exit(1);
  }
}

export function parseArgs(argv: string[]): CliParseResult {
  let dbPath = resolveHarnessDbPath();
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

export function buildAssistantJobsReport(options: AssistantJobsOptions) {
  if (!existsSync(options.dbPath)) {
    throw new Error(`DB not found: ${options.dbPath}`);
  }

  const db = new Database(options.dbPath, { readonly: true });
  try {
    const project = options.project ? resolveProject(db, options.project) : undefined;
    const assistantMatches = options.assistant ? resolveAssistants(db, options.assistant, project?.id) : [];
    if (options.assistant && assistantMatches.length !== 1) {
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

    const assistant = assistantMatches[0];
    const recentRuns = db
      .query(
        `SELECT
           r.id, r.job_id, r.project_id, p.name AS project_name, p.root_path AS project_root_path,
           COALESCE(r.assistant_id, j.assistant_id) AS assistant_id, a.name AS assistant_name,
           j.name AS job_name, j.status AS job_status,
           r.trigger_source, r.status, r.risk_level, r.approval_status, r.summary, r.failure_message,
           r.queued_at, r.started_at, r.completed_at, r.updated_at
         FROM background_job_runs r
         LEFT JOIN background_jobs j ON j.id = r.job_id
         LEFT JOIN assistants a ON a.id = COALESCE(r.assistant_id, j.assistant_id)
         LEFT JOIN projects p ON p.id = r.project_id
         WHERE (?1 IS NULL OR r.project_id = ?1)
           AND (?2 IS NULL OR COALESCE(r.assistant_id, j.assistant_id) = ?2)
         ORDER BY COALESCE(r.updated_at, r.completed_at, r.started_at, r.queued_at) DESC
         LIMIT ?3`
      )
      .all(project?.id ?? null, assistant?.id ?? null, options.limit) as Row[];

    return {
      lookup: {
        dbPath: options.dbPath,
        assistant: options.assistant,
        project: options.project,
        status: "ok"
      },
      project: project ?? null,
      assistant: assistant ?? null,
      recentRuns
    };
  } finally {
    db.close();
  }
}

export function renderAssistantJobsReport(report: Row) {
  const lines: string[] = [];
  const lookup = report.lookup as Row;
  lines.push("assistant-jobs recent");
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

  if (report.project) {
    lines.push("");
    lines.push("project:");
    lines.push(renderObject(report.project, 2));
  }
  if (report.assistant) {
    lines.push("");
    lines.push("assistant:");
    lines.push(renderObject(report.assistant, 2));
  }

  const recentRuns = report.recentRuns as Row[] | undefined;
  lines.push("");
  lines.push(`recentRuns: ${recentRuns?.length ?? 0}`);
  for (const run of recentRuns ?? []) {
    lines.push(renderObject(run, 2));
  }

  return lines.join("\n");
}

function resolveAssistants(db: Database, assistant: string, projectId: string | undefined) {
  const needle = assistant.trim().toLowerCase();
  const rows = db
    .query(
      `SELECT a.id, a.name, a.scope, a.project_id, a.run_state, a.bootstrap_state, a.deleted_at, p.name AS project_name
       FROM assistants a
       LEFT JOIN projects p ON p.id = a.project_id
       WHERE a.deleted_at IS NULL`
    )
    .all() as Row[];
  const scopedRows = projectId ? rows.filter((row) => row.scope === "global" || row.project_id === projectId) : rows;
  const exact = scopedRows.filter((row) => String(row.id).toLowerCase() === needle || String(row.name).toLowerCase() === needle);
  if (exact.length > 0) {
    return exact;
  }
  return scopedRows.filter((row) => String(row.name).toLowerCase().includes(needle));
}

function resolveProject(db: Database, project: string) {
  const needle = project.trim().toLowerCase();
  const rows = db.query(`SELECT id, name, root_path FROM projects ORDER BY last_opened_at DESC, created_at ASC`).all() as Row[];
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
  return matches[0]!;
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
