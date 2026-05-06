import { resolve } from "node:path";
import { buildQueueSnapshot, parseTodoRecords, probeSlugWorkspace, type SlugWorkspaceProbe } from "./catalog_candidates";
import { buildKojimaSignals } from "./kojima_signals";
import { saveLearning } from "./learning_capture";
import { buildRecommendation } from "./queue_reconcile";
import { buildReviewFreshnessEntries, type ReviewFreshnessEntry } from "./review_freshness_core";
import {
  buildClosureSnapshot,
  isBootIssueCode,
  isDocsIssueCode,
  isReconcileIssueCode,
  isSmokeIssueCode,
  type FocusMode,
} from "./throughput_lanes";
import {
  buildQueueOnlyReports,
  buildReports,
  type CatalogEntryReport,
  type EntryIssue,
  type QueueOnlyReport,
} from "./sweep_core";

type SupportedFocus = FocusMode;

type CliOptions = {
  focus: SupportedFocus;
  json: boolean;
  saveLearning: boolean;
  slug?: string;
};

type TaskMode =
  | "build-pending-folder"
  | "continue-pending-folder"
  | "reconcile-untracked-folder"
  | "resolve-queue-state"
  | "repair-direct-boot"
  | "rewrite-readme"
  | "refresh-smoke-proof"
  | "close-multi-front-entry"
  | "seed-next-pending";

type NextTask = {
  mode: TaskMode;
  slug?: string;
  why: string;
  evidence: string[];
  nextSteps: string[];
  reviewFreshness?: ReviewFreshnessEntry;
  sourceFiles: string[];
  issues: EntryIssue[];
};

const ROOT = process.cwd();
const TODO_PATH = resolve(ROOT, "todo.md");
const KOJIMA_SIGNAL_LIMIT = 4;

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { focus: "throughput", json: false, saveLearning: false };

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
    if (arg === "--focus") {
      const next = argv[index + 1];
      if (next !== "reconcile" && next !== "docs" && next !== "smoke" && next !== "boot" && next !== "verify" && next !== "throughput") {
        throw new Error(`Unsupported --focus value: ${next}`);
      }
      options.focus = next;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function pickFirst(slugs: string[]): string | undefined {
  return [...slugs].sort((left, right) => left.localeCompare(right))[0];
}

function findReport(reports: CatalogEntryReport[], slug?: string): CatalogEntryReport | undefined {
  if (!slug) {
    return undefined;
  }

  return reports.find((report) => report.slug === slug);
}

function findQueueOnlyReport(queueOnlyReports: QueueOnlyReport[], slug?: string): QueueOnlyReport | undefined {
  if (!slug) {
    return undefined;
  }

  return queueOnlyReports.find((report) => report.slug === slug);
}

function buildQueueTaskSourceFiles(
  slug: string | undefined,
  report: CatalogEntryReport | undefined,
  workspaceProbe: SlugWorkspaceProbe | undefined,
): string[] {
  if (!slug) {
    return ["./todo.md"];
  }

  if (report) {
    return ["./todo.md", `./${slug}/index.html`, `./${slug}/README.md`];
  }

  const files = ["./todo.md"];
  if (workspaceProbe?.folderExists) {
    if (workspaceProbe.hasReadme) {
      files.push(`./${slug}/README.md`);
    }
    if (workspaceProbe.hasIndexHtml) {
      files.push(`./${slug}/index.html`);
    }
    if (!workspaceProbe.hasReadme && !workspaceProbe.hasIndexHtml) {
      files.push(`./${slug}/`);
    }
  }
  return files;
}

function queueTaskFromRecommendation(
  recommendation: ReturnType<typeof buildRecommendation>,
  queueOnlyReports: QueueOnlyReport[],
  reports: CatalogEntryReport[],
): NextTask | null {
  const slug = recommendation.slug;
  const queueOnly = queueOnlyReports.find((report) => report.slug === slug);
  const report = findReport(reports, slug);
  const workspaceProbe = slug ? probeSlugWorkspace(ROOT, slug) : undefined;

  if (recommendation.kind === "seed-next-pending") {
    return {
      mode: "seed-next-pending",
      why: recommendation.why,
      evidence: [recommendation.summary],
      nextSteps: [
        "Use the fresh-seed helper to preview one pending line in ./todo.md with explicit slug, title, and note.",
        "Keep the new entry isolated in its own top-level folder with direct browser boot.",
        "Do not seed a second item before the new pending slug starts moving.",
      ],
      sourceFiles: ["./todo.md"],
      issues: [],
    };
  }

  if (!slug) {
    return null;
  }

  const evidence = [
    recommendation.summary,
    recommendation.why,
  ];
  if (queueOnly) {
    evidence.push(...queueOnly.issues.map((issue) => `${issue.code}: ${issue.detail}`));
    if (workspaceProbe?.folderExists && !workspaceProbe.hasIndexHtml) {
      evidence.push("folder-exists-no-index: top-level slug folder exists but direct browser boot file index.html is missing");
      if (workspaceProbe.topLevelEntries.length > 0) {
        evidence.push(`top-level-entries: ${workspaceProbe.topLevelEntries.join(", ")}`);
      }
    }
  }
  if (report) {
    evidence.push(...report.issues
      .filter((issue) => isReconcileIssueCode(issue.code) || isDocsIssueCode(issue.code) || isBootIssueCode(issue.code))
      .map((issue) => `${issue.code}: ${issue.detail}`));
  }

  const reportHasBoot = report?.issues.some((issue) => isBootIssueCode(issue.code)) ?? false;
  const reportHasDocs = report?.issues.some((issue) => isDocsIssueCode(issue.code)) ?? false;
  const nextSteps =
    recommendation.kind === "build-pending-folder"
      ? [
          `Create ./${slug}/ with index.html and a concise README.md.`,
          "Keep browser boot direct from the folder before adding polish work.",
          "After the folder exists, rerun the sweep and continue only that same slug until it closes.",
        ]
      : recommendation.kind === "continue-pending-folder"
        ? [
            `Inspect ./${slug}/index.html and ./${slug}/README.md first.`,
            reportHasBoot
              ? "Clear direct-boot blockers before any new catalog entry."
              : reportHasDocs
                ? "Normalize the README launch line or doc drift before any new catalog entry."
                : "Clear the local closure blocker before any new catalog entry.",
            "Keep the queue on this same pending slug until it reaches completed state.",
          ]
        : recommendation.kind === "reconcile-untracked-folder"
          ? [
              `Inspect ./${slug}/ for direct boot, concise docs, and whether it should be completed or pending in ./todo.md.`,
              "Update queue state so future sweeps stop rediscovering the same untracked playable folder.",
              "Keep the change local to this one game folder plus ./todo.md.",
            ]
          : recommendation.kind === "clear-completed-drift"
            ? workspaceProbe?.folderExists && !workspaceProbe.hasIndexHtml
              ? [
                  `Inspect the existing ./${slug}/ folder and restore direct browser boot with index.html.`,
                  "Keep the completed record only if the surviving folder can still ship as the same slug; otherwise repair queue history.",
                  "Do not move to another slug until this completed-history drift closes.",
                ]
              : [
                  `Confirm whether ./${slug}/ was renamed, removed, or never landed.`,
                  "Repair queue history or restore the matching playable folder before cataloging anything else.",
                  "Do not mark new work complete while shipped-history drift remains ambiguous.",
                ]
            : [
                `Open ./todo.md and normalize the records for ${slug}.`,
                "Make queue truth unambiguous before touching any other catalog slug.",
                "Rerun the reconcile helper after the todo edit to confirm the next action moved forward.",
              ];

  return {
    mode:
      recommendation.kind === "build-pending-folder"
        ? "build-pending-folder"
        : recommendation.kind === "continue-pending-folder"
          ? "continue-pending-folder"
          : recommendation.kind === "reconcile-untracked-folder"
            ? "reconcile-untracked-folder"
            : recommendation.kind === "clear-completed-drift"
              ? "resolve-queue-state"
              : "resolve-queue-state",
    slug,
    why: recommendation.why,
    evidence,
    nextSteps,
    sourceFiles: buildQueueTaskSourceFiles(slug, report, workspaceProbe),
    issues: report?.issues.filter((issue) => isReconcileIssueCode(issue.code) || isDocsIssueCode(issue.code) || isBootIssueCode(issue.code)) ?? [],
  };
}

function buildEntryTask(mode: TaskMode, report: CatalogEntryReport, why: string, issueFilter: (issue: EntryIssue) => boolean): NextTask {
  const issues = report.issues.filter(issueFilter);
  const nextSteps =
    mode === "repair-direct-boot"
      ? [
          `Inspect ./${report.slug}/index.html and locally referenced scripts first.`,
          "Fix missing references, import casing drift, or syntax breaks before browser re-check.",
          "Keep the repair inside this one folder, then rerun verify focus.",
        ]
      : mode === "rewrite-readme"
        ? [
            `Rewrite ./${report.slug}/README.md to stay high level and say how to launch ./index.html.`,
            "Cut file inventories and patrol-log drift; keep premise, controls, play path, and one concise note.",
            "Rerun docs focus after the edit to confirm the slug leaves the docs lane.",
          ]
        : mode === "refresh-smoke-proof"
          ? [
              `Run a fresh local browser smoke for ./${report.slug}/ and save evidence under ./.local.`,
              "Use the new capture only after confirming direct boot still works.",
              "Treat this as proof refresh, not a reason to broaden into unrelated polish.",
            ]
          : [
              `Inspect ./${report.slug}/index.html and ./${report.slug}/README.md together.`,
              "Clear the blocker that most directly prevents closure first, then rerun the focused helper.",
              "Keep all edits inside this one game folder unless queue truth itself is wrong.",
            ];

  return {
    mode,
    slug: report.slug,
    why,
    evidence: issues.map((issue) => `${issue.code}: ${issue.detail}`),
    nextSteps,
    sourceFiles: ["./todo.md", `./${report.slug}/index.html`, `./${report.slug}/README.md`],
    issues,
  };
}

function buildQueueOnlyTask(queueOnlyReport: QueueOnlyReport): NextTask {
  if (queueOnlyReport.queueState === "pending") {
    return {
      mode: "build-pending-folder",
      slug: queueOnlyReport.slug,
      why: "Queue truth already says this slug is pending, but repo state still has no playable top-level folder.",
      evidence: queueOnlyReport.issues.map((issue) => `${issue.code}: ${issue.detail}`),
      nextSteps: [
        `Create ./${queueOnlyReport.slug}/ with index.html and a concise README.md.`,
        "Keep browser boot direct from the folder before adding polish work.",
        "Rerun the helper on this same slug after the folder exists so closure stays one-game-at-a-time.",
      ],
      sourceFiles: ["./todo.md"],
      issues: [],
    };
  }

  return {
    mode: "resolve-queue-state",
    slug: queueOnlyReport.slug,
    why: "Queue history claims this slug is completed, but repo state has no matching playable top-level folder to verify.",
    evidence: queueOnlyReport.issues.map((issue) => `${issue.code}: ${issue.detail}`),
    nextSteps: [
      `Confirm whether ./${queueOnlyReport.slug}/ was renamed, removed, or never landed.`,
      "Repair queue history or restore the matching playable folder before touching another slug.",
      "Rerun the helper after the todo or folder fix to confirm queue truth matches repo state.",
    ],
    sourceFiles: ["./todo.md"],
    issues: [],
  };
}

function buildSlugTask(slug: string, focus: SupportedFocus, reports: CatalogEntryReport[], queueOnlyReports: QueueOnlyReport[]): NextTask {
  const queueOnlyReport = findQueueOnlyReport(queueOnlyReports, slug);
  if (queueOnlyReport) {
    return buildQueueOnlyTask(queueOnlyReport);
  }

  const report = findReport(reports, slug);
  if (!report) {
    return {
      mode: "resolve-queue-state",
      slug,
      why: "The requested slug is not visible in queue-only drift or current playable-folder coverage.",
      evidence: [`No top-level playable folder or queue-only drift record found for ${slug}.`],
      nextSteps: [
        "Confirm the slug spelling against ./todo.md or top-level folder names.",
        "Run the broad catalog sweep if the slug may have been renamed or never seeded.",
        "Keep the next change local to one slug once queue truth is confirmed.",
      ],
      sourceFiles: ["./todo.md"],
      issues: [],
    };
  }

  const bootIssues = report.issues.filter((issue) => isBootIssueCode(issue.code));
  const docsIssues = report.issues.filter((issue) => isDocsIssueCode(issue.code));
  const smokeIssues = report.issues.filter((issue) => isSmokeIssueCode(issue.code));
  const reconcileIssues = report.issues.filter((issue) => isReconcileIssueCode(issue.code));

  if (focus === "boot" && bootIssues.length > 0) {
    return buildEntryTask("repair-direct-boot", report, "Direct browser boot is the first playability gate for the requested slug.", (issue) => isBootIssueCode(issue.code));
  }
  if (focus === "docs" && docsIssues.length > 0) {
    return buildEntryTask("rewrite-readme", report, "README drift on the requested slug slows later queue closure because the launch path and concept have to be rediscovered.", (issue) => isDocsIssueCode(issue.code));
  }
  if (focus === "smoke" && smokeIssues.length > 0) {
    return buildEntryTask("refresh-smoke-proof", report, "Fresh local smoke proof keeps browser validation tied to the current state of the requested slug.", (issue) => isSmokeIssueCode(issue.code));
  }
  if (focus === "verify") {
    if (bootIssues.length > 0) {
      return buildEntryTask("repair-direct-boot", report, "Browser re-verification for the requested slug starts with direct-boot blockers.", (issue) => isBootIssueCode(issue.code));
    }
    if (smokeIssues.length > 0) {
      return buildEntryTask("refresh-smoke-proof", report, "Boot is cheap-clean for the requested slug, so fresh smoke proof is the next browser verification step.", (issue) => isSmokeIssueCode(issue.code));
    }
  }
  if (focus === "reconcile") {
    if (report.queueState === "untracked") {
      return {
        mode: "reconcile-untracked-folder",
        slug,
        why: "A playable folder exists for the requested slug, but queue truth still has no matching record.",
        evidence: report.issues
          .filter((issue) => isReconcileIssueCode(issue.code) || isBootIssueCode(issue.code) || isDocsIssueCode(issue.code))
          .map((issue) => `${issue.code}: ${issue.detail}`),
        nextSteps: [
          `Inspect ./${slug}/ for direct boot and concise docs, then decide whether it belongs in pending or completed state in ./todo.md.`,
          "Update queue state so future sweeps stop rediscovering the same untracked playable folder.",
          "Keep the change local to this one game folder plus ./todo.md.",
        ],
        sourceFiles: ["./todo.md", `./${slug}/index.html`, `./${slug}/README.md`],
        issues: reconcileIssues,
      };
    }
    if (reconcileIssues.length > 0) {
      return buildEntryTask("resolve-queue-state", report, "Queue truth for the requested slug is ambiguous and should be normalized before broader catalog work.", (issue) => isReconcileIssueCode(issue.code));
    }
  }

  if (report.queueState === "untracked") {
    return {
      mode: "reconcile-untracked-folder",
      slug,
      why: "A playable folder exists for the requested slug, but queue truth still has no matching record.",
      evidence: report.issues.map((issue) => `${issue.code}: ${issue.detail}`),
      nextSteps: [
        `Inspect ./${slug}/ for direct boot and concise docs, then decide whether it belongs in pending or completed state in ./todo.md.`,
        "Update queue state so future sweeps stop rediscovering the same untracked playable folder.",
        "Keep the change local to this one game folder plus ./todo.md.",
      ],
      sourceFiles: ["./todo.md", `./${slug}/index.html`, `./${slug}/README.md`],
      issues: reconcileIssues,
    };
  }
  if (reconcileIssues.length > 0) {
    return buildEntryTask("resolve-queue-state", report, "Queue truth for the requested slug is ambiguous and should be normalized before broader catalog work.", (issue) => isReconcileIssueCode(issue.code));
  }
  if (bootIssues.length > 0) {
    return buildEntryTask("repair-direct-boot", report, "Direct browser boot is the first closure gate for the requested slug.", (issue) => isBootIssueCode(issue.code));
  }
  if (docsIssues.length > 0) {
    return buildEntryTask("rewrite-readme", report, "README drift is the main remaining closure debt on the requested slug.", (issue) => isDocsIssueCode(issue.code));
  }
  if (smokeIssues.length > 0) {
    return buildEntryTask("refresh-smoke-proof", report, "Boot and docs are cheap-clean, so smoke-proof drift is the next closure step on the requested slug.", (issue) => isSmokeIssueCode(issue.code));
  }
  if (report.queueState === "pending") {
    return {
      mode: "continue-pending-folder",
      slug,
      why: "The requested slug is already the live pending folder and cheap local checks found no queue, boot, docs, or smoke blocker to resolve first.",
      evidence: [`${slug} already has a playable folder, queue coverage, concise docs, and current cheap local checks.`],
      nextSteps: [
        `Open ./${slug}/index.html and direct-play the current build before marking anything complete.`,
        "Keep the queue on this same slug until the active run closes.",
        "Only broaden beyond this slug if direct play reveals no remaining closure work.",
      ],
      sourceFiles: ["./todo.md", `./${slug}/index.html`, `./${slug}/README.md`],
      issues: [],
    };
  }

  return {
    mode: "close-multi-front-entry",
    slug,
    why: "The requested slug is tracked and playable, so the next step is direct play or deeper review rather than another broad sweep.",
    evidence: [`${slug} has no cheap queue, boot, docs, or smoke blocker in the current helper pass.`],
    nextSteps: [
      `Open ./${slug}/index.html and confirm the live play loop still matches the folder docs.`,
      "Keep any follow-up edits local to this one entry.",
      "Rerun the helper after any direct-play finding so the closure packet stays current.",
    ],
    sourceFiles: ["./todo.md", `./${slug}/index.html`, `./${slug}/README.md`],
    issues: [],
  };
}

function pickNextTask(
  slug: string | undefined,
  focus: SupportedFocus,
  reports: CatalogEntryReport[],
  queueOnlyReports: QueueOnlyReport[],
): NextTask {
  if (slug) {
    return buildSlugTask(slug, focus, reports, queueOnlyReports);
  }

  const todoRecords = parseTodoRecords(TODO_PATH);
  const queueSnapshot = buildQueueSnapshot(ROOT, todoRecords);
  const recommendation = buildRecommendation(queueSnapshot);

  if (focus === "reconcile") {
    return queueTaskFromRecommendation(recommendation, queueOnlyReports, reports) ?? {
      mode: "seed-next-pending",
      why: recommendation.why,
      evidence: [recommendation.summary],
      nextSteps: ["Add exactly one new pending slug in ./todo.md."],
      sourceFiles: ["./todo.md"],
      issues: [],
    };
  }

  if (focus === "boot") {
    const report = reports
      .filter((candidate) => candidate.issues.some((issue) => isBootIssueCode(issue.code)))
      .sort((left, right) => left.slug.localeCompare(right.slug))[0];
    if (report) {
      return buildEntryTask("repair-direct-boot", report, "Direct browser boot is the first playability gate.", (issue) => isBootIssueCode(issue.code));
    }
  }

  if (focus === "docs") {
    const report = reports
      .filter((candidate) => candidate.issues.some((issue) => isDocsIssueCode(issue.code)))
      .sort((left, right) => left.slug.localeCompare(right.slug))[0];
    if (report) {
      return buildEntryTask("rewrite-readme", report, "README drift slows later queue passes because the next operator has to rediscover launch and concept facts.", (issue) => isDocsIssueCode(issue.code));
    }
  }

  if (focus === "smoke") {
    const report = reports
      .filter((candidate) => candidate.issues.some((issue) => isSmokeIssueCode(issue.code)))
      .sort((left, right) => left.slug.localeCompare(right.slug))[0];
    if (report) {
      return buildEntryTask("refresh-smoke-proof", report, "Fresh local smoke proof keeps browser validation tied to current entry state.", (issue) => isSmokeIssueCode(issue.code));
    }
  }

  if (focus === "verify") {
    const bootReport = reports
      .filter((candidate) => candidate.issues.some((issue) => isBootIssueCode(issue.code)))
      .sort((left, right) => left.slug.localeCompare(right.slug))[0];
    if (bootReport) {
      return buildEntryTask("repair-direct-boot", bootReport, "Browser re-verification starts with entries that cannot boot cleanly.", (issue) => isBootIssueCode(issue.code));
    }

    const smokeReport = reports
      .filter((candidate) => candidate.issues.some((issue) => isSmokeIssueCode(issue.code)))
      .sort((left, right) => left.slug.localeCompare(right.slug))[0];
    if (smokeReport) {
      return buildEntryTask("refresh-smoke-proof", smokeReport, "When boot is clean, stale or missing smoke proof is the next verify blocker.", (issue) => isSmokeIssueCode(issue.code));
    }
  }

  const queueTask = queueTaskFromRecommendation(recommendation, queueOnlyReports, reports);
  if (queueTask && queueTask.mode !== "seed-next-pending") {
    return queueTask;
  }

  const closure = buildClosureSnapshot(reports);
  const queueOnlyCount = closure.queueOnlySlugs.length + queueOnlyReports.length;
  const rankedLanes = [
    { kind: "docs" as const, count: closure.docsOnlySlugs.length, slug: pickFirst(closure.docsOnlySlugs) },
    { kind: "boot" as const, count: closure.bootOnlySlugs.length, slug: pickFirst(closure.bootOnlySlugs) },
    { kind: "smoke" as const, count: closure.smokeOnlySlugs.length, slug: pickFirst(closure.smokeOnlySlugs) },
    { kind: "queue" as const, count: queueOnlyCount, slug: queueTask?.slug },
  ].sort((left, right) => {
    if (right.count !== left.count) {
      return right.count - left.count;
    }
    return left.kind.localeCompare(right.kind);
  });

  const topLane = rankedLanes[0];
  if (topLane.kind === "docs" && topLane.slug) {
    const report = findReport(reports, topLane.slug);
    if (report) {
      return buildEntryTask("rewrite-readme", report, `Docs-only closure is the biggest non-queue lane right now (${topLane.count} entries), so batching README cleanup yields the fastest repeatable throughput.`, (issue) => isDocsIssueCode(issue.code));
    }
  }
  if (topLane.kind === "boot" && topLane.slug) {
    const report = findReport(reports, topLane.slug);
    if (report) {
      return buildEntryTask("repair-direct-boot", report, `Boot-only repair is the biggest closure lane right now (${topLane.count} entries), so fixing one cleanly is the fastest reusable playability path.`, (issue) => isBootIssueCode(issue.code));
    }
  }
  if (topLane.kind === "smoke" && topLane.slug) {
    const report = findReport(reports, topLane.slug);
    if (report) {
      return buildEntryTask("refresh-smoke-proof", report, `Smoke-only refresh is the biggest closure lane right now (${topLane.count} entries), so refreshing one proof path is the fastest repeatable verification step.`, (issue) => isSmokeIssueCode(issue.code));
    }
  }
  if (queueTask) {
    return queueTask;
  }

  const multiFront = pickFirst(closure.multiFrontSlugs);
  const report = findReport(reports, multiFront);
  if (report) {
    return buildEntryTask("close-multi-front-entry", report, "No single-lane closure dominates, so the next step is one concrete multi-front entry.", () => true);
  }

  return {
    mode: "seed-next-pending",
    why: "Queue and local folder checks show no unresolved single-entry task.",
    evidence: ["No queue drift, docs drift, boot blockers, or smoke drift found."],
    nextSteps: ["Add exactly one new pending browser-playable slug in ./todo.md."],
    sourceFiles: ["./todo.md"],
    issues: [],
  };
}

function buildLearning(task: NextTask, focus: SupportedFocus, signalCount: number): string {
  if (task.reviewFreshness && task.slug) {
    return `- Catalog throughput improves when next-task packets carry the selected slug's review-freshness guard inline, because one-game-at-a-time closure stops losing the needsAdditionalFeedback rule between queue triage and the actual edit.`;
  }

  if (signalCount > 0) {
    return `- Catalog throughput improves when next-task packets pull a few recent Kojima durable signals inline with queue and folder facts, because one-game-at-a-time closure no longer requires reopening long memory logs before acting.`;
  }

  if (!task.slug) {
    return "- Catalog throughput improves when one helper collapses sweep facts into one exact next action, because one-game-at-a-time queue work should start from a single closure packet instead of another mixed summary.";
  }

  return `- Catalog throughput improves when ${focus} triage collapses into one exact slug plus closure steps; picking ${task.slug} as the next ${task.mode} target keeps one-game-at-a-time catalog maintenance from stalling in broad sweep output.`;
}

function buildTextOutput(task: NextTask, focus: SupportedFocus, kojimaSignals: ReturnType<typeof buildKojimaSignals>): string {
  const lines = [
    "# Next Catalog Task",
    "",
    `focus: ${focus}`,
    `mode: ${task.mode}`,
    `why: ${task.why}`,
  ];

  if (task.slug) {
    lines.push(`slug: ${task.slug}`);
  }

  lines.push("");
  lines.push("## Inputs");
  lines.push("");
  for (const file of task.sourceFiles) {
    lines.push(`- ${file}`);
  }

  lines.push("");
  lines.push("## Evidence");
  lines.push("");
  for (const line of task.evidence) {
    lines.push(`- ${line}`);
  }

  lines.push("");
  lines.push("## Next steps");
  lines.push("");
  for (const step of task.nextSteps) {
    lines.push(`- ${step}`);
  }

  if (task.reviewFreshness) {
    lines.push("");
    lines.push("## Review guard");
    lines.push("");
    lines.push(`- lane: ${task.reviewFreshness.lane}`);
    lines.push(`- queue: ${task.reviewFreshness.queueState}`);
    lines.push(`- folder: ${task.reviewFreshness.folderPresent ? "present" : "missing"}`);
    lines.push(`- review: ${task.reviewFreshness.reviewSummary}`);
    lines.push("- files:");
    for (const file of task.reviewFreshness.sourceFiles) {
      lines.push(`  - ${file}`);
    }
    lines.push("- next:");
    for (const step of task.reviewFreshness.nextSteps) {
      lines.push(`  - ${step}`);
    }
  }

  if (kojimaSignals.signalLines.length > 0) {
    lines.push("");
    lines.push("## Kojima signals");
    lines.push("");
    lines.push(`- source: ${kojimaSignals.sourcePath}`);
    for (const signal of kojimaSignals.signalLines) {
      lines.push(`- ${signal}`);
    }
  }

  return lines.join("\n");
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const todoRecords = parseTodoRecords(TODO_PATH);
  const queueSnapshot = buildQueueSnapshot(ROOT, todoRecords);
  const reports = buildReports(ROOT, todoRecords);
  const queueOnlyReports = buildQueueOnlyReports(todoRecords, new Set(queueSnapshot.playableFolders));
  const task = pickNextTask(options.slug, options.focus, reports, queueOnlyReports);
  if (task.slug) {
    task.reviewFreshness = buildReviewFreshnessEntries({ slug: task.slug })[0];
  }
  const kojimaSignals = buildKojimaSignals(undefined, undefined, KOJIMA_SIGNAL_LIMIT);
  const durableLearning = buildLearning(task, options.focus, kojimaSignals.signalLines.length);

  if (options.saveLearning) {
    saveLearning({ learningLine: durableLearning });
  }

  const output = options.json
    ? JSON.stringify({ focus: options.focus, slug: options.slug, task, kojimaSignals, durableLearning }, null, 2)
    : `${buildTextOutput(task, options.focus, kojimaSignals)}\n\n## Durable learning\n\n${durableLearning}`;

  console.log(output);
}

main();
