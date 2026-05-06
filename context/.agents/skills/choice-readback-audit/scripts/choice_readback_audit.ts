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
type PayoffMatch = "yes" | "partial" | "no";

type OfferedOption = {
  label?: string;
  expectedPayoff?: string;
  expectedCost?: string;
  currentStateComparison?: string;
  currentBuildComparison?: string;
  notes?: string;
};

type ChoiceObservation = {
  moment?: string;
  label?: string;
  choiceType?: string;
  optionsCount?: number;
  meaningClear?: boolean;
  reversible?: boolean;
  offeredOptions?: OfferedOption[];
  pickedOptionLabel?: string;
  expectedPayoff?: string;
  actualPayoff?: string;
  actualPayoffTiming?: string;
  payoffMatchedExpectation?: PayoffMatch;
  afterPickComparison?: string;
  afterPickBuildComparison?: string;
  afterPickComparisonClear?: boolean;
  notes?: string;
};

type ObservationFile = {
  game?: string;
  sessionDate?: string;
  mastery?: {
    choicePoints?: ChoiceObservation[];
    choiceCountFirstMinute?: number;
    choicesFeelMeaningful?: boolean;
    autonomySupport?: string;
    competenceSupport?: string;
    notes?: string;
  };
  readableProgression?: {
    proximalGoalVisible?: boolean;
    evaluativeReadbackAvailable?: boolean;
    nonComparativeNextStepVisible?: boolean;
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

function valueLabel(value: string | undefined): string {
  return value && value.trim().length > 0 ? value : "unknown";
}

function severityRank(severity: Severity): number {
  if (severity === "blocker") return 0;
  if (severity === "major") return 1;
  return 2;
}

function buildTemplate(): string {
  return [
    "# Choice Readback Audit Template",
    "",
    "Use when a game offers a route, loadout, upgrade, or risk-reward branch and the question is whether the options feel different before the pick and visibly changed state after it.",
    "",
    "## Core Checks",
    "",
    "- Offered options read as meaningfully different before commitment.",
    "- Expected payoff or cost is legible before the player picks.",
    "- Current-state or current-build comparison makes the tradeoff concrete.",
    "- Post-pick state change reads back clearly enough to trust the branch.",
    "- Expected and actual payoff stay aligned enough to teach later choices.",
    "",
    "## Observation JSON",
    "",
    "```json",
    JSON.stringify(
      {
        game: "some-game",
        sessionDate: "2026-05-06",
        mastery: {
          choiceCountFirstMinute: 1,
          choicesFeelMeaningful: true,
          autonomySupport: "medium",
          competenceSupport: "high",
          notes: "opening offers one risk-reward branch worth comparing",
          choicePoints: [
            {
              moment: "00:18",
              label: "safe lane or center pickup",
              choiceType: "risk-reward",
              optionsCount: 2,
              meaningClear: true,
              reversible: false,
              offeredOptions: [
                {
                  label: "safe outer lane",
                  expectedPayoff: "preserve health",
                  expectedCost: "skip the bonus pickup",
                  currentStateComparison: "keeps the current low-pressure route",
                  currentBuildComparison: "fits the current defensive build",
                },
                {
                  label: "center pickup line",
                  expectedPayoff: "gain bonus score plus a temporary damage boost",
                  expectedCost: "contest the live fire lane",
                  currentStateComparison: "spends safety for a stronger next wave state",
                  currentBuildComparison: "pairs with the rapid-fire build",
                },
              ],
              pickedOptionLabel: "center pickup line",
              expectedPayoff: "bonus score plus a temporary damage boost",
              actualPayoff: "player secures the score bonus and enters the next wave with boost active",
              actualPayoffTiming: "immediate",
              payoffMatchedExpectation: "partial",
              afterPickComparison: "boost icon and score spike make the stronger post-pick state visible against the no-boost baseline",
              afterPickBuildComparison: "rapid-fire build becomes more valuable immediately",
              afterPickComparisonClear: true,
              notes: "tradeoff is legible before commitment and mostly legible after the pick",
            },
          ],
        },
        evidenceSufficiency: {
          directness: "strong",
          scope: ["direct play", "one sampled branch"],
          gaps: ["no second branch type sampled"],
          claimCeiling: "can judge sampled branch readback only",
        },
        claimGuardrail: {
          label: "choice-readback audit",
          coverageGate: {
            status: "partial",
            reasons: ["sampled one branch but not a later build draft"],
          },
          allowedClaims: [
            "describe whether sampled options felt meaningfully different before the pick",
            "describe whether sampled payoff read back clearly after the pick",
          ],
          blockedClaims: [
            "do not generalize one sampled branch into a full progression or agency verdict",
            "do not collapse mastery or readable-progression claims into this lane",
          ],
          nextEvidence: ["sample a second branch type later in the run"],
        },
        strengths: ["tradeoff is visible before commitment"],
        frictions: ["skipped route is no longer visible for side-by-side comparison after the pick"],
      },
      null,
      2,
    ),
    "```",
    "",
  ].join("\n");
}

function hasReadableContrast(choice: ChoiceObservation): boolean {
  const offeredOptions = choice.offeredOptions ?? [];
  if ((choice.optionsCount ?? offeredOptions.length) < 2 || offeredOptions.length < 2) {
    return false;
  }
  if (choice.meaningClear === false) {
    return false;
  }
  return offeredOptions.some(
    (option) =>
      Boolean(option.expectedPayoff) ||
      Boolean(option.expectedCost) ||
      Boolean(option.currentStateComparison) ||
      Boolean(option.currentBuildComparison),
  );
}

function hasReadableAfterPick(choice: ChoiceObservation): boolean {
  if (choice.afterPickComparisonClear === false) {
    return false;
  }
  return Boolean(choice.actualPayoff) || Boolean(choice.afterPickComparison) || Boolean(choice.afterPickBuildComparison);
}

function choiceLabel(choice: ChoiceObservation): string {
  return `${choice.moment ?? "unknown moment"} ${choice.label ?? "unnamed choice"}`.trim();
}

function collectChoiceLabels(choices: ChoiceObservation[]): string {
  return choices.map(choiceLabel).join(" | ");
}

export function buildFindings(data: ObservationFile): Finding[] {
  const choicePoints = data.mastery?.choicePoints ?? [];
  const findings: Finding[] = [];

  if (choicePoints.length === 0) {
    findings.push({
      severity: "minor",
      title: "no sampled choice moment was supplied to this audit",
      evidence: "mastery.choicePoints is empty, so this lane cannot judge option contrast or payoff readback yet.",
      nextStep: "Capture one real route, loadout, upgrade, or risk-reward branch with offered options and after-pick comparison data.",
    });
    return findings;
  }

  const unclearBeforePick = choicePoints.filter((choice) => !hasReadableContrast(choice));
  if (unclearBeforePick.length > 0) {
    findings.push({
      severity: "blocker",
      title: "choice tradeoffs are not legible enough before commitment",
      evidence:
        `${collectChoiceLabels(unclearBeforePick)}; meaning clear values ` +
        `${unclearBeforePick.map((choice) => boolLabel(choice.meaningClear)).join(" | ")}; ` +
        `offered option counts ${unclearBeforePick.map((choice) => String(choice.offeredOptions?.length ?? 0)).join(" | ")}.`,
      nextStep: "Expose at least two meaningfully different options with readable expected payoff, cost, or current-state comparison before the player commits.",
    });
  }

  const unreadableAfterPick = choicePoints.filter((choice) => !hasReadableAfterPick(choice));
  if (unreadableAfterPick.length > 0) {
    findings.push({
      severity: "major",
      title: "chosen branches do not read back clearly after the pick resolves",
      evidence:
        `${collectChoiceLabels(unreadableAfterPick)}; actual payoff ` +
        `${unreadableAfterPick.map((choice) => valueLabel(choice.actualPayoff)).join(" | ")}; ` +
        `after-pick comparison clear ${unreadableAfterPick.map((choice) => boolLabel(choice.afterPickComparisonClear)).join(" | ")}.`,
      nextStep: "Show the resulting state or build change after the pick with enough contrast that the player can compare it against the prior baseline.",
    });
  }

  const mismatchedChoices = choicePoints.filter(
    (choice) =>
      choice.payoffMatchedExpectation === "no" ||
      (choice.payoffMatchedExpectation === "partial" && choice.afterPickComparisonClear !== true),
  );
  if (mismatchedChoices.length > 0) {
    findings.push({
      severity: "major",
      title: "expected payoff and actual payoff diverge without enough explanatory readback",
      evidence:
        `${collectChoiceLabels(mismatchedChoices)}; payoff matched expectation ` +
        `${mismatchedChoices.map((choice) => valueLabel(choice.payoffMatchedExpectation)).join(" | ")}; ` +
        `after-pick comparison clear ${mismatchedChoices.map((choice) => boolLabel(choice.afterPickComparisonClear)).join(" | ")}.`,
      nextStep: "Tighten the branch promise or add explicit post-pick explanation so later choices stay trustworthy when the outcome only partially matches the pitch.",
    });
  }

  if (findings.length === 0) {
    findings.push({
      severity: "minor",
      title: "no blocker-level choice-readback gap logged in supplied observations",
      evidence: "sampled options were distinct before the pick and the chosen payoff read back clearly after resolution.",
      nextStep: "Sample a later or higher-stakes branch before broadening the verdict beyond the observed choice moment.",
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

function buildChoiceMomentSection(choicePoints: ChoiceObservation[]): string[] {
  if (choicePoints.length === 0) {
    return ["- No meaningful choice points logged yet."];
  }

  return choicePoints.map((choice) => {
    const offeredOptions =
      choice.offeredOptions?.map((option) => {
        const parts = [
          option.label ?? "unnamed option",
          `expected payoff ${valueLabel(option.expectedPayoff)}`,
          `expected cost ${valueLabel(option.expectedCost)}`,
          `current-state comparison ${valueLabel(option.currentStateComparison)}`,
          `current-build comparison ${valueLabel(option.currentBuildComparison)}`,
        ];
        return `[${parts.join("; ")}]`;
      }).join(" ") ?? "none logged";

    return (
      `- ${choiceLabel(choice)}: type ${valueLabel(choice.choiceType)}; ` +
      `options ${choice.optionsCount ?? choice.offeredOptions?.length ?? "unknown"}; ` +
      `meaning clear ${boolLabel(choice.meaningClear)}; reversible ${boolLabel(choice.reversible)}; ` +
      `offered options ${offeredOptions}; picked option ${valueLabel(choice.pickedOptionLabel)}; ` +
      `expected payoff ${valueLabel(choice.expectedPayoff)}; actual payoff ${valueLabel(choice.actualPayoff)}; ` +
      `payoff timing ${valueLabel(choice.actualPayoffTiming)}; payoff matched expectation ${valueLabel(choice.payoffMatchedExpectation)}; ` +
      `after-pick comparison clear ${boolLabel(choice.afterPickComparisonClear)}; ` +
      `after-pick state comparison ${valueLabel(choice.afterPickComparison)}; ` +
      `after-pick build comparison ${valueLabel(choice.afterPickBuildComparison)}; notes ${valueLabel(choice.notes)}.`
    );
  });
}

export function buildMarkdown(data: ObservationFile): string {
  const game = data.game ?? "unknown-game";
  const sessionDate = data.sessionDate ?? new Date().toISOString().slice(0, 10);
  const mastery = data.mastery ?? {};
  const progression = data.readableProgression ?? {};
  const choicePoints = mastery.choicePoints ?? [];
  const findings = buildFindings(data);
  const coverageStatus = getStarterCoverageStatus(data) ?? "unknown";
  const starterNextEvidence = getStarterNextEvidence(data).filter((item) => item !== "none");

  return [
    `# ${game} Choice Readback Audit`,
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
    "## Choice Read Frame",
    "",
    `- Choice moment count: ${choicePoints.length}.`,
    `- Early choice count first minute: ${mastery.choiceCountFirstMinute ?? "unknown"}.`,
    `- Choices feel meaningful: ${boolLabel(mastery.choicesFeelMeaningful)}.`,
    `- Autonomy support: ${valueLabel(mastery.autonomySupport)}.`,
    `- Competence support: ${valueLabel(mastery.competenceSupport)}.`,
    `- Proximal goal visible: ${boolLabel(progression.proximalGoalVisible)}.`,
    `- Evaluative readback available: ${boolLabel(progression.evaluativeReadbackAvailable)}.`,
    `- Non-comparative next step visible: ${boolLabel(progression.nonComparativeNextStepVisible)}.`,
    `- Mastery note: ${valueLabel(mastery.notes)}.`,
    `- Progression note: ${valueLabel(progression.notes)}.`,
    "",
    "## Choice Moments",
    "",
    ...buildChoiceMomentSection(choicePoints),
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
    `- ${game}: branch choices only build trust when the player can compare options before commitment and then see the chosen state change read back against the prior baseline.`,
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
