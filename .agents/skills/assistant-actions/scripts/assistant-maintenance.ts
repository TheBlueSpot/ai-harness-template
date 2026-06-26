import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { resolveHarnessDbPath } from "./harness-db-path";

type MaintenanceAction =
  | "remove-jobs"
  | "remove-project-assistants"
  | "rebootstrap"
  | "pause-assistants"
  | "start-jobs"
  | "reconcile-orrn-todos";

export type AssistantMaintenanceOptions = {
  dbPath: string;
  action?: MaintenanceAction;
  assistant?: string;
  assistants?: string[];
  project?: string;
  all?: boolean;
  execute: boolean;
  json: boolean;
  url?: string;
  commandTimeoutMs?: number;
};

type CliParseResult = {
  help: boolean;
  options: AssistantMaintenanceOptions;
};

type Row = Record<string, unknown>;

const HELP_TEXT = `assistant-maintenance.ts

Usage:
  bun.cmd .agents/skills/assistant-actions/scripts/assistant-maintenance.ts --action <remove-jobs|remove-project-assistants|rebootstrap|pause-assistants|start-jobs|reconcile-orrn-todos> [--assistant <name-or-id>] [--project <name-or-id-or-root>] [--all] [--db <path>] [--execute] [--json]

Examples:
  bun.cmd .agents/skills/assistant-actions/scripts/assistant-maintenance.ts --action remove-jobs --assistant "Release watcher" --project "Docs" --execute
  bun.cmd .agents/skills/assistant-actions/scripts/assistant-maintenance.ts --action remove-project-assistants --project "Docs" --execute
  bun.cmd .agents/skills/assistant-actions/scripts/assistant-maintenance.ts --action rebootstrap --assistant "Release watcher" --project "Docs" --execute
  bun.cmd .agents/skills/assistant-actions/scripts/assistant-maintenance.ts --action rebootstrap --project "Docs" --execute
  bun.cmd .agents/skills/assistant-actions/scripts/assistant-maintenance.ts --action pause-assistants --project "Docs" --execute
  bun.cmd .agents/skills/assistant-actions/scripts/assistant-maintenance.ts --action pause-assistants --all --execute
  bun.cmd .agents/skills/assistant-actions/scripts/assistant-maintenance.ts --action start-jobs --assistant "Release watcher" --project "Docs" --execute --url http://localhost:8787
  bun.cmd .agents/skills/assistant-actions/scripts/assistant-maintenance.ts --action reconcile-orrn-todos --assistant "Orrn" --project "context" --execute

Options:
  --action <value>     Maintenance action to plan or execute
  --assistant <value>  Assistant id or exact/fuzzy name; may be repeated for subsets
  --project <value>    Project id, name, or root path; required for project-wide actions
  --all                Target all non-deleted assistants; with --project, targets project-scoped assistants only
  --db <path>          Override DB path. Default: HARNESS_DB_PATH or ~/.ai-harness-template/harness.db
  --url <value>        Harness server URL for live start-jobs execution. Default: HARNESS_URL or http://localhost:8787
  --execute            Apply the mutation. Omit for a dry run.
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
    const result =
      parsed.options.execute && parsed.options.action === "start-jobs"
        ? await runLiveAssistantMaintenance(parsed.options)
        : runAssistantMaintenance(parsed.options);
    console.log(parsed.options.json ? JSON.stringify(result, null, 2) : renderAssistantMaintenanceResult(result));
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
  let action: MaintenanceAction | undefined;
  let assistant: string | undefined;
  const assistants: string[] = [];
  let project: string | undefined;
  let all = false;
  let execute = false;
  let json = false;
  let url = process.env.HARNESS_URL;
  let commandTimeoutMs = 1_000;
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
    if (token === "--execute") {
      execute = true;
      continue;
    }
    if (token === "--all") {
      all = true;
      continue;
    }
    if (token === "--json") {
      json = true;
      continue;
    }
    if (token === "--action") {
      action = parseAction(requireValue(argv, index, "--action"));
      index += 1;
      continue;
    }
    if (token === "--assistant") {
      const value = requireValue(argv, index, "--assistant");
      assistant ??= value;
      assistants.push(value);
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
    if (token === "--url") {
      url = requireValue(argv, index, "--url");
      index += 1;
      continue;
    }
    if (token === "--timeout-ms") {
      commandTimeoutMs = parsePositiveInteger(requireValue(argv, index, "--timeout-ms"), "--timeout-ms");
      index += 1;
      continue;
    }
    if (token.startsWith("--")) {
      throw new Error(`Unknown option: ${token}`);
    }
    throw new Error(`Unexpected argument: ${token}`);
  }

  if (!action && !help) {
    throw new Error("--action is required");
  }

  return {
    help,
    options: {
      dbPath,
      action,
      assistant,
      assistants,
      project,
      all,
      execute,
      json,
      url,
      commandTimeoutMs
    }
  };
}

export function runAssistantMaintenance(options: AssistantMaintenanceOptions) {
  if (!options.action) {
    throw new Error("--action is required");
  }
  if (!existsSync(options.dbPath)) {
    throw new Error(`DB not found: ${options.dbPath}`);
  }

  const db = new Database(options.dbPath);
  try {
    db.exec("PRAGMA foreign_keys = ON");
    const project = options.project ? resolveProject(db, options.project) : undefined;
    const assistants = resolveMaintenanceAssistants(db, options.action, getAssistantSelectors(options), project, Boolean(options.all));
    const plan = buildPlan(db, options, project, assistants);
    if (options.execute) {
      applyPlan(db, options.action, assistants, plan.now);
    }
    return {
      lookup: {
        dbPath: options.dbPath,
        action: options.action,
        assistant: options.assistant,
        assistants: getAssistantSelectors(options),
        project: options.project,
        all: Boolean(options.all),
        execute: options.execute,
        status: "ok"
      },
      project: project ?? null,
      assistants,
      plan,
      applied: options.execute
    };
  } finally {
    db.close();
  }
}

export function renderAssistantMaintenanceResult(result: Row) {
  const lookup = result.lookup as Row;
  const plan = result.plan as Row;
  const lines = [
    `assistant-maintenance ${lookup.action}`,
    `status: ${lookup.status}`,
    `mode: ${lookup.execute ? "execute" : "dry-run"}`,
    `db: ${lookup.dbPath}`,
    "",
    `assistants: ${plan.assistantCount}`,
    `background jobs matched: ${plan.backgroundJobCount}`,
    `active job runs matched: ${plan.activeRunCount}`,
    `assistants to remove: ${plan.assistantsToRemoveCount}`,
    `assistants to rebootstrap: ${plan.assistantsToRebootstrapCount}`,
    `assistants to pause: ${plan.assistantsToPauseCount}`,
    `jobs to start: ${plan.jobsToStartCount}`
  ];

  if (plan.liveCommandCount) {
    lines.push(`live commands sent: ${plan.liveCommandCount}`);
  }

  if (!lookup.execute) {
    lines.push("");
    lines.push("No changes applied. Re-run with --execute to mutate the DB.");
  }

  const assistants = result.assistants as Row[] | undefined;
  if (assistants && assistants.length > 0) {
    lines.push("");
    lines.push("matched assistants:");
    for (const assistant of assistants) {
      lines.push(`- ${assistant.name} (${assistant.id}) scope=${assistant.scope} project=${assistant.project_name ?? assistant.project_id ?? "global"}`);
    }
  }

  const jobsToStart = plan.jobsToStart as Row[] | undefined;
  if (jobsToStart && jobsToStart.length > 0) {
    lines.push("");
    lines.push("jobs to start:");
    for (const job of jobsToStart) {
      lines.push(`- ${job.name ?? job.id} (${job.id}) assistant=${job.assistant_name ?? job.assistant_id} project=${job.project_name ?? job.project_id}`);
    }
  }

  return lines.join("\n");
}

function buildPlan(db: Database, options: AssistantMaintenanceOptions, project: Row | undefined, assistants: Row[]) {
  if (assistants.length === 0) {
    throw new Error("No matching assistants");
  }
  const assistantIds = assistants.map((assistant) => String(assistant.id));
  const backgroundJobCount = countByAssistantIds(db, "background_jobs", assistantIds);
  const activeRunCount = countActiveRunsByAssistantIds(db, assistantIds);
  const jobsToStart = options.action === "start-jobs" ? listStartableJobsByAssistantIds(db, assistantIds) : [];
  return {
    now: new Date().toISOString(),
    project: project ?? null,
    assistantCount: assistants.length,
    backgroundJobCount,
    activeRunCount,
    assistantsToRemoveCount: options.action === "remove-project-assistants" ? assistants.length : 0,
    assistantsToRebootstrapCount: options.action === "rebootstrap" ? assistants.length : 0,
    assistantsToPauseCount: options.action === "pause-assistants" ? assistants.length : 0,
    jobsToStartCount: jobsToStart.length,
    todoMutationCount: options.action === "reconcile-orrn-todos" ? 10 : 0,
    jobsToStart
  };
}

function applyPlan(db: Database, action: MaintenanceAction, assistants: Row[], now: unknown) {
  if (action === "start-jobs") {
    throw new Error("start-jobs requires live harness execution; pass --execute --url <harness-url>");
  }
  const assistantIds = assistants.map((assistant) => String(assistant.id));
  const timestamp = typeof now === "string" ? now : new Date().toISOString();
  const tx = db.transaction(() => {
    if (action === "remove-jobs" || action === "remove-project-assistants") {
      cancelActiveRuns(db, assistantIds, timestamp, action);
      deleteJobs(db, assistantIds);
    }
    if (action === "remove-project-assistants") {
      softDeleteAssistants(db, assistantIds, timestamp);
    }
    if (action === "rebootstrap") {
      markAssistantsForRebootstrap(db, assistantIds, timestamp);
    }
    if (action === "pause-assistants") {
      pauseAssistants(db, assistantIds, timestamp);
    }
    if (action === "reconcile-orrn-todos") {
      reconcileOrrnTodos(db, assistantIds, timestamp);
    }
  });
  tx();
}

function resolveMaintenanceAssistants(db: Database, action: MaintenanceAction, assistantSelectors: string[], project: Row | undefined, all: boolean) {
  if (action === "remove-project-assistants") {
    if (!project) {
      throw new Error("--project is required for remove-project-assistants");
    }
    return db
      .query(
        `SELECT a.id, a.name, a.scope, a.project_id, a.run_state, a.bootstrap_state, a.deleted_at, p.name AS project_name
         FROM assistants a
         LEFT JOIN projects p ON p.id = a.project_id
         WHERE a.deleted_at IS NULL AND a.scope = 'project' AND a.project_id = ?1
         ORDER BY a.updated_at DESC`
      )
      .all(String(project.id)) as Row[];
  }

  if (assistantSelectors.length > 0) {
    return dedupeRowsById(assistantSelectors.flatMap((selector) => resolveAssistants(db, selector, project ? String(project.id) : undefined)));
  }

  if ((action === "pause-assistants" || action === "start-jobs") && project) {
    return db
      .query(
        `SELECT a.id, a.name, a.scope, a.project_id, a.run_state, a.bootstrap_state, a.deleted_at, p.name AS project_name
         FROM assistants a
         LEFT JOIN projects p ON p.id = a.project_id
         WHERE a.deleted_at IS NULL AND a.scope = 'project' AND a.project_id = ?1
         ORDER BY a.updated_at DESC`
      )
      .all(String(project.id)) as Row[];
  }

  if ((action === "pause-assistants" || action === "start-jobs") && all) {
    return db
      .query(
        `SELECT a.id, a.name, a.scope, a.project_id, a.run_state, a.bootstrap_state, a.deleted_at, p.name AS project_name
         FROM assistants a
         LEFT JOIN projects p ON p.id = a.project_id
         WHERE a.deleted_at IS NULL
         ORDER BY a.updated_at DESC`
      )
      .all() as Row[];
  }

  if (action === "rebootstrap" && project) {
    return db
      .query(
        `SELECT a.id, a.name, a.scope, a.project_id, a.run_state, a.bootstrap_state, a.deleted_at, p.name AS project_name
         FROM assistants a
         LEFT JOIN projects p ON p.id = a.project_id
         WHERE a.deleted_at IS NULL AND a.scope = 'project' AND a.project_id = ?1
         ORDER BY a.updated_at DESC`
      )
      .all(String(project.id)) as Row[];
  }

  if (action === "pause-assistants" || action === "start-jobs") {
    throw new Error(`--assistant, --project, or --all is required for ${action}`);
  }

  throw new Error(action === "rebootstrap" ? "--assistant or --project is required for rebootstrap" : "--assistant is required");
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
  const matches = exact.length > 0 ? exact : scopedRows.filter((row) => String(row.name).toLowerCase().includes(needle));
  if (matches.length !== 1) {
    throw new Error(matches.length === 0 ? `Assistant not found: ${assistant}` : `Assistant is ambiguous: ${assistant}`);
  }
  return matches;
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

function countByAssistantIds(db: Database, table: string, assistantIds: string[]) {
  let count = 0;
  const query = db.query(`SELECT COUNT(*) AS count FROM ${table} WHERE assistant_id = ?1`);
  for (const assistantId of assistantIds) {
    const row = query.get(assistantId) as { count?: number } | null;
    count += row?.count ?? 0;
  }
  return count;
}

function countActiveRunsByAssistantIds(db: Database, assistantIds: string[]) {
  let count = 0;
  const query = db.query(
    `SELECT COUNT(*) AS count
     FROM background_job_runs
     WHERE assistant_id = ?1 AND status IN ('queued', 'awaiting-approval', 'awaiting-user-input', 'running')`
  );
  for (const assistantId of assistantIds) {
    const row = query.get(assistantId) as { count?: number } | null;
    count += row?.count ?? 0;
  }
  return count;
}

function listStartableJobsByAssistantIds(db: Database, assistantIds: string[]) {
  const rows: Row[] = [];
  const query = db.query(
    `SELECT j.id, j.project_id, j.assistant_id, j.status, j.name, a.name AS assistant_name, p.name AS project_name
     FROM background_jobs j
     LEFT JOIN assistants a ON a.id = j.assistant_id
     LEFT JOIN projects p ON p.id = j.project_id
     WHERE j.assistant_id = ?1 AND COALESCE(j.status, 'enabled') != 'disabled'
     ORDER BY p.name ASC, a.name ASC, j.updated_at DESC`
  );
  const activeQuery = db.query(
    `SELECT COUNT(*) AS count
     FROM background_job_runs
     WHERE job_id = ?1 AND status IN ('queued', 'awaiting-approval', 'awaiting-user-input', 'running')`
  );
  for (const assistantId of assistantIds) {
    for (const row of query.all(assistantId) as Row[]) {
      const active = activeQuery.get(String(row.id)) as { count?: number } | null;
      if ((active?.count ?? 0) > 0) {
        continue;
      }
      rows.push(row);
    }
  }
  return rows;
}

function cancelActiveRuns(db: Database, assistantIds: string[], now: string, action: MaintenanceAction) {
  const query = db.query(
    `UPDATE background_job_runs
     SET status = 'cancelled',
         failure_message = ?2,
         completed_at = ?3,
         updated_at = ?3
     WHERE assistant_id = ?1 AND status IN ('queued', 'awaiting-approval', 'awaiting-user-input', 'running')`
  );
  for (const assistantId of assistantIds) {
    query.run(assistantId, `Assistant maintenance: ${action}`, now);
  }
}

function deleteJobs(db: Database, assistantIds: string[]) {
  const query = db.query(`DELETE FROM background_jobs WHERE assistant_id = ?1`);
  for (const assistantId of assistantIds) {
    query.run(assistantId);
  }
}

function softDeleteAssistants(db: Database, assistantIds: string[], now: string) {
  const query = db.query(`UPDATE assistants SET deleted_at = ?2, run_state = 'paused', updated_at = ?2 WHERE id = ?1`);
  for (const assistantId of assistantIds) {
    query.run(assistantId, now);
  }
}

function markAssistantsForRebootstrap(db: Database, assistantIds: string[], now: string) {
  const query = db.query(
    `UPDATE assistants
     SET bootstrap_state = 'pending',
         bootstrap_attempt_id = NULL,
         bootstrap_started_at = NULL,
         bootstrap_finished_at = NULL,
         failure_streak_count = 0,
         circuit_breaker_state = 'closed',
         circuit_breaker_reason = NULL,
         run_state = 'active',
         pending_reprioritize_reason = NULL,
         pending_reprioritize_requested_at = NULL,
         latest_activity_at = ?2,
         updated_at = ?2
     WHERE id = ?1 AND deleted_at IS NULL`
  );
  for (const assistantId of assistantIds) {
    query.run(assistantId, now);
  }
}

function pauseAssistants(db: Database, assistantIds: string[], now: string) {
  const query = db.query(`UPDATE assistants SET run_state = 'paused', updated_at = ?2 WHERE id = ?1 AND deleted_at IS NULL`);
  for (const assistantId of assistantIds) {
    query.run(assistantId, now);
  }
}

function reconcileOrrnTodos(db: Database, assistantIds: string[], now: string) {
  const missingEngineBlocker =
    "Current checkout has no ./engine directory, so this remains blocked until Orrn is pointed at the engine workspace or ./engine is restored.";
  const staleEngineReason =
    "Current project path and repository root have no ./engine directory; stale engine-specific task cannot be implemented from this checkout.";
  const updateTodo = db.query(
    `UPDATE assistant_todos
     SET title = ?3,
         description = ?4,
         state = ?5,
         sort_order = ?6,
         blocker_reason = ?7,
         updated_at = ?8
     WHERE id = ?1 AND assistant_id = ?2`
  );
  const deleteTodo = db.query(`DELETE FROM assistant_todos WHERE id = ?1 AND assistant_id = ?2`);
  const insertTodo = db.query(
    `INSERT INTO assistant_todos (
       id, assistant_id, title, description, state, sort_order, blocker_reason, source,
       created_at, updated_at, work_kind, work_target
     )
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'assistant', ?8, ?8, 'app-code', ?9)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       description = excluded.description,
       state = excluded.state,
       sort_order = excluded.sort_order,
       blocker_reason = excluded.blocker_reason,
       updated_at = excluded.updated_at,
       work_kind = excluded.work_kind,
       work_target = excluded.work_target`
  );
  for (const assistantId of assistantIds) {
    insertTodo.run(
      "orrn-restore-engine-workspace-p1",
      assistantId,
      "P1 TOP: Restore or retarget Orrn to the engine workspace",
      "Repository evidence on 2026-06-25 shows the configured project path and repository root do not contain ./engine, while active Orrn implementation todos target ./engine. Next implementation job must first restore the engine checkout or retarget Orrn to the correct project before barrelDistortion, typecheck, export, WASM, or benchmark work.",
      "pending",
      0,
      null,
      now,
      "./engine"
    );
    updateTodo.run("a66c7815-7917-4a3f-b904-bd349671641f", assistantId, "CANCELLED: barrelDistortion proof/quarantine needs missing ./engine", staleEngineReason, "cancelled", 10, staleEngineReason, now);
    updateTodo.run("afdb1ff0-80e3-470f-8457-9342e039718b", assistantId, "CANCELLED: export docs and smoke sync needs missing ./engine", staleEngineReason, "cancelled", 11, staleEngineReason, now);
    updateTodo.run("145b5bfb-f9ee-49c8-841d-04a0b511fbcf", assistantId, "CANCELLED: stray generic TypeScript bootstrap todo", "Obsolete duplicate bootstrap guidance; Orrn needs the engine workspace restored or retargeted first.", "cancelled", 12, "Duplicate/obsolete generic todo; no current engine repository evidence.", now);
    updateTodo.run("26bd6b24-bb56-4dd4-8b15-62b9b80250b2", assistantId, "CANCELLED: recover engine typecheck needs missing ./engine", staleEngineReason, "cancelled", 13, staleEngineReason, now);
    updateTodo.run("ec991928-c3bc-4125-8e1e-dd9553b989a2", assistantId, "P2 BLOCKED: Improve WASM HTTP and MIME fallback diagnostics after engine workspace returns", "Keep opt-in diagnostics unchanged until both a real consumer setup-friction report and the engine workspace are present.", "blocked", 20, missingEngineBlocker, now);
    updateTodo.run("c48ffd8d-433d-4a97-9d89-2934cb48e6be", assistantId, "P3 BLOCKED: Calibrate benchmark thresholds after engine workspace and hot-path data", "Keep thresholds blocked until the engine workspace is present and migrated-game hot-path timing evidence exists.", "blocked", 21, missingEngineBlocker, now);
    deleteTodo.run("7fcc46ee-1ba2-4c11-b0dc-37204ea5bdf4", assistantId);
    deleteTodo.run("fbf48082-ac9d-47a3-b2ff-c5fc6bdd8d0d", assistantId);
    deleteTodo.run("b6eeb799-2114-4195-a978-77729aad20d1", assistantId);
  }
}

function parseAction(value: string) {
  if (
    value === "remove-jobs" ||
    value === "remove-project-assistants" ||
    value === "rebootstrap" ||
    value === "pause-assistants" ||
    value === "start-jobs" ||
    value === "reconcile-orrn-todos"
  ) {
    return value;
  }
  throw new Error(`Unknown action: ${value}`);
}

function requireValue(argv: string[], index: number, flagName: string) {
  const value = argv[index + 1];
  if (!value) {
    throw new Error(`${flagName} requires a value`);
  }
  return value;
}

function getAssistantSelectors(options: AssistantMaintenanceOptions) {
  if (options.assistants && options.assistants.length > 0) {
    return options.assistants;
  }
  return options.assistant ? [options.assistant] : [];
}

function dedupeRowsById(rows: Row[]) {
  const seen = new Set<string>();
  const deduped: Row[] = [];
  for (const row of rows) {
    const id = String(row.id);
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    deduped.push(row);
  }
  return deduped;
}

function parsePositiveInteger(rawValue: string, flagName: string) {
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${flagName} must be a positive integer`);
  }
  return parsed;
}

async function runLiveAssistantMaintenance(options: AssistantMaintenanceOptions) {
  const planned = runAssistantMaintenance({ ...options, execute: false }) as Row;
  const lookup = planned.lookup as Row;
  const plan = planned.plan as Row;
  const commands = buildLiveCommands(String(lookup.action), planned);
  if (commands.length === 0) {
    return {
      ...planned,
      lookup: {
        ...lookup,
        execute: true
      },
      plan: {
        ...plan,
        liveCommandCount: 0
      },
      applied: true,
      live: {
        status: "ok",
        url: resolveHarnessWsUrl(options.url),
        sent: 0,
        rejected: []
      }
    };
  }
  const live = await sendLiveCommands(resolveHarnessWsUrl(options.url), commands, options.commandTimeoutMs ?? 1_000);
  return {
    ...planned,
    lookup: {
      ...lookup,
      execute: true
    },
    plan: {
      ...plan,
      liveCommandCount: commands.length
    },
    applied: true,
    live
  };
}

function buildLiveCommands(action: string, result: Row) {
  if (action === "pause-assistants") {
    return ((result.assistants as Row[] | undefined) ?? []).map((assistant) => ({
      type: "assistant.pause",
      requestId: createLiveRequestId(),
      payload: {
        assistantId: String(assistant.id)
      }
    }));
  }
  if (action === "start-jobs") {
    const plan = result.plan as Row;
    return ((plan.jobsToStart as Row[] | undefined) ?? []).map((job) => ({
      type: "background-job.run-now",
      requestId: createLiveRequestId(),
      payload: {
        projectId: String(job.project_id),
        jobId: String(job.id)
      }
    }));
  }
  return [];
}

function resolveHarnessWsUrl(rawUrl: string | undefined) {
  const base = new URL(rawUrl || "http://localhost:8787");
  base.protocol = base.protocol === "https:" ? "wss:" : "ws:";
  base.pathname = "/ws";
  base.search = "";
  base.hash = "";
  return base.toString();
}

async function sendLiveCommands(url: string, commands: Row[], timeoutMs: number) {
  const rejected: Array<{ requestId?: string; message: string; detail?: string }> = [];
  const pendingRequestIds = new Set(commands.map((command) => String(command.requestId)));
  const socket = new WebSocket(url);

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out connecting to ${url}`)), timeoutMs);
    socket.addEventListener("open", () => {
      clearTimeout(timeout);
      resolve();
    }, { once: true });
    socket.addEventListener("error", () => {
      clearTimeout(timeout);
      reject(new Error(`Failed to connect to ${url}`));
    }, { once: true });
  });

  socket.addEventListener("message", (event) => {
    try {
      const parsed = JSON.parse(String(event.data)) as Row;
      if (parsed.type !== "command.rejected") {
        return;
      }
      const requestId = typeof parsed.requestId === "string" ? parsed.requestId : undefined;
      if (requestId && !pendingRequestIds.has(requestId)) {
        return;
      }
      const payload = parsed.payload as Row | undefined;
      rejected.push({
        requestId,
        message: String(payload?.message ?? "Harness command rejected"),
        detail: payload?.detail === undefined ? undefined : String(payload.detail)
      });
      if (requestId) {
        pendingRequestIds.delete(requestId);
      }
    } catch {
      // Ignore unrelated server events.
    }
  });

  for (const command of commands) {
    socket.send(JSON.stringify(command));
  }
  await new Promise((resolve) => setTimeout(resolve, timeoutMs));
  socket.close();

  return {
    status: rejected.length === 0 ? "ok" : "partial",
    url,
    sent: commands.length,
    rejected
  };
}

function createLiveRequestId() {
  return `assistant-maintenance:${crypto.randomUUID()}`;
}
