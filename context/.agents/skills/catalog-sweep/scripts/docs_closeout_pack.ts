import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { saveLearning } from "./learning_capture";
import {
  collectDocsPackEntries,
  chooseDefaultGroup,
  groupLabel,
  matchesGroup,
  type DocsPackEntry,
  type GroupMode,
} from "./docs_rewrite_pack";
import { buildEntry as buildRewriteEntry } from "./readme_rewrite_starter";
import { buildRelatedDocsBlock, collectSupportDocs, type SupportDoc } from "./support_docs";

type CliOptions = {
  group?: GroupMode;
  json: boolean;
  limit?: number;
  saveLearning: boolean;
  slugs: string[];
};

type Selection =
  | { mode: "group"; group: GroupMode; entries: DocsPackEntry[] }
  | { mode: "explicit"; slugs: string[] };

type CloseoutEntry = ReturnType<typeof buildRewriteEntry> & {
  relatedDocsBlock: string | null;
  supportDocs: SupportDoc[];
  unlinkedSupportDocs: SupportDoc[];
};

const ROOT = process.cwd();

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { json: false, saveLearning: false, slugs: [] };

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
    if ((arg === "--group" || arg === "--limit" || arg === "--slug") && !next) {
      throw new Error(`Missing value for ${arg}`);
    }

    if (arg === "--group") {
      if (
        next !== "launch" &&
        next !== "implementation" &&
        next !== "log" &&
        next !== "links" &&
        next !== "mixed" &&
        next !== "missing-readme" &&
        next !== "all"
      ) {
        throw new Error(`Unsupported --group value: ${next}`);
      }
      options.group = next;
      index += 1;
      continue;
    }

    if (arg === "--limit") {
      const limit = Number.parseInt(next ?? "", 10);
      if (!Number.isFinite(limit) || limit < 1) {
        throw new Error(`Invalid --limit value: ${next}`);
      }
      options.limit = limit;
      index += 1;
      continue;
    }

    if (arg === "--slug") {
      options.slugs.push(next ?? "");
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function selectEntries(options: CliOptions): Selection {
  if (options.slugs.length > 0) {
    return {
      mode: "explicit",
      slugs: [...new Set(options.slugs)].slice(0, options.limit ?? options.slugs.length),
    };
  }

  const { entries, counts } = collectDocsPackEntries(ROOT);
  const group = options.group ?? chooseDefaultGroup(counts);
  const selectedEntries = entries
    .filter((entry) => matchesGroup(group, entry))
    .slice(0, options.limit ?? entries.length);
  return {
    mode: "group",
    group,
    entries: selectedEntries,
  };
}

function buildCloseoutEntry(slug: string): CloseoutEntry {
  const rewriteEntry = buildRewriteEntry(slug, ROOT);
  const docsPackEntry = collectDocsPackEntries(ROOT, slug).entries[0];
  const readmePath = resolve(ROOT, slug, "README.md");
  const readmeText = existsSync(readmePath) ? readFileSync(readmePath, "utf8") : null;
  const supportDocs = collectSupportDocs(ROOT, slug, readmeText);
  return {
    ...rewriteEntry,
    guidance: docsPackEntry?.guidance ?? rewriteEntry.guidance,
    evidence: docsPackEntry && docsPackEntry.evidence.length > 0 ? docsPackEntry.evidence : rewriteEntry.evidence,
    supportDocs,
    unlinkedSupportDocs: supportDocs.filter((doc) => !doc.linkedFromReadme),
    relatedDocsBlock: buildRelatedDocsBlock(supportDocs),
  };
}

function buildBatch(selection: Selection): CloseoutEntry[] {
  const slugs = selection.mode === "group" ? selection.entries.map((entry) => entry.slug) : selection.slugs;
  return slugs.map((slug) => buildCloseoutEntry(slug));
}

function buildLearning(selection: Selection, entries: CloseoutEntry[]): string {
  const supportDocTargets = entries.reduce((sum, entry) => sum + entry.unlinkedSupportDocs.length, 0);
  const reviewGuarded = entries.filter((entry) => entry.reviewFreshness?.lane === "flag-after-edit").length;
  const laneLabel = selection.mode === "group" ? groupLabel(selection.group) : "explicit docs closeout";

  if (entries.length === 0) {
    return "- Catalog throughput improves when the docs closeout pack can save a clean no-work pass, because operators can trust README rewrite and support-doc handoff stayed clear without rerunning separate docs helpers.";
  }

  return `- Catalog throughput improves when one docs closeout pack merges README rewrite starters, ${supportDocTargets} unlinked support-doc targets, and ${reviewGuarded} flag-after-edit review guards in the ${laneLabel} lane, because per-entry docs closure stops bouncing between rewrite, docs-link, and review helpers.`;
}

function buildTextOutput(selection: Selection, entries: CloseoutEntry[]): string {
  const lines = [
    "# Docs Closeout Pack",
    "",
    `entries: ${entries.length}`,
    selection.mode === "group"
      ? `selected lane: ${groupLabel(selection.group)}`
      : `selected slugs: ${selection.slugs.join(", ")}`,
    "",
    "## Closeout next",
    "",
    "- Use this pack when README rewrite, support-doc linking, and review closeout need to stay in one pass.",
    "- Keep README edits high level, then link support markdown instead of copying detail forward.",
  ];

  for (const entry of entries) {
    lines.push("");
    lines.push(`## ${entry.slug}`);
    lines.push("");
    lines.push(`- queue: ${entry.queueState}`);
    lines.push(`- issues: ${entry.issues.length > 0 ? entry.issues.join(", ") : "none"}`);
    if (entry.guidance.length > 0) {
      lines.push(`- rewrite: ${entry.guidance.join("; ")}`);
    }
    for (const evidence of entry.evidence) {
      lines.push(`- evidence: ${evidence}`);
    }
    lines.push(
      `- support docs: ${
        entry.supportDocs.length > 0
          ? entry.supportDocs
              .map((doc) => `${doc.linkedFromReadme ? "linked" : "unlinked"} ./${doc.file}`)
              .join("; ")
          : "none"
      }`,
    );
    if (entry.unlinkedSupportDocs.length > 0) {
      lines.push(`- next: link ${entry.unlinkedSupportDocs.map((doc) => `./${doc.file}`).join(", ")}`);
    }
    if (entry.reviewFreshness) {
      lines.push(`- review guard: ${entry.reviewFreshness.lane} | ${entry.reviewFreshness.reviewSummary}`);
      if (entry.reviewFreshness.lane === "flag-after-edit") {
        lines.push(`- review command: bun.cmd .agents/skills/catalog-sweep/scripts/review_flag_sync.ts --slug ${entry.slug} --apply`);
      }
    }
    lines.push("- starter:");
    lines.push("```md");
    lines.push(entry.starter);
    lines.push("```");
    if (entry.relatedDocsBlock) {
      lines.push("- related docs block:");
      lines.push("```md");
      lines.push(entry.relatedDocsBlock);
      lines.push("```");
    }
  }

  return lines.join("\n");
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const selection = selectEntries(options);
  const entries = buildBatch(selection);
  const durableLearning = buildLearning(selection, entries);

  if (options.saveLearning) {
    saveLearning({ learningLine: durableLearning });
  }

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          selection,
          durableLearning,
          entries,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(buildTextOutput(selection, entries));
  console.log("");
  console.log("## Durable learning");
  console.log("");
  console.log(durableLearning);
}

if (import.meta.main) {
  main();
}
