import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { Database } from "bun:sqlite";
import {
  buildQueueSnapshot,
  parseTodoRecords,
  type QueueRecord,
  type QueueState,
} from "./catalog_candidates";

export type GroupMode = "missing" | "blocked" | "flag" | "all";

type ReviewRow = {
  broken: string;
  dislikes: string;
  likes: string;
  needs_additional_feedback: number;
  rating: number | null;
  slug: string;
  updated_at: string | null;
};

export type ReviewFreshnessLane = "review-missing" | "needs-feedback" | "flag-after-edit";

export type ReviewFreshnessEntry = {
  folderPresent: boolean;
  lane: ReviewFreshnessLane;
  nextSteps: string[];
  queueState: QueueState;
  reviewSummary: string;
  slug: string;
  sourceFiles: string[];
};

const ROOT = process.cwd();
const TODO_PATH = resolve(ROOT, "todo.md");
const DEFAULT_DB_PATH = resolve(ROOT, "user-reviews.sqlite");
const FALLBACK_DB_PATH = resolve(ROOT, "scripts", "user-reviews.sqlite");

export function chooseDbPath(explicitPath?: string): string {
  if (explicitPath) {
    return resolve(explicitPath);
  }
  if (existsSync(DEFAULT_DB_PATH)) {
    return DEFAULT_DB_PATH;
  }
  return FALLBACK_DB_PATH;
}

export function loadReviews(dbPath: string): Map<string, ReviewRow> {
  if (!existsSync(dbPath)) {
    throw new Error(`Review DB not found: ${dbPath}`);
  }

  const db = new Database(dbPath, { readonly: true, strict: true });
  try {
    const rows = db
      .query<ReviewRow, []>(
        `SELECT slug, broken, dislikes, likes, needs_additional_feedback, rating, updated_at
         FROM user_reviews
         ORDER BY slug`,
      )
      .all();
    return new Map(rows.map((row) => [row.slug, row]));
  } finally {
    db.close();
  }
}

export function normalizeQueueState(records: QueueRecord[] | undefined): QueueState {
  if (!records || records.length === 0) {
    return "untracked";
  }
  if (records.some((record) => record.state === "pending")) {
    return "pending";
  }
  return "completed";
}

export function queuePriority(state: QueueState): number {
  if (state === "pending") {
    return 0;
  }
  if (state === "untracked") {
    return 1;
  }
  return 2;
}

export function buildReviewSummary(row: ReviewRow | undefined): string {
  if (!row) {
    return "missing review row";
  }

  const parts = [
    `rating ${row.rating ?? "none"}`,
    `updated ${row.updated_at ?? "never"}`,
    row.needs_additional_feedback ? "needsAdditionalFeedback true" : "needsAdditionalFeedback false",
  ];

  const signalCount = [row.likes, row.dislikes, row.broken].filter((value) => value.trim().length > 0).length;
  parts.push(`${signalCount} populated feedback field${signalCount === 1 ? "" : "s"}`);
  return parts.join(" | ");
}

export function buildReviewFreshnessEntry(
  slug: string,
  queueState: QueueState,
  folderPresent: boolean,
  row: ReviewRow | undefined,
): ReviewFreshnessEntry {
  if (!row) {
    return {
      slug,
      queueState,
      folderPresent,
      lane: "review-missing",
      reviewSummary: buildReviewSummary(undefined),
      sourceFiles: ["./todo.md", "./user-reviews.sqlite", "./scripts/user-reviews.ts"],
      nextSteps: [
        `Do not use player feedback as evidence for ./games/${slug}/ until a review row exists.`,
        `Create or import a review row for ${slug} before using taste or bug notes to guide catalog decisions.`,
        "If you later edit an existing game file, set the canonical review flag back to needsAdditionalFeedback true.",
      ],
    };
  }

  if (row.needs_additional_feedback) {
    return {
      slug,
      queueState,
      folderPresent,
      lane: "needs-feedback",
      reviewSummary: buildReviewSummary(row),
      sourceFiles: ["./todo.md", "./user-reviews.sqlite", "./scripts/user-reviews.ts"],
      nextSteps: [
        `Do not use this review as evidence for ./games/${slug}/ until fresh feedback clears or replaces it.`,
        "Refresh the review, then write needsAdditionalFeedback false only when the new input is current enough to trust.",
        "Keep existing review fields; only replace the stale evidence with fresh player input.",
      ],
    };
  }

  return {
    slug,
    queueState,
    folderPresent,
    lane: "flag-after-edit",
    reviewSummary: buildReviewSummary(row),
    sourceFiles: ["./todo.md", `./games/${slug}/`, "./user-reviews.sqlite", "./scripts/user-reviews.ts"],
    nextSteps: [
      `If you edit any existing file in ./games/${slug}/, flag its review row to needsAdditionalFeedback true before finishing.`,
      "Keep the current review usable only while the slug stays unchanged or you are adding brand-new files only.",
      "After the edit lands, gather fresh feedback before using the review again for evidence or prioritization.",
    ],
  };
}

export function buildReviewFreshnessEntries(options?: {
  dbPath?: string;
  slug?: string;
}): ReviewFreshnessEntry[] {
  if (!existsSync(TODO_PATH)) {
    throw new Error("todo.md not found");
  }

  const todoRecords = parseTodoRecords(TODO_PATH);
  const queueSnapshot = buildQueueSnapshot(ROOT, todoRecords);
  const reviews = loadReviews(chooseDbPath(options?.dbPath));
  const candidateSlugs = options?.slug
    ? [options.slug]
    : Array.from(new Set([...queueSnapshot.playableFolders, ...todoRecords.keys()])).sort((left, right) => left.localeCompare(right));

  return candidateSlugs
    .map((slug) =>
      buildReviewFreshnessEntry(
        slug,
        normalizeQueueState(todoRecords.get(slug)),
        queueSnapshot.playableFolders.includes(slug),
        reviews.get(slug),
      ),
    )
    .sort((left, right) => {
      const laneRank =
        (left.lane === "review-missing" ? 0 : left.lane === "needs-feedback" ? 1 : 2) -
        (right.lane === "review-missing" ? 0 : right.lane === "needs-feedback" ? 1 : 2);
      if (laneRank !== 0) {
        return laneRank;
      }
      const queueRank = queuePriority(left.queueState) - queuePriority(right.queueState);
      if (queueRank !== 0) {
        return queueRank;
      }
      if (left.folderPresent !== right.folderPresent) {
        return left.folderPresent ? -1 : 1;
      }
      return left.slug.localeCompare(right.slug);
    });
}

export function chooseDefaultGroup(entries: ReviewFreshnessEntry[]): GroupMode {
  if (entries.some((entry) => entry.lane === "review-missing")) {
    return "missing";
  }
  if (entries.some((entry) => entry.lane === "needs-feedback")) {
    return "blocked";
  }
  if (entries.some((entry) => entry.lane === "flag-after-edit")) {
    return "flag";
  }
  return "all";
}

export function matchesGroup(group: GroupMode, entry: ReviewFreshnessEntry): boolean {
  if (group === "all") {
    return true;
  }
  if (group === "missing") {
    return entry.lane === "review-missing";
  }
  if (group === "blocked") {
    return entry.lane === "needs-feedback";
  }
  return entry.lane === "flag-after-edit";
}

export function groupLabel(group: GroupMode): string {
  if (group === "missing") {
    return "review rows missing";
  }
  if (group === "blocked") {
    return "reviews blocked by needsAdditionalFeedback";
  }
  if (group === "flag") {
    return "likely slugs to flag after edits";
  }
  return "all review-freshness lanes";
}
