import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Database } from "bun:sqlite";

export type ReviewRow = {
  broken: string;
  dislikes: string;
  likes: string;
  needs_additional_feedback: number;
  rating: number | null;
  slug: string;
  updated_at: string | null;
};

export type ReviewTextField = "likes" | "dislikes" | "broken";

export type WantingMoreSignal = {
  field: ReviewTextField;
  phrase: string;
  ruleId: string;
  weight: number;
};

export type WantingMoreMatch = {
  matchedSignals: WantingMoreSignal[];
  score: number;
};

export type ExtensionCandidate = {
  broken: string;
  dislikes: string;
  freshnessBoost: number;
  isFresh: boolean;
  likes: string;
  matchedSignals: WantingMoreSignal[];
  rating: number;
  recencyWeight: number;
  slug: string;
  updatedAt: string | null;
  wantingMoreScore: number;
  weight: number;
};

type SelectorOptions = {
  minimumRating?: number;
  now?: Date;
};

type CliOptions = {
  dbPath?: string;
  json: boolean;
  list: boolean;
  minimumRating: number;
  now?: string;
  seed?: string;
};

type Rule = {
  id: string;
  patterns: RegExp[];
  weight: number;
};

const scriptDir = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = resolve(scriptDir, "..", "user-reviews.sqlite");
const DEFAULT_MINIMUM_RATING = 4;
const FRESH_REVIEW_WINDOW_DAYS = 7;
const RECENCY_HALF_LIFE_DAYS = 14;

const WANTING_MORE_RULES: Rule[] = [
  {
    id: "explicit-want-more",
    weight: 2.8,
    patterns: [/\bi want more\b/, /\bwanted more\b/, /\bi wish there was more(?: content)?\b/, /\bwish it was longer\b/],
  },
  {
    id: "too-short",
    weight: 2.6,
    patterns: [/\btoo short\b/, /\bway too short\b/, /\bgame is way too short\b/, /\bgame should not end in\b/, /\bended in \d+\s*(?:m|min|minute|minutes)\b/],
  },
  {
    id: "longer-run",
    weight: 2.2,
    patterns: [/\b10x longer\b/, /\blonger\b/, /\bmore content\b/],
  },
  {
    id: "more-levels",
    weight: 2.1,
    patterns: [/\bmore levels?\b/, /\bmultiple levels?\b/, /\bneed at least \d+ levels?\b/, /\bwanted more levels?\b/],
  },
  {
    id: "more-variety",
    weight: 1.8,
    patterns: [/\bmore variety\b/, /\bmore enemy types\b/, /\bmore mechanics\b/, /\bmore bosses\b/, /\bmore items\b/, /\bmore powerups\b/, /\bmore stages\b/, /\bmore interactables\b/, /\bsecret paths\b/, /\bdynamic features\b/],
  },
  {
    id: "story-or-theme-depth",
    weight: 1.7,
    patterns: [/\bneeds a story\b/, /\bmore story\b/, /\bmore narrative\b/, /\bmeta narrative\b/, /\bmeta narative\b/, /\bmore utilization of the theme\b/],
  },
];

const HELP_TEXT = `catalog-builder-extension-selector.ts

Usage:
  bun.cmd ./scripts/catalog-builder-extension-selector.ts [--json] [--list] [--seed <value>] [--now <iso>] [--db <path>] [--min-rating <n>]

Behavior:
  - reads ./user-reviews.sqlite
  - filters to reviews with rating >= 4 by default
  - derives "wanting more" from documented keyword-and-phrase matches in likes, dislikes, and broken
  - applies a 20% fresh-review boost plus updatedAt-based recency weighting
  - picks one eligible slug with weighted randomness
`;

function usage(message?: string): never {
  if (message) {
    console.error(message);
  }
  console.error(HELP_TEXT);
  process.exit(1);
}

function chooseDbPath(explicitPath?: string): string {
  if (explicitPath) {
    return resolve(explicitPath);
  }
  return DEFAULT_DB_PATH;
}

function parseCliArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    json: false,
    list: false,
    minimumRating: DEFAULT_MINIMUM_RATING,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--json":
        options.json = true;
        break;
      case "--list":
        options.list = true;
        break;
      case "--seed":
        options.seed = argv[index + 1] ?? usage("Missing value for --seed.");
        index += 1;
        break;
      case "--now":
        options.now = argv[index + 1] ?? usage("Missing value for --now.");
        index += 1;
        break;
      case "--db":
        options.dbPath = argv[index + 1] ?? usage("Missing value for --db.");
        index += 1;
        break;
      case "--min-rating": {
        const raw = argv[index + 1] ?? usage("Missing value for --min-rating.");
        const minimumRating = Number(raw);
        if (!Number.isInteger(minimumRating) || minimumRating < 1 || minimumRating > 5) {
          usage("--min-rating must be an integer from 1 to 5.");
        }
        options.minimumRating = minimumRating;
        index += 1;
        break;
      }
      case "--help":
      case "-h":
        usage();
        break;
      default:
        usage(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replaceAll("’", "'")
    .replaceAll(/[^a-z0-9]+/g, " ")
    .trim();
}

function loadReviews(dbPath: string): ReviewRow[] {
  if (!existsSync(dbPath)) {
    throw new Error(`Review DB not found: ${dbPath}`);
  }

  const db = new Database(dbPath, { readonly: true, strict: true });
  try {
    return db
      .query<ReviewRow, []>(
        `SELECT slug, broken, dislikes, likes, needs_additional_feedback, rating, updated_at
         FROM user_reviews
         ORDER BY slug`,
      )
      .all();
  } finally {
    db.close();
  }
}

export function detectWantingMoreFromReview(review: Pick<ReviewRow, "likes" | "dislikes" | "broken">): WantingMoreMatch {
  const matchedSignals: WantingMoreSignal[] = [];

  for (const field of ["likes", "dislikes", "broken"] as const) {
    const value = review[field];
    if (!value.trim()) {
      continue;
    }

    const normalized = normalizeText(value);
    for (const rule of WANTING_MORE_RULES) {
      const match = rule.patterns
        .map((pattern) => pattern.exec(normalized)?.[0])
        .find((phrase): phrase is string => Boolean(phrase));
      if (!match) {
        continue;
      }
      matchedSignals.push({
        field,
        phrase: match,
        ruleId: rule.id,
        weight: rule.weight,
      });
    }
  }

  return {
    matchedSignals,
    score: matchedSignals.reduce((total, signal) => total + signal.weight, 0),
  };
}

export function calculateFreshnessBoost(updatedAt: string | null, now: Date): number {
  if (!updatedAt) {
    return 1;
  }

  const updatedTime = Date.parse(updatedAt);
  if (Number.isNaN(updatedTime)) {
    return 1;
  }

  const ageDays = Math.max(0, (now.getTime() - updatedTime) / 86_400_000);
  return ageDays <= FRESH_REVIEW_WINDOW_DAYS ? 1.2 : 1;
}

export function calculateRecencyWeight(updatedAt: string | null, now: Date): number {
  if (!updatedAt) {
    return 1;
  }

  const updatedTime = Date.parse(updatedAt);
  if (Number.isNaN(updatedTime)) {
    return 1;
  }

  const ageDays = Math.max(0, (now.getTime() - updatedTime) / 86_400_000);
  return 1 + 1 / (1 + ageDays / RECENCY_HALF_LIFE_DAYS);
}

export function buildExtensionCandidates(rows: ReviewRow[], options: SelectorOptions = {}): ExtensionCandidate[] {
  const now = options.now ?? new Date();
  const minimumRating = options.minimumRating ?? DEFAULT_MINIMUM_RATING;

  return rows
    .filter((row): row is ReviewRow & { rating: number } => typeof row.rating === "number" && row.rating >= minimumRating)
    .map((row) => {
      const wantingMore = detectWantingMoreFromReview(row);
      const freshnessBoost = calculateFreshnessBoost(row.updated_at, now);
      const recencyWeight = calculateRecencyWeight(row.updated_at, now);
      return {
        slug: row.slug,
        rating: row.rating,
        updatedAt: row.updated_at,
        likes: row.likes,
        dislikes: row.dislikes,
        broken: row.broken,
        matchedSignals: wantingMore.matchedSignals,
        wantingMoreScore: wantingMore.score,
        isFresh: freshnessBoost > 1,
        freshnessBoost,
        recencyWeight,
        weight: wantingMore.score * freshnessBoost * recencyWeight,
      };
    })
    .filter((candidate) => candidate.wantingMoreScore > 0)
    .sort((left, right) => left.slug.localeCompare(right.slug));
}

function createSeededRandom(seed: string): () => number {
  let hash = 1779033703 ^ seed.length;
  for (let index = 0; index < seed.length; index += 1) {
    hash = Math.imul(hash ^ seed.charCodeAt(index), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }

  let state = hash >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let next = Math.imul(state ^ (state >>> 15), 1 | state);
    next ^= next + Math.imul(next ^ (next >>> 7), 61 | next);
    return (((next ^ (next >>> 14)) >>> 0) / 4294967296);
  };
}

export function selectWeightedCandidate(candidates: ExtensionCandidate[], seed: string): ExtensionCandidate {
  if (candidates.length === 0) {
    throw new Error("No eligible high-rated wanting-more reviews found.");
  }

  const totalWeight = candidates.reduce((total, candidate) => total + candidate.weight, 0);
  if (totalWeight <= 0) {
    throw new Error("Eligible reviews produced no positive selection weight.");
  }

  const random = createSeededRandom(seed)();
  let cursor = random * totalWeight;
  for (const candidate of candidates) {
    cursor -= candidate.weight;
    if (cursor <= 0) {
      return candidate;
    }
  }

  return candidates.at(-1)!;
}

function formatListOutput(candidates: ExtensionCandidate[]) {
  return candidates.map((candidate) => ({
    slug: candidate.slug,
    rating: candidate.rating,
    updatedAt: candidate.updatedAt,
    weight: Number(candidate.weight.toFixed(4)),
    wantingMoreScore: Number(candidate.wantingMoreScore.toFixed(4)),
    recencyWeight: Number(candidate.recencyWeight.toFixed(4)),
    freshnessBoost: Number(candidate.freshnessBoost.toFixed(4)),
    isFresh: candidate.isFresh,
    matchedSignals: candidate.matchedSignals,
  }));
}

function main() {
  const options = parseCliArgs(Bun.argv.slice(2));
  const now = options.now ? new Date(options.now) : new Date();
  if (Number.isNaN(now.getTime())) {
    usage("--now must be a valid ISO timestamp.");
  }

  const candidates = buildExtensionCandidates(loadReviews(chooseDbPath(options.dbPath)), {
    minimumRating: options.minimumRating,
    now,
  });

  if (options.list) {
    if (options.json) {
      console.log(JSON.stringify({ candidates: formatListOutput(candidates), candidateCount: candidates.length }, null, 2));
      return;
    }

    if (candidates.length === 0) {
      console.log("No eligible candidates.");
      return;
    }

    for (const candidate of candidates) {
      console.log(
        `${candidate.slug} rating=${candidate.rating} weight=${candidate.weight.toFixed(3)} updated=${candidate.updatedAt ?? "never"} signals=${candidate.matchedSignals
          .map((signal) => signal.phrase)
          .join(", ")}`,
      );
    }
    return;
  }

  const seed = options.seed ?? `${Date.now()}-${Math.random()}`;
  const selected = selectWeightedCandidate(candidates, seed);
  if (options.json) {
    console.log(
      JSON.stringify(
        {
          candidateCount: candidates.length,
          minimumRating: options.minimumRating,
          selected: {
            ...selected,
            weight: Number(selected.weight.toFixed(4)),
            wantingMoreScore: Number(selected.wantingMoreScore.toFixed(4)),
            recencyWeight: Number(selected.recencyWeight.toFixed(4)),
            freshnessBoost: Number(selected.freshnessBoost.toFixed(4)),
          },
          seed,
          selectedAt: now.toISOString(),
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(selected.slug);
}

if (import.meta.main) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
