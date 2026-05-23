import { existsSync } from "node:fs";
import { relative, resolve } from "node:path";
import { $ } from "bun";
import { buildQueueSnapshot, parseTodoRecords, type QueueState } from "./catalog_candidates";
import { saveLearning } from "./learning_capture";
import { buildReviewFreshnessEntries, type ReviewFreshnessLane } from "./review_freshness_core";
import { inspectSmokeArtifacts } from "./smoke_artifacts";
import { buildReports, type EntryIssue } from "./sweep_core";
import { isBootIssueCode } from "./throughput_lanes";

type CliOptions = {
  json: boolean;
  saveLearning: boolean;
  slug?: string;
};

type DirtyReason = "existing-edit" | "new-only";
type ChangeKind = "readme-only" | "content-change";
type VerifyLane = "boot-fix-first" | "verify-after-edit" | "docs-only";

type DirtyVerifyEntry = {
  slug: string;
  queueState: QueueState;
  dirtyReason: DirtyReason;
  changeKind: ChangeKind;
  verifyLane: VerifyLane;
  reviewLane: ReviewFreshnessLane | "none";
  reviewSummary: string;
  files: string[];
  evidence: string[];
  nextSteps: string[];
  commands: string[];
  proofTargets: string[];
};

const ROOT = process.cwd();
const TODO_PATH = resolve(ROOT, "todo.md");
const EXISTING_EDIT_CODES = new Set(["D", "M", "R", "T", "U", "C"]);
const NEW_ONLY_CODES = new Set([" ", "?", "A"]);

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

function parseStatusPaths(rawPath: string): string[] {
  const arrow = " -> ";
  if (!rawPath.includes(arrow)) {
    return [rawPath];
  }
  const [before, after] = rawPath.split(arrow);
  return [before, after].filter((entry): entry is string => Boolean(entry));
}

function statusMeansExistingEdit(status: string): boolean {
  return [...status].some((code) => EXISTING_EDIT_CODES.has(code));
}

function statusMeansNewOnly(status: string): boolean {
  return [...status].every((code) => NEW_ONLY_CODES.has(code)) && [...status].some((code) => code === "A" || code === "?");
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

function buildDirtyMap(
  lines: string[],
  candidateSlugs: Set<string>,
  repoPrefix: string,
  slugFilter?: string,
): Map<string, { paths: Set<string>; dirtyReason: DirtyReason }> {
  const dirty = new Map<string, { paths: Set<string>; dirtyReason: DirtyReason }>();

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

      const current = dirty.get(slug) ?? { paths: new Set<string>(), dirtyReason: "new-only" as const };
      current.paths.add(normalizePath(rawPath));
      dirty.set(slug, current);
      continue;
    }

    const status = line.slice(0, 2);
    const rawPath = line.slice(3);
    const reason: DirtyReason = statusMeansExistingEdit(status)
      ? "existing-edit"
      : statusMeansNewOnly(status)
        ? "new-only"
        : "existing-edit";

    for (const path of parseStatusPaths(rawPath)) {
      const trimmed = trimRepoPrefix(path, repoPrefix);
      if (!trimmed) {
        continue;
      }
      const slug = firstSegment(trimmed);
      if (!slug || !candidateSlugs.has(slug) || (slugFilter && slug !== slugFilter)) {
        continue;
      }

      const current = dirty.get(slug) ?? { paths: new Set<string>(), dirtyReason: reason };
      current.paths.add(normalizePath(trimmed));
      if (reason === "existing-edit") {
        current.dirtyReason = "existing-edit";
      }
      dirty.set(slug, current);
    }
  }

  return dirty;
}

function buildProofTargets(slug: string): string[] {
  return [
    `./..local/${slug}-smoke.json`,
    `./..local/${slug}-verify.png`,
    `./..local/<run>/${slug}-smoke.txt`,
  ];
}

function isReadmeOnly(slug: string, files: string[]): boolean {
  return files.every((file) => file === `${slug}/README.md`);
}

function chooseVerifyLane(changeKind: ChangeKind, bootIssues: EntryIssue[]): VerifyLane {
  if (bootIssues.length > 0) {
    return "boot-fix-first";
  }
  if (changeKind === "readme-only") {
    return "docs-only";
  }
  return "verify-after-edit";
}

function laneRank(lane: VerifyLane): number {
  if (lane === "boot-fix-first") {
    return 0;
  }
  if (lane === "verify-after-edit") {
    return 1;
  }
  return 2;
}

function buildEntries(
  dirtyMap: Map<string, { paths: Set<string>; dirtyReason: DirtyReason }>,
  slugFilter?: string,
): DirtyVerifyEntry[] {
  const todoRecords = parseTodoRecords(TODO_PATH);
  const queueSnapshot = buildQueueSnapshot(ROOT, todoRecords);
  const reviewMap = new Map(buildReviewFreshnessEntries({ slug: slugFilter }).map((entry) => [entry.slug, entry]));

  const reportMap = new Map(
    buildReports(ROOT, todoRecords, slugFilter).map((report) => [report.slug, report]),
  );

  return Array.from(dirtyMap.entries())
    .map(([slug, details]) => {
      const files = Array.from(details.paths).sort((left, right) => left.localeCompare(right));
      const report = reportMap.get(slug);
      const review = reviewMap.get(slug);
      const queueState = report?.queueState ?? review?.queueState ?? "untracked";
      const changeKind: ChangeKind = isReadmeOnly(slug, files) ? "readme-only" : "content-change";
      const bootIssues = report?.issues.filter((issue) => isBootIssueCode(issue.code)) ?? [];
      const verifyLane = chooseVerifyLane(changeKind, bootIssues);
      const smokeStatus = queueSnapshot.playableFolders.includes(slug) ? inspectSmokeArtifacts(ROOT, slug) : { kind: "missing" as const };
      const evidence: string[] = [
        `change: ${details.dirtyReason}, ${changeKind}`,
        `review: ${review?.reviewSummary ?? "missing review row"}`,
      ];

      if (smokeStatus.kind === "present") {
        evidence.push(`latest smoke: ./..local/${smokeStatus.latestSmokeName}`);
      } else {
        evidence.push(`smoke proof not found under ./.local for ${slug}`);
      }

      for (const issue of bootIssues) {
        evidence.push(`boot blocker: ${issue.detail}`);
      }

      const nextSteps: string[] = [];
      if (verifyLane === "boot-fix-first") {
        nextSteps.push(`Repair direct browser boot in ./games/${slug}/ before re-verifying.`);
        nextSteps.push(`Run browser verification for ./games/${slug}/ and save fresh proof to one of: ${buildProofTargets(slug).join(" | ")}.`);
      } else if (verifyLane === "verify-after-edit") {
        nextSteps.push(`Run browser verification for ./games/${slug}/ after the edit lands.`);
        nextSteps.push(`Save fresh proof to one of: ${buildProofTargets(slug).join(" | ")}.`);
      } else {
        nextSteps.push(`Treat this as docs-only closeout unless the README changed launch facts that need browser confirmation.`);
      }

      if (review?.lane === "flag-after-edit" && details.dirtyReason === "existing-edit") {
        nextSteps.push(`Flag ${slug} to needsAdditionalFeedback true before finishing because existing files changed.`);
      } else if (review?.lane === "needs-feedback") {
        nextSteps.push(`Do not use current review evidence for ${slug} until fresh feedback clears needsAdditionalFeedback.`);
      } else if (review?.lane === "review-missing") {
        nextSteps.push(`Do not use player feedback for ${slug} until a review row exists.`);
      }

      const commands = [
        `bun.cmd .agents/skills/catalog-sweep/scripts/maintenance_packet.ts --slug ${slug}`,
      ];
      if (verifyLane === "boot-fix-first" || verifyLane === "verify-after-edit") {
        commands.push(`bun.cmd .agents/skills/catalog-sweep/scripts/next_catalog_task.ts --slug ${slug}`);
      }
      if (verifyLane === "docs-only") {
        commands.push(`bun.cmd .agents/skills/catalog-sweep/scripts/readme_rewrite_starter.ts --slug ${slug}`);
      }
      if (review?.lane === "flag-after-edit" && details.dirtyReason === "existing-edit") {
        commands.push(`bun.cmd .agents/skills/catalog-sweep/scripts/review_flag_sync.ts --slug ${slug}`);
        commands.push(`bun.cmd .agents/skills/catalog-sweep/scripts/review_flag_sync.ts --slug ${slug} --apply`);
      } else {
        commands.push(`bun.cmd .agents/skills/catalog-sweep/scripts/review_freshness_pack.ts --slug ${slug}`);
      }

      return {
        slug,
        queueState,
        dirtyReason: details.dirtyReason,
        changeKind,
        verifyLane,
        reviewLane: review?.lane ?? "none",
        reviewSummary: review?.reviewSummary ?? "missing review row",
        files,
        evidence,
        nextSteps,
        commands,
        proofTargets: buildProofTargets(slug),
      } satisfies DirtyVerifyEntry;
    })
    .sort((left, right) => {
      const laneDiff = laneRank(left.verifyLane) - laneRank(right.verifyLane);
      if (laneDiff !== 0) {
        return laneDiff;
      }
      if (left.queueState !== right.queueState) {
        if (left.queueState === "pending") {
          return -1;
        }
        if (right.queueState === "pending") {
          return 1;
        }
      }
      return left.slug.localeCompare(right.slug);
    });
}

function buildLearning(entries: DirtyVerifyEntry[]): string {
  const verifyCount = entries.filter((entry) => entry.verifyLane === "verify-after-edit").length;
  const bootCount = entries.filter((entry) => entry.verifyLane === "boot-fix-first").length;
  const docsCount = entries.filter((entry) => entry.verifyLane === "docs-only").length;

  if (entries.length === 0) {
    return "- Catalog throughput improves when dirty-slug closeout can record a clean no-work pass, because the next operator does not have to rerun broad browser-proof triage just to confirm no edited catalog entries need follow-up.";
  }

  return `- Catalog throughput improves when one dirty-slug browser packet separates boot-fix-first (${bootCount}), verify-after-edit (${verifyCount}), and docs-only (${docsCount}) closure, because edited entries no longer need a second broad sweep just to know which touched slugs require fresh browser proof before closeout.`;
}

function renderText(entries: DirtyVerifyEntry[], durableLearning: string): string {
  const lines = [
    "# Dirty Verify Pack",
    "",
    `dirty slugs: ${entries.length}`,
    `boot-fix-first: ${entries.filter((entry) => entry.verifyLane === "boot-fix-first").length}`,
    `verify-after-edit: ${entries.filter((entry) => entry.verifyLane === "verify-after-edit").length}`,
    `docs-only: ${entries.filter((entry) => entry.verifyLane === "docs-only").length}`,
    "",
  ];

  if (entries.length === 0) {
    lines.push("- No dirty catalog slugs matched current queue or playable folders.");
  }

  for (const entry of entries) {
    lines.push(`## ${entry.slug}`);
    lines.push("");
    lines.push(`- queue: ${entry.queueState}`);
    lines.push(`- lane: ${entry.verifyLane}`);
    lines.push(`- review lane: ${entry.reviewLane}`);
    lines.push(`- dirty: ${entry.dirtyReason}`);
    lines.push(`- change kind: ${entry.changeKind}`);
    lines.push("- files:");
    for (const file of entry.files) {
      lines.push(`  - ./${file}`);
    }
    lines.push("- evidence:");
    for (const detail of entry.evidence) {
      lines.push(`  - ${detail}`);
    }
    lines.push("- next:");
    for (const step of entry.nextSteps) {
      lines.push(`  - ${step}`);
    }
    lines.push("- commands:");
    for (const command of entry.commands) {
      lines.push(`  - ${command}`);
    }
    if (entry.verifyLane !== "docs-only") {
      lines.push("- proof targets:");
      for (const target of entry.proofTargets) {
        lines.push(`  - ${target}`);
      }
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
  if (!existsSync(TODO_PATH)) {
    throw new Error("todo.md not found");
  }

  const candidateSlugs = buildCandidateSlugSet(options.slug);
  const lines = await readGitStatus();
  const repoPrefix = await readRepoPrefix();
  const dirtyMap = buildDirtyMap(lines, candidateSlugs, repoPrefix, options.slug);
  const entries = buildEntries(dirtyMap, options.slug);
  const durableLearning = buildLearning(entries);

  if (options.saveLearning) {
    saveLearning({ learningLine: durableLearning });
  }

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          summary: {
            dirtySlugs: entries.length,
            bootFixFirst: entries.filter((entry) => entry.verifyLane === "boot-fix-first").length,
            verifyAfterEdit: entries.filter((entry) => entry.verifyLane === "verify-after-edit").length,
            docsOnly: entries.filter((entry) => entry.verifyLane === "docs-only").length,
          },
          durableLearning,
          entries,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(renderText(entries, durableLearning));
}

await main();
