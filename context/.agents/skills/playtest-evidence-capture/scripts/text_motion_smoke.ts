import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type Severity = "blocker" | "major" | "minor";
type LaneStatus = "pass" | "partial" | "fail" | "missing";

type CriticalElementObservation = {
  name?: string;
  importance?: "critical" | "supporting" | "secondary";
  readsWithoutText?: boolean;
  contrastStable?: boolean;
  readableUnderMotion?: boolean;
  motionDistraction?: "none" | "low" | "medium" | "high";
  glanceCost?: string;
};

type CueObservation = {
  name?: string;
  importance?: "critical" | "supporting" | "secondary";
  reliesOnColorAlone?: boolean;
  contrastStable?: boolean;
  readableUnderMotion?: boolean;
  motionDistraction?: "none" | "low" | "medium" | "high";
};

type StressFrameObservation = {
  moment?: string;
  criticalInfoLost?: boolean;
  cueMasked?: boolean;
  responseStillReadable?: boolean;
  criticalElementsReadableUnderMotion?: boolean;
  tags?: string[];
};

type ClutterObservation = {
  movingUiDistraction?: boolean;
  blinkingUiDistraction?: boolean;
  autoUpdatingUiDistraction?: boolean;
  backgroundMotionDistractsRead?: boolean;
};

type ChannelSupportObservation = {
  criticalInfoUsesColorOnly?: boolean;
  criticalInfoHasNonColorBackup?: boolean;
};

type AgiSnapshotObservation = {
  textClarity?: {
    clearTextPresent?: boolean;
    smallTextLegibleUnderMotion?: boolean;
  };
  colorAlternatives?: {
    present?: boolean;
    colorOnlyRisk?: boolean;
  };
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
  criticalElements?: CriticalElementObservation[];
  cues?: CueObservation[];
  stressFrames?: StressFrameObservation[];
  clutter?: ClutterObservation;
  channelSupport?: ChannelSupportObservation;
  agiSnapshot?: AgiSnapshotObservation;
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

function importantElements(data: ObservationFile): CriticalElementObservation[] {
  return (data.criticalElements ?? []).filter((element) => element.importance !== "secondary");
}

function importantCues(data: ObservationFile): CueObservation[] {
  return (data.cues ?? []).filter((cue) => cue.importance !== "secondary");
}

function summarizeTextReadability(data: ObservationFile): LaneSummary {
  const elements = importantElements(data);
  const agiText = data.agiSnapshot?.textClarity;
  const motionUnreadable = elements.filter((element) => element.readableUnderMotion === false).length;
  const highGlance = elements.filter((element) => element.glanceCost === "high").length;
  const hasEvidence =
    elements.length > 0 ||
    agiText?.clearTextPresent !== undefined ||
    agiText?.smallTextLegibleUnderMotion !== undefined;

  let status: LaneStatus = "missing";
  if (!hasEvidence) {
    status = "missing";
  } else if (
    agiText?.clearTextPresent === false ||
    agiText?.smallTextLegibleUnderMotion === false ||
    motionUnreadable > 0
  ) {
    status = "fail";
  } else if (
    agiText?.clearTextPresent === true &&
    (agiText.smallTextLegibleUnderMotion === true || (data.evidence?.sampledBusyFrames ?? 0) === 0) &&
    motionUnreadable === 0
  ) {
    status = "pass";
  } else {
    status = "partial";
  }

  const ceiling = hasEvidence
    ? "Observed legibility only. Current capture schema does not measure XAG 101 pixel minimums, so later HUD work still needs size proof before compliance claims."
    : "No usable text-read sample yet.";

  return {
    label: "Text size and readability evidence",
    status,
    evidence:
      `clear text present ${boolLabel(agiText?.clearTextPresent)}; small text legible under motion ${boolLabel(agiText?.smallTextLegibleUnderMotion)}; important text elements ${elements.length}; unreadable under motion ${motionUnreadable}; high glance-cost elements ${highGlance}.`,
    ceiling,
  };
}

function summarizeContrastSupport(data: ObservationFile): LaneSummary {
  const elements = importantElements(data);
  const cues = importantCues(data);
  const stressFrames = data.stressFrames ?? [];
  const unstableElements = elements.filter((element) => element.contrastStable === false).length;
  const unstableCues = cues.filter((cue) => cue.contrastStable === false).length;
  const contrastRiskFrames = stressFrames.filter((frame) => (frame.tags ?? []).includes("contrast risk")).length;
  const contrastLossFrames = stressFrames.filter((frame) => frame.criticalInfoLost === true).length;
  const hasEvidence =
    elements.length > 0 ||
    cues.length > 0 ||
    contrastRiskFrames > 0 ||
    contrastLossFrames > 0;

  let status: LaneStatus = "missing";
  if (!hasEvidence) {
    status = "missing";
  } else if (unstableElements > 0 || unstableCues > 0 || contrastLossFrames > 0) {
    status = "fail";
  } else if (contrastRiskFrames === 0 && unstableElements === 0 && unstableCues === 0) {
    status = "pass";
  } else {
    status = "partial";
  }

  const ceiling = hasEvidence
    ? "This smoke judges outcome-level contrast stability and whether a text backdrop or outline seems necessary. It does not prove an explicit container, opacity, or outline setting exists."
    : "No stable contrast sample yet.";

  return {
    label: "Contrast and container support",
    status,
    evidence:
      `important elements ${elements.length}; important cues ${cues.length}; unstable elements ${unstableElements}; unstable cues ${unstableCues}; contrast-risk stress frames ${contrastRiskFrames}; stress frames with critical info lost ${contrastLossFrames}.`,
    ceiling,
  };
}

function summarizeColorOnlyMeaning(data: ObservationFile): LaneSummary {
  const cues = importantCues(data);
  const colorOnlyCues = cues.filter((cue) => cue.reliesOnColorAlone === true).length;
  const colorOnlyChannelRisk = data.channelSupport?.criticalInfoUsesColorOnly === true;
  const noBackup = data.channelSupport?.criticalInfoHasNonColorBackup === false;
  const agiRisk = data.agiSnapshot?.colorAlternatives?.colorOnlyRisk === true;
  const hasEvidence =
    cues.some((cue) => cue.reliesOnColorAlone !== undefined) ||
    data.channelSupport?.criticalInfoUsesColorOnly !== undefined ||
    data.channelSupport?.criticalInfoHasNonColorBackup !== undefined ||
    data.agiSnapshot?.colorAlternatives?.colorOnlyRisk !== undefined;

  let status: LaneStatus = "missing";
  if (!hasEvidence) {
    status = "missing";
  } else if (colorOnlyCues > 0 || colorOnlyChannelRisk || agiRisk || noBackup) {
    status = "fail";
  } else if (
    colorOnlyCues === 0 &&
    data.channelSupport?.criticalInfoUsesColorOnly === false &&
    data.channelSupport?.criticalInfoHasNonColorBackup !== false &&
    data.agiSnapshot?.colorAlternatives?.colorOnlyRisk !== true
  ) {
    status = "pass";
  } else {
    status = "partial";
  }

  const ceiling = hasEvidence
    ? "This is strong enough to flag color-only risk for later HUD or busy-frame work, but only across the sampled cues and channels."
    : "No color-reliance sample yet.";

  return {
    label: "Color-only meaning risk",
    status,
    evidence:
      `color-only cues ${colorOnlyCues}; channel-level color-only risk ${boolLabel(data.channelSupport?.criticalInfoUsesColorOnly)}; non-color backup ${boolLabel(data.channelSupport?.criticalInfoHasNonColorBackup)}; AGI color-only risk ${boolLabel(data.agiSnapshot?.colorAlternatives?.colorOnlyRisk)}.`,
    ceiling,
  };
}

function summarizeTextMotionRisk(data: ObservationFile): LaneSummary {
  const elements = importantElements(data);
  const cues = importantCues(data);
  const stressFrames = data.stressFrames ?? [];
  const clutter = data.clutter ?? {};
  const motionUnreadableElements = elements.filter((element) => element.readableUnderMotion === false).length;
  const motionUnreadableCues = cues.filter((cue) => cue.readableUnderMotion === false).length;
  const motionTaggedFrames = stressFrames.filter((frame) => (frame.tags ?? []).includes("motion-behind-text")).length;
  const motionMaskedFrames = stressFrames.filter(
    (frame) => frame.criticalElementsReadableUnderMotion === false || frame.cueMasked === true,
  ).length;
  const motionUiRisk =
    clutter.movingUiDistraction === true ||
    clutter.blinkingUiDistraction === true ||
    clutter.backgroundMotionDistractsRead === true;
  const hasEvidence =
    data.evidence?.sampledBusyFrames !== undefined ||
    stressFrames.length > 0 ||
    elements.some((element) => element.readableUnderMotion !== undefined) ||
    cues.some((cue) => cue.readableUnderMotion !== undefined) ||
    motionUiRisk;

  let status: LaneStatus = "missing";
  if (!hasEvidence) {
    status = "missing";
  } else if (motionTaggedFrames > 0 || motionMaskedFrames > 0 || motionUnreadableElements > 0 || motionUnreadableCues > 0) {
    status = "fail";
  } else if ((data.evidence?.sampledBusyFrames ?? 0) > 0 && motionUiRisk === false) {
    status = "pass";
  } else {
    status = "partial";
  }

  const ceiling = hasEvidence
    ? "This smoke is suited to HUD and busy-frame triage. It does not prove full XAG 117 settings compliance, especially for gameplay-core motion."
    : "No motion-pressure sample yet.";

  return {
    label: "Text over motion risk",
    status,
    evidence:
      `busy frames sampled ${data.evidence?.sampledBusyFrames ?? 0}; motion-behind-text frames ${motionTaggedFrames}; masked or unreadable motion frames ${motionMaskedFrames}; unreadable elements under motion ${motionUnreadableElements}; unreadable cues under motion ${motionUnreadableCues}; motion UI risk ${motionUiRisk ? "yes" : "no"}.`,
    ceiling,
  };
}

function buildFindings(data: ObservationFile, lanes: LaneSummary[]): Finding[] {
  const findings: Finding[] = [];
  const textLane = lanes.find((lane) => lane.label === "Text size and readability evidence");
  const contrastLane = lanes.find((lane) => lane.label === "Contrast and container support");
  const colorLane = lanes.find((lane) => lane.label === "Color-only meaning risk");
  const motionLane = lanes.find((lane) => lane.label === "Text over motion risk");

  if (textLane?.status === "fail") {
    findings.push({
      severity: "blocker",
      title: "critical text readability does not survive the sampled active-play context",
      evidence: textLane.evidence,
      nextStep: "Run HUD follow-up with a fresh screenshot or busy frame and tighten text scale, layout, or cue phrasing before deeper style work.",
    });
  } else if (textLane?.status === "partial") {
    findings.push({
      severity: "major",
      title: "text looks usable in smoke, but the evidence does not prove safe size under pressure",
      evidence: textLane.evidence,
      nextStep: "Treat this as observed readability only and add screenshot-backed size proof before claiming XAG 101-safe text.",
    });
  }

  if (contrastLane?.status === "fail") {
    findings.push({
      severity: "blocker",
      title: "contrast stability breaks before later HUD or busy-frame review can trust the read",
      evidence: contrastLane.evidence,
      nextStep: "Add or strengthen backdrop, outline, or contrast separation where the sampled text or cues wash into the background.",
    });
  } else if (contrastLane?.status === "partial") {
    findings.push({
      severity: "major",
      title: "contrast held only partially, so later HUD review should verify container support instead of assuming it",
      evidence: contrastLane.evidence,
      nextStep: "Log whether text survives because of a true contrast aid or only because the sampled frame stayed calm.",
    });
  }

  if (colorLane?.status === "fail") {
    findings.push({
      severity: "blocker",
      title: "sampled critical meaning still depends on color alone or lacks a dependable non-color backup",
      evidence: colorLane.evidence,
      nextStep: "Duplicate the meaning with text, iconography, shape, pattern, or another readable channel before later HUD polish.",
    });
  } else if (colorLane?.status === "partial") {
    findings.push({
      severity: "major",
      title: "color-risk evidence is incomplete, so later busy-frame work should recheck cue backup directly",
      evidence: colorLane.evidence,
      nextStep: "Capture one must-react cue and record whether a non-color backup still lands under pressure.",
    });
  }

  if (motionLane?.status === "fail") {
    findings.push({
      severity: "blocker",
      title: "text or cue readability collapses once motion and live overlays compete",
      evidence: motionLane.evidence,
      nextStep: "Use busy-frame follow-up next and reduce motion-behind-text, masking, or overlay competition before arguing about fine HUD taste.",
    });
  } else if (motionLane?.status === "partial") {
    findings.push({
      severity: "major",
      title: "motion risk remains under-sampled, so later HUD claims should stay narrow",
      evidence: motionLane.evidence,
      nextStep: "Capture at least one real busy frame before treating the current read as durable under live motion.",
    });
  }

  if (findings.length === 0) {
    findings.push({
      severity: "minor",
      title: "no blocker-grade text-and-motion breakdown was logged in the supplied sample",
      evidence: `runs sampled ${data.evidence?.sampledRuns ?? 0}; busy frames sampled ${data.evidence?.sampledBusyFrames ?? 0}.`,
      nextStep: "Use this as a smoke verdict only and deepen with HUD or busy-frame review if later pressure samples turn muddy.",
    });
  }

  return findings.sort((left, right) => severityRank(left.severity) - severityRank(right.severity));
}

function buildTemplate(): string {
  return [
    "# Text And Motion Smoke Template",
    "",
    "Use one captured playtest observation JSON.",
    "",
    "Checks:",
    "- text size and readability evidence",
    "- contrast stability and whether text likely needs a container or outline",
    "- color-only meaning risk",
    "- text-over-motion risk in busy frames",
    "",
    "Evidence ceiling:",
    "- this lane is a blocker-first smoke for HUD and busy-frame follow-up",
    "- it does not prove XAG pixel-size or settings compliance by itself",
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

function buildHandoffSection(lanes: LaneSummary[], data: ObservationFile): string[] {
  const textLane = lanes.find((lane) => lane.label === "Text size and readability evidence");
  const contrastLane = lanes.find((lane) => lane.label === "Contrast and container support");
  const motionLane = lanes.find((lane) => lane.label === "Text over motion risk");
  const colorLane = lanes.find((lane) => lane.label === "Color-only meaning risk");
  const nextSteps = new Set<string>();

  if ((data.evidence?.sampledBusyFrames ?? 0) === 0 || motionLane?.status === "partial" || motionLane?.status === "missing") {
    nextSteps.add("Capture one real busy frame before making broad HUD readability claims.");
  }
  if (textLane?.status !== "fail") {
    nextSteps.add("Keep later HUD language observational unless you also capture approximate text-size proof against XAG 101 minimums.");
  }
  if (contrastLane?.status !== "pass") {
    nextSteps.add("During HUD follow-up, log whether text survives because of a real backdrop or outline instead of a calm sampled frame.");
  }
  if (colorLane?.status !== "pass") {
    nextSteps.add("During busy-frame follow-up, recheck one must-react cue for non-color backup under pressure.");
  }
  if (nextSteps.size === 0) {
    nextSteps.add("This smoke is strong enough to feed later HUD and busy-frame prioritization without reopening the whole observation first.");
  }

  return Array.from(nextSteps).map((step) => `- ${step}`);
}

function buildNextSteps(findings: Finding[]): string[] {
  return Array.from(new Set(findings.map((finding) => finding.nextStep))).map((step) => `- ${step}`);
}

function buildSummary(data: ObservationFile) {
  const lanes = [
    summarizeTextReadability(data),
    summarizeContrastSupport(data),
    summarizeColorOnlyMeaning(data),
    summarizeTextMotionRisk(data),
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
    `# ${summary.game} Text And Motion Smoke`,
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
    "## HUD And Busy-Frame Handoff",
    "",
    ...buildHandoffSection(summary.lanes, data),
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

main();
