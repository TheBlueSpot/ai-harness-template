import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  buildStarterGuardrailSection,
  getStarterCoverageStatus,
  getStarterNextEvidence,
  type ClaimGuardrail,
  type EvidenceSufficiency,
} from "./starter_guardrails";

type Severity = "blocker" | "major" | "minor";

type ProgressCheckpointObservation = {
  label?: string;
  kind?: "objective" | "prerequisite" | "unlock" | "upgrade" | "stage";
  progressVisible?: boolean;
  currentValue?: number | string;
  targetValue?: number | string;
  remainingWorkClear?: boolean;
  notes?: string;
};

type ProgressionObservation = {
  proximalGoalVisible?: boolean;
  goalHorizon?: "immediate" | "short" | "distant";
  prerequisiteProgressVisible?: boolean;
  prerequisiteCountsConcrete?: boolean;
  progressRemindersAvailable?: boolean;
  goalUpdatesTimely?: boolean;
  evaluativeReadbackPresent?: boolean;
  evaluativeReadbackAvailable?: boolean;
  readbackNamesWhatImproved?: boolean;
  nextStepGuidanceClear?: boolean;
  nextStepGuidanceNonComparative?: boolean;
  nonComparativeNextStepVisible?: boolean;
  comparativePressurePresent?: boolean;
  notes?: string;
  checkpoints?: ProgressCheckpointObservation[];
};

type FirstContactObservation = {
  currentGoalEasyToRestate?: boolean;
  nextStepPrescriptive?: boolean;
  objectiveReminderAvailable?: boolean;
  progressSafeHelp?: boolean;
};

type MasteryObservation = {
  proximalGoalVisible?: boolean;
  progressLegible?: boolean;
  progressRemindersAvailable?: boolean;
  failureImprovementVisible?: boolean;
};

type FailureObservation = {
  at?: string;
  causeReadable?: boolean;
  correctiveActionClear?: boolean;
  retryContextStable?: boolean;
  notes?: string;
};

type ResumeProbeObservation = {
  breakType?: "pause" | "tab-switch" | "after-failure" | "return-later";
  currentGoalRecoverable?: boolean;
  nextActionClear?: boolean;
  needsMenuDive?: boolean;
  notes?: string;
};

type ProbeOutcomeObservation = {
  probe?: "first-contact" | "busy-frame" | "fail-retry" | "interruption-resume" | "contact-payoff";
  outcome?: "success" | "partial" | "failed";
  successRating?: number;
  confidence?: number;
  satisfaction?: number;
  frustration?: number;
  mentalDemand?: number;
  timePressure?: number;
  effort?: number;
  blockers?: string[];
  notes?: string;
};

type IncidentObservation = {
  incidentTag?: string;
  title?: string;
  repeatedCount?: number;
  impact?: "low" | "medium" | "high";
  persistence?: "one-off" | "repeatable" | "constant";
  playerCost?: ("confusion" | "damage" | "death" | "dead-time" | "lost-reward" | "attention-tax")[];
  nextCheck?: string;
  notes?: string;
};

type ConfounderObservation = {
  inputCertainty?: "stable" | "minor-slip" | "major-slip";
  responseLatency?: "stable" | "borderline" | "late";
  cameraSupportsAction?: boolean;
  viewObstructedAtDecision?: boolean;
  autoCameraInterference?: boolean;
  notes?: string;
};

type EvidenceObservation = {
  mode?: "direct-play" | "captured-video" | "code-inference" | "mixed";
  sampledRuns?: number;
  sampledFailures?: number;
  sampledRetries?: number;
  sampledResumeProbes?: number;
  notes?: string[];
};

type ObservationFile = {
  game?: string;
  sessionDate?: string;
  firstContact?: FirstContactObservation;
  mastery?: MasteryObservation;
  progression?: ProgressionObservation;
  readableProgression?: ProgressionObservation;
  failures?: FailureObservation[];
  resumeProbes?: ResumeProbeObservation[];
  probeOutcomes?: ProbeOutcomeObservation[];
  incidents?: IncidentObservation[];
  confounders?: ConfounderObservation;
  evidence?: EvidenceObservation;
  evidenceSufficiency?: EvidenceSufficiency;
  claimGuardrail?: ClaimGuardrail;
  strengths?: string[];
  frictions?: string[];
};

type CliOptions = {
  observations?: string;
  out?: string;
  template: boolean;
};

type Finding = {
  severity: Severity;
  title: string;
  evidence: string;
  nextStep: string;
};

const skillLearningPath = resolve(__dirname, "..", "LEARNINGS.md");

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { template: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--template") {
      options.template = true;
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

function formatRating(value: number | undefined, max: number, suffix = ""): string {
  return typeof value === "number" ? `${value}/${max}${suffix}` : "unknown";
}

function severityRank(severity: Severity): number {
  if (severity === "blocker") {
    return 0;
  }
  if (severity === "major") {
    return 1;
  }
  return 2;
}

function getProgression(data: ObservationFile): ProgressionObservation {
  const progression = data.progression ?? data.readableProgression ?? {};

  return {
    ...progression,
    evaluativeReadbackPresent:
      progression.evaluativeReadbackPresent ?? progression.evaluativeReadbackAvailable,
    nextStepGuidanceClear:
      progression.nextStepGuidanceClear ??
      progression.nonComparativeNextStepVisible ??
      data.firstContact?.nextStepPrescriptive,
    nextStepGuidanceNonComparative:
      progression.nextStepGuidanceNonComparative ?? progression.nonComparativeNextStepVisible,
  };
}

function buildTemplate(): string {
  return [
    "# Readable Progression Audit Template",
    "",
    "Use during a short opening plus one progress-relevant success or fail-retry sample when possible.",
    "",
    "## Core Checks",
    "",
    "- One reachable short-range goal stays visible during play or on-demand review.",
    "- Prerequisite progress is concrete enough to guide effort, not just implied.",
    "- Progress feedback says what improved or what remains, not only that progress happened.",
    "- Next-step guidance is actionable and self-referenced instead of comparative or leaderboard-driven.",
    "- Current goal and progress can be recovered after a short break.",
    "",
    "## Observation JSON",
    "",
    "```json",
    JSON.stringify(
      {
        game: "some-game",
        sessionDate: "2026-05-02",
        firstContact: {
          currentGoalEasyToRestate: true,
          nextStepPrescriptive: true,
          objectiveReminderAvailable: true,
          progressSafeHelp: true,
        },
        mastery: {
          proximalGoalVisible: true,
          progressLegible: true,
          progressRemindersAvailable: true,
          failureImprovementVisible: true,
        },
        progression: {
          proximalGoalVisible: true,
          goalHorizon: "short",
          prerequisiteProgressVisible: true,
          prerequisiteCountsConcrete: true,
          progressRemindersAvailable: true,
          goalUpdatesTimely: true,
          evaluativeReadbackPresent: true,
          readbackNamesWhatImproved: true,
          nextStepGuidanceClear: true,
          nextStepGuidanceNonComparative: true,
          comparativePressurePresent: false,
          notes: "player sees the next badge threshold, current collectible count, and one concrete action to finish the opener",
          checkpoints: [
            {
              label: "switches opened",
              kind: "prerequisite",
              progressVisible: true,
              currentValue: 2,
              targetValue: 3,
              remainingWorkClear: true,
              notes: "remaining requirement is explicit during live play",
            },
          ],
        },
        failures: [
          {
            at: "00:34",
            causeReadable: true,
            correctiveActionClear: true,
            retryContextStable: true,
            notes: "failure message says one switch remains and points back to the locked route",
          },
        ],
        resumeProbes: [
          {
            breakType: "tab-switch",
            currentGoalRecoverable: true,
            nextActionClear: true,
            needsMenuDive: false,
            notes: "return path still shows the next requirement and marker",
          },
        ],
        probeOutcomes: [
          {
            probe: "first-contact",
            outcome: "success",
            successRating: 4,
            confidence: 6,
            satisfaction: 6,
            frustration: 2,
            mentalDemand: 3,
            timePressure: 3,
            effort: 3,
            blockers: [],
            notes: "opening goal and next step are both easy to restate",
          },
        ],
        confounders: {
          inputCertainty: "stable",
          responseLatency: "stable",
          cameraSupportsAction: true,
          viewObstructedAtDecision: false,
          autoCameraInterference: false,
          notes: "progression read was not distorted by control or camera trouble",
        },
        evidence: {
          mode: "direct-play",
          sampledRuns: 2,
          sampledFailures: 1,
          sampledRetries: 1,
          sampledResumeProbes: 1,
          notes: ["captured first minute plus one fail-retry around the first gated requirement"],
        },
        strengths: ["current requirement and remaining count stay visible"],
        frictions: ["no optional deeper progress review beyond the active goal"],
      },
      null,
      2,
    ),
    "```",
    "",
  ].join("\n");
}

function buildFindings(data: ObservationFile): Finding[] {
  const progression = getProgression(data);
  const firstContact = data.firstContact ?? {};
  const mastery = data.mastery ?? {};
  const failures = data.failures ?? [];
  const resumeProbes = data.resumeProbes ?? [];
  const confounders = data.confounders ?? {};
  const checkpoints = progression.checkpoints ?? [];
  const findings: Finding[] = [];

  if (
    progression.proximalGoalVisible === false ||
    firstContact.currentGoalEasyToRestate === false ||
    progression.nextStepGuidanceClear === false ||
    firstContact.nextStepPrescriptive === false
  ) {
    findings.push({
      severity: "blocker",
      title: "next reachable goal is not readable enough to guide effort",
      evidence:
        `proximal goal visible ${boolLabel(progression.proximalGoalVisible ?? mastery.proximalGoalVisible)}; current goal restatable ${boolLabel(firstContact.currentGoalEasyToRestate)}; next-step guidance clear ${boolLabel(progression.nextStepGuidanceClear ?? firstContact.nextStepPrescriptive)}.`,
      nextStep: "Expose one reachable short goal and one concrete next action during play or on-demand review so the player can say what to do next without guessing.",
    });
  }

  if (
    progression.prerequisiteProgressVisible === false ||
    progression.prerequisiteCountsConcrete === false ||
    checkpoints.some(
      (checkpoint) => checkpoint.progressVisible === false || checkpoint.remainingWorkClear === false,
    )
  ) {
    findings.push({
      severity: "major",
      title: "prerequisite progress is too vague to steer the next attempt",
      evidence:
        `prerequisite progress visible ${boolLabel(progression.prerequisiteProgressVisible)}; prerequisite counts concrete ${boolLabel(progression.prerequisiteCountsConcrete)}; weak checkpoint rows ${checkpoints.filter((checkpoint) => checkpoint.progressVisible === false || checkpoint.remainingWorkClear === false).length}.`,
      nextStep: "Show remaining requirements with concrete counts, states, or named blockers so progress is actionable instead of atmospheric.",
    });
  }

  if (
    progression.evaluativeReadbackPresent === false ||
    progression.readbackNamesWhatImproved === false ||
    (failures.length > 0 &&
      failures.some((failure) => failure.causeReadable === false || failure.correctiveActionClear === false))
  ) {
    findings.push({
      severity: "major",
      title: "progress readback does not explain what changed or what to correct",
      evidence:
        `evaluative readback present ${boolLabel(progression.evaluativeReadbackPresent)}; readback names improvement ${boolLabel(progression.readbackNamesWhatImproved ?? mastery.failureImprovementVisible)}; unreadable failure readback samples ${failures.filter((failure) => failure.causeReadable === false || failure.correctiveActionClear === false).length}.`,
      nextStep: "Make progress feedback name what improved, what remains blocked, or what to try next instead of only celebrating completion or failure.",
    });
  }

  if (
    progression.nextStepGuidanceNonComparative === false ||
    progression.comparativePressurePresent === true
  ) {
    findings.push({
      severity: "major",
      title: "next-step guidance leans on comparative pressure instead of self-referenced progress",
      evidence:
        `next-step guidance non-comparative ${boolLabel(progression.nextStepGuidanceNonComparative)}; comparative pressure present ${boolLabel(progression.comparativePressurePresent)}.`,
      nextStep: "Bias guidance toward the player's own remaining requirement, next threshold, or immediate correction instead of leaderboard or peer-comparison framing.",
    });
  }

  if (
    progression.progressRemindersAvailable === false ||
    mastery.progressRemindersAvailable === false ||
    firstContact.objectiveReminderAvailable === false ||
    resumeProbes.some(
      (probe) =>
        probe.currentGoalRecoverable === false ||
        probe.nextActionClear === false ||
        probe.needsMenuDive === true,
    )
  ) {
    findings.push({
      severity: "major",
      title: "progress reminder recovery is too expensive after a short break",
      evidence:
        `progress reminders ${boolLabel(progression.progressRemindersAvailable ?? mastery.progressRemindersAvailable)}; objective reminder ${boolLabel(firstContact.objectiveReminderAvailable)}; failed resume probes ${resumeProbes.filter((probe) => probe.currentGoalRecoverable === false || probe.nextActionClear === false || probe.needsMenuDive === true).length}.`,
      nextStep: "Keep the active goal, prerequisite state, and next-step hint cheap to reopen so breaks do not reset progress comprehension.",
    });
  }

  if (
    confounders.inputCertainty === "major-slip" ||
    confounders.responseLatency === "late" ||
    confounders.viewObstructedAtDecision === true ||
    confounders.autoCameraInterference === true
  ) {
    findings.push({
      severity: "major",
      title: "control or view instability confounds the progression read",
      evidence:
        `input certainty ${confounders.inputCertainty ?? "unknown"}; response latency ${confounders.responseLatency ?? "unknown"}; view obstructed ${boolLabel(confounders.viewObstructedAtDecision)}; auto-camera interference ${boolLabel(confounders.autoCameraInterference)}.`,
      nextStep: "Stabilize control and view support before treating weak progression comprehension as a goal-design problem alone.",
    });
  }

  if (findings.length === 0) {
    findings.push({
      severity: "minor",
      title: "no major readable-progression breakdown logged in supplied observations",
      evidence: "proximal goal, prerequisite progress, feedback readback, and next-step guidance were adequate in the sampled run.",
      nextStep: "Validate the same readability against a second run or a slightly later progression slice before making broad claims.",
    });
  }

  return findings.sort((left, right) => severityRank(left.severity) - severityRank(right.severity));
}

function buildEvidenceSection(data: ObservationFile): string[] {
  const evidence = data.evidence ?? {};
  return [
    `- Evidence mode: ${evidence.mode ?? "unknown"}.`,
    `- Runs sampled: ${evidence.sampledRuns ?? 0}.`,
    `- Failures sampled: ${evidence.sampledFailures ?? 0}.`,
    `- Retries sampled: ${evidence.sampledRetries ?? 0}.`,
    `- Resume probes sampled: ${evidence.sampledResumeProbes ?? 0}.`,
    `- Probe outcomes sampled: ${data.probeOutcomes?.length ?? 0}.`,
    `- Incident tags logged: ${data.incidents?.length ?? 0}.`,
    ...(evidence.notes?.map((note) => `- Evidence note: ${note}`) ?? []),
  ];
}

function buildFindingsSection(findings: Finding[]): string[] {
  return findings.map((finding) => `- \`${finding.severity}\` ${finding.title}. Evidence: ${finding.evidence}`);
}

function buildProgressionSection(data: ObservationFile): string[] {
  const progression = getProgression(data);
  return [
    `- Proximal goal visible: ${boolLabel(progression.proximalGoalVisible ?? data.mastery?.proximalGoalVisible)}.`,
    `- Goal horizon: ${progression.goalHorizon ?? "unknown"}.`,
    `- Prerequisite progress visible: ${boolLabel(progression.prerequisiteProgressVisible)}.`,
    `- Prerequisite counts concrete: ${boolLabel(progression.prerequisiteCountsConcrete)}.`,
    `- Progress reminders available: ${boolLabel(progression.progressRemindersAvailable ?? data.mastery?.progressRemindersAvailable)}.`,
    `- Goal updates timely: ${boolLabel(progression.goalUpdatesTimely)}.`,
    `- Evaluative readback present: ${boolLabel(progression.evaluativeReadbackPresent)}.`,
    `- Readback names improvement: ${boolLabel(progression.readbackNamesWhatImproved ?? data.mastery?.failureImprovementVisible)}.`,
    `- Next-step guidance clear: ${boolLabel(progression.nextStepGuidanceClear ?? data.firstContact?.nextStepPrescriptive)}.`,
    `- Next-step guidance non-comparative: ${boolLabel(progression.nextStepGuidanceNonComparative)}.`,
    `- Comparative pressure present: ${boolLabel(progression.comparativePressurePresent)}.`,
    `- Notes: ${progression.notes ?? "none logged"}.`,
  ];
}

function buildCheckpointSection(checkpoints: ProgressCheckpointObservation[]): string[] {
  if (checkpoints.length === 0) {
    return ["- No explicit prerequisite or progress checkpoints logged yet."];
  }

  return checkpoints.map((checkpoint) => {
    const parts = [
      `label ${checkpoint.label ?? "unknown"}`,
      `kind ${checkpoint.kind ?? "unknown"}`,
      `progress visible ${boolLabel(checkpoint.progressVisible)}`,
      `current ${checkpoint.currentValue ?? "unknown"}`,
      `target ${checkpoint.targetValue ?? "unknown"}`,
      `remaining work clear ${boolLabel(checkpoint.remainingWorkClear)}`,
      `notes ${checkpoint.notes ?? "none"}`,
    ];
    return `- ${parts.join("; ")}.`;
  });
}

function buildFailureSection(data: ObservationFile): string[] {
  const failures = data.failures ?? [];
  if (failures.length === 0) {
    return ["- No failure or near-miss sample logged yet."];
  }

  return failures.map((failure) => {
    const parts = [
      `fail ${failure.at ?? "unknown"}`,
      `cause readable ${boolLabel(failure.causeReadable)}`,
      `correction clear ${boolLabel(failure.correctiveActionClear)}`,
      `retry context stable ${boolLabel(failure.retryContextStable)}`,
      `notes ${failure.notes ?? "none"}`,
    ];
    return `- ${parts.join("; ")}.`;
  });
}

function buildResumeSection(resumeProbes: ResumeProbeObservation[]): string[] {
  if (resumeProbes.length === 0) {
    return ["- No interruption or return-after-break probe recorded yet."];
  }

  return resumeProbes.map((probe) => {
    const parts = [
      `break ${probe.breakType ?? "unknown"}`,
      `goal recoverable ${boolLabel(probe.currentGoalRecoverable)}`,
      `next action clear ${boolLabel(probe.nextActionClear)}`,
      `menu dive needed ${boolLabel(probe.needsMenuDive)}`,
      `notes ${probe.notes ?? "none"}`,
    ];
    return `- ${parts.join("; ")}.`;
  });
}

function buildProbeOutcomeSection(probeOutcomes: ProbeOutcomeObservation[]): string[] {
  if (probeOutcomes.length === 0) {
    return ["- No probe outcomes recorded yet."];
  }

  return probeOutcomes.map((probe) => {
    return `- ${probe.probe ?? "unknown-probe"}: outcome=${probe.outcome ?? "unknown"}; success rating=${formatRating(probe.successRating, 4)}; confidence=${formatRating(probe.confidence, 7)}; satisfaction=${formatRating(probe.satisfaction, 7)}; frustration=${formatRating(probe.frustration, 7, "-high")}; mental demand=${formatRating(probe.mentalDemand, 7, "-high")}; time pressure=${formatRating(probe.timePressure, 7, "-high")}; effort=${formatRating(probe.effort, 7, "-high")}; blockers=${probe.blockers?.join(", ") ?? "none"}; notes=${probe.notes ?? "none"}.`;
  });
}

function buildIncidentSection(incidents: IncidentObservation[]): string[] {
  if (incidents.length === 0) {
    return ["- No shared incident rows recorded yet."];
  }

  return [...incidents]
    .sort((left, right) => (right.repeatedCount ?? 0) - (left.repeatedCount ?? 0))
    .map((incident) => {
      const parts = [
        `incident ${incident.incidentTag ?? incident.title ?? "untagged-incident"}`,
        `title ${incident.title ?? "none"}`,
        `repeats ${incident.repeatedCount ?? 1}`,
        `impact ${incident.impact ?? "unknown"}`,
        `persistence ${incident.persistence ?? "unknown"}`,
        `player cost ${incident.playerCost?.join(", ") ?? "none"}`,
        `next check ${incident.nextCheck ?? "none"}`,
        `notes ${incident.notes ?? "none"}`,
      ];
      return `- ${parts.join("; ")}.`;
    });
}

function buildConfounderSection(confounders: ConfounderObservation): string[] {
  return [
    `- Input certainty: ${confounders.inputCertainty ?? "unknown"}.`,
    `- Response latency: ${confounders.responseLatency ?? "unknown"}.`,
    `- Camera supports action: ${boolLabel(confounders.cameraSupportsAction)}.`,
    `- View obstructed at decision: ${boolLabel(confounders.viewObstructedAtDecision)}.`,
    `- Auto-camera interference: ${boolLabel(confounders.autoCameraInterference)}.`,
    `- Notes: ${confounders.notes ?? "none logged"}.`,
  ];
}

function buildListSection(items: string[] | undefined, fallback: string): string[] {
  if (!items || items.length === 0) {
    return [`- ${fallback}`];
  }
  return items.map((item) => `- ${item}`);
}

function buildNextSteps(findings: Finding[]): string[] {
  const unique = Array.from(new Set(findings.map((finding) => finding.nextStep)));
  return unique.map((step) => `- ${step}`);
}

function buildDurableLearning(data: ObservationFile, findings: Finding[]): string[] {
  const game = data.game ?? "this game";
  const starterCoverageStatus = getStarterCoverageStatus(data);

  if (starterCoverageStatus === "partial" || starterCoverageStatus === "missing") {
    return [
      `- ${game}: readable-progression review should preserve starter claim guardrails in this catalog because one clear or muddy opening can prove a local progress-guidance issue without proving the whole progression arc is solved.`,
    ];
  }

  if (findings.some((finding) => finding.title === "next reachable goal is not readable enough to guide effort")) {
    return [
      `- ${game}: sticky browser-game progression weakens fast when the next reachable goal is vague; players need one concrete short target before more content meaningfully helps.`,
    ];
  }

  if (findings.some((finding) => finding.title === "prerequisite progress is too vague to steer the next attempt")) {
    return [
      `- ${game}: prerequisite progress only motivates when remaining work is concrete; hidden counts or unnamed blockers make progress feel distant even when the loop itself works.`,
    ];
  }

  if (findings.some((finding) => finding.title === "next-step guidance leans on comparative pressure instead of self-referenced progress")) {
    return [
      `- ${game}: progression guidance is stronger when it points to the player's own next requirement than when it borrows urgency from comparison or ranking.`,
    ];
  }

  return [
    `- ${game}: readable progression is strongest when one short goal, one concrete prerequisite state, and one self-referenced next step stay visible enough that effort never drifts into guessing.`,
  ];
}

function extractLearningLine(markdownLines: string[]): string | undefined {
  return markdownLines.find((line) => line.startsWith("- "));
}

function updateLearningFile(learningLine: string): void {
  const header = "# Durable Learnings";
  const existing = (() => {
    try {
      return readFileSync(skillLearningPath, "utf8");
    } catch {
      return `${header}\n`;
    }
  })();

  const lines = existing.replace(/\r\n/g, "\n").trimEnd().split("\n");
  const bodyLines = (lines[0] === header ? lines.slice(1) : lines).filter((line) => line.trim().length > 0);

  if (bodyLines.includes(learningLine)) {
    return;
  }

  writeFileSync(skillLearningPath, [header, "", ...bodyLines, learningLine, ""].join("\n"), "utf8");
}

function buildMarkdown(data: ObservationFile): string {
  const game = data.game ?? "unknown-game";
  const sessionDate = data.sessionDate ?? new Date().toISOString().slice(0, 10);
  const findings = buildFindings(data);
  const progression = getProgression(data);
  const starterNextEvidence = getStarterNextEvidence(data).filter((item) => item !== "none");

  return [
    `# ${game} Readable Progression Audit`,
    "",
    `Session: ${sessionDate}`,
    "",
    "## Findings",
    "",
    ...buildFindingsSection(findings),
    "",
    "## Evidence Snapshot",
    "",
    ...buildEvidenceSection(data),
    "",
    "## Evidence Scope Guardrail",
    "",
    ...buildStarterGuardrailSection(data),
    "",
    "## Progression Frame",
    "",
    ...buildProgressionSection(data),
    "",
    "## Progress Checkpoints",
    "",
    ...buildCheckpointSection(progression.checkpoints ?? []),
    "",
    "## Evaluative Readback",
    "",
    ...buildFailureSection(data),
    "",
    "## Reminder Recovery",
    "",
    ...buildResumeSection(data.resumeProbes ?? []),
    "",
    "## Probe Outcomes",
    "",
    ...buildProbeOutcomeSection(data.probeOutcomes ?? []),
    "",
    "## Shared Incident Queue",
    "",
    ...buildIncidentSection(data.incidents ?? []),
    "",
    "## Control And View Confounders",
    "",
    ...buildConfounderSection(data.confounders ?? {}),
    "",
    "## Strengths",
    "",
    ...buildListSection(data.strengths, "No strengths logged yet."),
    "",
    "## Frictions",
    "",
    ...buildListSection(data.frictions, "No frictions logged yet."),
    "",
    "## Evidence-Backed Next Steps",
    "",
    ...buildNextSteps(findings),
    ...(starterNextEvidence.length > 0
      ? [
          "",
          "## Coverage Follow-Ups",
          "",
          ...starterNextEvidence.map((item) => `- Sample more before broad verdict: ${item}.`),
        ]
      : []),
    "",
    "## Durable Learning",
    "",
    ...buildDurableLearning(data, findings),
    "",
  ].join("\n");
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const data = options.observations ? readObservations(options.observations) : undefined;
  const output = options.template || !data ? buildTemplate() : buildMarkdown(data);

  if (data) {
    const learningLine = extractLearningLine(buildDurableLearning(data, buildFindings(data)));
    if (learningLine) {
      updateLearningFile(learningLine);
    }
  }

  if (options.out) {
    const outputPath = resolve(options.out);
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, output, "utf8");
    console.log(`Wrote ${outputPath}`);
    return;
  }

  console.log(output);
}

main();
