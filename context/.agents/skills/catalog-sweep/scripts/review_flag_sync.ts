import { existsSync } from "node:fs";
import { relative, resolve } from "node:path";
import { $ } from "bun";
import {
  buildQueueSnapshot,
  parseTodoRecords,
  type QueueState,
} from "./catalog_candidates";
import { saveLearning } from "./learning_capture";
import { buildReviewFreshnessEntries, type ReviewFreshnessLane } from "./review_freshness_core";

type CliOptions = {
  apply: boolean;
  json: boolean;
  saveLearning: boolean;
  slug?: string;
};

type DirtyReason = "existing-edit" | "new-only";

type SlugReport = {
  lane: ReviewFreshnessLane | "none";
  nextAction: "flag" | "already-blocked" | "new-only" | "none";
  paths: string[];
  queueState: QueueState;
  reason: DirtyReason;
  reviewSummary: string;
  slug: string;
};

const ROOT = process.cwd();
const TODO_PATH = resolve(ROOT, "todo.md");
const EXISTING_EDIT_CODES = new Set(["D", "M", "R", "T", "U", "C"]);
const NEW_ONLY_CODES = new Set([" ", "?", "A"]);

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { apply: false, json: false, saveLearning: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") {
      options.apply = true;
      continue;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--save-learning") {
      options.saveLearning = true;
      continue;
    }
    if (arg === "--slug") {
      const next = argv[index + 1];
      if (!next) {
        throw new Error("Missing value for --slug");
      }
      options.slug = next;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function normalizePath(pathname: string): string {
  return pathname.replace(/\\/g, "/");
}

function firstSegment(pathname: string): string | undefined {
  return normalizePath(pathname).split("/").find((segment) => segment.length > 0);
}

function statusMeansExistingEdit(status: string): boolean {
  return [...status].some((code) => EXISTING_EDIT_CODES.has(code));
}

function statusMeansNewOnly(status: string): boolean {
  return [...status].every((code) => NEW_ONLY_CODES.has(code)) && [...status].some((code) => code === "A" || code === "?");
}

function parseStatusPaths(rawPath: string): string[] {
  const arrow = " -> ";
  if (!rawPath.includes(arrow)) {
    return [rawPath];
  }
  const [before, after] = rawPath.split(arrow);
  return [before, after].filter((entry): entry is string => Boolean(entry));
}

async function readGitStatus(): Promise<string[]> {
  const output = await $`git status --porcelain=v1 --untracked-files=all`.quiet().text();
  return output
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
}

async function readRepoPrefix(): Promise<string> {
  const repoRoot = (await $`git rev-parse --show-toplevel`.quiet().text()).trim();
  const prefix = normalizePath(relative(repoRoot, ROOT));
  return prefix.length === 0 ? "" : `${prefix}/`;
}

function buildCandidateSlugSet(slug?: string): Set<string> {
  if (!existsSync(TODO_PATH)) {
    throw new Error("todo.md not found");
  }

  const todoRecords = parseTodoRecords(TODO_PATH);
  const snapshot = buildQueueSnapshot(ROOT, todoRecords);
  const candidates = new Set<string>([...snapshot.playableFolders, ...todoRecords.keys()]);
  if (slug) {
    candidates.add(slug);
  }
  return candidates;
}

function trimRepoPrefix(pathname: string, repoPrefix: string): string | undefined {
  const normalized = normalizePath(pathname);
  if (repoPrefix.length === 0) {
    return normalized;
  }
  if (!normalized.startsWith(repoPrefix)) {
    return undefined;
  }
  return normalized.slice(repoPrefix.length);
}

function buildDirtyMap(
  lines: string[],
  candidateSlugs: Set<string>,
  repoPrefix: string,
  slugFilter?: string,
): Map<string, { paths: Set<string>; reason: DirtyReason }> {
  const dirty = new Map<string, { paths: Set<string>; reason: DirtyReason }>();

  for (const line of lines) {
    if (line.startsWith("?? ")) {
      const rawPath = trimRepoPrefix(line.slice(3), repoPrefix);
      if (!rawPath) {
        continue;
      }
      const slug = firstSegment(rawPath);
      if (!slug || !candidateSlugs.has(slug) || (slugFilter && slug !== slugFilter)) {
        continue;
      }

      const current = dirty.get(slug) ?? { paths: new Set<string>(), reason: "new-only" as const };
      current.paths.add(normalizePath(rawPath));
      dirty.set(slug, current);
      continue;
    }

    const status = line.slice(0, 2);
    const rawPath = line.slice(3);
    const paths = parseStatusPaths(rawPath)
      .map((path) => trimRepoPrefix(path, repoPrefix))
      .filter((path): path is string => Boolean(path));
    const reason: DirtyReason = statusMeansExistingEdit(status)
      ? "existing-edit"
      : statusMeansNewOnly(status)
        ? "new-only"
        : "existing-edit";

    for (const path of paths) {
      const slug = firstSegment(path);
      if (!slug || !candidateSlugs.has(slug) || (slugFilter && slug !== slugFilter)) {
        continue;
      }

      const current = dirty.get(slug) ?? { paths: new Set<string>(), reason };
      current.paths.add(normalizePath(path));
      if (reason === "existing-edit") {
        current.reason = "existing-edit";
      }
      dirty.set(slug, current);
    }
  }

  return dirty;
}

function buildReports(dirtyMap: Map<string, { paths: Set<string>; reason: DirtyReason }>): SlugReport[] {
  const reviewEntries = new Map(buildReviewFreshnessEntries().map((entry) => [entry.slug, entry]));

  return Array.from(dirtyMap.entries())
    .map(([slug, details]) => {
      const review = reviewEntries.get(slug);
      const nextAction =
        details.reason === "new-only"
          ? "new-only"
          : review?.lane === "needs-feedback"
            ? "already-blocked"
            : "flag";

      return {
        slug,
        queueState: review?.queueState ?? "untracked",
        reason: details.reason,
        nextAction,
        lane: review?.lane ?? "none",
        reviewSummary: review?.reviewSummary ?? "missing review row",
        paths: Array.from(details.paths).sort((left, right) => left.localeCompare(right)),
      } satisfies SlugReport;
    })
    .sort((left, right) => {
      const rank = actionRank(left.nextAction) - actionRank(right.nextAction);
      if (rank !== 0) {
        return rank;
      }
      return left.slug.localeCompare(right.slug);
    });
}

function actionRank(action: SlugReport["nextAction"]): number {
  if (action === "flag") {
    return 0;
  }
  if (action === "already-blocked") {
    return 1;
  }
  if (action === "new-only") {
    return 2;
  }
  return 3;
}

async function applyFlags(reports: SlugReport[]): Promise<string[]> {
  const flagged: string[] = [];

  for (const report of reports) {
    if (report.nextAction !== "flag") {
      continue;
    }

    await $`bun.cmd scripts/user-reviews.ts flag ${report.slug} --needs-feedback true`.cwd(ROOT).quiet();
    flagged.push(report.slug);
  }

  return flagged;
}

function buildLearning(reports: SlugReport[]): string {
  const flagCount = reports.filter((report) => report.nextAction === "flag").length;
  const blockedCount = reports.filter((report) => report.nextAction === "already-blocked").length;
  const newOnlyCount = reports.filter((report) => report.nextAction === "new-only").length;

  return `- Catalog throughput improves when one dirty-tree pass converts changed slugs into exact review-flag actions (${flagCount} flag, ${blockedCount} already blocked, ${newOnlyCount} new-only), because the needsAdditionalFeedback rule stops depending on manual memory at closeout.`;
}

function renderText(reports: SlugReport[], flagged: string[], durableLearning: string): string {
  const lines = [
    "# Review Flag Sync",
    "",
    `dirty slugs: ${reports.length}`,
    `flag now: ${reports.filter((report) => report.nextAction === "flag").length}`,
    `already blocked: ${reports.filter((report) => report.nextAction === "already-blocked").length}`,
    `new-only: ${reports.filter((report) => report.nextAction === "new-only").length}`,
    flagged.length > 0 ? `applied: ${flagged.join(", ")}` : "applied: none",
    "",
  ];

  if (reports.length === 0) {
    lines.push("- No dirty catalog slugs matched current queue or playable folders.");
  }

  for (const report of reports) {
    lines.push(`## ${report.slug}`);
    lines.push("");
    lines.push(`- queue: ${report.queueState}`);
    lines.push(`- change: ${report.reason}`);
    lines.push(`- action: ${report.nextAction}`);
    lines.push(`- review: ${report.reviewSummary}`);
    lines.push("- paths:");
    for (const path of report.paths) {
      lines.push(`  - ./${path}`);
    }
    lines.push("- next:");
    if (report.nextAction === "flag") {
      lines.push(`  - Run \`bun.cmd scripts/user-reviews.ts flag ${report.slug} --needs-feedback true\` before closing the slug.`);
    } else if (report.nextAction === "already-blocked") {
      lines.push("  - Keep the current review blocked until fresh feedback replaces it.");
    } else if (report.nextAction === "new-only") {
      lines.push("  - No review flag needed yet if this slug only gained brand-new files.");
    } else {
      lines.push("  - No review action required.");
    }
    lines.push("");
  }

  lines.push("## Durable learning");
  lines.push("");
  lines.push(durableLearning);
  return lines.join("\n");
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const candidateSlugs = buildCandidateSlugSet(options.slug);
  const lines = await readGitStatus();
  const repoPrefix = await readRepoPrefix();
  const dirtyMap = buildDirtyMap(lines, candidateSlugs, repoPrefix, options.slug);
  const reports = buildReports(dirtyMap);
  const flagged = options.apply ? await applyFlags(reports) : [];
  const durableLearning = buildLearning(reports);

  if (options.saveLearning) {
    saveLearning({ learningLine: durableLearning });
  }

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          summary: {
            dirtySlugs: reports.length,
            flagNow: reports.filter((report) => report.nextAction === "flag").length,
            alreadyBlocked: reports.filter((report) => report.nextAction === "already-blocked").length,
            newOnly: reports.filter((report) => report.nextAction === "new-only").length,
            applied: flagged,
          },
          durableLearning,
          reports,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(renderText(reports, flagged, durableLearning));
}

await main();
