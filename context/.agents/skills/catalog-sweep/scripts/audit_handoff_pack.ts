import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseTodoRecords, type QueueState } from "./catalog_candidates";
import { saveLearning } from "./learning_capture";
import { buildQualityEntry, type PlaytestStatus } from "./quality_scan_core";
import { buildReports, type CatalogEntryReport } from "./sweep_core";

type AuditName = "onboarding" | "hud" | "pacing" | "failure" | "forgiveness" | "impact" | "settings" | "choice-readback";
type GroupMode = "ready" | "partial" | "starter" | "capture" | "refresh" | "boot" | "all";
type EntryLane = "audit-ready" | "audit-partial" | "starter-gap" | "capture-first" | "refresh-browser-first" | "boot-blocked";
type CoverageStatus = "ready" | "partial" | "missing";

type CliOptions = {
  audit: AuditName | "all";
  group?: GroupMode;
  json: boolean;
  limit?: number;
  saveLearning: boolean;
  slug?: string;
};

type StarterCoverage = {
  status: CoverageStatus;
  reasons: string[];
};

type AuditStatus = {
  audit: AuditName;
  label: string;
  status: CoverageStatus;
  starterPath: string;
  outputPath: string;
  command: string;
  reasons: string[];
};

type AuditHandoffEntry = {
  slug: string;
  queueState: QueueState;
  lane: EntryLane;
  readyCount: number;
  partialCount: number;
  missingCount: number;
  sourceFiles: string[];
  evidence: string[];
  nextSteps: string[];
  audits: AuditStatus[];
};

type StarterPayload = {
  claimGuardrail?: {
    coverageGate?: {
      status?: string;
      reasons?: string[];
    };
    coverage?: {
      status?: string;
      reasons?: string[];
    };
  };
  agiSnapshot?: unknown;
};

const ROOT = process.cwd();
const TODO_PATH = resolve(ROOT, "todo.md");
const LOCAL_ROOT = resolve(ROOT, ".local");

export const AUDIT_CONFIG: Record<
  AuditName,
  {
    label: string;
    starterFile: string;
    outputFile: string;
    scriptPath: string;
  }
> = {
  onboarding: {
    label: "onboarding critique",
    starterFile: "onboarding-critique.json",
    outputFile: "onboarding-review.md",
    scriptPath: ".agents/skills/onboarding-critique/scripts/onboarding_review.ts",
  },
  hud: {
    label: "HUD readability audit",
    starterFile: "hud-readability-audit.json",
    outputFile: "hud-readability-audit.md",
    scriptPath: ".agents/skills/hud-readability-audit/scripts/hud_readability_audit.ts",
  },
  pacing: {
    label: "pacing curve audit",
    starterFile: "pacing-curve-audit.json",
    outputFile: "pacing-curve-audit.md",
    scriptPath: ".agents/skills/pacing-curve-audit/scripts/pacing_curve_audit.ts",
  },
  failure: {
    label: "failure loop audit",
    starterFile: "failure-loop-audit.json",
    outputFile: "failure-loop-audit.md",
    scriptPath: ".agents/skills/failure-loop-audit/scripts/failure_loop_audit.ts",
  },
  forgiveness: {
    label: "forgiveness audit",
    starterFile: "forgiveness-audit.json",
    outputFile: "forgiveness-audit.md",
    scriptPath: ".agents/skills/forgiveness-audit/scripts/forgiveness_audit.ts",
  },
  impact: {
    label: "impact feel audit",
    starterFile: "impact-feel-audit.json",
    outputFile: "impact-feel-audit.md",
    scriptPath: ".agents/skills/impact-feel-audit/scripts/impact_feel_audit.ts",
  },
  settings: {
    label: "settings-and-assists audit",
    starterFile: "settings-and-assists-audit.json",
    outputFile: "settings-and-assists-audit.md",
    scriptPath: ".agents/skills/settings-and-assists-audit/scripts/settings_and_assists_audit.ts",
  },
  "choice-readback": {
    label: "choice readback audit",
    starterFile: "choice-readback-audit.json",
    outputFile: "choice-readback-audit.md",
    scriptPath: ".agents/skills/choice-readback-audit/scripts/choice_readback_audit.ts",
  },
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { audit: "all", json: false, saveLearning: false };

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
    if ((arg === "--audit" || arg === "--group" || arg === "--limit" || arg === "--slug") && !next) {
      throw new Error(`Missing value for ${arg}`);
    }

    if (arg === "--audit") {
      if (next !== "all" && next !== "onboarding" && next !== "hud" && next !== "pacing" && next !== "failure" && next !== "forgiveness" && next !== "impact" && next !== "settings" && next !== "choice-readback") {
        throw new Error(`Unsupported --audit value: ${next}`);
      }
      options.audit = next;
      index += 1;
      continue;
    }

    if (arg === "--group") {
      if (next !== "ready" && next !== "partial" && next !== "starter" && next !== "capture" && next !== "refresh" && next !== "boot" && next !== "all") {
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

function formatGroupLabel(group: GroupMode): string {
  if (group === "ready") {
    return "audit-ready";
  }
  if (group === "partial") {
    return "audit-partial";
  }
  if (group === "starter") {
    return "starter-gap";
  }
  if (group === "capture") {
    return "capture-first";
  }
  if (group === "refresh") {
    return "refresh-browser-first";
  }
  if (group === "boot") {
    return "boot-blocked";
  }
  return "all audit handoff lanes";
}

function buildStarterDir(slug: string): string {
  return `./.local/playtest-starters/${slug}`;
}

function getAgiSnapshotOutputPath(slug: string): string {
  return `./.local/${slug}-agi-tags.json`;
}

function buildAgiSnapshotCommand(slug: string, observationPath: string): string {
  return `bun.cmd .agents/skills/agi-tag-snapshot/scripts/agi_tag_snapshot.ts --observations "${observationPath}" --json-out "${getAgiSnapshotOutputPath(slug)}"`;
}

function buildObservationCandidates(slug: string): string[] {
  const direct = resolve(LOCAL_ROOT, `${slug}-playtest.json`);
  const nested = existsSync(LOCAL_ROOT)
    ? readDirectoryNames(LOCAL_ROOT).map((name) => resolve(LOCAL_ROOT, name, `${slug}-playtest.json`))
    : [];
  return [direct, ...nested].filter((candidate, index, all) => existsSync(candidate) && all.indexOf(candidate) === index);
}

function readDirectoryNames(root: string): string[] {
  try {
    return readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

function toRelativePath(filePath: string): string {
  const relative = filePath.replace(`${ROOT}\\`, "").replaceAll("\\", "/");
  return relative.startsWith(".") ? relative : `./${relative}`;
}

function buildStarterCommand(slug: string, observationPath: string): string {
  return `bun.cmd .agents/skills/playtest-evidence-capture/scripts/playtest_evidence_capture.ts --observations "${observationPath}" --out "./${slug}/playtest-evidence.md" --starter-dir "${buildStarterDir(slug)}"`;
}

export function buildAuditCommand(slug: string, audit: AuditName): string {
  const config = AUDIT_CONFIG[audit];
  return `bun.cmd ${config.scriptPath} --observations "${buildStarterDir(slug)}/${config.starterFile}" --out "./${slug}/${config.outputFile}"`;
}

function readStarterCoverage(filePath: string): StarterCoverage {
  if (!existsSync(resolve(ROOT, filePath))) {
    return {
      status: "missing",
      reasons: ["starter file missing"],
    };
  }

  try {
    const payload = JSON.parse(readFileSync(resolve(ROOT, filePath), "utf8")) as StarterPayload;
    const coverage = payload.claimGuardrail?.coverageGate ?? payload.claimGuardrail?.coverage;
    const status = coverage?.status;
    const reasons = coverage?.reasons ?? [];
    if (status === "ready" || status === "partial" || status === "missing") {
      return {
        status,
        reasons: reasons.length > 0 ? reasons : status === "ready" ? ["starter coverage ready"] : ["coverage reasons missing"],
      };
    }
  } catch {
    return {
      status: "missing",
      reasons: ["starter file could not be parsed"],
    };
  }

  return {
    status: "missing",
    reasons: ["starter coverage missing from payload"],
  };
}

function readAgiSnapshotPresence(slug: string): { present: boolean; outputPath: string } {
  const outputPath = getAgiSnapshotOutputPath(slug);
  return {
    present: existsSync(resolve(ROOT, outputPath)),
    outputPath,
  };
}

function inspectAuditStatuses(slug: string): AuditStatus[] {
  return (Object.keys(AUDIT_CONFIG) as AuditName[]).map((audit) => {
    const config = AUDIT_CONFIG[audit];
    const starterPath = `${buildStarterDir(slug)}/${config.starterFile}`;
    const coverage = readStarterCoverage(starterPath);
    return {
      audit,
      label: config.label,
      status: coverage.status,
      starterPath,
      outputPath: `./${slug}/${config.outputFile}`,
      command: buildAuditCommand(slug, audit),
      reasons: coverage.reasons,
    };
  });
}

function chooseLane(
  readyCount: number,
  partialCount: number,
  observationPath?: string,
  qualityLane?: NonNullable<ReturnType<typeof buildQualityEntry>>["lane"],
): EntryLane {
  if (readyCount > 0) {
    return "audit-ready";
  }
  if (partialCount > 0) {
    return "audit-partial";
  }
  if (qualityLane === "boot-blocked") {
    return "boot-blocked";
  }
  if (qualityLane === "refresh-browser-first") {
    return "refresh-browser-first";
  }
  if (qualityLane === "capture-ready") {
    return "capture-first";
  }
  if (observationPath) {
    return "starter-gap";
  }
  return "capture-first";
}

function filterAudits(audits: AuditStatus[], selectedAudit: AuditName | "all"): AuditStatus[] {
  if (selectedAudit === "all") {
    return audits;
  }
  return audits.filter((audit) => audit.audit === selectedAudit);
}

function matchesGroup(group: GroupMode, entry: AuditHandoffEntry): boolean {
  if (group === "all") {
    return true;
  }
  if (group === "ready") {
    return entry.lane === "audit-ready";
  }
  if (group === "partial") {
    return entry.lane === "audit-partial";
  }
  if (group === "starter") {
    return entry.lane === "starter-gap";
  }
  if (group === "capture") {
    return entry.lane === "capture-first";
  }
  if (group === "refresh") {
    return entry.lane === "refresh-browser-first";
  }
  return entry.lane === "boot-blocked";
}

function chooseDefaultGroup(entries: AuditHandoffEntry[]): GroupMode {
  if (entries.some((entry) => entry.lane === "audit-ready")) {
    return "ready";
  }
  if (entries.some((entry) => entry.lane === "audit-partial")) {
    return "partial";
  }
  if (entries.some((entry) => entry.lane === "starter-gap")) {
    return "starter";
  }
  if (entries.some((entry) => entry.lane === "capture-first")) {
    return "capture";
  }
  if (entries.some((entry) => entry.lane === "refresh-browser-first")) {
    return "refresh";
  }
  if (entries.some((entry) => entry.lane === "boot-blocked")) {
    return "boot";
  }
  return "all";
}

function laneRank(lane: EntryLane): number {
  switch (lane) {
    case "audit-ready":
      return 0;
    case "audit-partial":
      return 1;
    case "starter-gap":
      return 2;
    case "capture-first":
      return 3;
    case "refresh-browser-first":
      return 4;
    case "boot-blocked":
      return 5;
  }
}

function buildEntry(root: string, report: CatalogEntryReport, selectedAudit: AuditName | "all"): AuditHandoffEntry {
  const qualityEntry = buildQualityEntry(root, report);
  const observationCandidates = buildObservationCandidates(report.slug);
  const observationPath = observationCandidates[0] ? toRelativePath(observationCandidates[0]) : undefined;
  const agiSnapshot = readAgiSnapshotPresence(report.slug);
  const audits = filterAudits(inspectAuditStatuses(report.slug), selectedAudit);
  const readyCount = audits.filter((audit) => audit.status === "ready").length;
  const partialCount = audits.filter((audit) => audit.status === "partial").length;
  const missingCount = audits.filter((audit) => audit.status === "missing").length;
  const lane = chooseLane(readyCount, partialCount, observationPath, qualityEntry?.lane);
  const sourceFiles = [`./todo.md`, `./${report.slug}/index.html`, `./${report.slug}/README.md`];
  const evidence: string[] = [];
  const nextSteps: string[] = [];

  if (observationPath) {
    sourceFiles.push(observationPath);
  }
  sourceFiles.push(agiSnapshot.outputPath);
  sourceFiles.push(buildStarterDir(report.slug));

  if (lane === "audit-ready") {
    evidence.push(`${readyCount} audit starter${readyCount === 1 ? "" : "s"} ready for direct downstream pass`);
    nextSteps.push("Run one ready audit command directly from the starter file instead of rebuilding capture context.");
    if (partialCount > 0) {
      nextSteps.push("Leave partial audits for a narrower evidence-scoped pass or recapture.");
    }
  } else if (lane === "audit-partial") {
    evidence.push(`${partialCount} audit starter${partialCount === 1 ? "" : "s"} only partial`);
    nextSteps.push("Use only one partial audit if the question is narrow, and keep claims inside the starter guardrails.");
    nextSteps.push("Prefer recapture if the missing coverage blocks the exact audit you want next.");
  } else if (lane === "starter-gap") {
    evidence.push("current playtest observation exists, but downstream audit starter files are missing or unusable");
    if (observationPath) {
      nextSteps.push(`Regenerate starter files from ${observationPath} before opening any focused audit lane.`);
      nextSteps.push(buildStarterCommand(report.slug, observationPath));
    }
  } else if (lane === "capture-first") {
    evidence.push(...(qualityEntry?.evidence ?? ["missing current playtest evidence for downstream audits"]));
    nextSteps.push(...(qualityEntry?.nextSteps ?? [`Capture fresh playtest evidence for ./${report.slug}/ before opening a focused audit lane.`]));
  } else if (lane === "refresh-browser-first") {
    evidence.push(...(qualityEntry?.evidence ?? ["browser proof must be refreshed before audit work"]));
    nextSteps.push(...(qualityEntry?.nextSteps ?? [`Refresh browser proof for ./${report.slug}/ before any audit.`]));
  } else {
    evidence.push(...(qualityEntry?.evidence ?? ["direct browser boot is still broken for this slug"]));
    nextSteps.push(...(qualityEntry?.nextSteps ?? [`Repair direct browser boot for ./${report.slug}/ before any audit.`]));
  }

  if (agiSnapshot.present) {
    evidence.push(`AGI snapshot ready at ${agiSnapshot.outputPath}`);
  } else if (observationPath) {
    nextSteps.push(`Build AGI tags from ${observationPath} with ${buildAgiSnapshotCommand(report.slug, observationPath)}`);
  } else {
    const fallbackObservationPath = `./.local/${report.slug}-playtest.json`;
    nextSteps.push(`Build AGI tags from the playtest observation first, then run ${buildAgiSnapshotCommand(report.slug, fallbackObservationPath)}`);
  }

  for (const audit of audits) {
    if (audit.status === "ready") {
      evidence.push(`${audit.audit}: ready`);
    } else if (audit.status === "partial") {
      evidence.push(`${audit.audit}: partial (${audit.reasons.join(" | ")})`);
    } else {
      evidence.push(`${audit.audit}: missing (${audit.reasons.join(" | ")})`);
    }
  }

  return {
    slug: report.slug,
    queueState: report.queueState,
    lane,
    readyCount,
    partialCount,
    missingCount,
    sourceFiles,
    evidence,
    nextSteps,
    audits,
  };
}

function buildLearning(selectedAudit: AuditName | "all", filteredCount: number, entries: AuditHandoffEntry[]): string {
  const readyCount = entries.filter((entry) => entry.lane === "audit-ready").length;
  const partialCount = entries.filter((entry) => entry.lane === "audit-partial").length;
  const starterGapCount = entries.filter((entry) => entry.lane === "starter-gap").length;
  const label = selectedAudit === "all" ? "cross-entry audit" : `${selectedAudit} audit`;

  if (filteredCount === 0) {
    return `- Catalog throughput improves when audit handoff can record a clean no-debt pass, because the next operator does not have to rerun ${label} prep just to confirm no starter-backed audit lane is waiting.`;
  }

  return `- Catalog throughput improves when one audit handoff packet ranks ready (${readyCount}), partial (${partialCount}), and starter-gap (${starterGapCount}) downstream passes from saved playtest starters, because focused quality scans can start from reusable evidence instead of reopening capture and coverage triage by hand.`;
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  if (!existsSync(TODO_PATH)) {
    throw new Error("todo.md not found");
  }

  const todoRecords = parseTodoRecords(TODO_PATH);
  const reports = buildReports(ROOT, todoRecords, options.slug);
  const entries = reports
    .map((report) => buildEntry(ROOT, report, options.audit))
    .sort((left, right) => {
      const laneDiff = laneRank(left.lane) - laneRank(right.lane);
      if (laneDiff !== 0) {
        return laneDiff;
      }
      if (left.queueState !== right.queueState) {
        if (left.queueState === "pending") {
          return -1;
        }
        if (right.queueState === "pending") {
          return 1;
        }
      }
      if (left.readyCount !== right.readyCount) {
        return right.readyCount - left.readyCount;
      }
      if (left.partialCount !== right.partialCount) {
        return right.partialCount - left.partialCount;
      }
      return left.slug.localeCompare(right.slug);
    });

  const group = options.group ?? chooseDefaultGroup(entries);
  const filtered = entries.filter((entry) => matchesGroup(group, entry));
  const limited = filtered.slice(0, options.limit ?? 5);
  const durableLearning = buildLearning(options.audit, filtered.length, entries);

  if (options.saveLearning) {
    saveLearning({ learningLine: durableLearning });
  }

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          summary: {
            selectedAudit: options.audit,
            selectedGroup: group,
            selectedLabel: formatGroupLabel(group),
            selectedCount: filtered.length,
            readyCount: entries.filter((entry) => entry.lane === "audit-ready").length,
            partialCount: entries.filter((entry) => entry.lane === "audit-partial").length,
            starterGapCount: entries.filter((entry) => entry.lane === "starter-gap").length,
            captureCount: entries.filter((entry) => entry.lane === "capture-first").length,
            refreshCount: entries.filter((entry) => entry.lane === "refresh-browser-first").length,
            bootCount: entries.filter((entry) => entry.lane === "boot-blocked").length,
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

  console.log("# Audit Handoff Pack");
  console.log("");
  console.log(
    `audit handoff: ready ${entries.filter((entry) => entry.lane === "audit-ready").length} | partial ${entries.filter((entry) => entry.lane === "audit-partial").length} | starter ${entries.filter((entry) => entry.lane === "starter-gap").length} | capture ${entries.filter((entry) => entry.lane === "capture-first").length} | refresh ${entries.filter((entry) => entry.lane === "refresh-browser-first").length} | boot ${entries.filter((entry) => entry.lane === "boot-blocked").length}`,
  );
  console.log(`selected audit: ${options.audit}`);
  console.log(`selected group: ${formatGroupLabel(group)} (${filtered.length})`);
  console.log(`default batch size: ${options.limit ?? 5}`);
  console.log("");
  console.log("## Audit next");
  console.log("");
  if (group === "ready") {
    console.log("- Use these first. Starter files already carry coverage and claim guardrails, so one focused audit can start immediately.");
  } else if (group === "partial") {
    console.log("- These can support a narrow audit now, but the starter guardrails still mark coverage gaps.");
  } else if (group === "starter") {
    console.log("- Current playtest evidence exists, but the downstream starter packet is missing. Rebuild starters before focused audit work.");
  } else if (group === "capture") {
    console.log("- Capture fresh playtest evidence first. Focused audits should not start from stale or absent session data.");
  } else if (group === "refresh") {
    console.log("- Refresh browser proof before trusting audit prep. Smoke drift outranks downstream quality claims.");
  } else if (group === "boot") {
    console.log("- Repair direct browser boot first. Broken local boot blocks every later audit lane.");
  } else {
    console.log("- Work top to bottom. Ready audits stay ahead of partial, starter-gap, and upstream evidence debt.");
  }

  for (const entry of limited) {
    console.log("");
    console.log(`## ${entry.slug}`);
    console.log("");
    console.log(`- queue: ${formatQueueState(entry.queueState)}`);
    console.log(`- lane: ${entry.lane}`);
    console.log(`- audits: ready ${entry.readyCount} | partial ${entry.partialCount} | missing ${entry.missingCount}`);
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
    const actionableAudits = entry.audits.filter((audit) => audit.status !== "missing");
    if (actionableAudits.length > 0) {
      console.log("- audit commands:");
      for (const audit of actionableAudits) {
        console.log(`  - ${audit.audit} (${audit.status}): ${audit.command}`);
      }
    }
  }

  console.log("");
  console.log("## Durable learning");
  console.log("");
  console.log(durableLearning);
}

if (require.main === module) {
  main();
}
