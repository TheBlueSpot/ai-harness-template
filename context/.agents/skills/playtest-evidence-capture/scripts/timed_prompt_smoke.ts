import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type Severity = "blocker" | "major" | "minor";
type LaneStatus = "pass" | "partial" | "fail" | "missing";

type EphemeralMomentObservation = {
  name?: string;
  kind?: "tutorial" | "objective" | "notification" | "warning" | "status";
  importance?: "critical" | "supporting" | "secondary";
  appearsNearAction?: boolean;
  autoDismisses?: boolean;
  dismissSeconds?: number;
  playerControlledAdvance?: boolean;
  reviewableLater?: boolean;
  suppressibleWhenNonCritical?: boolean;
  obstructsCriticalRead?: boolean;
  notes?: string;
};

type CompetitionMomentObservation = {
  moment?: string;
  signals?: string[];
  dominantReadClear?: boolean;
  responsePriorityClear?: boolean;
  nonCriticalUiCompeting?: boolean;
  notes?: string;
};

type EvidenceObservation = {
  mode?: string;
  sampledRuns?: number;
  sampledBusyFrames?: number;
  notes?: string[];
};

export type ObservationFile = {
  game?: string;
  sessionDate?: string;
  evidence?: EvidenceObservation;
  ephemeralMoments?: EphemeralMomentObservation[];
  competitionMoments?: CompetitionMomentObservation[];
  strengths?: string[];
  frictions?: string[];
};

type CliOptions = {
  observations?: string;
  out?: string;
  template: boolean;
  json: boolean;
};

type LaneSummary = {
  label: string;
  status: LaneStatus;
  evidence: string;
  ceiling: string;
};

type Finding = {
  severity: Severity;
  title: string;
  evidence: string;
  nextStep: string;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { template: false, json: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--template") {
      options.template = true;
      continue;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }

    const next = argv[index + 1];
    if ((arg === "--observations" || arg === "--out") && !next) {
      throw new Error(`Missing value for ${arg}`);
    }

    if (arg === "--observations") {
      options.observations = next;
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

function readObservations(filePath: string): ObservationFile {
  const raw = readFileSync(resolve(filePath), "utf8");
  const parsed = JSON.parse(raw) as ObservationFile;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Observation file must contain a JSON object.");
  }
  return parsed;
}

function boolLabel(value: boolean | undefined): string {
  if (value === true) {
    return "yes";
  }
  if (value === false) {
    return "no";
  }
  return "unknown";
}

function severityRank(value: Severity): number {
  if (value === "blocker") {
    return 0;
  }
  if (value === "major") {
    return 1;
  }
  return 2;
}

function laneScore(status: LaneStatus): number {
  if (status === "pass") {
    return 3;
  }
  if (status === "partial") {
    return 2;
  }
  if (status === "fail") {
    return 1;
  }
  return 0;
}

function importantMoments(data: ObservationFile): EphemeralMomentObservation[] {
  return (data.ephemeralMoments ?? []).filter((moment) => moment.importance !== "secondary");
}

function timedMoments(data: ObservationFile): EphemeralMomentObservation[] {
  return importantMoments(data).filter((moment) => moment.autoDismisses === true);
}

function summarizePromptControl(data: ObservationFile): LaneSummary {
  const moments = timedMoments(data);
  const playerPaced = moments.filter((moment) => moment.playerControlledAdvance === true).length;
  const autoDismissedWithoutControl = moments.filter((moment) => moment.playerControlledAdvance !== true).length;
  const hasEvidence = importantMoments(data).length > 0;

  let status: LaneStatus = "missing";
  if (!hasEvidence) {
    status = "missing";
  } else if (autoDismissedWithoutControl > 0) {
    status = "fail";
  } else if (moments.length === 0 || playerPaced === moments.length) {
    status = "pass";
  } else {
    status = "partial";
  }

  return {
    label: "Player-paced prompt control",
    status,
    evidence:
      `important prompt moments ${importantMoments(data).length}; timed prompt moments ${moments.length}; ` +
      `player-paced timed prompts ${playerPaced}; timed prompts without player pacing ${autoDismissedWithoutControl}.`,
    ceiling: hasEvidence
      ? "This lane only judges whether sampled non-core prompts were player-paced or timer-driven. It does not judge core gameplay countdowns."
      : "No temporary prompt sample yet.",
  };
}

function summarizeRecoveryPath(data: ObservationFile): LaneSummary {
  const moments = timedMoments(data);
  const reviewable = moments.filter((moment) => moment.reviewableLater === true).length;
  const lostAfterTimeout = moments.filter(
    (moment) => moment.playerControlledAdvance !== true && moment.reviewableLater !== true,
  ).length;
  const hasEvidence = importantMoments(data).length > 0;

  let status: LaneStatus = "missing";
  if (!hasEvidence) {
    status = "missing";
  } else if (lostAfterTimeout > 0) {
    status = "fail";
  } else if (moments.length === 0 || reviewable === moments.length) {
    status = "pass";
  } else {
    status = "partial";
  }

  return {
    label: "Prompt recovery path",
    status,
    evidence:
      `timed prompt moments ${moments.length}; reviewable later ${reviewable}; ` +
      `timed prompts that vanish without replay ${lostAfterTimeout}.`,
    ceiling: hasEvidence
      ? "This lane only proves sampled prompt recovery. A pass means the logged prompt could be revisited or stayed player-paced, not that every prompt path in the game was checked."
      : "No prompt replayability sample yet.",
  };
}

function summarizeObstructionRisk(data: ObservationFile): LaneSummary {
  const moments = importantMoments(data);
  const obstructiveMoments = moments.filter(
    (moment) => moment.appearsNearAction === true && moment.obstructsCriticalRead === true,
  ).length;
  const suppressible = moments.filter((moment) => moment.suppressibleWhenNonCritical === true).length;
  const unsuppressibleNonCritical = moments.filter(
    (moment) =>
      moment.importance !== "critical" &&
      moment.appearsNearAction === true &&
      moment.suppressibleWhenNonCritical === false,
  ).length;
  const hasEvidence = moments.length > 0;

  let status: LaneStatus = "missing";
  if (!hasEvidence) {
    status = "missing";
  } else if (obstructiveMoments > 0 || unsuppressibleNonCritical > 0) {
    status = "fail";
  } else if (suppressible === moments.length || moments.length === 0) {
    status = "pass";
  } else {
    status = "partial";
  }

  return {
    label: "Live-play obstruction risk",
    status,
    evidence:
      `important prompt moments ${moments.length}; near-action prompts that obstruct critical read ${obstructiveMoments}; ` +
      `non-critical near-action prompts without suppression path ${unsuppressibleNonCritical}; suppressible prompt moments ${suppressible}.`,
    ceiling: hasEvidence
      ? "This lane flags whether sampled prompt timing competes with live action. It does not prove that moving the prompt alone solves all cue-stack pressure."
      : "No near-action prompt sample yet.",
  };
}

function summarizeStackPressure(data: ObservationFile): LaneSummary {
  const timed = timedMoments(data);
  const warnings = timed.filter((moment) => moment.kind === "warning" || moment.kind === "objective").length;
  const competitionMoments = data.competitionMoments ?? [];
  const priorityBreakdowns = competitionMoments.filter(
    (moment) =>
      moment.nonCriticalUiCompeting === true &&
      (moment.dominantReadClear === false || moment.responsePriorityClear === false),
  ).length;
  const hasEvidence = timed.length > 0 || competitionMoments.length > 0;

  let status: LaneStatus = "missing";
  if (!hasEvidence) {
    status = "missing";
  } else if (priorityBreakdowns > 0) {
    status = "fail";
  } else if (warnings === 0 || priorityBreakdowns === 0) {
    status = "pass";
  } else {
    status = "partial";
  }

  return {
    label: "Timed warning stack pressure",
    status,
    evidence:
      `timed warnings or objectives ${warnings}; competition moments ${competitionMoments.length}; ` +
      `competition moments where timed UI broke response priority ${priorityBreakdowns}.`,
    ceiling: hasEvidence
      ? "This lane only covers sampled non-core warning stacks. It should hand off to HUD, onboarding, or failure review when the real issue is broader cue competition."
      : "No timed warning or competition sample yet.",
  };
}

function buildFindings(data: ObservationFile, lanes: LaneSummary[]): Finding[] {
  const findings: Finding[] = [];
  const controlLane = lanes.find((lane) => lane.label === "Player-paced prompt control");
  const recoveryLane = lanes.find((lane) => lane.label === "Prompt recovery path");
  const obstructionLane = lanes.find((lane) => lane.label === "Live-play obstruction risk");
  const stackLane = lanes.find((lane) => lane.label === "Timed warning stack pressure");

  if (controlLane?.status === "fail") {
    findings.push({
      severity: "blocker",
      title: "sampled non-core prompts still auto-dismiss before the player controls the pace",
      evidence: controlLane.evidence,
      nextStep: "Let the player advance, extend, or disable the prompt timer instead of forcing one fixed reading window.",
    });
  } else if (controlLane?.status === "partial") {
    findings.push({
      severity: "major",
      title: "timed prompt pacing is only partially proven, so later clarity claims should stay narrow",
      evidence: controlLane.evidence,
      nextStep: "Recheck one tutorial, warning, or objective prompt and log whether the player can pace it directly.",
    });
  }

  if (recoveryLane?.status === "fail") {
    findings.push({
      severity: "blocker",
      title: "sampled timed prompt disappears without a replay path",
      evidence: recoveryLane.evidence,
      nextStep: "Add a reviewable history, reopenable help surface, or keep the prompt on screen until the player advances.",
    });
  } else if (recoveryLane?.status === "partial") {
    findings.push({
      severity: "major",
      title: "prompt recovery evidence is incomplete, so disappearing information is still risky",
      evidence: recoveryLane.evidence,
      nextStep: "Verify whether the same timed prompt can be reopened after it leaves the screen.",
    });
  }

  if (obstructionLane?.status === "fail") {
    findings.push({
      severity: "blocker",
      title: "timed prompt still competes with the live action lane",
      evidence: obstructionLane.evidence,
      nextStep: "Move or suppress non-critical timed prompts during pressure, and keep critical prompts from blocking the must-read action space.",
    });
  } else if (obstructionLane?.status === "partial") {
    findings.push({
      severity: "major",
      title: "prompt obstruction risk is only partially sampled, so live-play readability claims remain weak",
      evidence: obstructionLane.evidence,
      nextStep: "Capture one busy or fail-state prompt moment and log whether it crosses the focal action lane.",
    });
  }

  if (stackLane?.status === "fail") {
    findings.push({
      severity: "major",
      title: "timed warnings join other UI and muddy response priority",
      evidence: stackLane.evidence,
      nextStep: "Simplify the overlapping prompt stack or sequence it so one dominant urgent read survives under pressure.",
    });
  } else if (stackLane?.status === "partial") {
    findings.push({
      severity: "major",
      title: "timed warning pressure is under-sampled, so the smoke cannot yet clear stacked-prompt risk",
      evidence: stackLane.evidence,
      nextStep: "Record one overlap where a timed warning arrives during another urgent read and log which signal won.",
    });
  }

  if (findings.length === 0) {
    findings.push({
      severity: "minor",
      title: "no blocker-grade timed-prompt breakdown was logged in the supplied sample",
      evidence: `timed prompt moments ${timedMoments(data).length}; competition moments ${data.competitionMoments?.length ?? 0}.`,
      nextStep: "Use this as a smoke verdict only and deepen with onboarding, HUD, or failure review if later timed UI still feels slippery.",
    });
  }

  return findings.sort((left, right) => severityRank(left.severity) - severityRank(right.severity));
}

function buildTemplate(): string {
  return [
    "# Timed Prompt Smoke Template",
    "",
    "Use one captured playtest observation JSON.",
    "",
    "Checks:",
    "- player-paced prompt control",
    "- prompt replay or recovery after timeout",
    "- live-play obstruction from timed prompts",
    "- timed warning stack pressure",
    "",
    "Evidence ceiling:",
    "- this lane is a blocker-first smoke for non-core auto-dismissing tutorials, warnings, chat, and objective prompts",
    "- it does not judge core gameplay countdowns or replace deeper onboarding, HUD, or failure-loop review",
  ].join("\n");
}

function buildEvidenceSection(data: ObservationFile): string[] {
  const evidence = data.evidence ?? {};
  return [
    `- Evidence mode: ${evidence.mode ?? "unknown"}.`,
    `- Runs sampled: ${evidence.sampledRuns ?? 0}.`,
    `- Busy frames sampled: ${evidence.sampledBusyFrames ?? 0}.`,
    ...(evidence.notes?.map((note) => `- Evidence note: ${note}`) ?? []),
  ];
}

function buildLaneSection(lanes: LaneSummary[]): string[] {
  return lanes.map(
    (lane) => `- ${lane.label}: ${lane.status}. Evidence: ${lane.evidence} Ceiling: ${lane.ceiling}`,
  );
}

function buildFindingsSection(findings: Finding[]): string[] {
  return findings.map((finding) => `- \`${finding.severity}\` ${finding.title}. Evidence: ${finding.evidence}`);
}

function buildPromptDetailSection(data: ObservationFile): string[] {
  const moments = importantMoments(data);
  if (moments.length === 0) {
    return ["- No important timed-prompt rows logged yet."];
  }

  return moments.map(
    (moment) =>
      `- ${moment.name ?? "unnamed"}: kind=${moment.kind ?? "unknown"}; importance=${moment.importance ?? "unknown"}; ` +
      `auto-dismisses=${boolLabel(moment.autoDismisses)}; dismiss seconds=${typeof moment.dismissSeconds === "number" ? moment.dismissSeconds : "unknown"}; ` +
      `player-paced=${boolLabel(moment.playerControlledAdvance)}; reviewable later=${boolLabel(moment.reviewableLater)}; ` +
      `suppressible when non-critical=${boolLabel(moment.suppressibleWhenNonCritical)}; obstructs critical read=${boolLabel(moment.obstructsCriticalRead)}.`,
  );
}

function buildHandoffSection(lanes: LaneSummary[]): string[] {
  const nextSteps = new Set<string>();
  const controlLane = lanes.find((lane) => lane.label === "Player-paced prompt control");
  const recoveryLane = lanes.find((lane) => lane.label === "Prompt recovery path");
  const obstructionLane = lanes.find((lane) => lane.label === "Live-play obstruction risk");
  const stackLane = lanes.find((lane) => lane.label === "Timed warning stack pressure");

  if (controlLane?.status !== "pass") {
    nextSteps.add("Before later onboarding claims, verify the player can slow, advance, or disable the sampled non-core prompt timer.");
  }
  if (recoveryLane?.status !== "pass") {
    nextSteps.add("Before later reminder or failure claims, verify the same prompt can be replayed or reopened after it disappears.");
  }
  if (obstructionLane?.status !== "pass") {
    nextSteps.add("Before later HUD claims, verify non-critical timed prompts can stay out of the focal action lane during pressure.");
  }
  if (stackLane?.status !== "pass") {
    nextSteps.add("Before later failure-loop claims, verify a timed warning can still preserve one dominant urgent read when other UI is active.");
  }
  if (nextSteps.size === 0) {
    nextSteps.add("This smoke is strong enough to feed later onboarding, HUD, or failure prioritization without reopening the whole observation first.");
  }

  return Array.from(nextSteps).map((step) => `- ${step}`);
}

function buildNextSteps(findings: Finding[]): string[] {
  return Array.from(new Set(findings.map((finding) => finding.nextStep))).map((step) => `- ${step}`);
}

export function buildSummary(data: ObservationFile) {
  const lanes = [
    summarizePromptControl(data),
    summarizeRecoveryPath(data),
    summarizeObstructionRisk(data),
    summarizeStackPressure(data),
  ];
  const findings = buildFindings(data, lanes);
  const worstLane = [...lanes].sort((left, right) => laneScore(left.status) - laneScore(right.status))[0];

  return {
    game: data.game ?? "unknown-game",
    sessionDate: data.sessionDate ?? new Date().toISOString().slice(0, 10),
    worstLane,
    lanes,
    findings,
  };
}

function buildMarkdown(data: ObservationFile): string {
  const summary = buildSummary(data);

  return [
    `# ${summary.game} Timed Prompt Smoke`,
    "",
    `Session: ${summary.sessionDate}`,
    "",
    "## Findings",
    "",
    ...buildFindingsSection(summary.findings),
    "",
    "## Smoke Verdict",
    "",
    ...buildLaneSection(summary.lanes),
    "",
    "## Evidence Snapshot",
    "",
    ...buildEvidenceSection(data),
    "",
    "## Timed Prompt Detail",
    "",
    ...buildPromptDetailSection(data),
    "",
    "## Onboarding HUD Failure Handoff",
    "",
    ...buildHandoffSection(summary.lanes),
    "",
    "## Strengths",
    "",
    ...(data.strengths?.length ? data.strengths.map((item) => `- ${item}`) : ["- No strengths logged yet."]),
    "",
    "## Frictions",
    "",
    ...(data.frictions?.length ? data.frictions.map((item) => `- ${item}`) : ["- No frictions logged yet."]),
    "",
    "## Next Steps",
    "",
    ...buildNextSteps(summary.findings),
    "",
  ].join("\n");
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  if (options.template) {
    console.log(buildTemplate());
    return;
  }
  if (!options.observations) {
    throw new Error("Pass --observations <file> or use --template.");
  }

  const data = readObservations(options.observations);
  const summary = buildSummary(data);
  const output = options.json ? `${JSON.stringify(summary, null, 2)}\n` : `${buildMarkdown(data)}\n`;

  if (options.out) {
    const outPath = resolve(options.out);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, output, "utf8");
    console.log(`Wrote ${outPath}`);
    return;
  }

  process.stdout.write(output);
}

if (import.meta.main) {
  main();
}
