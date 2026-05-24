import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { resolveHarnessDbPath } from "../harness/cli/src/harness-paths";

type FailedRunRow = {
  id: string;
  job_id: string;
  job_name: string | null;
  assistant_name: string | null;
  project_name: string | null;
  failure_category: string | null;
  failure_message: string | null;
  timed_out_at: string | null;
  queued_at: string;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
  duration_seconds: number | null;
  last_heartbeat_at: string | null;
  heartbeat_stage: string | null;
  heartbeat_detail: string | null;
  controller_lease_expires_at: string | null;
  linked_agent_run_id: string | null;
  agent_status: string | null;
  agent_failure_category: string | null;
  agent_failure_message: string | null;
};

type FailureGroupRow = {
  job_name: string | null;
  failure_category: string | null;
  count: number;
  timed_out_count: number;
  avg_duration_seconds: number | null;
  latest_at: string | null;
};

type CliOptions = {
  dbPath: string;
  limit: number;
  json: boolean;
};

if (import.meta.main) {
  try {
    const options = parseArgs(Bun.argv.slice(2));
    const report = buildReport(options);
    console.log(options.json ? JSON.stringify(report, null, 2) : renderReport(report));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error("");
    console.error("Usage: bun.cmd scripts/background-job-failures.ts [--limit 10] [--db <path>] [--json]");
    process.exit(1);
  }
}

function parseArgs(argv: string[]): CliOptions {
  let dbPath = resolveHarnessDbPath();
  let limit = 10;
  let json = false;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--json") {
      json = true;
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
    if (token === "--help" || token === "-h") {
      throw new Error("Show help");
    }
    throw new Error(`Unknown argument: ${token ?? ""}`);
  }

  return { dbPath, limit, json };
}

function buildReport(options: CliOptions) {
  if (!existsSync(options.dbPath)) {
    throw new Error(`DB not found: ${options.dbPath}`);
  }

  const db = new Database(options.dbPath, { readonly: true });
  try {
    const failedRuns = db
      .query<FailedRunRow, [string, number]>(
        `SELECT
           r.id,
           r.job_id,
           j.name AS job_name,
           a.name AS assistant_name,
           p.name AS project_name,
           r.failure_category,
           r.failure_message,
           r.timed_out_at,
           r.queued_at,
           r.started_at,
           r.completed_at,
           r.updated_at,
           CASE
             WHEN r.started_at IS NULL THEN NULL
             ELSE ROUND((julianday(COALESCE(r.completed_at, r.updated_at)) - julianday(r.started_at)) * 86400, 1)
           END AS duration_seconds,
           r.last_heartbeat_at,
           r.heartbeat_stage,
           r.heartbeat_detail,
           r.controller_lease_expires_at,
           r.linked_agent_run_id,
           ar.status AS agent_status,
           ar.failure_category AS agent_failure_category,
           ar.failure_message AS agent_failure_message
         FROM background_job_runs r
         LEFT JOIN background_jobs j ON j.id = r.job_id
         LEFT JOIN assistants a ON a.id = r.assistant_id
         LEFT JOIN projects p ON p.id = r.project_id
         LEFT JOIN agent_runs ar ON ar.id = r.linked_agent_run_id
         WHERE r.status = ?1
         ORDER BY COALESCE(r.completed_at, r.updated_at, r.started_at, r.queued_at) DESC
         LIMIT ?2`
      )
      .all("failed", options.limit);

    const groups = db
      .query<FailureGroupRow, [number]>(
        `SELECT
           j.name AS job_name,
           r.failure_category,
           COUNT(*) AS count,
           SUM(CASE WHEN r.timed_out_at IS NULL THEN 0 ELSE 1 END) AS timed_out_count,
           ROUND(AVG(CASE
             WHEN r.started_at IS NULL THEN NULL
             ELSE (julianday(COALESCE(r.completed_at, r.updated_at)) - julianday(r.started_at)) * 86400
           END), 1) AS avg_duration_seconds,
           MAX(COALESCE(r.completed_at, r.updated_at, r.started_at, r.queued_at)) AS latest_at
         FROM background_job_runs r
         LEFT JOIN background_jobs j ON j.id = r.job_id
         WHERE r.status = 'failed'
         GROUP BY j.name, r.failure_category
         ORDER BY count DESC, latest_at DESC
         LIMIT ?1`
      )
      .all(Math.max(options.limit, 20));

    return {
      dbPath: options.dbPath,
      limit: options.limit,
      failedRuns,
      groups
    };
  } finally {
    db.close();
  }
}

function renderReport(report: ReturnType<typeof buildReport>) {
  const lines = [`background-job-failures db=${report.dbPath}`, ""];
  lines.push("last failed runs:");
  for (const run of report.failedRuns) {
    const timedOut = run.timed_out_at ? `timeout=${run.timed_out_at}` : "timeout=no";
    lines.push(
      `- ${run.completed_at ?? run.updated_at} ${run.job_name ?? run.job_id} cat=${run.failure_category ?? "none"} ${timedOut} duration=${run.duration_seconds ?? "?"}s`
    );
    lines.push(
      `  run=${run.id} assistant=${run.assistant_name ?? "none"} project=${run.project_name ?? "unknown"} heartbeat=${run.heartbeat_stage ?? "none"} lease=${run.controller_lease_expires_at ?? "none"} agent=${run.agent_status ?? "none"}`
    );
    if (run.failure_message) {
      lines.push(`  message=${run.failure_message.replace(/\s+/g, " ").trim().slice(0, 240)}`);
    }
  }

  lines.push("");
  lines.push("groups:");
  for (const group of report.groups) {
    lines.push(
      `- ${group.job_name ?? "unknown"} cat=${group.failure_category ?? "none"} count=${group.count} timedOut=${group.timed_out_count} avg=${group.avg_duration_seconds ?? "?"}s latest=${group.latest_at ?? "unknown"}`
    );
  }
  return lines.join("\n");
}

function requireValue(argv: string[], index: number, flagName: string) {
  const value = argv[index + 1];
  if (!value) {
    throw new Error(`${flagName} requires a value`);
  }
  return value;
}

function parseLimit(value: string) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 1000) {
    throw new Error("--limit must be 1..1000");
  }
  return parsed;
}
