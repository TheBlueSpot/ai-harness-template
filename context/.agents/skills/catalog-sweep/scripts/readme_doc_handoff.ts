import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { QueueState } from "./catalog_candidates";
import { saveLearning } from "./learning_capture";
import { buildReadmeGuidance, inspectReadme, type ReadmeIssueCode } from "./readme_hygiene";
import {
  buildRelatedDocsBlock,
  collectSupportDocs,
  formatQueueState,
  readQueueState,
  type SupportDoc,
} from "./support_docs";

type CliOptions = {
  json: boolean;
  saveLearning: boolean;
  slug?: string;
};

type HandoffEntry = {
  slug: string;
  queueState: QueueState;
  issues: Array<ReadmeIssueCode | "missing-readme">;
  guidance: string[];
  supportDocs: SupportDoc[];
  relatedDocsBlock: string | null;
};

const ROOT = process.cwd();

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { json: false, saveLearning: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--save-learning") {
      options.saveLearning = true;
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

function buildExtraGuidance(supportDocs: SupportDoc[], hasReadme: boolean): string[] {
  const guidance: string[] = [];
  const unlinkedDocs = supportDocs.filter((doc) => !doc.linkedFromReadme);

  if (!hasReadme && supportDocs.length > 0) {
    guidance.push("keep README short and link supporting markdown instead of copying its detail into the new summary");
  }

  if (unlinkedDocs.length > 0) {
    guidance.push(`add a short related-docs section that links ${unlinkedDocs.map((doc) => `./${doc.file}`).join(", ")}`);
  }

  return guidance;
}

function buildEntry(root: string, slug: string): HandoffEntry {
  const queueState = readQueueState(root, slug);
  const readmePath = resolve(root, CATALOG_DIR, slug, "README.md");
  const hasReadme = existsSync(readmePath);
  const readmeText = hasReadme ? readFileSync(readmePath, "utf8") : null;
  const supportDocs = collectSupportDocs(root, slug, readmeText);
  const relatedDocsBlock = buildRelatedDocsBlock(supportDocs);

  if (!hasReadme) {
    return {
      slug,
      queueState,
      issues: ["missing-readme"],
      guidance: [
        "add a short README with premise, controls, browser launch note, and one loop summary",
        ...buildExtraGuidance(supportDocs, false),
      ],
      supportDocs,
      relatedDocsBlock,
    };
  }

  const inspection = inspectReadme(root, slug);
  return {
    slug,
    queueState,
    issues: inspection.issues.map((issue) => issue.code),
    guidance: [...buildReadmeGuidance(true, inspection.issues), ...buildExtraGuidance(supportDocs, true)],
    supportDocs,
    relatedDocsBlock,
  };
}

function buildLearning(entry: HandoffEntry): string {
  return `- Catalog throughput improves when one per-slug docs handoff lists ${entry.supportDocs.length} support markdown targets and a ready related-docs block for ${entry.slug}, because README cleanup can cut detail without spelunking nested docs folders for safe link destinations.`;
}

function buildTextOutput(entry: HandoffEntry): string {
  const lines = [
    "# README Doc Handoff",
    "",
    `slug: ${entry.slug}`,
    `queue: ${formatQueueState(entry.queueState)}`,
    `issues: ${entry.issues.length > 0 ? entry.issues.join(", ") : "none"}`,
    `support docs: ${entry.supportDocs.length}`,
    "",
    "## Rewrite next",
    "",
    ...(entry.guidance.length > 0
      ? entry.guidance.map((line) => `- ${line}`)
      : ["- README already passes current docs checks; only add related-doc links if you want tighter doc separation."]),
    "",
    "## Supporting docs",
    "",
    ...(entry.supportDocs.length > 0
      ? entry.supportDocs.map((doc) => `- [${doc.title}](./${doc.file}) | ${doc.linkedFromReadme ? "linked" : "unlinked"} | ${doc.summary}`)
      : ["- No support markdown docs found in this entry folder."]),
  ];

  if (entry.relatedDocsBlock) {
    lines.push("");
    lines.push("## Related Docs Block");
    lines.push("");
    lines.push("```md");
    lines.push(entry.relatedDocsBlock);
    lines.push("```");
  }

  return lines.join("\n");
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const entry = buildEntry(ROOT, options.slug ?? "");
  const durableLearning = buildLearning(entry);

  if (options.saveLearning) {
    saveLearning({ learningLine: durableLearning });
  }

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          ...entry,
          durableLearning,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(buildTextOutput(entry));
  console.log("");
  console.log("## Durable learning");
  console.log("");
  console.log(durableLearning);
}

if (import.meta.main) {
  main();
}
const CATALOG_DIR = "games";
