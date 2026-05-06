import type {
  RunDiagnosticsFailureBreakdown,
  RunDiagnosticsReport,
  RunDiagnosticsWindowDays,
  RunFailureCategory
} from "../../shared/protocol";
import { isLifecycleFailureCategory } from "./run-failure-classification";
import type { WorkspaceRepository, RunDiagnosticsQueryReport } from "./workspace-repository";

const LIFECYCLE_SHARE_EXCLUDED_CATEGORIES = new Set<RunFailureCategory>(["manual-abort", "shutdown-interrupt"]);

export function buildRunDiagnosticsReport(
  repository: WorkspaceRepository,
  windowDays: RunDiagnosticsWindowDays = 7,
  now: Date = new Date()
): RunDiagnosticsReport {
  const queryReport = repository.getRunDiagnosticsReport(windowDays);
  const backgroundJobs = repository.loadBackgroundJobsState().jobs;
  const generatedAt = now.toISOString();
  const totalFailuresBySource = summarizeFailuresBySource(queryReport);
  const backgroundFailureCount = totalFailuresBySource.get("background-job-run") ?? 0;
  const backgroundRows = queryReport.failureRows.filter((row) => row.sourceType === "background-job-run");
  const acceptedLifecycleRows = backgroundRows.filter((row) => !LIFECYCLE_SHARE_EXCLUDED_CATEGORIES.has(row.failureCategory));
  const lifecycleFailureCount = acceptedLifecycleRows
    .filter((row) => isLifecycleFailureCategory(row.failureCategory))
    .reduce((total, row) => total + row.count, 0);
  const lifecycleFailureShare = toShare(
    lifecycleFailureCount,
    acceptedLifecycleRows.reduce((total, row) => total + row.count, 0)
  );
  const dominantBackgroundFailureCategory = resolveDominantBackgroundFailureCategory(backgroundRows);
  const activeBackoffJobRows = backgroundJobs
    .filter((job) => job.status === "enabled" && isFutureTimestamp(job.backoffUntil, now))
    .map((job) => ({
      jobId: job.id,
      jobName: job.name,
      assistantId: job.assistantId,
      consecutiveFailureCount: job.consecutiveFailureCount ?? 0,
      backoffUntil: job.backoffUntil!,
      lastFailureCategory: job.lastFailureCategory
    }))
    .sort((left, right) => left.backoffUntil.localeCompare(right.backoffUntil) || right.consecutiveFailureCount - left.consecutiveFailureCount);

  return {
    windowDays,
    generatedAt,
    summary: {
      activeBackoffJobs: activeBackoffJobRows.length,
      questionPersistConflictCount: sumFailureCount(queryReport.failureRows, "question-persist-conflict"),
      agentEmptyResponseCount: queryReport.failureRows
        .filter((row) => row.sourceType === "agent-run")
        .filter((row) => row.failureCategory === "empty-response")
        .reduce((total, row) => total + row.count, 0),
      backgroundFailureCount,
      lifecycleFailureCount,
      lifecycleFailureShare,
      dominantBackgroundFailureCategory
    },
    topPromptHashes: queryReport.topPromptHashes,
    promptSizeByOwner: queryReport.promptSizeByOwner,
    failureBreakdown: buildFailureBreakdown(queryReport, totalFailuresBySource),
    dailyFailureSeries: queryReport.failureRows
      .map((row) => ({
        day: row.day,
        sourceType: row.sourceType,
        failureCategory: row.failureCategory,
        count: row.count,
        jobId: row.jobId
      }))
      .sort((left, right) => right.day.localeCompare(left.day) || right.count - left.count),
    activeBackoffJobRows
  };
}

function summarizeFailuresBySource(queryReport: RunDiagnosticsQueryReport) {
  const totals = new Map<RunDiagnosticsFailureBreakdown["sourceType"], number>();
  for (const row of queryReport.failureRows) {
    totals.set(row.sourceType, (totals.get(row.sourceType) ?? 0) + row.count);
  }
  return totals;
}

function buildFailureBreakdown(
  queryReport: RunDiagnosticsQueryReport,
  totalFailuresBySource: Map<RunDiagnosticsFailureBreakdown["sourceType"], number>
): RunDiagnosticsFailureBreakdown[] {
  const grouped = new Map<string, Omit<RunDiagnosticsFailureBreakdown, "share">>();
  for (const row of queryReport.failureRows) {
    const key = [row.sourceType, row.failureCategory, row.assistantId ?? "", row.jobId ?? ""].join("|");
    const current = grouped.get(key);
    if (current) {
      current.count += row.count;
      continue;
    }
    grouped.set(key, {
      sourceType: row.sourceType,
      failureCategory: row.failureCategory,
      count: row.count,
      assistantId: row.assistantId,
      jobId: row.jobId
    });
  }

  return [...grouped.values()]
    .map((row) => ({
      ...row,
      share: toShare(row.count, totalFailuresBySource.get(row.sourceType) ?? 0)
    }))
    .sort((left, right) => {
      if (left.sourceType !== right.sourceType) {
        return left.sourceType.localeCompare(right.sourceType);
      }
      return right.count - left.count || left.failureCategory.localeCompare(right.failureCategory);
    });
}

function resolveDominantBackgroundFailureCategory(rows: RunDiagnosticsQueryReport["failureRows"]) {
  const counts = new Map<RunFailureCategory, number>();
  for (const row of rows) {
    counts.set(row.failureCategory, (counts.get(row.failureCategory) ?? 0) + row.count);
  }
  const ordered = [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  return ordered[0]?.[0];
}

function sumFailureCount(rows: RunDiagnosticsQueryReport["failureRows"], category: RunFailureCategory) {
  return rows.filter((row) => row.failureCategory === category).reduce((total, row) => total + row.count, 0);
}

function isFutureTimestamp(value: string | undefined, now: Date) {
  if (!value) {
    return false;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > now.getTime();
}

function toShare(count: number, total: number) {
  if (total <= 0) {
    return 0;
  }
  return Number((count / total).toFixed(4));
}
