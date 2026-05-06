import { describe, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import {
  createAssistantId,
  createAssistantLearningId,
  createAssistantQuestionId,
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
  resolveShellTimeoutMs,
  startBackgroundRunLivenessHeartbeat
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

function saveAssistant(repository: WorkspaceRepository, projectId: string) {
  const now = new Date().toISOString();
  const assistantId = createAssistantId();
  repository.saveAssistant({
    id: assistantId,
    name: "Kojima",
    scope: "project",
    projectId,
    description: "Browser game evaluator.",
    personalityPrompt: "Be direct.",
    jobPrompt: "Evaluate browser games.",
    agentId: "pi",
    runState: "active",
    bootstrapState: "completed",
    failureStreakCount: 0,
    circuitBreakerState: "closed",
    latestActivityAt: now,
    unreadQuestionCount: 0,
    createdAt: now,
    updatedAt: now
  });
  repository.saveAssistantLearning({
    id: createAssistantLearningId(),
    assistantId,
    summary: "For sweep passes, pick a random browser-playable game unless told otherwise.",
    source: "test",
    confidence: "high",
    createdAt: now
  });
  return assistantId;
}

function createAssistantRoutineJob(projectId: string, assistantId: string, automationThreadId: string, now: string): BackgroundJob {
  return {
    id: createBackgroundJobId(),
    projectId,
    assistantId,
    automationThreadId,
    kind: "ai-routine",
    name: "Kojima patrol",
    status: "enabled",
    riskLevel: "safe",
    definition: {
      kind: "ai-routine",
      prompt: "Run browser game sweep.",
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

class ReadyRoutineAdapter implements PiAgentAdapter {
  readonly calls: PiAgentPromptRequest[] = [];

  async runPrompt(request: PiAgentPromptRequest): Promise<PiAgentPromptResult> {
    this.calls.push(request);
    if (request.kind === "planner") {
      return {
        text: JSON.stringify({
          type: "ready",
          difficultyScore: 10,
          summary: "Run routine.",
          executionModelId: "openai/gpt-5.4",
          usesSubagents: false,
          subtasks: [],
          finalExecutionBrief: "Run assistant routine.",
          prerequisites: [],
          contracts: []
        })
      };
    }
    return { text: "Routine done." };
  }

  async startExecution(request: PiAgentPromptRequest): Promise<PiAgentExecutionController> {
    this.calls.push(request);
    return {
      result: Promise.resolve({ text: "Routine done." }),
      continueWithPrompt: async () => ({ text: "Routine done." }),
      abort: async () => {},
      dispose() {}
    };
  }

  setApiKey() {}

  hasApiKey() {
    return true;
  }
}

function plannerChoices(answerText: string = "Use existing guidance.") {
  return [
    {
      id: "choice-1",
      label: "Use guidance",
      description: "Use existing guidance.",
      answerText,
      recommended: true
    },
    {
      id: "choice-2",
      label: "Wait",
      description: "Wait for user input.",
      answerText: "Wait for user input.",
      recommended: false
    },
    {
      id: "choice-3",
      label: "Skip",
      description: "Skip this pass.",
      answerText: "Skip this pass.",
      recommended: false
    }
  ];
}

class AutoQuestionThenReadyAdapter implements PiAgentAdapter {
  readonly calls: PiAgentPromptRequest[] = [];
  private plannerCalls = 0;

  async runPrompt(request: PiAgentPromptRequest): Promise<PiAgentPromptResult> {
    this.calls.push(request);
    if (request.kind === "planner") {
      this.plannerCalls += 1;
      if (this.plannerCalls === 1) {
        return {
          text: JSON.stringify({
            type: "question",
            summary: "Need target",
            question: {
              id: "question-1",
              prompt: "What should I use as the concrete sweep input for this pass?",
              choices: plannerChoices(),
              required: true
            }
          })
        };
      }
      return {
        text: JSON.stringify({
          type: "ready",
          difficultyScore: 10,
          summary: "Run routine with target guidance.",
          executionModelId: "openai/gpt-5.4",
          usesSubagents: false,
          subtasks: [],
          finalExecutionBrief: "Run assistant routine.",
          prerequisites: [],
          contracts: []
        })
      };
    }
    return { text: "Routine done." };
  }

  async startExecution(request: PiAgentPromptRequest): Promise<PiAgentExecutionController> {
    this.calls.push(request);
    return {
      result: Promise.resolve({ text: "Routine done." }),
      continueWithPrompt: async () => ({ text: "Routine done." }),
      abort: async () => {},
      dispose() {}
    };
  }

  setApiKey() {}

  hasApiKey() {
    return true;
  }
}

class RepeatingAutoQuestionAdapter extends AutoQuestionThenReadyAdapter {
  async runPrompt(request: PiAgentPromptRequest): Promise<PiAgentPromptResult> {
    this.calls.push(request);
    if (request.kind === "planner") {
      return {
        text: JSON.stringify({
          type: "question",
          summary: "Need target",
          question: {
            id: "question-1",
            prompt: "What should I use as the concrete sweep input for this pass?",
            choices: plannerChoices(),
            required: true
          }
        })
      };
    }
    return { text: "Routine done." };
  }
}

class ScheduleQuestionAdapter extends AutoQuestionThenReadyAdapter {
  async runPrompt(request: PiAgentPromptRequest): Promise<PiAgentPromptResult> {
    this.calls.push(request);
    if (request.kind === "planner") {
      return {
        text: JSON.stringify({
          type: "question",
          summary: "Need schedule",
          question: {
            id: "question-1",
            prompt: "What schedule should this assistant-owned job use?",
            choices: plannerChoices("Every hour."),
            required: true
          }
        })
      };
    }
    return { text: "Routine done." };
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
  test("liveness heartbeat touches running main execution and stops after cleanup", async () => {
    const repository = createRepository();
    const projectRoot = path.join(createTempDir(), `repo-${crypto.randomUUID()}`);
    mkdirSync(projectRoot, { recursive: true });
    const project = repository.addProject(projectRoot);
    const now = new Date().toISOString();
    const job = createAssistantRoutineJob(project.id, saveAssistant(repository, project.id), createThreadId(), now);
    repository.saveBackgroundJob(job);
    const run = repository.createBackgroundJobRun({
      jobId: job.id,
      projectId: job.projectId,
      assistantId: job.assistantId,
      automationThreadId: job.automationThreadId,
      triggerSource: "schedule",
      status: "running",
      riskLevel: job.riskLevel,
      approvalStatus: "approved"
    });
    const updates: BackgroundJobRun[] = [];

    const stop = startBackgroundRunLivenessHeartbeat(
      {
        repository,
        onRunUpdated(updatedRun) {
          updates.push(updatedRun);
        }
      },
      run.id,
      10
    );
    await new Promise((resolve) => setTimeout(resolve, 35));
    stop();
    const heartbeatCountAfterStop = updates.length;
    await new Promise((resolve) => setTimeout(resolve, 35));

    const updatedRun = repository.getBackgroundJobRun(run.id);
    expect(heartbeatCountAfterStop).toBeGreaterThanOrEqual(2);
    expect(updates).toHaveLength(heartbeatCountAfterStop);
    expect(updatedRun?.heartbeatStage).toBe("execution-running");
    expect(updatedRun?.heartbeatDetail).toBe("Main Codex CLI execution still running");
  });

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

  test("auto-answers assistant-owned nonblocking planner questions and reruns planning once", async () => {
    const repository = createRepository();
    const projectRoot = path.join(createTempDir(), `repo-${crypto.randomUUID()}`);
    mkdirSync(projectRoot, { recursive: true });
    const project = repository.addProject(projectRoot);
    const now = new Date().toISOString();
    const assistantId = saveAssistant(repository, project.id);
    const job = createAssistantRoutineJob(project.id, assistantId, createThreadId(), now);
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
    const adapter = new AutoQuestionThenReadyAdapter();

    const result = await executeBackgroundJobRun({
      repository,
      adapter,
      agentId: "pi",
      job: savedJob,
      run,
      providerBrand: "gpt",
      planningModelId: "openai/gpt-5.4",
      executionModelId: "openai/gpt-5.4",
      debugEnabled: false
    });

    const linkedRun = repository.getRun(project.id, result.linkedAgentRunId!);
    expect(result.status).toBe("succeeded");
    expect(adapter.calls.filter((call) => call.kind === "planner")).toHaveLength(2);
    expect(linkedRun?.questions[0]?.status).toBe("answered");
    expect(result.events.some((event) => event.stage === "question-auto-resolved")).toBe(true);
  });

  test("keeps assistant-owned schedule questions awaiting user input", async () => {
    const repository = createRepository();
    const projectRoot = path.join(createTempDir(), `repo-${crypto.randomUUID()}`);
    mkdirSync(projectRoot, { recursive: true });
    const project = repository.addProject(projectRoot);
    const now = new Date().toISOString();
    const assistantId = saveAssistant(repository, project.id);
    const job = createAssistantRoutineJob(project.id, assistantId, createThreadId(), now);
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
      adapter: new ScheduleQuestionAdapter(),
      agentId: "pi",
      job: savedJob,
      run,
      providerBrand: "gpt",
      planningModelId: "openai/gpt-5.4",
      executionModelId: "openai/gpt-5.4",
      debugEnabled: false
    });

    expect(result.status).toBe("awaiting-user-input");
    expect(repository.getRun(project.id, result.linkedAgentRunId!)?.questions[0]?.status).toBe("deferred");
  });

  test("skips assistant-owned routine when planner repeats nonblocking question after auto-resolution cap", async () => {
    const repository = createRepository();
    const projectRoot = path.join(createTempDir(), `repo-${crypto.randomUUID()}`);
    mkdirSync(projectRoot, { recursive: true });
    const project = repository.addProject(projectRoot);
    const now = new Date().toISOString();
    const assistantId = saveAssistant(repository, project.id);
    const job = createAssistantRoutineJob(project.id, assistantId, createThreadId(), now);
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
      adapter: new RepeatingAutoQuestionAdapter(),
      agentId: "pi",
      job: savedJob,
      run,
      providerBrand: "gpt",
      planningModelId: "openai/gpt-5.4",
      executionModelId: "openai/gpt-5.4",
      debugEnabled: false
    });

    expect(result.status).toBe("skipped");
    expect(result.summary).toBe("Planner kept asking nonblocking question after auto-resolution");
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
    expect(result.lastHeartbeatAt).toBeTruthy();
    expect(result.heartbeatStage).toBe("succeeded");
    expect(updates.some((updatedRun) => updatedRun.status === "running" && updatedRun.events.some((event) => event.stage === "spawned"))).toBe(true);
    expect(updates.some((updatedRun) => updatedRun.status === "running" && updatedRun.events.some((event) => event.stage === "stdout" && event.detail?.includes("stream one")))).toBe(true);
    expect(updates.some((updatedRun) => updatedRun.heartbeatStage === "stdout")).toBe(true);
  });

  test("moves stale interval schedule past completion", async () => {
    const repository = createRepository();
    const projectRoot = path.join(createTempDir(), `repo-${crypto.randomUUID()}`);
    mkdirSync(projectRoot, { recursive: true });
    const project = repository.addProject(projectRoot);
    const automationThreadId = createThreadId();
    const staleNextRunAt = new Date(Date.now() - 60_000).toISOString();
    const job: BackgroundJob = {
      id: createBackgroundJobId(),
      projectId: project.id,
      automationThreadId,
      kind: "shell",
      name: "Stale interval shell",
      status: "enabled",
      riskLevel: "safe",
      definition: {
        kind: "shell",
        executable: process.execPath,
        args: ["-e", ""],
        timeoutSeconds: 60
      },
      schedule: {
        type: "interval",
        intervalSeconds: 600,
        nextRunAt: staleNextRunAt,
        sourceText: "10m"
      },
      scheduleInput: "10m",
      nextRunAt: staleNextRunAt,
      createdAt: staleNextRunAt,
      updatedAt: staleNextRunAt
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

    await executeBackgroundJobRun({
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

    const completedJob = repository.getBackgroundJob(job.id)!;
    expect(completedJob.lastRunAt).toBeDefined();
    expect(new Date(completedJob.nextRunAt ?? 0).getTime()).toBeGreaterThan(new Date(completedJob.lastRunAt ?? 0).getTime());
  });

  test("moves failed shell interval schedule past completion", async () => {
    const repository = createRepository();
    const projectRoot = path.join(createTempDir(), `repo-${crypto.randomUUID()}`);
    mkdirSync(projectRoot, { recursive: true });
    const project = repository.addProject(projectRoot);
    const automationThreadId = createThreadId();
    const staleNextRunAt = new Date(Date.now() - 60_000).toISOString();
    const job: BackgroundJob = {
      id: createBackgroundJobId(),
      projectId: project.id,
      automationThreadId,
      kind: "shell",
      name: "Failing interval shell",
      status: "enabled",
      riskLevel: "safe",
      definition: {
        kind: "shell",
        executable: process.execPath,
        args: ["-e", "process.exit(1)"],
        timeoutSeconds: 60
      },
      schedule: {
        type: "interval",
        intervalSeconds: 600,
        nextRunAt: staleNextRunAt,
        sourceText: "10m"
      },
      scheduleInput: "10m",
      nextRunAt: staleNextRunAt,
      createdAt: staleNextRunAt,
      updatedAt: staleNextRunAt
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

    const completedJob = repository.getBackgroundJob(job.id)!;
    expect(result.status).toBe("failed");
    expect(completedJob.lastRunAt).toBeDefined();
    expect(new Date(completedJob.nextRunAt ?? 0).getTime()).toBeGreaterThan(new Date(completedJob.lastRunAt ?? 0).getTime());
  });

  test("assistant-owned routine prompt renders cleaned profile and guidance context", async () => {
    const repository = createRepository();
    const projectRoot = path.join(createTempDir(), `repo-${crypto.randomUUID()}`);
    mkdirSync(projectRoot, { recursive: true });
    const project = repository.addProject(projectRoot);
    const now = new Date().toISOString();
    const assistantId = createAssistantId();
    repository.saveAssistant({
      id: assistantId,
      name: "Release watcher",
      scope: "project",
      projectId: project.id,
      description: "Tracks release risk.",
      personalityPrompt: "Be direct.",
      jobPrompt: "Watch release blockers.",
      agentId: "pi",
      runState: "active",
      bootstrapState: "completed",
      failureStreakCount: 0,
      circuitBreakerState: "closed",
      latestActivityAt: now,
      unreadQuestionCount: 0,
      createdAt: now,
      updatedAt: now
    });
    repository.saveAssistantLearning({
      id: createAssistantLearningId(),
      assistantId,
      summary: "Prioritize smoke-test failures before polish.",
      source: "question:test",
      confidence: "high",
      createdAt: now
    });
    repository.saveAssistantLearning({
      id: createAssistantLearningId(),
      assistantId,
      summary: "Compacted release guidance stays concise.",
      source: "compaction:test",
      confidence: "high",
      createdAt: now,
      kind: "summary",
      compactedAt: now
    });
    repository.saveAssistantLearning({
      id: createAssistantLearningId(),
      assistantId,
      summary: "merged durable assistant guidance",
      source: "compaction:test",
      confidence: "high",
      createdAt: new Date(Date.now() + 1).toISOString(),
      kind: "summary",
      compactedAt: now
    });
    const question = repository.saveAssistantQuestion({
      id: createAssistantQuestionId(),
      assistantId,
      prompt: "Which release area should this patrol inspect?",
      status: "pending",
      askedAt: now
    });
    repository.answerAssistantQuestion(assistantId, question.id, "Inspect release blockers first.");
    for (let index = 0; index < 20; index += 1) {
      repository.saveAssistantLearning({
        id: createAssistantLearningId(),
        assistantId,
        summary: `Background routine fact ${index}`,
        source: "test",
        confidence: "medium",
        createdAt: new Date(Date.now() + index).toISOString()
      });
    }
    const job: BackgroundJob = {
      id: createBackgroundJobId(),
      projectId: project.id,
      assistantId,
      automationThreadId: createThreadId(),
      kind: "ai-routine",
      name: "Release patrol",
      status: "enabled",
      riskLevel: "safe",
      definition: {
        kind: "ai-routine",
        prompt: "Inspect release status.",
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
      triggerSource: "manual",
      status: "queued",
      riskLevel: savedJob.riskLevel,
      approvalStatus: "approved"
    });
    const adapter = new ReadyRoutineAdapter();

    await executeBackgroundJobRun({
      repository,
      adapter,
      agentId: "pi",
      job: savedJob,
      run,
      providerBrand: "gpt",
      planningModelId: "openai/gpt-5.4",
      executionModelId: "openai/gpt-5.4",
      debugEnabled: false
    });

    expect(adapter.calls[0]?.prompt).toContain("# IDENTITY: Release watcher");
    expect(adapter.calls[0]?.prompt).toContain("Personality: Be direct.");
    expect(adapter.calls[0]?.prompt).toContain("Description: Tracks release risk.");
    expect(adapter.calls[0]?.prompt).toContain("# OPERATIONAL LOGIC (The Job)\nWatch release blockers.");
    expect(adapter.calls[0]?.prompt).toContain("# ACTIVE MISSION (The Request)\nInspect release status.");
    expect(adapter.calls[0]?.prompt).toContain("# Durable Guidance");
    expect(adapter.calls[0]?.prompt).toContain("Recent durable answers:");
    expect(adapter.calls[0]?.prompt).toContain("Inspect release blockers first.");
    expect(adapter.calls[0]?.prompt).toContain("Relevant learnings:");
    expect(adapter.calls[0]?.prompt).not.toContain("Role:");
    expect(adapter.calls[0]?.prompt).not.toContain("First assistant message requirement:");
    expect(adapter.calls[0]?.prompt).not.toContain("Concise learnings report:");
    expect(adapter.calls[0]?.prompt).toContain("Prioritize smoke-test failures before polish.");
    expect(adapter.calls[0]?.prompt).toContain("Compacted release guidance stays concise.");
    expect(adapter.calls[0]?.prompt).not.toContain("merged durable assistant guidance");
    expect(adapter.calls[0]?.prompt).not.toContain("Background routine fact 0");
  });
});
