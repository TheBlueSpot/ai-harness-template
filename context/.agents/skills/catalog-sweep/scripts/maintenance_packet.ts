import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { buildQueueSnapshot, parseTodoRecords, type QueueRecord, type QueueState } from "./catalog_candidates";
import { buildKojimaSignals } from "./kojima_signals";
import { saveLearning } from "./learning_capture";
import { buildReviewFreshnessEntries } from "./review_freshness_core";
import { inspectSmokeArtifacts } from "./smoke_artifacts";
import { buildQueueOnlyReports, buildReports, type CatalogEntryReport, type EntryIssue } from "./sweep_core";
import { isBootIssueCode, isDocsIssueCode, isReconcileIssueCode, isSmokeIssueCode } from "./throughput_lanes";

type CliOptions = {
  json: boolean;
  saveLearning: boolean;
  slug: string;
};

type MaintenanceLane = "queue" | "boot" | "docs" | "smoke" | "review";

type MaintenancePacket = {
  slug: string;
  folderPresent: boolean;
  queueState: QueueState;
  queueSummary: string;
  sources: string[];
  issues: string[];
  nextSteps: string[];
  commands: string[];
  proofTargets: string[];
  reviewSummary: string;
  reviewLane: string;
  kojimaSignals: string[];
};

const ROOT = process.cwd();
const TODO_PATH = resolve(ROOT, "todo.md");

function parseArgs(argv: string[]): CliOptions {
  const options: Partial<CliOptions> = { json: false, saveLearning: false };

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
    if (arg === "--slug") {
      const next = argv[index + 1];
      if (!next) {
        throw new Error("Missing value for --slug");
      }
      options.slug = next;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!options.slug) {
    throw new Error("maintenance_packet.ts requires --slug <slug>");
  }

  return {
    json: options.json ?? false,
    saveLearning: options.saveLearning ?? false,
    slug: options.slug,
  };
}

function formatQueueSummary(records: QueueRecord[] | undefined, folderPresent: boolean): { state: QueueState; summary: string } {
  if (!records || records.length === 0) {
    return {
      state: "untracked",
      summary: folderPresent
        ? "untracked playable folder in repo"
        : "no queue record and no playable folder",
    };
  }

  const states = new Set(records.map((record) => record.state));
  if (states.size > 1) {
    return {
      state: "pending",
      summary: `${records.length} queue records with mixed states`,
    };
  }

  const state = records[0]?.state ?? "untracked";
  return {
    state,
    summary: `${state} queue record${records.length === 1 ? "" : "s"}${folderPresent ? " with playable folder" : " without playable folder"}`,
  };
}

function buildProofTargets(slug: string): string[] {
  return [
    `./.local/${slug}-smoke.json`,
    `./.local/${slug}-verify.png`,
    `./.local/<run>/${slug}-smoke.txt`,
  ];
}

function issueLane(issue: EntryIssue): MaintenanceLane {
  if (isReconcileIssueCode(issue.code)) {
    return "queue";
  }
  if (isBootIssueCode(issue.code)) {
    return "boot";
  }
  if (isDocsIssueCode(issue.code) || issue.code === "missing-readme") {
    return "docs";
  }
  if (isSmokeIssueCode(issue.code)) {
    return "smoke";
  }
  return "boot";
}

function laneRank(lane: MaintenanceLane): number {
  if (lane === "queue") {
    return 0;
  }
  if (lane === "boot") {
    return 1;
  }
  if (lane === "docs") {
    return 2;
  }
  if (lane === "smoke") {
    return 3;
  }
  return 4;
}

function formatIssue(issue: EntryIssue): string {
  return `${issueLane(issue)}: ${issue.code} - ${issue.detail}`;
}

function buildPacket(slug: string): MaintenancePacket {
  if (!existsSync(TODO_PATH)) {
    throw new Error("todo.md not found");
  }

  const todoRecords = parseTodoRecords(TODO_PATH);
  const queueSnapshot = buildQueueSnapshot(ROOT, todoRecords);
  const folderPresent = queueSnapshot.playableFolders.includes(slug);
  const queueRecords = todoRecords.get(slug);
  const queueState = formatQueueSummary(queueRecords, folderPresent);
  const report = folderPresent ? buildReports(ROOT, todoRecords, slug)[0] : undefined;
  const queueOnlyReport = buildQueueOnlyReports(todoRecords, new Set(queueSnapshot.playableFolders)).find((entry) => entry.slug === slug);
  const review = buildReviewFreshnessEntries({ slug })[0];
  const smokeStatus = folderPresent ? inspectSmokeArtifacts(ROOT, slug) : { kind: "missing" as const };
  const kojimaSignals = buildKojimaSignals(undefined, undefined, 4);

  const issues = [
    ...(queueOnlyReport?.issues.map((issue) => `queue: ${issue.code} - ${issue.detail}`) ?? []),
    ...(report?.issues
      .slice()
      .sort((left, right) => {
        const rankDiff = laneRank(issueLane(left)) - laneRank(issueLane(right));
        if (rankDiff !== 0) {
          return rankDiff;
        }
        return left.code.localeCompare(right.code);
      })
      .map(formatIssue) ?? []),
  ];

  if (review) {
    issues.push(`review: ${review.lane} - ${review.reviewSummary}`);
  }

  const sources = ["./todo.md", "./user-reviews.sqlite", "./scripts/user-reviews.ts"];
  if (folderPresent) {
    sources.push(`./${slug}/index.html`);
    sources.push(`./${slug}/README.md`);
  }
  if (smokeStatus.kind === "present") {
    sources.push(`./.local/${smokeStatus.latestSmokeName}`);
    sources.push(`./${slug}/${smokeStatus.latestContentName}`);
  } else if (folderPresent) {
    sources.push("./.local/");
  }

  const nextSteps: string[] = [];
  if (!folderPresent && queueState.state === "pending") {
    nextSteps.push(`Create ./${slug}/ with direct browser boot before touching another slug.`);
  }
  if (queueOnlyReport) {
    nextSteps.push(`Reconcile queue coverage for ${slug} so future sweeps stop rediscovering this drift.`);
  }
  const bootIssues = report?.issues.filter((issue) => isBootIssueCode(issue.code)) ?? [];
  if (bootIssues.length > 0) {
    nextSteps.push(`Repair direct boot in ./${slug}/ before spending time on smoke refresh or quality review.`);
  }
  const docsIssues = report?.issues.filter((issue) => issue.code === "missing-readme" || isDocsIssueCode(issue.code)) ?? [];
  if (docsIssues.length > 0) {
    nextSteps.push(`Rewrite ./${slug}/README.md as a short high-level launch doc after boot is stable.`);
  }
  const smokeIssues = report?.issues.filter((issue) => isSmokeIssueCode(issue.code)) ?? [];
  if (smokeIssues.length > 0) {
    nextSteps.push(`Refresh local browser proof for ${slug} and save it under one of: ${buildProofTargets(slug).join(" | ")}.`);
  }
  if (review?.lane === "flag-after-edit") {
    nextSteps.push(`If you edit existing files in ./${slug}/, flag the review row before closing the slug.`);
  }
  if (review?.lane === "needs-feedback") {
    nextSteps.push(`Do not use current review evidence for ${slug} until fresh feedback clears needsAdditionalFeedback.`);
  }
  if (review?.lane === "review-missing") {
    nextSteps.push(`Do not use player feedback for ${slug} until a review row exists.`);
  }
  if (nextSteps.length === 0) {
    nextSteps.push(`No active maintenance debt found for ${slug}; keep queue truth unchanged unless new work starts.`);
  }

  const commands: string[] = [];
  if (folderPresent) {
    commands.push(`bun.cmd .agents/skills/catalog-sweep/scripts/next_catalog_task.ts --slug ${slug}`);
  }
  if (docsIssues.length > 0 && folderPresent) {
    commands.push(`bun.cmd .agents/skills/catalog-sweep/scripts/readme_rewrite_starter.ts --slug ${slug}`);
  }
  if (smokeIssues.length > 0 && folderPresent) {
    commands.push(`bun.cmd .agents/skills/catalog-sweep/scripts/smoke_refresh_pack.ts --slug ${slug}`);
  }
  commands.push(`bun.cmd .agents/skills/catalog-sweep/scripts/review_freshness_pack.ts --slug ${slug}`);
  if (review?.lane === "flag-after-edit") {
    commands.push(`bun.cmd .agents/skills/catalog-sweep/scripts/review_flag_sync.ts --slug ${slug}`);
    commands.push(`bun.cmd .agents/skills/catalog-sweep/scripts/review_flag_sync.ts --slug ${slug} --apply`);
  }
  if (!folderPresent || queueOnlyReport) {
    commands.push(`bun.cmd .agents/skills/catalog-sweep/scripts/reconcile_packet.ts --slug ${slug}`);
  }

  return {
    slug,
    folderPresent,
    queueState: queueState.state,
    queueSummary: queueState.summary,
    sources,
    issues,
    nextSteps,
    commands,
    proofTargets: buildProofTargets(slug),
    reviewSummary: review?.reviewSummary ?? "no review state found",
    reviewLane: review?.lane ?? "none",
    kojimaSignals: kojimaSignals.signalLines,
  };
}

function buildLearning(packet: MaintenancePacket): string {
  return `- Catalog throughput improves when one slug packet stitches queue state, docs prep, smoke targets, and review-flag commands together, because per-entry maintenance stops bouncing between separate helpers before the first edit.`;
}

function renderText(packet: MaintenancePacket, durableLearning: string): string {
  const lines = [
    "# Maintenance Packet",
    "",
    `slug: ${packet.slug}`,
    `queue: ${packet.queueState}`,
    `folder: ${packet.folderPresent ? "present" : "missing"}`,
    `summary: ${packet.queueSummary}`,
    "",
    "## Sources",
    "",
    ...packet.sources.map((source) => `- ${source}`),
    "",
    "## Issues",
    "",
    ...packet.issues.map((issue) => `- ${issue}`),
    "",
    "## Next",
    "",
    ...packet.nextSteps.map((step) => `- ${step}`),
    "",
    "## Commands",
    "",
    ...packet.commands.map((command) => `- ${command}`),
    "",
    "## Proof targets",
    "",
    ...packet.proofTargets.map((target) => `- ${target}`),
    "",
    "## Review",
    "",
    `- lane: ${packet.reviewLane}`,
    `- summary: ${packet.reviewSummary}`,
  ];

  if (packet.kojimaSignals.length > 0) {
    lines.push("");
    lines.push("## Kojima signals");
    lines.push("");
    for (const signal of packet.kojimaSignals) {
      lines.push(`- ${signal}`);
    }
  }

  lines.push("");
  lines.push("## Durable learning");
  lines.push("");
  lines.push(durableLearning);
  return lines.join("\n");
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const packet = buildPacket(options.slug);
  const durableLearning = buildLearning(packet);

  if (options.saveLearning) {
    saveLearning({ learningLine: durableLearning });
  }

  if (options.json) {
    console.log(JSON.stringify({ packet, durableLearning }, null, 2));
    return;
  }

  console.log(renderText(packet, durableLearning));
}

main();
