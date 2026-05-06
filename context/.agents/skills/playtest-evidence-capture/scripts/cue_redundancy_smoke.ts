import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type Severity = "blocker" | "major" | "minor";
type LaneStatus = "pass" | "partial" | "fail" | "missing";
type SignalChannel = "visual" | "audio" | "haptic" | "text";

type CueObservation = {
  name?: string;
  importance?: "critical" | "supporting" | "secondary";
  nearAction?: boolean;
  redundantSignal?: boolean;
  signalChannels?: SignalChannel[];
  reliesOnColorAlone?: boolean;
  reliesOnAudioAlone?: boolean;
};

type EphemeralMomentObservation = {
  name?: string;
  importance?: "critical" | "supporting" | "secondary";
  appearsNearAction?: boolean;
  reviewableLater?: boolean;
};

type CompetitionMomentObservation = {
  dominantReadClear?: boolean;
  responsePriorityClear?: boolean;
  nonCriticalUiCompeting?: boolean;
};

type StressFrameObservation = {
  criticalInfoLost?: boolean;
  cueMasked?: boolean;
};

type ChannelSupportObservation = {
  criticalInfoUsesColorOnly?: boolean;
  criticalInfoUsesAudioOnly?: boolean;
  muteCriticalInfoStillPlayable?: boolean;
  criticalInfoHasNonColorBackup?: boolean;
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
  cues?: CueObservation[];
  ephemeralMoments?: EphemeralMomentObservation[];
  competitionMoments?: CompetitionMomentObservation[];
  stressFrames?: StressFrameObservation[];
  channelSupport?: ChannelSupportObservation;
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

function essentialCues(data: ObservationFile): CueObservation[] {
  return (data.cues ?? []).filter((cue) => cue.importance === "critical");
}

function importantEphemeralMoments(data: ObservationFile): EphemeralMomentObservation[] {
  return (data.ephemeralMoments ?? []).filter((moment) => moment.importance !== "secondary");
}

function formatChannels(channels: SignalChannel[] | undefined): string {
  if (!channels || channels.length === 0) {
    return "unknown";
  }
  return channels.join(", ");
}

function cueHasOnlyChannel(cue: CueObservation, channel: SignalChannel): boolean {
  return cue.signalChannels?.length === 1 && cue.signalChannels[0] === channel;
}

function summarizeTextOnlyRisk(data: ObservationFile): LaneSummary {
  const cues = essentialCues(data);
  const textOnlyCues = cues.filter((cue) => cueHasOnlyChannel(cue, "text"));
  const cuesWithChannelLogs = cues.filter((cue) => cue.signalChannels !== undefined).length;
  const cuesWithoutRedundancy = cues.filter(
    (cue) => cue.redundantSignal === false && cue.signalChannels?.includes("text") === true,
  ).length;
  const hasEvidence = cues.length > 0 && (cuesWithChannelLogs > 0 || cues.some((cue) => cue.redundantSignal !== undefined));

  let status: LaneStatus = "missing";
  if (!hasEvidence) {
    status = "missing";
  } else if (textOnlyCues.length > 0) {
    status = "fail";
  } else if (cuesWithChannelLogs === cues.length && cuesWithoutRedundancy === 0) {
    status = "pass";
  } else {
    status = "partial";
  }

  return {
    label: "Text-only cue risk",
    status,
    evidence:
      `critical cues ${cues.length}; text-only critical cues ${textOnlyCues.length}; ` +
      `critical cues with channel logs ${cuesWithChannelLogs}; critical cues marked non-redundant while using text ${cuesWithoutRedundancy}.`,
    ceiling: hasEvidence
      ? "Observed cue-channel risk only. This lane can flag text-only dependence, not the full wording or reading-load quality of the text itself."
      : "No critical cue-channel sample yet.",
  };
}

function summarizeSoundOnlyRisk(data: ObservationFile): LaneSummary {
  const cues = essentialCues(data);
  const audioOnlyCues = cues.filter(
    (cue) => cue.reliesOnAudioAlone === true || cueHasOnlyChannel(cue, "audio"),
  );
  const channelSupport = data.channelSupport ?? {};
  const hasEvidence =
    cues.some((cue) => cue.reliesOnAudioAlone !== undefined || cue.signalChannels !== undefined) ||
    channelSupport.criticalInfoUsesAudioOnly !== undefined ||
    channelSupport.muteCriticalInfoStillPlayable !== undefined;

  let status: LaneStatus = "missing";
  if (!hasEvidence) {
    status = "missing";
  } else if (
    audioOnlyCues.length > 0 ||
    channelSupport.criticalInfoUsesAudioOnly === true ||
    channelSupport.muteCriticalInfoStillPlayable === false
  ) {
    status = "fail";
  } else if (
    channelSupport.criticalInfoUsesAudioOnly === false &&
    channelSupport.muteCriticalInfoStillPlayable !== false &&
    audioOnlyCues.length === 0
  ) {
    status = "pass";
  } else {
    status = "partial";
  }

  return {
    label: "Sound-only cue risk",
    status,
    evidence:
      `audio-only critical cues ${audioOnlyCues.length}; channel-level audio-only risk ${boolLabel(channelSupport.criticalInfoUsesAudioOnly)}; ` +
      `mute still playable ${boolLabel(channelSupport.muteCriticalInfoStillPlayable)}.`,
    ceiling: hasEvidence
      ? "Observed sound-channel risk only. A pass here means the sampled cues had non-audio support, not that every cue in the game was checked."
      : "No usable audio-fallback sample yet.",
  };
}

function summarizeColorOnlyRisk(data: ObservationFile): LaneSummary {
  const cues = essentialCues(data);
  const colorOnlyCues = cues.filter((cue) => cue.reliesOnColorAlone === true);
  const channelSupport = data.channelSupport ?? {};
  const hasEvidence =
    cues.some((cue) => cue.reliesOnColorAlone !== undefined || cue.signalChannels !== undefined) ||
    channelSupport.criticalInfoUsesColorOnly !== undefined ||
    channelSupport.criticalInfoHasNonColorBackup !== undefined;

  let status: LaneStatus = "missing";
  if (!hasEvidence) {
    status = "missing";
  } else if (
    colorOnlyCues.length > 0 ||
    channelSupport.criticalInfoUsesColorOnly === true ||
    channelSupport.criticalInfoHasNonColorBackup === false
  ) {
    status = "fail";
  } else if (
    channelSupport.criticalInfoUsesColorOnly === false &&
    channelSupport.criticalInfoHasNonColorBackup !== false &&
    colorOnlyCues.length === 0
  ) {
    status = "pass";
  } else {
    status = "partial";
  }

  return {
    label: "Color-only cue risk",
    status,
    evidence:
      `color-only critical cues ${colorOnlyCues.length}; channel-level color-only risk ${boolLabel(channelSupport.criticalInfoUsesColorOnly)}; ` +
      `non-color backup ${boolLabel(channelSupport.criticalInfoHasNonColorBackup)}.`,
    ceiling: hasEvidence
      ? "Observed color-fallback risk only. A pass still needs later pressure sampling if busy-frame overlap changes the read."
      : "No usable color-fallback sample yet.",
  };
}

function summarizeEdgeOnlyRisk(data: ObservationFile): LaneSummary {
  const cues = essentialCues(data);
  const importantEphemeral = importantEphemeralMoments(data);
  const edgeCues = cues.filter((cue) => cue.nearAction === false);
  const edgeEphemeral = importantEphemeral.filter(
    (moment) => moment.appearsNearAction === false && moment.reviewableLater !== true,
  );
  const competitionMoments = data.competitionMoments ?? [];
  const stressFrames = data.stressFrames ?? [];
  const hasEvidence =
    cues.some((cue) => cue.nearAction !== undefined) ||
    importantEphemeral.some((moment) => moment.appearsNearAction !== undefined || moment.reviewableLater !== undefined);

  const stressedBreakdown =
    competitionMoments.some(
      (moment) =>
        moment.dominantReadClear === false ||
        moment.responsePriorityClear === false ||
        moment.nonCriticalUiCompeting === true,
    ) || stressFrames.some((frame) => frame.cueMasked === true || frame.criticalInfoLost === true);

  let status: LaneStatus = "missing";
  if (!hasEvidence) {
    status = "missing";
  } else if (edgeCues.length > 0 || edgeEphemeral.length > 0) {
    status = stressedBreakdown ? "fail" : "partial";
  } else if (cues.length > 0 && edgeEphemeral.length === 0) {
    status = "pass";
  } else {
    status = "partial";
  }

  return {
    label: "Edge-only cue risk",
    status,
    evidence:
      `critical cues away from action ${edgeCues.length}/${cues.length}; important temporary prompts away from action and not reviewable later ${edgeEphemeral.length}; ` +
      `stressed overlap or masking logged ${stressedBreakdown ? "yes" : "no"}.`,
    ceiling: hasEvidence
      ? "Observed placement risk only. This lane flags cues that live away from focal action or only on edge prompts, not every layout nuance."
      : "No usable cue-placement sample yet.",
  };
}

function buildFindings(data: ObservationFile, lanes: LaneSummary[]): Finding[] {
  const findings: Finding[] = [];
  const textLane = lanes.find((lane) => lane.label === "Text-only cue risk");
  const soundLane = lanes.find((lane) => lane.label === "Sound-only cue risk");
  const colorLane = lanes.find((lane) => lane.label === "Color-only cue risk");
  const edgeLane = lanes.find((lane) => lane.label === "Edge-only cue risk");
  const cues = essentialCues(data);

  if (textLane?.status === "fail") {
    findings.push({
      severity: "blocker",
      title: "sampled critical cue depends on text alone instead of a faster backup read",
      evidence: textLane.evidence,
      nextStep: "Add a non-text backup such as iconography, shape, motion, or another immediate channel before deeper onboarding or HUD polish.",
    });
  } else if (textLane?.status === "partial") {
    findings.push({
      severity: "major",
      title: "text-only cue risk stays under-logged, so later audit claims should stay narrow",
      evidence: textLane.evidence,
      nextStep: "Log channel lists and redundancy directly for at least one must-react cue before treating the current cue stack as durable.",
    });
  }

  if (soundLane?.status === "fail") {
    findings.push({
      severity: "blocker",
      title: "sampled critical cue can fail under mute or low-audio play",
      evidence: soundLane.evidence,
      nextStep: "Duplicate the meaning with visible, near-action support before relying on sound for the warning or state change.",
    });
  } else if (soundLane?.status === "partial") {
    findings.push({
      severity: "major",
      title: "sound fallback evidence is incomplete, so audio fragility is still unresolved",
      evidence: soundLane.evidence,
      nextStep: "Check one must-react cue with mute-safe backup and record whether the same meaning still lands without audio.",
    });
  }

  if (colorLane?.status === "fail") {
    findings.push({
      severity: "blocker",
      title: "sampled critical cue still depends on color alone or lacks dependable non-color backup",
      evidence: colorLane.evidence,
      nextStep: "Duplicate the meaning with text, shape, iconography, or pattern before later busy-frame or telegraph work.",
    });
  } else if (colorLane?.status === "partial") {
    findings.push({
      severity: "major",
      title: "color-fallback evidence is incomplete, so later cue readability claims need direct backup proof",
      evidence: colorLane.evidence,
      nextStep: "Record whether one must-react cue still reads without relying on color distinction alone.",
    });
  }

  if (edgeLane?.status === "fail") {
    findings.push({
      severity: "blocker",
      title: "sampled essential cue lives too far from the action and breaks down under pressure",
      evidence: edgeLane.evidence,
      nextStep: "Move or duplicate the cue nearer the focal action, or add an earlier in-world telegraph so the player does not have to scan edge UI mid-response.",
    });
  } else if (edgeLane?.status === "partial") {
    findings.push({
      severity: "major",
      title: "cue placement still leans on edge scanning or unreopenable prompts",
      evidence: edgeLane.evidence,
      nextStep: "Recheck one must-react cue during a stressed moment and log whether the read survives without leaving the action space.",
    });
  }

  if (findings.length === 0) {
    findings.push({
      severity: "minor",
      title: "no blocker-grade cue redundancy breakdown was logged in the supplied sample",
      evidence: `critical cues sampled ${cues.length}; busy frames sampled ${data.evidence?.sampledBusyFrames ?? 0}.`,
      nextStep: "Use this as a smoke verdict only and deepen with telegraph, HUD, or onboarding review if later evidence turns muddy.",
    });
  }

  return findings.sort((left, right) => severityRank(left.severity) - severityRank(right.severity));
}

function buildTemplate(): string {
  return [
    "# Cue Redundancy Smoke Template",
    "",
    "Use one captured playtest observation JSON.",
    "",
    "Checks:",
    "- text-only cue risk",
    "- sound-only cue risk",
    "- color-only cue risk",
    "- edge-only cue risk",
    "",
    "Evidence ceiling:",
    "- this lane is a blocker-first smoke for onboarding, HUD, and telegraph follow-up",
    "- it does not replace a deeper telegraph, onboarding, or HUD audit",
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

function buildCueDetailSection(data: ObservationFile): string[] {
  const cues = essentialCues(data);
  if (cues.length === 0) {
    return ["- No critical cue rows logged yet."];
  }

  return cues.map(
    (cue) =>
      `- ${cue.name ?? "unnamed"}: channels=${formatChannels(cue.signalChannels)}; redundant=${boolLabel(cue.redundantSignal)}; ` +
      `near action=${boolLabel(cue.nearAction)}; color-only=${boolLabel(cue.reliesOnColorAlone)}; audio-only=${boolLabel(cue.reliesOnAudioAlone)}.`,
  );
}

function buildHandoffSection(lanes: LaneSummary[]): string[] {
  const nextSteps = new Set<string>();
  const edgeLane = lanes.find((lane) => lane.label === "Edge-only cue risk");
  const textLane = lanes.find((lane) => lane.label === "Text-only cue risk");
  const soundLane = lanes.find((lane) => lane.label === "Sound-only cue risk");
  const colorLane = lanes.find((lane) => lane.label === "Color-only cue risk");

  if (textLane?.status !== "pass") {
    nextSteps.add("Before later onboarding or HUD claims, log whether the critical cue still reads without relying on prose alone.");
  }
  if (soundLane?.status !== "pass") {
    nextSteps.add("Before later telegraph claims, verify one must-react cue still lands on mute or without depending on sound alone.");
  }
  if (colorLane?.status !== "pass") {
    nextSteps.add("Before later busy-frame claims, verify one must-react cue still lands without color distinction alone.");
  }
  if (edgeLane?.status !== "pass") {
    nextSteps.add("Before later HUD or telegraph claims, verify the player does not need to leave focal action to recover the critical read.");
  }
  if (nextSteps.size === 0) {
    nextSteps.add("This smoke is strong enough to feed later onboarding, HUD, or telegraph prioritization without reopening the whole observation first.");
  }

  return Array.from(nextSteps).map((step) => `- ${step}`);
}

function buildNextSteps(findings: Finding[]): string[] {
  return Array.from(new Set(findings.map((finding) => finding.nextStep))).map((step) => `- ${step}`);
}

function buildSummary(data: ObservationFile) {
  const lanes = [
    summarizeTextOnlyRisk(data),
    summarizeSoundOnlyRisk(data),
    summarizeColorOnlyRisk(data),
    summarizeEdgeOnlyRisk(data),
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
    `# ${summary.game} Cue Redundancy Smoke`,
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
    "## Cue Detail",
    "",
    ...buildCueDetailSection(data),
    "",
    "## Onboarding HUD Telegraph Handoff",
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

main();
