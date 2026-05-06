import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type Severity = "blocker" | "major" | "minor";

type TelegraphCueObservation = {
  name?: string;
  importance?: "critical" | "supporting" | "secondary";
  nearAction?: boolean;
  telegraphReadable?: boolean;
  requiredResponseObvious?: boolean;
  futurePathVisible?: boolean;
  contrastStable?: boolean;
  readableUnderMotion?: boolean;
  motionDistraction?: "none" | "low" | "medium" | "high";
  signalChannels?: ("visual" | "audio" | "haptic" | "text")[];
  reliesOnColorAlone?: boolean;
  reliesOnAudioAlone?: boolean;
  notes?: string;
};

type StressFrameObservation = {
  moment?: string;
  clutterSource?: string;
  movingBackground?: boolean;
  blinkingContent?: boolean;
  autoUpdatingContent?: boolean;
  cameraMotion?: boolean;
  criticalInfoLost?: boolean;
  cueMasked?: boolean;
  responseStillReadable?: boolean;
  criticalElementsReadableUnderMotion?: boolean;
  notes?: string;
};

type CompetitionMomentObservation = {
  moment?: string;
  signals?: string[];
  urgentSignalCount?: number;
  dominantReadClear?: boolean;
  responsePriorityClear?: boolean;
  nonCriticalUiCompeting?: boolean;
  notes?: string;
};

type ResumeProbeObservation = {
  breakType?: "pause" | "tab-switch" | "after-failure" | "return-later";
  secondsAway?: number;
  resumeSurface?: string;
  currentGoalRecoverable?: boolean;
  controlsRecoverable?: boolean;
  nextActionClear?: boolean;
  needsMenuDive?: boolean;
  stalePromptMismatch?: boolean;
  notes?: string;
};

type TelegraphObservationInput = {
  mode?: string;
  sampledRuns?: number;
  sampledBusyFrames?: number;
  sampledContacts?: number;
  sampledResumeProbes?: number;
  notes?: string[];
  telegraphCues?: TelegraphCueObservation[];
  telegraphReadings?: (TelegraphCueObservation & {
    dangerousSpace?: string;
    impliedResponse?: string;
    timingReadabilityConfidence?: "high" | "partial" | "low";
  })[];
  evidence?: {
    mode?: string;
    sampledRuns?: number;
    sampledBusyFrames?: number;
    sampledContacts?: number;
    sampledResumeProbes?: number;
    notes?: string[];
  };
  stressFrames?: StressFrameObservation[];
  competitionMoments?: CompetitionMomentObservation[];
  resumeProbes?: ResumeProbeObservation[];
};

type Finding = {
  severity: Severity;
  title: string;
  detail: string;
};

const args = process.argv.slice(2);
const templateOnly = args.includes("--template");
const observationsPath = readFlagValue(args, "--observations");
const outPath = readFlagValue(args, "--out");

if (!templateOnly && !observationsPath) {
  process.stderr.write("Missing --observations <path>\n");
  process.exit(1);
}

const input = observationsPath ? readInput(observationsPath) : undefined;
const report = templateOnly ? buildTemplate() : buildReport(input!);

if (outPath) {
  writeFileSync(resolve(outPath), report + "\n", "utf8");
} else {
  process.stdout.write(report + "\n");
}

if (input) {
  const learningLine = buildLearningLine(input);
  const learningPath = resolve(dirname(fileURLToPath(import.meta.url)), "..", "LEARNINGS.md");
  const current = readFileSync(learningPath, "utf8");
  if (!current.includes(learningLine)) {
    const next = current.trimEnd() + "\n" + learningLine + "\n";
    writeFileSync(learningPath, next, "utf8");
  }
}

function readInput(observationsPath: string): TelegraphObservationInput {
  const raw = readFileSync(resolve(observationsPath), "utf8").replace(/^\uFEFF/, "");
  return normalizeInput(JSON.parse(raw) as TelegraphObservationInput);
}

function normalizeInput(input: TelegraphObservationInput): TelegraphObservationInput {
  const evidence = input.evidence ?? {};
  const telegraphReadings = input.telegraphReadings ?? [];
  const telegraphCues =
    input.telegraphCues ??
    telegraphReadings.map((reading) => ({
      name: reading.name,
      importance: reading.importance,
      nearAction: reading.nearAction,
      telegraphReadable: reading.telegraphReadable,
      requiredResponseObvious:
        reading.requiredResponseObvious ??
        (reading.impliedResponse === "clear" ? true : reading.impliedResponse === "unclear" ? false : undefined),
      futurePathVisible: reading.futurePathVisible,
      contrastStable: reading.contrastStable,
      readableUnderMotion: reading.readableUnderMotion,
      motionDistraction: reading.motionDistraction,
      signalChannels: reading.signalChannels,
      reliesOnColorAlone: reading.reliesOnColorAlone,
      reliesOnAudioAlone: reading.reliesOnAudioAlone,
      notes: reading.notes ?? reading.dangerousSpace,
    }));

  return {
    ...input,
    mode: input.mode ?? evidence.mode,
    sampledRuns: input.sampledRuns ?? evidence.sampledRuns,
    sampledBusyFrames: input.sampledBusyFrames ?? evidence.sampledBusyFrames,
    sampledContacts: input.sampledContacts ?? evidence.sampledContacts,
    sampledResumeProbes: input.sampledResumeProbes ?? evidence.sampledResumeProbes,
    notes: input.notes ?? evidence.notes,
    telegraphCues,
  };
}

function buildTemplate(): string {
  return [
    "# Telegraphing Readability Audit",
    "",
    "## Source Summary",
    "- Mode: <mode>",
    "- Sampled runs: <count>",
    "- Telegraph cues: <count>",
    "- Stress frames: <count>",
    "- Competition moments: <count>",
    "- Resume probes: <count>",
    "",
    "## Blocker Findings",
    "- None yet.",
    "",
    "## Major Findings",
    "- None yet.",
    "",
    "## Minor Findings",
    "- None yet.",
    "",
    "## Cue Notes",
    "- <cue name>: readable=<yes/no>, response=<yes/no>, path=<yes/no>",
    "",
    "## Stress Frames",
    "- <moment>: masked=<yes/no>, lost=<yes/no>, readable=<yes/no>",
    "",
    "## Competition Moments",
    "- <moment>: signals=<list>, priority=<yes/no>",
    "",
    "## Resume Probes",
    "- <break type>: goal=<yes/no>, controls=<yes/no>, next=<yes/no>",
    "",
    "## Durable Learning",
    "- <one reusable learning line>",
  ].join("\n");
}

function buildReport(input: TelegraphObservationInput): string {
  const findings = collectFindings(input);
  const cues = input.telegraphCues ?? [];
  const stressFrames = input.stressFrames ?? [];
  const competitionMoments = input.competitionMoments ?? [];
  const resumeProbes = input.resumeProbes ?? [];

  const lines: string[] = [];
  lines.push("# Telegraphing Readability Audit");
  lines.push("");
  lines.push("## Source Summary");
  lines.push(`- Mode: ${input.mode ?? "unspecified"}`);
  lines.push(`- Sampled runs: ${input.sampledRuns ?? "unspecified"}`);
  lines.push(`- Telegraph cues: ${cues.length}`);
  lines.push(`- Stress frames: ${stressFrames.length}`);
  lines.push(`- Competition moments: ${competitionMoments.length}`);
  lines.push(`- Resume probes: ${resumeProbes.length}`);
  if (input.notes?.length) {
    lines.push(`- Notes: ${input.notes.join("; ")}`);
  }
  lines.push("");
  lines.push("## Blocker Findings");
  pushFindingLines(lines, findings.filter((f) => f.severity === "blocker"));
  lines.push("");
  lines.push("## Major Findings");
  pushFindingLines(lines, findings.filter((f) => f.severity === "major"));
  lines.push("");
  lines.push("## Minor Findings");
  pushFindingLines(lines, findings.filter((f) => f.severity === "minor"));
  lines.push("");
  lines.push("## Cue Notes");
  if (!cues.length) {
    lines.push("- No cue observations supplied.");
  } else {
    for (const cue of cues) lines.push(renderCue(cue));
  }
  lines.push("");
  lines.push("## Stress Frames");
  if (!stressFrames.length) {
    lines.push("- No stress frames supplied.");
  } else {
    for (const frame of stressFrames) lines.push(renderStressFrame(frame));
  }
  lines.push("");
  lines.push("## Competition Moments");
  if (!competitionMoments.length) {
    lines.push("- No competition moments supplied.");
  } else {
    for (const moment of competitionMoments) lines.push(renderCompetitionMoment(moment));
  }
  lines.push("");
  lines.push("## Resume Probes");
  if (!resumeProbes.length) {
    lines.push("- No resume probes supplied.");
  } else {
    for (const probe of resumeProbes) lines.push(renderResumeProbe(probe));
  }
  lines.push("");
  lines.push("## Durable Learning");
  lines.push(buildLearningLine(input));

  return lines.join("\n");
}

function collectFindings(input: TelegraphObservationInput): Finding[] {
  const findings: Finding[] = [];
  for (const cue of input.telegraphCues ?? []) {
    const label = cue.name ?? "Unnamed cue";
    if (cue.nearAction && cue.telegraphReadable === false) {
      findings.push({
        severity: "blocker",
        title: `${label}: cue not readable near action`,
        detail: "A must-react cue sits near play but does not read clearly enough to support response timing.",
      });
    }
    if (cue.requiredResponseObvious === false) {
      findings.push({
        severity: "major",
        title: `${label}: required response unclear`,
        detail: "The player can see a signal, but the next move is still ambiguous.",
      });
    }
    if (cue.futurePathVisible === false) {
      findings.push({
        severity: "major",
        title: `${label}: future path not visible`,
        detail: "The cue does not expose the danger line, route, or collision path early enough for choice.",
      });
    }
    if (cue.reliesOnColorAlone || cue.reliesOnAudioAlone) {
      findings.push({
        severity: "minor",
        title: `${label}: cue depends on one channel`,
        detail: "The signal should survive mute, ambiguity, or screen noise through redundant shape or position cues.",
      });
    }
  }
  for (const frame of input.stressFrames ?? []) {
    if (frame.cueMasked || frame.criticalInfoLost) {
      findings.push({
        severity: "major",
        title: `Stress frame: ${frame.moment ?? "unspecified"} hides the cue`,
        detail: "Motion, clutter, or overlap is degrading the read at the exact point of decision.",
      });
    }
  }
  for (const moment of input.competitionMoments ?? []) {
    if (moment.responsePriorityClear === false && (moment.urgentSignalCount ?? 0) > 1) {
      findings.push({
        severity: "major",
        title: `Competition moment: response priority is muddy`,
        detail: "Several signals compete at once, but the needed action is not ranked clearly enough.",
      });
    }
  }
  for (const probe of input.resumeProbes ?? []) {
    if (probe.nextActionClear === false || probe.controlsRecoverable === false) {
      findings.push({
        severity: "blocker",
        title: `Resume probe: re-entry loses the current action`,
        detail: "After a break, the player cannot recover the cue context fast enough to re-enter cleanly.",
      });
    }
  }
  return findings;
}

function renderCue(cue: TelegraphCueObservation): string {
  return `- ${cue.name ?? "Unnamed cue"}: readable=${boolWord(cue.telegraphReadable)}, response=${boolWord(cue.requiredResponseObvious)}, path=${boolWord(cue.futurePathVisible)}, motion=${cue.motionDistraction ?? "unspecified"}`;
}

function renderStressFrame(frame: StressFrameObservation): string {
  return `- ${frame.moment ?? "unspecified"}: masked=${boolWord(frame.cueMasked)}, lost=${boolWord(frame.criticalInfoLost)}, readable=${boolWord(frame.responseStillReadable)}`;
}

function renderCompetitionMoment(moment: CompetitionMomentObservation): string {
  return `- ${moment.moment ?? "unspecified"}: signals=${moment.signals?.join(", ") ?? "unspecified"}, priority=${boolWord(moment.responsePriorityClear)}`;
}

function renderResumeProbe(probe: ResumeProbeObservation): string {
  return `- ${probe.breakType ?? "unspecified"}: goal=${boolWord(probe.currentGoalRecoverable)}, controls=${boolWord(probe.controlsRecoverable)}, next=${boolWord(probe.nextActionClear)}`;
}

function buildLearningLine(input: TelegraphObservationInput): string {
  const hasBlockerRisk = (input.telegraphCues ?? []).some((cue) => cue.nearAction && cue.telegraphReadable === false);
  const hasPathRisk = (input.telegraphCues ?? []).some((cue) => cue.futurePathVisible === false);
  if (hasBlockerRisk) {
    return "- Telegraphs near the action must stay readable first, because late or muddy cues turn a reaction test into a guess.";
  }
  if (hasPathRisk) {
    return "- Telegraphs should expose the future path early, because a cue without the collision line still leaves the player guessing.";
  }
  return "- Telegraph audits should keep shape, timing, and path in the same read, because one clear signal is safer than a separate warning and response guess.";
}

function pushFindingLines(lines: string[], findings: Finding[]): void {
  if (!findings.length) {
    lines.push("- None.");
    return;
  }
  for (const finding of findings) {
    lines.push(`- ${finding.title}: ${finding.detail}`);
  }
}

function boolWord(value?: boolean): string {
  if (value === true) return "yes";
  if (value === false) return "no";
  return "unknown";
}

function readFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  return args[index + 1];
}
