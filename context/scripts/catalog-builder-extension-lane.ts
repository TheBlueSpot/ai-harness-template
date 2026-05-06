import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Database } from "bun:sqlite";

export type ReviewEntry = {
  broken: string;
  dislikes: string;
  likes: string;
  needsAdditionalFeedback?: boolean;
  rating: number | null;
  updatedAt: string | null;
};

type ReviewRow = {
  slug: string;
  broken: string;
  dislikes: string;
  likes: string;
  needs_additional_feedback: number;
  rating: number | null;
  updated_at: string | null;
};

export type SelectionHistoryEntry = {
  slug: string;
  selectedAt: string;
  reviewUpdatedAt?: string | null;
};

export type ExtensionLaneState = {
  selectionHistory: SelectionHistoryEntry[];
};

export type WantingMoreSignal = {
  label: string;
  weight: number;
};

export type WantingMoreHeuristic = {
  matches: WantingMoreSignal[];
  matched: boolean;
  normalizedText: string;
  score: number;
};

export type ExtensionCandidate = {
  freshnessMultiplier: number;
  heuristic: WantingMoreHeuristic;
  rating: number;
  ratingMultiplier: number;
  reasons: string[];
  recencyMultiplier: number;
  repeatPenalty: number;
  review: ReviewEntry;
  slug: string;
  updatedAt: string | null;
  weight: number;
};

export type SelectionResult = {
  candidates: ExtensionCandidate[];
  selected: ExtensionCandidate | null;
};

type SelectOptions = {
  minRating?: number;
  now?: Date;
  random?: () => number;
  reviews?: Record<string, ReviewEntry>;
  state?: ExtensionLaneState;
};

type SyncJobOptions = {
  assistantName?: string;
  description?: string;
  intervalSeconds?: number;
  jobName?: string;
  now?: Date;
  projectName?: string;
  scheduleInput?: string;
  timezone?: string;
};

type ParsedArgs = {
  options: Map<string, string | boolean>;
  positional: string[];
};

const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultReviewDbPath = resolve(scriptDir, "..", "user-reviews.sqlite");
const defaultHarnessDbPath = resolve(scriptDir, "..", "..", ".local", "harness.db");
const defaultStatePath = resolve(scriptDir, "..", ".local", "catalog-builder-extension-lane-state.json");

export const DEFAULT_MIN_RATING = 4;
export const EXTENSION_JOB_NAME = "Catalog builder: wanting-more extension lane";
export const EXTENSION_JOB_DESCRIPTION =
  "Every 15 minutes, extend one high-rated game whose review text says players want more, using weighted random selection with freshness bias.";
export const EXTENSION_JOB_SCHEDULE_INPUT = "15m";
export const EXTENSION_JOB_INTERVAL_SECONDS = 15 * 60;
export const EXTENSION_JOB_10M_NAME = "Catalog builder: wanting-more extension lane (10m)";
export const EXTENSION_JOB_10M_DESCRIPTION =
  "Every 10 minutes, extend one high-rated game whose review text says players want more, using weighted random selection with freshness bias.";
export const EXTENSION_JOB_10M_SCHEDULE_INPUT = "10m";
export const EXTENSION_JOB_10M_INTERVAL_SECONDS = 10 * 60;
export const EXTENSION_JOB_TIMEZONE = "America/New_York";

const freshnessWindowHours = 72;
const historyLimit = 64;
const repeatPenaltyLookbackHours = 72;
const repeatPenaltyStrongHours = 24;

const wantingMorePhraseSignals: Array<{ label: string; pattern: RegExp; weight: number }> = [
  { label: "too short", pattern: /\btoo short\b/i, weight: 4 },
  { label: "longer", pattern: /\blonger\b/i, weight: 3 },
  { label: "more levels", pattern: /\bmore levels?\b/i, weight: 4 },
  { label: "more mechanics", pattern: /\bmore mechanics?\b/i, weight: 4 },
  { label: "more variety", pattern: /\bmore variety\b/i, weight: 4 },
  { label: "more content", pattern: /\bmore content\b/i, weight: 4 },
  { label: "more powerups", pattern: /\bmore powerups?\b/i, weight: 3 },
  { label: "more bosses", pattern: /\bmore bosses?\b/i, weight: 3 },
  { label: "more enemies", pattern: /\bmore enemies\b/i, weight: 3 },
  { label: "stronger theme", pattern: /\bstronger theme\b/i, weight: 2 },
  { label: "needs story", pattern: /\bneeds? (?:a |some )?(?:story|meta narrative|narrative)\b/i, weight: 3 },
  { label: "needs levels", pattern: /\bneeds? (?:at least )?\d+ levels?\b/i, weight: 4 },
  { label: "game ends too fast", pattern: /\bgame should not end in\b|\bgame ends in \d+\s*[sm]\b/i, weight: 4 },
  { label: "needs dynamic features", pattern: /\bdynamic features\b/i, weight: 3 },
  { label: "add content ask", pattern: /\b(add|could use|should have|needs?)\s+(?:some\s+|more\s+)?(levels?|mechanics?|variety|content|powerups?|boss(?:es)?|enemies|story|narrative|theme|dialog(?:ue)?|cutscenes?|sfx|bgm|music|art|visual flair|interactables|secret paths|progression)\b/i, weight: 3 },
  { label: "more content ask", pattern: /\bmore\s+(levels?|mechanics?|variety|content|powerups?|boss(?:es)?|enemies|story|narrative|dialog(?:ue)?|cutscenes?|sfx|bgm|music|art|visual flair|interactables|secret paths|progression)\b/i, weight: 3 },
  { label: "10x longer", pattern: /\b\d+x longer\b/i, weight: 5 },
];

function usage(message?: string): never {
  if (message) {
    console.error(message);
  }

  console.error(`Usage:
  bun.cmd ./scripts/catalog-builder-extension-lane.ts select [--json] [--seed <number>] [--now <iso>] [--db <path>] [--state <path>] [--min-rating <4-5>]
  bun.cmd ./scripts/catalog-builder-extension-lane.ts record --slug <slug> [--selected-at <iso>] [--review-updated-at <iso>] [--state <path>]
  bun.cmd ./scripts/catalog-builder-extension-lane.ts sync-job [--json] [--db <path>] [--project <name>] [--assistant <name>] [--job-name <name>] [--description <text>] [--schedule-input <text>] [--interval-seconds <seconds>] [--timezone <iana>] [--now <iso>]`);
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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function safeParseTime(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

export function normalizeReviewText(review: ReviewEntry) {
  return normalizeText([review.likes, review.dislikes, review.broken].filter(Boolean).join(" "));
}

export function detectWantingMoreSentiment(review: ReviewEntry): WantingMoreHeuristic {
  const normalizedText = normalizeReviewText(review);
  const matches = wantingMorePhraseSignals
    .filter((entry) => entry.pattern.test(normalizedText))
    .map((entry) => ({ label: entry.label, weight: entry.weight }));
  const score = matches.reduce((sum, entry) => sum + entry.weight, 0);

  return {
    normalizedText,
    matches,
    score,
    matched: score >= 3,
  };
}

function getFreshnessMultiplier(updatedAt: string | null, now: Date) {
  const timestamp = safeParseTime(updatedAt);
  if (timestamp === null) {
    return 1;
  }

  const ageHours = Math.max(0, (now.getTime() - timestamp) / 3_600_000);
  return ageHours <= freshnessWindowHours ? 1.2 : 1;
}

function getRecencyMultiplier(updatedAt: string | null, now: Date) {
  const timestamp = safeParseTime(updatedAt);
  if (timestamp === null) {
    return 1;
  }

  const ageHours = Math.max(0, (now.getTime() - timestamp) / 3_600_000);
  return 1 + 0.25 * Math.exp(-ageHours / 168);
}

function getRatingMultiplier(rating: number) {
  return rating >= 5 ? 1.12 : 1;
}

export function getRepeatPenalty(slug: string, state: ExtensionLaneState, now: Date) {
  const nowMs = now.getTime();
  const recentSelections = state.selectionHistory
    .filter((entry) => entry.slug === slug)
    .map((entry) => safeParseTime(entry.selectedAt))
    .filter((value): value is number => value !== null)
    .sort((left, right) => right - left);

  if (recentSelections.length === 0) {
    return 1;
  }

  const latestAgeHours = Math.max(0, (nowMs - recentSelections[0]) / 3_600_000);
  const lookbackSelections = recentSelections.filter(
    (timestamp) => (nowMs - timestamp) / 3_600_000 <= repeatPenaltyLookbackHours,
  ).length;

  let penalty = 1;
  if (latestAgeHours <= repeatPenaltyStrongHours) {
    penalty *= 0.35;
  } else if (latestAgeHours <= repeatPenaltyLookbackHours) {
    penalty *= 0.6;
  }

  if (lookbackSelections > 1) {
    penalty /= 1 + 0.25 * (lookbackSelections - 1);
  }

  return clamp(penalty, 0.15, 1);
}

export function buildExtensionCandidates(
  reviews: Record<string, ReviewEntry>,
  options: Omit<SelectOptions, "reviews" | "random"> = {},
): ExtensionCandidate[] {
  const now = options.now ?? new Date();
  const minRating = options.minRating ?? DEFAULT_MIN_RATING;
  const state = options.state ?? { selectionHistory: [] };

  return Object.entries(reviews)
    .flatMap(([slug, review]) => {
      if (review.rating === null || review.rating < minRating) {
        return [];
      }

      const heuristic = detectWantingMoreSentiment(review);
      if (!heuristic.matched) {
        return [];
      }

      const freshnessMultiplier = getFreshnessMultiplier(review.updatedAt, now);
      const recencyMultiplier = getRecencyMultiplier(review.updatedAt, now);
      const ratingMultiplier = getRatingMultiplier(review.rating);
      const repeatPenalty = getRepeatPenalty(slug, state, now);
      const weight = heuristic.score * freshnessMultiplier * recencyMultiplier * ratingMultiplier * repeatPenalty;

      return [
        {
          slug,
          review,
          heuristic,
          freshnessMultiplier,
          recencyMultiplier,
          ratingMultiplier,
          repeatPenalty,
          updatedAt: review.updatedAt,
          rating: review.rating,
          reasons: heuristic.matches.map((entry) => entry.label),
          weight,
        } satisfies ExtensionCandidate,
      ];
    })
    .sort((left, right) => right.weight - left.weight || left.slug.localeCompare(right.slug));
}

export function pickWeightedCandidate(candidates: ExtensionCandidate[], random: () => number) {
  const totalWeight = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
  if (totalWeight <= 0 || candidates.length === 0) {
    return null;
  }

  let remaining = clamp(random(), 0, 0.999999999999) * totalWeight;
  for (const candidate of candidates) {
    remaining -= candidate.weight;
    if (remaining < 0) {
      return candidate;
    }
  }

  return candidates.at(-1) ?? null;
}

export function selectCatalogBuilderExtensionCandidate(options: SelectOptions = {}): SelectionResult {
  const reviews = options.reviews ?? loadReviewsFromDb(defaultReviewDbPath);
  const candidates = buildExtensionCandidates(reviews, options);
  const selected = pickWeightedCandidate(candidates, options.random ?? Math.random);
  return { candidates, selected };
}

export function defaultExtensionLaneState(): ExtensionLaneState {
  return { selectionHistory: [] };
}

export function readExtensionLaneState(pathname = defaultStatePath): ExtensionLaneState {
  if (!existsSync(pathname)) {
    return defaultExtensionLaneState();
  }

  try {
    const parsed = JSON.parse(readFileSync(pathname, "utf8")) as Partial<ExtensionLaneState>;
    const selectionHistory = Array.isArray(parsed.selectionHistory)
      ? parsed.selectionHistory
          .flatMap((entry) => {
            if (!entry || typeof entry !== "object") {
              return [];
            }
            const record = entry as Record<string, unknown>;
            if (typeof record.slug !== "string" || typeof record.selectedAt !== "string") {
              return [];
            }
            return [
              {
                slug: record.slug,
                selectedAt: record.selectedAt,
                reviewUpdatedAt: typeof record.reviewUpdatedAt === "string" ? record.reviewUpdatedAt : null,
              } satisfies SelectionHistoryEntry,
            ];
          })
          .slice(-historyLimit)
      : [];

    return { selectionHistory };
  } catch {
    return defaultExtensionLaneState();
  }
}

export function writeExtensionLaneState(state: ExtensionLaneState, pathname = defaultStatePath) {
  mkdirSync(dirname(pathname), { recursive: true });
  writeFileSync(
    pathname,
    `${JSON.stringify({ selectionHistory: state.selectionHistory.slice(-historyLimit) }, null, 2)}\n`,
    "utf8",
  );
}

export function recordExtensionSelection(
  slug: string,
  options: { reviewUpdatedAt?: string | null; selectedAt?: Date; state?: ExtensionLaneState } = {},
) {
  const state = options.state ?? defaultExtensionLaneState();
  const selectedAt = (options.selectedAt ?? new Date()).toISOString();
  state.selectionHistory.push({
    slug,
    selectedAt,
    reviewUpdatedAt: options.reviewUpdatedAt ?? null,
  });
  state.selectionHistory = state.selectionHistory.slice(-historyLimit);
  return state;
}

function openReviewDb(pathname: string) {
  return new Database(pathname, { create: false, readonly: true, strict: true });
}

export function loadReviewsFromDb(pathname = defaultReviewDbPath) {
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

export function createSeededRandom(seed: number) {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };
}

export function buildCatalogBuilderExtensionJobPrompt() {
  return [
    "Use /caveman ultra.",
    "This is Catalog Builder's separate wanting-more extension lane. Keep the normal queue-first Catalog Builder workflow unchanged.",
    "First run `bun.cmd ./scripts/catalog-builder-extension-lane.ts select --json` from the project root.",
    "Use the selector output as the only targeting step for this run. The selector intentionally uses all reviews, including entries already flagged `needsAdditionalFeedback`, and it already applies the documented high-rated, wanting-more, freshness, updatedAt, and anti-repeat weighting rules.",
    "If the selector returns no candidate, stop cleanly and say no eligible high-rated wanting-more review exists right now.",
    "If a candidate is returned, extend exactly that one game. Flesh it out to make the game longer and more polished in the highest-value way for that specific game: story, mechanics, visual flair, more levels, dialog, cutscenes, SFX, BGM, public-domain or public-access assets, or Craftpix art assets when they materially help.",
    "Prefer the biggest player-visible depth or polish gain per run over broad refactors. Keep changes local to the chosen game, preserve direct browser playability, and do not edit harness files.",
    "Thoroughly test the changed game and report the real verification commands and outcomes.",
    "If you change any existing file for the selected game, mark the review stale at the end with `bun.cmd ./scripts/reviews.ts flag <slug> --needs-feedback true`.",
    "After the extension pass succeeds, record the selection with `bun.cmd ./scripts/catalog-builder-extension-lane.ts record --slug <slug>`.",
    "End with a compact summary of the selected slug, why the selector chose it, what was improved, and what was tested.",
  ].join("\n\n");
}

function resolveNextRunAt(now: Date, intervalSeconds: number, existingNextRunAt?: string | null) {
  const existingTimestamp = safeParseTime(existingNextRunAt);
  if (existingTimestamp !== null && existingTimestamp > now.getTime()) {
    return new Date(existingTimestamp).toISOString();
  }

  return new Date(now.getTime() + intervalSeconds * 1_000).toISOString();
}

export function upsertCatalogBuilderExtensionJob(db: Database, options: SyncJobOptions = {}) {
  const projectName = options.projectName ?? "context";
  const assistantName = options.assistantName ?? "Catalog builder";
  const jobName = options.jobName ?? EXTENSION_JOB_NAME;
  const description = options.description ?? EXTENSION_JOB_DESCRIPTION;
  const scheduleInput = options.scheduleInput ?? EXTENSION_JOB_SCHEDULE_INPUT;
  const intervalSeconds = options.intervalSeconds ?? EXTENSION_JOB_INTERVAL_SECONDS;
  const timezone = options.timezone ?? EXTENSION_JOB_TIMEZONE;
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();

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
    prompt: buildCatalogBuilderExtensionJobPrompt(),
    modeId: "implement",
    planExecutionMode: "immediate",
    subagentWorktreeStrategy: "same-worktree",
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
    scheduleInput,
    timezone,
  };
}

function runSelect(parsed: ParsedArgs) {
  const statePath = stringOption(parsed.options, "state") ?? defaultStatePath;
  const dbPath = stringOption(parsed.options, "db") ?? defaultReviewDbPath;
  const now = parseDateOption(stringOption(parsed.options, "now"), "--now") ?? new Date();
  const minRating = parsePositiveInteger(stringOption(parsed.options, "min-rating"), "--min-rating", DEFAULT_MIN_RATING);
  const seed = stringOption(parsed.options, "seed");
  const random = seed ? createSeededRandom(parsePositiveInteger(seed, "--seed", 1)) : Math.random;
  const reviews = loadReviewsFromDb(dbPath);
  const state = readExtensionLaneState(statePath);
  const result = selectCatalogBuilderExtensionCandidate({ reviews, state, minRating, now, random });

  if (booleanOption(parsed.options, "json")) {
    console.log(
      JSON.stringify(
        {
          selected: result.selected,
          candidates: result.candidates,
          candidateCount: result.candidates.length,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (!result.selected) {
    console.log("No eligible high-rated wanting-more game found.");
    return;
  }

  console.log(
    `${result.selected.slug} rating=${result.selected.rating} weight=${result.selected.weight.toFixed(3)} reasons=${result.selected.reasons.join(", ")}`,
  );
}

function runRecord(parsed: ParsedArgs) {
  const slug = stringOption(parsed.options, "slug");
  if (!slug) {
    usage("--slug is required for record.");
  }

  const selectedAt = parseDateOption(stringOption(parsed.options, "selected-at"), "--selected-at") ?? new Date();
  const reviewUpdatedAt = stringOption(parsed.options, "review-updated-at") ?? null;
  const statePath = stringOption(parsed.options, "state") ?? defaultStatePath;
  const state = readExtensionLaneState(statePath);
  recordExtensionSelection(slug, { selectedAt, reviewUpdatedAt, state });
  writeExtensionLaneState(state, statePath);

  console.log(
    JSON.stringify(
      {
        slug,
        recorded: true,
        selectedAt: selectedAt.toISOString(),
        statePath,
      },
      null,
      2,
    ),
  );
}

function runSyncJob(parsed: ParsedArgs) {
  const dbPath = stringOption(parsed.options, "db") ?? defaultHarnessDbPath;
  const projectName = stringOption(parsed.options, "project") ?? "context";
  const assistantName = stringOption(parsed.options, "assistant") ?? "Catalog builder";
  const jobName = stringOption(parsed.options, "job-name") ?? EXTENSION_JOB_NAME;
  const description = stringOption(parsed.options, "description") ?? EXTENSION_JOB_DESCRIPTION;
  const scheduleInput = stringOption(parsed.options, "schedule-input") ?? EXTENSION_JOB_SCHEDULE_INPUT;
  const intervalSeconds = parsePositiveInteger(
    stringOption(parsed.options, "interval-seconds"),
    "--interval-seconds",
    EXTENSION_JOB_INTERVAL_SECONDS,
  );
  const timezone = stringOption(parsed.options, "timezone") ?? EXTENSION_JOB_TIMEZONE;
  const now = parseDateOption(stringOption(parsed.options, "now"), "--now") ?? new Date();

  const db = new Database(dbPath, { create: true, strict: true });
  const result = upsertCatalogBuilderExtensionJob(db, {
    assistantName,
    description,
    intervalSeconds,
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
    case "select":
      runSelect(parsed);
      return;
    case "record":
      runRecord(parsed);
      return;
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
