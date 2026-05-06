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

type ReachabilityObservation = {
  midRunSettingsReachable?: boolean;
  pauseSettingsReachable?: boolean;
  postFailureSettingsReachable?: boolean;
  postFailureAssistReachable?: boolean;
  menuDepth?: number;
  notes?: string;
};

type ChangeSafetyObservation = {
  difficultyAdjustableMidRun?: boolean;
  assistsAdjustableMidRun?: boolean;
  changesApplyWithoutRestart?: boolean;
  progressPreservedWhenChanged?: boolean;
  notes?: string;
};

type ReminderPracticeObservation = {
  controlsReminderAvailable?: boolean;
  objectiveReminderAvailable?: boolean;
  tutorialReplayAvailable?: boolean;
  practiceReliefAvailable?: boolean;
  promptReadableLongEnoughToUseKnob?: boolean;
  notes?: string;
};

type PersistenceObservation = {
  assistStatePersistsAcrossRetry?: boolean;
  difficultyStatePersistsAcrossRetry?: boolean;
  retryReentersWithExpectedState?: boolean;
  notes?: string;
};

type ObservationFile = {
  game?: string;
  sessionDate?: string;
  settingsAndAssists?: {
    reachability?: ReachabilityObservation;
    changeSafety?: ChangeSafetyObservation;
    reminderPractice?: ReminderPracticeObservation;
    persistence?: PersistenceObservation;
    notes?: string;
  };
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

export type Finding = {
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
  if (value === true) return "yes";
  if (value === false) return "no";
  return "unknown";
}

function severityRank(severity: Severity): number {
  if (severity === "blocker") return 0;
  if (severity === "major") return 1;
  return 2;
}

function buildTemplate(): string {
  return [
    "# Settings And Assists Audit Template",
    "",
    "Use when settings or assist surfaces may exist, but recovery trust during play or after failure is still unclear.",
    "",
    "## Core Checks",
    "",
    "- Mid-run settings or assist access is reachable without abandoning the loop.",
    "- Pause or death surfaces still expose the needed recovery knobs.",
    "- Difficulty or assist changes preserve progress and apply safely.",
    "- Controls, objective, tutorial, or practice reminders exist when needed.",
    "- Assist state persists across retry strongly enough to trust the next attempt.",
    "",
    "## Observation JSON",
    "",
    "```json",
    JSON.stringify(
      {
        game: "some-game",
        sessionDate: "2026-05-06",
        settingsAndAssists: {
          reachability: {
            midRunSettingsReachable: true,
            pauseSettingsReachable: true,
            postFailureSettingsReachable: false,
            postFailureAssistReachable: false,
            menuDepth: 3,
            notes: "death screen restarts fast but hides the recovery knobs",
          },
          changeSafety: {
            difficultyAdjustableMidRun: true,
            assistsAdjustableMidRun: true,
            changesApplyWithoutRestart: true,
            progressPreservedWhenChanged: true,
            notes: "difficulty switch kept the current checkpoint and live run state",
          },
          reminderPractice: {
            controlsReminderAvailable: true,
            objectiveReminderAvailable: true,
            tutorialReplayAvailable: false,
            practiceReliefAvailable: false,
            promptReadableLongEnoughToUseKnob: true,
            notes: "controls and goal can be reopened, but there is no low-risk practice surface",
          },
          persistence: {
            assistStatePersistsAcrossRetry: false,
            difficultyStatePersistsAcrossRetry: true,
            retryReentersWithExpectedState: false,
            notes: "retry kept difficulty but dropped the assist toggle",
          },
          notes: "skill stays separate from remap and motor-tax lanes",
        },
        evidenceSufficiency: {
          directness: "strong",
          scope: ["direct play", "one failure-retry sample"],
          gaps: ["no second-mode sample"],
          claimCeiling: "can judge sampled recovery surfaces only",
        },
        claimGuardrail: {
          label: "settings-and-assists audit",
          coverageGate: {
            status: "partial",
            reasons: ["sampled one death path but not every submenu branch"],
          },
          allowedClaims: [
            "describe whether live or post-failure recovery knobs were reachable in the sampled path",
            "describe whether sampled assist changes preserved progress and persisted across retry",
          ],
          blockedClaims: [
            "do not generalize one sampled menu path into a full accessibility verdict",
            "do not collapse control-surface remap coverage into this lane",
          ],
          nextEvidence: [
            "sample a second mode or stage",
            "confirm persistence after a fresh boot as well as a retry",
          ],
        },
        strengths: ["pause menu kept objective and difficulty visible during live play"],
        frictions: ["death screen hid the same recovery path the player needed after failing"],
      },
      null,
      2,
    ),
    "```",
    "",
  ].join("\n");
}

export function buildFindings(data: ObservationFile): Finding[] {
  const settings = data.settingsAndAssists ?? {};
  const reachability = settings.reachability ?? {};
  const changeSafety = settings.changeSafety ?? {};
  const reminderPractice = settings.reminderPractice ?? {};
  const persistence = settings.persistence ?? {};
  const findings: Finding[] = [];

  if (
    reachability.midRunSettingsReachable === false ||
    reachability.postFailureSettingsReachable === false ||
    reachability.postFailureAssistReachable === false
  ) {
    findings.push({
      severity: "blocker",
      title: "recovery knobs are not reachable when the player most needs them",
      evidence:
        `mid-run settings ${boolLabel(reachability.midRunSettingsReachable)}; ` +
        `post-failure settings ${boolLabel(reachability.postFailureSettingsReachable)}; ` +
        `post-failure assists ${boolLabel(reachability.postFailureAssistReachable)}; ` +
        `menu depth ${reachability.menuDepth ?? "unknown"}.`,
      nextStep: "Expose controls, objectives, difficulty, and assist access from the sampled live and post-failure recovery path.",
    });
  }

  if (
    changeSafety.difficultyAdjustableMidRun === false ||
    changeSafety.assistsAdjustableMidRun === false ||
    changeSafety.changesApplyWithoutRestart === false ||
    changeSafety.progressPreservedWhenChanged === false
  ) {
    findings.push({
      severity: "blocker",
      title: "difficulty or assist changes are not progress-safe enough to trust",
      evidence:
        `difficulty mid-run ${boolLabel(changeSafety.difficultyAdjustableMidRun)}; ` +
        `assists mid-run ${boolLabel(changeSafety.assistsAdjustableMidRun)}; ` +
        `applies without restart ${boolLabel(changeSafety.changesApplyWithoutRestart)}; ` +
        `progress preserved ${boolLabel(changeSafety.progressPreservedWhenChanged)}.`,
      nextStep: "Let the player change the sampled recovery knobs without losing checkpoint state or being forced through a disruptive restart.",
    });
  }

  if (
    reminderPractice.controlsReminderAvailable === false ||
    reminderPractice.objectiveReminderAvailable === false ||
    reminderPractice.tutorialReplayAvailable === false ||
    reminderPractice.practiceReliefAvailable === false
  ) {
    findings.push({
      severity: "major",
      title: "knowledge or practice recovery is weaker than the sampled difficulty-repair path needs",
      evidence:
        `controls reminder ${boolLabel(reminderPractice.controlsReminderAvailable)}; ` +
        `objective reminder ${boolLabel(reminderPractice.objectiveReminderAvailable)}; ` +
        `tutorial replay ${boolLabel(reminderPractice.tutorialReplayAvailable)}; ` +
        `practice relief ${boolLabel(reminderPractice.practiceReliefAvailable)}.`,
      nextStep: "Add reminder replay or a lower-risk practice surface so the player can recover understanding, not just lower challenge.",
    });
  }

  if (
    reminderPractice.promptReadableLongEnoughToUseKnob === false ||
    persistence.assistStatePersistsAcrossRetry === false ||
    persistence.difficultyStatePersistsAcrossRetry === false ||
    persistence.retryReentersWithExpectedState === false
  ) {
    findings.push({
      severity: "major",
      title: "recovery state does not persist clearly enough across retry",
      evidence:
        `prompt long enough ${boolLabel(reminderPractice.promptReadableLongEnoughToUseKnob)}; ` +
        `assist persists ${boolLabel(persistence.assistStatePersistsAcrossRetry)}; ` +
        `difficulty persists ${boolLabel(persistence.difficultyStatePersistsAcrossRetry)}; ` +
        `retry reenters expected state ${boolLabel(persistence.retryReentersWithExpectedState)}.`,
      nextStep: "Keep sampled assist or difficulty changes active across retry and leave prompts visible long enough for the player to actually use the recovery path.",
    });
  }

  if (findings.length === 0) {
    findings.push({
      severity: "minor",
      title: "no blocker-level settings or assist recovery gap logged in supplied observations",
      evidence: "sampled recovery surfaces were reachable, progress-safe, and persistent in the observed path.",
      nextStep: "Verify the same recovery trust from a second mode, stage, or fresh-boot path before broadening the verdict.",
    });
  }

  return findings.sort((left, right) => severityRank(left.severity) - severityRank(right.severity));
}

function buildSection(items: string[] | undefined, fallback: string): string[] {
  if (!items || items.length === 0) {
    return [`- ${fallback}`];
  }
  return items.map((item) => `- ${item}`);
}

export function buildMarkdown(data: ObservationFile): string {
  const game = data.game ?? "unknown-game";
  const sessionDate = data.sessionDate ?? new Date().toISOString().slice(0, 10);
  const settings = data.settingsAndAssists ?? {};
  const reachability = settings.reachability ?? {};
  const changeSafety = settings.changeSafety ?? {};
  const reminderPractice = settings.reminderPractice ?? {};
  const persistence = settings.persistence ?? {};
  const findings = buildFindings(data);
  const coverageStatus = getStarterCoverageStatus(data) ?? "unknown";
  const starterNextEvidence = getStarterNextEvidence(data).filter((item) => item !== "none");

  return [
    `# ${game} Settings And Assists Audit`,
    "",
    `Session: ${sessionDate}`,
    "",
    "## Findings",
    "",
    ...findings.map((finding) => `- \`${finding.severity}\` ${finding.title}. Evidence: ${finding.evidence}`),
    "",
    "## Evidence Scope Guardrail",
    "",
    ...buildStarterGuardrailSection(data),
    `- Coverage status summary: ${coverageStatus}.`,
    "",
    "## Recovery Surface Frame",
    "",
    `- Mid-run settings reachable: ${boolLabel(reachability.midRunSettingsReachable)}.`,
    `- Pause settings reachable: ${boolLabel(reachability.pauseSettingsReachable)}.`,
    `- Post-failure settings reachable: ${boolLabel(reachability.postFailureSettingsReachable)}.`,
    `- Post-failure assist access reachable: ${boolLabel(reachability.postFailureAssistReachable)}.`,
    `- Sampled menu depth: ${reachability.menuDepth ?? "unknown"}.`,
    `- Difficulty adjustable mid-run: ${boolLabel(changeSafety.difficultyAdjustableMidRun)}.`,
    `- Assists adjustable mid-run: ${boolLabel(changeSafety.assistsAdjustableMidRun)}.`,
    `- Changes apply without restart: ${boolLabel(changeSafety.changesApplyWithoutRestart)}.`,
    `- Progress preserved when changed: ${boolLabel(changeSafety.progressPreservedWhenChanged)}.`,
    `- Controls reminder available: ${boolLabel(reminderPractice.controlsReminderAvailable)}.`,
    `- Objective reminder available: ${boolLabel(reminderPractice.objectiveReminderAvailable)}.`,
    `- Tutorial replay available: ${boolLabel(reminderPractice.tutorialReplayAvailable)}.`,
    `- Practice relief available: ${boolLabel(reminderPractice.practiceReliefAvailable)}.`,
    `- Prompt readable long enough to use knob: ${boolLabel(reminderPractice.promptReadableLongEnoughToUseKnob)}.`,
    `- Assist state persists across retry: ${boolLabel(persistence.assistStatePersistsAcrossRetry)}.`,
    `- Difficulty state persists across retry: ${boolLabel(persistence.difficultyStatePersistsAcrossRetry)}.`,
    `- Retry reenters expected state: ${boolLabel(persistence.retryReentersWithExpectedState)}.`,
    `- Lane note: ${settings.notes ?? "none logged"}.`,
    "",
    "## Reachability Notes",
    "",
    ...buildSection(reachability.notes ? [reachability.notes] : undefined, "No reachability notes logged yet."),
    "",
    "## Change Safety Notes",
    "",
    ...buildSection(changeSafety.notes ? [changeSafety.notes] : undefined, "No change-safety notes logged yet."),
    "",
    "## Reminder And Practice Notes",
    "",
    ...buildSection(reminderPractice.notes ? [reminderPractice.notes] : undefined, "No reminder/practice notes logged yet."),
    "",
    "## Persistence Notes",
    "",
    ...buildSection(persistence.notes ? [persistence.notes] : undefined, "No persistence notes logged yet."),
    "",
    "## Strengths",
    "",
    ...buildSection(data.strengths, "No strengths logged yet."),
    "",
    "## Frictions",
    "",
    ...buildSection(data.frictions, "No frictions logged yet."),
    "",
    "## Evidence-Backed Next Steps",
    "",
    ...findings.map((finding) => `- ${finding.nextStep}`),
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
    `- ${game}: assist and settings surfaces only earn player trust when the needed knob stays reachable in live play, safe to change, and still active after the next retry.`,
    "",
  ].join("\n");
}

function extractLearningLine(markdown: string): string | undefined {
  const lines = markdown.split("\n");
  const durableLearningIndex = lines.findIndex((line) => line.trim() === "## Durable Learning");
  if (durableLearningIndex === -1) {
    return undefined;
  }
  return lines.slice(durableLearningIndex + 1).find((line) => line.startsWith("- "));
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

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const data = options.observations ? readObservations(options.observations) : undefined;
  const output = options.template || !data ? buildTemplate() : buildMarkdown(data);

  if (data) {
    const learningLine = extractLearningLine(output);
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

if (import.meta.main) {
  main();
}

