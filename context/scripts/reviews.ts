import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Database } from "bun:sqlite";

type ReviewEntry = {
  broken: string;
  dislikes: string;
  likes: string;
  needsAdditionalFeedback?: boolean;
  rating: number | null;
  updatedAt: string | null;
};

type ReviewPatch = {
  broken?: string;
  dislikes?: string;
  likes?: string;
  needsAdditionalFeedback?: boolean;
  rating?: number | null;
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
const defaultDbPath = resolve(scriptDir, "..", "user-reviews.sqlite");
const validSlugPattern = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

function usage(message?: string): never {
  if (message) {
    console.error(message);
  }

  console.error(`Usage:
  bun.cmd context/scripts/reviews.ts list [--json] [--needs-feedback] [--db <path>]
  bun.cmd context/scripts/reviews.ts get <slug> [--json] [--db <path>]
  bun.cmd context/scripts/reviews.ts set <slug> [--rating <1-5|null>] [--likes <text>] [--dislikes <text>] [--broken <text>] [--needs-feedback <true|false>] [--db <path>]
  bun.cmd context/scripts/reviews.ts flag <slug> --needs-feedback <true|false> [--db <path>]
  bun.cmd context/scripts/reviews.ts integrity [--db <path>]
  bun.cmd context/scripts/reviews.ts merge-json --json <path> [--dry-run] [--db <path>]
  bun.cmd context/scripts/reviews.ts export [--json] [--db <path>]`);
  process.exit(1);
}

function parseArgs(args: string[]) {
  const positional: string[] = [];
  const options = new Map<string, string | boolean>();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }

    const key = arg.slice(2);
    if (["dry-run", "json", "needs-feedback"].includes(key)) {
      const next = args[index + 1];
      if (next && !next.startsWith("--") && (key !== "json" || positional[0] === "merge-json")) {
        options.set(key, next);
        index += 1;
      } else {
        options.set(key, true);
      }
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

function parseBoolean(value: string | undefined, label: string) {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  usage(`${label} must be true or false.`);
}

function parseRating(value: string | undefined) {
  if (value === undefined) {
    return undefined;
  }
  if (value === "null") {
    return null;
  }
  const rating = Number(value);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    usage("--rating must be 1, 2, 3, 4, 5, or null.");
  }
  return rating;
}

function assertSlug(slug: string) {
  if (!validSlugPattern.test(slug)) {
    usage(`Invalid slug: ${slug}`);
  }
}

function defaultReviewEntry(): ReviewEntry {
  return {
    broken: "",
    dislikes: "",
    likes: "",
    needsAdditionalFeedback: false,
    rating: null,
    updatedAt: null,
  };
}

function rowToEntry(row: ReviewRow): ReviewEntry {
  return {
    broken: row.broken,
    dislikes: row.dislikes,
    likes: row.likes,
    ...(row.needs_additional_feedback ? { needsAdditionalFeedback: true } : {}),
    rating: row.rating,
    updatedAt: row.updated_at,
  };
}

function sanitizeReview(value: unknown): ReviewEntry {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const ratingValue = record.rating;
  const rating =
    typeof ratingValue === "number" && Number.isInteger(ratingValue) && ratingValue >= 1 && ratingValue <= 5
      ? ratingValue
      : null;
  const needsAdditionalFeedbackValue =
    "needsAdditionalFeedback" in record ? record.needsAdditionalFeedback : record.needAdditionalFeedback;

  return {
    broken: typeof record.broken === "string" ? record.broken : "",
    dislikes: typeof record.dislikes === "string" ? record.dislikes : "",
    likes: typeof record.likes === "string" ? record.likes : "",
    ...(needsAdditionalFeedbackValue ? { needsAdditionalFeedback: true } : {}),
    rating,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : null,
  };
}

function openDb(pathname: string) {
  const db = new Database(pathname, { create: true, strict: true });
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_reviews (
      slug TEXT PRIMARY KEY NOT NULL,
      broken TEXT NOT NULL DEFAULT '',
      dislikes TEXT NOT NULL DEFAULT '',
      likes TEXT NOT NULL DEFAULT '',
      needs_additional_feedback INTEGER NOT NULL DEFAULT 0 CHECK (needs_additional_feedback IN (0, 1)),
      rating INTEGER CHECK (rating IS NULL OR (rating BETWEEN 1 AND 5)),
      updated_at TEXT
    )
  `);
  return db;
}

function getRow(db: Database, slug: string) {
  return db
    .query<ReviewRow, [string]>(
      `SELECT slug, broken, dislikes, likes, needs_additional_feedback, rating, updated_at
       FROM user_reviews
       WHERE slug = ?1`,
    )
    .get(slug);
}

function listRows(db: Database) {
  return db
    .query<ReviewRow, []>(
      `SELECT slug, broken, dislikes, likes, needs_additional_feedback, rating, updated_at
       FROM user_reviews
       ORDER BY slug`,
    )
    .all();
}

function writeEntry(db: Database, slug: string, review: ReviewEntry) {
  db.query<unknown, [string, string, string, string, number, number | null, string | null]>(
    `INSERT INTO user_reviews (
      slug,
      broken,
      dislikes,
      likes,
      needs_additional_feedback,
      rating,
      updated_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
    ON CONFLICT(slug) DO UPDATE SET
      broken = excluded.broken,
      dislikes = excluded.dislikes,
      likes = excluded.likes,
      needs_additional_feedback = excluded.needs_additional_feedback,
      rating = excluded.rating,
      updated_at = excluded.updated_at`,
  ).run(
    slug,
    review.broken,
    review.dislikes,
    review.likes,
    review.needsAdditionalFeedback ? 1 : 0,
    review.rating,
    review.updatedAt,
  );
}

function patchEntry(db: Database, slug: string, patch: ReviewPatch) {
  const existing = getRow(db, slug);
  const review = {
    ...(existing ? rowToEntry(existing) : defaultReviewEntry()),
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  writeEntry(db, slug, review);
  return rowToEntry(getRow(db, slug)!);
}

function renderReview(slug: string, review: ReviewEntry) {
  const feedback = review.needsAdditionalFeedback ? " needs-feedback" : "";
  return `${slug}: rating=${review.rating ?? "none"} updated=${review.updatedAt ?? "never"}${feedback}
  likes: ${review.likes || "(empty)"}
  dislikes: ${review.dislikes || "(empty)"}
  broken: ${review.broken || "(empty)"}`;
}

function isNewer(left: string | null, right: string | null) {
  if (left && right) {
    return Date.parse(left) > Date.parse(right);
  }
  return Boolean(left && !right);
}

function runList(db: Database, options: Map<string, string | boolean>) {
  const needsFeedback = booleanOption(options, "needs-feedback");
  const rows = listRows(db).filter((row) => !needsFeedback || row.needs_additional_feedback);
  if (booleanOption(options, "json")) {
    console.log(JSON.stringify(Object.fromEntries(rows.map((row) => [row.slug, rowToEntry(row)])), null, 2));
    return;
  }

  console.log(`${rows.length} review(s)`);
  for (const row of rows) {
    const review = rowToEntry(row);
    const feedback = review.needsAdditionalFeedback ? " needs-feedback" : "";
    console.log(`${row.slug} rating=${review.rating ?? "none"} updated=${review.updatedAt ?? "never"}${feedback}`);
  }
}

function runGet(db: Database, slug: string, options: Map<string, string | boolean>) {
  assertSlug(slug);
  const row = getRow(db, slug);
  if (!row) {
    usage(`Review not found: ${slug}`);
  }
  const review = rowToEntry(row);
  if (booleanOption(options, "json")) {
    console.log(JSON.stringify({ [slug]: review }, null, 2));
    return;
  }
  console.log(renderReview(slug, review));
}

function patchFromOptions(options: Map<string, string | boolean>) {
  const patch: ReviewPatch = {};
  const rating = parseRating(stringOption(options, "rating"));
  if (rating !== undefined) {
    patch.rating = rating;
  }

  for (const key of ["likes", "dislikes", "broken"] as const) {
    const value = stringOption(options, key);
    if (value !== undefined) {
      patch[key] = value;
    }
  }

  if (options.has("needs-feedback")) {
    const value = options.get("needs-feedback");
    patch.needsAdditionalFeedback = typeof value === "boolean" ? value : parseBoolean(value, "--needs-feedback");
  }

  if (Object.keys(patch).length === 0) {
    usage("No review fields supplied.");
  }
  return patch;
}

function runSet(db: Database, slug: string, options: Map<string, string | boolean>) {
  assertSlug(slug);
  const review = patchEntry(db, slug, patchFromOptions(options));
  console.log(renderReview(slug, review));
}

function runFlag(db: Database, slug: string, options: Map<string, string | boolean>) {
  assertSlug(slug);
  const value = parseBoolean(stringOption(options, "needs-feedback"), "--needs-feedback");
  const review = patchEntry(db, slug, { needsAdditionalFeedback: value });
  console.log(renderReview(slug, review));
}

function runIntegrity(db: Database) {
  const integrity = db.query<{ integrity_check: string }, []>("PRAGMA integrity_check").get()?.integrity_check;
  const table = db
    .query<{ name: string }, [string]>("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?1")
    .get("user_reviews");
  const rowCount = db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM user_reviews").get()?.count ?? 0;
  const latest = db
    .query<{ slug: string; updated_at: string | null }, []>(
      `SELECT slug, updated_at FROM user_reviews ORDER BY updated_at DESC LIMIT 5`,
    )
    .all();
  const ok = integrity === "ok" && table?.name === "user_reviews";
  console.log(JSON.stringify({ integrity, latest, ok, rowCount, table: table?.name ?? null }, null, 2));
  if (!ok) {
    process.exit(1);
  }
}

function loadJsonReviews(pathname: string) {
  if (!existsSync(pathname)) {
    usage(`JSON file not found: ${pathname}`);
  }
  const parsed = JSON.parse(readFileSync(pathname, "utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    usage("JSON review store must be an object.");
  }
  return Object.fromEntries(Object.entries(parsed).map(([slug, review]) => [slug, sanitizeReview(review)]));
}

function runMergeJson(db: Database, options: Map<string, string | boolean>) {
  const jsonPath = stringOption(options, "json");
  if (!jsonPath) {
    usage("merge-json requires --json <path>.");
  }

  const dryRun = booleanOption(options, "dry-run");
  const jsonReviews = loadJsonReviews(resolve(jsonPath));
  const dbRows = listRows(db);
  const dbBySlug = new Map(dbRows.map((row) => [row.slug, rowToEntry(row)]));
  const report = {
    dbOnly: [] as string[],
    dryRun,
    inserts: [] as string[],
    preservedDbNewer: [] as string[],
    skippedSameOrOlder: [] as string[],
    timestampConflicts: [] as Array<{ db: string | null; json: string | null; resolution: string; slug: string }>,
    updates: [] as string[],
  };

  for (const slug of Object.keys(jsonReviews)) {
    if (!validSlugPattern.test(slug)) {
      continue;
    }
    const jsonReview = jsonReviews[slug]!;
    const dbReview = dbBySlug.get(slug);
    if (!dbReview) {
      report.inserts.push(slug);
      if (!dryRun) {
        writeEntry(db, slug, jsonReview);
      }
      continue;
    }

    if (jsonReview.updatedAt !== dbReview.updatedAt) {
      const jsonWins = isNewer(jsonReview.updatedAt, dbReview.updatedAt);
      report.timestampConflicts.push({
        db: dbReview.updatedAt,
        json: jsonReview.updatedAt,
        resolution: jsonWins ? "json" : "db",
        slug,
      });
      if (jsonWins) {
        report.updates.push(slug);
        if (!dryRun) {
          writeEntry(db, slug, jsonReview);
        }
      } else {
        report.preservedDbNewer.push(slug);
      }
      continue;
    }

    report.skippedSameOrOlder.push(slug);
  }

  for (const slug of dbBySlug.keys()) {
    if (!(slug in jsonReviews)) {
      report.dbOnly.push(slug);
    }
  }

  console.log(JSON.stringify(report, null, 2));
}

function runExport(db: Database) {
  console.log(JSON.stringify(Object.fromEntries(listRows(db).map((row) => [row.slug, rowToEntry(row)])), null, 2));
}

const { options, positional } = parseArgs(Bun.argv.slice(2));
const command = positional[0];
if (!command) {
  usage();
}

const dbPath = resolve(stringOption(options, "db") ?? defaultDbPath);
const db = openDb(dbPath);
try {
  switch (command) {
    case "list":
      runList(db, options);
      break;
    case "get":
      runGet(db, positional[1] ?? usage("get requires <slug>."), options);
      break;
    case "set":
      runSet(db, positional[1] ?? usage("set requires <slug>."), options);
      break;
    case "flag":
      runFlag(db, positional[1] ?? usage("flag requires <slug>."), options);
      break;
    case "integrity":
      runIntegrity(db);
      break;
    case "merge-json":
      runMergeJson(db, options);
      break;
    case "export":
      runExport(db);
      break;
    default:
      usage(`Unknown command: ${command}`);
  }
} finally {
  db.close();
}
