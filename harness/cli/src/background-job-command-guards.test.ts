import { describe, expect, test } from "bun:test";
import type { BackgroundJobRun } from "../../shared/protocol";
import { assertBackgroundRunTransition } from "./background-job-command-guards";

const baseRun: BackgroundJobRun = {
  id: "run-1",
  jobId: "job-1",
  projectId: "project-1",
  automationThreadId: "thread-1",
  triggerSource: "manual",
  status: "awaiting-approval",
  riskLevel: "unsafe",
  approvalStatus: "pending",
  skippedOccurrenceCount: 0,
  queuedAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  events: []
};

describe("background job command guards", () => {
  test("allows only pending approval transitions", () => {
    expect(() => assertBackgroundRunTransition(baseRun, "approve")).not.toThrow();
    expect(() =>
      assertBackgroundRunTransition(
        {
          ...baseRun,
          status: "running",
          approvalStatus: "approved"
        },
        "approve"
      )
    ).toThrow();
  });

  test("blocks terminal stop and active retry", () => {
    expect(() => assertBackgroundRunTransition({ ...baseRun, status: "succeeded" }, "stop")).toThrow();
    expect(() => assertBackgroundRunTransition({ ...baseRun, status: "running" }, "retry")).toThrow();
    expect(() => assertBackgroundRunTransition({ ...baseRun, status: "cancelled" }, "retry")).not.toThrow();
  });
});
