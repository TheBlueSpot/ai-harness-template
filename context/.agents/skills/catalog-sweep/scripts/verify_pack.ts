import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { parseTodoRecords, type QueueState } from "./catalog_candidates";
import { saveLearning } from "./learning_capture";
import { buildReports, type CatalogEntryReport, type EntryIssue } from "./sweep_core";
import {
  buildVerifySnapshot,
  isBootIssueCode,
  isSmokeIssueCode,
} from "./throughput_lanes";

type GroupMode = "boot" | "smoke" | "all";

type CliOptions = {
  group?: GroupMode;
  json: boolean;
  limit?: number;
  saveLearning: boolean;
  slug?: string;
};

type VerifyPackEntry = {
  slug: string;
  queueState: QueueState;
  lane: "boot-first" | "smoke-refresh";
  issues: string[];
  evidence: string[];
  sourceFiles: string[];
  nextSteps: string[];
  commands: string[];
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
      if (next !== "boot" && next !== "smoke" && next !== "all") {
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

function chooseDefaultGroup(entries: VerifyPackEntry[]): GroupMode {
  if (entries.some((entry) => entry.lane === "boot-first")) {
    return "boot";
  }
  if (entries.some((entry) => entry.lane === "smoke-refresh")) {
    return "smoke";
  }
  return "all";
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

function rankIssue(issue: EntryIssue): number {
  if (isBootIssueCode(issue.code)) {
    return 0;
  }
  if (issue.code === "missing-smoke-proof") {
    return 1;
  }
  return 2;
}

function rankEntry(entry: VerifyPackEntry): number {
  if (entry.lane === "boot-first") {
    return 0;
  }
  return entry.issues.includes("missing-smoke-proof") ? 1 : 2;
}

function matchesGroup(group: GroupMode, entry: VerifyPackEntry): boolean {
  if (group === "all") {
    return true;
  }
  return group === "boot" ? entry.lane === "boot-first" : entry.lane === "smoke-refresh";
}

function groupLabel(group: GroupMode): string {
  if (group === "boot") {
    return "boot blockers first";
  }
  if (group === "smoke") {
    return "smoke refresh";
  }
  return "all verify debt";
}

function buildEntry(report: CatalogEntryReport): VerifyPackEntry | null {
  const relevantIssues = report.issues
    .filter((issue) => isBootIssueCode(issue.code) || isSmokeIssueCode(issue.code))
    .sort((left, right) => {
      const rankDiff = rankIssue(left) - rankIssue(right);
      if (rankDiff !== 0) {
        return rankDiff;
      }
      return left.code.localeCompare(right.code);
    });

  if (relevantIssues.length === 0) {
    return null;
  }

  const hasBootDebt = relevantIssues.some((issue) => isBootIssueCode(issue.code));
  const lane = hasBootDebt ? "boot-first" : "smoke-refresh";

  return {
    slug: report.slug,
    queueState: report.queueState,
    lane,
    issues: relevantIssues.map((issue) => issue.code),
    evidence: relevantIssues.map((issue) => `${issue.code}: ${issue.detail}`),
    sourceFiles: ["./todo.md", `./games/${report.slug}/index.html`, `./games/${report.slug}/README.md`, "./.local/"],
    nextSteps: hasBootDebt
      ? [
          `Repair direct browser boot in ./games/${report.slug}/ before any browser rerun.`,
          "Clear missing references, import casing drift, or syntax breaks from the listed evidence.",
          "After boot is clean, rerun local browser smoke and save fresh proof under ./.local.",
        ]
      : [
          `Run a fresh local browser smoke for ./games/${report.slug}/ and save evidence under ./.local.`,
          "Confirm direct folder boot still works before trusting the new proof.",
          "Use the fresh artifact to close verify debt without reopening the same slug for rediscovery.",
        ],
    commands: [
      `bun.cmd .agents/skills/catalog-sweep/scripts/browser_playability_packet.ts --slug ${report.slug}`,
      `bun.cmd .agents/skills/catalog-sweep/scripts/next_catalog_task.ts --focus verify --slug ${report.slug}`,
    ],
  };
}

function buildLearning(group: GroupMode, filteredCount: number, verifySnapshot: ReturnType<typeof buildVerifySnapshot>): string {
  if (filteredCount === 0) {
    return "- Catalog throughput improves when verify helpers still save the selected lane on clean passes, because a recorded no-debt check prevents the next operator from rerunning browser triage just to confirm nothing slipped.";
  }

  return `- Catalog throughput improves when verify helpers save one ${groupLabel(group)} lane with ${filteredCount} ranked entries; this pass kept boot debt (${verifySnapshot.bootSlugs.length}) and smoke drift (${verifySnapshot.smokeSlugs.length}) in one closure packet so browser re-check work does not repeat sweep discovery.`;
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  if (!existsSync(TODO_PATH)) {
    throw new Error("todo.md not found");
  }

  const todoRecords = parseTodoRecords(TODO_PATH);
  const reports = buildReports(ROOT, todoRecords, options.slug);
  const entries = reports
    .map((report) => buildEntry(report))
    .filter((entry): entry is VerifyPackEntry => entry !== null)
    .sort((left, right) => {
      const rankDiff = rankEntry(left) - rankEntry(right);
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

  const group = options.group ?? chooseDefaultGroup(entries);
  const filtered = entries.filter((entry) => matchesGroup(group, entry));
  const limited = filtered.slice(0, options.limit ?? 5);
  const verifySnapshot = buildVerifySnapshot(reports);
  const durableLearning = buildLearning(group, filtered.length, verifySnapshot);

  if (options.saveLearning) {
    saveLearning({ learningLine: durableLearning });
  }

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          summary: {
            bootCount: verifySnapshot.bootSlugs.length,
            smokeCount: verifySnapshot.smokeSlugs.length,
            selectedGroup: group,
            selectedLabel: groupLabel(group),
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

  console.log("# Verify Pack");
  console.log("");
  console.log(`verify debt: boot ${verifySnapshot.bootSlugs.length} | smoke ${verifySnapshot.smokeSlugs.length}`);
  console.log(`selected group: ${groupLabel(group)} (${filtered.length})`);
  console.log(`default batch size: ${options.limit ?? 5}`);
  console.log("");
  console.log("## Verify next");
  console.log("");
  if (group === "boot") {
    console.log("- Repair boot blockers first. Browser reruns are wasted while local direct boot is already broken.");
  } else if (group === "smoke") {
    console.log("- Boot is already clear enough for this lane. Refresh proof in one small batch so verify closure stops drifting.");
  } else {
    console.log("- Work the list top to bottom. It is already ranked so direct-boot blockers land before smoke-only refresh.");
  }

  for (const entry of limited) {
    console.log("");
    console.log(`## ${entry.slug}`);
    console.log("");
    console.log(`- queue: ${formatQueueState(entry.queueState)}`);
    console.log(`- lane: ${entry.lane}`);
    console.log(`- issues: ${entry.issues.join(", ")}`);
    console.log("- files:");
    for (const file of entry.sourceFiles) {
      console.log(`  - ${file}`);
    }
    console.log("- evidence:");
    for (const evidence of entry.evidence) {
      console.log(`  - ${evidence}`);
    }
    console.log("- next:");
    for (const step of entry.nextSteps) {
      console.log(`  - ${step}`);
    }
    console.log("- commands:");
    for (const command of entry.commands) {
      console.log(`  - ${command}`);
    }
  }

  console.log("");
  console.log("## Durable learning");
  console.log("");
  console.log(durableLearning);
}

main();
