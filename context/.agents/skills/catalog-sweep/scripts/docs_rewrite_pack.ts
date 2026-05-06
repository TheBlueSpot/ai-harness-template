import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { findCatalogFolders, parseTodoRecords, type QueueState } from "./catalog_candidates";
import { saveLearning } from "./learning_capture";
import { buildReadmeGuidance, inspectReadme, type ReadmeEvidence, type ReadmeIssueCode } from "./readme_hygiene";

export type GroupMode = "launch" | "implementation" | "log" | "links" | "mixed" | "missing-readme" | "all";

type CliOptions = {
  group?: GroupMode;
  json: boolean;
  limit?: number;
  saveLearning: boolean;
  slug?: string;
};

export type DocsPackEntry = {
  slug: string;
  queueState: QueueState;
  issues: Array<ReadmeIssueCode | "missing-readme">;
  guidance: string[];
  evidence: string[];
};

export type GroupCounts = {
  launch: number;
  implementation: number;
  log: number;
  links: number;
  mixed: number;
  missingReadme: number;
};

const ROOT = process.cwd();
const TODO_PATH = resolve(ROOT, "todo.md");

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
      options.slug = next;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
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

export function chooseDefaultGroup(counts: GroupCounts): GroupMode {
  const ranked: Array<{ group: GroupMode; count: number }> = [
    { group: "launch", count: counts.launch },
    { group: "implementation", count: counts.implementation },
    { group: "log", count: counts.log },
    { group: "links", count: counts.links },
    { group: "mixed", count: counts.mixed },
    { group: "missing-readme", count: counts.missingReadme },
  ].sort((left, right) => {
    if (right.count !== left.count) {
      return right.count - left.count;
    }
    return left.group.localeCompare(right.group);
  });

  return ranked[0]?.group ?? "all";
}

function buildEvidence(
  issueCodes: Array<ReadmeIssueCode | "missing-readme">,
  evidenceSource: ReadmeEvidence,
): string[] {
  const evidence: string[] = [];

  if (issueCodes.includes("missing-play-instructions")) {
    evidence.push("missing launch line: README never says to open ./index.html in a browser");
  }
  if (issueCodes.includes("non-canonical-launch-line")) {
    for (const line of evidenceSource.launchLines.slice(0, 2)) {
      evidence.push(`launch line: ${line.trim()}`);
    }
  }
  if (issueCodes.includes("implementation-heavy-readme")) {
    for (const line of evidenceSource.implementationLines.slice(0, 3)) {
      evidence.push(`implementation line: ${line.trim()}`);
    }
  }
  if (issueCodes.includes("log-heavy-readme")) {
    for (const line of evidenceSource.logLines.slice(0, 3)) {
      evidence.push(`log line: ${line.trim()}`);
    }
  }
  if (issueCodes.includes("link-style-drift")) {
    for (const line of evidenceSource.linkDriftLines.slice(0, 3)) {
      evidence.push(`link drift: ${line.trim()}`);
    }
  }

  return evidence;
}

export function matchesGroup(group: GroupMode, entry: DocsPackEntry): boolean {
  if (group === "all") {
    return true;
  }
  if (group === "launch") {
    return entry.issues.includes("missing-play-instructions") || entry.issues.includes("non-canonical-launch-line");
  }
  if (group === "implementation") {
    return entry.issues.includes("implementation-heavy-readme");
  }
  if (group === "log") {
    return entry.issues.includes("log-heavy-readme");
  }
  if (group === "links") {
    return entry.issues.includes("link-style-drift");
  }
  if (group === "mixed") {
    return entry.issues.length > 1;
  }
  return entry.issues.includes("missing-readme");
}

export function groupLabel(group: GroupMode): string {
  if (group === "launch") {
    return "normalize launch line";
  }
  if (group === "implementation") {
    return "trim implementation detail";
  }
  if (group === "log") {
    return "trim fix-log drift";
  }
  if (group === "links") {
    return "normalize local link style";
  }
  if (group === "mixed") {
    return "multi-fix rewrites";
  }
  if (group === "missing-readme") {
    return "missing readmes";
  }
  return "all docs issues";
}

export function collectDocsPackEntries(root: string, slug?: string): { entries: DocsPackEntry[]; counts: GroupCounts } {
  const todoPath = resolve(root, "todo.md");
  if (!existsSync(todoPath)) {
    throw new Error("todo.md not found");
  }

  const todoRecords = parseTodoRecords(todoPath);
  const slugs = slug ? [slug] : findCatalogFolders(root);
  const entries: DocsPackEntry[] = [];
  const counts: GroupCounts = { launch: 0, implementation: 0, log: 0, links: 0, mixed: 0, missingReadme: 0 };

  for (const currentSlug of slugs) {
    const readmePath = resolve(root, currentSlug, "README.md");
    const records = todoRecords.get(currentSlug) ?? [];
    const queueState: QueueState = records.some((record) => record.state === "pending")
      ? "pending"
      : records.some((record) => record.state === "completed")
        ? "completed"
        : "untracked";

    if (!existsSync(readmePath)) {
      counts.missingReadme += 1;
      entries.push({
        slug: currentSlug,
        queueState,
        issues: ["missing-readme"],
        guidance: ["add a short README with premise, controls, browser launch note, and one loop summary"],
        evidence: ["README missing"],
      });
      continue;
    }

    const inspection = inspectReadme(root, currentSlug);
    if (inspection.issues.length === 0) {
      continue;
    }

    const issueCodes = inspection.issues.map((issue) => issue.code);
    if (issueCodes.includes("missing-play-instructions") || issueCodes.includes("non-canonical-launch-line")) {
      counts.launch += 1;
    }
    if (issueCodes.includes("implementation-heavy-readme")) {
      counts.implementation += 1;
    }
    if (issueCodes.includes("log-heavy-readme")) {
      counts.log += 1;
    }
    if (issueCodes.includes("link-style-drift")) {
      counts.links += 1;
    }
    if (issueCodes.length > 1) {
      counts.mixed += 1;
    }

    entries.push({
      slug: currentSlug,
      queueState,
      issues: issueCodes,
      guidance: buildReadmeGuidance(true, inspection.issues),
      evidence: buildEvidence(issueCodes, inspection.evidence),
    });
  }

  return { entries, counts };
}

function buildLearning(group: GroupMode, filteredCount: number, totalEntries: number): string {
  if (filteredCount === 0) {
    return "- Catalog throughput improves when docs helpers save even a no-debt lane result, because the next operator can trust README hygiene stayed clear instead of reopening the same files to confirm a clean pass.";
  }

  return `- Catalog throughput improves when docs helpers save one ${groupLabel(group)} lane with ${filteredCount} of ${totalEntries} flagged entries, because batch rewrite intent survives the terminal and README cleanup stops paying a second rediscovery pass.`;
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  if (!existsSync(TODO_PATH)) {
    throw new Error("todo.md not found");
  }

  const { entries, counts } = collectDocsPackEntries(ROOT, options.slug);

  const group = options.group ?? chooseDefaultGroup(counts);
  const filtered = entries.filter((entry) => matchesGroup(group, entry));
  const limited = filtered.slice(0, options.limit ?? filtered.length);
  const durableLearning = buildLearning(group, filtered.length, entries.length);

  if (options.saveLearning) {
    saveLearning({ learningLine: durableLearning });
  }

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          summary: {
            entriesWithDocsIssues: entries.length,
            groups: counts,
            selectedGroup: group,
            selectedLabel: groupLabel(group),
            selectedCount: filtered.length,
          },
          durableLearning,
          entries: limited,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log("# Docs Rewrite Pack");
  console.log("");
  console.log(`entries with docs issues: ${entries.length}`);
  console.log(
    `groups: launch ${counts.launch} | implementation ${counts.implementation} | log ${counts.log} | links ${counts.links} | mixed ${counts.mixed} | missing readmes ${counts.missingReadme}`,
  );
  console.log(`selected group: ${groupLabel(group)} (${filtered.length})`);
  if (options.limit) {
    console.log(`limit: ${options.limit}`);
  }
  console.log("");
  console.log("## Rewrite next");
  console.log("");
  if (group === "launch") {
    console.log("- Batch canonical launch-line fixes first. These are the cheapest docs closures because gameplay docs can stay mostly intact.");
  } else if (group === "implementation") {
    console.log("- Trim file inventories and code-tour prose next. Keep only premise, controls, play path, and one durable note.");
  } else if (group === "log") {
    console.log("- Collapse patrol-history drift next. Move only durable insight forward and delete per-pass fix logs.");
  } else if (group === "links") {
    console.log("- Normalize local markdown links next. Keep targets ./-relative and labels plain so docs stay consistent.");
  } else if (group === "mixed") {
    console.log("- Rewrite the noisy mixed entries whole. Partial edits will keep rediscovery cost high.");
  } else if (group === "missing-readme") {
    console.log("- Add missing high-level READMEs before deeper sweep work so these folders stop failing basic catalog hygiene.");
  } else {
    console.log("- Work the selected entries as one docs lane, not as isolated judgment calls.");
  }

  for (const entry of limited) {
    console.log("");
    console.log(`## ${entry.slug}`);
    console.log("");
    console.log(`- queue: ${formatQueueState(entry.queueState)}`);
    console.log(`- issues: ${entry.issues.join(", ")}`);
    console.log(`- rewrite: ${entry.guidance.join("; ")}`);
    for (const evidence of entry.evidence) {
      console.log(`- evidence: ${evidence}`);
    }
  }

  console.log("");
  console.log("## Durable learning");
  console.log("");
  console.log(durableLearning);
}

if (import.meta.main) {
  main();
}
