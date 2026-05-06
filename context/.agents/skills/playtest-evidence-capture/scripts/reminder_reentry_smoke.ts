import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type Severity = "blocker" | "major" | "minor";
type LaneStatus = "pass" | "partial" | "fail" | "missing";

type FirstContactObservation = {
  firstObjectiveClear?: boolean;
  currentGoalEasyToRestate?: boolean;
  nextStepPrescriptive?: boolean;
  controlsReminderAvailable?: boolean;
  objectiveReminderAvailable?: boolean;
  progressSafeHelp?: boolean;
  optionalHelpOnDemand?: boolean;
};

type ReadableProgressionObservation = {
  prerequisiteProgressVisible?: boolean;
  evaluativeReadbackAvailable?: boolean;
  nonComparativeNextStepVisible?: boolean;
  progressFeelsReachable?: boolean;
  progressRemindersAvailable?: boolean;
  notes?: string;
};

type FailureObservation = {
  retrySeconds?: number;
  returnsToRelevantDecision?: boolean;
  correctiveActionClear?: boolean;
  retryContextStable?: boolean;
  notes?: string;
};

type FailStateObservation = {
  objectiveReminderAvailableAfterFail?: boolean;
};

type LearningLoopObservation = {
  immediateRetry?: boolean;
  sameLessonStableAcrossRetries?: boolean;
  sameSkillRetestedQuickly?: boolean;
};

type ResumeProbeObservation = {
  breakType?: string;
  currentGoalRecoverable?: boolean;
  controlsRecoverable?: boolean;
  nextActionClear?: boolean;
  needsMenuDive?: boolean;
  notes?: string;
};

type ProbeOutcomeObservation = {
  probe?: string;
  outcome?: "success" | "partial" | "failed";
  successRating?: number;
  blockers?: string[];
  notes?: string;
};

type EvidenceObservation = {
  mode?: string;
  sampledRuns?: number;
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

type ObservationFile = {
  game?: string;
  sessionDate?: string;
  firstContact?: FirstContactObservation;
  readableProgression?: ReadableProgressionObservation;
  failures?: FailureObservation[];
  failState?: FailStateObservation;
  learningLoop?: LearningLoopObservation;
  resumeProbes?: ResumeProbeObservation[];
  probeOutcomes?: ProbeOutcomeObservation[];
  evidence?: EvidenceObservation;
  confounders?: ConfounderObservation;
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

function summarizeOpener(firstContact: FirstContactObservation): LaneSummary {
  const positiveChecks = [
    firstContact.firstObjectiveClear === true,
    firstContact.currentGoalEasyToRestate === true,
    firstContact.nextStepPrescriptive === true,
  ].filter(Boolean).length;
  const failedChecks = [
    firstContact.firstObjectiveClear === false,
    firstContact.currentGoalEasyToRestate === false,
    firstContact.nextStepPrescriptive === false,
  ].filter(Boolean).length;

  let status: LaneStatus = "missing";
  if (positiveChecks === 0 && failedChecks === 0) {
    status = "missing";
  } else if (failedChecks === 0 && positiveChecks === 3) {
    status = "pass";
  } else if (failedChecks > 0 && positiveChecks <= 1) {
    status = "fail";
  } else {
    status = "partial";
  }

  return {
    label: "Opener goal clarity",
    status,
    evidence: `objective clear ${boolLabel(firstContact.firstObjectiveClear)}; goal restatable ${boolLabel(firstContact.currentGoalEasyToRestate)}; next step prescriptive ${boolLabel(firstContact.nextStepPrescriptive)}.`,
  };
}

function summarizeReminders(
  firstContact: FirstContactObservation,
  resumeProbes: ResumeProbeObservation[],
): LaneSummary {
  const reminderAccess =
    firstContact.controlsReminderAvailable === true ||
    firstContact.objectiveReminderAvailable === true ||
    firstContact.optionalHelpOnDemand === true;
  const reminderRecoveryFailures = resumeProbes.filter(
    (probe) =>
      probe.currentGoalRecoverable === false ||
      probe.controlsRecoverable === false ||
      probe.nextActionClear === false ||
      probe.needsMenuDive === true,
  ).length;
  const resumeCoverage = resumeProbes.length;

  let status: LaneStatus = "missing";
  if (!reminderAccess && resumeCoverage === 0) {
    status = "missing";
  } else if (reminderAccess && reminderRecoveryFailures === 0 && resumeCoverage > 0) {
    status = "pass";
  } else if (!reminderAccess && reminderRecoveryFailures > 0) {
    status = "fail";
  } else {
    status = "partial";
  }

  return {
    label: "Reopenable controls and objectives",
    status,
    evidence:
      `controls reminder ${boolLabel(firstContact.controlsReminderAvailable)}; objective reminder ${boolLabel(firstContact.objectiveReminderAvailable)}; optional help ${boolLabel(firstContact.optionalHelpOnDemand)}; failed resume probes ${reminderRecoveryFailures}/${resumeCoverage}.`,
  };
}

function summarizeProgress(progression: ReadableProgressionObservation): LaneSummary {
  const positiveChecks = [
    progression.prerequisiteProgressVisible === true,
    progression.progressRemindersAvailable === true,
    progression.nonComparativeNextStepVisible === true,
  ].filter(Boolean).length;
  const failedChecks = [
    progression.prerequisiteProgressVisible === false,
    progression.progressRemindersAvailable === false,
    progression.nonComparativeNextStepVisible === false,
  ].filter(Boolean).length;

  let status: LaneStatus = "missing";
  if (positiveChecks === 0 && failedChecks === 0) {
    status = "missing";
  } else if (failedChecks === 0 && positiveChecks >= 2) {
    status = "pass";
  } else if (failedChecks >= 2 && positiveChecks === 0) {
    status = "fail";
  } else {
    status = "partial";
  }

  return {
    label: "Visible prerequisite progress",
    status,
    evidence:
      `prerequisite progress ${boolLabel(progression.prerequisiteProgressVisible)}; progress reminders ${boolLabel(progression.progressRemindersAvailable)}; next-step readback ${boolLabel(progression.nonComparativeNextStepVisible)}; reachable progress ${boolLabel(progression.progressFeelsReachable)}.`,
  };
}

function summarizeRetry(
  failures: FailureObservation[],
  failState: FailStateObservation,
  learningLoop: LearningLoopObservation,
  probeOutcomes: ProbeOutcomeObservation[],
): LaneSummary {
  const sampledFailure = failures[0];
  const retryProbe = probeOutcomes.find((probe) => probe.probe === "fail-retry");
  const retryFast = typeof sampledFailure?.retrySeconds === "number" ? sampledFailure.retrySeconds <= 6 : undefined;
  const retryReadable =
    sampledFailure?.returnsToRelevantDecision === true &&
    sampledFailure.correctiveActionClear !== false &&
    failState.objectiveReminderAvailableAfterFail !== false;
  const retryStable =
    learningLoop.immediateRetry === true &&
    learningLoop.sameLessonStableAcrossRetries !== false &&
    learningLoop.sameSkillRetestedQuickly !== false;

  let status: LaneStatus = "missing";
  if (!sampledFailure && !retryProbe && learningLoop.immediateRetry === undefined) {
    status = "missing";
  } else if (retryFast === true && retryReadable && retryStable) {
    status = "pass";
  } else if (retryFast === false || retryReadable === false) {
    status = "fail";
  } else {
    status = "partial";
  }

  return {
    label: "Post-failure retry readiness",
    status,
    evidence:
      `retry seconds ${typeof sampledFailure?.retrySeconds === "number" ? `${sampledFailure.retrySeconds}s` : "unknown"}; returns to decision ${boolLabel(sampledFailure?.returnsToRelevantDecision)}; corrective action clear ${boolLabel(sampledFailure?.correctiveActionClear)}; objective reminder after fail ${boolLabel(failState.objectiveReminderAvailableAfterFail)}; immediate retry ${boolLabel(learningLoop.immediateRetry)}; retry-stable lesson ${boolLabel(learningLoop.sameLessonStableAcrossRetries)}; fail-retry probe ${retryProbe?.outcome ?? "missing"}.`,
  };
}

function buildFindings(data: ObservationFile, lanes: LaneSummary[]): Finding[] {
  const firstContact = data.firstContact ?? {};
  const progression = data.readableProgression ?? {};
  const failures = data.failures ?? [];
  const confounders = data.confounders ?? {};
  const findings: Finding[] = [];

  const openerLane = lanes.find((lane) => lane.label === "Opener goal clarity");
  const reminderLane = lanes.find((lane) => lane.label === "Reopenable controls and objectives");
  const progressLane = lanes.find((lane) => lane.label === "Visible prerequisite progress");
  const retryLane = lanes.find((lane) => lane.label === "Post-failure retry readiness");

  if (openerLane?.status === "fail") {
    findings.push({
      severity: "blocker",
      title: "opening state does not tell the player a usable goal fast enough",
      evidence: openerLane.evidence,
      nextStep: "Run activation-loop audit next and fix the smallest missing goal or next-step cue before deeper polish.",
    });
  } else if (openerLane?.status === "partial") {
    findings.push({
      severity: "major",
      title: "opening goal clarity is only partly recoverable",
      evidence: openerLane.evidence,
      nextStep: "Tighten the first actionable goal and the next-step phrasing so the opener can be restated without inference.",
    });
  }

  if (reminderLane?.status === "fail") {
    findings.push({
      severity: "blocker",
      title: "essential controls or objectives cannot be cheaply recovered after confusion or a short break",
      evidence: reminderLane.evidence,
      nextStep: "Keep controls and current objective visible or reopenable in-run, then recheck with an interruption-resume probe.",
    });
  } else if (reminderLane?.status === "partial") {
    findings.push({
      severity: "major",
      title: "reminder recovery exists but is not trustworthy across re-entry",
      evidence: reminderLane.evidence,
      nextStep: "Make the same control and objective reminder path work during active play and after a short break, not only at boot.",
    });
  }

  if (progressLane?.status === "fail") {
    findings.push({
      severity: "major",
      title: "prerequisite progress is too hidden to guide effort",
      evidence: progressLane.evidence,
      nextStep: "Expose the active prerequisite state with a concrete count or named blocker, then hand off to readable-progression audit if needed.",
    });
  } else if (progressLane?.status === "partial") {
    findings.push({
      severity: "major",
      title: "progress reminders exist but still do not clearly point to the remaining work",
      evidence: progressLane.evidence,
      nextStep: "Separate visible progress from actionable remaining work so the player knows what is left, not just that progress exists.",
    });
  }

  if (retryLane?.status === "fail") {
    findings.push({
      severity: "blocker",
      title: "post-failure re-entry is too weak to keep the lesson warm",
      evidence: retryLane.evidence,
      nextStep: "Shorten retry friction or improve the post-fail reminder/readback so the next useful action survives death.",
    });
  } else if (retryLane?.status === "partial") {
    findings.push({
      severity: "major",
      title: "retry is available but the next action is not fully re-armed after failure",
      evidence: retryLane.evidence,
      nextStep: "Keep retry fast and pair it with a visible next action or correction cue so failure does not reset comprehension.",
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
      title: "control or view instability confounds the reminder-reentry read",
      evidence:
        `input certainty ${confounders.inputCertainty ?? "unknown"}; response latency ${confounders.responseLatency ?? "unknown"}; view obstructed ${boolLabel(confounders.viewObstructedAtDecision)}; auto-camera interference ${boolLabel(confounders.autoCameraInterference)}.`,
      nextStep: "Stabilize control, visibility, or camera behavior before treating reminder or retry failures as purely UX wording problems.",
    });
  }

  if (findings.length === 0) {
    findings.push({
      severity: "minor",
      title: "no blocker-grade reminder-reentry breakdown logged in the supplied sample",
      evidence:
        `goal reminder access ${boolLabel(firstContact.objectiveReminderAvailable)}; progress reminders ${boolLabel(progression.progressRemindersAvailable)}; sampled failures ${failures.length}.`,
      nextStep: "Use this as a smoke pass only, then deepen with activation-loop or readable-progression audit if later evidence turns muddy.",
    });
  }

  return findings.sort((left, right) => severityRank(left.severity) - severityRank(right.severity));
}

function buildTemplate(): string {
  return [
    "# Reminder Reentry Smoke Template",
    "",
    "Use one short browser-play sample and capture only observed facts.",
    "",
    "## Goal",
    "",
    "- Check opener goal clarity.",
    "- Check whether controls and objectives can be reopened during play or after a short break.",
    "- Check whether prerequisite progress is visible enough to guide effort.",
    "- Check whether failure returns the player to a readable next action quickly enough to keep the lesson warm.",
    "",
    "## Reuse",
    "",
    "- You can point this script at a full `playtest-evidence-capture` observation JSON.",
    "- The smallest useful fields are `firstContact`, `readableProgression`, `failures`, `failState`, `learningLoop`, `resumeProbes`, `probeOutcomes`, and `confounders`.",
    "",
    "## Output",
    "",
    "- Smoke verdict per lane: opener, reminders, progress, retry.",
    "- Blocker-first findings.",
    "- Next audit handoff guidance.",
  ].join("\n");
}

function buildEvidenceSection(data: ObservationFile): string[] {
  const evidence = data.evidence ?? {};
  return [
    `- Evidence mode: ${evidence.mode ?? "unknown"}.`,
    `- Runs sampled: ${evidence.sampledRuns ?? 0}.`,
    `- Failures sampled: ${evidence.sampledFailures ?? data.failures?.length ?? 0}.`,
    `- Retries sampled: ${evidence.sampledRetries ?? 0}.`,
    `- Resume probes sampled: ${evidence.sampledResumeProbes ?? data.resumeProbes?.length ?? 0}.`,
    `- Probe outcomes sampled: ${data.probeOutcomes?.length ?? 0}.`,
    ...(evidence.notes?.map((note) => `- Evidence note: ${note}`) ?? []),
  ];
}

function buildLaneSection(lanes: LaneSummary[]): string[] {
  return lanes.map((lane) => `- ${lane.label}: ${lane.status}. Evidence: ${lane.evidence}`);
}

function buildFindingsSection(findings: Finding[]): string[] {
  return findings.map((finding) => `- \`${finding.severity}\` ${finding.title}. Evidence: ${finding.evidence}`);
}

function buildResumeSection(resumeProbes: ResumeProbeObservation[]): string[] {
  if (resumeProbes.length === 0) {
    return ["- No interruption-resume probe recorded yet."];
  }

  return resumeProbes.map((probe) => {
    return `- break ${probe.breakType ?? "unknown"}; goal recoverable ${boolLabel(probe.currentGoalRecoverable)}; controls recoverable ${boolLabel(probe.controlsRecoverable)}; next action clear ${boolLabel(probe.nextActionClear)}; menu dive needed ${boolLabel(probe.needsMenuDive)}; notes ${probe.notes ?? "none"}.`;
  });
}

function buildProbeOutcomeSection(probeOutcomes: ProbeOutcomeObservation[]): string[] {
  if (probeOutcomes.length === 0) {
    return ["- No focused probe outcomes recorded yet."];
  }

  return probeOutcomes.map((probe) => {
    return `- ${probe.probe ?? "unknown-probe"}: outcome=${probe.outcome ?? "unknown"}; success=${typeof probe.successRating === "number" ? `${probe.successRating}/4` : "unknown"}; blockers=${probe.blockers?.join(", ") ?? "none"}; notes=${probe.notes ?? "none"}.`;
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

function buildNextSteps(findings: Finding[]): string[] {
  return Array.from(new Set(findings.map((finding) => finding.nextStep))).map((step) => `- ${step}`);
}

function buildSummary(data: ObservationFile) {
  const lanes = [
    summarizeOpener(data.firstContact ?? {}),
    summarizeReminders(data.firstContact ?? {}, data.resumeProbes ?? []),
    summarizeProgress(data.readableProgression ?? {}),
    summarizeRetry(
      data.failures ?? [],
      data.failState ?? {},
      data.learningLoop ?? {},
      data.probeOutcomes ?? [],
    ),
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
    `# ${summary.game} Reminder Reentry Smoke`,
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
    "## Resume Probe",
    "",
    ...buildResumeSection(data.resumeProbes ?? []),
    "",
    "## Probe Outcomes",
    "",
    ...buildProbeOutcomeSection(data.probeOutcomes ?? []),
    "",
    "## Confounders",
    "",
    ...buildConfounderSection(data.confounders ?? {}),
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
