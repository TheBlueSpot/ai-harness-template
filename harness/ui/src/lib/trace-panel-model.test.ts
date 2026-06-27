import { expect, it } from "bun:test";
import type { Assistant, BackgroundJob, BackgroundJobRun } from "../../../shared/protocol";
import { createDefaultJobsPanePreferences, createEmptyAssistantsState } from "../harness-store";
import {
  createAgentPlanFixture,
  createBrowserActivityFixture,
  createBrowserSessionFixture,
  createHarnessStateFixture,
  createRunFixture,
  createSubtaskFixture,
  createTraceFixture,
  createViewProjectFixture
} from "../utils/tests/test-fixtures";
import {
  getAssistantTracePanelSnapshot,
  getJobTracePanelSnapshot,
  getThreadTracePanelSnapshot,
  getTracePanelExecutionLogEntries,
  getTracePanelRunningCounts,
  resolveTracePanelEntity
} from "./trace-panel-model";

const now = "2026-04-28T12:00:00.000Z";
const later = "2026-04-28T12:05:00.000Z";

it("resolves active thread entity from projects tab", () => {
  const project = createViewProjectFixture({ id: "project-1", activeThreadId: "thread-1" });
  const state = createHarnessStateFixture({
    activeLeftTab: "projects",
    workspace: {
      activeProjectId: project.id,
      projects: [project]
    }
  });

  expect(resolveTracePanelEntity(state)).toEqual({ type: "thread", projectId: "project-1", threadId: "thread-1" });
  expect(getThreadTracePanelSnapshot(state, { type: "thread", projectId: "project-1", threadId: "thread-1" })?.project.id).toBe("project-1");
});

it("resolves selected assistant and merges assistant logs with assistant-owned job events", () => {
  const project = createViewProjectFixture({ id: "project-1" });
  const assistant = createAssistantFixture({ id: "assistant-1", projectId: project.id });
  const job = createBackgroundJobFixture({ id: "job-1", projectId: project.id, assistantId: assistant.id });
  const run = createBackgroundJobRunFixture({
    id: "job-run-1",
    jobId: job.id,
    projectId: project.id,
    assistantId: assistant.id,
    events: [{ id: "event-1", stage: "stdout", message: "Job event", createdAt: now }]
  });
  const state = createHarnessStateFixture({
    activeLeftTab: "assistants",
    workspace: {
      activeProjectId: project.id,
      projects: [project]
    },
    assistants: {
      ...createEmptyAssistantsState(),
      assistants: [assistant],
      selectedAssistantId: assistant.id,
      logs: [
        {
          id: "log-1",
          assistantId: assistant.id,
          level: "info",
          summary: "Assistant log",
          createdAt: later
        }
      ]
    },
    backgroundJobs: {
      jobs: [job],
      runs: [run],
      templates: []
    }
  });

  expect(resolveTracePanelEntity(state)).toEqual({ type: "assistant", assistantId: assistant.id });
  expect(getAssistantTracePanelSnapshot(state, { type: "assistant", assistantId: assistant.id })?.jobs).toHaveLength(1);
  expect(getTracePanelExecutionLogEntries(state, { type: "assistant", assistantId: assistant.id }).map((entry) => entry.message)).toEqual([
    "Assistant log",
    "Job event"
  ]);
});

it("resolves selected job run and falls back to latest run for job logs", () => {
  const project = createViewProjectFixture({ id: "project-1" });
  const job = createBackgroundJobFixture({ id: "job-1", projectId: project.id });
  const oldRun = createBackgroundJobRunFixture({
    id: "run-old",
    jobId: job.id,
    projectId: project.id,
    updatedAt: now,
    events: [{ id: "event-old", stage: "stdout", message: "Old event", createdAt: now }]
  });
  const newRun = createBackgroundJobRunFixture({
    id: "run-new",
    jobId: job.id,
    projectId: project.id,
    updatedAt: later,
    events: [{ id: "event-new", stage: "stdout", message: "New event", createdAt: later }]
  });
  const state = createHarnessStateFixture({
    activeLeftTab: "jobs",
    workspace: {
      activeProjectId: project.id,
      projects: [project]
    },
    backgroundJobs: {
      jobs: [job],
      runs: [oldRun, newRun],
      templates: []
    },
    jobsPanePreferences: {
      ...createDefaultJobsPanePreferences(),
      selectedJobId: job.id
    }
  });

  expect(resolveTracePanelEntity(state)).toEqual({ type: "job", jobId: job.id });
  expect(getJobTracePanelSnapshot(state, { type: "job", jobId: job.id })?.run?.id).toBe("run-new");
  expect(getTracePanelExecutionLogEntries(state, { type: "job", jobId: job.id })[0]?.message).toBe("New event");

  expect(getTracePanelExecutionLogEntries(state, { type: "job", jobId: job.id, runId: oldRun.id })[0]?.message).toBe("Old event");
});

it("derives thread execution log from run, plan, traces, tool activity, and browser activity", () => {
  const run = createRunFixture({
    id: "run-1",
    status: "running-main",
    updatedAt: later,
    subtasks: [createSubtaskFixture({ id: "task-1", title: "Patch code", status: "running", startedAt: now, updatedAt: later })],
    toolActivities: [
      {
        id: "tool-1",
        runId: "run-1",
        owner: "main",
        toolCallId: "tool-call-1",
        toolName: "shell_command",
        category: "shell",
        command: "bun test",
        rawResultJson: "{\"stdout\":\"full test output\"}",
        status: "running",
        startedAt: now,
        updatedAt: later
      }
    ],
    browserSessions: [
      createBrowserSessionFixture({
        id: "browser-1",
        runId: "run-1",
        status: "running",
        updatedAt: later,
        activities: [createBrowserActivityFixture({ id: "browser-activity-1", label: "Open app", updatedAt: later })]
      })
    ]
  });
  const project = createViewProjectFixture({
    id: "project-1",
    latestPlan: createAgentPlanFixture({ sessionId: "session-plan" }),
    activeRun: run,
    lastRun: run,
    traces: [createTraceFixture({ stage: "verification-complete", message: "Trace event", createdAt: now })]
  });
  const state = createHarnessStateFixture({
    activeLeftTab: "projects",
    workspace: {
      activeProjectId: project.id,
      projects: [project]
    }
  });

  const entries = getTracePanelExecutionLogEntries(state, {
    type: "thread",
    projectId: project.id,
    threadId: project.activeThreadId
  });
  const messages = entries.map((entry) => entry.message);
  const subtaskEntry = entries.find((entry) => entry.message === "Patch code running");
  const toolEntry = entries.find((entry) => entry.message === "shell_command running");
  const traceEntry = entries.find((entry) => entry.message === "Trace event");

  expect(messages).toContain("Run running-main");
  expect(messages).toContain("Plan ready: subagents");
  expect(messages).toContain("Patch code running");
  expect(messages).toContain("shell_command running");
  expect(messages).toContain("Open app");
  expect(messages).toContain("Trace event");
  expect(subtaskEntry?.createdAt).toBe(now);
  expect(subtaskEntry?.detail).toContain("Started: April 28 '26 - 12:00 PM");
  expect(toolEntry?.rowSummary).toContain("Run Bun tests");
  expect(toolEntry?.detailKind).toBe("plain");
  expect(toolEntry?.detail).toContain("full test output");
  expect(toolEntry?.copyText).toContain("full test output");
  expect(traceEntry?.createdAt).toBe(now);
});

it("counts current and total running agents and dedupes linked background runs", () => {
  const run = createRunFixture({
    id: "linked-agent-run",
    status: "running-main",
    subtasks: [createSubtaskFixture({ id: "task-1", status: "running" })]
  });
  const project = createViewProjectFixture({
    id: "project-1",
    activeRun: run,
    lastRun: run
  });
  const assistant = createAssistantFixture({ id: "assistant-1", projectId: project.id });
  const linkedJob = createBackgroundJobFixture({ id: "job-linked", projectId: project.id, assistantId: assistant.id });
  const linkedRun = createBackgroundJobRunFixture({
    id: "background-linked",
    jobId: linkedJob.id,
    projectId: project.id,
    assistantId: assistant.id,
    status: "running",
    linkedAgentRunId: run.id,
    events: []
  });
  const standaloneJob = createBackgroundJobFixture({ id: "job-standalone", projectId: project.id });
  const standaloneRun = createBackgroundJobRunFixture({
    id: "background-standalone",
    jobId: standaloneJob.id,
    projectId: project.id,
    status: "running",
    events: []
  });
  const state = createHarnessStateFixture({
    activeLeftTab: "projects",
    workspace: {
      activeProjectId: project.id,
      projects: [project]
    },
    assistants: {
      ...createEmptyAssistantsState(),
      assistants: [assistant],
      streamingByAssistantId: {
        [assistant.id]: "working"
      }
    },
    backgroundJobs: {
      jobs: [linkedJob, standaloneJob],
      runs: [linkedRun, standaloneRun],
      templates: []
    }
  });

  expect(getTracePanelRunningCounts(state, { type: "thread", projectId: project.id, threadId: project.activeThreadId })).toEqual({
    current: 2,
    total: 4
  });
});

function createAssistantFixture(overrides: Partial<Assistant> = {}): Assistant {
  return {
    id: overrides.id ?? "assistant-1",
    name: overrides.name ?? "Repo helper",
    scope: overrides.scope ?? "project",
    projectId: overrides.projectId,
    description: overrides.description,
    personalityPrompt: overrides.personalityPrompt ?? "Be useful",
    jobPrompt: overrides.jobPrompt ?? "Do useful work",
    agentId: overrides.agentId ?? "pi",
    providerBrand: overrides.providerBrand,
    modeId: overrides.modeId,
    executionModelId: overrides.executionModelId,
    fastMode: overrides.fastMode,
    runState: overrides.runState ?? "active",
    bootstrapState: overrides.bootstrapState ?? "completed",
    bootstrapAttemptId: overrides.bootstrapAttemptId,
    bootstrapStartedAt: overrides.bootstrapStartedAt,
    bootstrapFinishedAt: overrides.bootstrapFinishedAt,
    clonedFromAssistantId: overrides.clonedFromAssistantId,
    failureStreakCount: overrides.failureStreakCount ?? 0,
    circuitBreakerState: overrides.circuitBreakerState ?? "closed",
    circuitBreakerReason: overrides.circuitBreakerReason,
    deletedAt: overrides.deletedAt,
    latestActivityAt: overrides.latestActivityAt,
    unreadQuestionCount: overrides.unreadQuestionCount ?? 0,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now
  };
}

function createBackgroundJobFixture(overrides: Partial<BackgroundJob> = {}): BackgroundJob {
  return {
    id: overrides.id ?? "job-1",
    projectId: overrides.projectId ?? "project-1",
    assistantId: overrides.assistantId,
    automationThreadId: overrides.automationThreadId ?? "thread-automation",
    templateId: overrides.templateId,
    createdFromRunId: overrides.createdFromRunId,
    kind: overrides.kind ?? "ai-routine",
    name: overrides.name ?? "Job",
    description: overrides.description,
    status: overrides.status ?? "enabled",
    riskLevel: overrides.riskLevel ?? "safe",
    definition:
      overrides.definition ?? {
        kind: "ai-routine",
        prompt: "Run job"
      },
    schedule:
      overrides.schedule ?? {
        type: "one-off",
        runAt: now,
        sourceText: "manual"
      },
    scheduleInput: overrides.scheduleInput ?? "manual",
    timezone: overrides.timezone,
    nextRunAt: overrides.nextRunAt,
    lastRunAt: overrides.lastRunAt,
    lastEnqueuedAt: overrides.lastEnqueuedAt,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now
  };
}

function createBackgroundJobRunFixture(overrides: Partial<BackgroundJobRun> = {}): BackgroundJobRun {
  return {
    id: overrides.id ?? "job-run-1",
    jobId: overrides.jobId ?? "job-1",
    projectId: overrides.projectId ?? "project-1",
    assistantId: overrides.assistantId,
    automationThreadId: overrides.automationThreadId ?? "thread-automation",
    triggerSource: overrides.triggerSource ?? "manual",
    status: overrides.status ?? "succeeded",
    riskLevel: overrides.riskLevel ?? "safe",
    approvalStatus: overrides.approvalStatus ?? "not-needed",
    skippedOccurrenceCount: overrides.skippedOccurrenceCount ?? 0,
    linkedAgentRunId: overrides.linkedAgentRunId,
    summary: overrides.summary,
    failureMessage: overrides.failureMessage,
    queuedAt: overrides.queuedAt ?? now,
    startedAt: overrides.startedAt,
    completedAt: overrides.completedAt,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    events: overrides.events ?? []
  };
}
