import type { BackgroundJob, BackgroundJobRun, BackgroundJobRunStatus } from "../../shared/protocol";
import { getDueScheduleAdvance } from "./background-job-schedule";
import { WorkspaceRepository } from "./workspace-repository";

type BackgroundJobSchedulerOptions = {
  repository: WorkspaceRepository;
  intervalMs?: number;
  onRunQueued?: (run: BackgroundJobRun, job: BackgroundJob) => Promise<void> | void;
};

export class BackgroundJobScheduler {
  private readonly intervalMs: number;
  private timer?: Timer;
  private running = false;

  constructor(private readonly options: BackgroundJobSchedulerOptions) {
    this.intervalMs = options.intervalMs ?? 15_000;
  }

  start() {
    if (this.timer) {
      return;
    }

    void this.tick(true);
    this.timer = setInterval(() => {
      void this.tick(false);
    }, this.intervalMs);
  }

  stop() {
    if (!this.timer) {
      return;
    }

    clearInterval(this.timer);
    this.timer = undefined;
  }

  async tick(isStartup: boolean) {
    if (this.running) {
      return;
    }

    this.running = true;
    try {
      if (this.options.repository.getGlobalExecutionPaused()) {
        return;
      }

      const now = new Date();
      const jobs = this.options.repository.loadBackgroundJobsState().jobs.filter((job) => job.status === "enabled");
      for (const job of jobs) {
        if (job.assistantId) {
          const assistant = this.options.repository.getAssistant(job.assistantId);
          if (!assistant || assistant.runState === "paused" || assistant.deletedAt) {
            continue;
          }
        }
        const triggerSource = isStartup ? "startup-catchup" : "schedule";
        const advance = getDueScheduleAdvance(job.schedule, now);
        if (!advance.due) {
          continue;
        }

        this.options.repository.updateBackgroundJobSchedule(job.id, {
          schedule: advance.nextSchedule,
          nextRunAt: advance.nextRunAt
        });
        const queuedRun = this.options.repository.createBackgroundJobRun({
          jobId: job.id,
          projectId: job.projectId,
          assistantId: job.assistantId,
          automationThreadId: job.automationThreadId,
          triggerSource,
          status: resolveQueuedStatus(job, this.options.repository.getBackgroundJobApprovalPolicyDefault()),
          riskLevel: job.riskLevel,
          approvalStatus: resolveApprovalStatus(job, this.options.repository.getBackgroundJobApprovalPolicyDefault()),
          skippedOccurrenceCount: advance.skippedOccurrenceCount
        });
        this.options.repository.appendBackgroundJobRunEvent(
          queuedRun.id,
          "queued",
          `Queued ${job.name}`,
          advance.skippedOccurrenceCount > 0 ? `Skipped ${advance.skippedOccurrenceCount} missed occurrence(s).` : undefined
        );
        await this.options.onRunQueued?.(this.options.repository.getBackgroundJobRun(queuedRun.id)!, job);
      }
    } finally {
      this.running = false;
    }
  }
}

function resolveQueuedStatus(job: BackgroundJob, policy: ReturnType<WorkspaceRepository["getBackgroundJobApprovalPolicyDefault"]>): BackgroundJobRunStatus {
  switch (policy) {
    case "allow-all":
      return "queued";
    case "allow-safe":
      return job.riskLevel === "safe" ? "queued" : "awaiting-approval";
    case "ask-risky":
      return job.riskLevel === "safe" ? "queued" : "awaiting-approval";
    case "always-ask":
    default:
      return "awaiting-approval";
  }
}

function resolveApprovalStatus(job: BackgroundJob, policy: ReturnType<WorkspaceRepository["getBackgroundJobApprovalPolicyDefault"]>) {
  switch (policy) {
    case "allow-all":
      return "approved" as const;
    case "allow-safe":
      return job.riskLevel === "safe" ? ("not-needed" as const) : ("pending" as const);
    case "ask-risky":
      return job.riskLevel === "safe" ? ("not-needed" as const) : ("pending" as const);
    case "always-ask":
    default:
      return "pending" as const;
  }
}
