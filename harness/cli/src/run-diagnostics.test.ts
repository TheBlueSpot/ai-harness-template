import { describe, expect, test } from "bun:test";
import type { BackgroundJobsState, RunDiagnosticsWindowDays } from "../../shared/protocol";
import { buildRunDiagnosticsReport } from "./run-diagnostics";
import type { RunDiagnosticsQueryReport, WorkspaceRepository } from "./workspace-repository";

function createRepositoryDouble(input: { queryReport: RunDiagnosticsQueryReport; backgroundJobs: BackgroundJobsState }) {
  return {
    getRunDiagnosticsReport(windowDays: RunDiagnosticsWindowDays) {
      expect(windowDays).toBe(7);
      return input.queryReport;
    },
    loadBackgroundJobsState() {
      return input.backgroundJobs;
    }
  } as unknown as WorkspaceRepository;
}

describe("run diagnostics", () => {
  test("excludes manual abort and shutdown interrupt from lifecycle share and surfaces active backoff jobs", () => {
    const repository = createRepositoryDouble({
      queryReport: {
        topPromptHashes: [
          {
            sourceType: "background-job-run",
            promptHash: "repeat-hash",
            jobId: "job-1",
            assistantId: "assistant-1",
            runCount: 2,
            averagePromptChars: 2100,
            latestSeenAt: "2026-05-01T13:00:00.000Z"
          }
        ],
        promptSizeByOwner: [
          {
            jobId: "job-1",
            assistantId: "assistant-1",
            runCount: 2,
            averagePromptChars: 2100,
            latestSeenAt: "2026-05-01T13:00:00.000Z"
          }
        ],
        failureRows: [
          {
            sourceType: "background-job-run",
            day: "2026-05-01",
            failureCategory: "controller-lost",
            assistantId: "assistant-1",
            jobId: "job-1",
            count: 2
          },
          {
            sourceType: "background-job-run",
            day: "2026-05-01",
            failureCategory: "manual-abort",
            assistantId: "assistant-1",
            jobId: "job-1",
            count: 3
          },
          {
            sourceType: "background-job-run",
            day: "2026-05-01",
            failureCategory: "shutdown-interrupt",
            assistantId: "assistant-1",
            jobId: "job-1",
            count: 4
          },
          {
            sourceType: "background-job-run",
            day: "2026-05-01",
            failureCategory: "invalid-json",
            assistantId: "assistant-1",
            jobId: "job-1",
            count: 2
          },
          {
            sourceType: "agent-run",
            day: "2026-05-01",
            failureCategory: "empty-response",
            assistantId: "assistant-1",
            count: 5
          },
          {
            sourceType: "agent-run",
            day: "2026-05-01",
            failureCategory: "question-persist-conflict",
            assistantId: "assistant-1",
            count: 1
          }
        ]
      },
      backgroundJobs: {
        jobs: [
          {
            id: "job-1",
            projectId: "project-1",
            assistantId: "assistant-1",
            automationThreadId: "thread-1",
            kind: "ai-routine",
            name: "Nightly health",
            status: "enabled",
            riskLevel: "safe",
            definition: {
              kind: "ai-routine",
              prompt: "Inspect runs."
            },
            schedule: {
              type: "interval",
              intervalSeconds: 3600,
              nextRunAt: "2026-05-01T18:00:00.000Z",
              sourceText: "1h"
            },
            scheduleInput: "1h",
            consecutiveFailureCount: 2,
            backoffUntil: "2026-05-01T16:00:00.000Z",
            lastFailureCategory: "controller-lost",
            createdAt: "2026-05-01T10:00:00.000Z",
            updatedAt: "2026-05-01T14:00:00.000Z"
          }
        ],
        runs: [],
        templates: []
      }
    });

    const report = buildRunDiagnosticsReport(repository, 7, new Date("2026-05-01T15:00:00.000Z"));

    expect(report.summary.backgroundFailureCount).toBe(11);
    expect(report.summary.lifecycleFailureCount).toBe(2);
    expect(report.summary.lifecycleFailureShare).toBe(0.5);
    expect(report.summary.questionPersistConflictCount).toBe(1);
    expect(report.summary.agentEmptyResponseCount).toBe(5);
    expect(report.summary.dominantBackgroundFailureCategory).toBe("shutdown-interrupt");
    expect(report.activeBackoffJobRows).toEqual([
      {
        jobId: "job-1",
        jobName: "Nightly health",
        assistantId: "assistant-1",
        consecutiveFailureCount: 2,
        backoffUntil: "2026-05-01T16:00:00.000Z",
        lastFailureCategory: "controller-lost"
      }
    ]);
    expect(report.failureBreakdown.find((row) => row.failureCategory === "controller-lost" && row.sourceType === "background-job-run")?.share).toBe(
      0.1818
    );
  });

  test("keeps prompt aggregates and omits stale backoff rows", () => {
    const repository = createRepositoryDouble({
      queryReport: {
        topPromptHashes: [],
        promptSizeByOwner: [],
        failureRows: []
      },
      backgroundJobs: {
        jobs: [
          {
            id: "job-stale",
            projectId: "project-1",
            automationThreadId: "thread-1",
            kind: "shell",
            name: "Stale backoff",
            status: "enabled",
            riskLevel: "safe",
            definition: {
              kind: "shell",
              executable: "bun",
              args: ["test"],
              timeoutSeconds: 60
            },
            schedule: {
              type: "one-off",
              runAt: "2026-05-01T10:00:00.000Z",
              sourceText: "manual"
            },
            scheduleInput: "manual",
            consecutiveFailureCount: 4,
            backoffUntil: "2026-05-01T14:00:00.000Z",
            createdAt: "2026-05-01T10:00:00.000Z",
            updatedAt: "2026-05-01T10:00:00.000Z"
          }
        ],
        runs: [],
        templates: []
      }
    });

    const report = buildRunDiagnosticsReport(repository, 7, new Date("2026-05-01T15:00:00.000Z"));

    expect(report.topPromptHashes).toEqual([]);
    expect(report.promptSizeByOwner).toEqual([]);
    expect(report.summary.activeBackoffJobs).toBe(0);
    expect(report.activeBackoffJobRows).toEqual([]);
  });
});
