import { resolve } from "node:path";
import { buildQueueSnapshot, parseTodoRecords, type QueueState } from "./catalog_candidates";
import {
  collectDocsPackEntries,
  chooseDefaultGroup as chooseDocsGroup,
  groupLabel as docsGroupLabel,
  matchesGroup as matchesDocsGroup,
} from "./docs_rewrite_pack";
import { buildKojimaSignals } from "./kojima_signals";
import { saveLearning } from "./learning_capture";
import { buildQualityEntry, rankQualityPackEntry } from "./quality_scan_core";
import {
  buildReviewFreshnessEntries,
  chooseDefaultGroup as chooseReviewGroup,
  groupLabel as reviewGroupLabel,
  matchesGroup as matchesReviewGroup,
  type GroupMode as ReviewGroupMode,
} from "./review_freshness_core";
import { buildRecommendation } from "./queue_reconcile";
import { buildQueueOnlyReports, buildReports } from "./sweep_core";
import { buildVerifySnapshot, isBootIssueCode, isSmokeIssueCode } from "./throughput_lanes";

type CliOptions = {
  json: boolean;
  saveLearning: boolean;
};

type LaneKind =
  | "queue-reconcile"
  | "verify-boot"
  | "verify-smoke"
  | "docs-rewrite"
  | "review-missing"
  | "review-blocked"
  | "review-flag"
  | "quality-capture"
  | "seed-next-pending";

type LanePacket = {
  kind: LaneKind;
  summary: string;
  why: string;
  selectedCount: number;
  selectedLabel: string;
  sampleSlug?: string;
  evidence: string[];
  commands: string[];
};

type LaneFacts = {
  queuePacket: LanePacket;
  docsPacket: LanePacket | null;
  reviewPacket: LanePacket | null;
  qualityPacket: LanePacket | null;
  verifyBootPacket: LanePacket | null;
  verifySmokePacket: LanePacket | null;
  seedPacket: LanePacket;
};

const ROOT = process.cwd();
const TODO_PATH = resolve(ROOT, "todo.md");
const KOJIMA_SIGNAL_LIMIT = 3;

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { json: false, saveLearning: false };

  for (const arg of argv) {
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--save-learning") {
      options.saveLearning = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function queueRank(state: QueueState): number {
  if (state === "pending") {
    return 0;
  }
  if (state === "untracked") {
    return 1;
  }
  return 2;
}

function buildLaneFacts(): LaneFacts {
  const todoRecords = parseTodoRecords(TODO_PATH);
  const queueSnapshot = buildQueueSnapshot(ROOT, todoRecords);
  const recommendation = buildRecommendation(queueSnapshot);
  const reports = buildReports(ROOT, todoRecords);
  const queueOnlyReports = buildQueueOnlyReports(todoRecords, new Set(queueSnapshot.playableFolders));
  const verifySnapshot = buildVerifySnapshot(reports);

  const queueDriftCount =
    queueSnapshot.pendingWithoutFolder.length +
    queueSnapshot.completedWithoutFolder.length +
    queueSnapshot.untrackedFolders.length +
    queueSnapshot.mixedStateSlugs.length +
    queueSnapshot.duplicateRecordSlugs.length;
  const queueSelectedCount =
    recommendation.kind === "build-pending-folder"
      ? Math.max(queueSnapshot.pendingWithoutFolder.length, 1)
      : recommendation.kind === "continue-pending-folder"
        ? Math.max(queueSnapshot.pendingPlayableFolders.length, 1)
        : queueDriftCount;
  const queueSummary = `${recommendation.kind}: ${recommendation.summary}`;
  const queueEvidence = [
    `${queueDriftCount} total queue drift signal${queueDriftCount === 1 ? "" : "s"}`,
    `${queueSnapshot.pendingWithoutFolder.length} pending without folder`,
    `${queueSnapshot.pendingPlayableFolders.length} pending playable`,
    `${queueSnapshot.untrackedFolders.length} untracked playable`,
    `${queueSnapshot.completedWithoutFolder.length} completed without folder`,
    `${queueSnapshot.mixedStateSlugs.length} mixed-state slugs`,
    `${queueSnapshot.duplicateRecordSlugs.length} duplicate-record slugs`,
  ];

  const queueSlugArg = recommendation.slug ? ` --slug ${recommendation.slug}` : "";
  const queuePacket: LanePacket = {
    kind: recommendation.kind === "seed-next-pending" ? "seed-next-pending" : "queue-reconcile",
    summary: queueSummary,
    why: recommendation.why,
    selectedCount: queueSelectedCount,
    selectedLabel:
      recommendation.kind === "build-pending-folder"
        ? "pending slug without folder"
        : recommendation.kind === "continue-pending-folder"
          ? "active pending playable"
          : recommendation.kind === "seed-next-pending"
            ? "seed exactly one new pending item"
            : "queue reconcile drift",
    sampleSlug: recommendation.slug,
    evidence: queueEvidence,
    commands:
      recommendation.kind === "seed-next-pending"
        ? [
            "bun.cmd .agents/skills/catalog-sweep/scripts/queue_reconcile.ts",
            "bun.cmd .agents/skills/catalog-sweep/scripts/seed_next_pending.ts --slug <slug> --title \"<title>\" --note \"<one-line note>\"",
            "bun.cmd .agents/skills/catalog-sweep/scripts/next_catalog_task.ts --focus reconcile",
          ]
        : [
            `bun.cmd .agents/skills/catalog-sweep/scripts/seed_entry_scaffold.ts${queueSlugArg}`,
            `bun.cmd .agents/skills/catalog-sweep/scripts/reconcile_packet.ts${queueSlugArg}`,
            `bun.cmd .agents/skills/catalog-sweep/scripts/next_catalog_task.ts --focus reconcile${queueSlugArg}`,
            "bun.cmd .agents/skills/catalog-sweep/scripts/queue_reconcile.ts",
          ],
  };

  const bootCandidates = reports
    .filter((report) => report.issues.some((issue) => isBootIssueCode(issue.code)))
    .sort((left, right) => {
      const queueDiff = queueRank(left.queueState) - queueRank(right.queueState);
      if (queueDiff !== 0) {
        return queueDiff;
      }
      return left.slug.localeCompare(right.slug);
    });
  const verifyBootPacket = verifySnapshot.bootSlugs.length > 0
    ? {
        kind: "verify-boot" as const,
        summary: "repair boot blockers first",
        why: "Direct browser boot has to be clean before any smoke refresh or playtest capture can close.",
        selectedCount: verifySnapshot.bootSlugs.length,
        selectedLabel: "boot blockers first",
        sampleSlug: bootCandidates[0]?.slug,
        evidence: [`${verifySnapshot.bootSlugs.length} slug${verifySnapshot.bootSlugs.length === 1 ? "" : "s"} with direct-boot debt`],
        commands: [
          "bun.cmd .agents/skills/catalog-sweep/scripts/verify_pack.ts --group boot --limit 5",
          bootCandidates[0]
            ? `bun.cmd .agents/skills/catalog-sweep/scripts/browser_playability_packet.ts --slug ${bootCandidates[0].slug}`
            : "bun.cmd .agents/skills/catalog-sweep/scripts/browser_playability_packet.ts --slug <slug>",
          bootCandidates[0]
            ? `bun.cmd .agents/skills/catalog-sweep/scripts/next_catalog_task.ts --focus verify --slug ${bootCandidates[0].slug}`
            : "bun.cmd .agents/skills/catalog-sweep/scripts/next_catalog_task.ts --focus verify",
        ],
      }
    : null;

  const smokeCandidates = reports
    .filter((report) => report.issues.some((issue) => isSmokeIssueCode(issue.code)))
    .sort((left, right) => {
      const queueDiff = queueRank(left.queueState) - queueRank(right.queueState);
      if (queueDiff !== 0) {
        return queueDiff;
      }
      return left.slug.localeCompare(right.slug);
    });
  const missingSmokeCount = reports.filter((report) => report.issues.some((issue) => issue.code === "missing-smoke-proof")).length;
  const staleSmokeCount = reports.filter((report) => report.issues.some((issue) => issue.code === "stale-smoke-proof")).length;
  const smokeGroup = missingSmokeCount > 0 ? "missing" : staleSmokeCount > 0 ? "stale" : "all";
  const verifySmokePacket = verifySnapshot.smokeSlugs.length > 0
    ? {
        kind: "verify-smoke" as const,
        summary: "refresh browser proof in one ranked batch",
        why: "Fresh smoke proof closes the largest reusable browser lane once boot blockers are already clear.",
        selectedCount: verifySnapshot.smokeSlugs.length,
        selectedLabel: smokeGroup === "missing" ? "missing proof first" : smokeGroup === "stale" ? "stale proof refresh" : "all smoke refresh debt",
        sampleSlug: smokeCandidates[0]?.slug,
        evidence: [
          `${verifySnapshot.smokeSlugs.length} slug${verifySnapshot.smokeSlugs.length === 1 ? "" : "s"} with smoke drift`,
          `${missingSmokeCount} missing-proof slug${missingSmokeCount === 1 ? "" : "s"}`,
          `${staleSmokeCount} stale-proof slug${staleSmokeCount === 1 ? "" : "s"}`,
        ],
        commands: [
          `bun.cmd .agents/skills/catalog-sweep/scripts/smoke_refresh_pack.ts --group ${smokeGroup} --limit 5`,
          smokeCandidates[0]
            ? `bun.cmd .agents/skills/catalog-sweep/scripts/smoke_refresh_kickoff.ts --slug ${smokeCandidates[0].slug}`
            : "bun.cmd .agents/skills/catalog-sweep/scripts/smoke_refresh_kickoff.ts --slug <slug>",
          "bun.cmd .agents/skills/catalog-sweep/scripts/verify_pack.ts --group smoke --limit 5",
          smokeCandidates[0]
            ? `bun.cmd .agents/skills/catalog-sweep/scripts/next_catalog_task.ts --focus verify --slug ${smokeCandidates[0].slug}`
            : "bun.cmd .agents/skills/catalog-sweep/scripts/next_catalog_task.ts --focus verify",
        ],
      }
    : null;

  const { entries: docsEntries, counts: docsCounts } = collectDocsPackEntries(ROOT);
  const docsGroup = chooseDocsGroup(docsCounts);
  const docsSelected = docsEntries
    .filter((entry) => matchesDocsGroup(docsGroup, entry))
    .sort((left, right) => {
      const queueDiff = queueRank(left.queueState) - queueRank(right.queueState);
      if (queueDiff !== 0) {
        return queueDiff;
      }
      return left.slug.localeCompare(right.slug);
    });
  const docsPacket = docsSelected.length > 0
    ? {
        kind: "docs-rewrite" as const,
        summary: `rewrite README lane: ${docsGroupLabel(docsGroup)}`,
        why: "Batching one README debt class is faster than reopening per-entry docs to rediscover the same cleanup shape.",
        selectedCount: docsSelected.length,
        selectedLabel: docsGroupLabel(docsGroup),
        sampleSlug: docsSelected[0]?.slug,
        evidence: [
          `${docsEntries.length} slug${docsEntries.length === 1 ? "" : "s"} with docs issues`,
          `${docsSelected.length} slug${docsSelected.length === 1 ? "" : "s"} in the selected docs lane`,
        ],
        commands: [
          `bun.cmd .agents/skills/catalog-sweep/scripts/docs_rewrite_pack.ts --group ${docsGroup} --limit 10`,
          `bun.cmd .agents/skills/catalog-sweep/scripts/readme_rewrite_batch.ts --group ${docsGroup} --limit 10`,
          docsSelected[0]
            ? `bun.cmd .agents/skills/catalog-sweep/scripts/readme_rewrite_starter.ts --slug ${docsSelected[0].slug}`
            : `bun.cmd .agents/skills/catalog-sweep/scripts/readme_rewrite_batch.ts --group ${docsGroup} --limit 10`,
        ],
      }
    : null;

  const reviewEntries = buildReviewFreshnessEntries();
  const reviewGroup = chooseReviewGroup(reviewEntries);
  const reviewSelected = reviewEntries.filter((entry) => matchesReviewGroup(reviewGroup, entry));
  const reviewPacket = reviewSelected.length > 0
    ? {
        kind:
          reviewGroup === "missing"
            ? ("review-missing" as const)
            : reviewGroup === "blocked"
              ? ("review-blocked" as const)
              : ("review-flag" as const),
        summary: `review freshness lane: ${reviewGroupLabel(reviewGroup)}`,
        why:
          reviewGroup === "missing"
            ? "Missing review rows mean feedback cannot safely guide catalog decisions."
            : reviewGroup === "blocked"
              ? "Blocked reviews should stay out of evidence and prioritization until fresh feedback replaces them."
              : "Pre-edit review reflag reminders should stay explicit so needsAdditionalFeedback does not depend on memory.",
        selectedCount: reviewSelected.length,
        selectedLabel: reviewGroupLabel(reviewGroup),
        sampleSlug: reviewSelected[0]?.slug,
        evidence: [
          `${reviewEntries.filter((entry) => entry.lane === "review-missing").length} missing review row slug${reviewEntries.filter((entry) => entry.lane === "review-missing").length === 1 ? "" : "s"}`,
          `${reviewEntries.filter((entry) => entry.lane === "needs-feedback").length} blocked review slug${reviewEntries.filter((entry) => entry.lane === "needs-feedback").length === 1 ? "" : "s"}`,
          `${reviewEntries.filter((entry) => entry.lane === "flag-after-edit").length} flag-after-edit slug${reviewEntries.filter((entry) => entry.lane === "flag-after-edit").length === 1 ? "" : "s"}`,
        ],
        commands: reviewCommands(reviewGroup, reviewSelected[0]?.slug),
      }
    : null;

  const qualityEntries = reports
    .map((report) => buildQualityEntry(ROOT, report))
    .filter((entry): entry is NonNullable<ReturnType<typeof buildQualityEntry>> => entry !== null)
    .sort((left, right) => {
      const rankDiff = rankQualityPackEntry(left) - rankQualityPackEntry(right);
      if (rankDiff !== 0) {
        return rankDiff;
      }
      const queueDiff = queueRank(left.queueState) - queueRank(right.queueState);
      if (queueDiff !== 0) {
        return queueDiff;
      }
      return left.slug.localeCompare(right.slug);
    });
  const readyCount = qualityEntries.filter((entry) => entry.lane === "capture-ready").length;
  const refreshCount = qualityEntries.filter((entry) => entry.lane === "refresh-browser-first").length;
  const bootCount = qualityEntries.filter((entry) => entry.lane === "boot-blocked").length;
  const readySample = qualityEntries.find((entry) => entry.lane === "capture-ready");
  const qualityPacket = readyCount > 0
    ? {
        kind: "quality-capture" as const,
        summary: "capture-ready quality scans",
        why: "Fresh-smoke slugs should move straight into reusable playtest capture instead of waiting for another broad audit triage pass.",
        selectedCount: readyCount,
        selectedLabel: "capture-ready quality scans",
        sampleSlug: readySample?.slug,
        evidence: [
          `${readyCount} capture-ready slug${readyCount === 1 ? "" : "s"}`,
          `${refreshCount} refresh-browser-first slug${refreshCount === 1 ? "" : "s"}`,
          `${bootCount} boot-blocked slug${bootCount === 1 ? "" : "s"}`,
        ],
        commands: [
          "bun.cmd .agents/skills/catalog-sweep/scripts/quality_scan_pack.ts --group ready --limit 5",
          "bun.cmd .agents/skills/catalog-sweep/scripts/playtest_capture_pack.ts --group ready --limit 5",
          "bun.cmd .agents/skills/catalog-sweep/scripts/audit_handoff_pack.ts --group ready --limit 5",
        ],
      }
    : null;

  const seedPacket: LanePacket = {
    kind: "seed-next-pending",
    summary: "seed exactly one new pending catalog item",
    why: "Queue, docs, verify, review, and quality prep lanes are clear enough that throughput should move to one fresh pending slug.",
    selectedCount: 0,
    selectedLabel: "seed next pending",
    evidence: [
      `${queueOnlyReports.length} queue-only drift slug${queueOnlyReports.length === 1 ? "" : "s"}`,
      `${verifySnapshot.bootSlugs.length} boot blocker slug${verifySnapshot.bootSlugs.length === 1 ? "" : "s"}`,
      `${verifySnapshot.smokeSlugs.length} smoke-drift slug${verifySnapshot.smokeSlugs.length === 1 ? "" : "s"}`,
      `${docsEntries.length} docs-drift slug${docsEntries.length === 1 ? "" : "s"}`,
    ],
    commands: [
      "bun.cmd .agents/skills/catalog-sweep/scripts/queue_reconcile.ts",
      "bun.cmd .agents/skills/catalog-sweep/scripts/seed_next_pending.ts --slug <slug> --title \"<title>\" --note \"<one-line note>\"",
      "bun.cmd .agents/skills/catalog-sweep/scripts/next_catalog_task.ts --focus reconcile",
    ],
  };

  return {
    queuePacket,
    docsPacket,
    reviewPacket,
    qualityPacket,
    verifyBootPacket,
    verifySmokePacket,
    seedPacket,
  };
}

function reviewCommands(group: ReviewGroupMode, slug?: string): string[] {
  if (group === "missing") {
    const slugArg = slug ? ` --slug ${slug}` : "";
    return [
      "bun.cmd .agents/skills/catalog-sweep/scripts/review_freshness_pack.ts --group missing --limit 10",
      `bun.cmd .agents/skills/catalog-sweep/scripts/review_freshness_pack.ts --group missing${slugArg}`,
    ];
  }

  if (group === "blocked") {
    return [
      "bun.cmd .agents/skills/catalog-sweep/scripts/review_freshness_pack.ts --group blocked --limit 10",
      "bun.cmd .agents/skills/catalog-sweep/scripts/review_freshness_pack.ts --group blocked",
    ];
  }

  const slugArg = slug ? ` --slug ${slug}` : "";
  return [
    "bun.cmd .agents/skills/catalog-sweep/scripts/review_freshness_pack.ts --group flag --limit 10",
    `bun.cmd .agents/skills/catalog-sweep/scripts/review_flag_sync.ts${slugArg}`,
  ];
}

function choosePrimaryLane(facts: LaneFacts): LanePacket {
  if (facts.queuePacket.kind === "queue-reconcile") {
    return facts.queuePacket;
  }
  if (facts.verifyBootPacket) {
    return facts.verifyBootPacket;
  }

  const docsCount = facts.docsPacket?.selectedCount ?? 0;
  const smokeCount = facts.verifySmokePacket?.selectedCount ?? 0;
  if (docsCount > 0 || smokeCount > 0) {
    if (smokeCount > docsCount && facts.verifySmokePacket) {
      return facts.verifySmokePacket;
    }
    if (facts.docsPacket) {
      return facts.docsPacket;
    }
    if (facts.verifySmokePacket) {
      return facts.verifySmokePacket;
    }
  }

  if (facts.reviewPacket?.kind === "review-missing") {
    return facts.reviewPacket;
  }
  if (facts.qualityPacket) {
    return facts.qualityPacket;
  }
  if (facts.reviewPacket) {
    return facts.reviewPacket;
  }
  if (facts.queuePacket.kind === "seed-next-pending") {
    return facts.seedPacket;
  }
  return facts.queuePacket;
}

function rankPacket(packet: LanePacket): number {
  if (packet.kind === "queue-reconcile") {
    return 0;
  }
  if (packet.kind === "verify-boot") {
    return 1;
  }
  if (packet.kind === "verify-smoke") {
    return 2;
  }
  if (packet.kind === "docs-rewrite") {
    return 3;
  }
  if (packet.kind === "review-missing") {
    return 4;
  }
  if (packet.kind === "quality-capture") {
    return 5;
  }
  if (packet.kind === "review-blocked") {
    return 6;
  }
  if (packet.kind === "review-flag") {
    return 7;
  }
  return 8;
}

function chooseFollowUpLane(primary: LanePacket, facts: LaneFacts): LanePacket | null {
  const candidates = [
    facts.queuePacket.kind === "queue-reconcile" ? facts.queuePacket : null,
    facts.verifyBootPacket,
    facts.verifySmokePacket,
    facts.docsPacket,
    facts.reviewPacket,
    facts.qualityPacket,
    facts.seedPacket,
  ]
    .filter((entry): entry is LanePacket => entry !== null && entry.kind !== primary.kind)
    .sort((left, right) => {
      const rankDiff = rankPacket(left) - rankPacket(right);
      if (rankDiff !== 0) {
        return rankDiff;
      }
      if (right.selectedCount !== left.selectedCount) {
        return right.selectedCount - left.selectedCount;
      }
      return left.kind.localeCompare(right.kind);
    });

  return candidates[0] ?? null;
}

function buildLearning(primary: LanePacket, followUp: LanePacket | null): string {
  if (followUp) {
    return `- Catalog throughput improves when one helper picks the next reusable lane and its exact follow-up commands, because operators can move from ${primary.kind} into ${followUp.kind} without bouncing back through a broad sweep between every batch.`;
  }

  return `- Catalog throughput improves when one helper picks the next reusable lane and exact packet commands, because operators can start ${primary.kind} from current repo facts instead of rediscovering which catalog skill lane is actually next.`;
}

function buildTextOutput(primary: LanePacket, followUp: LanePacket | null, durableLearning: string): string {
  const kojimaSignals = buildKojimaSignals(undefined, undefined, KOJIMA_SIGNAL_LIMIT);
  const lines = [
    "# Workflow Lane Packet",
    "",
    `lane: ${primary.kind}`,
    `label: ${primary.selectedLabel}`,
    `count: ${primary.selectedCount}`,
    `summary: ${primary.summary}`,
    `why: ${primary.why}`,
  ];

  if (primary.sampleSlug) {
    lines.push(`sample slug: ${primary.sampleSlug}`);
  }

  lines.push("");
  lines.push("## Evidence");
  lines.push("");
  for (const item of primary.evidence) {
    lines.push(`- ${item}`);
  }

  lines.push("");
  lines.push("## Commands now");
  lines.push("");
  for (const command of primary.commands) {
    lines.push(`- ${command}`);
  }

  if (followUp) {
    lines.push("");
    lines.push("## Follow-up lane");
    lines.push("");
    lines.push(`- lane: ${followUp.kind}`);
    lines.push(`- label: ${followUp.selectedLabel}`);
    lines.push(`- summary: ${followUp.summary}`);
    if (followUp.sampleSlug) {
      lines.push(`- sample slug: ${followUp.sampleSlug}`);
    }
    lines.push("- commands:");
    for (const command of followUp.commands) {
      lines.push(`  - ${command}`);
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

  lines.push("");
  lines.push("## Durable learning");
  lines.push("");
  lines.push(durableLearning);

  return lines.join("\n");
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const facts = buildLaneFacts();
  const primary = choosePrimaryLane(facts);
  const followUp = chooseFollowUpLane(primary, facts);
  const durableLearning = buildLearning(primary, followUp);

  if (options.saveLearning) {
    saveLearning({ learningLine: durableLearning });
  }

  if (options.json) {
    console.log(JSON.stringify({ primary, followUp, durableLearning }, null, 2));
    return;
  }

  console.log(buildTextOutput(primary, followUp, durableLearning));
}

main();
