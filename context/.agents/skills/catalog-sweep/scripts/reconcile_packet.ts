import { resolve } from "node:path";
import { buildQueueSnapshot, parseTodoRecords, probeSlugWorkspace, type SlugWorkspaceProbe } from "./catalog_candidates";
import { buildKojimaSignals } from "./kojima_signals";
import { saveLearning } from "./learning_capture";
import { buildRecommendation, type Recommendation } from "./queue_reconcile";
import { buildReviewFreshnessEntries } from "./review_freshness_core";
import { buildQueueOnlyReports, buildReports, type CatalogEntryReport, type QueueOnlyReport } from "./sweep_core";

type CliOptions = {
  json: boolean;
  saveLearning: boolean;
  slug?: string;
};

type Packet = {
  files: string[];
  kind: Recommendation["kind"];
  nextSteps: string[];
  notes: string[];
  queueSummary: string;
  recommendation: string;
  reviewGuard?: {
    lane: string;
    nextSteps: string[];
    reviewSummary: string;
  };
  signals: string[];
  slug?: string;
};

const ROOT = process.cwd();
const TODO_PATH = resolve(ROOT, "todo.md");
const KOJIMA_SIGNAL_LIMIT = 3;
const NOTE_LIMIT = 4;

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

  return options;
}

function findQueueOnlyReport(queueOnlyReports: QueueOnlyReport[], slug?: string): QueueOnlyReport | undefined {
  if (!slug) {
    return undefined;
  }
  return queueOnlyReports.find((report) => report.slug === slug);
}

function findReport(reports: CatalogEntryReport[], slug?: string): CatalogEntryReport | undefined {
  if (!slug) {
    return undefined;
  }
  return reports.find((report) => report.slug === slug);
}

function chooseSlug(optionsSlug: string | undefined, recommendation: Recommendation): string | undefined {
  return optionsSlug ?? recommendation.slug;
}

function buildQueueSummary(snapshot: ReturnType<typeof buildQueueSnapshot>): string {
  return [
    `${snapshot.pendingWithoutFolder.length} pending-without-folder`,
    `${snapshot.pendingPlayableFolders.length} pending-playable`,
    `${snapshot.untrackedFolders.length} untracked-playable`,
    `${snapshot.completedWithoutFolder.length} completed-without-folder`,
    `${snapshot.mixedStateSlugs.length} mixed-state`,
    `${snapshot.duplicateRecordSlugs.length} duplicate-record`,
  ].join(" | ");
}

function buildNotes(
  report: CatalogEntryReport | undefined,
  queueOnlyReport: QueueOnlyReport | undefined,
  workspaceProbe: SlugWorkspaceProbe | undefined,
): string[] {
  if (queueOnlyReport) {
    const notes = queueOnlyReport.issues.map((issue) => `${issue.code}: ${issue.detail}`).slice(0, NOTE_LIMIT);
    if (workspaceProbe?.folderExists && !workspaceProbe.hasIndexHtml) {
      notes.push("folder-exists-no-index: top-level slug folder exists but direct browser boot file index.html is missing");
      if (workspaceProbe.topLevelEntries.length > 0) {
        notes.push(`top-level-entries: ${workspaceProbe.topLevelEntries.join(", ")}`);
      }
    }
    return notes;
  }
  if (!report) {
    return ["No playable-folder report found for the selected slug."];
  }

  const notes = report.issues.map((issue) => `${issue.code}: ${issue.detail}`).slice(0, NOTE_LIMIT);
  if (notes.length === 0) {
    notes.push("Cheap local checks found no queue, boot, docs, or smoke blocker.");
  }
  return notes;
}

function buildFiles(
  slug: string | undefined,
  report: CatalogEntryReport | undefined,
  queueOnlyReport: QueueOnlyReport | undefined,
  workspaceProbe: SlugWorkspaceProbe | undefined,
): string[] {
  const files = ["./todo.md"];
  if (!slug) {
    return files;
  }
  if (queueOnlyReport) {
    if (workspaceProbe?.folderExists) {
      if (workspaceProbe.hasReadme) {
        files.push(`./games/${slug}/README.md`);
      }
      if (workspaceProbe.hasIndexHtml) {
        files.push(`./games/${slug}/index.html`);
      }
      if (!workspaceProbe.hasReadme && !workspaceProbe.hasIndexHtml) {
        files.push(`./games/${slug}/`);
      }
    }
    return files;
  }

  files.push(`./games/${slug}/index.html`);
  if (report?.hasReadme) {
    files.push(`./games/${slug}/README.md`);
  }
  return files;
}

function buildNextSteps(
  recommendation: Recommendation,
  slug: string | undefined,
  report: CatalogEntryReport | undefined,
  workspaceProbe: SlugWorkspaceProbe | undefined,
): string[] {
  if (recommendation.kind === "seed-next-pending") {
    return [
      "Use the fresh-seed helper to preview or append exactly one pending line in ./todo.md.",
      "Keep the new game isolated in its own top-level folder with direct browser boot.",
      "Do not seed a second item before the new pending slug starts moving.",
    ];
  }

  if (!slug) {
    return [
      "Confirm queue truth in ./todo.md.",
      "Rerun the helper with --slug <slug> if one entry is already known.",
    ];
  }

  if (recommendation.kind === "build-pending-folder") {
    return [
      `Create ./games/${slug}/ with index.html and a concise README.md.`,
      "Keep the first pass focused on direct browser boot.",
      "Rerun the packet for the same slug after the folder exists.",
    ];
  }

  if (recommendation.kind === "continue-pending-folder") {
    return [
      `Inspect ./games/${slug}/index.html first, then ./games/${slug}/README.md.`,
      report?.issues.length ? "Clear the listed blocker before any new slug work." : "Direct-play the current build before changing queue state.",
      "Keep queue focus on this same slug until it closes.",
    ];
  }

  if (recommendation.kind === "reconcile-untracked-folder") {
    return [
      `Inspect ./games/${slug}/ for direct boot and concise docs.`,
      "Decide whether ./todo.md should track the slug as pending or completed.",
      "Keep the change local to this folder plus ./todo.md.",
    ];
  }

  if (recommendation.kind === "clear-completed-drift") {
    if (workspaceProbe?.folderExists && !workspaceProbe.hasIndexHtml) {
      return [
        `Inspect the existing ./games/${slug}/ folder and restore direct browser boot with index.html.`,
        "Keep the queue record only if the folder can still ship as the same slug; otherwise repair the completed history.",
        "Rerun the packet after index.html or queue history is restored.",
      ];
    }

    return [
      `Confirm whether ./games/${slug}/ was renamed, removed, or never landed.`,
      "Repair queue history or restore the playable folder before touching another slug.",
      "Rerun the packet after the queue or folder fix.",
    ];
  }

  return [
    `Normalize the queue records for ${slug} in ./todo.md.`,
    "Make queue truth unambiguous before other catalog work.",
    "Rerun the packet after the todo edit to confirm the next action changed.",
  ];
}

function buildPacket(options: CliOptions): Packet {
  const todoRecords = parseTodoRecords(TODO_PATH);
  const snapshot = buildQueueSnapshot(ROOT, todoRecords);
  const recommendation = buildRecommendation(snapshot);
  const reports = buildReports(ROOT, todoRecords);
  const queueOnlyReports = buildQueueOnlyReports(todoRecords, new Set(snapshot.playableFolders));
  const slug = chooseSlug(options.slug, recommendation);
  const report = findReport(reports, slug);
  const queueOnlyReport = findQueueOnlyReport(queueOnlyReports, slug);
  const workspaceProbe = slug ? probeSlugWorkspace(ROOT, slug) : undefined;
  const reviewGuard = slug ? buildReviewFreshnessEntries({ slug })[0] : undefined;
  const signals = buildKojimaSignals(undefined, undefined, KOJIMA_SIGNAL_LIMIT).signalLines;

  return {
    kind: recommendation.kind,
    slug,
    recommendation: recommendation.summary,
    queueSummary: buildQueueSummary(snapshot),
    files: buildFiles(slug, report, queueOnlyReport, workspaceProbe),
    notes: buildNotes(report, queueOnlyReport, workspaceProbe),
    nextSteps: buildNextSteps(recommendation, slug, report, workspaceProbe),
    reviewGuard: reviewGuard
      ? {
          lane: reviewGuard.lane,
          reviewSummary: reviewGuard.reviewSummary,
          nextSteps: reviewGuard.nextSteps,
        }
      : undefined,
    signals,
  };
}

function buildLearning(packet: Packet): string {
  if (packet.kind === "clear-completed-drift" && packet.notes.some((note) => note.startsWith("folder-exists-no-index:"))) {
    return "- Catalog throughput improves when reconcile packets surface partial slug folders without index.html, because completed-without-folder drift can move straight into boot restoration instead of spending another pass rediscovering surviving README or source files.";
  }

  if (!packet.slug) {
    return "- Catalog throughput improves when one reconcile packet merges queue drift counts with one next action, because operators can move from broad sweep to one concrete catalog step without reopening multiple helpers.";
  }

  return `- Catalog throughput improves when one reconcile packet merges queue action, top issue notes, and review-freshness guard for ${packet.slug}, because the next operator can move one catalog item without bouncing between sweep, queue, and review tools.`;
}

function buildTextOutput(packet: Packet): string {
  const lines = [
    "# Reconcile Packet",
    "",
    `kind: ${packet.kind}`,
    `queue: ${packet.queueSummary}`,
    `recommendation: ${packet.recommendation}`,
  ];

  if (packet.slug) {
    lines.push(`slug: ${packet.slug}`);
  }

  lines.push("");
  lines.push("## Files");
  lines.push("");
  for (const file of packet.files) {
    lines.push(`- ${file}`);
  }

  lines.push("");
  lines.push("## Notes");
  lines.push("");
  for (const note of packet.notes) {
    lines.push(`- ${note}`);
  }

  lines.push("");
  lines.push("## Next");
  lines.push("");
  for (const step of packet.nextSteps) {
    lines.push(`- ${step}`);
  }

  if (packet.reviewGuard) {
    lines.push("");
    lines.push("## Review guard");
    lines.push("");
    lines.push(`- lane: ${packet.reviewGuard.lane}`);
    lines.push(`- review: ${packet.reviewGuard.reviewSummary}`);
    for (const step of packet.reviewGuard.nextSteps) {
      lines.push(`- ${step}`);
    }
  }

  if (packet.signals.length > 0) {
    lines.push("");
    lines.push("## Kojima signals");
    lines.push("");
    for (const signal of packet.signals) {
      lines.push(`- ${signal}`);
    }
  }

  return lines.join("\n");
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const packet = buildPacket(options);
  const durableLearning = buildLearning(packet);

  if (options.saveLearning) {
    saveLearning({ learningLine: durableLearning });
  }

  const output = options.json
    ? JSON.stringify({ packet, durableLearning }, null, 2)
    : `${buildTextOutput(packet)}\n\n## Durable learning\n\n${durableLearning}`;

  console.log(output);
}

main();
