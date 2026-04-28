import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export type RunbookCheckResult = {
  ok: boolean;
  skillRoot: string;
  errors: string[];
  branchDocs: string[];
  storyIds: string[];
};

const REQUIRED_BRANCH_DOCS = [
  "action-index.md",
  "assistant-selection.md",
  "create-configure.md",
  "chat-todos-questions.md",
  "jobs.md",
  "state-reporting.md",
  "recovery.md",
  "clarification-policy.md",
  "operation-handoffs.md"
];

const ASSISTANT_STORY_IDS = ["US-ASSISTANTS-001", "US-ASSISTANTS-002", "US-ASSISTANTS-003", "US-ASSISTANTS-004"];

const HELP_TEXT = `runbook-check.ts

Usage:
  bun.cmd .agents/skills/assistant-actions/scripts/runbook-check.ts [--skill-root <path>] [--json]

Checks:
  - master SKILL.md links all branch docs
  - every US-ASSISTANTS story has action-index coverage
  - assistant-state examples use the supported script invocation
`;

if (import.meta.main) {
  const args = parseArgs(Bun.argv.slice(2));
  if (args.help) {
    console.log(HELP_TEXT);
    process.exit(0);
  }
  const result = validateRunbook(args.skillRoot);
  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(renderRunbookCheck(result));
  }
  process.exit(result.ok ? 0 : 1);
}

export function validateRunbook(skillRoot = path.resolve(import.meta.dir, "..")): RunbookCheckResult {
  const errors: string[] = [];
  const skillPath = path.join(skillRoot, "SKILL.md");
  const referencesRoot = path.join(skillRoot, "references");
  const skillText = readRequiredFile(skillPath, errors);

  for (const doc of REQUIRED_BRANCH_DOCS) {
    const docPath = path.join(referencesRoot, doc);
    if (!existsSync(docPath)) {
      errors.push(`Missing branch doc: references/${doc}`);
      continue;
    }
    if (!skillText.includes(`references/${doc}`)) {
      errors.push(`SKILL.md does not link references/${doc}`);
    }
  }

  const actionIndexPath = path.join(referencesRoot, "action-index.md");
  const actionIndex = readRequiredFile(actionIndexPath, errors);
  for (const storyId of ASSISTANT_STORY_IDS) {
    if (!actionIndex.includes(storyId)) {
      errors.push(`action-index.md missing ${storyId}`);
    }
  }

  const assistantStatePath = path.join(skillRoot, "scripts", "assistant-state.ts");
  if (!existsSync(assistantStatePath)) {
    errors.push("Missing script: scripts/assistant-state.ts");
  }

  const docsWithExamples = ["SKILL.md", "references/jobs.md", "references/state-reporting.md", "references/operation-handoffs.md"];
  for (const relativePath of docsWithExamples) {
    const text = readRequiredFile(path.join(skillRoot, relativePath), errors);
    if (!text.includes("bun.cmd .agents/skills/assistant-actions/scripts/assistant-state.ts")) {
      errors.push(`${relativePath} missing assistant-state.ts example`);
    }
  }

  return {
    ok: errors.length === 0,
    skillRoot,
    errors,
    branchDocs: REQUIRED_BRANCH_DOCS,
    storyIds: ASSISTANT_STORY_IDS
  };
}

export function renderRunbookCheck(result: RunbookCheckResult) {
  const lines = [`assistant-actions runbook check: ${result.ok ? "ok" : "failed"}`, `skillRoot: ${result.skillRoot}`];
  if (result.errors.length > 0) {
    lines.push("");
    lines.push("errors:");
    for (const error of result.errors) {
      lines.push(`- ${error}`);
    }
  }
  return lines.join("\n");
}

function parseArgs(argv: string[]) {
  let skillRoot = path.resolve(import.meta.dir, "..");
  let json = false;
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) {
      continue;
    }
    if (token === "--help" || token === "-h") {
      help = true;
      continue;
    }
    if (token === "--json") {
      json = true;
      continue;
    }
    if (token === "--skill-root") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--skill-root requires a path");
      }
      skillRoot = path.resolve(value);
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${token}`);
  }

  return { skillRoot, json, help };
}

function readRequiredFile(filePath: string, errors: string[]) {
  if (!existsSync(filePath)) {
    errors.push(`Missing file: ${filePath}`);
    return "";
  }
  return readFileSync(filePath, "utf8");
}
