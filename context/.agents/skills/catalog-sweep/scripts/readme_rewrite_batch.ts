import { buildEntry, buildTextOutput as buildStarterTextOutput } from "./readme_rewrite_starter";
import { collectDocsPackEntries, chooseDefaultGroup, groupLabel, matchesGroup, type DocsPackEntry, type GroupMode } from "./docs_rewrite_pack";
import { saveLearning } from "./learning_capture";

type CliOptions = {
  group?: GroupMode;
  json: boolean;
  limit?: number;
  saveLearning: boolean;
  slugs: string[];
};

type BatchEntry = ReturnType<typeof buildEntry>;

const ROOT = process.cwd();

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { json: false, saveLearning: false, slugs: [] };

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
    if ((arg === "--group" || arg === "--limit" || arg === "--slug") && !next) {
      throw new Error(`Missing value for ${arg}`);
    }

    if (arg === "--group") {
      if (
        next !== "launch" &&
        next !== "implementation" &&
        next !== "log" &&
        next !== "links" &&
        next !== "mixed" &&
        next !== "missing-readme" &&
        next !== "all"
      ) {
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
      options.slugs.push(next ?? "");
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function uniqueSlugs(entries: DocsPackEntry[]): string[] {
  return [...new Set(entries.map((entry) => entry.slug))];
}

function selectDocsLane(options: CliOptions): { group: GroupMode; selected: DocsPackEntry[] } {
  const { entries, counts } = collectDocsPackEntries(ROOT);
  const group = options.group ?? chooseDefaultGroup(counts);
  const selected = entries
    .filter((entry) => matchesGroup(group, entry))
    .slice(0, options.limit ?? entries.length);
  return { group, selected };
}

function selectEntries(options: CliOptions): { mode: "group" | "explicit"; group?: GroupMode; slugs: string[] } {
  if (options.slugs.length > 0) {
    return { mode: "explicit", slugs: [...new Set(options.slugs)].slice(0, options.limit ?? options.slugs.length) };
  }

  const lane = selectDocsLane(options);
  return { mode: "group", group: lane.group, slugs: uniqueSlugs(lane.selected) };
}

function buildBatch(entries: string[]): BatchEntry[] {
  return entries.map((slug) => buildEntry(slug, ROOT));
}

function buildLearning(
  selection: { mode: "group" | "explicit"; group?: GroupMode; slugs: string[] },
  entries: BatchEntry[],
): string {
  const flagged = entries.filter((entry) => entry.reviewFreshness?.lane === "flag-after-edit").length;
  const blocked = entries.filter((entry) => entry.reviewFreshness?.lane === "needs-feedback").length;
  const missing = entries.filter((entry) => entry.reviewFreshness?.lane === "review-missing").length;

  if (entries.length === 0) {
    return "- Catalog throughput improves when docs batch helpers can save a clean no-work pass, because the next operator does not have to rerun README triage just to confirm no rewrite lane or review guard was missed.";
  }

  const laneLabel = selection.mode === "group" ? groupLabel(selection.group ?? "all") : "explicit docs batch";
  return `- Catalog throughput improves when README rewrite batches carry inline review-freshness guards and save the chosen ${laneLabel} lane, because ${entries.length} doc targets can move together without dropping needsAdditionalFeedback closeout (${flagged} flag-after-edit, ${blocked} blocked, ${missing} missing review rows).`;
}

function buildBatchTextOutput(
  selection: { mode: "group" | "explicit"; group?: GroupMode; slugs: string[] },
  entries: BatchEntry[],
): string {
  const lines = [
    "# README Rewrite Batch",
    "",
    `entries: ${entries.length}`,
    selection.mode === "group"
      ? `selected lane: ${groupLabel(selection.group ?? "all")}`
      : `selected slugs: ${selection.slugs.join(", ")}`,
    "",
    "## Rewrite next",
    "",
    selection.mode === "group"
      ? "- Work these same-lane README rewrites in one pass so docs closure stays batchable."
      : "- Use explicit slugs when you already know the exact README set and want starters without rerunning docs triage.",
    "- Each starter carries its review-freshness guard so README edits do not drop the canonical needsAdditionalFeedback closeout.",
  ];

  for (const entry of entries) {
    lines.push("");
    lines.push(buildStarterTextOutput(entry));
  }

  return lines.join("\n");
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const selection = selectEntries(options);
  const entries = buildBatch(selection.slugs);
  const durableLearning = buildLearning(selection, entries);

  if (options.saveLearning) {
    saveLearning({ learningLine: durableLearning });
  }

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          selection,
          durableLearning,
          entries,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(buildBatchTextOutput(selection, entries));
}

if (import.meta.main) {
  main();
}
