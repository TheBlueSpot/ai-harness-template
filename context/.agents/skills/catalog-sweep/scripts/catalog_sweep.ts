import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  buildQueueSnapshot,
  parseTodoRecords,
  type QueueSnapshot,
} from "./catalog_candidates";
import { buildKojimaSignals } from "./kojima_signals";
import {
  buildClosureSnapshot,
  buildDocsSnapshot,
  buildVerifySnapshot,
  buildThroughputSnapshot,
  filterIssuesForFocus,
  isDocsIssueCode,
  type FocusMode,
} from "./throughput_lanes";
import { buildRecommendation } from "./queue_reconcile";
import { saveLearning } from "./learning_capture";
import {
  buildQueueOnlyReports,
  buildReports,
  type CatalogEntryReport,
  type EntryIssue,
  type QueueOnlyReport,
} from "./sweep_core";

type CliOptions = {
  folder?: string;
  focus?: FocusMode;
  issuesOnly: boolean;
  json: boolean;
  limit?: number;
  out?: string;
  saveLearning: boolean;
};

const ROOT = process.cwd();
const TODO_PATH = resolve(ROOT, "todo.md");
const KOJIMA_SIGNAL_LIMIT = 4;

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { issuesOnly: false, json: false, saveLearning: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--issues-only") {
      options.issuesOnly = true;
      continue;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--save-learning") {
      options.saveLearning = true;
      continue;
    }

    const next = argv[index + 1];
    if ((arg === "--folder" || arg === "--focus" || arg === "--limit" || arg === "--out") && !next) {
      throw new Error(`Missing value for ${arg}`);
    }

    if (arg === "--folder") {
      options.folder = next;
      index += 1;
      continue;
    }

    if (arg === "--focus") {
      if (next !== "reconcile" && next !== "docs" && next !== "smoke" && next !== "boot" && next !== "verify" && next !== "throughput") {
        throw new Error(`Unsupported --focus value: ${next}`);
      }
      options.focus = next;
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

    if (arg === "--out") {
      options.out = next;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function buildSummary(
  reports: CatalogEntryReport[],
  queueOnlyReports: QueueOnlyReport[],
  queueSnapshot: QueueSnapshot,
): string {
  const total = reports.length;
  const withIssues = reports.filter((report) => report.issues.length > 0).length;
  const untracked = reports.filter((report) => report.queueState === "untracked").length;
  const missingReadmes = reports.filter((report) => !report.hasReadme).length;
  const readmeHygiene = reports.filter((report) =>
    report.issues.some((issue) =>
      issue.code === "missing-play-instructions" ||
      issue.code === "implementation-heavy-readme" ||
      issue.code === "log-heavy-readme",
    ),
  ).length;
  const brokenRefs = reports.filter((report) =>
    report.issues.some((issue) =>
      issue.code === "missing-boot-script" ||
      issue.code === "inline-script-syntax" ||
      issue.code === "script-syntax" ||
      issue.code === "missing-local-reference" ||
      issue.code === "missing-local-import" ||
      issue.code === "casing-drift",
    ),
  ).length;
  const missingSmoke = reports.filter((report) =>
    report.issues.some((issue) => issue.code === "missing-smoke-proof"),
  ).length;
  const staleSmoke = reports.filter((report) =>
    report.issues.some((issue) => issue.code === "stale-smoke-proof"),
  ).length;
  const queueOnly = queueOnlyReports.length;
  const throughput = buildThroughputSnapshot(reports, queueOnlyReports);
  const throughputCount = new Set([
    ...throughput.queueSlugs,
    ...throughput.docsSlugs,
    ...throughput.bootSlugs,
  ]).size;

  return [
    `entries: ${total}`,
    `with issues: ${withIssues + queueOnly}`,
    `throughput blockers: ${throughputCount}`,
    `untracked: ${untracked}`,
    `reconcile candidates: ${queueSnapshot.untrackedFolders.length + queueSnapshot.pendingWithoutFolder.length + queueSnapshot.completedWithoutFolder.length}`,
    `queue-only drift: ${queueOnly}`,
    `pending without folder: ${queueSnapshot.pendingWithoutFolder.length}`,
    `completed without folder: ${queueSnapshot.completedWithoutFolder.length}`,
    `mixed queue states: ${queueSnapshot.mixedStateSlugs.length}`,
    `duplicate queue slugs: ${queueSnapshot.duplicateRecordSlugs.length}`,
    `missing readmes: ${missingReadmes}`,
    `readme hygiene: ${readmeHygiene}`,
    `direct-boot breaks: ${brokenRefs}`,
    `missing smoke: ${missingSmoke}`,
    `stale smoke: ${staleSmoke}`,
  ].join(" | ");
}

function reportMatchesFocus(report: CatalogEntryReport, focus?: CliOptions["focus"]): boolean {
  return filterIssuesForFocus(report.issues, focus).length > 0;
}

function queueOnlyMatchesFocus(focus?: CliOptions["focus"]): boolean {
  return !focus || focus === "reconcile" || focus === "throughput";
}

function describeFocus(focus?: CliOptions["focus"]): string | null {
  if (!focus) {
    return null;
  }

  const label =
    focus === "reconcile"
      ? "queue reconciliation"
      : focus === "docs"
        ? "README hygiene"
        : focus === "smoke"
          ? "smoke refresh"
          : focus === "boot"
            ? "direct-boot repair"
            : focus === "verify"
              ? "browser re-verification"
              : "catalog throughput blockers";

  return `focus: ${label}`;
}

function buildTextReport(
  reports: CatalogEntryReport[],
  queueOnlyReports: QueueOnlyReport[],
  queueSnapshot: QueueSnapshot,
  options: CliOptions,
  kojimaSignals: ReturnType<typeof buildKojimaSignals>,
): string {
  const lines: string[] = ["# Catalog Sweep", "", buildSummary(reports, queueOnlyReports, queueSnapshot)];
  const closure = buildClosureSnapshot(reports);
  const queueRecommendation = buildRecommendation(queueSnapshot);
  const queueOnlyClosureCount = closure.queueOnlySlugs.length + queueOnlyReports.length;
  const focusLine = describeFocus(options.focus);
  if (focusLine) {
    lines.push(focusLine);
  }
  if (typeof options.limit === "number") {
    lines.push(`limit: ${options.limit}`);
  }
  lines.push("");

  if (kojimaSignals.signalLines.length > 0) {
    lines.push("## Kojima signals");
    lines.push("");
    lines.push(`- source: ${kojimaSignals.sourcePath}`);
    for (const signal of kojimaSignals.signalLines) {
      lines.push(`- ${signal}`);
    }
    lines.push("");
  }

  let visibleReports = options.issuesOnly ? reports.filter((report) => report.issues.length > 0) : reports;
  visibleReports = visibleReports.filter((report) => reportMatchesFocus(report, options.focus));
  if (typeof options.limit === "number") {
    visibleReports = visibleReports.slice(0, options.limit);
  }

  let visibleQueueOnly = options.issuesOnly ? queueOnlyReports.filter((report) => report.issues.length > 0) : queueOnlyReports;
  visibleQueueOnly = queueOnlyMatchesFocus(options.focus) ? visibleQueueOnly : [];
  if (typeof options.limit === "number") {
    visibleQueueOnly = visibleQueueOnly.slice(0, options.limit);
  }

  if (visibleQueueOnly.length === 0 && visibleReports.length === 0) {
    lines.push("No matching entries for requested filter.");
    return lines.join("\n");
  }

  if (!options.focus || options.focus === "throughput") {
    const closureBatches = [
      { label: "docs-only closures", slugs: closure.docsOnlySlugs },
      { label: "smoke-only refresh", slugs: closure.smokeOnlySlugs },
      { label: "queue-only reconcile", slugs: closure.queueOnlySlugs },
      { label: "boot-only repair", slugs: closure.bootOnlySlugs },
    ].sort((left, right) => {
      if (right.slugs.length !== left.slugs.length) {
        return right.slugs.length - left.slugs.length;
      }
      return left.label.localeCompare(right.label);
    });

    lines.push("## Closure next");
    lines.push("");
    for (const batch of closureBatches) {
      const count = batch.label === "queue-only reconcile" ? queueOnlyClosureCount : batch.slugs.length;
      const previewSlugs =
        batch.label === "queue-only reconcile"
          ? [...queueOnlyReports.map((report) => report.slug), ...batch.slugs]
          : batch.slugs;
      lines.push(`- ${batch.label}: ${count}${count > 0 ? ` (${previewSlugs.slice(0, 5).join(", ")})` : ""}`);
    }
    lines.push(`- multi-front blockers: ${closure.multiFrontSlugs.length}${closure.multiFrontSlugs.length > 0 ? ` (${closure.multiFrontSlugs.slice(0, 5).join(", ")})` : ""}`);
    lines.push("");

    const throughput = buildThroughputSnapshot(reports, queueOnlyReports);
    lines.push("## Throughput next");
    lines.push("");
    lines.push(`- queue drift: ${throughput.queueSlugs.length}${throughput.queueSlugs.length > 0 ? ` (${throughput.queueSlugs.slice(0, 5).join(", ")})` : ""}`);
    lines.push(`- docs cleanup: ${throughput.docsSlugs.length}${throughput.docsSlugs.length > 0 ? ` (${throughput.docsSlugs.slice(0, 5).join(", ")})` : ""}`);
    lines.push(`- direct-boot repair: ${throughput.bootSlugs.length}${throughput.bootSlugs.length > 0 ? ` (${throughput.bootSlugs.slice(0, 5).join(", ")})` : ""}`);
    lines.push("");
  }

  if (!options.focus || options.focus === "verify") {
    const verify = buildVerifySnapshot(reports);
    lines.push("## Verify next");
    lines.push("");
    lines.push(`- boot-first: ${verify.bootSlugs.length}${verify.bootSlugs.length > 0 ? ` (${verify.bootSlugs.slice(0, 5).join(", ")})` : ""}`);
    lines.push(`- smoke refresh: ${verify.smokeSlugs.length}${verify.smokeSlugs.length > 0 ? ` (${verify.smokeSlugs.slice(0, 5).join(", ")})` : ""}`);
    lines.push("");
  }

  if (!options.focus || options.focus === "docs") {
    const docs = buildDocsSnapshot(reports);
    lines.push("## Docs next");
    lines.push("");
    lines.push(`- add launch line: ${docs.missingLaunchSlugs.length}${docs.missingLaunchSlugs.length > 0 ? ` (${docs.missingLaunchSlugs.slice(0, 5).join(", ")})` : ""}`);
    lines.push(`- trim implementation detail: ${docs.implementationHeavySlugs.length}${docs.implementationHeavySlugs.length > 0 ? ` (${docs.implementationHeavySlugs.slice(0, 5).join(", ")})` : ""}`);
    lines.push(`- trim fix-log drift: ${docs.logHeavySlugs.length}${docs.logHeavySlugs.length > 0 ? ` (${docs.logHeavySlugs.slice(0, 5).join(", ")})` : ""}`);
    lines.push(`- multi-fix rewrites: ${docs.mixedDocsSlugs.length}${docs.mixedDocsSlugs.length > 0 ? ` (${docs.mixedDocsSlugs.slice(0, 5).join(", ")})` : ""}`);
    lines.push("");
  }

  if (
    (!options.focus || options.focus === "reconcile") &&
    queueSnapshot.untrackedFolders.length > 0 ||
    (!options.focus || options.focus === "reconcile") &&
    queueSnapshot.pendingWithoutFolder.length > 0 ||
    (!options.focus || options.focus === "reconcile") &&
    queueSnapshot.completedWithoutFolder.length > 0 ||
    (!options.focus || options.focus === "reconcile") &&
    queueSnapshot.mixedStateSlugs.length > 0 ||
    (!options.focus || options.focus === "reconcile") &&
    queueSnapshot.duplicateRecordSlugs.length > 0
  ) {
    lines.push("## Reconcile next");
    lines.push("");
    lines.push(`- next action: ${queueRecommendation.summary}`);
    lines.push(`- why: ${queueRecommendation.why}`);
    if (queueRecommendation.slug) {
      lines.push(`- slug: ${queueRecommendation.slug}`);
    }
    lines.push(`- tracked playable folders: ${queueSnapshot.trackedPlayableFolders.length}/${queueSnapshot.playableFolders.length}`);
    if (queueSnapshot.untrackedFolders.length > 0) {
      lines.push(`- untracked playable folders: ${queueSnapshot.untrackedFolders.join(", ")}`);
    }
    if (queueSnapshot.pendingWithoutFolder.length > 0) {
      lines.push(`- pending records without folder: ${queueSnapshot.pendingWithoutFolder.join(", ")}`);
    }
    if (queueSnapshot.completedWithoutFolder.length > 0) {
      lines.push(`- completed records without folder: ${queueSnapshot.completedWithoutFolder.join(", ")}`);
    }
    if (queueSnapshot.mixedStateSlugs.length > 0) {
      lines.push(`- mixed queue states: ${queueSnapshot.mixedStateSlugs.join(", ")}`);
    }
    if (queueSnapshot.duplicateRecordSlugs.length > 0) {
      lines.push(`- duplicate queue record slugs: ${queueSnapshot.duplicateRecordSlugs.join(", ")}`);
    }
    lines.push("");
  }

  if (visibleQueueOnly.length > 0) {
    lines.push("## Queue-only drift");
    lines.push("");
    for (const report of visibleQueueOnly) {
      lines.push(`### ${report.slug}`);
      lines.push("");
      lines.push(`- queue: ${report.queueState}`);
      lines.push(`- title: ${report.title}`);
      lines.push(`- todo records: ${report.queueRecords}`);
      lines.push("- issues:");
      for (const issue of report.issues) {
        lines.push(`  - ${issue.code}: ${issue.detail}`);
      }
      lines.push("");
    }
  }

  for (const report of visibleReports) {
    const visibleIssues = filterIssuesForFocus(report.issues, options.focus);
    lines.push(`## ${report.slug}`);
    lines.push("");
    lines.push(`- queue: ${report.queueState}`);
    lines.push(`- readme: ${report.hasReadme ? "present" : "missing"}`);
    lines.push(`- todo records: ${report.queueRecords}`);
    if (report.readmeGuidance.length > 0 && visibleIssues.some((issue) => isDocsIssueCode(issue.code))) {
      lines.push(`- docs next: ${report.readmeGuidance.join("; ")}`);
    }

    if (visibleIssues.length === 0) {
      lines.push("- issues: none");
      lines.push("");
      continue;
    }

    lines.push("- issues:");
    for (const issue of visibleIssues) {
      lines.push(`  - ${issue.code}: ${issue.detail}`);
    }
      lines.push("");
  }

  return lines.join("\n");
}

function writeOutput(filePath: string, output: string): void {
  const outputPath = resolve(ROOT, filePath);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, output, "utf8");
}

function countReportsWithIssue(reports: CatalogEntryReport[], predicate: (issue: EntryIssue) => boolean): number {
  return reports.filter((report) => report.issues.some(predicate)).length;
}

function buildDurableLearning(
  reports: CatalogEntryReport[],
  queueOnlyReports: QueueOnlyReport[],
  queueSnapshot: QueueSnapshot,
  signalCount: number,
): string {
  if (signalCount > 0) {
    return "- Catalog throughput improves when the sweep surfaces a few recent Kojima durable signals next to queue, docs, and boot facts, because operators keep reusable quality heuristics in the same closure packet instead of reopening long memory logs.";
  }

  const closure = buildClosureSnapshot(reports);
  const queueDebtSlugs = new Set<string>([
    ...queueOnlyReports.map((report) => report.slug),
    ...queueSnapshot.untrackedFolders,
    ...queueSnapshot.pendingWithoutFolder,
    ...queueSnapshot.completedWithoutFolder,
    ...queueSnapshot.mixedStateSlugs,
    ...queueSnapshot.duplicateRecordSlugs,
  ]);
  const docDebtCount = countReportsWithIssue(
    reports,
    (issue) =>
      issue.code === "missing-readme"
      || issue.code === "missing-play-instructions"
      || issue.code === "implementation-heavy-readme"
      || issue.code === "log-heavy-readme",
  );
  const bootDebtCount = countReportsWithIssue(
    reports,
    (issue) =>
      issue.code === "missing-boot-script"
      || issue.code === "inline-script-syntax"
        || issue.code === "script-syntax"
        || issue.code === "missing-local-reference"
        || issue.code === "missing-local-import"
        || issue.code === "casing-drift",
  );
  const queueDebtCount = queueDebtSlugs.size;
  const smokeDebtCount = countReportsWithIssue(
    reports,
    (issue) => issue.code === "missing-smoke-proof" || issue.code === "stale-smoke-proof",
  );
  const queueOnlyClosureCount = closure.queueOnlySlugs.length + queueOnlyReports.length;
  const fastestBatchCount = Math.max(
    closure.docsOnlySlugs.length,
    closure.smokeOnlySlugs.length,
    queueOnlyClosureCount,
    closure.bootOnlySlugs.length,
  );
  const fastestBatchLabel =
    fastestBatchCount === closure.docsOnlySlugs.length
      ? "docs-only"
      : fastestBatchCount === closure.smokeOnlySlugs.length
        ? "smoke-only"
        : fastestBatchCount === queueOnlyClosureCount
          ? "queue-only"
          : "boot-only";

  if (queueDebtCount === 0 && bootDebtCount === 0 && docDebtCount === 0 && smokeDebtCount === 0) {
    return "- Catalog throughput still benefits from one cheap sweep even on a clean pass, because re-checking queue truth, direct boot, docs, and local smoke proof together prevents hidden drift from leaking into the next game run.";
  }

  if (fastestBatchCount > 0) {
    return `- Catalog throughput improves when the sweep ranks single-lane closure batches and shows the biggest one first; this pass found ${fastestBatchCount} ${fastestBatchLabel} entries, so the next operator can close similar catalog debt in one repeatable run instead of re-triaging every slug.`;
  }

  return `- Catalog throughput improves when one cheap sweep reads ./todo.md as queue truth and surfaces queue drift (${queueDebtCount}), direct-boot risk (${bootDebtCount}), README debt (${docDebtCount}), and smoke-proof drift (${smokeDebtCount}) in one pass, because the next operator can close one browser-playable entry without repeating discovery across four separate checks.`;
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const todoRecords = parseTodoRecords(TODO_PATH);
  const queueSnapshot = buildQueueSnapshot(ROOT, todoRecords);
  const reports = buildReports(ROOT, todoRecords, options.folder);
  const folderSlugs = new Set(queueSnapshot.playableFolders);
  const queueOnlyReports = buildQueueOnlyReports(todoRecords, folderSlugs, options.folder);
  const kojimaSignals = buildKojimaSignals(undefined, undefined, KOJIMA_SIGNAL_LIMIT);
  const durableLearning = buildDurableLearning(reports, queueOnlyReports, queueSnapshot, kojimaSignals.signalLines.length);
  const closureSnapshot = buildClosureSnapshot(reports);
  const output = options.json
    ? JSON.stringify(
        {
          summary: buildSummary(reports, queueOnlyReports, queueSnapshot),
          focus: options.focus ?? null,
          limit: options.limit ?? null,
          kojimaSignals,
          durableLearning,
          closureSnapshot,
          queueSnapshot,
          queueOnlyReports: (options.issuesOnly ? queueOnlyReports.filter((report) => report.issues.length > 0) : queueOnlyReports)
            .filter(() => queueOnlyMatchesFocus(options.focus))
            .slice(0, options.limit),
          reports: (options.issuesOnly ? reports.filter((report) => report.issues.length > 0) : reports)
            .filter((report) => reportMatchesFocus(report, options.focus))
            .map((report) => ({
              ...report,
              issues: filterIssuesForFocus(report.issues, options.focus),
            }))
            .slice(0, options.limit),
        },
        null,
        2,
      )
    : buildTextReport(reports, queueOnlyReports, queueSnapshot, options, kojimaSignals);

  if (options.saveLearning) {
    saveLearning({ learningLine: durableLearning });
  }

  if (options.out) {
    writeOutput(options.out, output);
    console.log(`Wrote ${resolve(ROOT, options.out)}`);
    return;
  }

  console.log(output);
}

main();
