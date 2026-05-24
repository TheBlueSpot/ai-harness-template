import type { BackgroundJob, BackgroundJobRun, BackgroundJobRunStatus } from "../../shared/protocol";
import { getDueScheduleAdvance } from "./background-job-schedule";
import { assertAssistantRunnableForLaunch } from "./assistant-launch-gate";
import { debugLog } from "./logging";
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

type AssistantCongestion = {
  congested: boolean;
  ratio: number;
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
      const congestionByAssistant = this.resolveAssistantCongestion(jobs);
      const activeRuns = this.options.repository.getActiveBackgroundJobRuns();
      debugLog("background.scheduler.tick", {
        isStartup,
        enabledJobs: jobs.length,
        activeRuns: activeRuns.length,
        congestedAssistants: [...congestionByAssistant.values()].filter((entry) => entry.congested).length
      });

      for (const loadedJob of jobs) {
        const job = this.options.repository.repairBackgroundJobReferences(loadedJob.id) ?? loadedJob;
        if (job.status !== "enabled") {
          continue;
        }
        const advance = getDueScheduleAdvance(job.schedule, now);
        const activeRun = this.options.repository.getActiveBackgroundJobRuns(job.id)[0];
        const congestion = job.assistantId ? congestionByAssistant.get(job.assistantId) : undefined;
        const congested = Boolean(congestion?.congested);
        const congestionRatio = congestion?.ratio;
        if (activeRun) {
          this.markActiveJob(job, activeRun, nowIso, congested, congestionRatio);
          continue;
        }
        const activeExclusiveAssistantRun = job.assistantId && job.lane === "exclusive"
          ? this.getActiveExclusiveAssistantRun(job.assistantId, jobs)
          : undefined;
        if (activeExclusiveAssistantRun) {
          this.markExclusiveAssistantJobBlocked(job, activeExclusiveAssistantRun, nowIso, congested, congestionRatio);
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
              schedulerCongested: congested,
              schedulerCongestionRatio: congestionRatio,
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
              schedulerCongested: congested,
              schedulerCongestionRatio: congestionRatio,
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
            schedulerCongested: congested,
            schedulerCongestionRatio: congestionRatio,
            lastSchedulerCheckAt: nowIso
          });
          continue;
        }

        const congestionDelay = congested ? this.resolveCongestionDelay(job, now) : undefined;
        if (congestionDelay && congestionDelay.nextRunAt.getTime() > now.getTime()) {
          this.options.repository.updateBackgroundJobSchedule(job.id, {
            schedule: congestionDelay.schedule,
            nextRunAt: congestionDelay.nextRunAt.toISOString(),
            lastRunAt: job.lastRunAt
          });
          this.options.repository.updateBackgroundJobSchedulerState(job.id, {
            schedulerStatus: "idle",
            schedulerDetail: `Congested (${formatPercent(congestionRatio)}); scaled next run ${congestionDelay.nextRunAt.toISOString()}`,
            schedulerCongested: true,
            schedulerCongestionRatio: congestionRatio,
            lastSchedulerCheckAt: nowIso
          });
          debugLog("background.scheduler.congestion-delay", {
            jobId: job.id,
            assistantId: job.assistantId,
            isStartup,
            congestionRatio,
            nextRunAt: congestionDelay.nextRunAt.toISOString()
          });
          continue;
        }
        this.queueDueJob({ job, advance }, isStartup, nowIso, congested, congestionRatio);
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

  private resolveAssistantCongestion(jobs: BackgroundJob[]) {
    const loadByAssistant = new Map<string, number>();
    for (const job of jobs) {
      if (!job.assistantId || job.lane !== "exclusive") {
        continue;
      }
      const intervalMs = resolveScheduleIntervalMs(job, new Date());
      if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
        continue;
      }
      const averageDuration = this.getAverageDurationMs(job);
      if (!averageDuration) {
        continue;
      }
      loadByAssistant.set(job.assistantId, (loadByAssistant.get(job.assistantId) ?? 0) + averageDuration / intervalMs);
    }
    const maxCongestion = this.options.repository.getAssistantMaxCongestionDefault();
    return new Map([...loadByAssistant.entries()].map(([assistantId, ratio]) => [assistantId, { congested: ratio > maxCongestion, ratio }]));
  }

  private getAverageDurationMs(job: BackgroundJob) {
    const durations = this.options.repository.getRecentSuccessfulBackgroundJobRunDurationsMs(job.id, 5);
    if (durations.length < 5) {
      return undefined;
    }
    return durations.reduce((sum, duration) => sum + duration, 0) / durations.length;
  }

  private getActiveExclusiveAssistantRun(assistantId: string, jobs: BackgroundJob[]) {
    const jobsById = new Map(jobs.map((job) => [job.id, job]));
    return this.options.repository
      .getActiveBackgroundJobRunsByAssistant(assistantId)
      .find((run) => jobsById.get(run.jobId)?.lane !== "concurrent");
  }

  private markActiveJob(job: BackgroundJob, run: BackgroundJobRun, nowIso: string, congested: boolean, congestionRatio?: number) {
    const activeLeaseDetail =
      run.status === "running" && isFutureIso(run.controllerLeaseExpiresAt, nowIso)
        ? `controller lease active until ${run.controllerLeaseExpiresAt}`
        : undefined;
    this.options.repository.updateBackgroundJobSchedulerState(job.id, {
      schedulerStatus: run.status === "queued" ? "queued" : run.status === "running" ? "running" : "blocked",
      schedulerDetail: activeLeaseDetail ? `Blocked by ${run.status} run ${run.id}; ${activeLeaseDetail}` : `Blocked by ${run.status} run ${run.id}`,
      blockedReason: activeLeaseDetail ? `Job already has ${run.status} run ${run.id}; ${activeLeaseDetail}` : `Job already has ${run.status} run ${run.id}`,
      schedulerActiveRunId: run.id,
      schedulerActiveRunStartedAt: run.startedAt,
      schedulerLastProgressAt: run.lastHeartbeatAt ?? run.updatedAt,
      schedulerCongested: congested,
      schedulerCongestionRatio: congestionRatio,
      lastSchedulerCheckAt: nowIso
    });
    debugLog("background.scheduler.active-block", {
      jobId: job.id,
      runId: run.id,
      status: run.status,
      assistantId: job.assistantId,
      congested
    });
  }

  private markExclusiveAssistantJobBlocked(job: BackgroundJob, run: BackgroundJobRun, nowIso: string, congested: boolean, congestionRatio?: number) {
    const activeLeaseDetail =
      run.status === "running" && isFutureIso(run.controllerLeaseExpiresAt, nowIso)
        ? `; controller lease active until ${run.controllerLeaseExpiresAt}`
        : "";
    const detail = `Exclusive assistant lane waiting for ${run.status} run ${run.id}${activeLeaseDetail}`;
    this.options.repository.updateBackgroundJobSchedulerState(job.id, {
      schedulerStatus: "blocked",
      schedulerDetail: detail,
      blockedReason: detail,
      schedulerActiveRunId: run.id,
      schedulerActiveRunStartedAt: run.startedAt,
      schedulerLastProgressAt: run.lastHeartbeatAt ?? run.updatedAt,
      schedulerCongested: congested,
      schedulerCongestionRatio: congestionRatio,
      lastSchedulerCheckAt: nowIso
    });
    debugLog("background.scheduler.exclusive-lane-block", {
      jobId: job.id,
      assistantId: job.assistantId,
      runId: run.id,
      status: run.status,
      congested
    });
  }

  private queueDueJob(entry: DueJob, isStartup: boolean, nowIso: string, congested: boolean, congestionRatio?: number) {
    const { job, advance } = entry;
    this.options.repository.updateBackgroundJobSchedulerState(job.id, {
      schedulerStatus: "due",
      schedulerDetail: `Due at ${job.nextRunAt ?? advance.nextRunAt ?? nowIso}`,
      schedulerCongested: congested,
      schedulerCongestionRatio: congestionRatio,
      lastSchedulerCheckAt: nowIso
    });
    if (this.options.repository.getActiveBackgroundJobRuns(job.id)[0]) {
      return;
    }

    const triggerSource = isStartup ? "startup-catchup" : "schedule";
    debugLog("background.scheduler.queue", {
      jobId: job.id,
      assistantId: job.assistantId,
      triggerSource,
      skippedOccurrences: advance.skippedOccurrenceCount,
      congested
    });
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
      schedulerCongested: congested,
      schedulerCongestionRatio: congestionRatio,
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
          schedulerCongested: congested,
          schedulerCongestionRatio: congestionRatio,
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
        schedulerCongested: congested,
        schedulerCongestionRatio: congestionRatio,
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

  private resolveCongestionDelay(job: BackgroundJob, now: Date) {
    if (job.schedule.type !== "interval" || !job.lastRunAt) {
      return undefined;
    }
    const averageDuration = this.getAverageDurationMs(job);
    if (!averageDuration) {
      return undefined;
    }
    const scaledIntervalMs = Math.max(job.schedule.intervalSeconds * 1000, Math.ceil(averageDuration * 1.2));
    const lastRunAt = Date.parse(job.lastRunAt);
    if (!Number.isFinite(lastRunAt)) {
      return undefined;
    }
    const nextRunAt = new Date(lastRunAt + scaledIntervalMs);
    if (nextRunAt.getTime() <= now.getTime()) {
      return undefined;
    }
    return {
      nextRunAt,
      schedule: {
        ...job.schedule,
        nextRunAt: nextRunAt.toISOString()
      }
    };
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

function isFutureIso(value: string | undefined, nowIso: string) {
  const timestamp = Date.parse(value ?? "");
  const now = Date.parse(nowIso);
  return Number.isFinite(timestamp) && Number.isFinite(now) && timestamp > now;
}

function formatPercent(ratio: number | undefined) {
  return `${Math.round((ratio ?? 0) * 100)}%`;
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
