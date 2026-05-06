import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { parseTodoRecords, type QueueState } from "./catalog_candidates";
import { saveLearning } from "./learning_capture";
import { buildReports, type CatalogEntryReport, type EntryIssue, type EntryIssueCode } from "./sweep_core";

type RiskLane = "hard-blocker" | "casing-risk" | "smoke-drift";
type GroupMode = RiskLane | "all";

type CliOptions = {
  group?: GroupMode;
  json: boolean;
  limit?: number;
  saveLearning: boolean;
  slug?: string;
};

type RiskPacketEntry = {
  slug: string;
  queueState: QueueState;
  lane: RiskLane;
  issueCodes: EntryIssueCode[];
  evidence: string[];
  sourceFiles: string[];
  nextSteps: string[];
  commands: string[];
};

const ROOT = process.cwd();
const TODO_PATH = resolve(ROOT, "todo.md");

const HARD_BLOCKER_CODES: EntryIssueCode[] = [
  "missing-boot-script",
  "inline-script-syntax",
  "script-syntax",
  "missing-local-reference",
  "missing-local-import",
];

const CASING_ONLY_CODES: EntryIssueCode[] = ["casing-drift"];
const SMOKE_ONLY_CODES: EntryIssueCode[] = ["missing-smoke-proof", "stale-smoke-proof"];

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
      if (
        next !== "hard-blocker"
        && next !== "casing-risk"
        && next !== "smoke-drift"
        && next !== "all"
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
      options.slug = next;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function issueRank(issue: EntryIssue): number {
  if (HARD_BLOCKER_CODES.includes(issue.code)) {
    return 0;
  }
  if (CASING_ONLY_CODES.includes(issue.code)) {
    return 1;
  }
  if (issue.code === "missing-smoke-proof") {
    return 2;
  }
  if (issue.code === "stale-smoke-proof") {
    return 3;
  }
  return 4;
}

function detectLane(issues: EntryIssue[]): RiskLane | null {
  if (issues.some((issue) => HARD_BLOCKER_CODES.includes(issue.code))) {
    return "hard-blocker";
  }
  if (issues.some((issue) => CASING_ONLY_CODES.includes(issue.code))) {
    return "casing-risk";
  }
  if (issues.some((issue) => SMOKE_ONLY_CODES.includes(issue.code))) {
    return "smoke-drift";
  }
  return null;
}

function rankLane(lane: RiskLane): number {
  if (lane === "hard-blocker") {
    return 0;
  }
  if (lane === "casing-risk") {
    return 1;
  }
  return 2;
}

function matchesGroup(group: GroupMode, entry: RiskPacketEntry): boolean {
  return group === "all" || group === entry.lane;
}

function defaultGroup(entries: RiskPacketEntry[]): GroupMode {
  if (entries.some((entry) => entry.lane === "hard-blocker")) {
    return "hard-blocker";
  }
  if (entries.some((entry) => entry.lane === "casing-risk")) {
    return "casing-risk";
  }
  if (entries.some((entry) => entry.lane === "smoke-drift")) {
    return "smoke-drift";
  }
  return "all";
}

function describeGroup(group: GroupMode): string {
  if (group === "hard-blocker") {
    return "hard blockers";
  }
  if (group === "casing-risk") {
    return "casing risks";
  }
  if (group === "smoke-drift") {
    return "smoke drift";
  }
  return "all browser-playability risk";
}

function buildEntry(report: CatalogEntryReport): RiskPacketEntry | null {
  const relevantIssues = report.issues
    .filter((issue) =>
      HARD_BLOCKER_CODES.includes(issue.code)
      || CASING_ONLY_CODES.includes(issue.code)
      || SMOKE_ONLY_CODES.includes(issue.code),
    )
    .sort((left, right) => {
      const rankDiff = issueRank(left) - issueRank(right);
      if (rankDiff !== 0) {
        return rankDiff;
      }
      return left.code.localeCompare(right.code);
    });

  const lane = detectLane(relevantIssues);
  if (!lane) {
    return null;
  }

  return {
    slug: report.slug,
    queueState: report.queueState,
    lane,
    issueCodes: relevantIssues.map((issue) => issue.code),
    evidence: relevantIssues.map((issue) => `${issue.code}: ${issue.detail}`),
    sourceFiles: ["./todo.md", `./${report.slug}/index.html`, `./${report.slug}/README.md`, "./.local/"],
    nextSteps: buildNextSteps(report.slug, lane),
    commands: buildCommands(report.slug, lane),
  };
}

function buildNextSteps(slug: string, lane: RiskLane): string[] {
  if (lane === "hard-blocker") {
    return [
      `Repair direct browser boot in ./${slug}/ before any browser rerun.`,
      "Clear missing local references, broken imports, or syntax faults from the evidence list.",
      "After boot is clean, save fresh smoke proof so verify debt closes in the same pass.",
    ];
  }

  if (lane === "casing-risk") {
    return [
      `Normalize path casing in ./${slug}/ before treating the entry as cross-platform safe.`,
      "Recheck the affected HTML or JS import edges after the rename so browser-only hosts will still boot.",
      "Save or refresh smoke proof after the casing fix if the last proof is now stale.",
    ];
  }

  return [
    `Run one fresh direct browser smoke for ./${slug}/ and save proof under ./.local.`,
    "Treat this as verify closure work, not a rebuild lane.",
    "Use the fresh artifact to keep downstream quality scans on browser-safe entries only.",
  ];
}

function buildCommands(slug: string, lane: RiskLane): string[] {
  const commands = [`bun.cmd .agents/skills/catalog-sweep/scripts/browser_playability_packet.ts --slug ${slug}`];

  if (lane === "smoke-drift") {
    commands.push(`bun.cmd .agents/skills/catalog-sweep/scripts/smoke_refresh_pack.ts --slug ${slug}`);
  } else {
    commands.push(`bun.cmd .agents/skills/catalog-sweep/scripts/next_catalog_task.ts --focus verify --slug ${slug}`);
  }

  return commands;
}

function queueRank(queueState: QueueState): number {
  if (queueState === "pending") {
    return 0;
  }
  if (queueState === "untracked") {
    return 1;
  }
  return 2;
}

function formatQueueState(queueState: QueueState): string {
  if (queueState === "pending") {
    return "pending";
  }
  if (queueState === "completed") {
    return "completed";
  }
  return "untracked";
}

function buildLearning(group: GroupMode, selectedCount: number, counts: Record<RiskLane, number>): string {
  if (selectedCount === 0) {
    return "- Catalog throughput improves when browser-risk packets still save a clean-pass note, because the next operator can trust that no top-level entry needs immediate boot or smoke triage.";
  }

  return `- Catalog throughput improves when one browser-risk packet groups top-level entries into ${describeGroup(group)} with exact next commands; this pass kept hard blockers (${counts["hard-blocker"]}), casing risks (${counts["casing-risk"]}), and smoke drift (${counts["smoke-drift"]}) in one closure handoff so verify work stops reopening the full sweep.`;
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
    .filter((entry): entry is RiskPacketEntry => entry !== null)
    .sort((left, right) => {
      const laneDiff = rankLane(left.lane) - rankLane(right.lane);
      if (laneDiff !== 0) {
        return laneDiff;
      }
      const queueDiff = queueRank(left.queueState) - queueRank(right.queueState);
      if (queueDiff !== 0) {
        return queueDiff;
      }
      return left.slug.localeCompare(right.slug);
    });

  const counts: Record<RiskLane, number> = {
    "hard-blocker": entries.filter((entry) => entry.lane === "hard-blocker").length,
    "casing-risk": entries.filter((entry) => entry.lane === "casing-risk").length,
    "smoke-drift": entries.filter((entry) => entry.lane === "smoke-drift").length,
  };

  const group = options.group ?? defaultGroup(entries);
  const filtered = entries.filter((entry) => matchesGroup(group, entry));
  const limited = filtered.slice(0, options.limit ?? 5);
  const durableLearning = buildLearning(group, filtered.length, counts);

  if (options.saveLearning) {
    saveLearning({ learningLine: durableLearning });
  }

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          summary: {
            hardBlockers: counts["hard-blocker"],
            casingRisks: counts["casing-risk"],
            smokeDrift: counts["smoke-drift"],
            selectedGroup: group,
            selectedLabel: describeGroup(group),
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

  console.log("# Playability Risk Packet");
  console.log("");
  console.log(`browser risk: hard ${counts["hard-blocker"]} | casing ${counts["casing-risk"]} | smoke ${counts["smoke-drift"]}`);
  console.log(`selected group: ${describeGroup(group)} (${filtered.length})`);
  console.log(`default batch size: ${options.limit ?? 5}`);
  console.log("");
  console.log("## Action next");
  console.log("");
  if (group === "hard-blocker") {
    console.log("- Repair these boot blockers before spending browser time elsewhere.");
  } else if (group === "casing-risk") {
    console.log("- Normalize casing drift now so direct folder boot stays safe on case-sensitive hosts.");
  } else if (group === "smoke-drift") {
    console.log("- Refresh smoke proof in one small batch so downstream audits stay on current browser evidence.");
  } else {
    console.log("- Work the list top to bottom. It is already ranked by risk family and queue pressure.");
  }

  for (const entry of limited) {
    console.log("");
    console.log(`## ${entry.slug}`);
    console.log("");
    console.log(`- queue: ${formatQueueState(entry.queueState)}`);
    console.log(`- lane: ${entry.lane}`);
    console.log(`- issues: ${entry.issueCodes.join(", ")}`);
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
