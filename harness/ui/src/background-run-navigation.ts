import type { BackgroundJobRun } from "../../shared/protocol";
import { harnessStore, type HarnessViewState, type JobsRunFilter } from "./harness-store";

export function openBackgroundRunInJobsPane(state: HarnessViewState, runId: string, jobId?: string) {
  const run = state.backgroundJobs.runs.find((entry) => entry.id === runId);
  const runFilter = getBackgroundRunFilter(run);
  harnessStore.setActiveSurface("background-jobs");
  harnessStore.closeBackgroundJobDetailsDialog();
  if (runFilter) {
    harnessStore.setJobsRunFilter(runFilter);
  }
  harnessStore.setJobsPanePreferences({
    segment: "inbox",
    selectedRunId: runId,
    selectedJobId: jobId ?? run?.jobId,
    selectedNotificationId: undefined
  });
}

function getBackgroundRunFilter(
  run: Pick<BackgroundJobRun, "status" | "approvalStatus"> | undefined
): JobsRunFilter | undefined {
  if (!run) {
    return undefined;
  }

  if (run.status === "awaiting-approval" || run.status === "awaiting-user-input" || run.approvalStatus === "pending") {
    return "approval";
  }
  if (run.status === "queued") {
    return "queued";
  }
  if (run.status === "running") {
    return "running";
  }
  if (run.status === "failed" || run.status === "cancelled") {
    return "failed";
  }
  return "done";
}
