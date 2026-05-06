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

type ForgivenessType =
  | "coyote-time"
  | "input-buffer"
  | "corner-correction"
  | "collision-leniency"
  | "landing-grace"
  | "other";

type ForgivenessMomentObservation = {
  at?: string;
  challenge?: string;
  forgivenessType?: ForgivenessType;
  playerIntent?: string;
  intentPreserved?: boolean;
  outcome?: "saved" | "neutral" | "stolen";
  retryClarifiedCorrection?: boolean;
  notes?: string;
};

type ForgivenessObservation = {
  coyoteTimePresent?: boolean;
  inputBufferPresent?: boolean;
  cornerCorrectionPresent?: boolean;
  collisionLeniencyFair?: boolean;
  graceWindowsConsistent?: boolean;
  droppedIntentCausedFailures?: boolean;
  failFeelsStolen?: boolean;
  retryClarifiesMissedTiming?: boolean;
  practiceWindowAvailable?: boolean;
  notes?: string;
  moments?: ForgivenessMomentObservation[];
};

type LearningLoopObservation = {
  immediateRetry?: boolean;
  practiceWithoutFailure?: boolean;
  sameSkillRetestedQuickly?: boolean;
  sameLessonStableAcrossRetries?: boolean;
};

type RecoverySupportObservation = {
  quickStartAfterFailure?: boolean;
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
  sourceVisibleOnFail?: boolean;
  returnsToRelevantDecision?: boolean;
  repeatedPenaltyFromSingleMistake?: boolean;
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
  forgiveness?: ForgivenessObservation;
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

function getMoments(data: ObservationFile): ForgivenessMomentObservation[] {
  return data.forgiveness?.moments ?? [];
}

function buildTemplate(): string {
  return [
    "# Forgiveness Audit Template",
    "",
    "Use this when a loop feels unfair because edge timing, corner cases, or collision reads may be dropping player intent.",
    "",
    "## Core Checks",
    "",
    "- Small grace windows preserve plausible intent instead of demanding frame-perfect timing.",
    "- Corner correction or collision leniency prevent fake punishment on near-clean lines.",
    "- Grace windows stay consistent enough that the player can learn them.",
    "- Retry clarifies the missed timing instead of repeating a stolen fail.",
    "- Severe timing still has a practice, assist, or lower-punishment path when needed.",
    "",
    "## Observation JSON",
    "",
    "```json",
    JSON.stringify(
      {
        game: "some-game",
        sessionDate: "2026-05-02",
        forgiveness: {
          coyoteTimePresent: true,
          inputBufferPresent: true,
          cornerCorrectionPresent: true,
          collisionLeniencyFair: true,
          graceWindowsConsistent: true,
          droppedIntentCausedFailures: false,
          failFeelsStolen: false,
          retryClarifiesMissedTiming: true,
          practiceWindowAvailable: false,
          notes: "late edge jumps still land, buffered actions survive landing, and wall clips do not steal clean routes",
          moments: [
            {
              at: "00:18",
              challenge: "late platform exit jump",
              forgivenessType: "coyote-time",
              playerIntent: "jump after running off the lip",
              intentPreserved: true,
              outcome: "saved",
              retryClarifiedCorrection: true,
              notes: "jump still fires on a slightly late press",
            },
            {
              at: "00:34",
              challenge: "tight wall skim",
              forgivenessType: "corner-correction",
              playerIntent: "clear the corner and keep forward momentum",
              intentPreserved: false,
              outcome: "stolen",
              retryClarifiedCorrection: false,
              notes: "avatar snags on a corner that reads visually clear",
            },
          ],
        },
        failures: [
          {
            at: "00:34",
            cause: "corner snag during otherwise clean jump line",
            causeReadable: true,
            correctiveActionClear: false,
            retrySeconds: 3,
            sourceVisibleOnFail: true,
            returnsToRelevantDecision: true,
            repeatedPenaltyFromSingleMistake: false,
            retryContextStable: true,
            notes: "player understands where the fail happened, but not why the game rejected the intent",
          },
        ],
        learningLoop: {
          immediateRetry: true,
          practiceWithoutFailure: false,
          sameSkillRetestedQuickly: true,
          sameLessonStableAcrossRetries: true,
        },
        recoverySupport: {
          quickStartAfterFailure: true,
          difficultyAdjustableAfterFailure: false,
          assistOrSkipAvailable: false,
          tutorialOrHintReopenable: false,
        },
        evidence: {
          mode: "direct-play",
          sampledRuns: 2,
          sampledFailures: 1,
          sampledRetries: 1,
          notes: ["captured one intent-preserved save and one stolen-fail retry"],
        },
        probeOutcomes: [
          {
            probe: "fail-retry",
            outcome: "partial",
            successRating: 2,
            confidence: 4,
            satisfaction: 3,
            frustration: 5,
            mentalDemand: 5,
            timePressure: 5,
            effort: 4,
            blockers: ["corner snag stayed hard to predict"],
            notes: "retry kept the same lesson, but the rule still felt brittle",
          },
        ],
        incidents: [
          {
            incidentTag: "corner-snag",
            title: "Near-clean routes catch on collision corner",
            repeatedCount: 2,
            impact: "high",
            persistence: "repeatable",
            playerCost: ["death", "confusion"],
            nextCheck: "sample the same route with slightly earlier and slightly later jumps",
            notes: "issue appears on successive retries",
          },
        ],
        confounders: {
          inputCertainty: "stable",
          responseLatency: "stable",
          cameraSupportsAction: true,
          viewObstructedAtDecision: false,
          autoCameraInterference: false,
          notes: "problem reads as rules or collision, not as input lag or visibility loss",
        },
        strengths: ["late edge jumps usually preserve the obvious intended action"],
        frictions: ["tight corner clips still create occasional stolen fails"],
      },
      null,
      2,
    ),
    "```",
  ].join("\n");
}

function buildFindings(data: ObservationFile): Finding[] {
  const forgiveness = data.forgiveness ?? {};
  const failures = data.failures ?? [];
  const learningLoop = data.learningLoop ?? {};
  const recovery = data.recoverySupport ?? {};
  const moments = getMoments(data);
  const findings: Finding[] = [];

  if (
    forgiveness.droppedIntentCausedFailures === true ||
    forgiveness.failFeelsStolen === true ||
    moments.some((moment) => moment.outcome === "stolen")
  ) {
    findings.push({
      severity: "blocker",
      title: "loop drops plausible player intent at the decisive edge-timing moment",
      evidence:
        forgiveness.notes ??
        failures[0]?.notes ??
        "logged forgiveness moments include at least one stolen fail instead of a deserved miss.",
      nextStep: "Add or tune the smallest grace rule that preserves the obvious intended action without widening success far beyond the visual promise.",
    });
  }

  if (
    forgiveness.cornerCorrectionPresent === false ||
    forgiveness.collisionLeniencyFair === false
  ) {
    findings.push({
      severity: "major",
      title: "collision or corner rules punish near-clean paths too harshly",
      evidence:
        moments.find((moment) => moment.forgivenessType === "corner-correction" || moment.forgivenessType === "collision-leniency")
          ?.notes ??
        forgiveness.notes ??
        "logged pathing or collision behavior suggests near-misses turn into fake punishment.",
      nextStep: "Tune corner correction or collision leniency so visually clean routes fail for real spacing errors, not for brittle geometry edge cases.",
    });
  }

  const missingGraceSignals = [
    forgiveness.coyoteTimePresent,
    forgiveness.inputBufferPresent,
    forgiveness.graceWindowsConsistent,
  ].every((value) => value === false);
  if (missingGraceSignals) {
    findings.push({
      severity: "major",
      title: "timing grace is absent or inconsistent where precision demand stays high",
      evidence:
        forgiveness.notes ??
        "no logged coyote time, input buffer, or consistent grace window surfaced in the sampled precision moments.",
      nextStep: "Add one small consistent timing grace window at the harsh edge the player repeatedly hits, then retest whether the same challenge stays demanding but fair.",
    });
  }

  if (
    forgiveness.retryClarifiesMissedTiming === false ||
    learningLoop.sameLessonStableAcrossRetries === false
  ) {
    findings.push({
      severity: "major",
      title: "retry does not convert the harsh miss into a learnable correction",
      evidence:
        failures[0]?.notes ??
        forgiveness.notes ??
        "retry evidence suggests the player still cannot tell whether the miss was deserved or stolen.",
      nextStep: "Keep the retry context stable and expose the real correction more clearly so the next attempt tests timing, not guesswork about hidden rules.",
    });
  }

  if (
    forgiveness.practiceWindowAvailable === false &&
    learningLoop.practiceWithoutFailure !== true &&
    recovery.assistOrSkipAvailable !== true &&
    recovery.difficultyAdjustableAfterFailure !== true
  ) {
    findings.push({
      severity: "minor",
      title: "harsh timing demand lacks a lower-punishment rehearsal path",
      evidence:
        "No logged practice window, mechanic-level assist, or lower-pressure path backs up the sampled brittle timing moments.",
      nextStep: "Expose a practice, assist, or lower-punishment variant when the loop still asks for tight timing after forgiveness tuning.",
    });
  }

  if (findings.length === 0) {
    findings.push({
      severity: "minor",
      title: "sampled forgiveness reads fair and learnable in the observed moments",
      evidence:
        forgiveness.notes ??
        "logged moments preserved intent without obvious stolen fails or collision brittleness in the sampled run.",
      nextStep: "Keep future tuning inside the same intent-preserving envelope so extra challenge does not reintroduce fake punishment.",
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

function buildForgivenessSection(data: ObservationFile): string[] {
  const forgiveness = data.forgiveness ?? {};
  return [
    `- Coyote time present: ${boolLabel(forgiveness.coyoteTimePresent)}.`,
    `- Input buffer present: ${boolLabel(forgiveness.inputBufferPresent)}.`,
    `- Corner correction present: ${boolLabel(forgiveness.cornerCorrectionPresent)}.`,
    `- Collision leniency fair: ${boolLabel(forgiveness.collisionLeniencyFair)}.`,
    `- Grace windows consistent: ${boolLabel(forgiveness.graceWindowsConsistent)}.`,
    `- Dropped intent caused failures: ${boolLabel(forgiveness.droppedIntentCausedFailures)}.`,
    `- Failure felt stolen: ${boolLabel(forgiveness.failFeelsStolen)}.`,
    `- Retry clarified missed timing: ${boolLabel(forgiveness.retryClarifiesMissedTiming)}.`,
    `- Practice window available: ${boolLabel(forgiveness.practiceWindowAvailable)}.`,
    `- Notes: ${forgiveness.notes ?? "none logged"}.`,
  ];
}

function buildMomentSection(moments: ForgivenessMomentObservation[]): string[] {
  if (moments.length === 0) {
    return ["- No forgiveness moments recorded yet."];
  }

  return moments.map((moment) => {
    const parts = [
      `at ${moment.at ?? "unknown"}`,
      `challenge ${moment.challenge ?? "unknown"}`,
      `type ${moment.forgivenessType ?? "unknown"}`,
      `intent ${moment.playerIntent ?? "unknown"}`,
      `intent preserved ${boolLabel(moment.intentPreserved)}`,
      `outcome ${moment.outcome ?? "unknown"}`,
      `retry clarified ${boolLabel(moment.retryClarifiedCorrection)}`,
      `notes ${moment.notes ?? "none"}`,
    ];
    return `- ${parts.join("; ")}.`;
  });
}

function buildFailureSection(failures: FailureObservation[], learningLoop: LearningLoopObservation): string[] {
  if (failures.length === 0) {
    return [
      `- No harsh fail sample logged yet. Practice without failure: ${boolLabel(learningLoop.practiceWithoutFailure)}.`,
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
        `source visible on fail ${boolLabel(failure.sourceVisibleOnFail)}`,
        `returns to relevant decision ${boolLabel(failure.returnsToRelevantDecision)}`,
        `repeated penalty from single mistake ${boolLabel(failure.repeatedPenaltyFromSingleMistake)}`,
        `retry context stable ${boolLabel(failure.retryContextStable)}`,
        `notes ${failure.notes ?? "none"}`,
      ];
      return `- ${parts.join("; ")}.`;
    }),
    `- Practice without failure: ${boolLabel(learningLoop.practiceWithoutFailure)}.`,
    `- Same skill retested quickly: ${boolLabel(learningLoop.sameSkillRetestedQuickly)}.`,
    `- Same lesson stable across retries: ${boolLabel(learningLoop.sameLessonStableAcrossRetries)}.`,
  ];
}

function buildRecoverySection(recovery: RecoverySupportObservation): string[] {
  return [
    `- Quick start after failure: ${boolLabel(recovery.quickStartAfterFailure)}.`,
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
      `- ${game}: forgiveness review should preserve starter claim guardrails in this catalog because one fair or stolen timing sample can prove a local intent-preservation issue without proving the whole control model is solved.`,
    ];
  }

  if (findings.some((finding) => finding.title === "loop drops plausible player intent at the decisive edge-timing moment")) {
    return [
      `- ${game}: hard browser-game movement feels fair when small consistent grace windows preserve plausible intent, because challenge should come from the demand itself rather than from dropped edge timing or brittle collision reads.`,
    ];
  }

  if (findings.some((finding) => finding.title === "collision or corner rules punish near-clean paths too harshly")) {
    return [
      `- ${game}: collision forgiveness should protect visually clean lines, because players read corner snags as stolen failures even when the broader movement challenge is good.`,
    ];
  }

  return [
    `- ${game}: forgiveness is strongest when coyote time, buffering, and collision leniency quietly preserve obvious intent without making success feel automatic or mushy.`,
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
  const starterNextEvidence = getStarterNextEvidence(data).filter((item) => item !== "none");

  return [
    `# ${game} Forgiveness Audit`,
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
    "## Forgiveness Frame",
    "",
    ...buildForgivenessSection(data),
    "",
    "## Forgiveness Moments",
    "",
    ...buildMomentSection(getMoments(data)),
    "",
    "## Harsh Fails And Retry Read",
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
