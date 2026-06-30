import {
  intentContractSchema,
  type Assistant,
  type BackgroundJob,
  type IntentArtifactType,
  type IntentContract
} from "./protocol";

const DEFAULT_ALLOWED_ADAPTATION =
  "May adapt implementation details to fit repository conventions, but do not downgrade required artifact types without recording the blocker.";

const CODING_PATTERN =
  /\b(app|web app|saas|frontend|backend|api|screen|component|feature|product|launch|implement|build|database|workflow|solid|react|route|page)\b/i;
const AUTOMATION_PATTERN = /\b(automation|script|tooling|factory|assistant|agent|job|skill|repeatable|workflow)\b/i;
const RESEARCH_PATTERN = /\b(research|analy[sz]e|market|compare|scan|investigate|audit|review)\b/i;
const DOCUMENTATION_PATTERN = /\b(doc|docs|documentation|readme|notes|guide|catalog)\b/i;
const TEST_PATTERN = /\b(test|verify|verification|proof|evidence|smoke|typecheck)\b/i;
const DEPLOYMENT_PATTERN = /\b(deploy|release|launch slice|ship|production)\b/i;
const QUESTION_PATTERN = /\b(question|ask|blocked|blocker|input needed|approval)\b/i;
const GENERIC_OBJECTIVE_PATTERN =
  /\b(short purpose summary|assistant-owned job created from project chat|project assistant created from thread prompt|global assistant created from thread prompt|no description provided|assistant state persisted)\b/i;

type AssistantIntentSource = Pick<Assistant, "name" | "description" | "jobPrompt">;
type BackgroundJobIntentSource = Pick<BackgroundJob, "name" | "description" | "kind" | "definition">;

export function compileAssistantIntentContract(assistant: AssistantIntentSource): IntentContract {
  const sourcePrompt = joinSections([
    `Assistant: ${assistant.name}`,
    assistant.description ? `Description: ${assistant.description}` : undefined,
    `Job prompt: ${assistant.jobPrompt}`
  ]);

  return buildIntentContract({
    objective: chooseObjective([assistant.description, assistant.jobPrompt, assistant.name]),
    sourcePrompt,
    owner: "assistant"
  });
}

export function compileBackgroundJobIntentContract(job: BackgroundJobIntentSource): IntentContract {
  const definitionPrompt = renderBackgroundJobDefinitionPrompt(job);
  const sourcePrompt = joinSections([
    `Background job: ${job.name}`,
    job.description ? `Description: ${job.description}` : undefined,
    `Definition prompt: ${definitionPrompt}`
  ]);

  return buildIntentContract({
    objective: chooseObjective([job.description, definitionPrompt, job.name]),
    sourcePrompt,
    owner: "background-job"
  });
}

export function normalizeIntentContract(contract: IntentContract): IntentContract {
  return intentContractSchema.parse({
    ...contract,
    objective: boundedText(contract.objective, 4000),
    sourcePrompt: boundedText(contract.sourcePrompt, 32000),
    deliverables: boundedUnique(contract.deliverables, 16, 512),
    artifactTypes: uniqueArtifactTypes(contract.artifactTypes).slice(0, 8),
    qualityBar: boundedUnique(contract.qualityBar, 16, 512),
    evidenceRequired: boundedUnique(contract.evidenceRequired, 16, 512),
    nonGoals: boundedUnique(contract.nonGoals, 16, 512),
    stopConditions: boundedUnique(contract.stopConditions, 16, 512),
    allowedAdaptation: boundedText(contract.allowedAdaptation, 2000)
  });
}

export function renderIntentContractPrompt(contract: IntentContract): string {
  const parsed = normalizeIntentContract(contract);
  return [
    "# INTENT CONTRACT",
    "Use this contract as authority for scope, priority, and completion.",
    `Objective: ${parsed.objective}`,
    `Artifact types: ${parsed.artifactTypes.join(", ")}`,
    renderList("Deliverables", parsed.deliverables),
    renderList("Quality bar", parsed.qualityBar),
    renderList("Evidence required", parsed.evidenceRequired),
    parsed.nonGoals.length > 0 ? renderList("Non-goals", parsed.nonGoals) : undefined,
    renderList("Stop conditions", parsed.stopConditions),
    `Allowed adaptation: ${parsed.allowedAdaptation}`,
    "",
    "# SOURCE PROMPT",
    boundedText(parsed.sourcePrompt, 4000)
  ]
    .filter((part): part is string => part !== undefined)
    .join("\n");
}

function buildIntentContract(input: { objective: string; sourcePrompt: string; owner: "assistant" | "background-job" }) {
  const artifactTypes = inferArtifactTypes(input.sourcePrompt);
  const coding = artifactTypes.includes("app-code");
  const automation = artifactTypes.includes("automation-code");
  const research = artifactTypes.includes("research");
  const docsOnly = artifactTypes.includes("documentation") && !coding && !automation;
  const deployment = artifactTypes.includes("deployment");

  return normalizeIntentContract({
    objective: input.objective,
    sourcePrompt: input.sourcePrompt,
    deliverables: [
      coding ? "Working app or product code that advances the objective." : undefined,
      automation ? "Reusable automation, assistant job, skill, or script when work is repeatable." : undefined,
      research ? "Research converted into ranked implementation or automation work." : undefined,
      docsOnly ? "Documentation changes that directly satisfy the requested documentation outcome." : undefined,
      deployment ? "Small launch slice or release-ready increment." : undefined,
      "Evidence showing contract progress, remaining gap, or blocker."
    ].filter((value): value is string => Boolean(value)),
    artifactTypes,
    qualityBar: [
      coding ? "Prefer real behavior changes over prose-only updates." : undefined,
      automation ? "Make repeatable work executable where scope allows." : undefined,
      research ? "Do not stop at catalog notes when buildable work is available." : undefined,
      docsOnly ? "Keep docs concise, current, and tied to source evidence." : undefined,
      "Respect repository conventions and keep changes scoped to the objective."
    ].filter((value): value is string => Boolean(value)),
    evidenceRequired: [
      coding || automation ? "Relevant tests, typecheck, smoke proof, or explicit blocker." : undefined,
      research ? "Source-backed findings and concrete next build target." : undefined,
      docsOnly ? "Docs changed plus source or blocker that makes docs the valid output." : undefined,
      "Summary of artifacts changed and remaining gap."
    ].filter((value): value is string => Boolean(value)),
    nonGoals: [
      coding || automation ? "Docs-only completion unless docs are requested or implementation is blocked." : undefined,
      "Endless catalog notes without artifact progress.",
      "Unbounded refactors outside the stated objective."
    ].filter((value): value is string => Boolean(value)),
    stopConditions: [
      "Deliverables are produced with required evidence.",
      "Work is blocked by missing user input, environment, or evidence and blocker is recorded.",
      "Further work would exceed the contract objective."
    ],
    allowedAdaptation: DEFAULT_ALLOWED_ADAPTATION
  });
}

function inferArtifactTypes(sourcePrompt: string): IntentArtifactType[] {
  const types: IntentArtifactType[] = [];
  if (CODING_PATTERN.test(sourcePrompt)) {
    types.push("app-code");
  }
  if (AUTOMATION_PATTERN.test(sourcePrompt)) {
    types.push("automation-code");
  }
  if (RESEARCH_PATTERN.test(sourcePrompt)) {
    types.push("research");
  }
  if (DOCUMENTATION_PATTERN.test(sourcePrompt)) {
    types.push("documentation");
  }
  if (TEST_PATTERN.test(sourcePrompt) || types.includes("app-code") || types.includes("automation-code")) {
    types.push("test-evidence");
  }
  if (DEPLOYMENT_PATTERN.test(sourcePrompt)) {
    types.push("deployment");
  }
  if (QUESTION_PATTERN.test(sourcePrompt)) {
    types.push("question");
  }
  return uniqueArtifactTypes(types.length > 0 ? types : ["unknown"]);
}

function renderBackgroundJobDefinitionPrompt(job: BackgroundJobIntentSource) {
  if (job.definition.kind === "ai-routine") {
    return job.definition.prompt;
  }
  return `Shell command: ${[job.definition.executable, ...job.definition.args].join(" ")}`;
}

function chooseObjective(candidates: Array<string | undefined>) {
  const ranked = candidates
    .map((candidate, index) => ({ text: candidate?.replace(/\s+/g, " ").trim() ?? "", index }))
    .filter((candidate) => candidate.text.length > 0)
    .map((candidate) => ({ ...candidate, score: scoreObjectiveCandidate(candidate.text, candidate.index) }))
    .sort((left, right) => right.score - left.score || left.index - right.index);
  return boundedText(ranked[0]?.text ?? "Carry out the requested assistant or job work.", 4000);
}

function scoreObjectiveCandidate(text: string, index: number) {
  let score = GENERIC_OBJECTIVE_PATTERN.test(text) ? -100 : 40;
  if (CODING_PATTERN.test(text)) {
    score += 25;
  }
  if (AUTOMATION_PATTERN.test(text)) {
    score += 20;
  }
  if (RESEARCH_PATTERN.test(text)) {
    score += 12;
  }
  if (DOCUMENTATION_PATTERN.test(text)) {
    score += 6;
  }
  if (TEST_PATTERN.test(text)) {
    score += 8;
  }
  if (DEPLOYMENT_PATTERN.test(text)) {
    score += 8;
  }
  if (/\b(build|implement|create|make|turn|convert|produce|ship|maintain|research|audit)\b/i.test(text)) {
    score += 10;
  }
  score += Math.min(12, Math.floor(text.length / 40));
  return score - index;
}

function renderList(label: string, items: string[]) {
  return [`${label}:`, ...items.map((item) => `- ${item}`)].join("\n");
}

function joinSections(parts: Array<string | undefined>) {
  return boundedText(parts.map((part) => part?.trim()).filter((part): part is string => Boolean(part)).join("\n\n"), 32000);
}

function boundedText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.slice(0, maxLength) || "Unspecified.";
}

function boundedUnique(values: string[], maxItems: number, maxLength: number) {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const bounded = boundedText(value, maxLength);
    const key = bounded.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(bounded);
    if (output.length >= maxItems) {
      break;
    }
  }
  return output.length > 0 ? output : ["Unspecified."];
}

function uniqueArtifactTypes(values: IntentArtifactType[]) {
  return [...new Set(values)];
}
