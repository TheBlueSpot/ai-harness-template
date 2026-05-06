import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type Severity = "blocker" | "major" | "minor";

type VerbObservation = {
  name: string;
  firstPromptAt?: string;
  firstRequiredAt?: string;
  practiceBeforeRisk?: boolean;
  feedback?: string;
};

type ReminderObservation = {
  controlsDuringPlay?: boolean;
  objectiveDuringPlay?: boolean;
  progressSafe?: boolean;
  remapSafe?: boolean;
};

type ObjectiveObservation = {
  currentGoalEasyToRestate?: boolean;
  nextStepPrescriptive?: boolean;
};

type FirstContactObservation = {
  loopComplexity?: "low" | "medium" | "high";
  discoverableThroughExperiment?: boolean;
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

type TeachingLoadObservation = {
  loopComplexity?: "low" | "medium" | "high";
  discoverableThroughExperiment?: boolean;
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

type EvidenceObservation = {
  mode?: "direct-play" | "captured-video" | "code-inference" | "mixed";
  sampledRuns?: number;
  sampledFailures?: number;
  notes?: string[];
};

type ResumeProbeObservation = {
  breakType?: string;
  secondsAway?: number;
  resumeSurface?: string;
  currentGoalRecoverable?: boolean;
  controlsRecoverable?: boolean;
  nextActionClear?: boolean;
  needsMenuDive?: boolean;
  stalePromptMismatch?: boolean;
  notes?: string;
};

type EphemeralMomentObservation = {
  name?: string;
  kind?: string;
  importance?: "critical" | "supporting" | "secondary";
  appearsNearAction?: boolean;
  autoDismisses?: boolean;
  dismissSeconds?: number;
  playerControlledAdvance?: boolean;
  reviewableLater?: boolean;
  suppressibleWhenNonCritical?: boolean;
  obstructsCriticalRead?: boolean;
  notes?: string;
};

type ObservationFile = {
  game?: string;
  sessionDate?: string;
  verbs?: VerbObservation[];
  firstContact?: FirstContactObservation;
  earlyLoop?: EarlyLoopObservation;
  reminders?: ReminderObservation;
  objectiveClarity?: ObjectiveObservation;
  teachingLoad?: TeachingLoadObservation;
  resumeProbes?: ResumeProbeObservation[];
  ephemeralMoments?: EphemeralMomentObservation[];
  evidence?: EvidenceObservation;
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

const skillLearningPath = resolve(import.meta.dir, "..", "LEARNINGS.md");

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

function firstKnown<T>(...values: Array<T | undefined>): T | undefined {
  for (const value of values) {
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

function formatElementCount(count: number, total: number, label: string): string {
  if (total <= 0) {
    return `${count} ${label}`;
  }
  return `${count}/${total} ${label}`;
}

function normalizeReminders(data: ObservationFile): ReminderObservation {
  const firstContact = data.firstContact ?? {};
  const reminders = data.reminders ?? {};
  return {
    controlsDuringPlay: firstKnown(
      reminders.controlsDuringPlay,
      firstContact.controlsReminderAvailable,
    ),
    objectiveDuringPlay: firstKnown(
      reminders.objectiveDuringPlay,
      firstContact.objectiveReminderAvailable,
    ),
    progressSafe: firstKnown(reminders.progressSafe, firstContact.progressSafeHelp),
    remapSafe: firstKnown(reminders.remapSafe, firstContact.remapSafe),
  };
}

function normalizeObjective(data: ObservationFile): ObjectiveObservation {
  const firstContact = data.firstContact ?? {};
  const objective = data.objectiveClarity ?? {};
  return {
    currentGoalEasyToRestate: firstKnown(
      objective.currentGoalEasyToRestate,
      firstContact.currentGoalEasyToRestate,
    ),
    nextStepPrescriptive: firstKnown(
      objective.nextStepPrescriptive,
      firstContact.nextStepPrescriptive,
    ),
  };
}

function normalizeTeachingLoad(data: ObservationFile): TeachingLoadObservation {
  const firstContact = data.firstContact ?? {};
  const teachingLoad = data.teachingLoad ?? {};
  return {
    loopComplexity: firstKnown(teachingLoad.loopComplexity, firstContact.loopComplexity),
    discoverableThroughExperiment: firstKnown(
      teachingLoad.discoverableThroughExperiment,
      firstContact.discoverableThroughExperiment,
    ),
    upfrontInstructionScreens: firstKnown(
      teachingLoad.upfrontInstructionScreens,
      firstContact.upfrontInstructionScreens,
    ),
    promptsBeforeMeaningfulPlay: firstKnown(
      teachingLoad.promptsBeforeMeaningfulPlay,
      firstContact.promptsBeforeMeaningfulPlay,
    ),
    blocksFirstMeaningfulInput: firstKnown(
      teachingLoad.blocksFirstMeaningfulInput,
      firstContact.blocksFirstMeaningfulInput,
    ),
    forcedTutorialSteps: firstKnown(
      teachingLoad.forcedTutorialSteps,
      firstContact.forcedTutorialSteps,
    ),
    optionalHelpOnDemand: firstKnown(
      teachingLoad.optionalHelpOnDemand,
      firstContact.optionalHelpOnDemand,
    ),
  };
}

function buildTemplate(): string {
  return [
    "# Onboarding Critique Template",
    "",
    "Use during first-run browser play.",
    "",
    "## Core Checks",
    "",
    "- Teach core verb close to first need.",
    "- Give safe or low-cost practice before real punishment.",
    "- Confirm action with immediate feedback.",
    "- Keep control reminders reopenable during play.",
    "- Keep current objective and next step easy to restate.",
    "- Keep teaching load proportional to loop complexity.",
    "- Verify a short return-after-break moment still restores goal, controls, and next step.",
    "- Treat critical auto-dismissing prompts as onboarding risk when they cannot be replayed or rechecked later.",
    "- Verify reminder text matches live bindings if remapping exists.",
    "",
    "## Observation JSON",
    "",
    "```json",
    JSON.stringify(
      {
        game: "some-game",
        sessionDate: "2026-04-29",
        verbs: [
          {
            name: "jump",
            firstPromptAt: "00:08",
            firstRequiredAt: "00:12",
            practiceBeforeRisk: true,
            feedback: "clear",
          },
        ],
        reminders: {
          controlsDuringPlay: true,
          objectiveDuringPlay: true,
          progressSafe: true,
          remapSafe: true,
        },
        objectiveClarity: {
          currentGoalEasyToRestate: true,
          nextStepPrescriptive: true,
        },
        earlyLoop: {
          firstMeaningfulInputAt: "00:06",
          secondsToFirstMeaningfulInput: 6,
          firstRiskAt: "00:12",
          secondsToFirstRisk: 12,
          firstRewardAt: "00:19",
          secondsToFirstReward: 19,
          firstRetryOpportunityAt: "00:44",
          secondsToFirstRetryOpportunity: 44,
          notes: "first agency and first payoff land early enough that the verb lesson stays warm",
        },
        firstContact: {
          loopComplexity: "low",
          discoverableThroughExperiment: true,
          currentGoalEasyToRestate: true,
          nextStepPrescriptive: true,
          controlsReminderAvailable: true,
          objectiveReminderAvailable: true,
          progressSafeHelp: true,
          remapSafe: true,
          upfrontInstructionScreens: 0,
          promptsBeforeMeaningfulPlay: 1,
          blocksFirstMeaningfulInput: false,
          forcedTutorialSteps: 0,
          optionalHelpOnDemand: true,
        },
        teachingLoad: {
          loopComplexity: "low",
          discoverableThroughExperiment: true,
          upfrontInstructionScreens: 0,
          promptsBeforeMeaningfulPlay: 1,
          blocksFirstMeaningfulInput: false,
          forcedTutorialSteps: 0,
          optionalHelpOnDemand: true,
        },
        evidence: {
          mode: "direct-play",
          sampledRuns: 2,
          sampledFailures: 1,
          notes: [
            "checked first-run prompt timing and one return-after-failure moment",
          ],
        },
        resumeProbes: [
          {
            breakType: "tab-switch",
            secondsAway: 30,
            resumeSurface: "active run",
            currentGoalRecoverable: true,
            controlsRecoverable: true,
            nextActionClear: true,
            needsMenuDive: false,
            stalePromptMismatch: false,
            notes: "goal and controls both recover without reopening a deep menu",
          },
        ],
        ephemeralMoments: [
          {
            name: "first dash tip",
            kind: "tutorial",
            importance: "critical",
            appearsNearAction: true,
            autoDismisses: false,
            playerControlledAdvance: true,
            reviewableLater: true,
            suppressibleWhenNonCritical: true,
            obstructsCriticalRead: false,
            notes: "prompt can be advanced at player pace and reopened from pause",
          },
        ],
        strengths: ["prompt appears in safe lane before hazard"],
        frictions: ["none yet"],
      },
      null,
      2,
    ),
    "```",
    "",
  ].join("\n");
}

function buildFindings(data: ObservationFile): Finding[] {
  const verbs = data.verbs ?? [];
  const reminders = normalizeReminders(data);
  const objective = normalizeObjective(data);
  const teachingLoad = normalizeTeachingLoad(data);
  const resumeProbes = data.resumeProbes ?? [];
  const ephemeralMoments = data.ephemeralMoments ?? [];
  const totalVerbs = verbs.length;

  const lateVerbCount = countWhere(verbs, (verb) => {
    if (!verb.firstPromptAt || !verb.firstRequiredAt) {
      return false;
    }
    return verb.firstPromptAt >= verb.firstRequiredAt;
  });
  const weakPracticeCount = countWhere(verbs, (verb) => verb.practiceBeforeRisk === false);
  const weakFeedbackCount = countWhere(
    verbs,
    (verb) => typeof verb.feedback === "string" && /weak|unclear|none/i.test(verb.feedback),
  );

  const findings: Finding[] = [];
  const failedResumeCount = countWhere(
    resumeProbes,
    (probe) =>
      probe.currentGoalRecoverable === false ||
      probe.controlsRecoverable === false ||
      probe.nextActionClear === false,
  );
  const menuDiveResumeCount = countWhere(resumeProbes, (probe) => probe.needsMenuDive === true);
  const stalePromptMismatchCount = countWhere(
    resumeProbes,
    (probe) => probe.stalePromptMismatch === true,
  );
  const criticalVanishingPromptCount = countWhere(
    ephemeralMoments,
    (moment) =>
      moment.importance === "critical" &&
      moment.autoDismisses === true &&
      moment.playerControlledAdvance !== true &&
      moment.reviewableLater !== true,
  );

  if (lateVerbCount > 0 && weakPracticeCount > 0) {
    findings.push({
      severity: "blocker",
      title: "core verbs are taught too late and hit punishment before rehearsal",
      evidence: `${formatElementCount(lateVerbCount, totalVerbs, "verbs")} were prompted at or after first required use and ${formatElementCount(weakPracticeCount, totalVerbs, "verbs")} lacked safe practice before risk.`,
      nextStep: "Move critical prompts earlier and insert one safe beat where the player performs the verb before failure matters.",
    });
  } else if (lateVerbCount > 0 || weakPracticeCount > 0) {
    findings.push({
      severity: "major",
      title: "verb timing or practice sequencing weakens first-run learning",
      evidence: `${formatElementCount(lateVerbCount, totalVerbs, "verbs")} were taught late and ${formatElementCount(weakPracticeCount, totalVerbs, "verbs")} lacked safe practice.`,
      nextStep: "Teach each critical verb closer to first need and let the player rehearse once before real punishment.",
    });
  }

  if (weakFeedbackCount > 0 && weakPracticeCount > 0) {
    findings.push({
      severity: "major",
      title: "tutorial beats ask for action without clear confirmation",
      evidence: `${formatElementCount(weakFeedbackCount, totalVerbs, "verbs")} had weak or unclear feedback and ${formatElementCount(weakPracticeCount, totalVerbs, "verbs")} lacked safe rehearsal.`,
      nextStep: "Add immediate success feedback to each taught verb so practice teaches the player what correct execution looks like.",
    });
  } else if (weakFeedbackCount > 0) {
    findings.push({
      severity: "major",
      title: "some taught verbs lack clear success feedback",
      evidence: `${formatElementCount(weakFeedbackCount, totalVerbs, "verbs")} had weak or unclear confirmation.`,
      nextStep: "Strengthen the first success signal for each taught verb before adding more explanation text.",
    });
  }

  if (
    reminders.controlsDuringPlay === false &&
    (reminders.progressSafe === false || reminders.objectiveDuringPlay === false)
  ) {
    findings.push({
      severity: "blocker",
      title: "the player cannot cheaply recover controls or objective mid-run",
      evidence: `Controls reminder during play ${boolLabel(reminders.controlsDuringPlay)}; objective reminder during play ${boolLabel(reminders.objectiveDuringPlay)}; reminder access preserves progress ${boolLabel(reminders.progressSafe)}.`,
      nextStep: "Expose controls and current objective from active play without wiping progress or forcing a full menu exit.",
    });
  } else if (
    reminders.controlsDuringPlay === false ||
    reminders.objectiveDuringPlay === false ||
    reminders.progressSafe === false
  ) {
    findings.push({
      severity: "major",
      title: "reminder path is incomplete or too costly during active play",
      evidence: `Controls reminder during play ${boolLabel(reminders.controlsDuringPlay)}; objective reminder during play ${boolLabel(reminders.objectiveDuringPlay)}; reminder access preserves progress ${boolLabel(reminders.progressSafe)}.`,
      nextStep: "Keep reminder access cheap enough that players can refresh controls or goals without leaving the learning loop.",
    });
  }

  if (
    objective.currentGoalEasyToRestate === false &&
    objective.nextStepPrescriptive === false
  ) {
    findings.push({
      severity: "blocker",
      title: "onboarding does not restore what the player should do next",
      evidence: `Current goal easy to restate ${boolLabel(objective.currentGoalEasyToRestate)}; next step prescriptive ${boolLabel(objective.nextStepPrescriptive)}.`,
      nextStep: "Restate the current goal and next step in player language at the exact point where play resumes or confusion starts.",
    });
  } else if (
    objective.currentGoalEasyToRestate === false ||
    objective.nextStepPrescriptive === false
  ) {
    findings.push({
      severity: "major",
      title: "objective framing is present but still too vague to recover fast",
      evidence: `Current goal easy to restate ${boolLabel(objective.currentGoalEasyToRestate)}; next step prescriptive ${boolLabel(objective.nextStepPrescriptive)}.`,
      nextStep: "Tighten objective wording so the player can translate it into one immediate action without guessing.",
    });
  }

  if (
    failedResumeCount > 0 &&
    (menuDiveResumeCount > 0 || stalePromptMismatchCount > 0)
  ) {
    findings.push({
      severity: "blocker",
      title: "returning after a short break does not reliably restore the lesson",
      evidence: `${formatElementCount(failedResumeCount, resumeProbes.length, "resume probes")} lost goal, controls, or next-step clarity; ${formatElementCount(menuDiveResumeCount, resumeProbes.length, "resume probes")} required menu diving; ${formatElementCount(stalePromptMismatchCount, resumeProbes.length, "resume probes")} returned to stale or misleading prompt state.`,
      nextStep: "Expose current goal, live controls, and the next actionable step directly on resume without relying on memory or deep menu recovery.",
    });
  } else if (failedResumeCount > 0 || menuDiveResumeCount > 0 || stalePromptMismatchCount > 0) {
    findings.push({
      severity: "major",
      title: "interruption recovery is incomplete after a short break",
      evidence: `${formatElementCount(failedResumeCount, resumeProbes.length, "resume probes")} lost goal, controls, or next-step clarity; ${formatElementCount(menuDiveResumeCount, resumeProbes.length, "resume probes")} required menu diving; ${formatElementCount(stalePromptMismatchCount, resumeProbes.length, "resume probes")} showed stale prompt state.`,
      nextStep: "Add a cheap resume surface that restates live objective, controls, and next action when the player returns mid-run.",
    });
  }

  if (reminders.remapSafe === false) {
    findings.push({
      severity: "major",
      title: "tutorial or reminder text may drift from live input mapping",
      evidence: `Reminder text matches remapped bindings ${boolLabel(reminders.remapSafe)}.`,
      nextStep: "Bind tutorial and reminder prompts to the live mapping so onboarding stays truthful after remaps.",
    });
  }

  const simpleLoop =
    teachingLoad.loopComplexity === "low" || teachingLoad.discoverableThroughExperiment === true;
  const upfrontScreens = teachingLoad.upfrontInstructionScreens ?? 0;
  const prePlayPrompts = teachingLoad.promptsBeforeMeaningfulPlay ?? 0;
  const forcedTutorialSteps = teachingLoad.forcedTutorialSteps ?? 0;
  const firstInputBlocked = teachingLoad.blocksFirstMeaningfulInput === true;
  const frontLoadedPromptLoad = upfrontScreens >= 2 || prePlayPrompts >= 4;
  const noCheapHelp = teachingLoad.optionalHelpOnDemand === false;

  if (simpleLoop && frontLoadedPromptLoad && firstInputBlocked && noCheapHelp) {
    findings.push({
      severity: "blocker",
      title: "simple or discoverable loop is blocked behind forced onboarding with no cheap fallback help",
      evidence: `Loop complexity ${teachingLoad.loopComplexity ?? "unknown"}; discoverable through experimentation ${boolLabel(teachingLoad.discoverableThroughExperiment)}; upfront instruction screens ${upfrontScreens}; prompts before meaningful play ${prePlayPrompts}; forced tutorial steps ${forcedTutorialSteps}; first meaningful input blocked ${boolLabel(teachingLoad.blocksFirstMeaningfulInput)}; optional help on demand ${boolLabel(teachingLoad.optionalHelpOnDemand)}.`,
      nextStep: "Let the player reach the first meaningful action sooner, trim forced tutorial steps, and move extra explanation into cheap reopenable help.",
    });
  } else if (simpleLoop && frontLoadedPromptLoad && firstInputBlocked) {
    findings.push({
      severity: "major",
      title: "simple or discoverable loop delays first meaningful input behind too much onboarding",
      evidence: `Loop complexity ${teachingLoad.loopComplexity ?? "unknown"}; discoverable through experimentation ${boolLabel(teachingLoad.discoverableThroughExperiment)}; upfront instruction screens ${upfrontScreens}; prompts before meaningful play ${prePlayPrompts}; forced tutorial steps ${forcedTutorialSteps}; first meaningful input blocked ${boolLabel(teachingLoad.blocksFirstMeaningfulInput)}.`,
      nextStep: "Reduce the amount of forced explanation before the first real action and shift extra teaching into just-in-time prompts or optional help.",
    });
  } else if (simpleLoop && frontLoadedPromptLoad) {
    findings.push({
      severity: "major",
      title: "simple or discoverable loop is over-explained before meaningful play",
      evidence: `Loop complexity ${teachingLoad.loopComplexity ?? "unknown"}; discoverable through experimentation ${boolLabel(teachingLoad.discoverableThroughExperiment)}; upfront instruction screens ${upfrontScreens}; prompts before meaningful play ${prePlayPrompts}.`,
      nextStep: "Trim front-loaded onboarding for simple loops, let experimentation teach the first action, and move extra explanation into optional or just-in-time help.",
    });
  }

  if (!simpleLoop && firstInputBlocked && noCheapHelp && forcedTutorialSteps >= 3) {
    findings.push({
      severity: "major",
      title: "complex onboarding may still front-load too much mandatory teaching before play begins",
      evidence: `Loop complexity ${teachingLoad.loopComplexity ?? "unknown"}; forced tutorial steps ${forcedTutorialSteps}; first meaningful input blocked ${boolLabel(teachingLoad.blocksFirstMeaningfulInput)}; optional help on demand ${boolLabel(teachingLoad.optionalHelpOnDemand)}.`,
      nextStep: "Keep the minimum mandatory setup for complex loops, but convert extra explanation into interactive, reopenable teaching after the player starts playing.",
    });
  }

  if (
    criticalVanishingPromptCount > 0 &&
    (reminders.controlsDuringPlay === false || reminders.objectiveDuringPlay === false)
  ) {
    findings.push({
      severity: "blocker",
      title: "critical onboarding prompts vanish before the player can recover them later",
      evidence: `${formatElementCount(criticalVanishingPromptCount, ephemeralMoments.length, "critical temporary prompts")} auto-dismissed without player pacing or replay path while controls reminder during play was ${boolLabel(reminders.controlsDuringPlay)} and objective reminder during play was ${boolLabel(reminders.objectiveDuringPlay)}.`,
      nextStep: "Keep critical teaching prompts player-paced or reopenable, especially when active-play reminders are incomplete.",
    });
  } else if (criticalVanishingPromptCount > 0) {
    findings.push({
      severity: "major",
      title: "some critical onboarding prompts disappear before the player can recheck them",
      evidence: `${formatElementCount(criticalVanishingPromptCount, ephemeralMoments.length, "critical temporary prompts")} auto-dismissed without player pacing or replay path.`,
      nextStep: "Convert critical temporary prompts into player-paced or reviewable teaching so the lesson survives pressure and short breaks.",
    });
  }

  if (findings.length === 0) {
    findings.push({
      severity: "minor",
      title: "no major onboarding breakdown was logged in the supplied observations",
      evidence: "Verb timing, teaching load, reminder access, and objective recall did not record a severe failure in the sampled pass.",
      nextStep: "Keep the current onboarding shape and validate it again after a longer first-run or return-after-break pass.",
    });
  }

  return findings.sort((left, right) => severityRank(left.severity) - severityRank(right.severity));
}

function buildFindingsSection(findings: Finding[]): string[] {
  return findings.map((finding) => `- \`${finding.severity}\` ${finding.title}. Evidence: ${finding.evidence}`);
}

function buildEvidenceSection(data: ObservationFile): string[] {
  const evidence = data.evidence ?? {};
  const resumeProbes = data.resumeProbes ?? [];
  const ephemeralMoments = data.ephemeralMoments ?? [];
  const lines = [
    `- Evidence mode: ${evidence.mode ?? "unknown"}.`,
    `- Runs sampled: ${evidence.sampledRuns ?? 0}.`,
    `- Failures or resets sampled: ${evidence.sampledFailures ?? 0}.`,
    `- Resume probes sampled: ${resumeProbes.length}.`,
    `- Temporary onboarding prompts logged: ${ephemeralMoments.length}.`,
  ];

  if (evidence.notes && evidence.notes.length > 0) {
    for (const note of evidence.notes) {
      lines.push(`- Evidence note: ${note}`);
    }
  }

  return lines;
}

function buildVerbSection(verbs: VerbObservation[]): string[] {
  if (verbs.length === 0) {
    return ["- No verb observations recorded yet."];
  }

  return verbs.map((verb) => {
    const parts = [
      `\`${verb.name}\``,
      `prompt ${verb.firstPromptAt ?? "unknown"}`,
      `required ${verb.firstRequiredAt ?? "unknown"}`,
      `practice before risk ${boolLabel(verb.practiceBeforeRisk)}`,
      `feedback ${verb.feedback ?? "unknown"}`,
    ];
    return `- ${parts.join("; ")}.`;
  });
}

function buildReminderSection(reminders: ReminderObservation, objective: ObjectiveObservation): string[] {
  return [
    `- Controls reminder during play: ${boolLabel(reminders.controlsDuringPlay)}.`,
    `- Objective reminder during play: ${boolLabel(reminders.objectiveDuringPlay)}.`,
    `- Reminder access preserves progress: ${boolLabel(reminders.progressSafe)}.`,
    `- Reminder text matches remapped bindings: ${boolLabel(reminders.remapSafe)}.`,
    `- Player can restate current goal fast: ${boolLabel(objective.currentGoalEasyToRestate)}.`,
    `- Next step is prescriptive, not vague: ${boolLabel(objective.nextStepPrescriptive)}.`,
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

function buildEphemeralPromptSection(ephemeralMoments: EphemeralMomentObservation[]): string[] {
  if (ephemeralMoments.length === 0) {
    return ["- No temporary onboarding prompts recorded yet."];
  }

  return ephemeralMoments.map((moment) => {
    const parts = [
      `\`${moment.name ?? "unnamed prompt"}\``,
      `kind ${moment.kind ?? "unknown"}`,
      `importance ${moment.importance ?? "unknown"}`,
      `auto-dismisses ${boolLabel(moment.autoDismisses)}`,
      `player-paced ${boolLabel(moment.playerControlledAdvance)}`,
      `reviewable later ${boolLabel(moment.reviewableLater)}`,
      `obstructs critical read ${boolLabel(moment.obstructsCriticalRead)}`,
    ];
    const suffix = moment.notes ? ` Notes: ${moment.notes}` : "";
    return `- ${parts.join("; ")}.${suffix}`;
  });
}

function buildTeachingLoadSection(teachingLoad: TeachingLoadObservation): string[] {
  return [
    `- Loop complexity: ${teachingLoad.loopComplexity ?? "unknown"}.`,
    `- Core loop discoverable through experimentation: ${boolLabel(teachingLoad.discoverableThroughExperiment)}.`,
    `- Upfront instruction screens before play: ${teachingLoad.upfrontInstructionScreens ?? "unknown"}.`,
    `- Prompt count before meaningful play: ${teachingLoad.promptsBeforeMeaningfulPlay ?? "unknown"}.`,
    `- First meaningful input blocked by onboarding: ${boolLabel(teachingLoad.blocksFirstMeaningfulInput)}.`,
    `- Forced tutorial steps before free play: ${teachingLoad.forcedTutorialSteps ?? "unknown"}.`,
    `- Optional help available on demand: ${boolLabel(teachingLoad.optionalHelpOnDemand)}.`,
  ];
}

function buildEarlyLoopSection(earlyLoop: EarlyLoopObservation): string[] {
  return [
    `- First meaningful input: ${earlyLoop.firstMeaningfulInputAt ?? "unknown"} (${typeof earlyLoop.secondsToFirstMeaningfulInput === "number" ? `${earlyLoop.secondsToFirstMeaningfulInput}s` : "unknown"}).`,
    `- First risk: ${earlyLoop.firstRiskAt ?? "unknown"} (${typeof earlyLoop.secondsToFirstRisk === "number" ? `${earlyLoop.secondsToFirstRisk}s` : "unknown"}).`,
    `- First reward or payoff: ${earlyLoop.firstRewardAt ?? "unknown"} (${typeof earlyLoop.secondsToFirstReward === "number" ? `${earlyLoop.secondsToFirstReward}s` : "unknown"}).`,
    `- First retry opportunity: ${earlyLoop.firstRetryOpportunityAt ?? "unknown"} (${typeof earlyLoop.secondsToFirstRetryOpportunity === "number" ? `${earlyLoop.secondsToFirstRetryOpportunity}s` : "unknown"}).`,
    `- Cadence note: ${earlyLoop.notes ?? "none logged"}.`,
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

  if (findings.length === 1 && findings[0]?.severity === "minor") {
    return [
      `- ${game}: evidence-first onboarding review still matters for this catalog because a clean pass creates a reusable baseline before future content or UI changes quietly break first-run clarity.`,
    ];
  }

  return [
    `- ${game}: blocker-first onboarding reporting matters for this catalog because sticky arcade loops die early when verb timing, teaching-load bloat, reminder access, objective recall, or return-after-break recovery break; this pass logged ${blockerCount} blocker(s) and ${majorCount} major finding(s) with explicit evidence scope instead of flat tutorial notes.`,
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

  const normalized = existing.replace(/\r\n/g, "\n");
  const bodyLines = normalized
    .split("\n")
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (bodyLines.includes(learningLine)) {
    return;
  }

  const next = [
    header,
    "",
    learningLine,
    ...bodyLines,
    "",
  ].join("\n");

  writeFileSync(skillLearningPath, next, "utf8");
}

function buildMarkdown(data: ObservationFile): string {
  const game = data.game ?? "unknown-game";
  const sessionDate = data.sessionDate ?? new Date().toISOString().slice(0, 10);
  const verbs = data.verbs ?? [];
  const reminders = normalizeReminders(data);
  const objective = normalizeObjective(data);
  const teachingLoad = normalizeTeachingLoad(data);
  const earlyLoop = data.earlyLoop ?? {};
  const resumeProbes = data.resumeProbes ?? [];
  const ephemeralMoments = data.ephemeralMoments ?? [];
  const findings = buildFindings(data);

  return [
    `# ${game} Onboarding Critique`,
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
    "## Verb Timing And Practice",
    "",
    ...buildVerbSection(verbs),
    "",
    "## Reminder And Objective Recall",
    "",
    ...buildReminderSection(reminders, objective),
    "",
    "## Interruption Recovery",
    "",
    ...buildResumeSection(resumeProbes),
    "",
    "## Temporary Prompt Recovery",
    "",
    ...buildEphemeralPromptSection(ephemeralMoments),
    "",
    "## Teaching Load And Discoverability",
    "",
    ...buildTeachingLoadSection(teachingLoad),
    "",
    "## Early Loop Cadence",
    "",
    ...buildEarlyLoopSection(earlyLoop),
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
    "",
    "## Durable Learning",
    "",
    ...buildDurableLearning(data, findings),
    "",
  ].join("\n");
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const observationData = !options.template && options.observations
    ? readObservations(options.observations)
    : undefined;
  const output = options.template || !observationData
    ? buildTemplate()
    : buildMarkdown(observationData);

  if (observationData) {
    const learningLine = extractLearningLine(buildDurableLearning(observationData, buildFindings(observationData)));
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
