import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseTodoRecords, type QueueState } from "./catalog_candidates";
import { buildReadmeGuidance, inspectReadme, type ReadmeIssueCode } from "./readme_hygiene";
import { buildReviewFreshnessEntries, type ReviewFreshnessEntry } from "./review_freshness_core";

type CliOptions = {
  json: boolean;
  slug?: string;
};

export type StarterEntry = {
  slug: string;
  queueState: QueueState;
  issues: Array<ReadmeIssueCode | "missing-readme">;
  guidance: string[];
  evidence: string[];
  reviewFreshness?: ReviewFreshnessEntry;
  starter: string;
};

const ROOT = process.cwd();
const TODO_PATH = resolve(ROOT, "todo.md");

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { json: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      options.json = true;
      continue;
    }

    const next = argv[index + 1];
    if (arg === "--slug" && !next) {
      throw new Error("Missing value for --slug");
    }

    if (arg === "--slug") {
      options.slug = next;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!options.slug) {
    throw new Error("Missing required --slug value");
  }

  return options;
}

function prettifySlug(slug: string): string {
  return slug
    .split("-")
    .filter((part) => part.length > 0)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function normalizeLine(line: string): string {
  return line.replace(/\s+/g, " ").trim();
}

function sanitizeBullets(lines: string[]): string[] {
  return lines
    .map((line) => normalizeLine(line.replace(/^[-*]\s*/, "")))
    .filter((line) => line.length > 0)
    .filter((line) => !/`(?:\.\/)?(?:src|js)\/|`[^`]+\.(?:js|ts|css|html)`/i.test(line));
}

function sanitizePremise(paragraph: string | null): string | null {
  if (!paragraph) {
    return null;
  }

  const sentences = paragraph
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => normalizeLine(sentence))
    .filter((sentence) => sentence.length > 0)
    .filter((sentence) => !/`(?:\.\/)?(?:src|js)\/|`[^`]+\.(?:js|ts|css|html)`/i.test(sentence));

  if (sentences.length === 0) {
    return paragraph;
  }

  return sentences.join(" ");
}

function collectSectionBullets(readmeText: string, headingName: string): string[] {
  const lines = readmeText.split(/\r?\n/);
  const targetHeading = headingName.toLowerCase();
  const bullets: string[] = [];
  let inSection = false;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const headingMatch = line.match(/^##\s+(.+)$/);
    if (headingMatch) {
      const current = headingMatch[1].trim().toLowerCase();
      if (inSection && current !== targetHeading) {
        break;
      }
      inSection = current === targetHeading;
      continue;
    }

    if (!inSection) {
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      bullets.push(line);
    }
  }

  return sanitizeBullets(bullets);
}

function collectFirstParagraph(readmeText: string): string | null {
  const lines = readmeText.replace(/\r\n/g, "\n").split("\n");
  let afterTitle = false;
  const paragraphLines: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!afterTitle) {
      if (/^#\s+/.test(line)) {
        afterTitle = true;
      }
      continue;
    }

    if (line.length === 0) {
      if (paragraphLines.length > 0) {
        break;
      }
      continue;
    }

    if (/^##\s+/.test(line)) {
      break;
    }

    paragraphLines.push(line);
  }

  if (paragraphLines.length === 0) {
    return null;
  }

  return normalizeLine(paragraphLines.join(" "));
}

function collectTitle(readmeText: string, slug: string): string {
  const titleMatch = readmeText.match(/^#\s+(.+)$/m);
  return normalizeLine(titleMatch?.[1] ?? prettifySlug(slug));
}

function formatQueueState(state: QueueState): string {
  if (state === "completed") {
    return "completed";
  }
  if (state === "pending") {
    return "pending";
  }
  return "untracked";
}

function buildEvidence(
  issueCodes: Array<ReadmeIssueCode | "missing-readme">,
  implementationLines: string[],
  logLines: string[],
): string[] {
  const evidence: string[] = [];

  if (issueCodes.includes("missing-readme")) {
    evidence.push("README missing");
  }
  if (issueCodes.includes("missing-play-instructions")) {
    evidence.push("missing launch line: README never says to open ./index.html in a browser");
  }
  if (issueCodes.includes("implementation-heavy-readme")) {
    for (const line of implementationLines.slice(0, 3)) {
      evidence.push(`implementation line: ${line.trim()}`);
    }
  }
  if (issueCodes.includes("log-heavy-readme")) {
    for (const line of logLines.slice(0, 3)) {
      evidence.push(`log line: ${line.trim()}`);
    }
  }

  return evidence;
}

export function buildStarter(readmeText: string | null, slug: string): string {
  const title = readmeText ? collectTitle(readmeText, slug) : prettifySlug(slug);
  const premise = sanitizePremise(readmeText ? collectFirstParagraph(readmeText) : null);
  const controls = readmeText ? collectSectionBullets(readmeText, "Controls") : [];
  const loop = readmeText
    ? [...collectSectionBullets(readmeText, "Core Loop"), ...collectSectionBullets(readmeText, "Loop")]
    : [];
  const uniqueLoop = [...new Set(loop)].slice(0, 4);

  return [
    `# ${title}`,
    "",
    premise ?? `TODO: add one short premise paragraph for ${title}.`,
    "",
    "Open `./index.html` in a browser to play locally.",
    "",
    "## Controls",
    ...(controls.length > 0
      ? controls.map((item) => `- ${item}`)
      : ["- TODO: list the main movement, action, and restart inputs."]),
    "",
    "## Core Loop",
    ...(uniqueLoop.length > 0
      ? uniqueLoop.map((item) => `- ${item}`)
      : ["- TODO: summarize the play path in 2-4 short bullets."]),
    "",
    "## Notes",
    "- Keep this README high level: premise, controls, launch, play path, and one durable loop note.",
  ].join("\n");
}

export function buildEntry(slug: string, root = ROOT): StarterEntry {
  const todoPath = resolve(root, "todo.md");
  if (!existsSync(todoPath)) {
    throw new Error("todo.md not found");
  }

  const todoRecords = parseTodoRecords(todoPath);
  const records = todoRecords.get(slug) ?? [];
  const queueState: QueueState = records.some((record) => record.state === "pending")
    ? "pending"
    : records.some((record) => record.state === "completed")
      ? "completed"
      : "untracked";
  const reviewFreshness = buildReviewFreshnessEntries({ slug })[0];
  const readmePath = resolve(root, slug, "README.md");

  if (!existsSync(readmePath)) {
    return {
      slug,
      queueState,
      issues: ["missing-readme"],
      guidance: ["add a short README with premise, controls, browser launch note, and one loop summary"],
      evidence: ["README missing"],
      reviewFreshness,
      starter: buildStarter(null, slug),
    };
  }

  const readmeText = readFileSync(readmePath, "utf8");
  const inspection = inspectReadme(root, slug);
  const issueCodes = inspection.issues.map((issue) => issue.code);

  return {
    slug,
    queueState,
    issues: issueCodes,
    guidance: buildReadmeGuidance(true, inspection.issues),
    evidence: buildEvidence(issueCodes, inspection.evidence.implementationLines, inspection.evidence.logLines),
    reviewFreshness,
    starter: buildStarter(readmeText, slug),
  };
}

export function buildTextOutput(entry: StarterEntry): string {
  const lines = [
    "# README Rewrite Starter",
    "",
    `slug: ${entry.slug}`,
    `queue: ${formatQueueState(entry.queueState)}`,
    `issues: ${entry.issues.length > 0 ? entry.issues.join(", ") : "none"}`,
    "",
    "## Rewrite guidance",
    "",
    ...(entry.guidance.length > 0
      ? entry.guidance.map((line) => `- ${line}`)
      : ["- README already passes current docs checks; use the starter only if you still want a tighter rewrite."]),
    "",
    "## Evidence",
    "",
    ...(entry.evidence.length > 0
      ? entry.evidence.map((line) => `- ${line}`)
      : ["- No docs issues detected for this slug."]),
    "",
    "## Starter",
    "",
    "```md",
    entry.starter,
    "```",
  ];

  if (entry.reviewFreshness) {
    lines.push("");
    lines.push("## Review guard");
    lines.push("");
    lines.push(`- lane: ${entry.reviewFreshness.lane}`);
    lines.push(`- review: ${entry.reviewFreshness.reviewSummary}`);
    for (const step of entry.reviewFreshness.nextSteps) {
      lines.push(`- ${step}`);
    }
    if (entry.reviewFreshness.lane === "flag-after-edit") {
      lines.push(`- command: bun.cmd .agents/skills/catalog-sweep/scripts/review_flag_sync.ts --slug ${entry.slug} --apply`);
    }
  }

  return lines.join("\n");
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const entry = buildEntry(options.slug ?? "");

  if (options.json) {
    console.log(JSON.stringify(entry, null, 2));
    return;
  }

  console.log(buildTextOutput(entry));
}

if (import.meta.main) {
  main();
}
