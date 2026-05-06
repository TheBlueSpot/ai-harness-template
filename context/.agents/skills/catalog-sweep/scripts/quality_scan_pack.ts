import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { parseTodoRecords, type QueueState } from "./catalog_candidates";
import { saveLearning } from "./learning_capture";
import { buildReports, type CatalogEntryReport } from "./sweep_core";
import {
  buildQualityEntry,
  chooseDefaultQualityGroup,
  matchesQualityGroup,
  qualityGroupLabel,
  rankQualityPackEntry,
  type QualityPackEntry,
} from "./quality_scan_core";

type GroupMode = "ready" | "refresh" | "boot" | "all";

type CliOptions = {
  group?: GroupMode;
  json: boolean;
  limit?: number;
  saveLearning: boolean;
  slug?: string;
};

const ROOT = process.cwd();
const TODO_PATH = resolve(ROOT, "todo.md");

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
    if ((arg === "--group" || arg === "--limit" || arg === "--slug") && !next) {
      throw new Error(`Missing value for ${arg}`);
    }

    if (arg === "--group") {
      if (next !== "ready" && next !== "refresh" && next !== "boot" && next !== "all") {
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

function formatQueueState(state: QueueState): string {
  if (state === "completed") {
    return "completed";
  }
  if (state === "pending") {
    return "pending";
  }
  return "untracked";
}

function buildLearning(group: GroupMode, filteredCount: number, entries: QualityPackEntry[]): string {
  const readyCount = entries.filter((entry) => entry.lane === "capture-ready").length;
  const refreshCount = entries.filter((entry) => entry.lane === "refresh-browser-first").length;
  const bootCount = entries.filter((entry) => entry.lane === "boot-blocked").length;

  if (filteredCount === 0) {
    return "- Catalog quality improves when quality-scan prep can record a clean no-debt pass, because the next operator does not have to rerun evidence triage just to confirm no capture-ready audit target was missed.";
  }

  return `- Catalog quality improves when one helper ranks fresh-smoke entries that still lack reusable playtest capture, because cross-entry audit passes can start from ${readyCount} capture-ready targets instead of rediscovering which slugs are browser-safe, while ${refreshCount} still need fresh proof and ${bootCount} remain boot-blocked.`;
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  if (!existsSync(TODO_PATH)) {
    throw new Error("todo.md not found");
  }

  const todoRecords = parseTodoRecords(TODO_PATH);
  const reports = buildReports(ROOT, todoRecords, options.slug);
  const entries = reports
    .map((report) => buildQualityEntry(ROOT, report))
    .filter((entry): entry is QualityPackEntry => entry !== null)
    .sort((left, right) => {
      const rankDiff = rankQualityPackEntry(left) - rankQualityPackEntry(right);
      if (rankDiff !== 0) {
        return rankDiff;
      }
      if (left.queueState !== right.queueState) {
        if (left.queueState === "pending") {
          return -1;
        }
        if (right.queueState === "pending") {
          return 1;
        }
      }
      return left.slug.localeCompare(right.slug);
    });

  const group = options.group ?? chooseDefaultQualityGroup(entries);
  const filtered = entries.filter((entry) => matchesQualityGroup(group, entry));
  const limited = filtered.slice(0, options.limit ?? 5);
  const durableLearning = buildLearning(group, filtered.length, entries);

  if (options.saveLearning) {
    saveLearning({ learningLine: durableLearning });
  }

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          summary: {
            readyCount: entries.filter((entry) => entry.lane === "capture-ready").length,
            refreshCount: entries.filter((entry) => entry.lane === "refresh-browser-first").length,
            bootCount: entries.filter((entry) => entry.lane === "boot-blocked").length,
            selectedGroup: group,
            selectedLabel: qualityGroupLabel(group),
            selectedCount: filtered.length,
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

  console.log("# Quality Scan Pack");
  console.log("");
  console.log(
    `quality prep: ready ${entries.filter((entry) => entry.lane === "capture-ready").length} | refresh ${entries.filter((entry) => entry.lane === "refresh-browser-first").length} | boot ${entries.filter((entry) => entry.lane === "boot-blocked").length}`,
  );
  console.log(`selected group: ${qualityGroupLabel(group)} (${filtered.length})`);
  console.log(`default batch size: ${options.limit ?? 5}`);
  console.log("");
  console.log("## Quality next");
  console.log("");
  if (group === "ready") {
    console.log("- Work these in direct browser play next. Fresh smoke already exists, so the missing piece is reusable playtest capture.");
  } else if (group === "refresh") {
    console.log("- Refresh browser proof first. Quality claims should not outrun stale or missing smoke evidence.");
  } else if (group === "boot") {
    console.log("- Repair boot before any quality audit. Broken direct boot invalidates later playtest capture.");
  } else {
    console.log("- Work the list top to bottom. It is ranked so capture-ready slugs land before refresh and boot debt.");
  }

  for (const entry of limited) {
    console.log("");
    console.log(`## ${entry.slug}`);
    console.log("");
    console.log(`- queue: ${formatQueueState(entry.queueState)}`);
    console.log(`- lane: ${entry.lane}`);
    console.log("- files:");
    for (const file of entry.sourceFiles) {
      console.log(`  - ${file}`);
    }
    console.log("- evidence:");
    for (const item of entry.evidence) {
      console.log(`  - ${item}`);
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
