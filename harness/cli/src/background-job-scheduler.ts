import type { BackgroundJob, BackgroundJobRun, BackgroundJobRunStatus } from "../../shared/protocol";
import { getDueScheduleAdvance } from "./background-job-schedule";
import { assertAssistantRunnableForLaunch } from "./assistant-launch-gate";
import { classifyRunFailure, isBackoffEligibleFailureCategory } from "./run-failure-classification";
import { WorkspaceRepository } from "./workspace-repository";

export const DEFAULT_BACKGROUND_RUN_MAX_MS = 30 * 60 * 1000;
export const DEFAULT_BACKGROUND_RUN_NO_PROGRESS_MS = 10 * 60 * 1000;

type BackgroundJobSchedulerOptions = {
  repository: WorkspaceRepository;
  intervalMs?: number;
  isRunLive?: (run: BackgroundJobRun) => boolean;
  onRunsTimingOut?: (runs: BackgroundJobRun[]) => Promise<void> | void;
  onRunsRepaired?: (runs: BackgroundJobRun[]) => Promise<void> | void;
  repairActiveRuns?: (now: Date) => Promise<BackgroundJobRun[]> | BackgroundJobRun[];
  onRunQueued?: (run: BackgroundJobRun, job: BackgroundJob) => Promise<void> | void;
  onTickFailed?: (error: unknown) => void;
};

type DueJob = {
  job: BackgroundJob;
  advance: ReturnType<typeof getDueScheduleAdvance>;
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

    void this.tick(true).catch((error) => this.options.onTickFailed?.(error));
    this.timer = setInterval(() => {
      void this.tick(false).catch((error) => this.options.onTickFailed?.(error));
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
        this.options.repository.setBackgroundSchedulerHeartbeat();
        return;
      }

      const now = new Date();
      const nowIso = now.toISOString();
      this.options.repository.setBackgroundSchedulerHeartbeat(now);

      const timingOutRuns = this.getRunsTimingOut(now);
      if (timingOutRuns.length > 0) {
        await this.options.onRunsTimingOut?.(timingOutRuns);
      }

      const repairedRuns = this.options.repairActiveRuns
        ? await this.options.repairActiveRuns(now)
        : this.options.repository.repairInterruptedBackgroundJobRuns({
            isRunLive: this.options.isRunLive,
            now,
            maxRunMs: DEFAULT_BACKGROUND_RUN_MAX_MS,
            noProgressMs: DEFAULT_BACKGROUND_RUN_NO_PROGRESS_MS
          });
      if (repairedRuns.length > 0) {
        await this.options.onRunsRepaired?.(repairedRuns);
      }

      const jobs = this.options.repository.loadBackgroundJobsState().jobs.filter((job) => job.status === "enabled");
      const overloadedAssistants = this.resolveOverloadedAssistants(jobs);

      for (const loadedJob of jobs) {
        const job = this.options.repository.repairBackgroundJobReferences(loadedJob.id) ?? loadedJob;
        if (job.status !== "enabled") {
          continue;
        }
        const advance = getDueScheduleAdvance(job.schedule, now);
        const activeRun = this.options.repository.getActiveBackgroundJobRuns(job.id)[0];
        const overloaded = Boolean(job.assistantId && overloadedAssistants.has(job.assistantId));
        if (activeRun) {
          this.markActiveJob(job, activeRun, nowIso, overloaded);
          continue;
        }

        if (job.assistantId) {
          try {
            assertAssistantRunnableForLaunch(this.options.repository, job.assistantId);
          } catch (error) {
            const message = error instanceof Error ? error.message : "Assistant is not runnable";
            this.options.repository.updateBackgroundJobSchedulerState(job.id, {
              schedulerStatus: "blocked",
              schedulerDetail: message,
              blockedReason: message,
              schedulerOverloaded: overloaded,
              lastSchedulerCheckAt: nowIso
            });
            continue;
          }
        }

        if (job.backoffUntil) {
          const backoffAt = Date.parse(job.backoffUntil);
          if (Number.isFinite(backoffAt) && backoffAt > now.getTime()) {
            this.options.repository.updateBackgroundJobSchedulerState(job.id, {
              schedulerStatus: "blocked",
              schedulerDetail: `Backoff until ${job.backoffUntil}`,
              blockedReason: `Failure backoff active until ${job.backoffUntil}`,
              consecutiveFailureCount: job.consecutiveFailureCount,
              backoffUntil: job.backoffUntil,
              lastFailureCategory: job.lastFailureCategory,
              schedulerOverloaded: overloaded,
              lastSchedulerCheckAt: nowIso
            });
            continue;
          }
        }

        if (!advance.due) {
          this.options.repository.updateBackgroundJobSchedulerState(job.id, {
            schedulerStatus: "idle",
            schedulerDetail: advance.nextRunAt ? `Next run ${advance.nextRunAt}` : undefined,
            consecutiveFailureCount: job.consecutiveFailureCount,
            backoffUntil: job.backoffUntil,
            lastFailureCategory: job.lastFailureCategory,
            schedulerOverloaded: overloaded,
            lastSchedulerCheckAt: nowIso
          });
          continue;
        }

        this.queueDueJob({ job, advance }, isStartup, nowIso, overloaded);
      }
    } finally {
      this.running = false;
    }
  }

  private getRunsTimingOut(now: Date) {
    return this.options.repository.getActiveBackgroundJobRuns().filter((run) => {
      if (run.status !== "running" || !this.options.isRunLive?.(run)) {
        return false;
      }
      return getRunAgeMs(run, now) >= DEFAULT_BACKGROUND_RUN_MAX_MS || getRunLastProgressAgeMs(run, now) >= DEFAULT_BACKGROUND_RUN_NO_PROGRESS_MS;
    });
  }

  private resolveOverloadedAssistants(jobs: BackgroundJob[]) {
    const loadByAssistant = new Map<string, number>();
    for (const job of jobs) {
      if (!job.assistantId) {
        continue;
      }
      const intervalMs = resolveScheduleIntervalMs(job, new Date());
      if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
        continue;
      }
      const durations = this.options.repository.getRecentSuccessfulBackgroundJobRunDurationsMs(job.id, 10);
      const medianDuration = median(durations);
      if (!medianDuration) {
        continue;
      }
      loadByAssistant.set(job.assistantId, (loadByAssistant.get(job.assistantId) ?? 0) + medianDuration / intervalMs);
    }
    return new Set([...loadByAssistant.entries()].filter((entry) => entry[1] > 1).map(([assistantId]) => assistantId));
  }

  private markActiveJob(job: BackgroundJob, run: BackgroundJobRun, nowIso: string, overloaded: boolean) {
    this.options.repository.updateBackgroundJobSchedulerState(job.id, {
      schedulerStatus: run.status === "queued" ? "queued" : run.status === "running" ? "running" : "blocked",
      schedulerDetail: `Blocked by ${run.status} run ${run.id}`,
      blockedReason: `Job already has ${run.status} run ${run.id}`,
      schedulerActiveRunId: run.id,
      schedulerActiveRunStartedAt: run.startedAt,
      schedulerLastProgressAt: run.lastHeartbeatAt ?? run.updatedAt,
      schedulerOverloaded: overloaded,
      lastSchedulerCheckAt: nowIso
    });
  }

  private queueDueJob(entry: DueJob, isStartup: boolean, nowIso: string, overloaded: boolean) {
    const { job, advance } = entry;
    this.options.repository.updateBackgroundJobSchedulerState(job.id, {
      schedulerStatus: "due",
      schedulerDetail: `Due at ${job.nextRunAt ?? advance.nextRunAt ?? nowIso}`,
      schedulerOverloaded: overloaded,
      lastSchedulerCheckAt: nowIso
    });
    if (this.options.repository.getActiveBackgroundJobRuns(job.id)[0]) {
      return;
    }

    const triggerSource = isStartup ? "startup-catchup" : "schedule";
    this.options.repository.updateBackgroundJobSchedule(job.id, {
      schedule: advance.nextSchedule,
      nextRunAt: advance.nextRunAt,
      lastRunAt: nowIso
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
    this.options.repository.updateBackgroundJobSchedulerState(job.id, {
      schedulerStatus: queuedRun.status === "queued" ? "queued" : "blocked",
      schedulerDetail: queuedRun.status === "queued" ? `Queued run ${queuedRun.id}` : `Waiting for approval ${queuedRun.id}`,
      blockedReason: queuedRun.status === "queued" ? undefined : `Waiting for approval ${queuedRun.id}`,
      schedulerQueuePosition: 1,
      schedulerQueueReason: queuedRun.status === "queued" ? "Queue #1: launching now" : `Queue #1: waiting for approval ${queuedRun.id}`,
      schedulerActiveRunId: queuedRun.id,
      schedulerActiveRunStartedAt: queuedRun.startedAt,
      schedulerLastProgressAt: queuedRun.lastHeartbeatAt ?? queuedRun.updatedAt,
      schedulerOverloaded: overloaded,
      lastSchedulerCheckAt: nowIso
    });
    const handleLaunchFailure = (error: unknown) => {
      const failureMessage = error instanceof Error ? error.message : "Unknown background job launch failure";
      const currentRun = this.options.repository.getBackgroundJobRun(queuedRun.id);
      if (currentRun?.timedOutAt && currentRun.status !== "queued" && currentRun.status !== "running") {
        this.options.repository.updateBackgroundJobSchedulerState(job.id, {
          schedulerStatus: "blocked",
          schedulerDetail: currentRun.failureMessage ?? failureMessage,
          blockedReason: currentRun.failureMessage ?? failureMessage,
          consecutiveFailureCount: this.options.repository.getBackgroundJob(job.id)?.consecutiveFailureCount,
          backoffUntil: this.options.repository.getBackgroundJob(job.id)?.backoffUntil,
          lastFailureCategory: this.options.repository.getBackgroundJob(job.id)?.lastFailureCategory,
          schedulerOverloaded: overloaded,
          lastSchedulerCheckAt: new Date().toISOString()
        });
        return;
      }
      const failureCategory = classifyRunFailure({ message: failureMessage });
      this.options.repository.setBackgroundJobRunStatus(queuedRun.id, "failed", {
        failureMessage,
        failureCategory
      });
      this.options.repository.appendBackgroundJobRunEvent(queuedRun.id, "failed", "Background run failed", failureMessage);
      if (isBackoffEligibleFailureCategory(failureCategory)) {
        this.options.repository.recordBackgroundJobFailure(job.id, failureCategory);
      } else {
        this.options.repository.clearBackgroundJobFailureTracking(job.id);
      }
      this.options.repository.updateBackgroundJobSchedulerState(job.id, {
        schedulerStatus: "blocked",
        schedulerDetail: failureMessage,
        blockedReason: failureMessage,
        consecutiveFailureCount: this.options.repository.getBackgroundJob(job.id)?.consecutiveFailureCount,
        backoffUntil: this.options.repository.getBackgroundJob(job.id)?.backoffUntil,
        lastFailureCategory: this.options.repository.getBackgroundJob(job.id)?.lastFailureCategory,
        schedulerOverloaded: overloaded,
        lastSchedulerCheckAt: new Date().toISOString()
      });
    };
    try {
      void Promise.resolve(this.options.onRunQueued?.(this.options.repository.getBackgroundJobRun(queuedRun.id)!, job)).catch(
        handleLaunchFailure
      );
    } catch (error) {
      handleLaunchFailure(error);
    }
  }
}

function resolveJobNextRunAt(job: BackgroundJob) {
  if (job.nextRunAt) {
    return job.nextRunAt;
  }
  if (job.schedule.type === "interval" || job.schedule.type === "cron") {
    return job.schedule.nextRunAt;
  }
  return job.schedule.consumedAt ? undefined : job.schedule.runAt;
}

function resolveScheduleIntervalMs(job: BackgroundJob, now: Date) {
  if (job.schedule.type === "interval") {
    return job.schedule.intervalSeconds * 1000;
  }
  if (job.schedule.type === "cron") {
    const anchor = Date.parse(job.schedule.nextRunAt);
    if (!Number.isFinite(anchor)) {
      return Number.POSITIVE_INFINITY;
    }
    const advance = getDueScheduleAdvance(job.schedule, new Date(anchor + 1));
    const nextRunAt = advance.nextRunAt ? Date.parse(advance.nextRunAt) : Number.NaN;
    return Number.isFinite(nextRunAt) ? Math.max(1, nextRunAt - anchor) : Number.POSITIVE_INFINITY;
  }
  const runAt = Date.parse(job.schedule.runAt);
  return Number.isFinite(runAt) ? Math.max(1, Math.abs(runAt - now.getTime())) : Number.POSITIVE_INFINITY;
}

function getRunAgeMs(run: BackgroundJobRun, now: Date) {
  const startedAt = Date.parse(run.startedAt ?? run.queuedAt);
  return Number.isFinite(startedAt) ? Math.max(0, now.getTime() - startedAt) : 0;
}

function getRunLastProgressAgeMs(run: BackgroundJobRun, now: Date) {
  const timestamp = Date.parse(run.lastHeartbeatAt ?? run.updatedAt ?? run.startedAt ?? run.queuedAt);
  return Number.isFinite(timestamp) ? Math.max(0, now.getTime() - timestamp) : 0;
}

function median(values: number[]) {
  if (values.length === 0) {
    return undefined;
  }
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
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
