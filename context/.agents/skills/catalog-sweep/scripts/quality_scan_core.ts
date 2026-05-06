import { existsSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import type { QueueState } from "./catalog_candidates";
import type { CatalogEntryReport } from "./sweep_core";
import { inspectSmokeArtifacts } from "./smoke_artifacts";
import { isBootIssueCode } from "./throughput_lanes";

export type QualityPackEntry = {
  slug: string;
  queueState: QueueState;
  lane: "capture-ready" | "refresh-browser-first" | "boot-blocked";
  evidence: string[];
  sourceFiles: string[];
  nextSteps: string[];
};

export type PlaytestStatus =
  | { kind: "missing" }
  | {
      kind: "present";
      artifacts: string[];
      latestPlaytestAt: number;
      latestPlaytestName: string;
      staleAgainstContent: boolean;
      staleAgainstSmoke: boolean;
    };

const LOCAL_ROOT = resolve(process.cwd(), ".local");

function findLatestContentAt(entryRoot: string): number | undefined {
  const queue = [entryRoot];
  let latest: number | undefined;

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || !existsSync(current)) {
      continue;
    }

    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const fullPath = resolve(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
        continue;
      }

      if (entry.name.toLowerCase().endsWith(".md")) {
        continue;
      }

      const updatedAt = statSync(fullPath).mtimeMs;
      if (latest === undefined || updatedAt > latest) {
        latest = updatedAt;
      }
    }
  }

  return latest;
}

export function inspectPlaytestStatus(root: string, slug: string): PlaytestStatus {
  if (!existsSync(LOCAL_ROOT)) {
    return { kind: "missing" };
  }

  const artifacts: string[] = [];
  const prefix = `${slug}-playtest`;

  for (const entry of readdirSync(LOCAL_ROOT, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.startsWith(prefix)) {
      artifacts.push(entry.name);
      continue;
    }

    if (!entry.isDirectory()) {
      continue;
    }

    const childRoot = resolve(LOCAL_ROOT, entry.name);
    for (const child of readdirSync(childRoot, { withFileTypes: true })) {
      if (!child.isFile() || !child.name.startsWith(prefix)) {
        continue;
      }
      artifacts.push(`${entry.name}/${child.name}`);
    }
  }

  if (artifacts.length === 0) {
    return { kind: "missing" };
  }

  const latest = artifacts
    .map((artifact) => ({
      artifact,
      updatedAt: statSync(resolve(LOCAL_ROOT, artifact)).mtimeMs,
    }))
    .sort((left, right) => right.updatedAt - left.updatedAt)[0];
  const smokeStatus = inspectSmokeArtifacts(root, slug);
  const latestContentAt = findLatestContentAt(resolve(root, slug));

  return {
    kind: "present",
    artifacts: artifacts.sort((left, right) => left.localeCompare(right)),
    latestPlaytestAt: latest.updatedAt,
    latestPlaytestName: latest.artifact,
    staleAgainstContent: latestContentAt !== undefined && latest.updatedAt < latestContentAt,
    staleAgainstSmoke: smokeStatus.kind === "present" && latest.updatedAt < smokeStatus.latestSmokeAt,
  };
}

export function rankQualityPackEntry(entry: QualityPackEntry): number {
  if (entry.lane === "capture-ready") {
    return 0;
  }
  if (entry.lane === "refresh-browser-first") {
    return 1;
  }
  return 2;
}

export function matchesQualityGroup(
  group: "ready" | "refresh" | "boot" | "all",
  entry: QualityPackEntry,
): boolean {
  if (group === "all") {
    return true;
  }
  if (group === "ready") {
    return entry.lane === "capture-ready";
  }
  if (group === "refresh") {
    return entry.lane === "refresh-browser-first";
  }
  return entry.lane === "boot-blocked";
}

export function qualityGroupLabel(group: "ready" | "refresh" | "boot" | "all"): string {
  if (group === "ready") {
    return "capture-ready quality scans";
  }
  if (group === "refresh") {
    return "refresh browser proof first";
  }
  if (group === "boot") {
    return "boot blocked";
  }
  return "all quality-scan prep";
}

export function chooseDefaultQualityGroup(entries: QualityPackEntry[]): "ready" | "refresh" | "boot" | "all" {
  if (entries.some((entry) => entry.lane === "capture-ready")) {
    return "ready";
  }
  if (entries.some((entry) => entry.lane === "refresh-browser-first")) {
    return "refresh";
  }
  if (entries.some((entry) => entry.lane === "boot-blocked")) {
    return "boot";
  }
  return "all";
}

export function buildQualityEntry(root: string, report: CatalogEntryReport): QualityPackEntry | null {
  const bootIssues = report.issues.filter((issue) => isBootIssueCode(issue.code));
  const smokeStatus = inspectSmokeArtifacts(root, report.slug);
  const playtestStatus = inspectPlaytestStatus(root, report.slug);

  if (bootIssues.length > 0) {
    return {
      slug: report.slug,
      queueState: report.queueState,
      lane: "boot-blocked",
      evidence: bootIssues.map((issue) => `${issue.code}: ${issue.detail}`),
      sourceFiles: ["./todo.md", `./${report.slug}/index.html`, "./.local/"],
      nextSteps: [
        `Repair direct browser boot in ./${report.slug}/ before quality review.`,
        "Rerun local browser smoke after boot is clean.",
        `Capture ./.local/${report.slug}-playtest.json only after browser proof is current.`,
      ],
    };
  }

  if (smokeStatus.kind === "missing" || smokeStatus.stale) {
    const evidence =
      smokeStatus.kind === "missing"
        ? ["missing-smoke-proof: no current browser proof under ./.local"]
        : [`stale-smoke-proof: ${smokeStatus.latestSmokeName} predates ${smokeStatus.latestContentName}`];
    return {
      slug: report.slug,
      queueState: report.queueState,
      lane: "refresh-browser-first",
      evidence,
      sourceFiles: ["./todo.md", `./${report.slug}/index.html`, `./${report.slug}/README.md`, "./.local/"],
      nextSteps: [
        `Run a fresh browser smoke for ./${report.slug}/ and save proof under ./.local.`,
        `After smoke is current, use playtest_capture_pack.ts or save ./.local/${report.slug}-playtest.json directly.`,
        "Feed that JSON through playtest-evidence-capture before any focused quality audit.",
      ],
    };
  }

  if (playtestStatus.kind === "missing" || playtestStatus.staleAgainstContent || playtestStatus.staleAgainstSmoke) {
    const evidence =
      playtestStatus.kind === "missing"
        ? ["missing-playtest-evidence: no reusable playtest JSON or report found under ./.local"]
        : [
            `playtest-artifact: latest is ${playtestStatus.latestPlaytestName}`,
            ...(playtestStatus.staleAgainstSmoke
              ? ["stale-against-smoke: latest playtest predates the latest browser smoke proof"]
              : []),
            ...(playtestStatus.staleAgainstContent
              ? ["stale-against-content: latest playtest predates current non-markdown entry content"]
              : []),
          ];
    const sourceFiles = ["./todo.md", `./${report.slug}/index.html`, `./${report.slug}/README.md`, "./.local/"];
    if (playtestStatus.kind === "present") {
      sourceFiles.push(...playtestStatus.artifacts.map((artifact) => `./.local/${artifact}`));
    }
    return {
      slug: report.slug,
      queueState: report.queueState,
      lane: "capture-ready",
      evidence,
      sourceFiles,
      nextSteps: [
        `Run playtest_capture_pack.ts for ./${report.slug}/ to get the exact capture packet and output paths.`,
        `Save one short direct browser session as ./.local/${report.slug}-playtest.json.`,
        "Feed that JSON through playtest-evidence-capture, then drive one focused audit lane from the starter output.",
      ],
    };
  }

  return null;
}
