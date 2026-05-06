import { saveLearning } from "./learning_capture";
import {
  buildReviewFreshnessEntries,
  chooseDefaultGroup,
  groupLabel,
  matchesGroup,
  type GroupMode,
  type ReviewFreshnessEntry,
} from "./review_freshness_core";

type CliOptions = {
  db?: string;
  group?: GroupMode;
  json: boolean;
  limit?: number;
  saveLearning: boolean;
  slug?: string;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { json: false, saveLearning: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--save-learning") {
      options.saveLearning = true;
      continue;
    }

    const next = argv[index + 1];
    if ((arg === "--db" || arg === "--group" || arg === "--limit" || arg === "--slug") && !next) {
      throw new Error(`Missing value for ${arg}`);
    }

    if (arg === "--db") {
      options.db = next;
      index += 1;
      continue;
    }

    if (arg === "--group") {
      if (next !== "missing" && next !== "blocked" && next !== "flag" && next !== "all") {
        throw new Error(`Unsupported --group value: ${next}`);
      }
      options.group = next;
      index += 1;
      continue;
    }

    if (arg === "--limit") {
      const limit = Number.parseInt(next ?? "", 10);
      if (!Number.isFinite(limit) || limit < 1) {
        throw new Error(`Invalid --limit value: ${next}`);
      }
      options.limit = limit;
      index += 1;
      continue;
    }

    if (arg === "--slug") {
      options.slug = next;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function buildLearning(entries: ReviewFreshnessEntry[], group: GroupMode): string {
  const missingCount = entries.filter((entry) => entry.lane === "review-missing").length;
  const blockedCount = entries.filter((entry) => entry.lane === "needs-feedback").length;
  const flagCount = entries.filter((entry) => entry.lane === "flag-after-edit").length;
  const selectedCount = entries.filter((entry) => matchesGroup(group, entry)).length;

  if (selectedCount === 0) {
    return "- Catalog throughput improves when review-freshness triage still records a clean pass, because operators can trust that no queued or playable slug currently needs review seeding, stale-feedback blocking, or pre-edit reflag reminders.";
  }

  return `- Catalog throughput improves when one review-freshness lane separates missing reviews (${missingCount}), blocked reviews (${blockedCount}), and pre-edit flag targets (${flagCount}), because operators stop using stale feedback as evidence and know exactly which slugs need reflagging before catalog edits land.`;
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const entries = buildReviewFreshnessEntries({ dbPath: options.db, slug: options.slug });

  const group = options.group ?? chooseDefaultGroup(entries);
  const filtered = entries.filter((entry) => matchesGroup(group, entry));
  const limited = filtered.slice(0, options.limit ?? 10);
  const durableLearning = buildLearning(entries, group);

  if (options.saveLearning) {
    saveLearning({ learningLine: durableLearning });
  }

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          summary: {
            selectedCount: filtered.length,
            selectedGroup: group,
            selectedLabel: groupLabel(group),
            blockedCount: entries.filter((entry) => entry.lane === "needs-feedback").length,
            flagCount: entries.filter((entry) => entry.lane === "flag-after-edit").length,
            missingCount: entries.filter((entry) => entry.lane === "review-missing").length,
          },
          durableLearning,
          entries: limited,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log("# Review Freshness Pack");
  console.log("");
  console.log(
    `review debt: missing ${entries.filter((entry) => entry.lane === "review-missing").length} | blocked ${entries.filter((entry) => entry.lane === "needs-feedback").length} | flag-after-edit ${entries.filter((entry) => entry.lane === "flag-after-edit").length}`,
  );
  console.log(`selected group: ${groupLabel(group)} (${filtered.length})`);
  console.log(`default batch size: ${options.limit ?? 10}`);
  console.log("");
  console.log("## Review next");
  console.log("");
  if (group === "missing") {
    console.log("- Seed review rows first. Missing feedback records cannot guide catalog choices.");
  } else if (group === "blocked") {
    console.log("- Ignore blocked reviews for evidence until fresh feedback clears needsAdditionalFeedback.");
  } else if (group === "flag") {
    console.log("- Treat this list as pre-edit reminders. If you touch existing files, reflag the review before closing the slug.");
  } else {
    console.log("- Work missing, then blocked, then pre-edit flag reminders so usable evidence stays trustworthy.");
  }

  for (const entry of limited) {
    console.log("");
    console.log(`## ${entry.slug}`);
    console.log("");
    console.log(`- queue: ${entry.queueState}`);
    console.log(`- folder: ${entry.folderPresent ? "present" : "missing"}`);
    console.log(`- lane: ${entry.lane}`);
    console.log(`- review: ${entry.reviewSummary}`);
    console.log("- files:");
    for (const file of entry.sourceFiles) {
      console.log(`  - ${file}`);
    }
    console.log("- next:");
    for (const step of entry.nextSteps) {
      console.log(`  - ${step}`);
    }
  }

  console.log("");
  console.log("## Durable learning");
  console.log("");
  console.log(durableLearning);
}

main();
