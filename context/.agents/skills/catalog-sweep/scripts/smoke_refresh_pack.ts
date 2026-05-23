import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { inspectSmokeArtifacts } from "./smoke_artifacts";
import { parseTodoRecords, type QueueState } from "./catalog_candidates";
import { saveLearning } from "./learning_capture";
import { buildReports, type CatalogEntryReport, type EntryIssue } from "./sweep_core";
import { isBootIssueCode } from "./throughput_lanes";

export type GroupMode = "missing" | "stale" | "all";

type CliOptions = {
  group?: GroupMode;
  json: boolean;
  limit?: number;
  saveLearning: boolean;
  slug?: string;
};

export type SmokeRefreshEntry = {
  slug: string;
  queueState: QueueState;
  lane: "missing-proof" | "stale-proof";
  issues: string[];
  evidence: string[];
  sourceFiles: string[];
  proofTargets: string[];
  nextSteps: string[];
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
      if (next !== "missing" && next !== "stale" && next !== "all") {
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

export function chooseDefaultGroup(entries: SmokeRefreshEntry[]): GroupMode {
  if (entries.some((entry) => entry.lane === "missing-proof")) {
    return "missing";
  }
  if (entries.some((entry) => entry.lane === "stale-proof")) {
    return "stale";
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

export function matchesGroup(group: GroupMode, entry: SmokeRefreshEntry): boolean {
  if (group === "all") {
    return true;
  }
  return group === "missing" ? entry.lane === "missing-proof" : entry.lane === "stale-proof";
}

export function groupLabel(group: GroupMode): string {
  if (group === "missing") {
    return "missing proof first";
  }
  if (group === "stale") {
    return "stale proof refresh";
  }
  return "all smoke refresh debt";
}

function rankIssue(issue: EntryIssue): number {
  if (issue.code === "missing-smoke-proof") {
    return 0;
  }
  if (issue.code === "stale-smoke-proof") {
    return 1;
  }
  if (isBootIssueCode(issue.code)) {
    return 2;
  }
  return 3;
}

function rankEntry(entry: SmokeRefreshEntry): number {
  if (entry.lane === "missing-proof") {
    return 0;
  }
  if (entry.issues.some((issue) => issue.startsWith("boot-blocker:"))) {
    return 1;
  }
  return 2;
}

function buildProofTargets(slug: string): string[] {
  return [
    `./.local/${slug}-smoke.json`,
    `./.local/${slug}-verify.png`,
    `./.local/<run>/${slug}-smoke.txt`,
  ];
}

function buildEntry(root: string, report: CatalogEntryReport): SmokeRefreshEntry | null {
  const relevantIssues = report.issues
    .filter((issue) => issue.code === "missing-smoke-proof" || issue.code === "stale-smoke-proof" || isBootIssueCode(issue.code))
    .sort((left, right) => {
      const rankDiff = rankIssue(left) - rankIssue(right);
      if (rankDiff !== 0) {
        return rankDiff;
      }
      return left.code.localeCompare(right.code);
    });

  const smokeIssue = relevantIssues.find((issue) => issue.code === "missing-smoke-proof" || issue.code === "stale-smoke-proof");
  if (!smokeIssue) {
    return null;
  }

  const smokeStatus = inspectSmokeArtifacts(root, report.slug);
  const bootIssues = relevantIssues.filter((issue) => isBootIssueCode(issue.code));
  const lane = smokeIssue.code === "missing-smoke-proof" ? "missing-proof" : "stale-proof";
  const evidence = [smokeIssue.detail];

  if (smokeStatus.kind === "present") {
    evidence.push(`latest smoke: ./.local/${smokeStatus.latestSmokeName}`);
    evidence.push(`latest content: ./games/${report.slug}/${smokeStatus.latestContentName}`);
  } else {
    evidence.push(`expected proof path starts with ./.local/${report.slug}-`);
  }

  for (const issue of bootIssues) {
    evidence.push(`boot blocker: ${issue.detail}`);
  }

  const sourceFiles = ["./todo.md", `./games/${report.slug}/index.html`, "./.local/"];
  if (smokeStatus.kind === "present") {
    sourceFiles.push(`./games/${report.slug}/${smokeStatus.latestContentName}`);
  }

  const nextSteps = bootIssues.length > 0
    ? [
        `Repair direct browser boot in ./games/${report.slug}/ before refreshing smoke proof.`,
        `Re-run local browser verification for ./games/${report.slug}/ and save proof to one of: ${buildProofTargets(report.slug).join(" | ")}.`,
        "Confirm the new proof is newer than the latest non-markdown content file before closing smoke debt.",
      ]
    : [
        `Run direct browser verification for ./games/${report.slug}/.`,
        `Save proof to one of: ${buildProofTargets(report.slug).join(" | ")}.`,
        "Confirm the new proof is newer than the latest non-markdown content file before closing smoke debt.",
      ];

  return {
    slug: report.slug,
    queueState: report.queueState,
    lane,
    issues: [
      smokeIssue.code,
      ...bootIssues.map((issue) => `boot-blocker:${issue.code}`),
    ],
    evidence,
    sourceFiles,
    proofTargets: buildProofTargets(report.slug),
    nextSteps,
  };
}

function buildLearning(group: GroupMode, filteredCount: number, entries: SmokeRefreshEntry[]): string {
  const missingCount = entries.filter((entry) => entry.lane === "missing-proof").length;
  const staleCount = entries.filter((entry) => entry.lane === "stale-proof").length;

  if (filteredCount === 0) {
    return "- Catalog throughput improves when smoke-refresh handoff can record a clean no-debt pass, because the next operator does not have to rerun browser-proof triage just to confirm every playable slug already has current local evidence.";
  }

  return `- Catalog throughput improves when smoke refresh debt expands into exact proof targets and next browser steps, because ${missingCount} missing-proof and ${staleCount} stale-proof slugs can move straight into re-verification without rediscovering where local evidence should land.`;
}

export function buildSmokeRefreshEntries(root: string, slug?: string): SmokeRefreshEntry[] {
  if (!existsSync(TODO_PATH)) {
    throw new Error("todo.md not found");
  }

  const todoRecords = parseTodoRecords(TODO_PATH);
  const reports = buildReports(root, todoRecords, slug);

  return reports
    .map((report) => buildEntry(root, report))
    .filter((entry): entry is SmokeRefreshEntry => entry !== null)
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
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const entries = buildSmokeRefreshEntries(ROOT, options.slug);

  const group = options.group ?? chooseDefaultGroup(entries);
  const filtered = entries.filter((entry) => matchesGroup(group, entry));
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
            missingCount: entries.filter((entry) => entry.lane === "missing-proof").length,
            staleCount: entries.filter((entry) => entry.lane === "stale-proof").length,
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

  console.log("# Smoke Refresh Pack");
  console.log("");
  console.log(
    `smoke debt: missing ${entries.filter((entry) => entry.lane === "missing-proof").length} | stale ${entries.filter((entry) => entry.lane === "stale-proof").length}`,
  );
  console.log(`selected group: ${groupLabel(group)} (${filtered.length})`);
  console.log(`default batch size: ${options.limit ?? 5}`);
  console.log("");
  console.log("## Smoke next");
  console.log("");
  if (group === "missing") {
    console.log("- Fill missing proof first. These slugs cannot prove local browser health until one real artifact lands.");
  } else if (group === "stale") {
    console.log("- Refresh stale proof next. Existing evidence is older than current playable content.");
  } else {
    console.log("- Work the list top to bottom. It is ranked so missing proof lands before stale proof.");
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
    console.log("- proof targets:");
    for (const target of entry.proofTargets) {
      console.log(`  - ${target}`);
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

if (import.meta.main) {
  main();
}
