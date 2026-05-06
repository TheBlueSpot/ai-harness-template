import { readdir, stat } from "node:fs/promises";
import { dirname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { Database } from "bun:sqlite";

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 2999);
const HIDDEN_PREFIX = ".";
const CATALOG_ENDPOINT = "/__catalog.json";
const USER_REVIEWS_ENDPOINT = "/__user-reviews";
const USER_REVIEWS_DB_FILE = join(ROOT, "user-reviews.sqlite");
const INFRA_DIRECTORIES = new Set([
  ".agents",
  ".git",
  ".github",
  ".local",
  ".vscode",
  "architecture",
  "assets",
  "command-protocol",
  "coverage",
  "dist",
  "docs",
  "harness",
  "lib",
  "model-provider",
  "node_modules",
  "prompts",
  "scripts",
  "src",
  "tmp",
]);

type CatalogEntry = {
  href: string;
  name: string;
};

type ReviewEntry = {
  broken: string;
  dislikes: string;
  likes: string;
  needsAdditionalFeedback?: boolean;
  rating: number | null;
  updatedAt: string | null;
};

type ReviewStore = Record<string, ReviewEntry>;

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

let reviewDatabaseReady: Promise<Database> | null = null;

class ReviewConflictError extends Error {
  constructor(readonly review: ReviewEntry) {
    super("Review changed since loaded.");
  }
}

async function pathStat(pathname: string) {
  try {
    return await stat(pathname);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function isContentDirectory(name: string) {
  if (!name || name.startsWith(HIDDEN_PREFIX) || INFRA_DIRECTORIES.has(name)) {
    return false;
  }

  const directoryPath = join(ROOT, name);
  const directoryStat = await pathStat(directoryPath);
  if (!directoryStat?.isDirectory()) {
    return false;
  }

  const indexStat = await pathStat(join(directoryPath, "index.html"));
  return Boolean(indexStat?.isFile());
}

async function listCatalogEntries(): Promise<CatalogEntry[]> {
  const directoryEntries = await readdir(ROOT, { withFileTypes: true });
  const names = directoryEntries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  const checks = await Promise.all(
    names.map(async (name) => ((await isContentDirectory(name)) ? { name, href: `/${name}/` } : null)),
  );

  return checks.filter((entry): entry is CatalogEntry => entry !== null);
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

function reviewRowToEntry(row: ReviewRow): ReviewEntry {
  return {
    broken: row.broken,
    dislikes: row.dislikes,
    likes: row.likes,
    ...(row.needs_additional_feedback ? { needsAdditionalFeedback: true } : {}),
    rating: row.rating,
    updatedAt: row.updated_at,
  };
}

async function openReviewDatabase() {
  if (reviewDatabaseReady) {
    return reviewDatabaseReady;
  }

  reviewDatabaseReady = (async () => {
    const db = new Database(USER_REVIEWS_DB_FILE, { create: true, strict: true });
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
  })();

  return reviewDatabaseReady;
}

async function readReviewStore(): Promise<ReviewStore> {
  const db = await openReviewDatabase();
  const rows = db
    .query<ReviewRow, []>(
      `SELECT
        slug,
        broken,
        dislikes,
        likes,
        needs_additional_feedback,
        rating,
        updated_at
      FROM user_reviews
      ORDER BY slug`,
    )
    .all();
  return Object.fromEntries(rows.map((row) => [row.slug, reviewRowToEntry(row)]));
}

async function getReviewEntry(slug: string) {
  const db = await openReviewDatabase();
  const row = db
    .query<ReviewRow, [string]>(
      `SELECT
        slug,
        broken,
        dislikes,
        likes,
        needs_additional_feedback,
        rating,
        updated_at
      FROM user_reviews
      WHERE slug = ?1`,
    )
    .get(slug);
  return row ? reviewRowToEntry(row) : null;
}

function parseReviewPatch(payload: unknown): { baseUpdatedAt?: string | null; patch: ReviewPatch } {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Invalid JSON body.");
  }

  const record = payload as Record<string, unknown>;
  const allowedKeys = new Set(["baseUpdatedAt", "broken", "dislikes", "likes", "needsAdditionalFeedback", "rating"]);
  for (const key of Object.keys(record)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`Unknown review field: ${key}`);
    }
  }

  const patch: ReviewPatch = {};
  if ("rating" in record) {
    const rating = record.rating;
    if (rating !== null && !(typeof rating === "number" && Number.isInteger(rating) && rating >= 1 && rating <= 5)) {
      throw new Error("rating must be null or an integer from 1 to 5.");
    }
    patch.rating = rating;
  }

  for (const key of ["broken", "dislikes", "likes"] as const) {
    if (key in record) {
      if (typeof record[key] !== "string") {
        throw new Error(`${key} must be a string.`);
      }
      patch[key] = record[key];
    }
  }

  if ("needsAdditionalFeedback" in record) {
    if (typeof record.needsAdditionalFeedback !== "boolean") {
      throw new Error("needsAdditionalFeedback must be a boolean.");
    }
    patch.needsAdditionalFeedback = record.needsAdditionalFeedback;
  }

  if (Object.keys(patch).length === 0) {
    throw new Error("Review patch must include at least one changed field.");
  }

  const baseUpdatedAt = record.baseUpdatedAt;
  if (baseUpdatedAt !== undefined && baseUpdatedAt !== null && typeof baseUpdatedAt !== "string") {
    throw new Error("baseUpdatedAt must be a string or null.");
  }

  return {
    baseUpdatedAt: baseUpdatedAt === undefined ? undefined : baseUpdatedAt,
    patch,
  };
}

async function patchReviewEntry(slug: string, patch: ReviewPatch, baseUpdatedAt?: string | null) {
  const db = await openReviewDatabase();
  const existing = (await getReviewEntry(slug)) ?? defaultReviewEntry();
  if (baseUpdatedAt !== undefined && baseUpdatedAt !== existing.updatedAt) {
    throw new ReviewConflictError(existing);
  }

  if (!(await getReviewEntry(slug))) {
    db.query<unknown, [string]>("INSERT INTO user_reviews (slug) VALUES (?1)").run(slug);
  }

  const assignments: string[] = [];
  const values: Array<string | number | null> = [];
  const addAssignment = (column: string, value: string | number | null) => {
    assignments.push(`${column} = ?${values.length + 1}`);
    values.push(value);
  };

  if ("broken" in patch) {
    addAssignment("broken", patch.broken ?? "");
  }
  if ("dislikes" in patch) {
    addAssignment("dislikes", patch.dislikes ?? "");
  }
  if ("likes" in patch) {
    addAssignment("likes", patch.likes ?? "");
  }
  addAssignment("needs_additional_feedback", 0);
  if ("rating" in patch) {
    addAssignment("rating", patch.rating ?? null);
  }

  addAssignment("updated_at", new Date().toISOString());
  values.push(slug);
  db.query(`UPDATE user_reviews SET ${assignments.join(", ")} WHERE slug = ?${values.length}`).run(...values);
  const saved = await getReviewEntry(slug);
  return saved ?? defaultReviewEntry();
}

function isValidSlug(slug: string) {
  return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(slug);
}

function withinRoot(pathname: string) {
  return pathname === ROOT || pathname.startsWith(`${ROOT}${sep}`);
}

function safeResolveFromRoot(pathname: string) {
  const normalized = normalize(pathname).replace(/^([/\\])+/, "");
  const absolute = resolve(ROOT, normalized);
  return withinRoot(absolute) ? absolute : null;
}

async function serveFile(pathname: string) {
  const fileStat = await pathStat(pathname);
  if (!fileStat?.isFile()) {
    return null;
  }

  const file = Bun.file(pathname);
  return new Response(file, {
    headers: file.type ? { "Content-Type": file.type } : undefined,
  });
}

async function handleCatalogRequest() {
  const entries = await listCatalogEntries();
  return Response.json(entries);
}

async function handleUserReviewsRequest() {
  const reviews = await readReviewStore();
  return Response.json(reviews);
}

async function handleUserReviewPatch(request: Request, slug: string) {
  if (!isValidSlug(slug) || !(await isContentDirectory(slug))) {
    return new Response("Unknown catalog entry.", { status: 404 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return new Response("Invalid JSON body.", { status: 400 });
  }

  let parsed: { baseUpdatedAt?: string | null; patch: ReviewPatch };
  try {
    parsed = parseReviewPatch(payload);
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Invalid review patch.", { status: 400 });
  }

  try {
    return Response.json(await patchReviewEntry(slug, parsed.patch, parsed.baseUpdatedAt));
  } catch (error) {
    if (error instanceof ReviewConflictError) {
      return Response.json({ error: error.message, review: error.review }, { status: 409 });
    }
    throw error;
  }
}

async function handleStaticRequest(urlPath: string) {
  if (urlPath === "/") {
    return serveFile(join(ROOT, "index.html"));
  }

  const segments = urlPath.split("/").filter(Boolean);
  if (segments.some((segment) => segment.startsWith(HIDDEN_PREFIX))) {
    return null;
  }

  const candidatePath = safeResolveFromRoot(urlPath);
  if (!candidatePath) {
    return null;
  }

  const directFile = await serveFile(candidatePath);
  if (directFile) {
    return directFile;
  }

  const requestStat = await pathStat(candidatePath);
  if (!requestStat?.isDirectory()) {
    return null;
  }

  const topLevel = candidatePath.slice(ROOT.length + 1).split(/[\\/]/, 1)[0];
  if (!(await isContentDirectory(topLevel))) {
    return null;
  }

  return serveFile(join(candidatePath, "index.html"));
}

const server = Bun.serve({
  port: PORT,
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === CATALOG_ENDPOINT) {
      return handleCatalogRequest();
    }

    if (url.pathname === USER_REVIEWS_ENDPOINT && request.method === "GET") {
      return handleUserReviewsRequest();
    }

    if (url.pathname.startsWith(`${USER_REVIEWS_ENDPOINT}/`) && request.method === "PATCH") {
      const slug = decodeURIComponent(url.pathname.slice(USER_REVIEWS_ENDPOINT.length + 1));
      return handleUserReviewPatch(request, slug);
    }

    if (url.pathname.startsWith(`${USER_REVIEWS_ENDPOINT}/`) && request.method === "PUT") {
      return new Response("Use PATCH for review updates.", { status: 405 });
    }

    const response = await handleStaticRequest(url.pathname);
    return response ?? new Response("Not Found", { status: 404 });
  },
});

console.log(`Catalog host live at http://localhost:${server.port}`);
