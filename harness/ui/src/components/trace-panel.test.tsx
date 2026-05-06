/** @jsxImportSource solid-js */
import { beforeEach, expect, it } from "bun:test";
import { createUiTest } from "../utils/tests/test-harness";
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import type { Assistant, BackgroundJob, BackgroundJobRun, ClientCommand } from "../../../shared/protocol";
import { TracePanel } from "./trace-panel";
import { createDefaultJobsPanePreferences, createEmptyAssistantsState, harnessStore } from "../harness-store";
import { captureDispatchedCommands, clearBrowserStateForTests, seedHarnessStoreForTests } from "../utils/tests/store-test-utils";
import {
  createBrowserActivityFixture,
  createBrowserSessionFixture,
  createAgentPlanFixture,
  createExecutionPlanFixture,
  createHarnessStateFixture,
  createRunFixture,
  createSubtaskFixture,
  createTraceFixture,
  createViewProjectFixture
} from "../utils/tests/test-fixtures";

createUiTest("TracePanel", () => {
  beforeEach(() => {
    clearBrowserStateForTests();
  });

  it("shows explicit subtask status icons and opens full plan", () => {
    const executionPlan = createExecutionPlanFixture();
    const project = createViewProjectFixture({
      id: "project-1",
      activeRun: createRunFixture({
        id: "run-1",
        status: "running-subagents",
        subtasks: [
          createSubtaskFixture({ id: "task-running", status: "running" }),
          createSubtaskFixture({ id: "task-done", status: "completed" }),
          createSubtaskFixture({ id: "task-fail", status: "failed", errorMessage: "boom" })
        ]
      }),
      lastRun: createRunFixture({
        id: "run-1",
        status: "running-subagents",
        subtasks: [
          createSubtaskFixture({ id: "task-running", status: "running" }),
          createSubtaskFixture({ id: "task-done", status: "completed" }),
          createSubtaskFixture({ id: "task-fail", status: "failed", errorMessage: "boom" })
        ]
      }),
      latestPlan: createAgentPlanFixture({
        executionPlan,
        subtaskCount: 3
      }),
      traces: [
        {
          sessionId: "session-1",
          stage: "subagent-complete",
          message: "Use **markdown** output",
          detail: "See [docs](https://example.com)"
        }
      ]
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );

    render(() => <TracePanel />);

    expect(screen.getByLabelText("Subtask running")).not.toBeNull();
    expect(screen.getByLabelText("Subtask completed")).not.toBeNull();
    expect(screen.getByLabelText("Subtask failed")).not.toBeNull();
    expect(screen.getByText("markdown").tagName).toBe("STRONG");
    expect(screen.getByRole("link", { name: "docs" }).getAttribute("target")).toBe("_blank");

    fireEvent.click(screen.getByRole("button", { name: "Open the full execution plan" }));
    expect(harnessStore.state.executionPlanDialogOpen).toBe(true);
    expect(harnessStore.state.selectedExecutionPlan?.runId).toBe(executionPlan.runId);
  });

  it("disables refresh when no run is available", () => {
    const project = createViewProjectFixture({ id: "project-no-run" });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );

    render(() => <TracePanel />);
    expect(screen.queryByRole("button", { name: "Refresh the active run" })).toBeNull();
  });

  it("disables refresh for a finished subtask and retry while project is streaming", () => {
    const project = createViewProjectFixture({
      id: "project-finished",
      session: {
        ...createViewProjectFixture().session,
        isStreaming: true,
        messages: []
      },
      activeRun: createRunFixture({
        id: "run-finished",
        status: "running-subagents",
        subtasks: [createSubtaskFixture({ id: "task-done", status: "completed" })]
      }),
      lastRun: createRunFixture({
        id: "run-finished",
        status: "running-subagents",
        subtasks: [createSubtaskFixture({ id: "task-done", status: "completed" })]
      })
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );

    render(() => <TracePanel />);

    expect((screen.getByRole("button", { name: "Refresh the active run" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: "Refresh this active subagent" }) as HTMLButtonElement).disabled).toBe(true);
    const retryButtons = screen.getAllByRole("button", { name: /Retry/ });
    expect((retryButtons[0] as HTMLButtonElement).disabled).toBe(true);
    expect((retryButtons[1] as HTMLButtonElement).disabled).toBe(true);
  });

  it("sends explicit browser approval decisions from run UI", () => {
    const commands: ClientCommand[] = [];
    const project = createViewProjectFixture({
      id: "project-browser",
      activeRun: createRunFixture({
        id: "run-browser",
        status: "running-main",
        browserSessions: [
          createBrowserSessionFixture({
            id: "browser-session-1",
            runId: "run-browser",
            status: "awaiting-approval",
            pendingApproval: {
              toolCallId: "tool-call-1",
              toolName: "playwright-browser",
              kind: "navigate",
              label: "Open https://example.com",
              inputSummary: "{\"url\":\"https://example.com\"}",
              status: "pending",
              requestedAt: new Date().toISOString()
            },
            activities: [
              createBrowserActivityFixture({
                toolCallId: "tool-call-1",
                status: "pending-approval",
                outputSummary: "```json\n{\"ok\":true}\n```"
              })
            ]
          })
        ]
      }),
      lastRun: createRunFixture({
        id: "run-browser",
        status: "running-main"
      })
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );

    captureDispatchedCommands(commands);
    render(() => <TracePanel />);
    expect(screen.getByRole("button", { name: "Copy code block" })).not.toBeNull();
    expect(document.querySelector(".markdown-code-content")?.textContent).toContain("{\"ok\":true}");
    expect(screen.getByText("{\"url\":\"https://example.com\"}").closest("a")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Approve this browser step" }));
    expect(commands).toHaveLength(1);
    expect(commands[0]?.type).toBe("browser.approval.resolve");
    expect(commands[0]).toMatchObject({
      payload: {
        projectId: "project-browser",
        threadId: project.activeThreadId,
        runId: "run-browser",
        sessionId: "browser-session-1",
        toolCallId: "tool-call-1",
        approved: true
      }
    });
  });

  it("hides aggregation-only traces from the panel", () => {
    const project = createViewProjectFixture({
      id: "project-hidden-trace",
      traces: [
        {
          sessionId: "session-1",
          stage: "aggregation-start",
          message: "Aggregating subagent results"
        },
        {
          sessionId: "session-1",
          stage: "verification-complete",
          message: "Verification done"
        }
      ]
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );

    render(() => <TracePanel />);

    expect(screen.queryByText("Aggregating subagent results")).toBeNull();
    expect(screen.getByText("Verification done")).not.toBeNull();
  });

  it("virtualizes long trace lists at the latest rows", () => {
    const traces = Array.from({ length: 85 }, (_, index) => ({
      sessionId: "session-1",
      stage: "verification-complete" as const,
      message: `trace ${index}`
    }));
    const project = createViewProjectFixture({
      id: "project-long-trace",
      traces
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );

    render(() => <TracePanel />);

    expect(screen.queryByText("trace 0")).toBeNull();
    expect(screen.getByText("trace 84")).not.toBeNull();

    expect(screen.queryByRole("button", { name: "Show every trace event" })).toBeNull();
  });

  it("shows active thread entity summary, execution log, and running counts", () => {
    const project = createViewProjectFixture({
      id: "project-thread-summary",
      activeRun: createRunFixture({
        id: "run-thread",
        status: "running-main",
        subtasks: [createSubtaskFixture({ id: "task-running", title: "Patch code", status: "running" })]
      }),
      lastRun: createRunFixture({
        id: "run-thread",
        status: "running-main",
        subtasks: [createSubtaskFixture({ id: "task-running", title: "Patch code", status: "running" })]
      }),
      traces: [createTraceFixture({ stage: "verification-complete", message: "Trace log row" })]
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        activeLeftTab: "projects",
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );

    render(() => <TracePanel />);

    expect(screen.getByText("Thread")).not.toBeNull();
    expect(screen.getByText("Source: repo-one")).not.toBeNull();
    expect(screen.getByText("Execution log")).not.toBeNull();
    expect(screen.getAllByText(/running-main/).length).toBeGreaterThan(0);
    expect(screen.getByText("Running agents: 2 current / 2 total")).not.toBeNull();
  });

  it("shows selected assistant with assistant logs and owned job events", () => {
    const project = createViewProjectFixture({ id: "project-assistant-trace" });
    const assistant = createAssistantFixture({ id: "assistant-trace", projectId: project.id });
    const job = createBackgroundJobFixture({ id: "job-assistant", projectId: project.id, assistantId: assistant.id });
    const run = createBackgroundJobRunFixture({
      id: "job-run-assistant",
      jobId: job.id,
      projectId: project.id,
      assistantId: assistant.id,
      events: [
        {
          id: "event-assistant",
          stage: "stdout",
          message: "Owned job event",
          createdAt: "2026-04-28T12:00:00.000Z"
        }
      ]
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        activeLeftTab: "assistants",
        activeSurface: "assistants",
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
              id: "assistant-log-1",
              assistantId: assistant.id,
              level: "info",
              summary: "Assistant log row",
              createdAt: "2026-04-28T12:05:00.000Z"
            }
          ]
        },
        backgroundJobs: {
          jobs: [job],
          runs: [run],
          templates: []
        }
      })
    );

    render(() => <TracePanel />);

    expect(screen.getByText("Assistant")).not.toBeNull();
    expect(screen.getByText("Assistant log row")).not.toBeNull();
    expect(screen.getByText(/Owned job event/)).not.toBeNull();
    expect(screen.getByText("Running agents: 0 current / 0 total")).not.toBeNull();
  });

  it("shows assistant job status icons, status colors, and next start time only when not running", () => {
    const project = createViewProjectFixture({ id: "project-assistant-job-status" });
    const assistant = createAssistantFixture({ id: "assistant-job-status", projectId: project.id });
    const runningJob = createBackgroundJobFixture({
      id: "job-running",
      name: "Running routine",
      projectId: project.id,
      assistantId: assistant.id,
      riskLevel: "unsafe",
      nextRunAt: "2026-04-28T13:00:00.000Z",
      updatedAt: "2026-04-28T12:10:00.000Z"
    });
    const successfulJob = createBackgroundJobFixture({
      id: "job-successful",
      name: "Successful routine",
      projectId: project.id,
      assistantId: assistant.id,
      nextRunAt: "2026-04-28T14:00:00.000Z",
      updatedAt: "2026-04-28T12:09:00.000Z"
    });
    const errorJob = createBackgroundJobFixture({
      id: "job-error",
      name: "Error routine",
      projectId: project.id,
      assistantId: assistant.id,
      updatedAt: "2026-04-28T12:08:00.000Z"
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        activeLeftTab: "assistants",
        activeSurface: "assistants",
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        },
        assistants: {
          ...createEmptyAssistantsState(),
          assistants: [assistant],
          selectedAssistantId: assistant.id
        },
        backgroundJobs: {
          jobs: [runningJob, successfulJob, errorJob],
          runs: [
            createBackgroundJobRunFixture({ jobId: runningJob.id, projectId: project.id, assistantId: assistant.id, status: "running" }),
            createBackgroundJobRunFixture({ jobId: successfulJob.id, projectId: project.id, assistantId: assistant.id, status: "succeeded" }),
            createBackgroundJobRunFixture({ jobId: errorJob.id, projectId: project.id, assistantId: assistant.id, status: "failed" })
          ],
          templates: []
        }
      })
    );

    render(() => <TracePanel />);

    expect(screen.getByLabelText("Assistant job running")).not.toBeNull();
    expect(screen.getByLabelText("Assistant job successful")).not.toBeNull();
    expect(screen.getByLabelText("Assistant job error")).not.toBeNull();
    expect(screen.getByText("ai-routine | enabled | unsafe")).not.toBeNull();
    expect(screen.queryByText(/next April 28 '26 - 1:00 PM/)).toBeNull();
    expect(screen.getByText(/ai-routine \| enabled \| safe \| next April 28 '26 - 2:00 PM/)).not.toBeNull();
    expect(screen.getByText("Running routine").parentElement?.className).toContain("text-amber-700");
    expect(screen.getByText("Successful routine").parentElement?.className).toContain("text-emerald-700");
    expect(screen.getByText("Error routine").parentElement?.className).toContain("text-rose-700");
  });

  it("opens an assistant job in the jobs tab when clicked", () => {
    const project = createViewProjectFixture({ id: "project-assistant-job-open" });
    const assistant = createAssistantFixture({ id: "assistant-job-open", projectId: project.id });
    const job = createBackgroundJobFixture({
      id: "job-open",
      name: "Openable routine",
      projectId: project.id,
      assistantId: assistant.id,
      riskLevel: "unsafe"
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        activeLeftTab: "assistants",
        activeSurface: "assistants",
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        },
        assistants: {
          ...createEmptyAssistantsState(),
          assistants: [assistant],
          selectedAssistantId: assistant.id
        },
        backgroundJobs: {
          jobs: [job],
          runs: [],
          templates: []
        },
        jobsPanePreferences: {
          ...createDefaultJobsPanePreferences(),
          segment: "inbox",
          selectedRunId: "old-run",
          jobSearch: "hidden",
          risk: "safe"
        }
      })
    );

    render(() => <TracePanel />);

    const row = screen.getByRole("button", { name: /Openable routine/ });
    expect(row.className).toContain("cursor-pointer");
    fireEvent.click(row);

    expect(harnessStore.state.activeLeftTab).toBe("jobs");
    expect(harnessStore.state.activeSurface).toBe("background-jobs");
    expect(harnessStore.state.jobsPanePreferences).toMatchObject({
      segment: "jobs",
      selectedJobId: job.id,
      selectedRunId: undefined,
      jobSearch: "",
      risk: undefined
    });
  });

  it("shows selected job run execution log", () => {
    const project = createViewProjectFixture({ id: "project-job-trace" });
    const job = createBackgroundJobFixture({ id: "job-trace", projectId: project.id });
    const run = createBackgroundJobRunFixture({
      id: "job-run-trace",
      jobId: job.id,
      projectId: project.id,
      status: "running",
      events: [
        {
          id: "event-job",
          stage: "stdout",
          message: "Selected job event",
          createdAt: "2026-04-28T12:00:00.000Z"
        }
      ]
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        activeLeftTab: "jobs",
        activeSurface: "background-jobs",
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        },
        backgroundJobs: {
          jobs: [job],
          runs: [run],
          templates: []
        },
        jobsPanePreferences: {
          ...createDefaultJobsPanePreferences(),
          selectedJobId: job.id,
          selectedRunId: run.id
        }
      })
    );

    render(() => <TracePanel />);

    expect(screen.getAllByText("Job").length).toBeGreaterThan(0);
    expect(screen.getByText(/Selected job event/)).not.toBeNull();
    expect(screen.getByText("Running agents: 1 current / 1 total")).not.toBeNull();
  });

  it("switches trace entity when active left tab changes", () => {
    const project = createViewProjectFixture({ id: "project-switch-trace" });
    const assistant = createAssistantFixture({ id: "assistant-switch", projectId: project.id });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        activeLeftTab: "projects",
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        },
        assistants: {
          ...createEmptyAssistantsState(),
          assistants: [assistant],
          selectedAssistantId: assistant.id
        }
      })
    );

    render(() => <TracePanel />);
    expect(screen.getByText("Thread")).not.toBeNull();

    cleanup();
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        activeLeftTab: "assistants",
        activeSurface: "assistants",
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        },
        assistants: {
          ...createEmptyAssistantsState(),
          assistants: [assistant],
          selectedAssistantId: assistant.id
        }
      })
    );

    render(() => <TracePanel />);
    expect(screen.getByText("Assistant")).not.toBeNull();
    expect(screen.getByText("Repo helper")).not.toBeNull();
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
    createdAt: overrides.createdAt ?? "2026-04-28T12:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-04-28T12:00:00.000Z"
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
        runAt: "2026-04-28T12:00:00.000Z",
        sourceText: "manual"
      },
    scheduleInput: overrides.scheduleInput ?? "manual",
    timezone: overrides.timezone,
    nextRunAt: overrides.nextRunAt,
    lastRunAt: overrides.lastRunAt,
    lastEnqueuedAt: overrides.lastEnqueuedAt,
    createdAt: overrides.createdAt ?? "2026-04-28T12:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-04-28T12:00:00.000Z"
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
    queuedAt: overrides.queuedAt ?? "2026-04-28T12:00:00.000Z",
    startedAt: overrides.startedAt,
    completedAt: overrides.completedAt,
    createdAt: overrides.createdAt ?? "2026-04-28T12:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-04-28T12:00:00.000Z",
    events: overrides.events ?? []
  };
}
