/** @jsxImportSource solid-js */
import { beforeEach, expect, it } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import type { BackgroundJob, BackgroundJobRun } from "../../../shared/protocol";
import { createInitialViewState, harnessStore, readBrowserUiSession } from "../harness-store";
import { createUiTest } from "../utils/tests/test-harness";
import { clearBrowserStateForTests, seedHarnessStoreForTests } from "../utils/tests/store-test-utils";
import { createHarnessStateFixture, createViewProjectFixture } from "../utils/tests/test-fixtures";
import { BackgroundJobsPanel } from "./background-jobs-panel";

createUiTest("BackgroundJobsPanel", () => {
  beforeEach(() => {
    clearBrowserStateForTests();
  });

  it("persists and restores jobs segment and run filter", () => {
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
    fireEvent.click(screen.getByRole("button", { name: "Jobs" }));
    fireEvent.click(screen.getByRole("button", { name: "Inbox" }));
    fireEvent.click(screen.getByRole("button", { name: "Failed" }));

    expect(harnessStore.state.jobsPanePreferences.segment).toBe("inbox");
    expect(harnessStore.state.jobsRunFilter).toBe("failed");
    expect(readBrowserUiSession().jobsPane).toMatchObject({
      segment: "inbox",
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

    expect(screen.getByRole("button", { name: "Failed" }).className).toContain("bg-(--accent)");
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
  });

  it("shows running instead of next-run n/a for active recurring jobs", () => {
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

    render(() => <BackgroundJobsPanel />);

    expect(screen.getAllByText("Next: running").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Next: n\/a/)).toBeNull();
  });
});
