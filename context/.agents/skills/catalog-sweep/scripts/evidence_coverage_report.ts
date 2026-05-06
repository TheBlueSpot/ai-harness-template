import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { parseTodoRecords, type QueueState } from "./catalog_candidates";
import { saveLearning } from "./learning_capture";
import { inspectPlaytestStatus } from "./quality_scan_core";
import { buildReports } from "./sweep_core";

type CoverageGroup = "ready" | "stale" | "inference-only" | "missing" | "all";
type CoverageStatus = "ready" | "stale" | "inference-only" | "missing";

type CliOptions = {
  group?: CoverageGroup;
  json: boolean;
  lane?: string;
  limit?: number;
  saveLearning: boolean;
  slug?: string;
};

type StarterCoverage = {
  status: "ready" | "partial" | "missing";
  reasons: string[];
};

type AuditLaneConfig = {
  kind: "audit";
  id: string;
  label: string;
  starterFile: string;
  findingFile: string;
  command: (slug: string) => string;
};

type SmokeLaneConfig = {
  kind: "smoke";
  id: string;
  label: string;
  findingFile: string;
  command: (slug: string) => string;
};

type LaneConfig = AuditLaneConfig | SmokeLaneConfig;

type FileArtifact = {
  path: string;
  updatedAt: number;
};

type LaneEntry = {
  slug: string;
  queueState: QueueState;
  lane: string;
  label: string;
  status: CoverageStatus;
  observations: string[];
  findings: string[];
  actions: string[];
  reasons: string[];
};

type LaneSummary = {
  lane: string;
  label: string;
  readyCount: number;
  staleCount: number;
  inferenceOnlyCount: number;
  missingCount: number;
};

type ClassificationInput = {
  playtestStatus: ReturnType<typeof inspectPlaytestStatus>;
  starterCoverage?: StarterCoverage;
  starterPath?: string;
  starterFresh: boolean;
  findingPath?: string;
  findingFresh: boolean;
};

export function classifyLaneCoverage(input: ClassificationInput): {
  status: CoverageStatus;
  reasons: string[];
} {
  const reasons: string[] = [];

  if (input.playtestStatus.kind === "missing") {
    reasons.push("no reusable playtest observation under ./.local");
    return { status: "missing", reasons };
  }

  if (input.playtestStatus.staleAgainstSmoke) {
    reasons.push("playtest observation predates latest browser smoke proof");
    return { status: "stale", reasons };
  }

  if (input.playtestStatus.staleAgainstContent) {
    reasons.push("playtest observation predates current non-markdown entry content");
    return { status: "stale", reasons };
  }

  if (input.starterPath && !input.starterFresh) {
    reasons.push("starter payload predates latest reusable playtest observation");
    return { status: "stale", reasons };
  }

  if (input.findingPath && !input.findingFresh) {
    reasons.push("lane finding predates latest supporting evidence");
    return { status: "stale", reasons };
  }

  if (!input.findingPath) {
    if (input.starterCoverage) {
      reasons.push(
        input.starterCoverage.status === "ready"
          ? "starter payload is fresh, but no lane finding artifact exists yet"
          : `starter coverage is ${input.starterCoverage.status}: ${input.starterCoverage.reasons.join(" | ")}`,
      );
    } else {
      reasons.push("shared observation exists, but lane-specific finding artifact does not");
    }
    return { status: "inference-only", reasons };
  }

  if (input.starterCoverage && input.starterCoverage.status !== "ready") {
    reasons.push(`starter coverage is ${input.starterCoverage.status}: ${input.starterCoverage.reasons.join(" | ")}`);
    return { status: "inference-only", reasons };
  }

  reasons.push("fresh observation, fresh lane finding, and ready starter coverage");
  return { status: "ready", reasons };
}

const ROOT = process.cwd();
const TODO_PATH = resolve(ROOT, "todo.md");

const AUDIT_LANES: AuditLaneConfig[] = [
  {
    kind: "audit",
    id: "activation-loop-audit",
    label: "activation loop audit",
    starterFile: "activation-loop-audit.json",
    findingFile: "activation-loop-audit.md",
    command: (slug) =>
      `bun.cmd .agents/skills/activation-loop-audit/scripts/activation_loop_audit.ts --observations "./.local/playtest-starters/${slug}/activation-loop-audit.json" --out "./${slug}/activation-loop-audit.md"`,
  },
  {
    kind: "audit",
    id: "onboarding-critique",
    label: "onboarding critique",
    starterFile: "onboarding-critique.json",
    findingFile: "onboarding-review.md",
    command: (slug) =>
      `bun.cmd .agents/skills/onboarding-critique/scripts/onboarding_review.ts --observations "./.local/playtest-starters/${slug}/onboarding-critique.json" --out "./${slug}/onboarding-review.md"`,
  },
  {
    kind: "audit",
    id: "hud-readability-audit",
    label: "HUD readability audit",
    starterFile: "hud-readability-audit.json",
    findingFile: "hud-readability-audit.md",
    command: (slug) =>
      `bun.cmd .agents/skills/hud-readability-audit/scripts/hud_readability_audit.ts --observations "./.local/playtest-starters/${slug}/hud-readability-audit.json" --out "./${slug}/hud-readability-audit.md"`,
  },
  {
    kind: "audit",
    id: "telegraphing-readability-audit",
    label: "telegraph readability audit",
    starterFile: "telegraphing-readability-audit.json",
    findingFile: "telegraphing-readability-audit.md",
    command: (slug) =>
      `bun.cmd .agents/skills/telegraphing-readability-audit/scripts/telegraphing_readability_audit.ts --observations "./.local/playtest-starters/${slug}/telegraphing-readability-audit.json" --out "./${slug}/telegraphing-readability-audit.md"`,
  },
  {
    kind: "audit",
    id: "pacing-curve-audit",
    label: "pacing curve audit",
    starterFile: "pacing-curve-audit.json",
    findingFile: "pacing-curve-audit.md",
    command: (slug) =>
      `bun.cmd .agents/skills/pacing-curve-audit/scripts/pacing_curve_audit.ts --observations "./.local/playtest-starters/${slug}/pacing-curve-audit.json" --out "./${slug}/pacing-curve-audit.md"`,
  },
  {
    kind: "audit",
    id: "failure-loop-audit",
    label: "failure loop audit",
    starterFile: "failure-loop-audit.json",
    findingFile: "failure-loop-audit.md",
    command: (slug) =>
      `bun.cmd .agents/skills/failure-loop-audit/scripts/failure_loop_audit.ts --observations "./.local/playtest-starters/${slug}/failure-loop-audit.json" --out "./${slug}/failure-loop-audit.md"`,
  },
  {
    kind: "audit",
    id: "mastery-motivation-audit",
    label: "mastery motivation audit",
    starterFile: "mastery-motivation-audit.json",
    findingFile: "mastery-motivation-audit.md",
    command: (slug) =>
      `bun.cmd .agents/skills/mastery-motivation-audit/scripts/mastery_motivation_audit.ts --observations "./.local/playtest-starters/${slug}/mastery-motivation-audit.json" --out "./${slug}/mastery-motivation-audit.md"`,
  },
  {
    kind: "audit",
    id: "choice-readback-audit",
    label: "choice readback audit",
    starterFile: "choice-readback-audit.json",
    findingFile: "choice-readback-audit.md",
    command: (slug) =>
      `bun.cmd .agents/skills/choice-readback-audit/scripts/choice_readback_audit.ts --observations "./.local/playtest-starters/${slug}/choice-readback-audit.json" --out "./${slug}/choice-readback-audit.md"`,
  },
  {
    kind: "audit",
    id: "readable-progression-audit",
    label: "readable progression audit",
    starterFile: "readable-progression-audit.json",
    findingFile: "readable-progression-audit.md",
    command: (slug) =>
      `bun.cmd .agents/skills/readable-progression-audit/scripts/readable_progression_audit.ts --observations "./.local/playtest-starters/${slug}/readable-progression-audit.json" --out "./${slug}/readable-progression-audit.md"`,
  },
  {
    kind: "audit",
    id: "forgiveness-audit",
    label: "forgiveness audit",
    starterFile: "forgiveness-audit.json",
    findingFile: "forgiveness-audit.md",
    command: (slug) =>
      `bun.cmd .agents/skills/forgiveness-audit/scripts/forgiveness_audit.ts --observations "./.local/playtest-starters/${slug}/forgiveness-audit.json" --out "./${slug}/forgiveness-audit.md"`,
  },
  {
    kind: "audit",
    id: "input-demand-audit",
    label: "input demand audit",
    starterFile: "input-demand-audit.json",
    findingFile: "input-demand-audit.md",
    command: (slug) =>
      `bun.cmd .agents/skills/input-demand-audit/scripts/input_demand_audit.ts --observations "./.local/playtest-starters/${slug}/input-demand-audit.json" --out "./${slug}/input-demand-audit.md"`,
  },
  {
    kind: "audit",
    id: "impact-feel-audit",
    label: "impact feel audit",
    starterFile: "impact-feel-audit.json",
    findingFile: "impact-feel-audit.md",
    command: (slug) =>
      `bun.cmd .agents/skills/impact-feel-audit/scripts/impact_feel_audit.ts --observations "./.local/playtest-starters/${slug}/impact-feel-audit.json" --out "./${slug}/impact-feel-audit.md"`,
  },
];

const SMOKE_LANES: SmokeLaneConfig[] = [
  {
    kind: "smoke",
    id: "reminder-reentry-smoke",
    label: "reminder reentry smoke",
    findingFile: "reminder-reentry-smoke.md",
    command: (slug) =>
      `bun.cmd .agents/skills/playtest-evidence-capture/scripts/reminder_reentry_smoke.ts --observations "./.local/${slug}-playtest.json" --out "./${slug}/reminder-reentry-smoke.md"`,
  },
  {
    kind: "smoke",
    id: "busy-frame-clutter-smoke",
    label: "busy-frame clutter smoke",
    findingFile: "busy-frame-clutter-smoke.md",
    command: (slug) =>
      `bun.cmd .agents/skills/playtest-evidence-capture/scripts/busy_frame_clutter_smoke.ts --observations "./.local/${slug}-playtest.json" --out "./${slug}/busy-frame-clutter-smoke.md"`,
  },
  {
    kind: "smoke",
    id: "text-motion-smoke",
    label: "text and motion smoke",
    findingFile: "text-motion-smoke.md",
    command: (slug) =>
      `bun.cmd .agents/skills/playtest-evidence-capture/scripts/text_motion_smoke.ts --observations "./.local/${slug}-playtest.json" --out "./${slug}/text-motion-smoke.md"`,
  },
];

const LANE_CONFIGS: LaneConfig[] = [...AUDIT_LANES, ...SMOKE_LANES];

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
    if ((arg === "--group" || arg === "--lane" || arg === "--limit" || arg === "--slug") && !next) {
      throw new Error(`Missing value for ${arg}`);
    }

    if (arg === "--group") {
      if (next !== "ready" && next !== "stale" && next !== "inference-only" && next !== "missing" && next !== "all") {
        throw new Error(`Unsupported --group value: ${next}`);
      }
      options.group = next;
      index += 1;
      continue;
    }

    if (arg === "--lane") {
      options.lane = next;
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

function getFileArtifact(relativePath: string): FileArtifact | undefined {
  const absolutePath = resolve(ROOT, relativePath);
  if (!existsSync(absolutePath)) {
    return undefined;
  }

  return {
    path: relativePath,
    updatedAt: statSync(absolutePath).mtimeMs,
  };
}

function getPlaytestArtifacts(slug: string, playtestStatus: ReturnType<typeof inspectPlaytestStatus>): string[] {
  if (playtestStatus.kind === "missing") {
    return [];
  }

  const artifacts = playtestStatus.artifacts
    .map((artifact) => `./.local/${artifact.replaceAll("\\", "/")}`)
    .filter((artifact) => artifact.endsWith(".json") || artifact.endsWith(".md"));
  const reportPath = `./${slug}/playtest-evidence.md`;
  if (existsSync(resolve(ROOT, reportPath))) {
    artifacts.push(reportPath);
  }
  return [...new Set(artifacts)];
}

function readStarterCoverage(starterPath: string): StarterCoverage {
  const artifact = getFileArtifact(starterPath);
  if (!artifact) {
    return {
      status: "missing",
      reasons: ["starter file missing"],
    };
  }

  try {
    const payload = JSON.parse(readFileSync(resolve(ROOT, starterPath), "utf8")) as {
      claimGuardrail?: {
        coverageGate?: { status?: string; reasons?: string[] };
        coverage?: { status?: string; reasons?: string[] };
      };
    };
    const coverage = payload.claimGuardrail?.coverageGate ?? payload.claimGuardrail?.coverage;
    if (coverage?.status === "ready" || coverage?.status === "partial" || coverage?.status === "missing") {
      return {
        status: coverage.status,
        reasons: coverage.reasons && coverage.reasons.length > 0 ? coverage.reasons : ["coverage reasons missing"],
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

function queueStateLabel(state: QueueState): string {
  if (state === "pending") {
    return "pending";
  }
  if (state === "completed") {
    return "completed";
  }
  return "untracked";
}

function buildMissingActions(slug: string, lane: LaneConfig): string[] {
  const actions = [
    `bun.cmd .agents/skills/catalog-sweep/scripts/playtest_capture_pack.ts --group ready --slug ${slug}`,
  ];
  if (lane.kind === "audit") {
    actions.push(
      `bun.cmd .agents/skills/playtest-evidence-capture/scripts/playtest_evidence_capture.ts --observations "./.local/${slug}-playtest.json" --out "./${slug}/playtest-evidence.md" --starter-dir "./.local/playtest-starters/${slug}"`,
    );
  }
  actions.push(lane.command(slug));
  return actions;
}

function buildInferenceActions(slug: string, lane: LaneConfig): string[] {
  return [lane.command(slug)];
}

function buildStaleActions(slug: string, lane: LaneConfig): string[] {
  return [
    `bun.cmd .agents/skills/catalog-sweep/scripts/smoke_refresh_kickoff.ts --slug ${slug}`,
    `bun.cmd .agents/skills/playtest-evidence-capture/scripts/playtest_evidence_capture.ts --observations "./.local/${slug}-playtest.json" --out "./${slug}/playtest-evidence.md" --starter-dir "./.local/playtest-starters/${slug}"`,
    lane.command(slug),
  ];
}

function inspectLaneEntry(
  slug: string,
  queueState: QueueState,
  lane: LaneConfig,
  playtestStatus: ReturnType<typeof inspectPlaytestStatus>,
): LaneEntry {
  const observations = getPlaytestArtifacts(slug, playtestStatus);
  const starterPath = lane.kind === "audit" ? `./.local/playtest-starters/${slug}/${lane.starterFile}` : undefined;
  const starterArtifact = starterPath ? getFileArtifact(starterPath) : undefined;
  const findingPath = `./${slug}/${lane.findingFile}`;
  const findingArtifact = getFileArtifact(findingPath);
  const starterCoverage = starterPath ? readStarterCoverage(starterPath) : undefined;
  const starterFresh =
    !starterArtifact
      ? false
      : playtestStatus.kind === "present"
        ? starterArtifact.updatedAt >= playtestStatus.latestPlaytestAt
        : false;
  const prerequisiteUpdatedAt = Math.max(
    playtestStatus.kind === "present" ? playtestStatus.latestPlaytestAt : 0,
    starterArtifact?.updatedAt ?? 0,
  );
  const findingFresh = findingArtifact ? findingArtifact.updatedAt >= prerequisiteUpdatedAt : false;

  const classification = classifyLaneCoverage({
    playtestStatus,
    starterCoverage,
    starterPath: starterArtifact?.path,
    starterFresh,
    findingPath: findingArtifact?.path,
    findingFresh,
  });

  const findings = findingArtifact ? [findingArtifact.path] : [];
  const reasons = [...classification.reasons];
  if (starterCoverage && starterCoverage.status !== "ready" && classification.status !== "missing") {
    reasons.push(`starter reasons: ${starterCoverage.reasons.join(" | ")}`);
  }

  const actions =
    classification.status === "missing"
      ? buildMissingActions(slug, lane)
      : classification.status === "stale"
        ? buildStaleActions(slug, lane)
        : classification.status === "inference-only"
          ? buildInferenceActions(slug, lane)
          : [];

  return {
    slug,
    queueState,
    lane: lane.id,
    label: lane.label,
    status: classification.status,
    observations,
    findings,
    actions,
    reasons,
  };
}

function matchesGroup(group: CoverageGroup, entry: LaneEntry): boolean {
  if (group === "all") {
    return true;
  }
  return entry.status === group;
}

function statusRank(status: CoverageStatus): number {
  if (status === "stale") {
    return 0;
  }
  if (status === "missing") {
    return 1;
  }
  if (status === "inference-only") {
    return 2;
  }
  return 3;
}

function buildLearning(entries: LaneEntry[]): string {
  const staleCount = entries.filter((entry) => entry.status === "stale").length;
  const missingCount = entries.filter((entry) => entry.status === "missing").length;
  const inferenceCount = entries.filter((entry) => entry.status === "inference-only").length;
  return `- Catalog evidence stays queue-useful when one helper separates stale (${staleCount}), missing (${missingCount}), and inference-only (${inferenceCount}) lane proof from fresh findings, because shared queue picks can target the real evidence gap instead of inventing new audit lanes blindly.`;
}

function summarizeLane(entries: LaneEntry[], lane: LaneConfig): LaneSummary {
  return {
    lane: lane.id,
    label: lane.label,
    readyCount: entries.filter((entry) => entry.status === "ready").length,
    staleCount: entries.filter((entry) => entry.status === "stale").length,
    inferenceOnlyCount: entries.filter((entry) => entry.status === "inference-only").length,
    missingCount: entries.filter((entry) => entry.status === "missing").length,
  };
}

function chooseDefaultGroup(entries: LaneEntry[]): CoverageGroup {
  if (entries.some((entry) => entry.status === "stale")) {
    return "stale";
  }
  if (entries.some((entry) => entry.status === "missing")) {
    return "missing";
  }
  if (entries.some((entry) => entry.status === "inference-only")) {
    return "inference-only";
  }
  return "ready";
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  if (!existsSync(TODO_PATH)) {
    throw new Error("todo.md not found");
  }

  const todoRecords = parseTodoRecords(TODO_PATH);
  const reports = buildReports(ROOT, todoRecords, options.slug);
  const laneConfigs = options.lane ? LANE_CONFIGS.filter((lane) => lane.id === options.lane) : LANE_CONFIGS;

  if (laneConfigs.length === 0) {
    throw new Error(`Unknown lane: ${options.lane}`);
  }

  const entries = reports
    .flatMap((report) => {
      const playtestStatus = inspectPlaytestStatus(ROOT, report.slug);
      return laneConfigs.map((lane) => inspectLaneEntry(report.slug, report.queueState, lane, playtestStatus));
    })
    .sort((left, right) => {
      const laneDiff = left.lane.localeCompare(right.lane);
      if (laneDiff !== 0) {
        return laneDiff;
      }
      const statusDiff = statusRank(left.status) - statusRank(right.status);
      if (statusDiff !== 0) {
        return statusDiff;
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
  const filteredEntries = entries.filter((entry) => matchesGroup(group, entry));
  const limitedEntries = filteredEntries.slice(0, options.limit ?? 25);
  const laneSummaries = laneConfigs.map((lane) => summarizeLane(entries.filter((entry) => entry.lane === lane.id), lane));
  const durableLearning = buildLearning(entries);

  if (options.saveLearning) {
    saveLearning({ learningLine: durableLearning });
  }

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          summary: {
            selectedGroup: group,
            selectedCount: filteredEntries.length,
            lanes: laneSummaries,
          },
          durableLearning,
          entries: limitedEntries,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log("# Evidence Coverage Report");
  console.log("");
  console.log(`selected group: ${group} (${filteredEntries.length})`);
  console.log(`lane count: ${laneSummaries.length}`);
  console.log(`default batch size: ${options.limit ?? 25}`);
  console.log("");
  console.log("## Lane summary");
  console.log("");
  for (const summary of laneSummaries) {
    console.log(
      `- ${summary.label}: ready ${summary.readyCount} | stale ${summary.staleCount} | inference-only ${summary.inferenceOnlyCount} | missing ${summary.missingCount}`,
    );
  }

  console.log("");
  console.log("## Coverage next");
  console.log("");
  if (group === "stale") {
    console.log("- Refresh these first. Fresh observations already exist, but the lane proof drifted behind smoke, content, or starter inputs.");
  } else if (group === "missing") {
    console.log("- Capture or rebuild these next. Shared queue should not infer lane health when no reusable proof exists.");
  } else if (group === "inference-only") {
    console.log("- These have reusable observations, but the lane still lacks a fresh lane-specific finding or ready starter-backed proof.");
  } else {
    console.log("- These are the current fresh proof lanes.");
  }

  for (const entry of limitedEntries) {
    console.log("");
    console.log(`## ${entry.label} :: ${entry.slug}`);
    console.log("");
    console.log(`- queue: ${queueStateLabel(entry.queueState)}`);
    console.log(`- status: ${entry.status}`);
    console.log("- observations:");
    if (entry.observations.length === 0) {
      console.log("  - none");
    } else {
      for (const observation of entry.observations) {
        console.log(`  - ${observation}`);
      }
    }
    console.log("- findings:");
    if (entry.findings.length === 0) {
      console.log("  - none");
    } else {
      for (const finding of entry.findings) {
        console.log(`  - ${finding}`);
      }
    }
    console.log("- why:");
    for (const reason of entry.reasons) {
      console.log(`  - ${reason}`);
    }
    console.log("- actions:");
    if (entry.actions.length === 0) {
      console.log("  - none");
    } else {
      for (const action of entry.actions) {
        console.log(`  - ${action}`);
      }
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
