import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type Severity = "blocker" | "major" | "minor";
type LaneStatus = "pass" | "partial" | "fail" | "missing";

type StressFrameObservation = {
  moment?: string;
  clutterSource?: string;
  movingBackground?: boolean;
  blinkingContent?: boolean;
  autoUpdatingContent?: boolean;
  criticalInfoLost?: boolean;
  cueMasked?: boolean;
  responseStillReadable?: boolean;
  criticalElementsReadableUnderMotion?: boolean;
  tags?: string[];
};

type CompetitionMomentObservation = {
  moment?: string;
  signals?: string[];
  dominantReadClear?: boolean;
  responsePriorityClear?: boolean;
  nonCriticalUiCompeting?: boolean;
  notes?: string;
};

type EphemeralMomentObservation = {
  name?: string;
  importance?: "critical" | "supporting" | "secondary";
  appearsNearAction?: boolean;
  obstructsCriticalRead?: boolean;
  notes?: string;
};

type ClutterObservation = {
  movingUiDistraction?: boolean;
  blinkingUiDistraction?: boolean;
  autoUpdatingUiDistraction?: boolean;
  backgroundMotionDistractsRead?: boolean;
};

type EvidenceObservation = {
  mode?: string;
  sampledRuns?: number;
  sampledBusyFrames?: number;
  notes?: string[];
};

type ObservationFile = {
  game?: string;
  sessionDate?: string;
  evidence?: EvidenceObservation;
  stressFrames?: StressFrameObservation[];
  competitionMoments?: CompetitionMomentObservation[];
  ephemeralMoments?: EphemeralMomentObservation[];
  clutter?: ClutterObservation;
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

function summarizeBusyFrameCoverage(data: ObservationFile): LaneSummary {
  const stressFrames = data.stressFrames ?? [];
  const sampledBusyFrames = data.evidence?.sampledBusyFrames ?? 0;
  const hasEvidence = sampledBusyFrames > 0 || stressFrames.length > 0;

  let status: LaneStatus = "missing";
  if (!hasEvidence) {
    status = "missing";
  } else if (stressFrames.length === 0) {
    status = "partial";
  } else {
    status = "pass";
  }

  return {
    label: "Busy-frame clutter evidence",
    status,
    evidence: `sampled busy frames ${sampledBusyFrames}; saved stress-frame rows ${stressFrames.length}.`,
    ceiling: hasEvidence
      ? "This lane only proves clutter in sampled peak-pressure frames. It is a blocker-first smoke, not a full HUD or telegraph audit."
      : "No busy-frame sample exists yet.",
  };
}

function summarizeBackgroundPressure(data: ObservationFile): LaneSummary {
  const stressFrames = data.stressFrames ?? [];
  const clutter = data.clutter ?? {};
  const pressureFrames = stressFrames.filter(
    (frame) =>
      frame.movingBackground === true ||
      frame.blinkingContent === true ||
      frame.autoUpdatingContent === true ||
      Boolean(frame.clutterSource),
  );
  const readBreaks = pressureFrames.filter(
    (frame) =>
      frame.criticalElementsReadableUnderMotion === false ||
      frame.criticalInfoLost === true,
  );
  const globalPressure =
    clutter.movingUiDistraction === true ||
    clutter.blinkingUiDistraction === true ||
    clutter.autoUpdatingUiDistraction === true ||
    clutter.backgroundMotionDistractsRead === true;
  const hasEvidence = pressureFrames.length > 0 || globalPressure;

  let status: LaneStatus = "missing";
  if (!hasEvidence) {
    status = "missing";
  } else if (readBreaks.length > 0) {
    status = "fail";
  } else if (pressureFrames.length > 0 && !globalPressure) {
    status = "pass";
  } else {
    status = "partial";
  }

  return {
    label: "Background clutter pressure",
    status,
    evidence: `pressure-tagged stress frames ${pressureFrames.length}; pressure frames with read loss ${readBreaks.length}; global clutter risk ${globalPressure ? "yes" : "no"}.`,
    ceiling: hasEvidence
      ? "This lane judges whether sampled world motion or auto-updating layers created clutter pressure. It does not prove every frame in the run stayed equally busy."
      : "No clutter-pressure sample yet.",
  };
}

function summarizeOverlayCompetition(data: ObservationFile): LaneSummary {
  const stressFrames = data.stressFrames ?? [];
  const competitionMoments = data.competitionMoments ?? [];
  const ephemeralMoments = (data.ephemeralMoments ?? []).filter(
    (moment) => moment.importance !== "secondary",
  );
  const maskedFrames = stressFrames.filter((frame) => frame.cueMasked === true).length;
  const priorityBreakdowns = competitionMoments.filter(
    (moment) =>
      moment.dominantReadClear === false ||
      moment.responsePriorityClear === false ||
      moment.nonCriticalUiCompeting === true,
  ).length;
  const obstructiveMoments = ephemeralMoments.filter(
    (moment) =>
      moment.appearsNearAction === true && moment.obstructsCriticalRead === true,
  ).length;
  const hasEvidence =
    competitionMoments.length > 0 || stressFrames.length > 0 || ephemeralMoments.length > 0;

  let status: LaneStatus = "missing";
  if (!hasEvidence) {
    status = "missing";
  } else if (maskedFrames > 0 || priorityBreakdowns > 0 || obstructiveMoments > 0) {
    status = "fail";
  } else if (competitionMoments.length > 0 || stressFrames.length > 0) {
    status = "pass";
  } else {
    status = "partial";
  }

  return {
    label: "Overlay competition and occlusion",
    status,
    evidence: `cue-masked stress frames ${maskedFrames}; competition breakdown moments ${priorityBreakdowns}; near-action obstructive prompts ${obstructiveMoments}.`,
    ceiling: hasEvidence
      ? "This lane flags UI competition and occlusion in sampled peaks. It does not diagnose every root cause behind a cluttered moment."
      : "No overlap or occlusion sample yet.",
  };
}

function summarizeCriticalReadSurvival(data: ObservationFile): LaneSummary {
  const stressFrames = data.stressFrames ?? [];
  const lostFrames = stressFrames.filter((frame) => frame.criticalInfoLost === true).length;
  const unreadableFrames = stressFrames.filter(
    (frame) =>
      frame.responseStillReadable === false ||
      frame.criticalElementsReadableUnderMotion === false,
  ).length;
  const hasEvidence = stressFrames.length > 0;

  let status: LaneStatus = "missing";
  if (!hasEvidence) {
    status = "missing";
  } else if (lostFrames > 0 || unreadableFrames > 0) {
    status = "fail";
  } else if (stressFrames.length > 0) {
    status = "pass";
  }

  return {
    label: "Critical read survival under clutter",
    status,
    evidence: `stress frames ${stressFrames.length}; stress frames with critical info lost ${lostFrames}; stress frames with unreadable response ${unreadableFrames}.`,
    ceiling: hasEvidence
      ? "This lane only judges whether the sampled busy frames preserved one usable answer. It does not replace later game-local diagnosis."
      : "No busy-frame survival sample yet.",
  };
}

function buildFindings(data: ObservationFile, lanes: LaneSummary[]): Finding[] {
  const findings: Finding[] = [];
  const coverageLane = lanes.find((lane) => lane.label === "Busy-frame clutter evidence");
  const backgroundLane = lanes.find((lane) => lane.label === "Background clutter pressure");
  const overlayLane = lanes.find((lane) => lane.label === "Overlay competition and occlusion");
  const survivalLane = lanes.find((lane) => lane.label === "Critical read survival under clutter");

  if (coverageLane?.status === "missing") {
    findings.push({
      severity: "major",
      title: "no busy-frame clutter sample exists, so calm-screen readability claims stay weak",
      evidence: coverageLane.evidence,
      nextStep: "Capture at least one real pressure frame before treating HUD or telegraph readability as durable.",
    });
  } else if (coverageLane?.status === "partial") {
    findings.push({
      severity: "major",
      title: "busy-frame evidence count exists, but no saved stress-frame rows preserve the actual clutter moment",
      evidence: coverageLane.evidence,
      nextStep: "Merge the busy-frame artifact or log the sampled pressure frame directly so later lanes can cite the exact clutter beat.",
    });
  }

  if (backgroundLane?.status === "fail") {
    findings.push({
      severity: "major",
      title: "background or auto-updating clutter is strong enough to break sampled readability",
      evidence: backgroundLane.evidence,
      nextStep: "Reduce background motion, add stronger separation, or relocate the must-read element so live world clutter stops erasing it.",
    });
  } else if (backgroundLane?.status === "partial") {
    findings.push({
      severity: "major",
      title: "clutter pressure is present but not yet proved safe in the sampled frame",
      evidence: backgroundLane.evidence,
      nextStep: "Recheck one worst pressure frame and log whether the same world motion still preserves the read.",
    });
  }

  if (overlayLane?.status === "fail") {
    findings.push({
      severity: "blocker",
      title: "overlay competition or occlusion collapses the dominant urgent read during busy play",
      evidence: overlayLane.evidence,
      nextStep: "Suppress, move, or sequence non-critical overlays so one urgent answer survives inside the focal action lane.",
    });
  } else if (overlayLane?.status === "partial") {
    findings.push({
      severity: "major",
      title: "overlay competition evidence is incomplete, so cue-priority claims should stay narrow",
      evidence: overlayLane.evidence,
      nextStep: "Log one overlap where several signals compete and record which read actually won.",
    });
  }

  if (survivalLane?.status === "fail") {
    findings.push({
      severity: "blocker",
      title: "critical read does not survive the sampled busy-frame clutter peak",
      evidence: survivalLane.evidence,
      nextStep: "Treat this as a blocker-first clutter failure and fix read survival before deeper HUD or telegraph polish.",
    });
  }

  if (findings.length === 0) {
    findings.push({
      severity: "minor",
      title: "no blocker-grade busy-frame clutter breakdown was logged in the supplied sample",
      evidence: `busy frames sampled ${data.evidence?.sampledBusyFrames ?? 0}; stress frames ${data.stressFrames?.length ?? 0}.`,
      nextStep: "Use this as a smoke verdict only and reopen game-local HUD or telegraph review if later pressure beats still feel muddy.",
    });
  }

  return findings.sort((left, right) => severityRank(left.severity) - severityRank(right.severity));
}

function buildTemplate(): string {
  return [
    "# Busy-Frame Clutter Smoke Template",
    "",
    "Use one captured playtest observation JSON.",
    "",
    "Checks:",
    "- busy-frame clutter evidence",
    "- background clutter pressure",
    "- overlay competition and occlusion",
    "- critical-read survival under clutter",
    "",
    "Evidence ceiling:",
    "- this lane is a blocker-first smoke for sampled worst-case busy frames",
    "- it does not replace a deeper HUD, telegraph, or per-game diagnosis pass",
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

function buildFrameDetailSection(data: ObservationFile): string[] {
  const stressFrames = data.stressFrames ?? [];
  if (stressFrames.length === 0) {
    return ["- No stress-frame rows logged yet."];
  }

  return stressFrames.map(
    (frame) =>
      `- ${frame.moment ?? "unnamed frame"}: clutter=${frame.clutterSource ?? "unknown"}; ` +
      `moving-background=${frame.movingBackground === true ? "yes" : "no"}; ` +
      `auto-updating=${frame.autoUpdatingContent === true ? "yes" : "no"}; ` +
      `cue-masked=${frame.cueMasked === true ? "yes" : "no"}; ` +
      `critical-info-lost=${frame.criticalInfoLost === true ? "yes" : "no"}; ` +
      `response-readable=${frame.responseStillReadable === false ? "no" : "yes"}.`,
  );
}

function buildHandoffSection(lanes: LaneSummary[]): string[] {
  const nextSteps = new Set<string>();
  const coverageLane = lanes.find((lane) => lane.label === "Busy-frame clutter evidence");
  const overlayLane = lanes.find((lane) => lane.label === "Overlay competition and occlusion");
  const survivalLane = lanes.find((lane) => lane.label === "Critical read survival under clutter");

  if (coverageLane?.status !== "pass") {
    nextSteps.add("Before later HUD or telegraph claims, capture and preserve one exact busy-frame clutter beat instead of relying on calm screenshots.");
  }
  if (overlayLane?.status !== "pass") {
    nextSteps.add("Before later failure or HUD claims, verify one dominant urgent read survives when overlays and cues stack together.");
  }
  if (survivalLane?.status !== "pass") {
    nextSteps.add("Before later game-local polish, fix sampled read survival inside the clutter peak rather than adding more surrounding information.");
  }
  if (nextSteps.size === 0) {
    nextSteps.add("This smoke is strong enough to feed later HUD or telegraph prioritization without reopening the whole observation first.");
  }

  return Array.from(nextSteps).map((step) => `- ${step}`);
}

function buildNextSteps(findings: Finding[]): string[] {
  return Array.from(new Set(findings.map((finding) => finding.nextStep))).map((step) => `- ${step}`);
}

export function buildSummary(data: ObservationFile) {
  const lanes = [
    summarizeBusyFrameCoverage(data),
    summarizeBackgroundPressure(data),
    summarizeOverlayCompetition(data),
    summarizeCriticalReadSurvival(data),
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
    `# ${summary.game} Busy-Frame Clutter Smoke`,
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
    "## Busy-Frame Detail",
    "",
    ...buildFrameDetailSection(data),
    "",
    "## HUD Telegraph Handoff",
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
