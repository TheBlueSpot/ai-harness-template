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

type FailureObservation = {
  at?: string;
  incidentTag?: string;
  cause?: string;
  causeReadable?: boolean;
  correctiveActionClear?: boolean;
  retrySeconds?: number;
  menuLayersBeforeRetry?: number;
  checkpointLossSeconds?: number;
  sourceVisibleOnFail?: boolean;
  returnsToRelevantDecision?: boolean;
  repeatedPenaltyFromSingleMistake?: boolean;
  controlRecoveredBeforeNextHit?: boolean;
  retryContextStable?: boolean;
  impact?: "low" | "medium" | "high";
  persistence?: "one-off" | "repeatable" | "constant";
  notes?: string;
};

type FailStateObservation = {
  blockingOverlayDuringDeath?: boolean;
  futurePathVisible?: boolean;
  objectiveReminderAvailableAfterFail?: boolean;
};

type PressureObservation = {
  newThreatBeforeMastery?: boolean;
  overlapSpike?: boolean;
  telegraphReadable?: boolean;
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

type AttributionProbeObservation = {
  testedOnFailureIndex?: number;
  canStateCauseInOneSentence?: boolean;
  canStateCorrectionInOneSentence?: boolean;
  blamedClutterOrAmbiguity?: boolean;
  notes?: string;
};

type EvidenceObservation = {
  mode?: "direct-play" | "captured-video" | "code-inference" | "mixed";
  sampledFailures?: number;
  sampledRetries?: number;
  sampledResumeProbes?: number;
  notes?: string[];
};

type ConfounderObservation = {
  inputCertainty?: "stable" | "minor-slip" | "major-slip";
  responseLatency?: "stable" | "borderline" | "late";
  cameraSupportsAction?: boolean;
  viewObstructedAtDecision?: boolean;
  autoCameraInterference?: boolean;
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

type ProbeOutcomeObservation = {
  probe?: "first-contact" | "busy-frame" | "fail-retry" | "interruption-resume" | "contact-payoff";
  goal?: string;
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
  lenses?: ("onboarding" | "hud" | "pacing" | "failure" | "impact")[];
  firstSeenAt?: string;
  repeatedCount?: number;
  impact?: "low" | "medium" | "high";
  persistence?: "one-off" | "repeatable" | "constant";
  playerCost?: ("confusion" | "damage" | "death" | "dead-time" | "lost-reward" | "attention-tax")[];
  nextCheck?: string;
  notes?: string;
};

type ObservationFile = {
  game?: string;
  sessionDate?: string;
  failures?: FailureObservation[];
  failState?: FailStateObservation;
  pressure?: PressureObservation;
  learningLoop?: LearningLoopObservation;
  recoverySupport?: RecoverySupportObservation;
  attributionProbe?: AttributionProbeObservation;
  confounders?: ConfounderObservation;
  evidence?: EvidenceObservation;
  resumeProbes?: ResumeProbeObservation[];
  probeOutcomes?: ProbeOutcomeObservation[];
  incidents?: IncidentObservation[];
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

function averageRetrySeconds(failures: FailureObservation[]): number | undefined {
  const retryTimes = failures
    .map((failure) => failure.retrySeconds)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  if (retryTimes.length === 0) {
    return undefined;
  }

  const total = retryTimes.reduce((sum, value) => sum + value, 0);
  return Math.round((total / retryTimes.length) * 10) / 10;
}

function averageNumber(values: Array<number | undefined>): number | undefined {
  const valid = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (valid.length === 0) {
    return undefined;
  }

  const total = valid.reduce((sum, value) => sum + value, 0);
  return Math.round((total / valid.length) * 10) / 10;
}

function failureCount(failures: FailureObservation[], predicate: (failure: FailureObservation) => boolean): number {
  return failures.filter(predicate).length;
}

function countWhere<T>(items: T[], predicate: (item: T) => boolean): number {
  return items.filter(predicate).length;
}

function formatEvidenceCount(count: number, total: number, fallback = "sample"): string {
  if (total <= 0) {
    return fallback;
  }
  return `${count}/${total} failures`;
}

function formatCount(count: number, total: number, label: string): string {
  if (total <= 0) {
    return `${count} ${label}`;
  }
  return `${count}/${total} ${label}`;
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

type Finding = {
  severity: Severity;
  title: string;
  evidence: string;
  nextStep: string;
};

type IncidentCluster = {
  tag: string;
  count: number;
  unreadableCount: number;
  repeatedPenaltyCount: number;
  unstableRetryCount: number;
  highImpactCount: number;
  constantPersistenceCount: number;
};

const skillLearningPath = resolve(__dirname, "..", "LEARNINGS.md");

function buildTemplate(): string {
  return [
    "# Failure Loop Audit Template",
    "",
    "Use during fail-and-retry browser play.",
    "",
    "## Core Checks",
    "",
    "- Fail state answers what killed player.",
    "- Fail state suggests what player should try next.",
    "- First meaningful death should leave a one-sentence cause and one-sentence correction, not a clutter-driven shrug.",
    "- Retry stays short and menu depth stays low.",
    "- Next attempt returns near same lesson instead of long dead time.",
    "- One mistake should not chain into repeated punishment before control returns.",
    "- Retry should bring back a stable lesson, not a different random problem.",
    "- New pressure layers arrive in sequence, not abrupt overlap spikes.",
    "- Replay path stays one action away after failure.",
    "- Practice, hints, or difficulty recovery support exists when loop is harsh.",
    "- Short interruption after failure should not erase goal, controls, or next action.",
    "- Camera, visibility, or response drift should be logged as confounders instead of silently becoming fake failure difficulty.",
    "",
    "## Observation JSON",
    "",
    "```json",
    JSON.stringify(
      {
        game: "some-game",
        sessionDate: "2026-04-29",
        failures: [
          {
            at: "01:42",
            incidentTag: "late-second-spike-lane",
            cause: "late jump into second spike lane",
            causeReadable: true,
            correctiveActionClear: true,
            retrySeconds: 4,
            menuLayersBeforeRetry: 0,
            checkpointLossSeconds: 2,
            sourceVisibleOnFail: true,
            returnsToRelevantDecision: true,
            repeatedPenaltyFromSingleMistake: false,
            controlRecoveredBeforeNextHit: true,
            retryContextStable: true,
            impact: "medium",
            persistence: "one-off",
            notes: "death read was clear from spike lane and landing miss",
          },
        ],
        failState: {
          blockingOverlayDuringDeath: false,
          futurePathVisible: true,
          objectiveReminderAvailableAfterFail: true,
        },
        pressure: {
          newThreatBeforeMastery: false,
          overlapSpike: false,
          telegraphReadable: true,
        },
        learningLoop: {
          immediateRetry: true,
          practiceWithoutFailure: false,
          sameSkillRetestedQuickly: true,
          sameLessonStableAcrossRetries: true,
        },
        recoverySupport: {
          quickStartAfterFailure: true,
          difficultyAdjustableAfterFailure: true,
          assistOrSkipAvailable: false,
          tutorialOrHintReopenable: true,
        },
        attributionProbe: {
          testedOnFailureIndex: 1,
          canStateCauseInOneSentence: true,
          canStateCorrectionInOneSentence: true,
          blamedClutterOrAmbiguity: false,
          notes: "player can say dashed late into the second spike lane and should jump earlier on the retry",
        },
        confounders: {
          inputCertainty: "stable",
          responseLatency: "stable",
          cameraSupportsAction: true,
          viewObstructedAtDecision: false,
          autoCameraInterference: false,
          notes: "death readability problem came from hazard overlap, not camera drift",
        },
        evidence: {
          mode: "direct-play",
          sampledFailures: 1,
          sampledRetries: 1,
          sampledResumeProbes: 1,
          notes: ["captured one full fail-retry cycle on first world"],
        },
        resumeProbes: [
          {
            breakType: "after-failure",
            secondsAway: 20,
            resumeSurface: "death screen",
            currentGoalRecoverable: true,
            controlsRecoverable: true,
            nextActionClear: true,
            needsMenuDive: false,
            stalePromptMismatch: false,
            notes: "retry and next lesson stay obvious after a short break",
          },
        ],
        probeOutcomes: [
          {
            probe: "fail-retry",
            goal: "die once, restart, and retest the same lesson",
            outcome: "success",
            successRating: 4,
            confidence: 6,
            satisfaction: 6,
            frustration: 2,
            mentalDemand: 3,
            timePressure: 4,
            effort: 3,
            blockers: [],
            notes: "restart is immediate and preserves the same correction test",
          },
        ],
        incidents: [
          {
            incidentTag: "late-second-spike-lane",
            title: "late second spike lane punishes landing greed",
            lenses: ["failure", "pacing"],
            firstSeenAt: "01:42",
            repeatedCount: 1,
            impact: "medium",
            persistence: "one-off",
            playerCost: ["death"],
            nextCheck: "confirm the telegraph still teaches on a second replay",
            notes: "clear lesson, not a systemic trap",
          },
        ],
        strengths: ["instant retry keeps player on same challenge"],
        frictions: ["no low-risk practice for new enemy pattern"],
      },
      null,
      2,
    ),
    "```",
    "",
  ].join("\n");
}

function buildFindings(data: ObservationFile): Finding[] {
  const failures = data.failures ?? [];
  const failState = data.failState ?? {};
  const pressure = data.pressure ?? {};
  const learningLoop = data.learningLoop ?? {};
  const recoverySupport = data.recoverySupport ?? {};
  const attributionProbe = data.attributionProbe ?? {};
  const resumeProbes = data.resumeProbes ?? [];
  const confounders = data.confounders ?? {};
  const probeOutcomes = data.probeOutcomes ?? [];
  const avgRetry = averageRetrySeconds(failures);
  const avgMenuLayers = averageNumber(failures.map((failure) => failure.menuLayersBeforeRetry));
  const avgCheckpointLoss = averageNumber(failures.map((failure) => failure.checkpointLossSeconds));
  const unreadableFailures = failureCount(failures, (failure) => failure.causeReadable === false);
  const unclearFixFailures = failureCount(failures, (failure) => failure.correctiveActionClear === false);
  const farResetFailures = failureCount(failures, (failure) => failure.returnsToRelevantDecision === false);
  const hiddenSourceFailures = failureCount(failures, (failure) => failure.sourceVisibleOnFail === false);
  const blockingReadFailures = failureCount(
    failures,
    (failure) => failure.causeReadable === false && failure.correctiveActionClear === false,
  );
  const repeatedPenaltyFailures = failureCount(
    failures,
    (failure) => failure.repeatedPenaltyFromSingleMistake === true,
  );
  const noRecoveryFailures = failureCount(
    failures,
    (failure) => failure.controlRecoveredBeforeNextHit === false,
  );
  const unstableRetryFailures = failureCount(
    failures,
    (failure) => failure.retryContextStable === false,
  );
  const failedResumeProbes = countWhere(
    resumeProbes,
    (probe) =>
      probe.currentGoalRecoverable === false ||
      probe.controlsRecoverable === false ||
      probe.nextActionClear === false ||
      probe.needsMenuDive === true ||
      probe.stalePromptMismatch === true,
  );
  const highLoadFailRetryProbes = countWhere(
    probeOutcomes,
    (probe) =>
      probe.probe === "fail-retry" &&
      ((typeof probe.mentalDemand === "number" && probe.mentalDemand >= 6) ||
        (typeof probe.timePressure === "number" && probe.timePressure >= 6) ||
        (typeof probe.effort === "number" && probe.effort >= 6)),
  );
  const failureConfounded =
    confounders.viewObstructedAtDecision === true ||
    confounders.autoCameraInterference === true ||
    confounders.inputCertainty === "major-slip" ||
    confounders.responseLatency === "late";
  const incidentClusters = buildIncidentClusters(failures);
  const repeatedIncidentClusters = incidentClusters.filter((cluster) => cluster.count >= 2);
  const severeIncidentClusters = incidentClusters.filter(
    (cluster) =>
      cluster.count >= 2 &&
      (cluster.highImpactCount > 0 || cluster.constantPersistenceCount > 0 || cluster.repeatedPenaltyCount > 0),
  );

  const findings: Finding[] = [];

  if (severeIncidentClusters.length > 0) {
    const worstCluster = severeIncidentClusters[0];
    findings.push({
      severity: "blocker",
      title: "same bad death pattern repeats with high stakes before the player can learn through it",
      evidence: `${worstCluster.tag} repeated ${worstCluster.count} times with ${worstCluster.highImpactCount}/${worstCluster.count} high-impact and ${worstCluster.constantPersistenceCount}/${worstCluster.count} persistent logs.`,
      nextStep: "Fix the repeated incident first and retest until the same tagged failure either disappears or becomes readable enough to teach a stable correction.",
    });
  } else if (repeatedIncidentClusters.length > 0) {
    const worstCluster = repeatedIncidentClusters[0];
    findings.push({
      severity: "major",
      title: "same failure pattern repeats often enough to outrank one-off friction",
      evidence: `${worstCluster.tag} repeated ${worstCluster.count} times in the captured sample.`,
      nextStep: "Prioritize the repeated incident before isolated polish issues and confirm whether telegraph, spacing, or restart setup is causing the repetition.",
    });
  }

  if (blockingReadFailures > 0) {
    findings.push({
      severity: "blocker",
      title: "fail cause and fix are not legible enough to teach the next attempt",
      evidence: `${formatEvidenceCount(blockingReadFailures, failures.length)} hid both the death cause and the likely correction.`,
      nextStep: "Expose the lethal lane, timing miss, or collision path in the death beat itself so the player can name the fix before retry.",
    });
  }

  if (
    attributionProbe.canStateCauseInOneSentence === false &&
    attributionProbe.canStateCorrectionInOneSentence === false
  ) {
    findings.push({
      severity: "blocker",
      title: "first failure is not attributable enough to explain cause or correction in one sentence",
      evidence: `Attribution probe on failure ${attributionProbe.testedOnFailureIndex ?? 1} could not state the cause or the next correction in one sentence; clutter or ambiguity blamed ${boolLabel(attributionProbe.blamedClutterOrAmbiguity)}.`,
      nextStep: "Simplify the death beat until the player can name what killed them and what to try next without replaying the whole event in memory.",
    });
  } else if (
    attributionProbe.canStateCauseInOneSentence === false ||
    attributionProbe.canStateCorrectionInOneSentence === false
  ) {
    findings.push({
      severity: "major",
      title: "first failure is only partly attributable",
      evidence: `Attribution probe on failure ${attributionProbe.testedOnFailureIndex ?? 1} reported cause in one sentence ${boolLabel(attributionProbe.canStateCauseInOneSentence)} and correction in one sentence ${boolLabel(attributionProbe.canStateCorrectionInOneSentence)}.`,
      nextStep: "Tighten telegraph, lane exposure, or hit feedback so the first death leaves a clean one-sentence lesson instead of a vague guess.",
    });
  }

  if (failState.blockingOverlayDuringDeath === true && hiddenSourceFailures > 0) {
    findings.push({
      severity: "blocker",
      title: "death presentation hides lethal source during fail beat",
      evidence: `Blocking overlay during death was logged, and ${formatEvidenceCount(hiddenSourceFailures, failures.length)} hid source visibility.`,
      nextStep: "Keep lethal lane, hit source, or collision future-path visible through death beat before any overlay or tally takes focus.",
    });
  }

  if (typeof avgRetry === "number" && avgRetry > 12) {
    findings.push({
      severity: "blocker",
      title: "retry path is long enough to break sticky arcade momentum",
      evidence: `Average retry time was ${avgRetry}s across ${failures.length || 1} logged failures.`,
      nextStep: "Cut post-fail dead time, skip non-core tally screens, and restart near the failed decision.",
    });
  } else if (typeof avgRetry === "number" && avgRetry > 8) {
    findings.push({
      severity: "major",
      title: "retry friction cools the lesson before the player can test it again",
      evidence: `Average retry time was ${avgRetry}s across ${failures.length || 1} logged failures.`,
      nextStep: "Shorten fail-to-retry path so the corrected input can be tested while memory is still warm.",
    });
  }

  if (typeof avgMenuLayers === "number" && avgMenuLayers >= 2) {
    findings.push({
      severity: "major",
      title: "replay is buried behind too much menu depth",
      evidence: `Average menu layers before retry was ${avgMenuLayers}.`,
      nextStep: "Expose one-action replay from fail state or pause instead of routing through stacked menus or confirm screens.",
    });
  }

  if (farResetFailures > 0) {
    findings.push({
      severity: farResetFailures >= 2 ? "blocker" : "major",
      title: "retries return too far upstream from the relevant decision",
      evidence: `${formatEvidenceCount(farResetFailures, failures.length)} sent the player back through dead time before the same test.`,
      nextStep: "Move checkpoints, wave restarts, or room resets closer to the skill that actually failed.",
    });
  }

  if (repeatedPenaltyFailures > 0) {
    const severity: Severity = noRecoveryFailures > 0 || repeatedPenaltyFailures >= 2 ? "blocker" : "major";
    findings.push({
      severity,
      title: "one mistake chains into repeated punishment before the player can respond again",
      evidence: `${formatEvidenceCount(repeatedPenaltyFailures, failures.length)} logged repeated punishment from a single error; ${formatEvidenceCount(noRecoveryFailures, failures.length)} did not recover control before the next hit.`,
      nextStep: "Add post-hit invulnerability, spacing, knockback recovery, or lane clear so one mistake costs one lesson instead of a helpless cascade.",
    });
  }

  if (typeof avgCheckpointLoss === "number" && avgCheckpointLoss > 15) {
    findings.push({
      severity: "blocker",
      title: "retry loses too much solved progress before same lesson returns",
      evidence: `Average checkpoint loss before same skill was ${avgCheckpointLoss}s.`,
      nextStep: "Move checkpoint, wave restart, or room reset closer so player retests failed decision without replaying long solved stretches.",
    });
  } else if (typeof avgCheckpointLoss === "number" && avgCheckpointLoss > 8) {
    findings.push({
      severity: "major",
      title: "checkpoint loss adds dead time before relevant retry",
      evidence: `Average checkpoint loss before same skill was ${avgCheckpointLoss}s.`,
      nextStep: "Trim pre-challenge dead time so same lesson comes back while correction still fresh.",
    });
  }

  if (pressure.telegraphReadable === false && (pressure.newThreatBeforeMastery === true || pressure.overlapSpike === true)) {
    findings.push({
      severity: "blocker",
      title: "pressure stack asks for unreadable responses under overlap",
      evidence: "New threat before mastery, overlap spike, and unreadable telegraph were all logged together.",
      nextStep: "Sequence one new demand at a time and show future collision or dodge path before pressure overlaps.",
    });
  } else if (pressure.newThreatBeforeMastery === true || pressure.overlapSpike === true) {
    findings.push({
      severity: "major",
      title: "pressure escalates before earlier reads feel stable",
      evidence: `New threat before mastery ${boolLabel(pressure.newThreatBeforeMastery)}; overlap spike ${boolLabel(pressure.overlapSpike)}.`,
      nextStep: "Delay overlap pressure until the prior threat is readable and repeatable on its own.",
    });
  } else if (pressure.telegraphReadable === false) {
    findings.push({
      severity: "major",
      title: "telegraphs arrive too late or too vaguely to preserve player choice",
      evidence: "Telegraph readability was logged as no.",
      nextStep: "Show the required response earlier through lane markers, windup pose, safer contrast, or simpler framing.",
    });
  }

  if (learningLoop.immediateRetry === false || learningLoop.sameSkillRetestedQuickly === false) {
    findings.push({
      severity: learningLoop.immediateRetry === false && learningLoop.sameSkillRetestedQuickly === false ? "blocker" : "major",
      title: "the next attempt does not quickly retest the failed skill",
      evidence: `Immediate retry ${boolLabel(learningLoop.immediateRetry)}; same skill retested quickly ${boolLabel(learningLoop.sameSkillRetestedQuickly)}.`,
      nextStep: "Return the player to the same skill check quickly instead of making them clear solved downtime first.",
    });
  }

  if (learningLoop.sameLessonStableAcrossRetries === false || unstableRetryFailures > 0) {
    findings.push({
      severity:
        learningLoop.sameLessonStableAcrossRetries === false &&
        (learningLoop.sameSkillRetestedQuickly === false || unstableRetryFailures >= 2)
          ? "blocker"
          : "major",
      title: "retry does not preserve a stable lesson to test the intended fix",
      evidence: `Same lesson stable across retries ${boolLabel(learningLoop.sameLessonStableAcrossRetries)}; ${formatEvidenceCount(unstableRetryFailures, failures.length)} changed pressure, setup, or context too much on retry.`,
      nextStep: "Stabilize restart state, spawn order, or re-entry setup long enough that the player can retry the same lesson and verify a correction.",
    });
  }

  if (recoverySupport.quickStartAfterFailure === false && (typeof avgRetry !== "number" || avgRetry > 5)) {
    findings.push({
      severity: typeof avgRetry === "number" && avgRetry > 8 ? "major" : "minor",
      title: "restart flow lacks a quick-start path after failure",
      evidence: `Quick start after failure ${boolLabel(recoverySupport.quickStartAfterFailure)}; average retry ${typeof avgRetry === "number" ? `${avgRetry}s` : "unknown"}.`,
      nextStep: "Expose a one-action replay path from death or pause so players can re-enter the same challenge without extra menu depth.",
    });
  }

  if (failState.objectiveReminderAvailableAfterFail === false && recoverySupport.tutorialOrHintReopenable === false) {
    findings.push({
      severity: findings.some((finding) => finding.severity === "blocker") ? "major" : "minor",
      title: "failure loop offers no quick reminder of next step or mechanic",
      evidence: `Objective reminder after fail ${boolLabel(failState.objectiveReminderAvailableAfterFail)}; tutorial or hint reopenable ${boolLabel(recoverySupport.tutorialOrHintReopenable)}.`,
      nextStep: "Expose concise hint refresh, goal reminder, or reopenable tutorial from fail or pause so confusion does not compound after death.",
    });
  }

  if (unreadableFailures > 0 && blockingReadFailures === 0) {
    findings.push({
      severity: "major",
      title: "some fail states muddy the cause of death",
      evidence: `${formatEvidenceCount(unreadableFailures, failures.length)} had a weak death read.`,
      nextStep: "Tighten camera framing, contrast, or hit feedback so the failure source reads in one glance.",
    });
  }

  if (unclearFixFailures > 0 && blockingReadFailures === 0) {
    findings.push({
      severity: "major",
      title: "some fail states do not suggest what to try next",
      evidence: `${formatEvidenceCount(unclearFixFailures, failures.length)} lacked a clear corrective action.`,
      nextStep: "Make the demanded response explicit through earlier telegraph, safer practice beat, or clearer outcome feedback.",
    });
  }

  if (learningLoop.practiceWithoutFailure === false) {
    findings.push({
      severity: findings.length === 0 ? "major" : "minor",
      title: "no low-punishment rehearsal path was logged",
      evidence: "Practice without failure was logged as no.",
      nextStep: "Add a training pocket, softer first-use beat, or assist setting when the loop stays harsh.",
    });
  }

  if (
    learningLoop.practiceWithoutFailure === false &&
    recoverySupport.difficultyAdjustableAfterFailure === false &&
    recoverySupport.assistOrSkipAvailable === false
  ) {
    findings.push({
      severity: findings.some((finding) => finding.severity === "blocker") ? "major" : "minor",
      title: "failed runs lack recovery supports when current demand is too harsh",
      evidence: `Practice without failure ${boolLabel(learningLoop.practiceWithoutFailure)}; difficulty adjustable after failure ${boolLabel(recoverySupport.difficultyAdjustableAfterFailure)}; assist or skip available ${boolLabel(recoverySupport.assistOrSkipAvailable)}.`,
      nextStep: "Offer difficulty, assist, or bypass choices from pause or death without wiping progress so failure can stay inside the learning loop.",
    });
  }

  if (failedResumeProbes > 0) {
    findings.push({
      severity: countWhere(resumeProbes, (probe) => probe.needsMenuDive === true || probe.stalePromptMismatch === true) > 0 ? "major" : "minor",
      title: "short interruption after failure makes the next lesson harder to recover",
      evidence: `${formatCount(failedResumeProbes, resumeProbes.length, "resume probes")} lost goal, controls, next action, or needed menu recovery after a short break.`,
      nextStep: "Keep retry, goal, and control reminders visible enough that a short interruption does not turn failure into memory tax.",
    });
  }

  if (highLoadFailRetryProbes > 0 && typeof avgRetry === "number" && avgRetry > 5) {
    findings.push({
      severity: "major",
      title: "retry technically works but still loads the player too hard",
      evidence: `${formatCount(highLoadFailRetryProbes, probeOutcomes.length, "probe outcomes")} logged fail-retry success under high mental demand, time pressure, or effort while average retry was ${avgRetry}s.`,
      nextStep: "Trim restart friction or simplify the post-fail read so retry stays teachable without overload.",
    });
  }

  if (failureConfounded) {
    findings.push({
      severity: "major",
      title: "control or view instability confounds the failure-loop read",
      evidence: `Input certainty ${confounders.inputCertainty ?? "unknown"}; response latency ${confounders.responseLatency ?? "unknown"}; view obstructed ${boolLabel(confounders.viewObstructedAtDecision)}; auto-camera interference ${boolLabel(confounders.autoCameraInterference)}.`,
      nextStep: "Stabilize camera, visibility, or response timing before blaming death readability or retry harshness on loop design alone.",
    });
  }

  return findings.sort((left, right) => severityRank(left.severity) - severityRank(right.severity));
}

function buildIncidentClusters(failures: FailureObservation[]): IncidentCluster[] {
  const buckets = new Map<string, IncidentCluster>();

  for (const failure of failures) {
    const tag = failure.incidentTag?.trim() || failure.cause?.trim() || "untagged-failure";
    const cluster = buckets.get(tag) ?? {
      tag,
      count: 0,
      unreadableCount: 0,
      repeatedPenaltyCount: 0,
      unstableRetryCount: 0,
      highImpactCount: 0,
      constantPersistenceCount: 0,
    };

    cluster.count += 1;
    if (failure.causeReadable === false) {
      cluster.unreadableCount += 1;
    }
    if (failure.repeatedPenaltyFromSingleMistake === true) {
      cluster.repeatedPenaltyCount += 1;
    }
    if (failure.retryContextStable === false) {
      cluster.unstableRetryCount += 1;
    }
    if (failure.impact === "high") {
      cluster.highImpactCount += 1;
    }
    if (failure.persistence === "constant") {
      cluster.constantPersistenceCount += 1;
    }

    buckets.set(tag, cluster);
  }

  return Array.from(buckets.values()).sort((left, right) => {
    if (right.count !== left.count) {
      return right.count - left.count;
    }
    if (right.highImpactCount !== left.highImpactCount) {
      return right.highImpactCount - left.highImpactCount;
    }
    return right.constantPersistenceCount - left.constantPersistenceCount;
  });
}

function buildFindingsSection(findings: Finding[]): string[] {
  if (findings.length === 0) {
    return ["- `minor` no major failure-loop breakdown logged in supplied observations."];
  }

  return findings.map((finding) => `- \`${finding.severity}\` ${finding.title}. Evidence: ${finding.evidence}`);
}

function buildEvidenceSection(data: ObservationFile): string[] {
  const evidence = data.evidence ?? {};
  const failures = data.failures ?? [];
  const sampledFailures = evidence.sampledFailures ?? failures.length;
  const sampledRetries = evidence.sampledRetries ?? failures.length;
  const lines = [
    `- Evidence mode: ${evidence.mode ?? "unknown"}.`,
    `- Failures sampled: ${sampledFailures || 0}.`,
    `- Retries sampled: ${sampledRetries || 0}.`,
    `- Resume probes sampled: ${evidence.sampledResumeProbes ?? data.resumeProbes?.length ?? 0}.`,
    `- Probe outcomes sampled: ${data.probeOutcomes?.length ?? 0}.`,
    `- Incident tags logged: ${data.incidents?.length ?? 0}.`,
  ];

  if (evidence.notes && evidence.notes.length > 0) {
    for (const note of evidence.notes) {
      lines.push(`- Evidence note: ${note}`);
    }
  }

  return lines;
}

function buildFailureSection(failures: FailureObservation[]): string[] {
  if (failures.length === 0) {
    return ["- No failure observations recorded yet."];
  }

  return failures.map((failure, index) => {
    const parts = [
      `fail ${index + 1}`,
      `time ${failure.at ?? "unknown"}`,
      `incident ${failure.incidentTag ?? failure.cause ?? "untagged-failure"}`,
      `cause ${failure.cause ?? "unknown"}`,
      `readable ${boolLabel(failure.causeReadable)}`,
      `fix clear ${boolLabel(failure.correctiveActionClear)}`,
      `source visible ${boolLabel(failure.sourceVisibleOnFail)}`,
      `retry ${typeof failure.retrySeconds === "number" ? `${failure.retrySeconds}s` : "unknown"}`,
      `menu layers ${typeof failure.menuLayersBeforeRetry === "number" ? `${failure.menuLayersBeforeRetry}` : "unknown"}`,
      `checkpoint loss ${typeof failure.checkpointLossSeconds === "number" ? `${failure.checkpointLossSeconds}s` : "unknown"}`,
      `returns near decision ${boolLabel(failure.returnsToRelevantDecision)}`,
      `single mistake chains punishment ${boolLabel(failure.repeatedPenaltyFromSingleMistake)}`,
      `control recovered before next hit ${boolLabel(failure.controlRecoveredBeforeNextHit)}`,
      `retry context stable ${boolLabel(failure.retryContextStable)}`,
      `impact ${failure.impact ?? "unknown"}`,
      `persistence ${failure.persistence ?? "unknown"}`,
      `notes ${failure.notes ?? "none"}`,
    ];
    return `- ${parts.join("; ")}.`;
  });
}

function buildIncidentSection(failures: FailureObservation[]): string[] {
  const clusters = buildIncidentClusters(failures);
  if (clusters.length === 0) {
    return ["- No repeatable incident tags logged yet."];
  }

  return clusters.map((cluster) => {
    const parts = [
      `incident ${cluster.tag}`,
      `count ${cluster.count}`,
      `unreadable ${cluster.unreadableCount}`,
      `repeated punishment ${cluster.repeatedPenaltyCount}`,
      `unstable retry ${cluster.unstableRetryCount}`,
      `high impact ${cluster.highImpactCount}`,
      `constant persistence ${cluster.constantPersistenceCount}`,
    ];
    return `- ${parts.join("; ")}.`;
  });
}

function buildCrossLensIncidentSection(incidents: IncidentObservation[]): string[] {
  if (incidents.length === 0) {
    return ["- No shared incident queue rows recorded yet."];
  }

  return [...incidents]
    .sort((left, right) => (right.repeatedCount ?? 0) - (left.repeatedCount ?? 0))
    .map((incident) => {
      const parts = [
        `incident ${incident.incidentTag ?? incident.title ?? "untagged-incident"}`,
        `title ${incident.title ?? "none"}`,
        `lenses ${incident.lenses?.join(", ") ?? "none"}`,
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

function buildFailStateSection(failState: FailStateObservation): string[] {
  return [
    `- Blocking overlay or tally interrupts death read: ${boolLabel(failState.blockingOverlayDuringDeath)}.`,
    `- Future collision path or needed dodge lane stays visible: ${boolLabel(failState.futurePathVisible)}.`,
    `- Objective reminder available after failure: ${boolLabel(failState.objectiveReminderAvailableAfterFail)}.`,
  ];
}

function buildPressureSection(pressure: PressureObservation, failures: FailureObservation[]): string[] {
  const averageRetry = averageRetrySeconds(failures);
  const averageMenuLayers = averageNumber(failures.map((failure) => failure.menuLayersBeforeRetry));
  const averageCheckpointLoss = averageNumber(failures.map((failure) => failure.checkpointLossSeconds));

  return [
    `- Average retry time: ${typeof averageRetry === "number" ? `${averageRetry}s` : "unknown"}.`,
    `- Average menu layers before retry: ${typeof averageMenuLayers === "number" ? `${averageMenuLayers}` : "unknown"}.`,
    `- Average checkpoint loss before same lesson: ${typeof averageCheckpointLoss === "number" ? `${averageCheckpointLoss}s` : "unknown"}.`,
    `- New threat appears before prior mastery: ${boolLabel(pressure.newThreatBeforeMastery)}.`,
    `- Abrupt overlap spike present: ${boolLabel(pressure.overlapSpike)}.`,
    `- Telegraphs readable before required response: ${boolLabel(pressure.telegraphReadable)}.`,
  ];
}

function buildLearningSection(learningLoop: LearningLoopObservation): string[] {
  return [
    `- Immediate retry available: ${boolLabel(learningLoop.immediateRetry)}.`,
    `- Practice without failure exists: ${boolLabel(learningLoop.practiceWithoutFailure)}.`,
    `- Same skill retested quickly next attempt: ${boolLabel(learningLoop.sameSkillRetestedQuickly)}.`,
    `- Same lesson stable across retries: ${boolLabel(learningLoop.sameLessonStableAcrossRetries)}.`,
  ];
}

function buildRecoverySection(recoverySupport: RecoverySupportObservation): string[] {
  return [
    `- Quick start after failure available: ${boolLabel(recoverySupport.quickStartAfterFailure)}.`,
    `- Difficulty can be adjusted after failure or mid-run: ${boolLabel(recoverySupport.difficultyAdjustableAfterFailure)}.`,
    `- Assist, skip, or bypass option exists for non-core friction: ${boolLabel(recoverySupport.assistOrSkipAvailable)}.`,
    `- Tutorial or hint refresh can be reopened after failure: ${boolLabel(recoverySupport.tutorialOrHintReopenable)}.`,
  ];
}

function buildAttributionSection(attributionProbe: AttributionProbeObservation): string[] {
  return [
    `- Probe tested on failure: ${attributionProbe.testedOnFailureIndex ?? "unknown"}.`,
    `- Player can state cause in one sentence: ${boolLabel(attributionProbe.canStateCauseInOneSentence)}.`,
    `- Player can state correction in one sentence: ${boolLabel(attributionProbe.canStateCorrectionInOneSentence)}.`,
    `- Player blamed clutter or ambiguity instead of their own decision: ${boolLabel(attributionProbe.blamedClutterOrAmbiguity)}.`,
    `- Notes: ${attributionProbe.notes ?? "none logged"}.`,
  ];
}

function buildResumeSection(resumeProbes: ResumeProbeObservation[]): string[] {
  if (resumeProbes.length === 0) {
    return ["- No interruption or return-after-break probe recorded yet."];
  }

  return resumeProbes.map((probe) => {
    const parts = [
      `break ${probe.breakType ?? "unknown"}`,
      `seconds away ${probe.secondsAway ?? "unknown"}`,
      `resume surface ${probe.resumeSurface ?? "unknown"}`,
      `goal recoverable ${boolLabel(probe.currentGoalRecoverable)}`,
      `controls recoverable ${boolLabel(probe.controlsRecoverable)}`,
      `next action clear ${boolLabel(probe.nextActionClear)}`,
      `menu dive needed ${boolLabel(probe.needsMenuDive)}`,
      `stale prompt mismatch ${boolLabel(probe.stalePromptMismatch)}`,
    ];
    const suffix = probe.notes ? ` Notes: ${probe.notes}` : "";
    return `- ${parts.join("; ")}.${suffix}`;
  });
}

function buildProbeOutcomeSection(probeOutcomes: ProbeOutcomeObservation[]): string[] {
  if (probeOutcomes.length === 0) {
    return ["- No probe outcomes recorded yet."];
  }

  return probeOutcomes.map((probe) => {
    return `- ${probe.probe ?? "unknown-probe"}: outcome=${probe.outcome ?? "unknown"}; success rating=${formatRating(probe.successRating, 4)}; confidence=${formatRating(probe.confidence, 7)}; satisfaction=${formatRating(probe.satisfaction, 7)}; frustration=${formatRating(probe.frustration, 7, "-high")}; mental demand=${formatRating(probe.mentalDemand, 7, "-high")}; time pressure=${formatRating(probe.timePressure, 7, "-high")}; effort=${formatRating(probe.effort, 7, "-high")}; blockers=${probe.blockers?.join(", ") ?? "none"}; notes=${probe.notes ?? probe.goal ?? "none"}.`;
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
  const uniqueSteps = Array.from(new Set(findings.map((finding) => finding.nextStep)));
  if (uniqueSteps.length === 0) {
    return ["- Keep current failure loop and validate it against a longer play session."];
  }
  return uniqueSteps.map((step) => `- ${step}`);
}

function buildDurableLearning(data: ObservationFile, findings: Finding[]): string[] {
  const game = data.game ?? "this game";
  const blockerCount = findings.filter((finding) => finding.severity === "blocker").length;
  const majorCount = findings.filter((finding) => finding.severity === "major").length;
  const starterCoverageStatus = getStarterCoverageStatus(data);
  const hasResumeIssue = findings.some(
    (finding) => finding.title === "short interruption after failure makes the next lesson harder to recover",
  );
  const hasConfounderIssue = findings.some(
    (finding) => finding.title === "control or view instability confounds the failure-loop read",
  );
  const hasAttributionIssue = findings.some(
    (finding) =>
      finding.title === "first failure is not attributable enough to explain cause or correction in one sentence" ||
      finding.title === "first failure is only partly attributable",
  );

  if (findings.length === 0) {
    return [
      `- ${game}: keeping severity-ranked evidence in one schema still matters, because a clean pass today gives a comparable baseline for future sticky-arcade regressions.`,
    ];
  }

  if (starterCoverageStatus === "partial" || starterCoverageStatus === "missing") {
    return [
      `- ${game}: failure-loop review should carry starter claim guardrails in this catalog because one ugly death sample can prove a local breakdown without proving the whole loop is unfair; the audit needs to preserve that evidence ceiling.`,
    ];
  }

  if (hasResumeIssue) {
    return [
      `- ${game}: failure-loop review should save interruption-recovery evidence in this catalog because fast restart still feels bad when a short break after death erases the goal, controls, or next correction.`,
    ];
  }

  if (hasConfounderIssue) {
    return [
      `- ${game}: failure-loop review should save control and view confounders in this catalog because unreadable deaths can come from camera or response instability, and fixing retry flow first would target the wrong cause.`,
    ];
  }

  if (hasAttributionIssue) {
    return [
      `- ${game}: failure-loop review should preserve a one-sentence attribution probe in this catalog because sticky arcade deaths only teach when the player can immediately name what killed them and what to try next instead of blaming clutter or ambiguity.`,
    ];
  }

  return [
    `- ${game}: blocker-first failure-loop reporting matters for this catalog because sticky arcade games live or die on whether restart speed, readable deaths, and recovery supports keep the player inside the next learnable attempt; this run logged ${blockerCount} blocker(s) and ${majorCount} major finding(s) with explicit evidence counts instead of vibe-only notes.`,
  ];
}

function extractLearningLine(markdownLines: string[]): string | undefined {
  const learningLine = markdownLines.find((line) => line.startsWith("- "));
  return learningLine;
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
  const hasHeader = lines[0] === header;
  const bodyLines = hasHeader ? lines.slice(1).filter((line) => line.trim().length > 0) : lines.filter((line) => line.trim().length > 0);

  if (bodyLines.includes(learningLine)) {
    return;
  }

  const next = [
    header,
    "",
    ...bodyLines,
    learningLine,
    "",
  ].join("\n");

  writeFileSync(skillLearningPath, next, "utf8");
}

function buildMarkdown(data: ObservationFile): string {
  const game = data.game ?? "unknown-game";
  const sessionDate = data.sessionDate ?? new Date().toISOString().slice(0, 10);
  const failures = data.failures ?? [];
  const failState = data.failState ?? {};
  const pressure = data.pressure ?? {};
  const learningLoop = data.learningLoop ?? {};
  const recoverySupport = data.recoverySupport ?? {};
  const attributionProbe = data.attributionProbe ?? {};
  const resumeProbes = data.resumeProbes ?? [];
  const confounders = data.confounders ?? {};
  const probeOutcomes = data.probeOutcomes ?? [];
  const findings = buildFindings(data);
  const starterNextEvidence = getStarterNextEvidence(data).filter((item) => item !== "none");

  return [
    `# ${game} Failure Loop Audit`,
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
    "## Observation Frame",
    "",
    ...buildFailStateSection(failState),
    "",
    "## Failure Readability",
    "",
    ...buildFailureSection(failures),
    "",
    "## Incident Clusters",
    "",
    ...buildIncidentSection(failures),
    "",
    "## Shared Incident Queue",
    "",
    ...buildCrossLensIncidentSection(data.incidents ?? []),
    "",
    "## Retry And Pressure",
    "",
    ...buildPressureSection(pressure, failures),
    "",
    "## Learning Carryover",
    "",
    ...buildLearningSection(learningLoop),
    "",
    "## Recovery Supports",
    "",
    ...buildRecoverySection(recoverySupport),
    "",
    "## Failure Attribution",
    "",
    ...buildAttributionSection(attributionProbe),
    "",
    "## Interruption Recovery",
    "",
    ...buildResumeSection(resumeProbes),
    "",
    "## Probe Outcomes",
    "",
    ...buildProbeOutcomeSection(probeOutcomes),
    "",
    "## Control And View Confounders",
    "",
    ...buildConfounderSection(confounders),
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
