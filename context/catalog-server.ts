import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join, normalize, resolve, sep } from "node:path";

const ROOT = process.cwd();
const PORT = Number(process.env.PORT ?? 2999);
const HIDDEN_PREFIX = ".";
const CATALOG_ENDPOINT = "/__catalog.json";
const USER_REVIEWS_ENDPOINT = "/__user-reviews";
const USER_REVIEWS_FILE = join(ROOT, "user-reviews.json");
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
  rating: number | null;
  updatedAt: string | null;
};

type ReviewStore = Record<string, ReviewEntry>;

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
    rating: null,
    updatedAt: null,
  };
}

function sanitizeReviewEntry(value: unknown): ReviewEntry {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const ratingValue = record.rating;
  const parsedRating =
    typeof ratingValue === "number" && Number.isInteger(ratingValue) && ratingValue >= 1 && ratingValue <= 5
      ? ratingValue
      : null;

  return {
    broken: typeof record.broken === "string" ? record.broken : "",
    dislikes: typeof record.dislikes === "string" ? record.dislikes : "",
    likes: typeof record.likes === "string" ? record.likes : "",
    rating: parsedRating,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : null,
  };
}

async function readReviewStore(): Promise<ReviewStore> {
  const fileStat = await pathStat(USER_REVIEWS_FILE);
  if (!fileStat) {
    await writeReviewStore({});
    return {};
  }

  const raw = await readFile(USER_REVIEWS_FILE, "utf8");
  if (!raw.trim()) {
    return {};
  }

  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(parsed).map(([slug, review]) => [slug, sanitizeReviewEntry(review)]),
  );
}

async function writeReviewStore(store: ReviewStore) {
  await writeFile(USER_REVIEWS_FILE, `${JSON.stringify(store, null, 2)}\n`, "utf8");
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

async function handleUserReviewUpdate(request: Request, slug: string) {
  if (!isValidSlug(slug) || !(await isContentDirectory(slug))) {
    return new Response("Unknown catalog entry.", { status: 404 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return new Response("Invalid JSON body.", { status: 400 });
  }

  const review = sanitizeReviewEntry(payload);
  const nextReview: ReviewEntry = {
    ...review,
    updatedAt: new Date().toISOString(),
  };

  const store = await readReviewStore();
  store[slug] = nextReview;
  await writeReviewStore(store);

  return Response.json(nextReview);
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

    if (url.pathname.startsWith(`${USER_REVIEWS_ENDPOINT}/`) && request.method === "PUT") {
      const slug = decodeURIComponent(url.pathname.slice(USER_REVIEWS_ENDPOINT.length + 1));
      return handleUserReviewUpdate(request, slug);
    }

    const response = await handleStaticRequest(url.pathname);
    return response ?? new Response("Not Found", { status: 404 });
  },
});

console.log(`Catalog host live at http://localhost:${server.port}`);
