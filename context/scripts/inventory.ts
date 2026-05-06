import { Database } from "bun:sqlite";
import { mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export type InventoryRow = {
  slug: string;
  topLevelPath: string;
  browserPlayable: boolean;
  evidenceSources: string[];
  reviewLink: {
    slug: string | null;
    needsAdditionalFeedback: boolean | null;
    missingLink: boolean;
  };
};

export type InventoryReport = {
  generatedAt: string;
  root: string;
  rows: InventoryRow[];
};

const rootDir = resolve(import.meta.dir, "..");
const reviewDbPath = resolve(rootDir, "user-reviews.sqlite");

function readReviewMap() {
  const db = new Database(reviewDbPath, { readonly: true });
  try {
    const rows = db
      .query<
        { slug: string; needs_additional_feedback: number | null },
        []
      >(
        "SELECT slug, needs_additional_feedback FROM user_reviews ORDER BY slug ASC",
      )
      .all();
    return new Map(rows.map((row) => [row.slug, row.needs_additional_feedback === 1]));
  } finally {
    db.close();
  }
}

export function buildInventoryReport(): InventoryReport {
  const reviewMap = readReviewMap();
  const topLevelEntries = readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      slug: entry.name,
      path: resolve(rootDir, entry.name),
    }))
    .filter((entry) => !entry.slug.startsWith("."));

  const rows = topLevelEntries.map((entry) => {
    const indexPath = resolve(entry.path, "index.html");
    const readmePath = resolve(entry.path, "README.md");
    const browserPlayable = statSync(indexPath, { throwIfNoEntry: false })?.isFile() ?? false;
    const evidenceSources = [
      ...(statSync(readmePath, { throwIfNoEntry: false })?.isFile() ? [`./${entry.slug}/README.md`] : []),
      ...(browserPlayable ? [`./${entry.slug}/index.html`] : []),
    ];
    const hasReview = reviewMap.has(entry.slug);
    return {
      slug: entry.slug,
      topLevelPath: `./${entry.slug}`,
      browserPlayable,
      evidenceSources,
      reviewLink: {
        slug: hasReview ? entry.slug : null,
        needsAdditionalFeedback: reviewMap.get(entry.slug) ?? null,
        missingLink: !hasReview,
      },
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    root: "./",
    rows,
  };
}

function main() {
  const report = buildInventoryReport();
  const outputPath = resolve(rootDir, ".local", "planner", "inventory.json");
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(report, null, 2) + "\n");
  console.log(outputPath);
}

if (import.meta.main) {
  main();
}
