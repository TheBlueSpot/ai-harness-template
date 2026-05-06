import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  buildStarterGuardrailSection,
  getStarterCoverageStatus,
  getStarterNextEvidence,
  type ClaimGuardrail,
  type StarterGuardrailCarrier
} from "./starter_guardrails";

type CliOptions = {
  template: boolean;
  observations?: string;
  out?: string;
};

type Observation = {
  game?: string;
  title?: string;
  notes?: string[];
  proximalGoalVisible?: boolean;
  prerequisiteVisible?: boolean;
  evaluativeReadback?: boolean;
  nextStepGuidance?: boolean;
  reminderRecovery?: boolean;
  evidence?: string[];
  starter?: StarterGuardrailCarrier;
};

const HELP = `readable_progression_audit.ts

Usage:
  bun.cmd .agents/skills/readable-progression-audit/scripts/readable_progression_audit.ts --template
  bun.cmd .agents/skills/readable-progression-audit/scripts/readable_progression_audit.ts --observations <json> [--out <md>]

Options:
  --template        Print the observation template
  --observations    Input JSON file from playtest capture
  --out             Write markdown output to a file
  --help            Show this help
`;

try {
  const options = parseArgs(Bun.argv.slice(2));
  if (options.template) {
    console.log(renderTemplate());
    process.exit(0);
  }
  if (!options.observations) {
    throw new Error("--observations is required unless --template is used");
  }
  const raw = readFile(options.observations);
  const observations = normalizeObservations(raw);
  const report = buildAudit(observations, options.observations);
  const markdown = renderAudit(report);
  if (options.out) {
    ensureDir(path.dirname(options.out));
    writeFileSync(options.out, markdown, "utf8");
  } else {
    console.log(markdown);
  }
  appendLearning(report);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  console.error("");
  console.error(HELP);
  process.exit(1);
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { template: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) continue;
    if (token === "--help" || token === "-h") {
      console.log(HELP);
      process.exit(0);
    }
    if (token === "--template") {
      options.template = true;
      continue;
    }
    if (token === "--observations") {
      const value = argv[index + 1];
      if (!value) throw new Error("--observations requires a path");
      options.observations = value;
      index += 1;
      continue;
    }
    if (token === "--out") {
      const value = argv[index + 1];
      if (!value) throw new Error("--out requires a path");
      options.out = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${token}`);
  }
  return options;
}

function readFile(filePath: string): unknown {
  if (!existsSync(filePath)) throw new Error(`Missing observations file: ${filePath}`);
  const content = readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(content);
}

function normalizeObservations(input: unknown): Observation[] {
  const payload = Array.isArray(input) ? input : [input];
  return payload.map((item) => (typeof item === "object" && item ? item : {})) as Observation[];
}

function buildAudit(observations: Observation[], sourcePath: string) {
  const entries = observations.map((observation, index) => {
    const starter = observation.starter ?? buildStarterFallback(observation, index);
    const claimGuardrails = buildClaimGuardrails(observation);
    return {
      id: index + 1,
      title: observation.title ?? observation.game ?? `Observation ${index + 1}`,
      notes: observation.notes ?? [],
      claims: claimGuardrails,
      starter,
      sourcePath
    };
  });
  return { sourcePath, entries };
}

function buildClaimGuardrails(observation: Observation): ClaimGuardrail[] {
  const rules: Array<[string, boolean | undefined, string, string[]]> = [
    ["Proximal goal visible", observation.proximalGoalVisible, "goal stays near enough to steer play", ["capture one live goal label"]],
    ["Prerequisite visible", observation.prerequisiteVisible, "remaining steps are concrete", ["capture visible counts or remaining steps"]],
    ["Evaluative readback", observation.evaluativeReadback, "feedback says what changed", ["capture a success or fail message that names change"]],
    ["Next-step guidance", observation.nextStepGuidance, "prompt says what to do next", ["capture a concrete next action"]],
    ["Reminder recovery", observation.reminderRecovery, "goal is easy to reopen after a pause", ["capture reopen path or reminder affordance"]]
  ];

  return rules.map(([claim, present, summary, nextEvidence]) => {
    const observed = present === undefined ? [] : [present ? "yes" : "no"];
    const sufficiency = getStarterCoverageStatus({ observed, required: ["yes"] });
    return {
      claim,
      evidence: observed,
      sufficiency,
      nextEvidence: present ? [] : nextEvidence
    };
  });
}

function buildStarterFallback(observation: Observation, index: number): StarterGuardrailCarrier {
  const evidence = observation.evidence ?? [];
  return {
    title: observation.title ?? `Observation ${index + 1}`,
    summary: "Starter fallback from raw observation",
    claims: [
      {
        claim: "Progression readability",
        evidence,
        sufficiency: getStarterCoverageStatus({ observed: evidence, required: ["goal", "progress", "next"] }),
        nextEvidence: getStarterNextEvidence({ observed: evidence, required: ["goal", "progress", "next"] })
      }
    ]
  };
}

function renderAudit(report: { sourcePath: string; entries: Array<{ id: number; title: string; notes: string[]; claims: ClaimGuardrail[]; starter: StarterGuardrailCarrier }> }) {
  const lines = ["# Readable Progression Audit", "", `Source: ${report.sourcePath}`];
  for (const entry of report.entries) {
    lines.push("", `## ${entry.id}. ${entry.title}`);
    if (entry.notes.length > 0) {
      lines.push("", ...entry.notes.map((note) => `- ${note}`));
    }
    for (const claim of entry.claims) {
      lines.push(`- ${claim.claim}: ${claim.sufficiency}`);
      if (claim.evidence.length > 0) lines.push(`  - Evidence: ${claim.evidence.join(", ")}`);
      if (claim.nextEvidence.length > 0) lines.push(`  - Next evidence: ${claim.nextEvidence.join(", ")}`);
    }
    lines.push("", buildStarterGuardrailSection(entry.starter));
  }
  return lines.join("\n");
}

function appendLearning(report: { entries: Array<{ claims: ClaimGuardrail[] }> }) {
  const learning = report.entries.find((entry) => entry.claims.some((claim) => claim.sufficiency !== "sufficient"));
  if (!learning) return;
  const line = `- Progression audit: keep one reachable goal and one concrete next step visible when claim coverage is weak.\n`;
  const repoRoot = path.resolve(import.meta.dir, "../../../..");
  const learningsPath = path.join(repoRoot, ".agents", "skills", "readable-progression-audit", "LEARNINGS.md");
  appendFileSync(learningsPath, line, "utf8");
  const localLearningPath = path.join(repoRoot, ".local", "kojima", "learnings.md");
  if (existsSync(localLearningPath)) {
    appendFileSync(localLearningPath, line, "utf8");
  }
}

function renderTemplate() {
  return JSON.stringify(
    {
      game: "game-slug",
      title: "Short observation title",
      notes: ["one short note"],
      proximalGoalVisible: true,
      prerequisiteVisible: true,
      evaluativeReadback: true,
      nextStepGuidance: true,
      reminderRecovery: true,
      evidence: ["goal", "progress", "next"]
    },
    null,
    2
  );
}

function ensureDir(dir: string) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}
