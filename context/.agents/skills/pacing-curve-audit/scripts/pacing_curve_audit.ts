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
type BeatKind = "teach" | "test" | "twist" | "rest" | "fail";
type NoveltyKind = "new-verb" | "new-combo" | "escalation" | "none";

type BeatObservation = {
  at?: string;
  label?: string;
  kind?: BeatKind;
  novelty?: NoveltyKind;
  skills?: string[];
  practicedBefore?: boolean;
  readable?: boolean;
  activeDemands?: number;
  newDemands?: number;
  stackReadable?: boolean;
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

type ObservationFile = {
  game?: string;
  sessionDate?: string;
  beats?: BeatObservation[];
  earlyLoop?: EarlyLoopObservation;
  retrySeconds?: number;
  returnsToCurrentTestQuickly?: boolean;
  confounders?: ConfounderObservation;
  evidence?: EvidenceObservation;
  resumeProbes?: ResumeProbeObservation[];
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

function severityRank(severity: Severity): number {
  if (severity === "blocker") {
    return 0;
  }
  if (severity === "major") {
    return 1;
  }
  return 2;
}

function formatCount(count: number, total: number, label: string): string {
  if (total <= 0) {
    return `${count} ${label}`;
  }
  return `${count}/${total} ${label}`;
}

function buildTemplate(): string {
  return [
    "# Pacing Curve Audit Template",
    "",
    "Use during first-run or early-run browser play.",
    "",
    "## Core Checks",
    "",
    "- Teach a new verb before the game demands it under pressure.",
    "- Introduce new combinations after component skills are seen and lightly practiced.",
    "- Space novelty with short consolidation or rest beats.",
    "- Change one pressure variable at a time before overlap spikes.",
    "- Return the player to the same lesson quickly after failure.",
    "- Log when mechanic stack depth becomes unreadable instead of assuming more overlap always means better escalation.",
    "",
    "## Observation JSON",
    "",
    "```json",
    JSON.stringify(
      {
        game: "some-game",
        sessionDate: "2026-04-29",
        beats: [
          {
            at: "00:12",
            label: "first gap",
            kind: "teach",
            novelty: "new-verb",
            skills: ["jump"],
            practicedBefore: true,
            readable: true,
            notes: "safe space before first punishment",
          },
          {
            at: "00:31",
            label: "gap plus moving enemy",
            kind: "test",
            novelty: "new-combo",
            skills: ["jump", "spacing"],
            practicedBefore: false,
            readable: true,
            activeDemands: 2,
            newDemands: 1,
            stackReadable: true,
            notes: "combo lands one beat after isolated jump",
          },
        ],
        earlyLoop: {
          firstMeaningfulInputAt: "00:05",
          secondsToFirstMeaningfulInput: 5,
          firstRiskAt: "00:12",
          secondsToFirstRisk: 12,
          firstRewardAt: "00:18",
          secondsToFirstReward: 18,
          firstRetryOpportunityAt: "00:41",
          secondsToFirstRetryOpportunity: 41,
          notes: "loop reaches first ask and first payoff quickly enough that teach-test rhythm stays warm",
        },
        retrySeconds: 4,
        returnsToCurrentTestQuickly: true,
        evidence: {
          mode: "direct-play",
          sampledRuns: 2,
          sampledFailures: 1,
          sampledRetries: 1,
          sampledResumeProbes: 1,
          notes: [
            "tracked first-run teach-test timeline",
            "confirmed combo stack on second short run",
          ],
        },
        confounders: {
          inputCertainty: "stable",
          responseLatency: "stable",
          cameraSupportsAction: true,
          viewObstructedAtDecision: false,
          autoCameraInterference: false,
          notes: "stack read came from pacing, not response lag or blocked view",
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
            notes: "objective holds, but verb reminder does not survive the break",
          },
        ],
        strengths: ["first hazard isolates jump timing before overlap"],
        frictions: ["combo ask arrives before each ingredient feels settled"],
      },
      null,
      2,
    ),
    "```",
    "",
  ].join("\n");
}

function noveltyBeats(beats: BeatObservation[]): BeatObservation[] {
  return beats.filter((beat) => beat.novelty && beat.novelty !== "none");
}

function countWhere<T>(items: T[], predicate: (item: T) => boolean): number {
  return items.filter(predicate).length;
}

function countConsecutiveNoveltyWithoutRest(beats: BeatObservation[]): number {
  let maxRun = 0;
  let current = 0;

  for (const beat of beats) {
    if (beat.kind === "rest" || beat.novelty === "none") {
      current = 0;
      continue;
    }

    if (beat.novelty === "new-verb" || beat.novelty === "new-combo" || beat.novelty === "escalation") {
      current += 1;
      if (current > maxRun) {
        maxRun = current;
      }
    }
  }

  return maxRun;
}

function getPeakActiveDemands(beats: BeatObservation[]): number {
  return beats.reduce((peak, beat) => Math.max(peak, beat.activeDemands ?? 0), 0);
}

function countStackPressureSpikes(beats: BeatObservation[]): number {
  return countWhere(
    beats,
    (beat) =>
      (beat.novelty === "new-combo" || beat.novelty === "escalation") &&
      (beat.activeDemands ?? 0) >= 3,
  );
}

function countUnreadableStacks(beats: BeatObservation[]): number {
  return countWhere(
    beats,
    (beat) => (beat.activeDemands ?? 0) >= 3 && (beat.stackReadable === false || beat.readable === false),
  );
}

function countFreshOverloadBeats(beats: BeatObservation[]): number {
  return countWhere(
    beats,
    (beat) => (beat.newDemands ?? 0) >= 2 || ((beat.newDemands ?? 0) >= 1 && (beat.activeDemands ?? 0) >= 4),
  );
}

function buildFindings(data: ObservationFile): Finding[] {
  const beats = data.beats ?? [];
  const totalBeats = beats.length;
  const novelBeats = noveltyBeats(beats);
  const totalNovelBeats = novelBeats.length;
  const unsupportedNovelty = countWhere(
    beats,
    (beat) => beat.novelty !== undefined && beat.novelty !== "none" && beat.practicedBefore === false,
  );
  const lateNewCombos = countWhere(beats, (beat) => beat.novelty === "new-combo" && beat.practicedBefore === false);
  const unreadableBeats = countWhere(beats, (beat) => beat.readable === false);
  const stackedNoveltyRun = countConsecutiveNoveltyWithoutRest(beats);
  const unreadableNoveltyBeats = countWhere(
    beats,
    (beat) => beat.novelty !== undefined && beat.novelty !== "none" && beat.readable === false,
  );
  const stackPressureSpikes = countStackPressureSpikes(beats);
  const unreadableStacks = countUnreadableStacks(beats);
  const freshOverloadBeats = countFreshOverloadBeats(beats);
  const peakActiveDemands = getPeakActiveDemands(beats);
  const teachCount = countWhere(beats, (beat) => beat.kind === "teach");
  const restCount = countWhere(beats, (beat) => beat.kind === "rest" || beat.novelty === "none");
  const resumeProbes = data.resumeProbes ?? [];
  const failedResumeProbes = countWhere(
    resumeProbes,
    (probe) =>
      probe.currentGoalRecoverable === false ||
      probe.controlsRecoverable === false ||
      probe.nextActionClear === false ||
      probe.needsMenuDive === true ||
      probe.stalePromptMismatch === true,
  );
  const confounders = data.confounders ?? {};
  const pacingConfounded =
    confounders.viewObstructedAtDecision === true ||
    confounders.autoCameraInterference === true ||
    confounders.inputCertainty === "major-slip" ||
    confounders.responseLatency === "late";
  const findings: Finding[] = [];

  if (lateNewCombos > 0 && unsupportedNovelty > 0) {
    findings.push({
      severity: "blocker",
      title: "new combinations arrive before their ingredient skills feel rehearsed",
      evidence: `${formatCount(lateNewCombos, totalBeats, "beats")} introduced new combinations without enough practice and ${formatCount(unsupportedNovelty, totalNovelBeats, "novelty beats")} landed before rehearsal.`,
      nextStep: "Insert one low-risk beat that isolates each ingredient skill before asking for the combined test under pressure.",
    });
  } else if (unsupportedNovelty > 0) {
    findings.push({
      severity: "major",
      title: "some novel demands land before the player gets enough rehearsal",
      evidence: `${formatCount(unsupportedNovelty, totalNovelBeats, "novelty beats")} arrived without enough prior practice.`,
      nextStep: "Move or soften the first ask for each novel beat so the player rehearses once before punishment matters.",
    });
  }

  if (stackedNoveltyRun >= 4) {
    findings.push({
      severity: "blocker",
      title: "novelty stacks too long without a consolidation beat",
      evidence: `Longest uninterrupted novelty run was ${stackedNoveltyRun} beats with only ${restCount} rest or consolidation beat(s) logged overall.`,
      nextStep: "Break the longest novelty run with one short mastery beat that reuses known skills before the next twist lands.",
    });
  } else if (stackedNoveltyRun >= 3) {
    findings.push({
      severity: "major",
      title: "novelty pressure stacks faster than the player can consolidate",
      evidence: `Longest uninterrupted novelty run was ${stackedNoveltyRun} beats with ${restCount} rest or consolidation beat(s) logged.`,
      nextStep: "Add or move one short consolidation beat so new pressure layers do not arrive back to back.",
    });
  }

  if (unreadableNoveltyBeats > 0 && stackedNoveltyRun >= 3) {
    findings.push({
      severity: "blocker",
      title: "escalation changes the ask without making the new lesson legible",
      evidence: `${formatCount(unreadableNoveltyBeats, totalNovelBeats, "novelty beats")} were hard to read and novelty was already stacking for ${stackedNoveltyRun} beats.`,
      nextStep: "Change one pressure variable at a time and stage clearer telegraph or camera framing before overlap escalation.",
    });
  } else if (unreadableBeats > 0) {
    findings.push({
      severity: "major",
      title: "some pacing beats change the ask without making the lesson readable",
      evidence: `${formatCount(unreadableBeats, totalBeats, "beats")} were logged as unreadable.`,
      nextStep: "Make each escalation legible before layering the next one so the player can name the lesson in one glance.",
    });
  }

  if (freshOverloadBeats > 0 && unreadableStacks > 0) {
    findings.push({
      severity: "blocker",
      title: "mechanic stacking crosses from readable depth into overload",
      evidence: `${formatCount(freshOverloadBeats, totalBeats, "beats")} introduced too many fresh asks at once and ${formatCount(unreadableStacks, totalBeats, "high-stack beats")} were not readable; peak active demands logged ${peakActiveDemands}.`,
      nextStep: "Split the stack so only one fresh ask lands per beat, then raise active demand count after one readable rehearsal.",
    });
  } else if (stackPressureSpikes > 0 && peakActiveDemands >= 3) {
    findings.push({
      severity: peakActiveDemands >= 4 ? "major" : "minor",
      title: "combined asks may be arriving before stack depth feels earned",
      evidence: `${formatCount(stackPressureSpikes, totalBeats, "beats")} introduced combo or escalation pressure at ${peakActiveDemands} active demands peak.`,
      nextStep: "Delay the next layered ask until the previous stack reads cleanly for at least one beat.",
    });
  }

  if (teachCount === 0 && totalNovelBeats > 0) {
    findings.push({
      severity: "major",
      title: "sampled run shows pressure or twist beats without an isolated teaching beat",
      evidence: `Teach beats logged ${teachCount}; novelty beats logged ${totalNovelBeats}.`,
      nextStep: "Create at least one clear teach beat before the next pressure test so the loop explains itself in play.",
    });
  }

  if (typeof data.retrySeconds === "number" && data.retrySeconds > 12) {
    findings.push({
      severity: "blocker",
      title: "retry path is long enough to cool the current lesson",
      evidence: `Retry took ${data.retrySeconds}s and return to current test quickly was ${boolLabel(data.returnsToCurrentTestQuickly)}.`,
      nextStep: "Shorten fail-to-retry dead time and restart nearer the failed lesson while the correction is still fresh.",
    });
  } else if (typeof data.retrySeconds === "number" && data.retrySeconds > 8) {
    findings.push({
      severity: "major",
      title: "retry pacing risks breaking the learning loop",
      evidence: `Retry took ${data.retrySeconds}s and return to current test quickly was ${boolLabel(data.returnsToCurrentTestQuickly)}.`,
      nextStep: "Trim retry path so the player can test the corrected response before momentum fades.",
    });
  }

  if (data.returnsToCurrentTestQuickly === false) {
    findings.push({
      severity: typeof data.retrySeconds === "number" && data.retrySeconds > 8 ? "blocker" : "major",
      title: "failure does not return the player to the same lesson quickly",
      evidence: `Returns to current test quickly ${boolLabel(data.returnsToCurrentTestQuickly)}; retry seconds ${typeof data.retrySeconds === "number" ? data.retrySeconds : "unknown"}.`,
      nextStep: "Move checkpoint or wave restart closer to the current lesson instead of forcing solved downtime first.",
    });
  }

  if (failedResumeProbes > 0) {
    findings.push({
      severity:
        failedResumeProbes > 0 &&
        countWhere(resumeProbes, (probe) => probe.needsMenuDive === true || probe.stalePromptMismatch === true) > 0
          ? "major"
          : "minor",
      title: "short interruption breaks pacing by making the current lesson hard to recover",
      evidence: `${formatCount(failedResumeProbes, resumeProbes.length, "resume probes")} lost goal, controls, or next-action clarity after a short break.`,
      nextStep: "Add a cheap in-run reminder path so the current lesson, controls, or next action can be recovered without menu spelunking.",
    });
  }

  if (pacingConfounded) {
    findings.push({
      severity: "major",
      title: "control or view instability confounds the pacing read",
      evidence: `Input certainty ${confounders.inputCertainty ?? "unknown"}; response latency ${confounders.responseLatency ?? "unknown"}; view obstructed ${boolLabel(confounders.viewObstructedAtDecision)}; auto-camera interference ${boolLabel(confounders.autoCameraInterference)}.`,
      nextStep: "Stabilize control or view support before retuning pacing beats that may be failing for visibility or timing reasons instead of cadence alone.",
    });
  }

  if (findings.length === 0) {
    findings.push({
      severity: "minor",
      title: "no major pacing-curve breakdown was logged in the supplied observations",
      evidence: "Teach, test, rest, escalation, and retry timing did not record a severe pacing failure in the sampled pass.",
      nextStep: "Keep the current teach-test-rest shape and validate it on a longer or harder session before changing it.",
    });
  }

  return findings.sort((left, right) => severityRank(left.severity) - severityRank(right.severity));
}

function buildBeatSection(beats: BeatObservation[]): string[] {
  if (beats.length === 0) {
    return ["- No beat observations recorded yet."];
  }

  return beats.map((beat, index) => {
    const skills = beat.skills && beat.skills.length > 0 ? beat.skills.join(", ") : "unknown";
    const parts = [
      `beat ${index + 1}`,
      `time ${beat.at ?? "unknown"}`,
      `label ${beat.label ?? "unknown"}`,
      `kind ${beat.kind ?? "unknown"}`,
      `novelty ${beat.novelty ?? "unknown"}`,
      `skills ${skills}`,
      `practiced before ${boolLabel(beat.practicedBefore)}`,
      `readable ${boolLabel(beat.readable)}`,
      `active demands ${typeof beat.activeDemands === "number" ? beat.activeDemands : "unknown"}`,
      `new demands ${typeof beat.newDemands === "number" ? beat.newDemands : "unknown"}`,
      `stack readable ${boolLabel(beat.stackReadable)}`,
      `notes ${beat.notes ?? "none"}`,
    ];
    return `- ${parts.join("; ")}.`;
  });
}

function buildFindingsSection(findings: Finding[]): string[] {
  return findings.map((finding) => `- \`${finding.severity}\` ${finding.title}. Evidence: ${finding.evidence}`);
}

function buildEvidenceSection(data: ObservationFile): string[] {
  const evidence = data.evidence ?? {};
  const lines = [
    `- Evidence mode: ${evidence.mode ?? "unknown"}.`,
    `- Runs sampled: ${evidence.sampledRuns ?? 0}.`,
    `- Failures or resets sampled: ${evidence.sampledFailures ?? 0}.`,
    `- Retries sampled: ${evidence.sampledRetries ?? 0}.`,
    `- Resume probes sampled: ${evidence.sampledResumeProbes ?? data.resumeProbes?.length ?? 0}.`,
  ];

  if (evidence.notes && evidence.notes.length > 0) {
    for (const note of evidence.notes) {
      lines.push(`- Evidence note: ${note}`);
    }
  }

  return lines;
}

function buildRhythmSection(data: ObservationFile): string[] {
  const beats = data.beats ?? [];
  const noveltyCount = noveltyBeats(beats).length;
  const restCount = beats.filter((beat) => beat.kind === "rest" || beat.novelty === "none").length;
  const maxNoveltyRun = countConsecutiveNoveltyWithoutRest(beats);
  const earlyLoop = data.earlyLoop ?? {};

  return [
    `- Novelty beats logged: ${noveltyCount}.`,
    `- Rest or consolidation beats logged: ${restCount}.`,
    `- Longest uninterrupted novelty run: ${maxNoveltyRun}.`,
    `- First meaningful input: ${earlyLoop.firstMeaningfulInputAt ?? "unknown"} (${typeof earlyLoop.secondsToFirstMeaningfulInput === "number" ? `${earlyLoop.secondsToFirstMeaningfulInput}s` : "unknown"}).`,
    `- First reward or payoff: ${earlyLoop.firstRewardAt ?? "unknown"} (${typeof earlyLoop.secondsToFirstReward === "number" ? `${earlyLoop.secondsToFirstReward}s` : "unknown"}).`,
    `- First retry opportunity: ${earlyLoop.firstRetryOpportunityAt ?? "unknown"} (${typeof earlyLoop.secondsToFirstRetryOpportunity === "number" ? `${earlyLoop.secondsToFirstRetryOpportunity}s` : "unknown"}).`,
    `- Retry seconds: ${typeof data.retrySeconds === "number" ? data.retrySeconds : "unknown"}.`,
    `- Returns to current test quickly: ${boolLabel(data.returnsToCurrentTestQuickly)}.`,
    `- Resume recovery failures: ${countWhere(data.resumeProbes ?? [], (probe) => probe.currentGoalRecoverable === false || probe.controlsRecoverable === false || probe.nextActionClear === false || probe.needsMenuDive === true || probe.stalePromptMismatch === true)}.`,
    `- Cadence note: ${earlyLoop.notes ?? "none logged"}.`,
  ];
}

function buildStackSection(beats: BeatObservation[]): string[] {
  if (beats.length === 0) {
    return ["- No stack observations recorded yet."];
  }

  const peakActiveDemands = getPeakActiveDemands(beats);
  const freshOverloadBeats = countFreshOverloadBeats(beats);
  const unreadableStacks = countUnreadableStacks(beats);
  const pressureSpikes = countStackPressureSpikes(beats);
  const rows = [
    `- Peak active demands: ${peakActiveDemands}.`,
    `- Fresh-overload beats: ${freshOverloadBeats}.`,
    `- High-stack unreadable beats: ${unreadableStacks}.`,
    `- Combo or escalation beats at 3+ active demands: ${pressureSpikes}.`,
  ];

  for (const beat of beats) {
    if (
      typeof beat.activeDemands === "number" ||
      typeof beat.newDemands === "number" ||
      typeof beat.stackReadable === "boolean"
    ) {
      rows.push(
        `- Stack beat ${beat.at ?? "unknown"} ${beat.label ?? "unknown"}: active ${typeof beat.activeDemands === "number" ? beat.activeDemands : "unknown"}, new ${typeof beat.newDemands === "number" ? beat.newDemands : "unknown"}, readable ${boolLabel(beat.stackReadable)}.`,
      );
    }
  }

  return rows;
}

function buildListSection(items: string[] | undefined, fallback: string): string[] {
  if (!items || items.length === 0) {
    return [`- ${fallback}`];
  }
  return items.map((item) => `- ${item}`);
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
  const steps = Array.from(new Set(findings.map((finding) => finding.nextStep)));
  return steps.map((step) => `- ${step}`);
}

function buildDurableLearning(data: ObservationFile, findings: Finding[]): string[] {
  const game = data.game ?? "this game";
  const blockerCount = findings.filter((finding) => finding.severity === "blocker").length;
  const majorCount = findings.filter((finding) => finding.severity === "major").length;
  const hasResumeIssue = findings.some(
    (finding) => finding.title === "short interruption breaks pacing by making the current lesson hard to recover",
  );
  const hasConfounderIssue = findings.some(
    (finding) => finding.title === "control or view instability confounds the pacing read",
  );
  const starterCoverageStatus = getStarterCoverageStatus(data);

  if (findings.length === 1 && findings[0]?.severity === "minor") {
    return [
      `- ${game}: evidence-first pacing review still matters for this catalog because a clean teach-test-rest pass with readable mechanic stacking gives a reusable baseline before later content or difficulty changes blur the learning curve.`,
    ];
  }

  if (starterCoverageStatus === "partial" || starterCoverageStatus === "missing") {
    return [
      `- ${game}: pacing review should preserve starter claim guardrails in this catalog because one cold stack spike can prove a local pacing problem without proving the whole run is overloaded; the audit output needs to carry that evidence ceiling forward.`,
    ];
  }

  if (hasResumeIssue) {
    return [
      `- ${game}: pacing review should save interruption-recovery evidence in this catalog because a warm teach-test loop still cools if players cannot recover the current lesson, controls, or next step after a short break.`,
    ];
  }

  if (hasConfounderIssue) {
    return [
      `- ${game}: pacing review should save control and view confounders in this catalog because unreadable escalation can come from camera or response instability, and fixing cadence first would target the wrong root cause.`,
    ];
  }

  return [
    `- ${game}: blocker-first pacing reporting matters for this catalog because sticky arcade loops only deepen when players can learn one demand, consolidate it, then stack the next without overload; this pass logged ${blockerCount} blocker(s) and ${majorCount} major finding(s) with explicit evidence scope instead of loose beat notes.`,
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
  const beats = data.beats ?? [];
  const resumeProbes = data.resumeProbes ?? [];
  const confounders = data.confounders ?? {};
  const findings = buildFindings(data);
  const starterNextEvidence = getStarterNextEvidence(data).filter((item) => item !== "none");

  return [
    `# ${game} Pacing Curve Audit`,
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
    "## Beat Timeline",
    "",
    ...buildBeatSection(beats),
    "",
    "## Rhythm Snapshot",
    "",
    ...buildRhythmSection(data),
    "",
    "## Interruption Recovery",
    "",
    ...buildResumeSection(resumeProbes),
    "",
    "## Mechanic Stack Snapshot",
    "",
    ...buildStackSection(beats),
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
  const data = !options.template && options.observations
    ? readObservations(options.observations)
    : undefined;
  const markdown = options.template || !data
    ? buildTemplate()
    : buildMarkdown(data);

  if (data) {
    const learningLine = extractLearningLine(buildDurableLearning(data, buildFindings(data)));
    if (learningLine) {
      updateLearningFile(learningLine);
    }
  }

  if (options.out) {
    const outputPath = resolve(options.out);
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, markdown, "utf8");
    console.log(`Wrote ${outputPath}`);
    return;
  }

  console.log(markdown);
}

main();
