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
type DemandType = "mash" | "hold" | "simultaneous" | "rapid-sequence" | "precision-timing" | "path-based" | "analog";

type InputDemandSampleObservation = {
  at?: string;
  action?: string;
  demandType?: DemandType;
  progressionCritical?: boolean;
  optionalFlavor?: boolean;
  intensity?: "low" | "medium" | "high";
  readableBeforeAttempt?: boolean;
  lowerDemandAlternativeAvailable?: boolean;
  remapWouldNotSolve?: boolean;
  causedFailureOrBlock?: boolean;
  notes?: string;
};

type InputDemandObservation = {
  remapSafe?: boolean;
  rapidRepeatedInputPresent?: boolean;
  holdInputPresent?: boolean;
  simultaneousInputPresent?: boolean;
  rapidSequencePresent?: boolean;
  precisionTimingDemandPresent?: boolean;
  pathBasedOrAnalogDemandPresent?: boolean;
  progressionCriticalDemandPresent?: boolean;
  lowerDemandAlternativeAvailable?: boolean;
  difficultyOptionHelps?: boolean;
  demandReadableBeforeFailure?: boolean;
  motorTaxLikelyPrimaryBlocker?: boolean;
  notes?: string;
  samples?: InputDemandSampleObservation[];
};

type FirstContactObservation = {
  remapSafe?: boolean;
  controlsReminderAvailable?: boolean;
  optionalHelpOnDemand?: boolean;
};

type LearningLoopObservation = {
  practiceWithoutFailure?: boolean;
  sameLessonStableAcrossRetries?: boolean;
};

type RecoverySupportObservation = {
  difficultyAdjustableAfterFailure?: boolean;
  assistOrSkipAvailable?: boolean;
  tutorialOrHintReopenable?: boolean;
};

type FailureObservation = {
  at?: string;
  cause?: string;
  causeReadable?: boolean;
  correctiveActionClear?: boolean;
  retrySeconds?: number;
  returnsToRelevantDecision?: boolean;
  retryContextStable?: boolean;
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
  notes?: string[];
};

type ObservationFile = {
  game?: string;
  sessionDate?: string;
  inputDemand?: InputDemandObservation;
  firstContact?: FirstContactObservation;
  failures?: FailureObservation[];
  learningLoop?: LearningLoopObservation;
  recoverySupport?: RecoverySupportObservation;
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
const kojimaLearningPath = resolve(process.cwd(), ".local", "kojima", "learnings.md");

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

function getSamples(data: ObservationFile): InputDemandSampleObservation[] {
  return data.inputDemand?.samples ?? [];
}

function buildTemplate(): string {
  return [
    "# Input Demand Audit Template",
    "",
    "Use this when a loop may block play through timing-speed or motor-tax burden even if control mapping looks fine.",
    "",
    "## Core Checks",
    "",
    "- Identify which demand types the player actually had to perform: mash, hold, simultaneous, rapid-sequence, precision-timing, path-based, analog.",
    "- Separate progression blockers from optional flourishes.",
    "- Separate remap truth from timing-speed burden.",
    "- Check for lower-demand alternatives, assists, or mechanic-level simplifications.",
    "- Judge whether failures teach the burden clearly or feel like opaque motor tax.",
    "",
    "## Observation JSON",
    "",
    "```json",
    JSON.stringify(
      {
        game: "some-game",
        sessionDate: "2026-05-05",
        inputDemand: {
          remapSafe: true,
          rapidRepeatedInputPresent: true,
          holdInputPresent: false,
          simultaneousInputPresent: true,
          rapidSequencePresent: false,
          precisionTimingDemandPresent: true,
          pathBasedOrAnalogDemandPresent: false,
          progressionCriticalDemandPresent: true,
          lowerDemandAlternativeAvailable: false,
          difficultyOptionHelps: false,
          demandReadableBeforeFailure: true,
          motorTaxLikelyPrimaryBlocker: true,
          notes: "opening asks for tight dodge-plus-fire timing and one simultaneous input gate, but no lower-demand variant surfaced",
          samples: [
            {
              at: "00:22",
              action: "burst out of spawn and dodge while firing",
              demandType: "simultaneous",
              progressionCritical: true,
              optionalFlavor: false,
              intensity: "high",
              readableBeforeAttempt: true,
              lowerDemandAlternativeAvailable: false,
              remapWouldNotSolve: true,
              causedFailureOrBlock: true,
              notes: "player understands the ask, but the burden itself blocks the route",
            },
            {
              at: "00:31",
              action: "hammer confirm to escape grab",
              demandType: "mash",
              progressionCritical: true,
              optionalFlavor: false,
              intensity: "high",
              readableBeforeAttempt: false,
              lowerDemandAlternativeAvailable: false,
              remapWouldNotSolve: true,
              causedFailureOrBlock: true,
              notes: "failure reads like motor tax more than strategic mistake",
            },
          ],
        },
        firstContact: {
          remapSafe: true,
          controlsReminderAvailable: true,
          optionalHelpOnDemand: true,
        },
        failures: [
          {
            at: "00:31",
            cause: "grab-escape mash gate failed",
            causeReadable: true,
            correctiveActionClear: false,
            retrySeconds: 4,
            returnsToRelevantDecision: true,
            retryContextStable: true,
            notes: "player knows what happened, but not how to lower the burden",
          },
        ],
        learningLoop: {
          practiceWithoutFailure: false,
          sameLessonStableAcrossRetries: true,
        },
        recoverySupport: {
          difficultyAdjustableAfterFailure: false,
          assistOrSkipAvailable: false,
          tutorialOrHintReopenable: true,
        },
        evidence: {
          mode: "direct-play",
          sampledRuns: 2,
          sampledFailures: 1,
          sampledRetries: 1,
          notes: ["captured one simultaneous-input blocker and one mash-gate failure"],
        },
        probeOutcomes: [
          {
            probe: "fail-retry",
            outcome: "partial",
            successRating: 2,
            confidence: 3,
            satisfaction: 3,
            frustration: 6,
            mentalDemand: 6,
            timePressure: 6,
            effort: 6,
            blockers: ["high-burden mash gate"],
            notes: "retry is fast, but the demanded action stays harsh",
          },
        ],
        incidents: [
          {
            incidentTag: "mash-gate-blocker",
            title: "progression hinge relies on rapid repeated input",
            repeatedCount: 2,
            impact: "high",
            persistence: "repeatable",
            playerCost: ["death", "attention-tax"],
            nextCheck: "verify whether a hold-toggle or slower escape window preserves the encounter's intent",
            notes: "same burden recurs across retries",
          },
        ],
        confounders: {
          inputCertainty: "stable",
          responseLatency: "stable",
          cameraSupportsAction: true,
          viewObstructedAtDecision: false,
          autoCameraInterference: false,
          notes: "problem reads as demand burden, not lag or camera drift",
        },
        strengths: ["core verbs are named clearly before the harsh gate"],
        frictions: ["progression hinge depends on motor-tax-heavy input without a lower-demand fallback"],
      },
      null,
      2,
    ),
    "```",
  ].join("\n");
}

function buildFindings(data: ObservationFile): Finding[] {
  const inputDemand = data.inputDemand ?? {};
  const failures = data.failures ?? [];
  const learningLoop = data.learningLoop ?? {};
  const recovery = data.recoverySupport ?? {};
  const samples = getSamples(data);
  const findings: Finding[] = [];

  const harshCriticalSample = samples.find(
    (sample) =>
      sample.progressionCritical === true &&
      sample.causedFailureOrBlock === true &&
      sample.lowerDemandAlternativeAvailable === false,
  );

  if (inputDemand.motorTaxLikelyPrimaryBlocker === true || harshCriticalSample) {
    findings.push({
      severity: "blocker",
      title: "progression-critical input burden looks like a motor-tax wall, not just a mapping issue",
      evidence:
        harshCriticalSample?.notes ??
        inputDemand.notes ??
        failures[0]?.notes ??
        "logged demand samples show at least one progression gate blocked by mash, hold, simultaneous, or timing-speed burden without a lower-demand path.",
      nextStep:
        "Reduce the harshest progression-critical demand first with a hold-toggle, slower window, simplified combo, or equivalent mechanic-level alternative that preserves intent without requiring the same motor tax.",
    });
  }

  if (
    (inputDemand.rapidRepeatedInputPresent === true ||
      inputDemand.holdInputPresent === true ||
      inputDemand.simultaneousInputPresent === true ||
      inputDemand.rapidSequencePresent === true ||
      inputDemand.precisionTimingDemandPresent === true ||
      inputDemand.pathBasedOrAnalogDemandPresent === true) &&
    inputDemand.lowerDemandAlternativeAvailable === false &&
    recovery.assistOrSkipAvailable !== true &&
    recovery.difficultyAdjustableAfterFailure !== true
  ) {
    findings.push({
      severity: "major",
      title: "harsh demanded inputs lack a lower-demand fallback or assist path",
      evidence:
        inputDemand.notes ??
        "sampled demand types were present, but no lower-demand alternative, assist, or difficulty relief was logged.",
      nextStep:
        "Add a lower-demand alternative for the harshest required action, such as hold-instead-of-mash, wider timing, optional simplification, or an assist that preserves progression.",
    });
  }

  if (
    inputDemand.remapSafe === true &&
    samples.some((sample) => sample.remapWouldNotSolve === true) &&
    inputDemand.motorTaxLikelyPrimaryBlocker !== false
  ) {
    findings.push({
      severity: "major",
      title: "remap access is present, but timing-speed burden still blocks play",
      evidence:
        samples.find((sample) => sample.remapWouldNotSolve === true)?.notes ??
        inputDemand.notes ??
        "at least one logged demand would stay harsh even if controls were remapped.",
      nextStep:
        "Audit required speed, hold length, simultaneous presses, or sequence density directly instead of treating remapping as a complete fix.",
    });
  }

  if (
    inputDemand.demandReadableBeforeFailure === false ||
    failures.some((failure) => failure.correctiveActionClear === false) ||
    learningLoop.sameLessonStableAcrossRetries === false
  ) {
    findings.push({
      severity: "major",
      title: "the game does not teach the demanded input clearly enough before punishment lands",
      evidence:
        failures.find((failure) => failure.correctiveActionClear === false)?.notes ??
        inputDemand.notes ??
        "logged failures show the player reached punishment before the demand or correction was fully readable.",
      nextStep:
        "Surface the demanded action earlier, keep the first sample safer, and make the correction explicit on retry so failure teaches the burden instead of obscuring it.",
    });
  }

  if (
    learningLoop.practiceWithoutFailure === false &&
    recovery.assistOrSkipAvailable !== true &&
    recovery.difficultyAdjustableAfterFailure !== true &&
    inputDemand.progressionCriticalDemandPresent === true
  ) {
    findings.push({
      severity: "minor",
      title: "the sampled demand has no low-stakes rehearsal path",
      evidence:
        "No logged practice-without-failure lane, assist path, or post-failure difficulty relief backed up the progression-critical demand.",
      nextStep:
        "Expose one low-stakes rehearsal or post-failure relief path so players can learn the demanded action without paying full punishment every attempt.",
    });
  }

  if (findings.length === 0) {
    findings.push({
      severity: "minor",
      title: "sampled input demand looks readable and proportionate in the observed moments",
      evidence:
        inputDemand.notes ??
        "logged demand samples did not surface blocker-grade motor tax in the sampled run.",
      nextStep:
        "Keep future tuning inside the same readability and burden envelope so added difficulty does not become hidden input tax.",
    });
  }

  return findings.sort((left, right) => severityRank(left.severity) - severityRank(right.severity));
}

function buildEvidenceSection(data: ObservationFile): string[] {
  const evidence = data.evidence ?? {};
  return [
    `- Mode: ${evidence.mode ?? "unknown"}.`,
    `- Runs: ${evidence.sampledRuns ?? 0}.`,
    `- Failures: ${evidence.sampledFailures ?? 0}.`,
    `- Retries: ${evidence.sampledRetries ?? 0}.`,
    `- Notes: ${evidence.notes?.join(" | ") ?? "none"}.`,
  ];
}

function buildFindingsSection(findings: Finding[]): string[] {
  return findings.map(
    (finding) =>
      `- ${finding.severity}: ${finding.title}. Evidence: ${finding.evidence} Next: ${finding.nextStep}`,
  );
}

function buildInputDemandSection(data: ObservationFile): string[] {
  const inputDemand = data.inputDemand ?? {};
  return [
    `- Remap safe: ${boolLabel(inputDemand.remapSafe)}.`,
    `- Rapid repeated input present: ${boolLabel(inputDemand.rapidRepeatedInputPresent)}.`,
    `- Hold input present: ${boolLabel(inputDemand.holdInputPresent)}.`,
    `- Simultaneous input present: ${boolLabel(inputDemand.simultaneousInputPresent)}.`,
    `- Rapid-sequence input present: ${boolLabel(inputDemand.rapidSequencePresent)}.`,
    `- Precision-timing demand present: ${boolLabel(inputDemand.precisionTimingDemandPresent)}.`,
    `- Path-based or analog demand present: ${boolLabel(inputDemand.pathBasedOrAnalogDemandPresent)}.`,
    `- Progression-critical demand present: ${boolLabel(inputDemand.progressionCriticalDemandPresent)}.`,
    `- Lower-demand alternative available: ${boolLabel(inputDemand.lowerDemandAlternativeAvailable)}.`,
    `- Difficulty option helps: ${boolLabel(inputDemand.difficultyOptionHelps)}.`,
    `- Demand readable before failure: ${boolLabel(inputDemand.demandReadableBeforeFailure)}.`,
    `- Motor tax likely primary blocker: ${boolLabel(inputDemand.motorTaxLikelyPrimaryBlocker)}.`,
    `- Notes: ${inputDemand.notes ?? "none logged"}.`,
  ];
}

function buildSampleSection(samples: InputDemandSampleObservation[]): string[] {
  if (samples.length === 0) {
    return ["- No input-demand samples recorded yet."];
  }

  return samples.map((sample) => {
    const parts = [
      `at ${sample.at ?? "unknown"}`,
      `action ${sample.action ?? "unknown"}`,
      `type ${sample.demandType ?? "unknown"}`,
      `progression critical ${boolLabel(sample.progressionCritical)}`,
      `optional flavor ${boolLabel(sample.optionalFlavor)}`,
      `intensity ${sample.intensity ?? "unknown"}`,
      `readable before attempt ${boolLabel(sample.readableBeforeAttempt)}`,
      `lower-demand alternative ${boolLabel(sample.lowerDemandAlternativeAvailable)}`,
      `remap would not solve ${boolLabel(sample.remapWouldNotSolve)}`,
      `caused failure or block ${boolLabel(sample.causedFailureOrBlock)}`,
      `notes ${sample.notes ?? "none"}`,
    ];
    return `- ${parts.join("; ")}.`;
  });
}

function buildFailureSection(failures: FailureObservation[], learningLoop: LearningLoopObservation): string[] {
  if (failures.length === 0) {
    return [
      `- No sampled failure tied to input burden yet. Practice without failure: ${boolLabel(learningLoop.practiceWithoutFailure)}.`,
      `- Same lesson stable across retries: ${boolLabel(learningLoop.sameLessonStableAcrossRetries)}.`,
    ];
  }

  return [
    ...failures.map((failure) => {
      const parts = [
        `at ${failure.at ?? "unknown"}`,
        `cause ${failure.cause ?? "unknown"}`,
        `cause readable ${boolLabel(failure.causeReadable)}`,
        `corrective action clear ${boolLabel(failure.correctiveActionClear)}`,
        `retry seconds ${typeof failure.retrySeconds === "number" ? `${failure.retrySeconds}s` : "unknown"}`,
        `returns to relevant decision ${boolLabel(failure.returnsToRelevantDecision)}`,
        `retry context stable ${boolLabel(failure.retryContextStable)}`,
        `notes ${failure.notes ?? "none"}`,
      ];
      return `- ${parts.join("; ")}.`;
    }),
    `- Practice without failure: ${boolLabel(learningLoop.practiceWithoutFailure)}.`,
    `- Same lesson stable across retries: ${boolLabel(learningLoop.sameLessonStableAcrossRetries)}.`,
  ];
}

function buildRecoverySection(recovery: RecoverySupportObservation): string[] {
  return [
    `- Difficulty adjustable after failure: ${boolLabel(recovery.difficultyAdjustableAfterFailure)}.`,
    `- Assist or skip available: ${boolLabel(recovery.assistOrSkipAvailable)}.`,
    `- Tutorial or hint reopenable: ${boolLabel(recovery.tutorialOrHintReopenable)}.`,
  ];
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
      `- ${game}: input-demand review should preserve starter claim guardrails in this catalog, because one harsh mash, hold, or simultaneous gate can prove a local motor-tax risk without proving the whole control model is solved.`,
    ];
  }

  if (
    findings.some(
      (finding) => finding.title === "progression-critical input burden looks like a motor-tax wall, not just a mapping issue",
    )
  ) {
    return [
      `- ${game}: input review should split remap access from timing-speed burden, because a browser game can still block play through mash, hold, simultaneous, or precision demands even when controls are technically remappable.`,
    ];
  }

  if (findings.some((finding) => finding.title === "harsh demanded inputs lack a lower-demand fallback or assist path")) {
    return [
      `- ${game}: harsh required inputs need lower-demand alternatives when they gate progress, because players read hidden motor tax as unfair challenge even when the rule itself is understandable.`,
    ];
  }

  return [
    `- ${game}: input demand reads best when the game teaches one required action at a time, keeps the burden readable before punishment, and offers lower-demand relief for the harshest gates.`,
  ];
}

function extractLearningLine(markdownLines: string[]): string | undefined {
  return markdownLines.find((line) => line.startsWith("- "));
}

function writeLearning(outputPath: string, header: string, learningLine: string): void {
  const existing = (() => {
    try {
      return readFileSync(outputPath, "utf8");
    } catch {
      return `${header}\n`;
    }
  })();

  const lines = existing.replace(/\r\n/g, "\n").trimEnd().split("\n");
  const bodyLines = (lines[0] === header ? lines.slice(1) : lines).filter((line) => line.trim().length > 0);
  if (bodyLines.includes(learningLine)) {
    return;
  }

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, [header, "", ...bodyLines, learningLine, ""].join("\n"), "utf8");
}

function updateLearningFiles(learningLine: string): void {
  writeLearning(skillLearningPath, "# Durable Learnings", learningLine);
  writeLearning(kojimaLearningPath, "# Kojima Learnings", learningLine);
}

function buildMarkdown(data: ObservationFile): string {
  const game = data.game ?? "unknown-game";
  const sessionDate = data.sessionDate ?? new Date().toISOString().slice(0, 10);
  const findings = buildFindings(data);
  const starterNextEvidence = getStarterNextEvidence(data).filter((item) => item !== "none");

  return [
    `# ${game} Input Demand Audit`,
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
    "## Input Demand Frame",
    "",
    ...buildInputDemandSection(data),
    "",
    "## Demand Samples",
    "",
    ...buildSampleSection(getSamples(data)),
    "",
    "## Failure And Retry Read",
    "",
    ...buildFailureSection(data.failures ?? [], data.learningLoop ?? {}),
    "",
    "## Recovery Support",
    "",
    ...buildRecoverySection(data.recoverySupport ?? {}),
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
      updateLearningFiles(learningLine);
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
