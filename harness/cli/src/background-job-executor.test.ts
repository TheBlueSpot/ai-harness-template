import { describe, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import {
  createBackgroundJobId,
  createThreadId,
  type BackgroundJob,
  type BackgroundJobRun
} from "../../shared/protocol";
import {
  DEFAULT_SHELL_TIMEOUT_SECONDS,
  executeBackgroundJobRun,
  MAX_SHELL_TIMEOUT_SECONDS,
  MIN_SHELL_TIMEOUT_SECONDS,
  resolveShellTimeoutMs
} from "./background-job-executor";
import type { PiAgentAdapter, PiAgentExecutionController, PiAgentPromptRequest, PiAgentPromptResult } from "./pi-agent-adapter";
import { WorkspaceRepository } from "./workspace-repository";

function createTempDir() {
  const tempRoot = path.join(process.cwd(), ".tmp-test-data");
  mkdirSync(tempRoot, { recursive: true });
  return tempRoot;
}

function createRepository() {
  const dbPath = path.join(createTempDir(), `background-job-executor-${crypto.randomUUID()}.sqlite`);
  return new WorkspaceRepository(dbPath, process.cwd(), { durability: "test-fast" });
}

class QuestionAdapter implements PiAgentAdapter {
  readonly calls: PiAgentPromptRequest[] = [];

  async runPrompt(request: PiAgentPromptRequest): Promise<PiAgentPromptResult> {
    this.calls.push(request);
    return {
      text: JSON.stringify({
        type: "question",
        summary: "Need input",
        question: {
          id: "question-1",
          prompt: "Which target should I inspect?",
          choices: [
            {
              id: "choice-1",
              label: "Use judgment",
              description: "Pick target.",
              answerText: "Use judgment.",
              recommended: true
            },
            {
              id: "choice-2",
              label: "Wait",
              description: "Wait.",
              answerText: "Wait.",
              recommended: false
            },
            {
              id: "choice-3",
              label: "Skip",
              description: "Skip.",
              answerText: "Skip.",
              recommended: false
            }
          ],
          required: true
        }
      })
    };
  }

  async startExecution(): Promise<PiAgentExecutionController> {
    throw new Error("not used");
  }

  setApiKey() {}

  hasApiKey() {
    return true;
  }
}

describe("resolveShellTimeoutMs", () => {
  test("passes valid positive seconds through as milliseconds", () => {
    expect(resolveShellTimeoutMs(30)).toBe(30 * 1000);
    expect(resolveShellTimeoutMs(MAX_SHELL_TIMEOUT_SECONDS)).toBe(MAX_SHELL_TIMEOUT_SECONDS * 1000);
  });

  test("floors fractional seconds to whole seconds", () => {
    expect(resolveShellTimeoutMs(1.7)).toBe(MIN_SHELL_TIMEOUT_SECONDS * 1000);
    expect(resolveShellTimeoutMs(5.9)).toBe(5 * 1000);
  });

  test("clamps above-max values to the ceiling", () => {
    expect(resolveShellTimeoutMs(MAX_SHELL_TIMEOUT_SECONDS + 10)).toBe(MAX_SHELL_TIMEOUT_SECONDS * 1000);
  });

  test("falls back to default on zero, negative, or NaN input", () => {
    const fallback = DEFAULT_SHELL_TIMEOUT_SECONDS * 1000;
    expect(resolveShellTimeoutMs(0)).toBe(fallback);
    expect(resolveShellTimeoutMs(-1)).toBe(fallback);
    expect(resolveShellTimeoutMs(Number.NaN)).toBe(fallback);
    expect(resolveShellTimeoutMs(Number.POSITIVE_INFINITY)).toBe(fallback);
  });

  test("falls back to default on non-numeric input", () => {
    const fallback = DEFAULT_SHELL_TIMEOUT_SECONDS * 1000;
    expect(resolveShellTimeoutMs(undefined)).toBe(fallback);
    expect(resolveShellTimeoutMs(null)).toBe(fallback);
    expect(resolveShellTimeoutMs("not a number")).toBe(fallback);
  });

  test("accepts numeric strings as defense-in-depth against stale rows", () => {
    expect(resolveShellTimeoutMs("45")).toBe(45 * 1000);
  });
});

describe("executeBackgroundJobRun", () => {
  test("persists deferred questions on inactive automation threads", async () => {
    const repository = createRepository();
    const projectRoot = path.join(createTempDir(), `repo-${crypto.randomUUID()}`);
    mkdirSync(projectRoot, { recursive: true });
    const project = repository.addProject(projectRoot);
    const automationThreadId = createThreadId();
    const now = new Date().toISOString();
    const job: BackgroundJob = {
      id: createBackgroundJobId(),
      projectId: project.id,
      automationThreadId,
      kind: "ai-routine",
      name: "Question job",
      status: "enabled",
      riskLevel: "safe",
      definition: {
        kind: "ai-routine",
        prompt: "Inspect repo.",
        planExecutionMode: "countdown",
        subagentWorktreeStrategy: "separate-worktrees"
      },
      schedule: {
        type: "interval",
        intervalSeconds: 600,
        nextRunAt: now,
        sourceText: "10m"
      },
      scheduleInput: "10m",
      nextRunAt: now,
      createdAt: now,
      updatedAt: now
    };
    repository.saveBackgroundJob(job);
    const savedJob = repository.getBackgroundJob(job.id)!;
    const run = repository.createBackgroundJobRun({
      jobId: savedJob.id,
      projectId: savedJob.projectId,
      assistantId: savedJob.assistantId,
      automationThreadId: savedJob.automationThreadId,
      triggerSource: "schedule",
      status: "queued",
      riskLevel: savedJob.riskLevel,
      approvalStatus: "approved"
    });

    const result = await executeBackgroundJobRun({
      repository,
      adapter: new QuestionAdapter(),
      agentId: "pi",
      job: savedJob,
      run,
      providerBrand: "gpt",
      planningModelId: "openai/gpt-5.4",
      executionModelId: "openai/gpt-5.4",
      debugEnabled: false
    });

    const agentRun = repository.getRun(project.id, result.linkedAgentRunId!);
    expect(result.status).toBe("awaiting-user-input");
    expect(agentRun?.threadId).toBe(savedJob.automationThreadId);
    expect(agentRun?.questions[0]?.status).toBe("deferred");
    expect(repository.loadNotificationInboxState().items.some((item) => item.kind === "planning-question")).toBe(true);
  });

  test("emits run snapshots as shell execution log events append", async () => {
    const repository = createRepository();
    const projectRoot = path.join(createTempDir(), `repo-${crypto.randomUUID()}`);
    mkdirSync(projectRoot, { recursive: true });
    const project = repository.addProject(projectRoot);
    const automationThreadId = createThreadId();
    const now = new Date().toISOString();
    const job: BackgroundJob = {
      id: createBackgroundJobId(),
      projectId: project.id,
      automationThreadId,
      kind: "shell",
      name: "Streaming shell",
      status: "enabled",
      riskLevel: "slightly-unsafe",
      definition: {
        kind: "shell",
        executable: process.execPath,
        args: ["-e", "console.log('stream one')"],
        timeoutSeconds: 60
      },
      schedule: {
        type: "interval",
        intervalSeconds: 600,
        nextRunAt: now,
        sourceText: "10m"
      },
      scheduleInput: "10m",
      nextRunAt: now,
      createdAt: now,
      updatedAt: now
    };
    repository.saveBackgroundJob(job);
    const savedJob = repository.getBackgroundJob(job.id)!;
    const run = repository.createBackgroundJobRun({
      jobId: savedJob.id,
      projectId: savedJob.projectId,
      assistantId: savedJob.assistantId,
      automationThreadId: savedJob.automationThreadId,
      triggerSource: "manual",
      status: "queued",
      riskLevel: savedJob.riskLevel,
      approvalStatus: "approved"
    });
    const updates: BackgroundJobRun[] = [];

    const result = await executeBackgroundJobRun({
      repository,
      adapter: new QuestionAdapter(),
      agentId: "pi",
      job: savedJob,
      run,
      providerBrand: "gpt",
      planningModelId: "openai/gpt-5.4",
      executionModelId: "openai/gpt-5.4",
      debugEnabled: false,
      onRunUpdated(updatedRun) {
        updates.push(updatedRun);
      }
    });

    expect(result.status).toBe("succeeded");
    expect(updates.some((updatedRun) => updatedRun.status === "running" && updatedRun.events.some((event) => event.stage === "spawned"))).toBe(true);
    expect(updates.some((updatedRun) => updatedRun.status === "running" && updatedRun.events.some((event) => event.stage === "stdout" && event.detail?.includes("stream one")))).toBe(true);
  });
});
