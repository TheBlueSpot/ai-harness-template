import { existsSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Database } from "bun:sqlite";

type ParsedArgs = {
  options: Map<string, string | boolean>;
  positional: string[];
};

type SyncJobOptions = {
  assistantName?: string;
  batchSize?: number;
  description?: string;
  gameSlugs?: string[];
  jobName?: string;
  now?: Date;
  projectName?: string;
  scheduleInput?: string;
  timezone?: string;
  random?: () => number;
};

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const defaultHarnessDbPath = resolve(repoRoot, ".local", "harness.db");
const defaultJobName = "Kojima: 15m bulk multi-game improvement lane";
const defaultDescription =
  "Every 15 minutes, pick a random small subset of browser-playable games and ask Kojima to improve several of them in one pass.";
const defaultScheduleInput = "15m";
const defaultTimezone = "America/New_York";
const defaultBatchSize = 4;
const minimumBatchSize = 1;

function usage(message?: string): never {
  if (message) {
    console.error(message);
  }

  console.error(`Usage:
  bun.cmd ./scripts/kojima-15m-bulk-improvement-lane.ts sync-job [--json] [--db <path>] [--project <name>] [--assistant <name>] [--job-name <name>] [--description <text>] [--schedule-input <text>] [--timezone <iana>] [--batch-size <count>] [--now <iso>]`);
  process.exit(1);
}

function parseArgs(args: string[]): ParsedArgs {
  const positional: string[] = [];
  const options = new Map<string, string | boolean>();

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }

    const key = arg.slice(2);
    if (key === "json") {
      options.set(key, true);
      continue;
    }

    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      usage(`Missing value for --${key}.`);
    }
    options.set(key, value);
    index += 1;
  }

  return { options, positional };
}

function stringOption(options: Map<string, string | boolean>, key: string) {
  const value = options.get(key);
  return typeof value === "string" ? value : undefined;
}

function booleanOption(options: Map<string, string | boolean>, key: string) {
  return options.get(key) === true;
}

function parseDateOption(value: string | undefined, label: string) {
  if (!value) {
    return undefined;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    usage(`${label} must be a valid ISO datetime.`);
  }
  return date;
}

function parsePositiveInteger(value: string | undefined, label: string, fallback: number) {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    usage(`${label} must be a positive integer.`);
  }
  return parsed;
}

export function collectPlayableGameSlugs(rootPath = repoRoot) {
  return readdirSync(rootPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith("."))
    .filter((name) => existsSync(resolve(rootPath, name, "index.html")))
    .sort((left, right) => left.localeCompare(right));
}

export function pickRandomGameSubset(slugs: string[], batchSize = defaultBatchSize, random: () => number = Math.random) {
  const pool = [...new Set(slugs)].sort((left, right) => left.localeCompare(right));
  if (pool.length === 0) {
    return [];
  }

  const targetSize = Math.min(pool.length, Math.max(minimumBatchSize, batchSize));
  const chosen: string[] = [];
  while (chosen.length < targetSize && pool.length > 0) {
    const index = Math.floor(random() * pool.length);
    chosen.push(pool.splice(index, 1)[0]);
  }

  return chosen.sort((left, right) => left.localeCompare(right));
}

export function buildKojima15mBulkImprovementPrompt(gameSlugs: string[]) {
  const batchText = gameSlugs.length > 0 ? gameSlugs.map((slug) => `- ${slug}`).join("\n") : "- No playable games were available.";

  return [
    "Use /caveman ultra.",
    "Use the catalog-sweep skill from `./.agents/skills/catalog-sweep/` for this pass.",
    "This is Kojima's separate 15-minute bulk-improvement lane. Keep the normal catalog workflows unchanged.",
    "Work on this exact small batch in one pass:",
    batchText,
    "Improve the games game-locally only. Stay inside each game's folder, preserve direct browser playability, and do not edit harness files.",
    "Prefer a compact batch of practical wins across several games: clearer controls, tighter pacing, easier browser boot, better HUD readability, more readable progression, or targeted content/polish that fits the current game.",
    "Bulk the improvements together in one run rather than stopping after the first file.",
    "If a game is already solid, skip it and use the time on the rest of the batch.",
    "Verify every touched game in-browser or with the repo's existing local smoke path, and report the real commands and outcomes.",
    "End with a concise summary that names the batch, what changed in each game, and what was verified.",
  ].join("\n\n");
}

function resolveNextRunAt(now: Date, intervalSeconds: number, existingNextRunAt?: string | null) {
  const existingTimestamp = existingNextRunAt ? Date.parse(existingNextRunAt) : Number.NaN;
  if (!Number.isNaN(existingTimestamp) && existingTimestamp > now.getTime()) {
    return new Date(existingTimestamp).toISOString();
  }

  return new Date(now.getTime() + intervalSeconds * 1_000).toISOString();
}

function selectGameBatch(options: SyncJobOptions) {
  if (options.gameSlugs && options.gameSlugs.length > 0) {
    return pickRandomGameSubset(options.gameSlugs, options.batchSize, options.random);
  }
  return pickRandomGameSubset(collectPlayableGameSlugs(), options.batchSize, options.random);
}

export function upsertKojima15mBulkImprovementJob(db: Database, options: SyncJobOptions = {}) {
  const projectName = options.projectName ?? "context";
  const assistantName = options.assistantName ?? "Kojima";
  const jobName = options.jobName ?? defaultJobName;
  const description = options.description ?? defaultDescription;
  const scheduleInput = options.scheduleInput ?? defaultScheduleInput;
  const intervalSeconds = 15 * 60;
  const timezone = options.timezone ?? defaultTimezone;
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const selectedGameSlugs = selectGameBatch(options);
  const prompt = buildKojima15mBulkImprovementPrompt(selectedGameSlugs);

  const project = db
    .query<{ id: string; name: string }, [string]>("SELECT id, name FROM projects WHERE name = ?1")
    .get(projectName);
  if (!project) {
    throw new Error(`Project not found: ${projectName}`);
  }

  const assistant = db
    .query<{ id: string; name: string }, [string, string]>(
      "SELECT id, name FROM assistants WHERE project_id = ?1 AND name = ?2 AND deleted_at IS NULL",
    )
    .get(project.id, assistantName);
  if (!assistant) {
    throw new Error(`Assistant not found: ${assistantName}`);
  }

  const existingJob = db
    .query<{ id: string; automation_thread_id: string; next_run_at: string | null }, [string, string]>(
      "SELECT id, automation_thread_id, next_run_at FROM background_jobs WHERE assistant_id = ?1 AND name = ?2",
    )
    .get(assistant.id, jobName);

  const jobId = existingJob?.id ?? crypto.randomUUID();
  const automationThreadId = existingJob?.automation_thread_id ?? crypto.randomUUID();
  const nextRunAt = resolveNextRunAt(now, intervalSeconds, existingJob?.next_run_at);
  const scheduleJson = JSON.stringify({
    type: "interval",
    intervalSeconds,
    nextRunAt,
    sourceText: scheduleInput,
  });
  const definitionJson = JSON.stringify({
    kind: "ai-routine",
    prompt,
    modeId: "implement",
    planExecutionMode: "immediate",
    subagentWorktreeStrategy: "same-worktree",
    selectedGameSlugs,
  });

  db.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    if (!existingJob) {
      db.query(
        `INSERT INTO project_threads (
          id,
          project_id,
          status,
          title,
          title_source,
          updated_at,
          created_at,
          kind
        ) VALUES (?1, ?2, 'active', ?3, 'custom', ?4, ?4, 'automation')`,
      ).run(automationThreadId, project.id, jobName, nowIso);
    } else {
      db.query(
        `UPDATE project_threads
         SET title = ?2,
             updated_at = ?3
         WHERE id = ?1`,
      ).run(automationThreadId, jobName, nowIso);
    }

    db.query(
      `INSERT INTO background_jobs (
        id,
        project_id,
        assistant_id,
        automation_thread_id,
        template_id,
        created_from_run_id,
        kind,
        name,
        description,
        definition_json,
        schedule_json,
        schedule_input,
        timezone,
        status,
        risk_level,
        next_run_at,
        last_run_at,
        last_enqueued_at,
        created_at,
        updated_at
      ) VALUES (
        ?1, ?2, ?3, ?4,
        NULL, NULL,
        'ai-routine', ?5, ?6, ?7, ?8, ?9, ?10,
        'enabled', 'unsafe', ?11, NULL, NULL, ?12, ?12
      )
      ON CONFLICT(id) DO UPDATE SET
        assistant_id = excluded.assistant_id,
        automation_thread_id = excluded.automation_thread_id,
        kind = excluded.kind,
        name = excluded.name,
        description = excluded.description,
        definition_json = excluded.definition_json,
        schedule_json = excluded.schedule_json,
        schedule_input = excluded.schedule_input,
        timezone = excluded.timezone,
        status = excluded.status,
        risk_level = excluded.risk_level,
        next_run_at = excluded.next_run_at,
        updated_at = excluded.updated_at`,
    ).run(
      jobId,
      project.id,
      assistant.id,
      automationThreadId,
      jobName,
      description,
      definitionJson,
      scheduleJson,
      scheduleInput,
      timezone,
      nextRunAt,
      nowIso,
    );

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return {
    assistantId: assistant.id,
    created: !existingJob,
    jobId,
    name: jobName,
    nextRunAt,
    projectId: project.id,
    selectedGameSlugs,
    scheduleInput,
    timezone,
  };
}

function runSyncJob(parsed: ParsedArgs) {
  const dbPath = stringOption(parsed.options, "db") ?? defaultHarnessDbPath;
  const projectName = stringOption(parsed.options, "project") ?? "context";
  const assistantName = stringOption(parsed.options, "assistant") ?? "Kojima";
  const jobName = stringOption(parsed.options, "job-name") ?? defaultJobName;
  const description = stringOption(parsed.options, "description") ?? defaultDescription;
  const scheduleInput = stringOption(parsed.options, "schedule-input") ?? defaultScheduleInput;
  const batchSize = parsePositiveInteger(stringOption(parsed.options, "batch-size"), "--batch-size", defaultBatchSize);
  const timezone = stringOption(parsed.options, "timezone") ?? defaultTimezone;
  const now = parseDateOption(stringOption(parsed.options, "now"), "--now") ?? new Date();

  const db = new Database(dbPath, { create: true, strict: true });
  const result = upsertKojima15mBulkImprovementJob(db, {
    assistantName,
    batchSize,
    description,
    jobName,
    now,
    projectName,
    scheduleInput,
    timezone,
  });

  if (booleanOption(parsed.options, "json")) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`${result.created ? "Created" : "Updated"} ${result.name}; next run ${result.nextRunAt}.`);
}

function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const command = parsed.positional[0];

  switch (command) {
    case "sync-job":
      runSyncJob(parsed);
      return;
    default:
      usage(command ? `Unknown command: ${command}` : undefined);
  }
}

if (import.meta.main) {
  main();
}
