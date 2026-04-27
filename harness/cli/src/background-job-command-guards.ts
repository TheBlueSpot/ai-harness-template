import type { BackgroundJob, BackgroundJobRun, ProjectId } from "../../shared/protocol";
import type { WorkspaceRepository } from "./workspace-repository";

type BackgroundRunAction = "stop" | "retry" | "approve" | "reject";

const terminalStatuses = new Set<BackgroundJobRun["status"]>(["succeeded", "failed", "cancelled", "skipped"]);

export function requireBackgroundJobForProject(repository: WorkspaceRepository, projectId: ProjectId, jobId: string): BackgroundJob {
  const job = repository.getBackgroundJob(jobId);
  if (!job || job.projectId !== projectId) {
    throw new Error(`Unknown background job for project: ${jobId}`);
  }

  return job;
}

export function requireBackgroundRunForProject(repository: WorkspaceRepository, projectId: ProjectId, runId: string): BackgroundJobRun {
  const run = repository.getBackgroundJobRun(runId);
  if (!run || run.projectId !== projectId) {
    throw new Error(`Unknown background run for project: ${runId}`);
  }

  return run;
}

export function assertBackgroundRunTransition(run: BackgroundJobRun, action: BackgroundRunAction) {
  switch (action) {
    case "stop":
      if (terminalStatuses.has(run.status)) {
        throw new Error(`Cannot stop terminal background run ${run.id} with status ${run.status}`);
      }
      return;
    case "retry":
      if (!(terminalStatuses.has(run.status) || run.status === "awaiting-user-input")) {
        throw new Error(`Cannot retry background run ${run.id} with status ${run.status}`);
      }
      return;
    case "approve":
      if (run.status !== "awaiting-approval" || run.approvalStatus !== "pending") {
        throw new Error(`Cannot approve background run ${run.id} with status ${run.status}`);
      }
      return;
    case "reject":
      if (run.status !== "awaiting-approval" || run.approvalStatus !== "pending") {
        throw new Error(`Cannot reject background run ${run.id} with status ${run.status}`);
      }
      return;
  }
}
