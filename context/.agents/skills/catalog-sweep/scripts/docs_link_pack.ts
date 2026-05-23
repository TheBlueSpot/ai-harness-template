import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { saveLearning } from "./learning_capture";
import { buildReadmeGuidance, inspectReadme, type ReadmeIssueCode } from "./readme_hygiene";
import {
  collectSupportDocs,
  formatQueueState,
  readQueueState,
  type SupportDoc,
} from "./support_docs";
import type { QueueState } from "./catalog_candidates";

type Group = "all" | "unlinked" | "linked";

type CliOptions = {
  group: Group;
  json: boolean;
  limit?: number;
  saveLearning: boolean;
};

type Entry = {
  slug: string;
  queueState: QueueState;
  supportDocs: SupportDoc[];
  unlinkedDocs: SupportDoc[];
  issues: Array<ReadmeIssueCode | "missing-readme">;
  guidance: string[];
};

const ROOT = process.cwd();

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    group: "unlinked",
    json: false,
    saveLearning: false,
  };

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
    if ((arg === "--group" || arg === "--limit") && !next) {
      throw new Error(`Missing value for ${arg}`);
    }

    if (arg === "--group") {
      if (next !== "all" && next !== "unlinked" && next !== "linked") {
        throw new Error(`Unknown group: ${next}`);
      }
      options.group = next;
      index += 1;
      continue;
    }

    if (arg === "--limit") {
      const limit = Number.parseInt(next ?? "", 10);
      if (!Number.isFinite(limit) || limit <= 0) {
        throw new Error(`Invalid --limit value: ${next}`);
      }
      options.limit = limit;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function listPlayableSlugs(root: string): string[] {
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .filter((slug) => existsSync(resolve(root, CATALOG_DIR, slug, "index.html")))
    .sort((left, right) => left.localeCompare(right));
}

function buildExtraGuidance(supportDocs: SupportDoc[], hasReadme: boolean): string[] {
  const guidance: string[] = [];
  const unlinkedDocs = supportDocs.filter((doc) => !doc.linkedFromReadme);

  if (!hasReadme && supportDocs.length > 0) {
    guidance.push("add a short README first, then link support docs instead of copying detail into the summary");
  }

  if (unlinkedDocs.length > 0) {
    guidance.push(`link support docs from README: ${unlinkedDocs.map((doc) => `./${doc.file}`).join(", ")}`);
  }

  return guidance;
}

function buildEntries(root: string): Entry[] {
  return listPlayableSlugs(root)
    .map((slug) => {
      const readmePath = resolve(root, CATALOG_DIR, slug, "README.md");
      const hasReadme = existsSync(readmePath);
      const readmeText = hasReadme ? readFileSync(readmePath, "utf8") : null;
      const supportDocs = collectSupportDocs(root, slug, readmeText);
      if (supportDocs.length === 0) {
        return null;
      }

      if (!hasReadme) {
        return {
          slug,
          queueState: readQueueState(root, slug),
          supportDocs,
          unlinkedDocs: supportDocs,
          issues: ["missing-readme"],
          guidance: [
            "add a short README with premise, controls, browser launch note, and one loop summary",
            ...buildExtraGuidance(supportDocs, false),
          ],
        } satisfies Entry;
      }

      const inspection = inspectReadme(root, slug);
      return {
        slug,
        queueState: readQueueState(root, slug),
        supportDocs,
        unlinkedDocs: supportDocs.filter((doc) => !doc.linkedFromReadme),
        issues: inspection.issues.map((issue) => issue.code),
        guidance: [...buildReadmeGuidance(true, inspection.issues), ...buildExtraGuidance(supportDocs, true)],
      } satisfies Entry;
    })
    .filter((entry): entry is Entry => entry !== null);
}

function filterEntries(entries: Entry[], group: Group): Entry[] {
  if (group === "all") {
    return entries;
  }
  if (group === "linked") {
    return entries.filter((entry) => entry.supportDocs.every((doc) => doc.linkedFromReadme));
  }
  return entries.filter((entry) => entry.unlinkedDocs.length > 0);
}

function sortEntries(entries: Entry[]): Entry[] {
  return [...entries].sort((left, right) => {
    if (right.unlinkedDocs.length !== left.unlinkedDocs.length) {
      return right.unlinkedDocs.length - left.unlinkedDocs.length;
    }
    if (right.supportDocs.length !== left.supportDocs.length) {
      return right.supportDocs.length - left.supportDocs.length;
    }
    return left.slug.localeCompare(right.slug);
  });
}

function buildLearning(group: Group, entries: Entry[]): string {
  const supportDocCount = entries.reduce((sum, entry) => sum + entry.supportDocs.length, 0);
  return `- Catalog throughput improves when one docs-link pack batches ${entries.length} support-doc slugs (${supportDocCount} markdown targets) in the ${group} lane, because README cleanup can link asset, playtest, or nested docs without folder-by-folder rediscovery.`;
}

function buildTextOutput(group: Group, entries: Entry[]): string {
  const lines = [
    "# Docs Link Pack",
    "",
    `group: ${group}`,
    `entries: ${entries.length}`,
    "",
    "## Targets",
    "",
    ...(entries.length > 0
      ? entries.flatMap((entry) => [
          `- ${entry.slug} | queue ${formatQueueState(entry.queueState)} | support docs ${entry.supportDocs.length} | unlinked ${entry.unlinkedDocs.length} | issues ${entry.issues.length > 0 ? entry.issues.join(", ") : "none"}`,
          `  next: bun.cmd .agents/skills/catalog-sweep/scripts/readme_doc_handoff.ts --slug ${entry.slug}`,
          `  docs: ${entry.supportDocs.map((doc) => `${doc.linkedFromReadme ? "linked" : "unlinked"} ./${doc.file}`).join("; ")}`,
          ...(entry.guidance.length > 0 ? [`  guidance: ${entry.guidance.join("; ")}`] : []),
        ])
      : ["- No support-doc entries matched this lane."]),
  ];

  return lines.join("\n");
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const allEntries = buildEntries(ROOT);
  const entries = sortEntries(filterEntries(allEntries, options.group));
  const limitedEntries = options.limit ? entries.slice(0, options.limit) : entries;
  const durableLearning = buildLearning(options.group, limitedEntries);

  if (options.saveLearning) {
    saveLearning({ learningLine: durableLearning });
  }

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          group: options.group,
          entries: limitedEntries,
          durableLearning,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(buildTextOutput(options.group, limitedEntries));
  console.log("");
  console.log("## Durable learning");
  console.log("");
  console.log(durableLearning);
}

if (import.meta.main) {
  main();
}
const CATALOG_DIR = "games";
