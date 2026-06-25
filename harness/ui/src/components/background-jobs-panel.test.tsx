/** @jsxImportSource solid-js */
import { beforeEach, expect, it } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { createProjectThreadSummary, type Assistant, type BackgroundJob, type BackgroundJobRun, type RunDiagnosticsReport } from "../../../shared/protocol";
import { createInitialViewState, harnessStore, readBrowserUiSession } from "../harness-store";
import { createUiTest } from "../utils/tests/test-harness";
import { captureDispatchedCommands, clearBrowserStateForTests, seedHarnessStoreForTests } from "../utils/tests/store-test-utils";
import { createHarnessStateFixture, createRunFixture, createViewProjectFixture } from "../utils/tests/test-fixtures";
import { BackgroundJobsPanel } from "./background-jobs-panel";

function defineScrollMetrics(scrollHeight: number, clientHeight: number) {
  const originalScrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollHeight");
  const originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");
  const originalScrollTop = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollTop");
  const scrollTops = new WeakMap<HTMLElement, number>();
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", { configurable: true, value: scrollHeight });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, value: clientHeight });
  Object.defineProperty(HTMLElement.prototype, "scrollTop", {
    configurable: true,
    get() {
      return scrollTops.get(this) ?? 0;
    },
    set(value) {
      scrollTops.set(this, Number(value));
    }
  });
  return () => {
    if (originalScrollHeight) {
      Object.defineProperty(HTMLElement.prototype, "scrollHeight", originalScrollHeight);
    }
    if (originalClientHeight) {
      Object.defineProperty(HTMLElement.prototype, "clientHeight", originalClientHeight);
    }
    if (originalScrollTop) {
      Object.defineProperty(HTMLElement.prototype, "scrollTop", originalScrollTop);
    }
  };
}

function createRunDiagnosticsReportFixture(overrides: Partial<RunDiagnosticsReport> = {}): RunDiagnosticsReport {
  return {
    windowDays: overrides.windowDays ?? 7,
    generatedAt: overrides.generatedAt ?? "2026-05-01T15:00:00.000Z",
    summary: {
      activeBackoffJobs: 1,
      questionPersistConflictCount: 0,
      agentEmptyResponseCount: 2,
      backgroundFailureCount: 4,
      lifecycleFailureCount: 1,
      lifecycleFailureShare: 0.25,
      dominantBackgroundFailureCategory: "controller-lost",
      ...overrides.summary
    },
    topPromptHashes: overrides.topPromptHashes ?? [
      {
        sourceType: "background-job-run",
        promptHash: "prompt-hash-repeat",
        assistantId: "assistant-health",
        jobId: "job-health",
        runCount: 3,
        averagePromptChars: 2200,
        latestSeenAt: "2026-05-01T14:00:00.000Z"
      }
    ],
    promptSizeByOwner: overrides.promptSizeByOwner ?? [
      {
        assistantId: "assistant-health",
        jobId: "job-health",
        runCount: 4,
        averagePromptChars: 2100,
        latestSeenAt: "2026-05-01T14:00:00.000Z"
      }
    ],
    failureBreakdown: overrides.failureBreakdown ?? [
      {
        sourceType: "background-job-run",
        failureCategory: "controller-lost",
        count: 2,
        share: 0.5,
        assistantId: "assistant-health",
        jobId: "job-health"
      },
      {
        sourceType: "agent-run",
        failureCategory: "empty-response",
        count: 2,
        share: 1,
        assistantId: "assistant-health"
      }
    ],
    dailyFailureSeries: overrides.dailyFailureSeries ?? [
      {
        day: "2026-05-01",
        sourceType: "background-job-run",
        failureCategory: "controller-lost",
        count: 2,
        jobId: "job-health"
      }
    ],
    activeBackoffJobRows: overrides.activeBackoffJobRows ?? [
      {
        jobId: "job-health",
        jobName: "Health monitor",
        assistantId: "assistant-health",
        consecutiveFailureCount: 2,
        backoffUntil: "2026-05-01T16:00:00.000Z",
        lastFailureCategory: "controller-lost"
      }
    ]
  };
}

function createAssistantFixture(overrides: Partial<Assistant> = {}): Assistant {
  const now = "2026-05-01T12:00:00.000Z";
  return {
    id: overrides.id ?? "assistant-owner",
    name: overrides.name ?? "Repo Assistant",
    scope: overrides.scope ?? "project",
    projectId: overrides.projectId,
    description: overrides.description,
    personalityPrompt: overrides.personalityPrompt ?? "Own background work.",
    jobPrompt: overrides.jobPrompt ?? "Review the repo.",
    agentId: overrides.agentId ?? "pi",
    providerBrand: overrides.providerBrand,
    modeId: overrides.modeId,
    executionModelId: overrides.executionModelId,
    reasoningStrength: overrides.reasoningStrength,
    fastMode: overrides.fastMode,
    runState: overrides.runState ?? "active",
    bootstrapState: overrides.bootstrapState ?? "completed",
    failureStreakCount: overrides.failureStreakCount ?? 0,
    circuitBreakerState: overrides.circuitBreakerState ?? "closed",
    unreadQuestionCount: overrides.unreadQuestionCount ?? 0,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now
  };
}

createUiTest("BackgroundJobsPanel", () => {
  beforeEach(() => {
    clearBrowserStateForTests();
  });

  it("uses shared left pane shell and empty-state hooks for jobs", () => {
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        activeLeftTab: "jobs",
        activeSurface: "background-jobs",
        backgroundJobs: {
          jobs: [],
          runs: [],
          templates: []
        }
      })
    );

    render(() => <BackgroundJobsPanel variant="left" segment="jobs" />);

    expect(document.querySelector("[data-test-left-pane-shell][data-left-pane-kind='jobs']")).not.toBeNull();
    expect(screen.getByText("No scheduled tasks match current search or filters.").closest("[data-test-left-pane-empty-state]")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Schedule job" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Run shell job" })).not.toBeNull();
  });

  it("uses shared empty-state hooks for run details", () => {
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        activeLeftTab: "runs",
        activeSurface: "background-jobs",
        backgroundJobs: {
          jobs: [],
          runs: [],
          templates: []
        }
      })
    );

    render(() => <BackgroundJobsPanel segment="runs" />);

    expect(document.querySelector("[data-test-left-pane-shell][data-left-pane-kind='runs']")).not.toBeNull();
    expect(screen.getByText(/Run history appears after first task/i).closest("[data-test-left-pane-empty-state]")).not.toBeNull();
    expect(screen.getByText("Select background run or job to inspect details.").closest("[data-test-detail-empty-state]")).not.toBeNull();
  });

  it("shows enabled filter count on jobs search menu", () => {
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        activeLeftTab: "jobs",
        activeSurface: "background-jobs",
        jobsPanePreferences: {
          ...harnessStore.state.jobsPanePreferences,
          kind: "shell",
          risk: "unsafe"
        }
      })
    );

    render(() => <BackgroundJobsPanel variant="left" segment="jobs" />);

    expect(screen.getByRole("button", { name: "Filter and sort jobs" }).textContent).toContain("2");
  });

  it("filters scheduled jobs by job state", () => {
    const project = createViewProjectFixture({ id: "project-job-state-filter" });
    const now = "2026-05-01T12:00:00.000Z";
    const baseJob = {
      projectId: project.id,
      automationThreadId: "thread-automation",
      kind: "ai-routine" as const,
      status: "enabled" as const,
      riskLevel: "safe" as const,
      definition: {
        kind: "ai-routine" as const,
        prompt: "Review project."
      },
      schedule: {
        type: "interval" as const,
        intervalSeconds: 3600,
        nextRunAt: now,
        sourceText: "1h"
      },
      scheduleInput: "1h",
      createdAt: now,
      updatedAt: now
    };
    const blockedJob: BackgroundJob = {
      ...baseJob,
      id: "job-state-blocked",
      name: "Blocked review",
      schedulerStatus: "blocked"
    };
    const dueJob: BackgroundJob = {
      ...baseJob,
      id: "job-state-due",
      name: "Due review",
      schedulerStatus: "due"
    };
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        activeLeftTab: "jobs",
        activeSurface: "background-jobs",
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        },
        backgroundJobs: {
          jobs: [blockedJob, dueJob],
          runs: [],
          templates: []
        },
        jobsPanePreferences: {
          ...harnessStore.state.jobsPanePreferences,
          segment: "jobs",
          jobState: "blocked"
        }
      })
    );

    render(() => <BackgroundJobsPanel variant="left" segment="jobs" />);

    expect(screen.getByRole("button", { name: "Filter and sort jobs" }).textContent).toContain("1");
    expect(screen.getByText("Blocked review")).toBeTruthy();
    expect(screen.queryByText("Due review")).toBeNull();
  });

  it("shows enabled filter count on runs search menu", () => {
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        activeLeftTab: "runs",
        activeSurface: "background-jobs",
        jobsRunFilter: "failed"
      })
    );

    render(() => <BackgroundJobsPanel variant="left" segment="runs" />);

    expect(screen.getByRole("button", { name: "Filter and sort runs" }).textContent).toContain("1");
  });

  it("persists and restores jobs segment, split search, and run filter", async () => {
    const project = createViewProjectFixture({ id: "project-jobs-view" });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );

    render(() => <BackgroundJobsPanel />);
    harnessStore.setJobsPanePreferences({ segment: "jobs", jobSearch: "nightly", jobState: "blocked" });
    harnessStore.setJobsPanePreferences({ segment: "inbox", runSearch: "approval" });
    harnessStore.setJobsRunFilter("failed");

    expect(harnessStore.state.jobsPanePreferences.segment).toBe("inbox");
    expect(harnessStore.state.jobsPanePreferences.jobSearch).toBe("nightly");
    expect(harnessStore.state.jobsPanePreferences.jobState).toBe("blocked");
    expect(harnessStore.state.jobsPanePreferences.runSearch).toBe("approval");
    expect(harnessStore.state.jobsRunFilter).toBe("failed");
    expect(readBrowserUiSession().jobsPane).toMatchObject({
      segment: "inbox",
      jobSearch: "nightly",
      jobState: "blocked",
      runSearch: "approval",
      runFilter: "failed"
    });

    cleanup();
    harnessStore.replaceStateForTests(createInitialViewState());
    harnessStore.actions.hydrateBrowserUiSession();

    seedHarnessStoreForTests(
      createHarnessStateFixture({
        jobsPanePreferences: harnessStore.state.jobsPanePreferences,
        jobsRunFilter: harnessStore.state.jobsRunFilter,
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );
    render(() => <BackgroundJobsPanel />);

    expect(harnessStore.state.jobsRunFilter).toBe("failed");
    expect(harnessStore.state.jobsPanePreferences.jobState).toBe("blocked");
  });

  it("persists and restores the health segment", () => {
    const project = createViewProjectFixture({ id: "project-health-view" });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );

    render(() => <BackgroundJobsPanel />);
    harnessStore.setJobsPanePreferences({ segment: "health" });

    expect(harnessStore.state.jobsPanePreferences.segment).toBe("health");
    expect(readBrowserUiSession().jobsPane).toMatchObject({
      segment: "health"
    });

    cleanup();
    harnessStore.replaceStateForTests(createInitialViewState());
    harnessStore.actions.hydrateBrowserUiSession();
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        jobsPanePreferences: harnessStore.state.jobsPanePreferences,
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );

    render(() => <BackgroundJobsPanel />);

    expect(screen.getByText("Health")).not.toBeNull();
  });

  it("renders health loading state", () => {
    const project = createViewProjectFixture({ id: "project-health-report" });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        },
        jobsPanePreferences: {
          segment: "health",
          search: "",
          jobSort: "next-run"
        },
        runDiagnostics: {
          loading: true,
          windowDays: 7
        }
      })
    );

    render(() => <BackgroundJobsPanel />);

    expect(screen.getByText("Loading diagnostics...")).toBeTruthy();
  });

  it("shows assistant ownership on scheduled jobs", () => {
    const project = createViewProjectFixture({ id: "project-job-owner-label" });
    const assistant = createAssistantFixture({ id: "assistant-job-owner-label", projectId: project.id });
    const now = "2026-05-01T12:00:00.000Z";
    const job: BackgroundJob = {
      id: "job-owner-label",
      projectId: project.id,
      assistantId: assistant.id,
      automationThreadId: "thread-automation",
      kind: "ai-routine",
      name: "Owned repo review",
      status: "enabled",
      riskLevel: "safe",
      definition: {
        kind: "ai-routine",
        prompt: "Review project."
      },
      schedule: {
        type: "one-off",
        runAt: now,
        sourceText: "manual"
      },
      scheduleInput: "manual",
      createdAt: now,
      updatedAt: now
    };
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        },
        assistants: {
          ...harnessStore.state.assistants,
          assistants: [assistant]
        },
        backgroundJobs: {
          jobs: [job],
          runs: [],
          templates: []
        },
        jobsPanePreferences: {
          segment: "jobs",
          search: "",
          jobSort: "next-run",
          selectedJobId: job.id
        }
      })
    );

    render(() => <BackgroundJobsPanel />);

    expect(screen.getAllByText("Owner: Repo Assistant").length).toBeGreaterThan(0);
  });

  it("opens the owning assistant from assistant-owned job details", () => {
    const project = createViewProjectFixture({ id: "project-job-owner-link" });
    const assistant = createAssistantFixture({ id: "assistant-job-owner-link", projectId: project.id });
    const now = "2026-05-01T12:00:00.000Z";
    const job: BackgroundJob = {
      id: "job-owner-link",
      projectId: project.id,
      assistantId: assistant.id,
      automationThreadId: "thread-automation",
      kind: "ai-routine",
      name: "Owned assistant job",
      status: "enabled",
      riskLevel: "safe",
      definition: {
        kind: "ai-routine",
        prompt: "Review project."
      },
      schedule: {
        type: "one-off",
        runAt: now,
        sourceText: "manual"
      },
      scheduleInput: "manual",
      createdAt: now,
      updatedAt: now
    };
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        activeSurface: "background-jobs",
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        },
        assistants: {
          ...harnessStore.state.assistants,
          assistants: [assistant]
        },
        backgroundJobs: {
          jobs: [job],
          runs: [],
          templates: []
        },
        jobsPanePreferences: {
          segment: "jobs",
          search: "",
          jobSort: "next-run",
          selectedJobId: job.id
        }
      })
    );

    render(() => <BackgroundJobsPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Open owning assistant" }));

    expect(harnessStore.state.activeSurface).toBe("assistants");
    expect(harnessStore.state.assistants.selectedAssistantId).toBe(assistant.id);
    expect(harnessStore.state.assistants.scopeFilter).toBe("project");
  });

  it("renders health report sections", () => {
    const project = createViewProjectFixture({ id: "project-health-report-ready" });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        },
        jobsPanePreferences: {
          segment: "health",
          search: "",
          jobSort: "next-run"
        },
        runDiagnostics: {
          loading: false,
          windowDays: 7,
          report: createRunDiagnosticsReportFixture()
        }
      })
    );

    render(() => <BackgroundJobsPanel />);

    expect(screen.getByText("Active backoff jobs")).toBeTruthy();
    expect(screen.getByText("Failure Breakdown")).toBeTruthy();
    expect(screen.getByText("Repeated Prompt Hashes")).toBeTruthy();
    expect(screen.getByText("Prompt Size By Owner")).toBeTruthy();
    expect(screen.getByText("Daily Failure Series")).toBeTruthy();
    expect(screen.getByText("Health monitor")).toBeTruthy();
    expect(screen.getByText("prompt-hash-repeat")).toBeTruthy();
  });

  it("renders the selected health window from store state", () => {
    const project = createViewProjectFixture({ id: "project-health-refresh" });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        },
        jobsPanePreferences: {
          segment: "health",
          search: "",
          jobSort: "next-run"
        },
        runDiagnostics: {
          loading: false,
          windowDays: 30,
          report: createRunDiagnosticsReportFixture({ windowDays: 30 })
        }
      })
    );

    render(() => <BackgroundJobsPanel />);

    expect(screen.getByRole("button", { name: "30d" }).className).toContain("bg-(--accent)");
    expect(screen.getByRole("button", { name: "7d" }).className).not.toContain("bg-(--accent)");
  });

  it("renders runs header without scheduled-job actions", () => {
    seedHarnessStoreForTests(createHarnessStateFixture());

    render(() => <BackgroundJobsPanel variant="left" segment="runs" />);

    expect(screen.getAllByText("Runs").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Runs help")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Create scheduled AI routine" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Create scheduled shell task" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Enable desktop notifications" })).toBeNull();
  });

  it("shows all run states by default in the runs view", () => {
    const project = createViewProjectFixture({ id: "project-run-all" });
    const now = "2026-04-28T12:00:00.000Z";
    const job: BackgroundJob = {
      id: "job-all",
      projectId: project.id,
      automationThreadId: "thread-automation",
      kind: "ai-routine",
      name: "Run state check",
      status: "enabled",
      riskLevel: "safe",
      definition: {
        kind: "ai-routine",
        prompt: "Check all run states."
      },
      schedule: {
        type: "one-off",
        runAt: now,
        sourceText: "manual"
      },
      scheduleInput: "manual",
      createdAt: now,
      updatedAt: now
    };
    const doneRun: BackgroundJobRun = {
      id: "run-done",
      jobId: job.id,
      projectId: project.id,
      automationThreadId: job.automationThreadId,
      triggerSource: "manual",
      status: "succeeded",
      riskLevel: "safe",
      approvalStatus: "not-needed",
      skippedOccurrenceCount: 0,
      summary: "Done summary",
      queuedAt: now,
      startedAt: now,
      completedAt: now,
      createdAt: now,
      updatedAt: now,
      events: []
    };
    const queuedRun: BackgroundJobRun = {
      ...doneRun,
      id: "run-queued",
      status: "queued",
      summary: "Queued summary",
      completedAt: undefined
    };
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        },
        backgroundJobs: {
          jobs: [job],
          runs: [doneRun, queuedRun],
          templates: []
        }
      })
    );

    render(() => <BackgroundJobsPanel variant="left" segment="runs" />);

    expect(harnessStore.state.jobsRunFilter).toBe("all");
    expect(screen.getByText("Done summary")).toBeTruthy();
    expect(screen.getByText("Queued summary")).toBeTruthy();
  });

  it("scrolls selected run detail events to the bottom", async () => {
    const restoreScrollMetrics = defineScrollMetrics(1200, 400);
    const project = createViewProjectFixture({ id: "project-run-scroll" });
    const now = "2026-04-28T12:00:00.000Z";
    const job: BackgroundJob = {
      id: "job-scroll",
      projectId: project.id,
      automationThreadId: "thread-automation",
      kind: "ai-routine",
      name: "Scroll check",
      status: "enabled",
      riskLevel: "safe",
      definition: {
        kind: "ai-routine",
        prompt: "Check scrolling."
      },
      schedule: {
        type: "one-off",
        runAt: now,
        sourceText: "manual"
      },
      scheduleInput: "manual",
      createdAt: now,
      updatedAt: now
    };
    const run: BackgroundJobRun = {
      id: "run-scroll",
      jobId: job.id,
      projectId: project.id,
      automationThreadId: job.automationThreadId,
      triggerSource: "manual",
      status: "succeeded",
      riskLevel: "safe",
      approvalStatus: "not-needed",
      skippedOccurrenceCount: 0,
      summary: "Done",
      queuedAt: now,
      startedAt: now,
      completedAt: now,
      createdAt: now,
      updatedAt: now,
      events: [
        {
          id: "event-1",
          stage: "stdout",
          message: "First event",
          createdAt: now
        },
        {
          id: "event-2",
          stage: "stdout",
          message: "Last event",
          createdAt: now
        }
      ]
    };

    try {
      seedHarnessStoreForTests(
        createHarnessStateFixture({
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
            segment: "inbox",
            search: "",
            jobSort: "next-run",
            selectedRunId: run.id,
            selectedJobId: job.id
          },
          jobsRunFilter: "done"
        })
      );

      render(() => <BackgroundJobsPanel variant="detail" segment="runs" />);

      const viewport = document.querySelector("[data-test-scroll-area]") as HTMLElement;
      expect(viewport).not.toBeNull();
      await waitFor(() => expect(viewport.scrollTop).toBe(1200));
    } finally {
      restoreScrollMetrics();
    }
  });

  it("shows recurring next run from schedule fallback and latest execution log", () => {
    const project = createViewProjectFixture({ id: "project-jobs" });
    const now = "2026-04-28T12:00:00.000Z";
    const nextRunAt = "2026-04-28T13:00:00.000Z";
    const job: BackgroundJob = {
      id: "job-1",
      projectId: project.id,
      automationThreadId: "thread-automation",
      kind: "ai-routine",
      name: "Hourly review",
      status: "enabled",
      riskLevel: "safe",
      definition: {
        kind: "ai-routine",
        prompt: "Review project."
      },
      schedule: {
        type: "interval",
        intervalSeconds: 3600,
        nextRunAt,
        sourceText: "1h"
      },
      scheduleInput: "1h",
      createdAt: now,
      updatedAt: now
    };
    const run: BackgroundJobRun = {
      id: "run-1",
      jobId: job.id,
      projectId: project.id,
      automationThreadId: job.automationThreadId,
      triggerSource: "schedule",
      status: "succeeded",
      riskLevel: "safe",
      approvalStatus: "not-needed",
      skippedOccurrenceCount: 0,
      summary: "Reviewed project",
      queuedAt: now,
      startedAt: now,
      completedAt: now,
      createdAt: now,
      updatedAt: now,
      events: [
        {
          id: "event-1",
          stage: "stdout",
          message: "Captured output",
          detail: "review complete",
          createdAt: now
        }
      ]
    };
    seedHarnessStoreForTests(
      createHarnessStateFixture({
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
          segment: "jobs",
          search: "",
          jobSort: "next-run",
          selectedJobId: job.id
        }
      })
    );

    render(() => <BackgroundJobsPanel />);

    expect(screen.getAllByText(/Next: April 28 '26 - 1:00 PM/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Next: n\/a/)).toBeNull();
    expect(screen.getByText("Execution log")).toBeTruthy();
    expect(screen.queryByText("Definition")).toBeNull();
    expect(screen.getByText("Captured output")).toBeTruthy();
    expect(screen.queryByText("review complete")).toBeNull();
    expect(screen.getByRole("button", { name: /Show details for Captured output/ })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Select Hourly review" }));
    expect(harnessStore.state.backgroundJobDetailsRunId).toBeUndefined();
    expect(screen.queryByRole("dialog", { name: "Hourly review" })).toBeNull();
  });

  it("copies run id from run detail surfaces", async () => {
    const copied: string[] = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          copied.push(value);
        }
      }
    });
    const project = createViewProjectFixture({ id: "project-copy-run" });
    const now = "2026-04-28T12:00:00.000Z";
    const job: BackgroundJob = {
      id: "job-copy-run",
      projectId: project.id,
      automationThreadId: "thread-automation",
      kind: "ai-routine",
      name: "Copy run",
      status: "enabled",
      riskLevel: "safe",
      definition: {
        kind: "ai-routine",
        prompt: "Review project."
      },
      schedule: {
        type: "one-off",
        runAt: now,
        sourceText: "manual"
      },
      scheduleInput: "manual",
      createdAt: now,
      updatedAt: now
    };
    const run: BackgroundJobRun = {
      id: "run-copy-123",
      jobId: job.id,
      projectId: project.id,
      automationThreadId: job.automationThreadId,
      triggerSource: "manual",
      status: "succeeded",
      riskLevel: "safe",
      approvalStatus: "not-needed",
      skippedOccurrenceCount: 0,
      summary: "Done",
      queuedAt: now,
      startedAt: now,
      completedAt: now,
      createdAt: now,
      updatedAt: now,
      events: []
    };

    seedHarnessStoreForTests(
      createHarnessStateFixture({
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
          segment: "inbox",
          search: "",
          jobSort: "next-run",
          selectedJobId: job.id,
          selectedRunId: run.id
        },
        jobsRunFilter: "done",
        backgroundJobDetailsRunId: run.id
      })
    );

    render(() => <BackgroundJobsPanel />);

    const copyButtons = screen.getAllByRole("button", { name: "Copy run id" });
    expect(copyButtons).toHaveLength(2);
    fireEvent.click(copyButtons[0]!);
    fireEvent.click(copyButtons[1]!);
    await waitFor(() => expect(copied).toEqual([run.id, run.id]));
  });

  it("shows blocked active-run copy instead of next-run n/a for active recurring jobs", () => {
    const commands: unknown[] = [];
    const project = createViewProjectFixture({ id: "project-running-job" });
    const now = "2026-04-28T12:00:00.000Z";
    const job: BackgroundJob = {
      id: "job-running",
      projectId: project.id,
      automationThreadId: "thread-automation",
      kind: "shell",
      name: "Build check",
      status: "enabled",
      riskLevel: "slightly-unsafe",
      definition: {
        kind: "shell",
        executable: "bun",
        args: ["test"],
        timeoutSeconds: 60
      },
      schedule: {
        type: "cron",
        expression: "0 * * * *",
        timezone: "UTC",
        nextRunAt: "2026-04-28T13:00:00.000Z",
        sourceText: "0 * * * *"
      },
      scheduleInput: "0 * * * *",
      createdAt: now,
      updatedAt: now
    };
    const run: BackgroundJobRun = {
      id: "run-running",
      jobId: job.id,
      projectId: project.id,
      automationThreadId: job.automationThreadId,
      triggerSource: "schedule",
      status: "running",
      riskLevel: "slightly-unsafe",
      approvalStatus: "approved",
      skippedOccurrenceCount: 0,
      queuedAt: now,
      startedAt: now,
      createdAt: now,
      updatedAt: now,
      events: []
    };
    seedHarnessStoreForTests(
      createHarnessStateFixture({
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
          segment: "jobs",
          search: "",
          jobSort: "next-run",
          selectedJobId: job.id
        }
      })
    );
    captureDispatchedCommands(commands);

    render(() => <BackgroundJobsPanel />);

    expect(screen.getAllByText("Next: Blocked by active run: running").length).toBeGreaterThan(0);
    expect(screen.getByText(`Blocked by: running run ${run.id}`)).toBeTruthy();
    expect(screen.queryByText(/Next: n\/a/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Stop active background run" }));
    expect(commands).toMatchObject([
      {
        type: "background-job.stop-run",
        payload: {
          projectId: project.id,
          runId: run.id
        }
      }
    ]);
  });

  it("shows durable scheduler due, blocked, and stale states", () => {
    const project = createViewProjectFixture({ id: "project-scheduler-state" });
    const oldHeartbeat = new Date(Date.now() - 120_000).toISOString();
    const staleNextRunAt = new Date(Date.now() - 60_000).toISOString();
    const base = {
      projectId: project.id,
      automationThreadId: "thread-automation",
      kind: "ai-routine" as const,
      status: "enabled" as const,
      riskLevel: "safe" as const,
      definition: {
        kind: "ai-routine" as const,
        prompt: "Review project."
      },
      scheduleInput: "1h",
      createdAt: oldHeartbeat,
      updatedAt: oldHeartbeat
    };
    const dueJob: BackgroundJob = {
      ...base,
      id: "job-due",
      name: "Due review",
      schedulerStatus: "due",
      schedule: {
        type: "interval",
        intervalSeconds: 3600,
        nextRunAt: staleNextRunAt,
        sourceText: "1h"
      }
    };
    const blockedJob: BackgroundJob = {
      ...base,
      id: "job-blocked",
      name: "Blocked review",
      schedulerStatus: "blocked",
      blockedReason: "Waiting for approval run-pending",
      schedulerQueuePosition: 1,
      schedulerQueueReason: "Queue #1: waiting for approval run-pending",
      schedulerActiveRunId: "run-pending",
      schedulerActiveRunStartedAt: oldHeartbeat,
      schedulerLastProgressAt: oldHeartbeat,
      schedulerCongested: true,
      schedulerCongestionRatio: 1.12,
      schedule: {
        type: "interval",
        intervalSeconds: 3600,
        nextRunAt: staleNextRunAt,
        sourceText: "1h"
      }
    };
    const staleJob: BackgroundJob = {
      ...base,
      id: "job-stale",
      name: "Stale review",
      lastSchedulerCheckAt: oldHeartbeat,
      schedule: {
        type: "interval",
        intervalSeconds: 3600,
        nextRunAt: staleNextRunAt,
        sourceText: "1h"
      }
    };
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        },
        backgroundJobs: {
          jobs: [dueJob, blockedJob, staleJob],
          runs: [],
          templates: [],
          schedulerHeartbeatAt: oldHeartbeat
        },
        jobsPanePreferences: {
          segment: "jobs",
          search: "",
          jobSort: "created"
        }
      })
    );

    render(() => <BackgroundJobsPanel />);

    expect(screen.getAllByText("Next: Due now").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Next: Queue #1: Blocked: Waiting for approval run-pending").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Queue #1: waiting for approval run-pending").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Congested (112%): scheduled work overlaps recent exclusive-lane runtime").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Last progress:/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Stale: scheduler has not checked since/).length).toBeGreaterThan(0);
  });

  it("shows active project chat runs in the shared runs list and opens their chat source", () => {
    const commands: unknown[] = [];
    const activeRun = createRunFixture({
      id: "run-project-chat",
      threadId: "thread-active",
      status: "running-main",
      latestUserPrompt: "Implement active run visibility",
      updatedAt: "2026-05-06T12:00:00.000Z"
    });
    const project = createViewProjectFixture({
      id: "project-active-chat",
      name: "Harness",
      activeThreadId: "thread-active",
      activeRun,
      threads: [
        createProjectThreadSummary({
          id: "thread-active",
          title: "Active chat",
          titleSource: "generated",
          updatedAt: "2026-05-06T12:00:00.000Z"
        })
      ]
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        activeLeftTab: "runs",
        workspace: {
          activeProjectId: "other-project",
          projects: [project]
        },
        jobsPanePreferences: {
          segment: "inbox",
          search: "",
          jobSort: "updated"
        }
      })
    );
    captureDispatchedCommands(commands);

    render(() => <BackgroundJobsPanel variant="left" segment="runs" />);

    expect(screen.getByText("1 total")).toBeTruthy();
    expect(screen.getByText("Harness / Active chat")).toBeTruthy();
    expect(screen.getByText("Implement active run visibility")).toBeTruthy();
    expect(screen.getByText("Implement active run visibility").parentElement?.className).toContain("[-webkit-line-clamp:3]");

    fireEvent.click(screen.getByRole("button", { name: /Harness \/ Active chat/ }));

    expect(commands).toMatchObject([
      {
        type: "project.activate",
        payload: { projectId: project.id }
      },
      {
        type: "thread.activate",
        payload: { projectId: project.id, threadId: "thread-active" }
      }
    ]);
    expect(harnessStore.state.activeSurface).toBe("chat");
    expect(harnessStore.state.activeLeftTab).toBe("projects");
    expect(harnessStore.state.chatPaneTab).toBe("run");
  });

  it("filters and sorts project chat runs with background runs", () => {
    const projectChatRun = createRunFixture({
      id: "run-project-chat-filtered",
      threadId: "thread-filtered",
      status: "running-main",
      latestUserPrompt: "Chat run should stay with running work",
      createdAt: "2026-05-06T10:00:00.000Z",
      updatedAt: "2026-05-06T12:00:00.000Z"
    });
    const project = createViewProjectFixture({
      id: "project-chat-filtered",
      name: "Harness",
      activeThreadId: "thread-filtered",
      activeRun: projectChatRun,
      threads: [
        createProjectThreadSummary({
          id: "thread-filtered",
          title: "Chat filtered",
          titleSource: "generated",
          updatedAt: "2026-05-06T12:00:00.000Z"
        })
      ]
    });
    const backgroundRun: BackgroundJobRun = {
      id: "background-run-filtered",
      jobId: "job-filtered",
      projectId: project.id,
      automationThreadId: "thread-automation",
      triggerSource: "manual",
      status: "failed",
      riskLevel: "safe",
      approvalStatus: "approved",
      skippedOccurrenceCount: 0,
      queuedAt: "2026-05-06T11:00:00.000Z",
      startedAt: "2026-05-06T11:01:00.000Z",
      completedAt: "2026-05-06T11:10:00.000Z",
      updatedAt: "2026-05-06T11:10:00.000Z",
      events: [],
      summary: "Background run should be filtered out",
      createdAt: "2026-05-06T11:00:00.000Z"
    };
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        activeLeftTab: "runs",
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        },
        backgroundJobs: {
          jobs: [
            {
              id: "job-filtered",
              projectId: project.id,
              automationThreadId: "thread-automation",
              kind: "ai-routine",
              name: "Filtered background",
              status: "enabled",
              riskLevel: "safe",
              definition: { kind: "ai-routine", prompt: "Run filtered background." },
              schedule: { type: "one-off", runAt: "2026-05-06T10:30:00.000Z", sourceText: "manual" },
              scheduleInput: "manual",
              createdAt: "2026-05-06T10:30:00.000Z",
              updatedAt: "2026-05-06T10:30:00.000Z"
            }
          ],
          runs: [backgroundRun],
          templates: []
        },
        jobsRunFilter: "running",
        jobsPanePreferences: {
          segment: "inbox",
          search: "",
          jobSort: "updated",
          runSort: "updated"
        }
      })
    );

    render(() => <BackgroundJobsPanel variant="left" segment="runs" />);

    expect(screen.getByText("1 total")).toBeTruthy();
    expect(screen.getByText("Harness / Chat filtered")).toBeTruthy();
    expect(screen.queryByText("Filtered background")).toBeNull();
  });

  it("shows failure tracking and prompt stats for jobs and runs", () => {
    const project = createViewProjectFixture({ id: "project-failure-tracking" });
    const now = "2026-04-28T12:00:00.000Z";
    const job: BackgroundJob = {
      id: "job-failure-tracking",
      projectId: project.id,
      automationThreadId: "thread-automation",
      kind: "ai-routine",
      name: "Failure tracking",
      status: "enabled",
      riskLevel: "safe",
      definition: {
        kind: "ai-routine",
        prompt: "Inspect failures."
      },
      schedule: {
        type: "interval",
        intervalSeconds: 600,
        nextRunAt: now,
        sourceText: "10m"
      },
      scheduleInput: "10m",
      consecutiveFailureCount: 3,
      backoffUntil: "2026-04-28T12:05:00.000Z",
      lastFailureCategory: "controller-lost",
      createdAt: now,
      updatedAt: now
    };
    const run: BackgroundJobRun = {
      id: "run-failure-tracking",
      jobId: job.id,
      projectId: project.id,
      automationThreadId: job.automationThreadId,
      triggerSource: "retry",
      status: "failed",
      riskLevel: "safe",
      approvalStatus: "not-needed",
      skippedOccurrenceCount: 0,
      failureMessage: "Background run interrupted before completion",
      failureCategory: "controller-lost",
      promptStats: {
        promptChars: 2048,
        promptHash: "hash-1234",
        transcriptChars: 1500,
        latestTaskChars: 120
      },
      queuedAt: now,
      startedAt: now,
      completedAt: now,
      createdAt: now,
      updatedAt: now,
      events: []
    };
    seedHarnessStoreForTests(
      createHarnessStateFixture({
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
          segment: "jobs",
          search: "",
          jobSort: "next-run",
          selectedJobId: job.id,
          selectedRunId: run.id
        },
        jobsRunFilter: "failed",
        backgroundJobDetailsRunId: run.id
      })
    );

    render(() => <BackgroundJobsPanel />);

    expect(screen.getAllByText(/Failure streak 3/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Failure category: controller lost/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Prompt: 2048 chars, hash hash-1234/).length).toBeGreaterThan(0);
  });

  it("treats partial-complete background runs as warning done, not failed", () => {
    const project = createViewProjectFixture({ id: "project-partial-run" });
    const now = "2026-04-28T12:00:00.000Z";
    const job: BackgroundJob = {
      id: "job-partial-run",
      projectId: project.id,
      automationThreadId: "thread-automation",
      kind: "ai-routine",
      name: "Partial routine",
      status: "enabled",
      riskLevel: "safe",
      definition: {
        kind: "ai-routine",
        prompt: "Inspect partial."
      },
      schedule: {
        type: "interval",
        intervalSeconds: 600,
        nextRunAt: now,
        sourceText: "10m"
      },
      scheduleInput: "10m",
      createdAt: now,
      updatedAt: now
    };
    const run: BackgroundJobRun = {
      id: "run-partial",
      jobId: job.id,
      projectId: project.id,
      automationThreadId: job.automationThreadId,
      triggerSource: "schedule",
      status: "partial-complete",
      riskLevel: "safe",
      approvalStatus: "approved",
      skippedOccurrenceCount: 0,
      summary: "Useful partial output.",
      failureMessage: "Some subagent work failed.",
      queuedAt: now,
      startedAt: now,
      completedAt: now,
      createdAt: now,
      updatedAt: now,
      events: []
    };
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        activeLeftTab: "runs",
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        },
        backgroundJobs: {
          jobs: [job],
          runs: [run],
          templates: []
        },
        jobsRunFilter: "failed",
        jobsPanePreferences: {
          segment: "inbox",
          search: "",
          jobSort: "updated",
          runSort: "updated"
        }
      })
    );

    render(() => <BackgroundJobsPanel variant="left" segment="runs" />);
    expect(screen.queryByText("Partial routine")).toBeNull();

    cleanup();
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        activeLeftTab: "runs",
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        },
        backgroundJobs: {
          jobs: [job],
          runs: [run],
          templates: []
        },
        jobsRunFilter: "done",
        jobsPanePreferences: {
          segment: "inbox",
          search: "",
          jobSort: "updated",
          runSort: "updated"
        }
      })
    );

    render(() => <BackgroundJobsPanel variant="left" segment="runs" />);
    expect(screen.getByText("Partial routine")).toBeTruthy();
    expect(screen.getByText("partial-complete")).toBeTruthy();
  });
});
