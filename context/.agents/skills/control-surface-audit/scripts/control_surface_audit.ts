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

type ControlSurfaceObservation = {
  remap?: {
    available?: boolean;
    scope?: string[];
    notes?: string;
  };
  promptReflection?: {
    available?: boolean;
    stateVisible?: boolean;
    notes?: string;
  };
  holdToggle?: {
    explicit?: boolean;
    recoverable?: boolean;
    notes?: string;
  };
  sensitivity?: {
    available?: boolean;
    axisOptions?: boolean;
    notes?: string;
  };
  gameSpeedRelief?: {
    available?: boolean;
    kind?: string;
    notes?: string;
  };
  settingsAndAssistsBoundaryClear?: boolean;
  notes?: string;
};

type SharedControlSurfaceObservation = {
  remapScope?: "full" | "partial" | "none";
  remapInputsVisible?: boolean;
  remapReflectedInPrompts?: boolean;
  holdToggleAlternativeAvailable?: boolean;
  sensitivityControlsAvailable?: boolean;
  inversionControlsAvailable?: boolean;
  axisControlsAvailable?: boolean;
  gameSpeedReliefAvailable?: boolean;
  timingReliefAvailable?: boolean;
  settingsAndAssistsBoundaryClear?: boolean;
  notes?: string;
};

type ObservationFile = {
  game?: string;
  sessionDate?: string;
  controlSurface?: ControlSurfaceObservation | SharedControlSurfaceObservation;
  starter?: ControlSurfaceObservation;
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
  if (value === true) return "yes";
  if (value === false) return "no";
  return "unknown";
}

function severityRank(severity: Severity): number {
  if (severity === "blocker") return 0;
  if (severity === "major") return 1;
  return 2;
}

function mapRemapScopeToInputs(scope: SharedControlSurfaceObservation["remapScope"]): string[] {
  if (scope === "full") {
    return ["all sampled core actions"];
  }
  if (scope === "partial") {
    return ["partial sampled remap coverage"];
  }
  return [];
}

function normalizeControlSurface(
  controlSurface: ControlSurfaceObservation | SharedControlSurfaceObservation | undefined,
  fallback: ControlSurfaceObservation | undefined,
): ControlSurfaceObservation {
  const direct = fallback ?? {};
  if (!controlSurface) {
    return direct;
  }

  if (
    "remap" in controlSurface ||
    "promptReflection" in controlSurface ||
    "holdToggle" in controlSurface ||
    "sensitivity" in controlSurface ||
    "gameSpeedRelief" in controlSurface
  ) {
    return {
      ...controlSurface,
      settingsAndAssistsBoundaryClear:
        controlSurface.settingsAndAssistsBoundaryClear ?? direct.settingsAndAssistsBoundaryClear,
      notes: controlSurface.notes ?? direct.notes,
    };
  }

  const flat = controlSurface;
  const remapScope = flat.remapInputsVisible ? mapRemapScopeToInputs(flat.remapScope) : [];
  const speedKinds = [
    flat.gameSpeedReliefAvailable ? "game-speed relief" : undefined,
    flat.timingReliefAvailable ? "timing relief" : undefined,
  ].filter((value): value is string => Boolean(value));

  return {
    remap: {
      available:
        flat.remapScope === "full" || flat.remapScope === "partial"
          ? true
          : flat.remapScope === "none"
            ? false
            : undefined,
      scope: remapScope,
      notes: flat.notes,
    },
    promptReflection: {
      available: flat.remapReflectedInPrompts,
      stateVisible: flat.remapReflectedInPrompts,
      notes: flat.remapReflectedInPrompts === undefined ? flat.notes : "shared starter logged remap reflection state",
    },
    holdToggle: {
      explicit: flat.holdToggleAlternativeAvailable,
      recoverable: flat.holdToggleAlternativeAvailable,
      notes: flat.holdToggleAlternativeAvailable === undefined ? flat.notes : "shared starter logged hold-toggle alternative availability",
    },
    sensitivity: {
      available:
        flat.sensitivityControlsAvailable !== undefined ||
        flat.inversionControlsAvailable !== undefined ||
        flat.axisControlsAvailable !== undefined
          ? Boolean(
              flat.sensitivityControlsAvailable ||
                flat.inversionControlsAvailable ||
                flat.axisControlsAvailable,
            )
          : undefined,
      axisOptions:
        flat.axisControlsAvailable !== undefined || flat.inversionControlsAvailable !== undefined
          ? Boolean(flat.axisControlsAvailable || flat.inversionControlsAvailable)
          : undefined,
      notes: flat.notes,
    },
    gameSpeedRelief: {
      available:
        flat.gameSpeedReliefAvailable !== undefined || flat.timingReliefAvailable !== undefined
          ? Boolean(flat.gameSpeedReliefAvailable || flat.timingReliefAvailable)
          : undefined,
      kind: speedKinds.join(" + ") || undefined,
      notes: flat.notes,
    },
    settingsAndAssistsBoundaryClear: flat.settingsAndAssistsBoundaryClear,
    notes: flat.notes,
  };
}

function getControlSurface(data: ObservationFile): ControlSurfaceObservation {
  return normalizeControlSurface(data.controlSurface, data.starter);
}

function buildTemplate(): string {
  return [
    "# Control Surface Audit Template",
    "",
    "Use when the player can reach the game but the control surface may still be too opaque, rigid, or speed-locked.",
    "",
    "## Core Checks",
    "",
    "- Remap scope is visible enough to protect player intent.",
    "- Prompt reflection shows the active control state without requiring menu spelunking.",
    "- Hold and toggle behavior is explicit and recoverable.",
    "- Sensitivity or axis options exist when the game needs them.",
    "- Speed relief exists when pace creates avoidable control failure.",
    "- Claim guardrails stay narrow if the sample only covers part of the control surface.",
    "",
    "## Observation JSON",
    "",
    "```json",
    JSON.stringify(
      {
        game: "some-game",
        sessionDate: "2026-05-06",
        controlSurface: {
          remap: { available: true, scope: ["move", "jump"], notes: "critical inputs can be remapped" },
          promptReflection: { available: true, stateVisible: true, notes: "prompts show current toggle state" },
          holdToggle: { explicit: true, recoverable: true, notes: "hold and toggle choices are labeled" },
          sensitivity: { available: true, axisOptions: true, notes: "stick sensitivity and inversion are present" },
          gameSpeedRelief: { available: true, kind: "assist", notes: "slow-mode or lower-speed option is exposed" },
        },
        evidenceSufficiency: {
          directness: "strong",
          scope: ["direct play"],
          gaps: [],
          claimCeiling: "can describe the sampled control surface only",
        },
        claimGuardrail: {
          coverageGate: { status: "ready", reasons: ["sample covers core control options"] },
          allowedClaims: ["remap coverage in the sampled lane"],
          blockedClaims: ["full accessibility coverage"],
          nextEvidence: ["sample another control-heavy mode"],
        },
        strengths: ["remap scope is visible in the opening lane"],
        frictions: ["no evidence yet for every mode"],
      },
      null,
      2,
    ),
    "```",
    "",
  ].join("\n");
}

function buildFindings(data: ObservationFile): Finding[] {
  const controlSurface = getControlSurface(data);
  const remap = controlSurface.remap ?? {};
  const promptReflection = controlSurface.promptReflection ?? {};
  const holdToggle = controlSurface.holdToggle ?? {};
  const sensitivity = controlSurface.sensitivity ?? {};
  const gameSpeedRelief = controlSurface.gameSpeedRelief ?? {};
  const findings: Finding[] = [];

  if (remap.available === false || (remap.scope?.length ?? 0) === 0) {
    findings.push({
      severity: "blocker",
      title: "remap scope is not readable enough to protect player intent",
      evidence: `remap available ${boolLabel(remap.available)}; remap scope count ${(remap.scope?.length ?? 0).toString()}.`,
      nextStep: "Expose which core inputs can be remapped so the player can preserve intent without guessing.",
    });
  }

  if (promptReflection.available === false || promptReflection.stateVisible === false) {
    findings.push({
      severity: "major",
      title: "prompts do not reflect the active control state clearly enough",
      evidence: `prompt reflection available ${boolLabel(promptReflection.available)}; state visible ${boolLabel(promptReflection.stateVisible)}.`,
      nextStep: "Show the current control state in or near the prompt so the player can tell what mode is live.",
    });
  }

  if (holdToggle.explicit === false || holdToggle.recoverable === false) {
    findings.push({
      severity: "major",
      title: "hold and toggle behavior is not explicit or recoverable enough",
      evidence: `hold/toggle explicit ${boolLabel(holdToggle.explicit)}; recoverable ${boolLabel(holdToggle.recoverable)}.`,
      nextStep: "Label hold versus toggle choices and make the active choice easy to recover during play.",
    });
  }

  if (sensitivity.available === false || sensitivity.axisOptions === false) {
    findings.push({
      severity: "major",
      title: "sensitivity or axis options are missing from the observed control surface",
      evidence: `sensitivity available ${boolLabel(sensitivity.available)}; axis options ${boolLabel(sensitivity.axisOptions)}.`,
      nextStep: "Expose sensitivity, inversion, or axis-style options when the game's control feel depends on them.",
    });
  }

  if (gameSpeedRelief.available === false) {
    findings.push({
      severity: "major",
      title: "game speed relief is missing from the observed control surface",
      evidence: `speed relief available ${boolLabel(gameSpeedRelief.available)}; kind ${gameSpeedRelief.kind ?? "none"}.`,
      nextStep: "Provide a slower mode, timing relief, or other pace reduction when speed blocks control reliability.",
    });
  }

  if (findings.length === 0) {
    findings.push({
      severity: "minor",
      title: "no blocker-level control surface gap logged in supplied observations",
      evidence: "remap, prompt reflection, hold-toggle clarity, sensitivity, and speed relief were adequate in the sampled lane.",
      nextStep: "Confirm the same control surface in a second mode before broadening the verdict.",
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

function buildMarkdown(data: ObservationFile): string {
  const game = data.game ?? "unknown-game";
  const sessionDate = data.sessionDate ?? new Date().toISOString().slice(0, 10);
  const findings = buildFindings(data);
  const controlSurface = getControlSurface(data);
  const coverageStatus = getStarterCoverageStatus(data) ?? "unknown";
  const starterNextEvidence = getStarterNextEvidence(data).filter((item) => item !== "none");

  return [
    `# ${game} Control Surface Audit`,
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
    "## Control Surface Frame",
    "",
    `- Remap available: ${boolLabel(controlSurface.remap?.available)}.`,
    `- Remap scope: ${(controlSurface.remap?.scope ?? []).join(" | ") || "none"}.`,
    `- Prompt reflection available: ${boolLabel(controlSurface.promptReflection?.available)}.`,
    `- Prompt state visible: ${boolLabel(controlSurface.promptReflection?.stateVisible)}.`,
    `- Hold/toggle explicit: ${boolLabel(controlSurface.holdToggle?.explicit)}.`,
    `- Hold/toggle recoverable: ${boolLabel(controlSurface.holdToggle?.recoverable)}.`,
    `- Sensitivity available: ${boolLabel(controlSurface.sensitivity?.available)}.`,
    `- Axis options available: ${boolLabel(controlSurface.sensitivity?.axisOptions)}.`,
    `- Game speed relief available: ${boolLabel(controlSurface.gameSpeedRelief?.available)}.`,
    `- Speed relief kind: ${controlSurface.gameSpeedRelief?.kind ?? "none"}.`,
    `- Settings and assists boundary checked: ${boolLabel(controlSurface.settingsAndAssistsBoundaryClear)}.`,
    `- Control-surface note: ${controlSurface.notes ?? "none logged"}.`,
    "",
    "## Remap Scope",
    "",
    ...buildSection(controlSurface.remap?.scope, "No remap scope logged yet."),
    "",
    "## Prompt Reflection",
    "",
    ...buildSection(
      controlSurface.promptReflection?.notes ? [controlSurface.promptReflection.notes] : undefined,
      "No prompt reflection notes logged yet.",
    ),
    "",
    "## Hold Toggle",
    "",
    ...buildSection(controlSurface.holdToggle?.notes ? [controlSurface.holdToggle.notes] : undefined, "No hold-toggle notes logged yet."),
    "",
    "## Sensitivity And Axis Options",
    "",
    ...buildSection(controlSurface.sensitivity?.notes ? [controlSurface.sensitivity.notes] : undefined, "No sensitivity notes logged yet."),
    "",
    "## Game Speed Relief",
    "",
    ...buildSection(
      controlSurface.gameSpeedRelief?.notes ? [controlSurface.gameSpeedRelief.notes] : undefined,
      "No speed-relief notes logged yet.",
    ),
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
    `- ${game}: control surfaces stay readable when remap, prompt reflection, hold-toggle state, and pace relief are visible in the sampled lane instead of only buried in a generic settings menu.`,
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

main();
