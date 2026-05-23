import { existsSync } from "node:fs";
import { relative, resolve } from "node:path";
import { $ } from "bun";
import { buildQueueSnapshot, parseTodoRecords, type QueueState } from "./catalog_candidates";
import { saveLearning } from "./learning_capture";
import { buildReviewFreshnessEntries, type ReviewFreshnessLane } from "./review_freshness_core";
import { inspectSmokeArtifacts } from "./smoke_artifacts";
import { buildQueueOnlyReports, buildReports, type EntryIssue } from "./sweep_core";
import { isBootIssueCode, isDocsIssueCode, isReconcileIssueCode, isSmokeIssueCode } from "./throughput_lanes";

type CliOptions = {
  json: boolean;
  saveLearning: boolean;
  slug?: string;
};

type DirtyReason = "existing-edit" | "new-only";
type ChangeKind = "readme-only" | "content-change";
type PrimaryLane = "boot-fix-first" | "verify-after-edit" | "review-flag" | "review-blocked" | "docs-only" | "clean";
type IssueLane = "boot" | "verify" | "review" | "queue" | "docs";

type CloseoutIssue = {
  lane: IssueLane;
  detail: string;
};

type CloseoutEntry = {
  slug: string;
  queueState: QueueState;
  dirtyReason: DirtyReason;
  changeKind: ChangeKind;
  primaryLane: PrimaryLane;
  reviewLane: ReviewFreshnessLane | "none";
  reviewSummary: string;
  files: string[];
  issues: CloseoutIssue[];
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

function issueLane(issue: EntryIssue): IssueLane {
  if (isBootIssueCode(issue.code)) {
    return "boot";
  }
  if (isSmokeIssueCode(issue.code)) {
    return "verify";
  }
  if (isReconcileIssueCode(issue.code)) {
    return "queue";
  }
  if (issue.code === "missing-readme" || isDocsIssueCode(issue.code)) {
    return "docs";
  }
  return "boot";
}

function issueRank(lane: IssueLane): number {
  if (lane === "boot") {
    return 0;
  }
  if (lane === "verify") {
    return 1;
  }
  if (lane === "review") {
    return 2;
  }
  if (lane === "queue") {
    return 3;
  }
  return 4;
}

function primaryLaneRank(lane: PrimaryLane): number {
  if (lane === "boot-fix-first") {
    return 0;
  }
  if (lane === "verify-after-edit") {
    return 1;
  }
  if (lane === "review-flag") {
    return 2;
  }
  if (lane === "review-blocked") {
    return 3;
  }
  if (lane === "docs-only") {
    return 4;
  }
  return 5;
}

function choosePrimaryLane(issues: CloseoutIssue[], changeKind: ChangeKind, dirtyReason: DirtyReason, reviewLane: ReviewFreshnessLane | "none"): PrimaryLane {
  if (issues.some((issue) => issue.lane === "boot")) {
    return "boot-fix-first";
  }
  if (changeKind === "content-change") {
    return "verify-after-edit";
  }
  if (dirtyReason === "existing-edit" && reviewLane === "flag-after-edit") {
    return "review-flag";
  }
  if (reviewLane === "needs-feedback" || reviewLane === "review-missing") {
    return "review-blocked";
  }
  if (changeKind === "readme-only") {
    return "docs-only";
  }
  return "clean";
}

function buildEntries(
  dirtyMap: Map<string, { paths: Set<string>; dirtyReason: DirtyReason }>,
  slugFilter?: string,
): CloseoutEntry[] {
  const todoRecords = parseTodoRecords(TODO_PATH);
  const queueSnapshot = buildQueueSnapshot(ROOT, todoRecords);
  const reviewMap = new Map(buildReviewFreshnessEntries({ slug: slugFilter }).map((entry) => [entry.slug, entry]));
  const reportMap = new Map(buildReports(ROOT, todoRecords, slugFilter).map((report) => [report.slug, report]));
  const queueOnlyMap = new Map(
    buildQueueOnlyReports(todoRecords, new Set(queueSnapshot.playableFolders))
      .filter((report) => !slugFilter || report.slug === slugFilter)
      .map((report) => [report.slug, report]),
  );

  return Array.from(dirtyMap.entries())
    .map(([slug, details]) => {
      const files = Array.from(details.paths).sort((left, right) => left.localeCompare(right));
      const report = reportMap.get(slug);
      const queueOnly = queueOnlyMap.get(slug);
      const review = reviewMap.get(slug);
      const queueState = report?.queueState ?? review?.queueState ?? queueOnly?.queueState ?? "untracked";
      const folderPresent = queueSnapshot.playableFolders.includes(slug);
      const changeKind: ChangeKind = isReadmeOnly(slug, files) ? "readme-only" : "content-change";
      const smokeStatus = folderPresent ? inspectSmokeArtifacts(ROOT, slug) : { kind: "missing" as const };
      const issues: CloseoutIssue[] = [];

      for (const issue of queueOnly?.issues ?? []) {
        issues.push({ lane: "queue", detail: `${issue.code}: ${issue.detail}` });
      }

      const reportIssues = report?.issues
        .slice()
        .sort((left, right) => {
          const rank = issueRank(issueLane(left)) - issueRank(issueLane(right));
          if (rank !== 0) {
            return rank;
          }
          return left.code.localeCompare(right.code);
        }) ?? [];

      for (const issue of reportIssues) {
        issues.push({ lane: issueLane(issue), detail: `${issue.code}: ${issue.detail}` });
      }

      if (changeKind === "content-change") {
        issues.push({ lane: "verify", detail: "content changed in existing browser-playable files; refresh browser proof before closeout" });
      } else {
        issues.push({ lane: "docs", detail: "README-only edit; browser verify is optional unless launch or controls text changed" });
      }

      if (details.dirtyReason === "existing-edit" && review?.lane === "flag-after-edit") {
        issues.push({ lane: "review", detail: `set needsAdditionalFeedback true for ${slug} before finish because existing files changed` });
      } else if (review?.lane === "needs-feedback") {
        issues.push({ lane: "review", detail: `current review evidence for ${slug} is blocked until fresh feedback clears needsAdditionalFeedback` });
      } else if (review?.lane === "review-missing") {
        issues.push({ lane: "review", detail: `review row missing for ${slug}; do not use player feedback as evidence yet` });
      }

      const uniqueIssues = issues.filter((issue, index, list) =>
        list.findIndex((entry) => entry.lane === issue.lane && entry.detail === issue.detail) === index,
      );
      uniqueIssues.sort((left, right) => {
        const rank = issueRank(left.lane) - issueRank(right.lane);
        if (rank !== 0) {
          return rank;
        }
        return left.detail.localeCompare(right.detail);
      });

      const evidence: string[] = [
        `change: ${details.dirtyReason}, ${changeKind}`,
        `review: ${review?.reviewSummary ?? "missing review row"}`,
      ];

      if (smokeStatus.kind === "present") {
        evidence.push(`latest smoke: ./..local/${smokeStatus.latestSmokeName}`);
      } else if (folderPresent) {
        evidence.push(`smoke proof not found under ./.local for ${slug}`);
      } else {
        evidence.push(`playable folder missing for ${slug}`);
      }

      const nextSteps: string[] = [];
      const primaryLane = choosePrimaryLane(uniqueIssues, changeKind, details.dirtyReason, review?.lane ?? "none");
      if (primaryLane === "boot-fix-first") {
        nextSteps.push(`Repair direct browser boot in ./games/${slug}/ before any closeout verification.`);
      } else if (primaryLane === "verify-after-edit") {
        nextSteps.push(`Run browser verification for ./games/${slug}/ after the edit lands.`);
        nextSteps.push(`Save fresh proof to one of: ${buildProofTargets(slug).join(" | ")}.`);
      } else if (primaryLane === "review-flag") {
        nextSteps.push(`Apply needsAdditionalFeedback true for ${slug} before finishing this run.`);
      } else if (primaryLane === "review-blocked") {
        nextSteps.push(`Do not use current review evidence for ${slug} until fresh feedback clears or replaces it.`);
      } else if (primaryLane === "docs-only") {
        nextSteps.push("Treat this as docs-only closeout unless README changes launch facts that need browser confirmation.");
      } else {
        nextSteps.push("No closeout blocker detected from current dirty tree.");
      }

      if (queueOnly) {
        nextSteps.push(`Reconcile queue coverage for ${slug} before treating closure as complete.`);
      }

      const commands = [
        `bun.cmd .agents/skills/catalog-sweep/scripts/maintenance_packet.ts --slug ${slug}`,
        `bun.cmd .agents/skills/catalog-sweep/scripts/dirty_verify_pack.ts --slug ${slug}`,
      ];

      if (details.dirtyReason === "existing-edit" && review?.lane === "flag-after-edit") {
        commands.push(`bun.cmd .agents/skills/catalog-sweep/scripts/review_flag_sync.ts --slug ${slug}`);
        commands.push(`bun.cmd .agents/skills/catalog-sweep/scripts/review_flag_sync.ts --slug ${slug} --apply`);
      } else {
        commands.push(`bun.cmd .agents/skills/catalog-sweep/scripts/review_freshness_pack.ts --slug ${slug}`);
      }

      if (changeKind === "readme-only") {
        commands.push(`bun.cmd .agents/skills/catalog-sweep/scripts/readme_rewrite_starter.ts --slug ${slug}`);
      }
      if (!folderPresent || queueOnly) {
        commands.push(`bun.cmd .agents/skills/catalog-sweep/scripts/reconcile_packet.ts --slug ${slug}`);
      }

      return {
        slug,
        queueState,
        dirtyReason: details.dirtyReason,
        changeKind,
        primaryLane,
        reviewLane: review?.lane ?? "none",
        reviewSummary: review?.reviewSummary ?? "missing review row",
        files,
        issues: uniqueIssues,
        evidence,
        nextSteps,
        commands,
        proofTargets: buildProofTargets(slug),
      } satisfies CloseoutEntry;
    })
    .sort((left, right) => {
      const rank = primaryLaneRank(left.primaryLane) - primaryLaneRank(right.primaryLane);
      if (rank !== 0) {
        return rank;
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

function buildLearning(entries: CloseoutEntry[]): string {
  const bootCount = entries.filter((entry) => entry.primaryLane === "boot-fix-first").length;
  const verifyCount = entries.filter((entry) => entry.primaryLane === "verify-after-edit").length;
  const reviewCount = entries.filter((entry) => entry.primaryLane === "review-flag").length;
  const docsCount = entries.filter((entry) => entry.primaryLane === "docs-only").length;

  if (entries.length === 0) {
    return "- Catalog throughput improves when touched-slug closeout packets can record a clean no-work pass, because the next operator does not have to reopen dirty-tree triage just to confirm no edited catalog slugs need closure.";
  }

  return `- Catalog throughput improves when one touched-slug closeout packet leads with issues, review-flag commands, and proof targets (${bootCount} boot, ${verifyCount} verify, ${reviewCount} reflag, ${docsCount} docs-only), because end-of-run closure stops bouncing between dirty-verify and per-slug maintenance helpers.`;
}

function renderText(entries: CloseoutEntry[], durableLearning: string): string {
  const lines = [
    "# Dirty Closeout Packet",
    "",
    `dirty slugs: ${entries.length}`,
    `boot-fix-first: ${entries.filter((entry) => entry.primaryLane === "boot-fix-first").length}`,
    `verify-after-edit: ${entries.filter((entry) => entry.primaryLane === "verify-after-edit").length}`,
    `review-flag: ${entries.filter((entry) => entry.primaryLane === "review-flag").length}`,
    `review-blocked: ${entries.filter((entry) => entry.primaryLane === "review-blocked").length}`,
    `docs-only: ${entries.filter((entry) => entry.primaryLane === "docs-only").length}`,
    "",
  ];

  if (entries.length === 0) {
    lines.push("- No dirty catalog slugs matched current queue or playable folders.");
  }

  for (const entry of entries) {
    lines.push(`## ${entry.slug}`);
    lines.push("");
    lines.push(`- closeout lane: ${entry.primaryLane}`);
    lines.push(`- queue: ${entry.queueState}`);
    lines.push(`- review lane: ${entry.reviewLane}`);
    lines.push(`- dirty: ${entry.dirtyReason}`);
    lines.push(`- change kind: ${entry.changeKind}`);
    lines.push("- issues:");
    for (const issue of entry.issues) {
      lines.push(`  - ${issue.lane}: ${issue.detail}`);
    }
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
    if (entry.primaryLane === "boot-fix-first" || entry.primaryLane === "verify-after-edit") {
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
            bootFixFirst: entries.filter((entry) => entry.primaryLane === "boot-fix-first").length,
            verifyAfterEdit: entries.filter((entry) => entry.primaryLane === "verify-after-edit").length,
            reviewFlag: entries.filter((entry) => entry.primaryLane === "review-flag").length,
            reviewBlocked: entries.filter((entry) => entry.primaryLane === "review-blocked").length,
            docsOnly: entries.filter((entry) => entry.primaryLane === "docs-only").length,
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
