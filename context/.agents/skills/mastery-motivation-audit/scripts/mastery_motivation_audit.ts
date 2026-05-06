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

type ChoiceObservation = {
  moment?: string;
  label?: string;
  choiceType?: "route" | "timing" | "tool" | "risk-reward" | "loadout" | "difficulty" | "strategy";
  optionsCount?: number;
  meaningClear?: boolean;
  reversible?: boolean;
  offeredOptions?: Array<{
    label?: string;
    expectedPayoff?: string;
    expectedCost?: string;
    currentStateComparison?: string;
    currentBuildComparison?: string;
    notes?: string;
  }>;
  pickedOptionLabel?: string;
  expectedPayoff?: string;
  actualPayoff?: string;
  actualPayoffTiming?: "immediate" | "delayed" | "not-yet-observed";
  payoffMatchedExpectation?: "yes" | "partial" | "no" | "unknown";
  afterPickComparison?: string;
  afterPickBuildComparison?: string;
  afterPickComparisonClear?: boolean;
  notes?: string;
};

type MasteryObservation = {
  earlySuccessEarned?: boolean;
  firstSuccessMoment?: string;
  successFeedbackClear?: boolean;
  proximalGoalVisible?: boolean;
  progressLegible?: boolean;
  progressRemindersAvailable?: boolean;
  failureImprovementVisible?: boolean;
  choiceCountFirstMinute?: number;
  choicesFeelMeaningful?: boolean;
  autonomySupport?: "low" | "medium" | "high";
  competenceSupport?: "low" | "medium" | "high";
  notes?: string;
  choicePoints?: ChoiceObservation[];
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
  menuLayersBeforeRetry?: number;
  checkpointLossSeconds?: number;
  sourceVisibleOnFail?: boolean;
  returnsToRelevantDecision?: boolean;
  repeatedPenaltyFromSingleMistake?: boolean;
  controlRecoveredBeforeNextHit?: boolean;
  retryContextStable?: boolean;
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
  earlyLoop?: EarlyLoopObservation;
  mastery?: MasteryObservation;
  learningLoop?: LearningLoopObservation;
  recoverySupport?: RecoverySupportObservation;
  failures?: FailureObservation[];
  resumeProbes?: ResumeProbeObservation[];
  probeOutcomes?: ProbeOutcomeObservation[];
  confounders?: ConfounderObservation;
  incidents?: IncidentObservation[];
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

function averageNumber(values: Array<number | undefined>): number | undefined {
  const valid = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (valid.length === 0) {
    return undefined;
  }

  const total = valid.reduce((sum, value) => sum + value, 0);
  return Math.round((total / valid.length) * 10) / 10;
}

function buildTemplate(): string {
  return [
    "# Mastery Motivation Audit Template",
    "",
    "Use during a short opening plus one fail-retry sample when possible.",
    "",
    "## Core Checks",
    "",
    "- First minute includes one earned success that reads as player-caused.",
    "- Current goal and near-term progress stay visible enough to guide effort.",
    "- Player gets at least one meaningful early choice about route, timing, tactic, or tool.",
    "- Failure preserves a usable improvement signal instead of pure loss.",
    "- Practice, reminders, or lower-punishment rehearsal exists when needed.",
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
          controlsReminderAvailable: true,
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
          firstRiskAt: "00:09",
          secondsToFirstRisk: 9,
          firstRewardAt: "00:14",
          secondsToFirstReward: 14,
          firstRetryOpportunityAt: "00:34",
          secondsToFirstRetryOpportunity: 34,
          notes: "goal, risk, and payoff all arrive before the loop cools",
        },
        mastery: {
          earlySuccessEarned: true,
          firstSuccessMoment: "00:14",
          successFeedbackClear: true,
          proximalGoalVisible: true,
          progressLegible: true,
          progressRemindersAvailable: true,
          failureImprovementVisible: true,
          choiceCountFirstMinute: 2,
          choicesFeelMeaningful: true,
          autonomySupport: "high",
          competenceSupport: "high",
          notes: "player sees one short target, earns it, then chooses whether to play safe or push for faster reward",
          choicePoints: [
            {
              moment: "00:18",
              label: "take safer outer route or contest center pickup",
              choiceType: "risk-reward",
              optionsCount: 2,
              meaningClear: true,
              reversible: false,
              offeredOptions: [
                {
                  label: "outer route",
                  expectedPayoff: "safer survival line with slower score growth",
                  expectedCost: "skip the center pickup and keep the weapon state unchanged",
                  currentStateComparison: "keeps the current low-risk state and avoids spending the dodge cooldown",
                  currentBuildComparison: "fits the current base kit by preserving the safer baseline build",
                  notes: "conservative line is readable before commitment",
                },
                {
                  label: "center pickup",
                  expectedPayoff: "faster score and a stronger temporary weapon",
                  expectedCost: "enter a tighter threat lane and risk spending the dodge cooldown immediately",
                  currentStateComparison:
                    "spends the dodge cooldown to enter the next exchange with a stronger build state",
                  currentBuildComparison: "amplifies the current rapid-fire build for the next exchange",
                  notes: "greedy line advertises a stronger short-term reward",
                },
              ],
              pickedOptionLabel: "center pickup",
              expectedPayoff: "faster score and a stronger temporary weapon for the next exchange",
              actualPayoff: "player secures the pickup and the stronger weapon state for the next exchange",
              actualPayoffTiming: "immediate",
              payoffMatchedExpectation: "partial",
              afterPickComparison:
                "weapon icon and score jump make the stronger post-pick state readable against the prior baseline, even though the skipped outer route is not replayed",
              afterPickBuildComparison:
                "rapid-fire build becomes more explosive immediately, while the safer baseline build is no longer visible for side-by-side comparison",
              afterPickComparisonClear: true,
              notes: "both options are legible and map to different pressure",
            },
          ],
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
        failures: [
          {
            at: "00:33",
            cause: "pushed center pickup too late",
            causeReadable: true,
            correctiveActionClear: true,
            retrySeconds: 4,
            menuLayersBeforeRetry: 0,
            checkpointLossSeconds: 4,
            sourceVisibleOnFail: true,
            returnsToRelevantDecision: true,
            repeatedPenaltyFromSingleMistake: false,
            controlRecoveredBeforeNextHit: true,
            retryContextStable: true,
            notes: "player can say go earlier or stay outer route",
          },
        ],
        resumeProbes: [
          {
            breakType: "tab-switch",
            secondsAway: 45,
            resumeSurface: "active run",
            currentGoalRecoverable: true,
            controlsRecoverable: true,
            nextActionClear: true,
            needsMenuDive: false,
            stalePromptMismatch: false,
            notes: "goal and verbs still recover quickly",
          },
        ],
        probeOutcomes: [
          {
            probe: "first-contact",
            goal: "reach first earned success and restate the next short goal",
            outcome: "success",
            successRating: 4,
            confidence: 6,
            satisfaction: 6,
            frustration: 2,
            mentalDemand: 3,
            timePressure: 3,
            effort: 3,
            blockers: [],
            notes: "opening reads warm instead of bossy",
          },
          {
            probe: "fail-retry",
            goal: "fail once and identify a concrete improvement on the retry",
            outcome: "success",
            successRating: 4,
            confidence: 6,
            satisfaction: 5,
            frustration: 3,
            mentalDemand: 4,
            timePressure: 4,
            effort: 4,
            blockers: [],
            notes: "failure points to a real correction instead of just loss",
          },
        ],
        confounders: {
          inputCertainty: "stable",
          responseLatency: "stable",
          cameraSupportsAction: true,
          viewObstructedAtDecision: false,
          autoCameraInterference: false,
          notes: "motivation read not distorted by control or camera problems",
        },
        evidence: {
          mode: "direct-play",
          sampledRuns: 2,
          sampledFailures: 1,
          sampledRetries: 1,
          sampledResumeProbes: 1,
          notes: ["captured first minute plus one fail-retry loop"],
        },
        strengths: ["first reward arrives quickly and feels earned"],
        frictions: ["no true sandbox despite timing-heavy opener"],
      },
      null,
      2,
    ),
    "```",
    "",
  ].join("\n");
}

function buildFindings(data: ObservationFile): Finding[] {
  const mastery = data.mastery ?? {};
  const firstContact = data.firstContact ?? {};
  const earlyLoop = data.earlyLoop ?? {};
  const learningLoop = data.learningLoop ?? {};
  const recoverySupport = data.recoverySupport ?? {};
  const failures = data.failures ?? [];
  const resumeProbes = data.resumeProbes ?? [];
  const probeOutcomes = data.probeOutcomes ?? [];
  const confounders = data.confounders ?? {};
  const choicePoints = mastery.choicePoints ?? [];
  const avgRetry = averageNumber(failures.map((failure) => failure.retrySeconds));
  const findings: Finding[] = [];

  if (
    mastery.earlySuccessEarned === false ||
    mastery.successFeedbackClear === false ||
    (typeof earlyLoop.secondsToFirstReward === "number" && earlyLoop.secondsToFirstReward > 45)
  ) {
    findings.push({
      severity: "blocker",
      title: "opening withholds an earned early win",
      evidence:
        `early success earned ${boolLabel(mastery.earlySuccessEarned)}; success feedback clear ${boolLabel(mastery.successFeedbackClear)}; first reward at ${typeof earlyLoop.secondsToFirstReward === "number" ? `${earlyLoop.secondsToFirstReward}s` : "unknown"}.`,
      nextStep: "Move one readable payoff earlier and make sure it clearly reads as caused by player action, not passive survival or reward spam.",
    });
  }

  if (
    mastery.proximalGoalVisible === false ||
    mastery.progressLegible === false ||
    firstContact.currentGoalEasyToRestate === false ||
    firstContact.nextStepPrescriptive === false
  ) {
    findings.push({
      severity: "major",
      title: "goal and progress readback is too weak to support mastery",
      evidence:
        `proximal goal visible ${boolLabel(mastery.proximalGoalVisible)}; progress legible ${boolLabel(mastery.progressLegible)}; current goal restatable ${boolLabel(firstContact.currentGoalEasyToRestate)}; next step prescriptive ${boolLabel(firstContact.nextStepPrescriptive)}.`,
      nextStep: "Expose one reachable next goal and short-range progress state in-run or on-demand so effort points somewhere concrete.",
    });
  }

  if (
    mastery.choiceCountFirstMinute === 0 ||
    mastery.choicesFeelMeaningful === false ||
    choicePoints.length === 0 ||
    mastery.autonomySupport === "low"
  ) {
    findings.push({
      severity: "major",
      title: "opening lacks meaningful autonomy texture",
      evidence:
        `choice count first minute ${mastery.choiceCountFirstMinute ?? "unknown"}; choices meaningful ${boolLabel(mastery.choicesFeelMeaningful)}; logged choice points ${choicePoints.length}; autonomy support ${mastery.autonomySupport ?? "unknown"}.`,
      nextStep: "Add one early route, timing, tactic, or tool choice whose tradeoff is readable before the player commits.",
    });
  }

  if (
    mastery.failureImprovementVisible === false ||
    learningLoop.sameLessonStableAcrossRetries === false ||
    failures.some(
      (failure) => failure.causeReadable === false || failure.correctiveActionClear === false || failure.retryContextStable === false,
    )
  ) {
    findings.push({
      severity: "major",
      title: "failure does not convert cleanly into competence readback",
      evidence:
        `failure improvement visible ${boolLabel(mastery.failureImprovementVisible)}; same lesson stable ${boolLabel(learningLoop.sameLessonStableAcrossRetries)}; unreadable or unstable failure samples ${failures.filter((failure) => failure.causeReadable === false || failure.correctiveActionClear === false || failure.retryContextStable === false).length}.`,
      nextStep: "Tighten failure feedback so the player can name the correction and retest the same lesson quickly on the next attempt.",
    });
  }

  if (
    learningLoop.practiceWithoutFailure === false &&
    recoverySupport.assistOrSkipAvailable === false &&
    recoverySupport.difficultyAdjustableAfterFailure === false
  ) {
    findings.push({
      severity: "major",
      title: "harsh practice lane lacks a lower-punishment rehearsal path",
      evidence:
        `practice without failure ${boolLabel(learningLoop.practiceWithoutFailure)}; assist or skip ${boolLabel(recoverySupport.assistOrSkipAvailable)}; difficulty adjustable ${boolLabel(recoverySupport.difficultyAdjustableAfterFailure)}.`,
      nextStep: "Add one safe rehearsal, assist, or lower-punishment path when timing or complexity asks for practice before full pressure.",
    });
  }

  if (
    resumeProbes.some(
      (probe) =>
        probe.currentGoalRecoverable === false ||
        probe.controlsRecoverable === false ||
        probe.nextActionClear === false ||
        probe.needsMenuDive === true,
    ) ||
    mastery.progressRemindersAvailable === false ||
    firstContact.controlsReminderAvailable === false ||
    firstContact.objectiveReminderAvailable === false
  ) {
    findings.push({
      severity: "major",
      title: "reminder recovery raises memory tax and weakens motivation",
      evidence:
        `progress reminders ${boolLabel(mastery.progressRemindersAvailable)}; controls reminder ${boolLabel(firstContact.controlsReminderAvailable)}; objective reminder ${boolLabel(firstContact.objectiveReminderAvailable)}; failed resume probes ${resumeProbes.filter((probe) => probe.currentGoalRecoverable === false || probe.controlsRecoverable === false || probe.nextActionClear === false || probe.needsMenuDive === true).length}.`,
      nextStep: "Keep current goal, progress, and control reminders cheap to reopen so short breaks do not reset competence.",
    });
  }

  if (
    mastery.competenceSupport === "low" ||
    (typeof avgRetry === "number" && avgRetry > 10) ||
    probeOutcomes.some(
      (probe) =>
        probe.probe === "first-contact" &&
        (probe.outcome === "failed" || (typeof probe.successRating === "number" && probe.successRating <= 1)),
    )
  ) {
    findings.push({
      severity: "major",
      title: "opening does not currently support a strong competence read",
      evidence:
        `competence support ${mastery.competenceSupport ?? "unknown"}; average retry ${typeof avgRetry === "number" ? `${avgRetry}s` : "unknown"}; failed opening probes ${probeOutcomes.filter((probe) => probe.probe === "first-contact" && (probe.outcome === "failed" || (typeof probe.successRating === "number" && probe.successRating <= 1))).length}.`,
      nextStep: "Reduce early ambiguity or friction until the player can secure one readable success and one believable improvement path quickly.",
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
      title: "control or view instability confounds the motivation read",
      evidence:
        `input certainty ${confounders.inputCertainty ?? "unknown"}; response latency ${confounders.responseLatency ?? "unknown"}; view obstructed ${boolLabel(confounders.viewObstructedAtDecision)}; auto-camera interference ${boolLabel(confounders.autoCameraInterference)}.`,
      nextStep: "Stabilize response or view support before treating weak stickiness as a content or motivation problem alone.",
    });
  }

  if (findings.length === 0) {
    findings.push({
      severity: "minor",
      title: "no major mastery-motivation breakdown logged in supplied observations",
      evidence: "opening, choice, goal clarity, and fail-retry support were adequate in the sampled run.",
      nextStep: "Validate the same strengths against a second run or a slightly later pressure slice before making broad claims.",
    });
  }

  return findings.sort((left, right) => severityRank(left.severity) - severityRank(right.severity));
}

function buildFindingsSection(findings: Finding[]): string[] {
  return findings.map((finding) => `- \`${finding.severity}\` ${finding.title}. Evidence: ${finding.evidence}`);
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

function buildMasterySection(data: ObservationFile): string[] {
  const mastery = data.mastery ?? {};
  const earlyLoop = data.earlyLoop ?? {};
  return [
    `- Earned early success: ${boolLabel(mastery.earlySuccessEarned)}.`,
    `- First success moment: ${mastery.firstSuccessMoment ?? "unknown"}.`,
    `- Success feedback clear: ${boolLabel(mastery.successFeedbackClear)}.`,
    `- Proximal goal visible: ${boolLabel(mastery.proximalGoalVisible)}.`,
    `- Progress legible: ${boolLabel(mastery.progressLegible)}.`,
    `- Progress reminders available: ${boolLabel(mastery.progressRemindersAvailable)}.`,
    `- Choice count in first minute: ${mastery.choiceCountFirstMinute ?? "unknown"}.`,
    `- Choices feel meaningful: ${boolLabel(mastery.choicesFeelMeaningful)}.`,
    `- Autonomy support: ${mastery.autonomySupport ?? "unknown"}.`,
    `- Competence support: ${mastery.competenceSupport ?? "unknown"}.`,
    `- First reward timing: ${typeof earlyLoop.secondsToFirstReward === "number" ? `${earlyLoop.secondsToFirstReward}s` : "unknown"}.`,
    `- Notes: ${mastery.notes ?? "none logged"}.`,
  ];
}

function buildChoiceSection(choicePoints: ChoiceObservation[]): string[] {
  if (choicePoints.length === 0) {
    return ["- No meaningful choice points logged yet."];
  }

  return choicePoints.map((choice) => {
    const offeredOptions =
      choice.offeredOptions && choice.offeredOptions.length > 0
        ? choice.offeredOptions
            .map((option) => {
              const parts = [
                option.label ?? "unnamed option",
                `expected payoff ${option.expectedPayoff ?? "unknown"}`,
                `expected cost ${option.expectedCost ?? "unknown"}`,
                `current-state comparison ${option.currentStateComparison ?? "unknown"}`,
                `current-build comparison ${option.currentBuildComparison ?? "unknown"}`,
                `notes ${option.notes ?? "none"}`,
              ];
              return `[${parts.join("; ")}]`;
            })
            .join(" ")
        : "none logged";
    const parts = [
      `moment ${choice.moment ?? "unknown"}`,
      `label ${choice.label ?? "unnamed choice"}`,
      `type ${choice.choiceType ?? "unknown"}`,
      `options ${choice.optionsCount ?? "unknown"}`,
      `meaning clear ${boolLabel(choice.meaningClear)}`,
      `reversible ${boolLabel(choice.reversible)}`,
      `offered options ${offeredOptions}`,
      `picked option ${choice.pickedOptionLabel ?? "unknown"}`,
      `expected payoff ${choice.expectedPayoff ?? "unknown"}`,
      `actual payoff ${choice.actualPayoff ?? "unknown"}`,
      `payoff timing ${choice.actualPayoffTiming ?? "unknown"}`,
      `payoff matched expectation ${choice.payoffMatchedExpectation ?? "unknown"}`,
      `after-pick comparison clear ${boolLabel(choice.afterPickComparisonClear)}`,
      `after-pick state comparison ${choice.afterPickComparison ?? "none"}`,
      `after-pick build comparison ${choice.afterPickBuildComparison ?? "none"}`,
      `notes ${choice.notes ?? "none"}`,
    ];
    return `- ${parts.join("; ")}.`;
  });
}

function buildFailureSection(data: ObservationFile): string[] {
  const mastery = data.mastery ?? {};
  const learningLoop = data.learningLoop ?? {};
  const failures = data.failures ?? [];
  const recoverySupport = data.recoverySupport ?? {};
  const lines = [
    `- Failure improvement visible: ${boolLabel(mastery.failureImprovementVisible)}.`,
    `- Immediate retry available: ${boolLabel(learningLoop.immediateRetry)}.`,
    `- Practice without failure exists: ${boolLabel(learningLoop.practiceWithoutFailure)}.`,
    `- Same skill retested quickly: ${boolLabel(learningLoop.sameSkillRetestedQuickly)}.`,
    `- Same lesson stable across retries: ${boolLabel(learningLoop.sameLessonStableAcrossRetries)}.`,
    `- Quick start after failure: ${boolLabel(recoverySupport.quickStartAfterFailure)}.`,
    `- Difficulty adjustable after failure: ${boolLabel(recoverySupport.difficultyAdjustableAfterFailure)}.`,
    `- Assist or skip available: ${boolLabel(recoverySupport.assistOrSkipAvailable)}.`,
    `- Tutorial or hint reopenable: ${boolLabel(recoverySupport.tutorialOrHintReopenable)}.`,
  ];

  if (failures.length === 0) {
    lines.push("- No failure samples logged yet.");
    return lines;
  }

  for (const failure of failures) {
    lines.push(
      `- Fail ${failure.at ?? "unknown"}: cause readable ${boolLabel(failure.causeReadable)}; correction clear ${boolLabel(failure.correctiveActionClear)}; retry ${typeof failure.retrySeconds === "number" ? `${failure.retrySeconds}s` : "unknown"}; returns to relevant decision ${boolLabel(failure.returnsToRelevantDecision)}; retry context stable ${boolLabel(failure.retryContextStable)}; notes ${failure.notes ?? "none"}.`,
    );
  }

  return lines;
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
  const unique = Array.from(new Set(findings.map((finding) => finding.nextStep)));
  return unique.map((step) => `- ${step}`);
}

function buildDurableLearning(data: ObservationFile, findings: Finding[]): string[] {
  const game = data.game ?? "this game";
  const starterCoverageStatus = getStarterCoverageStatus(data);

  if (starterCoverageStatus === "partial" || starterCoverageStatus === "missing") {
    return [
      `- ${game}: mastery-motivation review should preserve starter claim guardrails in this catalog because one warm or cold opening can prove a local competence or autonomy issue without proving the whole loop is motivationally solved.`,
    ];
  }

  if (findings.some((finding) => finding.title === "opening withholds an earned early win")) {
    return [
      `- ${game}: sticky replay motivation weakens fast when the first minute withholds an earned win; early success needs to read as player-caused before later content layers matter.`,
    ];
  }

  if (findings.some((finding) => finding.title === "opening lacks meaningful autonomy texture")) {
    return [
      `- ${game}: browser-game motivation rises faster from one readable early choice than from extra reward noise, because autonomy needs to show up as a real decision, not only as permission to continue.`,
    ];
  }

  if (findings.some((finding) => finding.title === "failure does not convert cleanly into competence readback")) {
    return [
      `- ${game}: mastery motivation survives failure only when the next correction stays legible; a fast retry without a readable improvement signal still drains competence.`,
    ];
  }

  return [
    `- ${game}: replay motivation is strongest when the opening combines one earned success, one readable short goal, and one meaningful choice, because competence and autonomy land before content volume enters the judgment.`,
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
    `# ${game} Mastery Motivation Audit`,
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
    "## Mastery Frame",
    "",
    ...buildMasterySection(data),
    "",
    "## Choice Points",
    "",
    ...buildChoiceSection(data.mastery?.choicePoints ?? []),
    "",
    "## Failure To Mastery",
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
