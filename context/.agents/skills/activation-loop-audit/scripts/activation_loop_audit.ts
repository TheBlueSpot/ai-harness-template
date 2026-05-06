import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { saveLearning } from "../../playtest-evidence-capture/scripts/learning_capture";
import {
  buildStarterGuardrailSection,
  getStarterCoverageStatus,
  getStarterNextEvidence,
  type ClaimGuardrail,
  type EvidenceSufficiency,
} from "./starter_guardrails";

type Severity = "blocker" | "major" | "minor";

type EvidenceObservation = {
  mode?: "direct-play" | "captured-video" | "code-inference" | "mixed";
  sampledRuns?: number;
  sampledFailures?: number;
  sampledRetries?: number;
  sampledResumeProbes?: number;
  notes?: string[];
};

type FirstContactObservation = {
  loopComplexity?: "low" | "medium" | "high";
  discoverableThroughExperiment?: boolean;
  firstObjectiveClear?: boolean;
  currentGoalEasyToRestate?: boolean;
  nextStepPrescriptive?: boolean;
  controlsReminderAvailable?: boolean;
  objectiveReminderAvailable?: boolean;
  progressSafeHelp?: boolean;
  remapSafe?: boolean;
  upfrontInstructionScreens?: number;
  promptsBeforeMeaningfulPlay?: number;
  blocksFirstMeaningfulInput?: boolean;
  forcedTutorialSteps?: number;
  optionalHelpOnDemand?: boolean;
};

type EarlyLoopObservation = {
  firstMeaningfulInputAt?: string;
  secondsToFirstMeaningfulInput?: number;
  firstRiskAt?: string;
  secondsToFirstRisk?: number;
  firstRewardAt?: string;
  secondsToFirstReward?: number;
  firstRetryOpportunityAt?: string;
  secondsToFirstRetryOpportunity?: number;
  notes?: string;
};

type FailureObservation = {
  at?: string;
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
  notes?: string;
};

type FailStateObservation = {
  blockingOverlayDuringDeath?: boolean;
  futurePathVisible?: boolean;
  objectiveReminderAvailableAfterFail?: boolean;
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

type EphemeralMomentObservation = {
  name?: string;
  importance?: "critical" | "supporting" | "secondary";
  kind?: "tutorial" | "objective" | "notification" | "warning" | "status";
  appearsNearAction?: boolean;
  autoDismisses?: boolean;
  dismissSeconds?: number;
  playerControlledAdvance?: boolean;
  reviewableLater?: boolean;
  suppressibleWhenNonCritical?: boolean;
  obstructsCriticalRead?: boolean;
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

type ConfounderObservation = {
  inputCertainty?: "stable" | "minor-slip" | "major-slip";
  responseLatency?: "stable" | "borderline" | "late";
  cameraSupportsAction?: boolean;
  viewObstructedAtDecision?: boolean;
  autoCameraInterference?: boolean;
  notes?: string;
};

type ResponsivenessProbeObservation = {
  firstInputObserved?: boolean;
  firstInputDurationMs?: number;
  restartReadinessObserved?: boolean;
  restartReadinessDurationMs?: number;
  controlMarkers?: string[];
  notes?: string[];
};

type ObservationFile = {
  game?: string;
  sessionDate?: string;
  firstContact?: FirstContactObservation;
  earlyLoop?: EarlyLoopObservation;
  retrySeconds?: number;
  returnsToCurrentTestQuickly?: boolean;
  failures?: FailureObservation[];
  failState?: FailStateObservation;
  learningLoop?: LearningLoopObservation;
  recoverySupport?: RecoverySupportObservation;
  resumeProbes?: ResumeProbeObservation[];
  probeOutcomes?: ProbeOutcomeObservation[];
  ephemeralMoments?: EphemeralMomentObservation[];
  incidents?: IncidentObservation[];
  confounders?: ConfounderObservation;
  evidence?: EvidenceObservation;
  responsivenessProbe?: ResponsivenessProbeObservation;
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

function severityRank(severity: Severity): number {
  if (severity === "blocker") {
    return 0;
  }
  if (severity === "major") {
    return 1;
  }
  return 2;
}

function countWhere<T>(items: T[], predicate: (item: T) => boolean): number {
  return items.filter(predicate).length;
}

function averageNumber(values: Array<number | undefined>): number | undefined {
  const valid = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (valid.length === 0) {
    return undefined;
  }

  const total = valid.reduce((sum, value) => sum + value, 0);
  return Math.round((total / valid.length) * 10) / 10;
}

function formatCount(count: number, total: number, label: string): string {
  if (total <= 0) {
    return `${count} ${label}`;
  }
  return `${count}/${total} ${label}`;
}

function formatSeconds(value: number | undefined): string {
  return typeof value === "number" ? `${value}s` : "unknown";
}

function formatMs(value: number | undefined): string {
  return typeof value === "number" ? `${value}ms` : "unknown";
}

function formatRating(value: number | undefined, max: number, suffix = ""): string {
  return typeof value === "number" ? `${value}/${max}${suffix}` : "unknown";
}

function buildTemplate(): string {
  return [
    "# Activation Loop Audit Template",
    "",
    "Use this when first input, start flow, reminder recovery, and retry-to-control-ready trust need one shared pass.",
    "",
    "## Core Checks",
    "",
    "- First normal input produces a visible answer quickly.",
    "- Outer play reaches control-ready state without a hidden second start.",
    "- Current goal and controls can be recovered during play without menu spelunking.",
    "- Critical onboarding prompts stay player-paced or reviewable later.",
    "- After failure, retry returns to the same lesson quickly enough that the correction is still warm.",
    "- Short interruption does not erase goal, controls, or next action.",
    "",
    "## Observation JSON",
    "",
    "```json",
    JSON.stringify(
      {
        game: "some-game",
        sessionDate: "2026-05-02",
        firstContact: {
          loopComplexity: "low",
          discoverableThroughExperiment: true,
          firstObjectiveClear: true,
          currentGoalEasyToRestate: true,
          nextStepPrescriptive: true,
          controlsReminderAvailable: false,
          objectiveReminderAvailable: true,
          progressSafeHelp: true,
          remapSafe: false,
          upfrontInstructionScreens: 0,
          promptsBeforeMeaningfulPlay: 1,
          blocksFirstMeaningfulInput: false,
          forcedTutorialSteps: 0,
          optionalHelpOnDemand: true,
        },
        earlyLoop: {
          firstMeaningfulInputAt: "00:04",
          secondsToFirstMeaningfulInput: 4,
          firstRiskAt: "00:08",
          secondsToFirstRisk: 8,
          firstRewardAt: "00:11",
          secondsToFirstReward: 11,
          firstRetryOpportunityAt: "00:34",
          secondsToFirstRetryOpportunity: 34,
          notes: "input responds quickly, but controls are not reviewable after returning",
        },
        retrySeconds: 4,
        returnsToCurrentTestQuickly: true,
        failures: [
          {
            at: "00:31",
            cause: "second projectile hidden behind score popup",
            causeReadable: false,
            correctiveActionClear: false,
            retrySeconds: 4,
            menuLayersBeforeRetry: 1,
            checkpointLossSeconds: 6,
            sourceVisibleOnFail: false,
            returnsToRelevantDecision: true,
            repeatedPenaltyFromSingleMistake: false,
            controlRecoveredBeforeNextHit: true,
            retryContextStable: true,
            notes: "retry is fast, but the lesson is muddy",
          },
        ],
        failState: {
          blockingOverlayDuringDeath: false,
          futurePathVisible: false,
          objectiveReminderAvailableAfterFail: true,
        },
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
          tutorialOrHintReopenable: true,
        },
        resumeProbes: [
          {
            breakType: "tab-switch",
            secondsAway: 45,
            resumeSurface: "active run",
            currentGoalRecoverable: true,
            controlsRecoverable: false,
            nextActionClear: true,
            needsMenuDive: false,
            stalePromptMismatch: false,
            notes: "goal survives the break better than verb recall",
          },
        ],
        probeOutcomes: [
          {
            probe: "first-contact",
            goal: "reach first meaningful input and restate next step",
            outcome: "success",
            successRating: 4,
            confidence: 6,
            satisfaction: 6,
            frustration: 2,
            mentalDemand: 3,
            timePressure: 2,
            effort: 3,
            blockers: [],
            notes: "player acts quickly",
          },
          {
            probe: "fail-retry",
            goal: "decode one death and return to the same lesson quickly",
            outcome: "partial",
            successRating: 2,
            confidence: 3,
            satisfaction: 4,
            frustration: 5,
            mentalDemand: 6,
            timePressure: 5,
            effort: 5,
            blockers: ["death cause hidden by score popup"],
            notes: "retry is quick but lesson recovery is incomplete",
          },
        ],
        ephemeralMoments: [
          {
            name: "wave-start weapon tip",
            kind: "tutorial",
            importance: "supporting",
            appearsNearAction: true,
            autoDismisses: true,
            dismissSeconds: 3,
            playerControlledAdvance: false,
            reviewableLater: true,
            suppressibleWhenNonCritical: true,
            obstructsCriticalRead: false,
            notes: "prompt is brief, but pause menu repeats it later",
          },
        ],
        evidence: {
          mode: "direct-play",
          sampledRuns: 2,
          sampledFailures: 1,
          sampledRetries: 1,
          sampledResumeProbes: 1,
          notes: ["short first run plus one targeted replay after death"],
        },
        strengths: ["first action readable without tutorial wall"],
        frictions: ["no in-run control reminder"],
      },
      null,
      2,
    ),
    "```",
    "",
  ].join("\n");
}

function buildFindings(data: ObservationFile): Finding[] {
  const firstContact = data.firstContact ?? {};
  const earlyLoop = data.earlyLoop ?? {};
  const failures = data.failures ?? [];
  const failState = data.failState ?? {};
  const learningLoop = data.learningLoop ?? {};
  const recoverySupport = data.recoverySupport ?? {};
  const resumeProbes = data.resumeProbes ?? [];
  const ephemeralMoments = data.ephemeralMoments ?? [];
  const responsiveness = data.responsivenessProbe ?? {};
  const findings: Finding[] = [];

  const firstInputSeconds = earlyLoop.secondsToFirstMeaningfulInput;
  const firstInputMs = responsiveness.firstInputDurationMs;
  const retrySeconds = typeof data.retrySeconds === "number" ? data.retrySeconds : averageNumber(failures.map((failure) => failure.retrySeconds));
  const retryMenuDepth = averageNumber(failures.map((failure) => failure.menuLayersBeforeRetry));
  const failedResumeCount = countWhere(
    resumeProbes,
    (probe) =>
      probe.currentGoalRecoverable === false ||
      probe.controlsRecoverable === false ||
      probe.nextActionClear === false ||
      probe.needsMenuDive === true ||
      probe.stalePromptMismatch === true,
  );
  const controlReminderMissing = firstContact.controlsReminderAvailable === false;
  const objectiveReminderMissing = firstContact.objectiveReminderAvailable === false;
  const cheapHelpMissing = firstContact.progressSafeHelp === false;
  const hiddenSecondStart =
    firstContact.blocksFirstMeaningfulInput === true &&
    ((firstContact.promptsBeforeMeaningfulPlay ?? 0) >= 2 ||
      (firstContact.forcedTutorialSteps ?? 0) >= 1 ||
      firstContact.discoverableThroughExperiment === true);
  const criticalVanishingPromptCount = countWhere(
    ephemeralMoments,
    (moment) =>
      (moment.kind === "tutorial" || moment.kind === "objective" || moment.kind === "warning") &&
      moment.importance !== "secondary" &&
      moment.autoDismisses === true &&
      moment.playerControlledAdvance !== true &&
      moment.reviewableLater !== true,
  );
  const unreadableFailureCount = countWhere(
    failures,
    (failure) => failure.causeReadable === false || failure.correctiveActionClear === false,
  );

  if (
    hiddenSecondStart ||
    (typeof firstInputMs === "number" && firstInputMs > 700) ||
    (typeof firstInputSeconds === "number" && firstInputSeconds > 10)
  ) {
    findings.push({
      severity:
        hiddenSecondStart || (typeof firstInputSeconds === "number" && firstInputSeconds > 14)
          ? "blocker"
          : "major",
      title: "first action does not turn into trust quickly enough",
      evidence:
        `First meaningful input ${formatSeconds(firstInputSeconds)}; first-input response ${formatMs(firstInputMs)}; prompts before meaningful play ${firstContact.promptsBeforeMeaningfulPlay ?? "unknown"}; first input blocked ${boolLabel(firstContact.blocksFirstMeaningfulInput)}.`,
      nextStep:
        "Remove hidden second-start gates and trim front-loaded blockers so one ordinary input reaches a visibly active, control-ready state fast.",
    });
  }

  if (
    controlReminderMissing &&
    objectiveReminderMissing &&
    cheapHelpMissing
  ) {
    findings.push({
      severity: "blocker",
      title: "active play does not expose a cheap reminder path for controls or goal",
      evidence:
        `Controls reminder during play ${boolLabel(firstContact.controlsReminderAvailable)}; objective reminder during play ${boolLabel(firstContact.objectiveReminderAvailable)}; reminder path preserves progress ${boolLabel(firstContact.progressSafeHelp)}.`,
      nextStep:
        "Keep controls and current objective reviewable from active play without wiping progress or forcing menu spelunking.",
    });
  } else if (
    controlReminderMissing ||
    objectiveReminderMissing ||
    cheapHelpMissing
  ) {
    findings.push({
      severity: "major",
      title: "reminder recovery is incomplete once play has started",
      evidence:
        `Controls reminder during play ${boolLabel(firstContact.controlsReminderAvailable)}; objective reminder during play ${boolLabel(firstContact.objectiveReminderAvailable)}; reminder path preserves progress ${boolLabel(firstContact.progressSafeHelp)}.`,
      nextStep:
        "Add a low-friction in-run reminder surface so players can recover verb and goal state without leaving the loop.",
    });
  }

  if (
    failedResumeCount > 0 &&
    countWhere(resumeProbes, (probe) => probe.controlsRecoverable === false || probe.nextActionClear === false) > 0
  ) {
    findings.push({
      severity: "blocker",
      title: "short interruption breaks activation trust on return",
      evidence:
        `${formatCount(failedResumeCount, resumeProbes.length, "resume probes")} lost goal, controls, or next action; menu dive needed in ${countWhere(resumeProbes, (probe) => probe.needsMenuDive === true)} probe(s).`,
      nextStep:
        "On resume, restate live controls, current objective, and next action directly on the return surface instead of relying on memory.",
    });
  } else if (failedResumeCount > 0) {
    findings.push({
      severity: "major",
      title: "resume after interruption is only partly recoverable",
      evidence:
        `${formatCount(failedResumeCount, resumeProbes.length, "resume probes")} lost goal, controls, or next action.`,
      nextStep:
        "Tighten the return surface so players can cheaply recover the current lesson after a short break or tab switch.",
    });
  }

  if (
    (typeof retrySeconds === "number" && retrySeconds > 10) ||
    data.returnsToCurrentTestQuickly === false ||
    (typeof retryMenuDepth === "number" && retryMenuDepth > 1.5)
  ) {
    findings.push({
      severity:
        data.returnsToCurrentTestQuickly === false && typeof retrySeconds === "number" && retrySeconds > 10
          ? "blocker"
          : "major",
      title: "death-to-control-ready re-entry is too cold or too indirect",
      evidence:
        `Retry seconds ${formatSeconds(retrySeconds)}; returns to current test quickly ${boolLabel(data.returnsToCurrentTestQuickly)}; average menu depth ${typeof retryMenuDepth === "number" ? retryMenuDepth : "unknown"}; quick start after failure ${boolLabel(recoverySupport.quickStartAfterFailure)}.`,
      nextStep:
        "Shorten retry path and bring the player back to the same lesson while the correction is still warm.",
    });
  }

  if (
    unreadableFailureCount > 0 &&
    (failState.objectiveReminderAvailableAfterFail === false || recoverySupport.tutorialOrHintReopenable === false)
  ) {
    findings.push({
      severity: "major",
      title: "post-fail recovery hides the lesson or the reminder path",
      evidence:
        `${formatCount(unreadableFailureCount, failures.length, "failures")} left cause or correction unclear; objective reminder after fail ${boolLabel(failState.objectiveReminderAvailableAfterFail)}; hint refresh reopenable ${boolLabel(recoverySupport.tutorialOrHintReopenable)}.`,
      nextStep:
        "Keep the death cause readable and expose a cheap post-fail reminder so the next retry starts with a recoverable correction.",
    });
  }

  if (
    criticalVanishingPromptCount > 0 &&
    controlReminderMissing
  ) {
    findings.push({
      severity: "major",
      title: "critical prompts vanish before the player can recover them later",
      evidence:
        `${formatCount(criticalVanishingPromptCount, ephemeralMoments.length, "critical prompts")} auto-dismissed without replay while controls reminder during play was ${boolLabel(firstContact.controlsReminderAvailable)}.`,
      nextStep:
        "Make critical start or reminder prompts player-paced or reopenable whenever live help is incomplete.",
    });
  }

  if (
    learningLoop.sameLessonStableAcrossRetries === false ||
    countWhere(failures, (failure) => failure.retryContextStable === false) > 0
  ) {
    findings.push({
      severity: "major",
      title: "retry returns, but not to a stable version of the same lesson",
      evidence:
        `Same lesson stable across retries ${boolLabel(learningLoop.sameLessonStableAcrossRetries)}; unstable retry samples ${countWhere(failures, (failure) => failure.retryContextStable === false)}.`,
      nextStep:
        "Make retry restore the same decision point and pressure state so the player can actually test the intended fix.",
    });
  }

  if (findings.length === 0) {
    findings.push({
      severity: "minor",
      title: "no major activation-loop breakdown was logged in the supplied observations",
      evidence:
        "First action, reminder recovery, interruption return, and re-entry path did not record a severe trust break in the sampled pass.",
      nextStep:
        "Keep the current start-and-return loop and validate it again on a longer or harder browser session before broadening claims.",
    });
  }

  return findings.sort((left, right) => severityRank(left.severity) - severityRank(right.severity));
}

function buildFindingsSection(findings: Finding[]): string[] {
  return findings.map((finding) => `- \`${finding.severity}\` ${finding.title}. Evidence: ${finding.evidence}`);
}

function buildEvidenceSection(data: ObservationFile): string[] {
  const evidence = data.evidence ?? {};
  const lines = [
    `- Evidence mode: ${evidence.mode ?? "unknown"}.`,
    `- Runs sampled: ${evidence.sampledRuns ?? 0}.`,
    `- Failures sampled: ${evidence.sampledFailures ?? 0}.`,
    `- Retries sampled: ${evidence.sampledRetries ?? 0}.`,
    `- Resume probes sampled: ${evidence.sampledResumeProbes ?? data.resumeProbes?.length ?? 0}.`,
    `- Temporary prompts logged: ${data.ephemeralMoments?.length ?? 0}.`,
  ];

  if (evidence.notes && evidence.notes.length > 0) {
    for (const note of evidence.notes) {
      lines.push(`- Evidence note: ${note}`);
    }
  }

  return lines;
}

function buildFirstActionSection(data: ObservationFile): string[] {
  const firstContact = data.firstContact ?? {};
  const earlyLoop = data.earlyLoop ?? {};
  const responsiveness = data.responsivenessProbe ?? {};
  return [
    `- First meaningful input: ${earlyLoop.firstMeaningfulInputAt ?? "unknown"} (${formatSeconds(earlyLoop.secondsToFirstMeaningfulInput)}).`,
    `- First risk: ${earlyLoop.firstRiskAt ?? "unknown"} (${formatSeconds(earlyLoop.secondsToFirstRisk)}).`,
    `- First reward or payoff: ${earlyLoop.firstRewardAt ?? "unknown"} (${formatSeconds(earlyLoop.secondsToFirstReward)}).`,
    `- First-input response timing: ${formatMs(responsiveness.firstInputDurationMs)}.`,
    `- Start path blocks first meaningful input: ${boolLabel(firstContact.blocksFirstMeaningfulInput)}.`,
    `- Prompts before meaningful play: ${firstContact.promptsBeforeMeaningfulPlay ?? "unknown"}.`,
    `- Forced tutorial steps before free play: ${firstContact.forcedTutorialSteps ?? "unknown"}.`,
    `- First-contact note: ${earlyLoop.notes ?? "none logged"}.`,
  ];
}

function buildReminderSection(data: ObservationFile): string[] {
  const firstContact = data.firstContact ?? {};
  return [
    `- Controls reminder during play: ${boolLabel(firstContact.controlsReminderAvailable)}.`,
    `- Objective reminder during play: ${boolLabel(firstContact.objectiveReminderAvailable)}.`,
    `- Reminder path preserves progress: ${boolLabel(firstContact.progressSafeHelp)}.`,
    `- Current goal easy to restate: ${boolLabel(firstContact.currentGoalEasyToRestate)}.`,
    `- Next step is prescriptive: ${boolLabel(firstContact.nextStepPrescriptive)}.`,
    `- Reminder text matches remaps: ${boolLabel(firstContact.remapSafe)}.`,
  ];
}

function buildReentrySection(data: ObservationFile): string[] {
  const failures = data.failures ?? [];
  const failState = data.failState ?? {};
  const recoverySupport = data.recoverySupport ?? {};
  const responsiveness = data.responsivenessProbe ?? {};
  const retrySeconds = typeof data.retrySeconds === "number" ? data.retrySeconds : averageNumber(failures.map((failure) => failure.retrySeconds));

  const rows = [
    `- Retry seconds: ${formatSeconds(retrySeconds)}.`,
    `- Restart-to-control-ready timing: ${formatMs(responsiveness.restartReadinessDurationMs)}.`,
    `- Control markers: ${responsiveness.controlMarkers?.join(", ") ?? "none logged"}.`,
    `- Returns to current test quickly: ${boolLabel(data.returnsToCurrentTestQuickly)}.`,
    `- Quick start after failure: ${boolLabel(recoverySupport.quickStartAfterFailure)}.`,
    `- Tutorial or hint refresh reopenable: ${boolLabel(recoverySupport.tutorialOrHintReopenable)}.`,
    `- Objective reminder available after fail: ${boolLabel(failState.objectiveReminderAvailableAfterFail)}.`,
    `- Same lesson stable across retries: ${boolLabel(data.learningLoop?.sameLessonStableAcrossRetries)}.`,
  ];

  if (failures.length === 0) {
    rows.push("- No logged fail-and-retry sample yet.");
    return rows;
  }

  for (const [index, failure] of failures.entries()) {
    rows.push(
      `- Fail ${index + 1}: cause readable ${boolLabel(failure.causeReadable)}; corrective action clear ${boolLabel(failure.correctiveActionClear)}; retry ${formatSeconds(failure.retrySeconds)}; menu layers ${failure.menuLayersBeforeRetry ?? "unknown"}; returns near decision ${boolLabel(failure.returnsToRelevantDecision)}; retry context stable ${boolLabel(failure.retryContextStable)}; notes ${failure.notes ?? "none"}.`,
    );
  }

  return rows;
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
    return `- ${parts.join("; ")}. Notes: ${probe.notes ?? "none"}`;
  });
}

function buildPromptSection(ephemeralMoments: EphemeralMomentObservation[]): string[] {
  if (ephemeralMoments.length === 0) {
    return ["- No temporary prompts recorded yet."];
  }

  return ephemeralMoments.map((moment) => {
    return `- ${moment.name ?? "unnamed prompt"}: kind=${moment.kind ?? "unknown"}; importance=${moment.importance ?? "unknown"}; auto-dismisses=${boolLabel(moment.autoDismisses)}; player-paced=${boolLabel(moment.playerControlledAdvance)}; reviewable later=${boolLabel(moment.reviewableLater)}; obstructs critical read=${boolLabel(moment.obstructsCriticalRead)}; notes=${moment.notes ?? "none"}.`;
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

function buildIncidentSection(incidents: IncidentObservation[]): string[] {
  if (incidents.length === 0) {
    return ["- No shared incident queue rows recorded yet."];
  }

  return [...incidents]
    .sort((left, right) => (right.repeatedCount ?? 0) - (left.repeatedCount ?? 0))
    .map((incident) => {
      return `- ${incident.incidentTag ?? incident.title ?? "untagged-incident"}: repeats=${incident.repeatedCount ?? 1}; impact=${incident.impact ?? "unknown"}; persistence=${incident.persistence ?? "unknown"}; player cost=${incident.playerCost?.join(", ") ?? "none"}; next check=${incident.nextCheck ?? "none"}; notes=${incident.notes ?? "none"}.`;
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
  return uniqueSteps.map((step) => `- ${step}`);
}

function buildDurableLearning(data: ObservationFile, findings: Finding[]): string[] {
  const game = data.game ?? "this game";
  const blockerCount = findings.filter((finding) => finding.severity === "blocker").length;
  const majorCount = findings.filter((finding) => finding.severity === "major").length;
  const starterCoverageStatus = getStarterCoverageStatus(data);
  const hasResumeIssue = findings.some(
    (finding) =>
      finding.title === "short interruption breaks activation trust on return" ||
      finding.title === "resume after interruption is only partly recoverable",
  );
  const hasReminderIssue = findings.some(
    (finding) =>
      finding.title === "active play does not expose a cheap reminder path for controls or goal" ||
      finding.title === "reminder recovery is incomplete once play has started",
  );

  if (findings.length === 1 && findings[0]?.severity === "minor") {
    return [
      `- ${game}: activation-loop review still matters for this catalog because a clean first-input and retry-return baseline catches trust regressions before players start calling the game broken.`,
    ];
  }

  if (starterCoverageStatus === "partial" || starterCoverageStatus === "missing") {
    return [
      `- ${game}: activation-loop review should preserve starter claim guardrails in this catalog because one bad first-contact or retry sample can prove a local trust break without proving the whole loop is broken.`,
    ];
  }

  if (hasResumeIssue) {
    return [
      `- ${game}: activation trust includes short-break return, not just boot and retry, because players lose confidence when goal, controls, or next action evaporate the moment they tab away and come back.`,
    ];
  }

  if (hasReminderIssue) {
    return [
      `- ${game}: activation trust depends on cheap in-run reminder recovery, because a fast start still feels broken once controls or objective vanish behind memory work or menu spelunking.`,
    ];
  }

  return [
    `- ${game}: blocker-first activation-loop reporting matters for this catalog because start trust, reminder recovery, and death-to-control-ready re-entry fail as one system; this pass logged ${blockerCount} blocker(s) and ${majorCount} major finding(s) with explicit evidence scope instead of split boot-only and retry-only notes.`,
  ];
}

function extractLearningLine(markdownLines: string[]): string | undefined {
  return markdownLines.find((line) => line.startsWith("- "));
}

function buildMarkdown(data: ObservationFile): string {
  const game = data.game ?? "unknown-game";
  const sessionDate = data.sessionDate ?? new Date().toISOString().slice(0, 10);
  const findings = buildFindings(data);
  const starterNextEvidence = getStarterNextEvidence(data).filter((item) => item !== "none");

  return [
    `# ${game} Activation Loop Audit`,
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
    "## First Action And Start Path",
    "",
    ...buildFirstActionSection(data),
    "",
    "## Reminder Recovery",
    "",
    ...buildReminderSection(data),
    "",
    "## Death-To-Control-Ready Re-Entry",
    "",
    ...buildReentrySection(data),
    "",
    "## Interruption Recovery",
    "",
    ...buildResumeSection(data.resumeProbes ?? []),
    "",
    "## Temporary Prompt Recovery",
    "",
    ...buildPromptSection(data.ephemeralMoments ?? []),
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
  const data = !options.template && options.observations ? readObservations(options.observations) : undefined;
  const output = options.template || !data ? buildTemplate() : buildMarkdown(data);

  if (data) {
    const learningLine = extractLearningLine(buildDurableLearning(data, buildFindings(data)));
    if (learningLine) {
      saveLearning({
        learningLine,
        outputPath: resolve(__dirname, "..", "LEARNINGS.md"),
      });
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
