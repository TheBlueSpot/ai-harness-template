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
  description?: string;
  gameReviews?: Record<string, ReviewEntry>;
  jobName?: string;
  now?: Date;
  projectName?: string;
  scheduleInput?: string;
  skillNames?: string[];
  timezone?: string;
  random?: () => number;
};

type ReviewEntry = {
  broken: string;
  dislikes: string;
  likes: string;
  needsAdditionalFeedback?: boolean;
  rating: number | null;
  updatedAt: string | null;
};

type ReviewRow = {
  broken: string;
  dislikes: string;
  likes: string;
  needs_additional_feedback: number;
  rating: number | null;
  slug: string;
  updated_at: string | null;
};

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const defaultHarnessDbPath = resolve(repoRoot, ".local", "harness.db");
const defaultReviewDbPath = resolve(repoRoot, "user-reviews.sqlite");
const defaultJobName = "Kojima: 5m random skill on a high-rated game";
const defaultDescription =
  "Every 5 minutes, pick one random 3+ star game and one random Codex skill, then ask Kojima to apply that skill to that game.";
const defaultScheduleInput = "5m";
const defaultTimezone = "America/New_York";
const minimumRating = 3;

function usage(message?: string): never {
  if (message) {
    console.error(message);
  }

  console.error(`Usage:
  bun.cmd ./scripts/kojima-5m-random-skill-random-high-rated-game-lane.ts sync-job [--json] [--db <path>] [--project <name>] [--assistant <name>] [--job-name <name>] [--description <text>] [--schedule-input <text>] [--timezone <iana>] [--now <iso>]`);
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

function collectSkillNames(rootPath = resolve(repoRoot, ".agents", "skills")) {
  return readdirSync(rootPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith("."))
    .sort((left, right) => left.localeCompare(right));
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function selectRandomItem<T>(items: readonly T[], random: () => number) {
  if (items.length === 0) {
    return null;
  }
  const index = Math.floor(Math.min(0.999999999999, Math.max(0, random())) * items.length);
  return items[index] ?? null;
}

function openReviewDb(pathname: string) {
  return new Database(pathname, { create: false, readonly: true, strict: true });
}

function loadReviewsFromDb(pathname = defaultReviewDbPath) {
  const db = openReviewDb(pathname);
  const rows = db
    .query<ReviewRow, []>(
      `SELECT slug, broken, dislikes, likes, needs_additional_feedback, rating, updated_at
       FROM user_reviews
       ORDER BY slug`,
    )
    .all();

  return Object.fromEntries(
    rows.map((row) => [
      row.slug,
      {
        broken: row.broken,
        dislikes: row.dislikes,
        likes: row.likes,
        ...(row.needs_additional_feedback ? { needsAdditionalFeedback: true } : {}),
        rating: row.rating,
        updatedAt: row.updated_at,
      } satisfies ReviewEntry,
    ]),
  );
}

function pickRandomHighRatedGame(reviews: Record<string, ReviewEntry>, random: () => number) {
  const candidates = Object.entries(reviews)
    .filter(([, review]) => review.rating !== null && review.rating >= minimumRating)
    .map(([slug, review]) => ({ slug, review }))
    .sort((left, right) => left.slug.localeCompare(right.slug));

  return selectRandomItem(candidates, random);
}

function resolveNextRunAt(now: Date, intervalSeconds: number, existingNextRunAt?: string | null) {
  const existingTimestamp = existingNextRunAt ? Date.parse(existingNextRunAt) : Number.NaN;
  if (!Number.isNaN(existingTimestamp) && existingTimestamp > now.getTime()) {
    return new Date(existingTimestamp).toISOString();
  }

  return new Date(now.getTime() + intervalSeconds * 1_000).toISOString();
}

export function buildKojima5mRandomSkillRandomHighRatedGamePrompt(skillName: string, gameSlug: string) {
  return [
    "Use /caveman ultra.",
    "This is Kojima's separate 5-minute random-skill lane. Keep the normal catalog workflows unchanged.",
    `First pick the random skill folder from \`./.agents/skills/\`: \`${skillName}\`.`,
    `Then work on the random high-rated game: \`${gameSlug}\`.`,
    "Use the chosen skill as the primary method for the pass. Keep the work game-local, preserve direct browser playability, and do not edit harness files.",
    "If the selected skill does not fit the selected game cleanly, make the smallest useful pass that still respects the skill's intent and the game's existing structure.",
    "Prefer one concrete, player-visible improvement over broad refactors. Use the 5-minute budget to stay focused.",
    "Verify the touched game in-browser or with the repo's existing local smoke path, and report the real commands and outcomes.",
    "End with a concise summary naming the selected skill, the selected game, what changed, and what was verified.",
  ].join("\n\n");
}

export function upsertKojima5mRandomSkillRandomHighRatedGameJob(db: Database, options: SyncJobOptions = {}) {
  const projectName = options.projectName ?? "context";
  const assistantName = options.assistantName ?? "Kojima";
  const jobName = options.jobName ?? defaultJobName;
  const description = options.description ?? defaultDescription;
  const scheduleInput = options.scheduleInput ?? defaultScheduleInput;
  const timezone = options.timezone ?? defaultTimezone;
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const reviews = options.gameReviews ?? loadReviewsFromDb(defaultReviewDbPath);
  const skillNames = (options.skillNames ?? collectSkillNames()).sort((left, right) => left.localeCompare(right));
  const gameSelection = pickRandomHighRatedGame(reviews, options.random ?? Math.random);
  const skillName = selectRandomItem(skillNames, options.random ?? Math.random);

  if (!gameSelection) {
    throw new Error("No eligible 3+ star games found in user-reviews.sqlite.");
  }
  if (!skillName) {
    throw new Error("No skills found in .agents/skills.");
  }

  const prompt = buildKojima5mRandomSkillRandomHighRatedGamePrompt(skillName, gameSelection.slug);

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
  const nextRunAt = resolveNextRunAt(now, 5 * 60, existingJob?.next_run_at);
  const scheduleJson = JSON.stringify({
    type: "interval",
    intervalSeconds: 5 * 60,
    nextRunAt,
    sourceText: scheduleInput,
  });
  const definitionJson = JSON.stringify({
    kind: "ai-routine",
    prompt,
    modeId: "implement",
    planExecutionMode: "immediate",
    subagentWorktreeStrategy: "same-worktree",
    selectedGameSlug: gameSelection.slug,
    selectedSkillName: skillName,
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
        updated_at = excluded.updated_at` ,
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
    gameSlug: gameSelection.slug,
    jobId,
    name: jobName,
    nextRunAt,
    projectId: project.id,
    scheduleInput,
    skillName,
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
  const timezone = stringOption(parsed.options, "timezone") ?? defaultTimezone;
  const now = parseDateOption(stringOption(parsed.options, "now"), "--now") ?? new Date();

  const db = new Database(dbPath, { create: true, strict: true });
  const result = upsertKojima5mRandomSkillRandomHighRatedGameJob(db, {
    assistantName,
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

  console.log(
    `${result.created ? "Created" : "Updated"} ${result.name}; next run ${result.nextRunAt}; game ${result.gameSlug}; skill ${result.skillName}.`,
  );
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
