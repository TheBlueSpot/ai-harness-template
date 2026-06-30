import { expect, test } from "bun:test";
import { createBackgroundJobId, createThreadId, type BackgroundJob } from "./protocol";
import { compileBackgroundJobIntentContract, renderIntentContractPrompt } from "./intent-contract";

function backgroundJobFixture(overrides: Partial<BackgroundJob> = {}): BackgroundJob {
  const now = new Date().toISOString();
  return {
    id: createBackgroundJobId(),
    projectId: "project-1",
    automationThreadId: createThreadId(),
    kind: "ai-routine",
    name: "SaaS factory slice",
    description: "Build a usable billing web app slice with proof.",
    status: "enabled",
    riskLevel: "unsafe",
    definition: {
      kind: "ai-routine",
      prompt: "Update docs about possible SaaS ideas."
    },
    schedule: {
      type: "interval",
      intervalSeconds: 3600,
      nextRunAt: now,
      sourceText: "hourly"
    },
    scheduleInput: "hourly",
    nextRunAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

test("background job intent contract uses edited description over stale prompt", () => {
  const contract = compileBackgroundJobIntentContract(backgroundJobFixture());
  const rendered = renderIntentContractPrompt(contract);

  expect(contract.objective).toBe("Build a usable billing web app slice with proof.");
  expect(contract.artifactTypes).toContain("app-code");
  expect(contract.artifactTypes).toContain("test-evidence");
  expect(rendered).toContain("Objective: Build a usable billing web app slice with proof.");
  expect(rendered).toContain("Definition prompt: Update docs about possible SaaS ideas.");
  expect(rendered).toContain("Docs-only completion unless docs are requested or implementation is blocked.");
});

test("background job intent contract ignores generic display descriptions", () => {
  const contract = compileBackgroundJobIntentContract(
    backgroundJobFixture({
      description: "Assistant-owned job created from project chat.",
      definition: {
        kind: "ai-routine",
        prompt: "Build a SaaS factory that produces usable web app slices with tests."
      }
    })
  );

  expect(contract.objective).toBe("Build a SaaS factory that produces usable web app slices with tests.");
  expect(contract.artifactTypes).toContain("app-code");
  expect(contract.artifactTypes).toContain("automation-code");
  expect(contract.artifactTypes).toContain("test-evidence");
});
