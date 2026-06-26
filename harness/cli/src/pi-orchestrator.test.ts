import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildExecutionPlan, buildExecutionPrompt, chooseExecutionPath, executePlanPrerequisites, executeReadyRun, runPlannerTurn, shouldUseReadOnlyExecutionTools } from "./pi-orchestrator";
import type { PiAgentAdapter, PiAgentExecutionController, PiAgentPromptRequest, PiAgentPromptResult } from "./pi-agent-adapter";
import type { ExecutionPlan, ModeDefinition, PlannerReadyTurn, ProviderModelId } from "../../shared/protocol";
import { builtinModes, resolveModeExecutionAccess } from "../../shared/modes";
import { WorkspaceRepository } from "./workspace-repository";
import { RunBudgetAgentAdapter } from "./run-budget-agent-adapter";

describe("pi execution router", () => {
  test("routes low difficulty tasks to the main agent", () => {
    expect(chooseExecutionPath(40)).toBe("main");
  });

  test("routes high difficulty tasks to subagents", () => {
    expect(chooseExecutionPath(41)).toBe("subagents");
  });

  test("preserves high planner effort while scheduling with bounded effort", () => {
    const readyPlan = createReadyPlan();
    readyPlan.contracts![0] = {
      ...readyPlan.contracts![0]!,
      effortPoints: 12
    };

    const executionPlan = buildExecutionPlan({
      runId: "run-high-effort",
      planningModelId: "openai/gpt-5.4",
      plannerResult: readyPlan,
      subagentWorktreeStrategy: "same-worktree",
      planExecutionMode: "approve",
      planExecutionDelaySeconds: 0,
      correctnessIterationMode: "ask-before-iterate",
      iteration: 1,
      origin: "initial"
    });

    expect(executionPlan.contracts[0]?.effortPoints).toBe(12);
    expect(executionPlan.actualSubagentCount).toBeGreaterThanOrEqual(0);
  });

  test("omits persisted system status rows from execution transcript", () => {
    const prompt = buildExecutionPrompt(
      [
        {
          id: "message-user",
          role: "user",
          content: "user task",
          createdAt: new Date().toISOString()
        },
        {
          id: "message-system",
          role: "system",
          content: "Planning task.",
          createdAt: new Date().toISOString()
        },
        {
          id: "message-assistant",
          role: "assistant",
          content: "assistant reply",
          createdAt: new Date().toISOString()
        }
      ],
      "Finish work"
    );

    expect(prompt).toContain("USER: user task");
    expect(prompt).toContain("ASSISTANT: assistant reply");
    expect(prompt).not.toContain("SYSTEM: Planning task.");
  });

  test("uses execution access instead of tool policy to decide read-only execution", () => {
    const createMode = (
      toolPolicy: ModeDefinition["toolPolicy"],
      executionAccess = resolveModeExecutionAccess({
        toolPolicy,
        executionAccess: undefined
      })
    ): ModeDefinition => ({
      id: toolPolicy,
      scope: "builtin",
      label: toolPolicy,
      description: toolPolicy,
      plannerPrompt: "plan",
      executionPrompt: "exec",
      toolPolicy,
      executionAccess,
      updatedAt: "builtin"
    });

    expect(shouldUseReadOnlyExecutionTools()).toBe(false);
    expect(
      shouldUseReadOnlyExecutionTools({
        mode: createMode("read-heavy")
      })
    ).toBe(true);
    expect(
      shouldUseReadOnlyExecutionTools({
        mode: createMode("review-only")
      })
    ).toBe(true);
    expect(
      shouldUseReadOnlyExecutionTools({
        mode: createMode("full-access")
      })
    ).toBe(false);
    expect(
      shouldUseReadOnlyExecutionTools({
        mode: createMode("read-heavy", "workspace-write")
      })
    ).toBe(false);
    expect(
      shouldUseReadOnlyExecutionTools({
        mode: builtinModes.find((mode) => mode.id === "plan")
      })
    ).toBe(false);
  });

  test("uses provided planning model id instead of provider default", async () => {
    const calls: PiAgentPromptRequest[] = [];
    const adapter: PiAgentAdapter = {
      async runPrompt(request: PiAgentPromptRequest): Promise<PiAgentPromptResult> {
        calls.push(request);
        return {
          text: JSON.stringify({
            type: "ready",
            difficultyScore: 20,
            summary: "Plan",
            executionModelId: "openai/gpt-5.4",
            usesSubagents: false,
            subtasks: [],
            finalExecutionBrief: "Do work"
          })
        };
      },
      async startExecution(): Promise<PiAgentExecutionController> {
        throw new Error("not used");
      },
      setApiKey() {},
      hasApiKey() {
        return false;
      }
    };

    const result = await runPlannerTurn(adapter, {
      cwd: "C:\\repo",
      sessionId: "thread-1",
      messages: [],
      latestUserPrompt: "Do work",
      runId: "run-1",
      agentId: "codex-cli",
      providerBrand: "gemini",
      planningModelId: "openai/gpt-5.4",
      executionModelId: "openai/gpt-5.4",
      subagentWorktreeStrategy: "same-worktree",
      planExecutionMode: "approve",
      planExecutionDelaySeconds: 0,
      correctnessIterationMode: "ask-before-iterate"
    });

    expect(calls[0]?.kind).toBe("planner");
    expect(calls[0]?.modelId).toBe("openai/gpt-5.4");
    expect(result.planningModelId).toBe("openai/gpt-5.4");
  });

  test("adds workspace path guidance for repo-local leading-slash prompts", async () => {
    const calls: PiAgentPromptRequest[] = [];
    const adapter: PiAgentAdapter = {
      async runPrompt(request: PiAgentPromptRequest): Promise<PiAgentPromptResult> {
        calls.push(request);
        return {
          text: JSON.stringify({
            type: "ready",
            difficultyScore: 20,
            summary: "Create /breakout/index.html",
            executionModelId: "openai/gpt-5.4",
            usesSubagents: false,
            subtasks: [],
            finalExecutionBrief: "Create /breakout/index.html"
          })
        };
      },
      async startExecution(): Promise<PiAgentExecutionController> {
        throw new Error("not used");
      },
      setApiKey() {},
      hasApiKey() {
        return false;
      }
    };

    const result = await runPlannerTurn(adapter, {
      cwd: "C:\\repo\\context",
      sessionId: "thread-2",
      messages: [],
      latestUserPrompt: "Put all files in /breakout and create /breakout/index.html",
      runId: "run-2",
      providerBrand: "gpt",
      subagentWorktreeStrategy: "same-worktree",
      planExecutionMode: "approve",
      planExecutionDelaySeconds: 0,
      correctnessIterationMode: "ask-before-iterate"
    });

    expect(calls[0]?.prompt).toContain("Workspace path guidance:");
    expect(calls[0]?.prompt).toContain("Latest user task delta: Put all files in breakout and create breakout/index.html");
    expect(result.executionPlan?.finalExecutionBrief).toBe("Create breakout/index.html");
  });

  test("builds execution prompts with normalized workspace-local leading-slash paths", () => {
    const prompt = buildExecutionPrompt(
      [
        {
          id: "message-user",
          role: "user",
          content: "Create /breakout/index.html",
          createdAt: new Date().toISOString()
        }
      ],
      "Create /breakout/index.html",
      undefined,
      "C:\\repo\\context"
    );

    expect(prompt).toContain("Workspace path guidance:");
    expect(prompt).toContain("Execution brief: Create breakout/index.html");
  });

  test("builds execution prompts with global skill files for projects without repo skills", () => {
    const rootPath = mkdtempSync(path.join(tmpdir(), "harness-global-skill-context-"));
    const previousHome = Bun.env.AI_HARNESS_TEMPLATE_HOME;
    try {
      const homeRoot = path.join(rootPath, "home");
      const projectRoot = path.join(rootPath, "project");
      mkdirSync(path.join(homeRoot, "skills", "assistant-actions"), { recursive: true });
      mkdirSync(path.join(homeRoot, "skills", "grill-me"), { recursive: true });
      mkdirSync(projectRoot, { recursive: true });
      writeFileSync(path.join(homeRoot, "skills", "assistant-actions", "SKILL.md"), "# assistant-actions\n");
      writeFileSync(path.join(homeRoot, "skills", "grill-me", "SKILL.md"), "# grill-me\n");
      Bun.env.AI_HARNESS_TEMPLATE_HOME = homeRoot;

      const prompt = buildExecutionPrompt(
        [
          {
            id: "message-user",
            role: "user",
            content: "what skills do you have available",
            createdAt: new Date().toISOString()
          }
        ],
        "what skills do you have available",
        undefined,
        projectRoot
      );

      expect(prompt).toContain("Available repository/global skill files:");
      expect(prompt).toContain("assistant-actions/SKILL.md");
      expect(prompt).toContain("grill-me/SKILL.md");
      expect(prompt).toContain("include these repository/global skills");
    } finally {
      if (previousHome === undefined) {
        delete Bun.env.AI_HARNESS_TEMPLATE_HOME;
      } else {
        Bun.env.AI_HARNESS_TEMPLATE_HOME = previousHome;
      }
      rmSync(rootPath, { recursive: true, force: true });
    }
  });

  test("same-worktree subagents receive implementation packets and report contract drift without failing", async () => {
    const rootPath = mkdtempSync(path.join(tmpdir(), "harness-subagent-drift-"));
    try {
      runSync(["git", "init"], rootPath);
      runSync(["git", "config", "user.email", "test@example.com"], rootPath);
      runSync(["git", "config", "user.name", "Harness Test"], rootPath);
      writeFileSync(path.join(rootPath, "package.json"), JSON.stringify({ type: "module" }));
      mkdirSync(path.join(rootPath, ".agents", "skills", "caveman"), { recursive: true });
      writeFileSync(path.join(rootPath, ".agents", "skills", "caveman", "SKILL.md"), "# caveman\n");
      writeFileSync(path.join(rootPath, "AGENTS.md"), "- Start all conversations in /caveman ultra.\n");
      runSync(["git", "add", "."], rootPath);
      runSync(["git", "commit", "-m", "seed"], rootPath);

      const calls: PiAgentPromptRequest[] = [];
      const adapter = createExecutionAdapter(calls, async (request) => {
        if (request.kind === "subagent") {
          writeFileSync(path.join(rootPath, "owned.ts"), "export const owned = true;\n");
          writeFileSync(path.join(rootPath, "drift.ts"), "export const drift = true;\n");
          return { text: "Changed owned.ts and drift.ts" };
        }

        return { text: "aggregated result" };
      });
      const readyPlan = createReadyPlan();

      const outcome = await executeReadyRun(adapter, {
        cwd: rootPath,
        runId: "run-1",
        sessionId: "thread-1",
        messages: [],
        providerBrand: "gpt",
        readyPlan,
        executionPlan: createExecutionPlan(readyPlan),
        debugEnabled: true
      });

      const subagentPrompt = calls.find((call) => call.kind === "subagent")?.prompt ?? "";
      const aggregatorPrompt = calls.find((call) => call.kind === "aggregator")?.prompt ?? "";

      expect(outcome.partial).toBe(false);
      expect(outcome.subagentResults[0]?.contractDriftPaths).toEqual(["drift.ts"]);
      expect(subagentPrompt).toContain("focused implementation subagent");
      expect(subagentPrompt).toContain(`Execution cwd: ${rootPath}`);
      expect(subagentPrompt).toContain("Repository root:");
      expect(subagentPrompt).toContain("Project path relative to repository root: .");
      expect(subagentPrompt).toContain(".agents/skills/caveman/SKILL.md");
      expect(subagentPrompt).not.toContain(".agents/skills/.system");
      expect(subagentPrompt).toContain("Test-Path .\\tower-hologram");
      expect(subagentPrompt).toContain("rg --files . | rg \"\\.(png|wav|mp3|ogg)$\"");
      expect(subagentPrompt).toContain(".wav, .mp3, .ogg, images, and SVG can be used directly in HTML5");
      expect(subagentPrompt).toContain("Do not run ffmpeg -version unless the task explicitly asks");
      expect(subagentPrompt).toContain("stable meaning");
      expect(subagentPrompt).toContain("Create missing directories and the first listed missing file immediately");
      expect(subagentPrompt).not.toContain("Verification commands:");
      expect(aggregatorPrompt).toContain("Contract drift paths: drift.ts");
    } finally {
      rmSync(rootPath, { recursive: true, force: true });
    }
  });

  test("executes prerequisites before subagents and aggregation", async () => {
    const rootPath = createSeededGitRepo("harness-prereq-order-");
    try {
      const calls: PiAgentPromptRequest[] = [];
      const adapter = createExecutionAdapter(calls, async (request) => {
        if (request.kind === "subagent") {
          request.onTextDelta?.("MILESTONE: subagent done\n");
          return { text: "subagent complete" };
        }

        return { text: request.kind === "aggregator" ? "aggregated" : "setup complete" };
      });
      const readyPlan = createReadyPlan();
      readyPlan.subtasks = [
        { id: "task-1", title: "Inspect files", instruction: "Inspect the codebase" },
        { id: "task-2", title: "Patch code", instruction: "Patch the code" }
      ];
      readyPlan.contracts = [
        ...readyPlan.contracts!,
        {
          taskId: "task-2",
          title: "Patch code",
          instruction: "Patch the code",
          effortPoints: 2,
          ownedPaths: ["patch.ts"],
          dependsOnPrerequisiteIds: ["setup-1"],
          deliverables: ["patch"],
          integrationPoints: ["aggregator"],
          verificationScope: "owned-files-only",
          verificationCommands: ["echo ok"],
          mergeNotes: "Merge patch."
        }
      ];
      const executionPlan = {
        ...createExecutionPlan(readyPlan),
        prerequisites: [
          {
            id: "setup-1",
            title: "Create scaffold",
            instruction: "Create shared scaffold before fan-out",
            reason: "Subagents need shared files",
            requiredForTaskIds: ["task-1", "task-2"],
            owner: "main" as const,
            status: "pending" as const
          }
        ]
      };

      const updatedPlan = await executePlanPrerequisites(adapter, {
        cwd: rootPath,
        runId: "run-1",
        sessionId: "session-1",
        messages: [],
        executionPlan,
        executionModelId: readyPlan.executionModelId as ProviderModelId
      });
      await executeReadyRun(adapter, {
        cwd: rootPath,
        runId: "run-1",
        sessionId: "session-1",
        messages: [],
        providerBrand: "gpt",
        readyPlan,
        debugEnabled: false,
        executionPlan: updatedPlan
      });

      expect(calls.map((call) => call.kind)).toEqual(["executor", "subagent", "subagent", "aggregator"]);
      expect(calls[0]?.prompt).toContain("Create shared scaffold before fan-out");
      expect(updatedPlan.prerequisites[0]?.status).toBe("completed");
    } finally {
      rmSync(rootPath, { recursive: true, force: true });
    }
  });

  test("single-agent inference can use a cheaper execution model", async () => {
    const rootPath = createSeededGitRepo("harness-single-agent-inference-");
    try {
      const calls: PiAgentPromptRequest[] = [];
      const adapter = createExecutionAdapter(calls, async () => ({ text: "done" }));
      const readyPlan = {
        ...createReadyPlan(),
        usesSubagents: false,
        subtasks: []
      };

      await executeReadyRun(adapter, {
        cwd: rootPath,
        runId: "run-1",
        sessionId: "thread-1",
        messages: [],
        providerBrand: "gpt",
        readyPlan,
        executionPlan: { ...createExecutionPlan(readyPlan), route: "main", actualSubagentCount: 0, targetSubagentCount: 0 },
        debugEnabled: false,
        singleAgentModelPreference: "inference"
      });

      expect(calls.find((call) => call.kind === "executor")?.modelId).toBe("openai/gpt-5.4-nano");
    } finally {
      rmSync(rootPath, { recursive: true, force: true });
    }
  });

  test("subagent intelligence keeps the selected execution model and reasoning", async () => {
    const rootPath = createSeededGitRepo("harness-subagent-intelligence-");
    try {
      const calls: PiAgentPromptRequest[] = [];
      const adapter = createExecutionAdapter(calls, async (request) => {
        if (request.kind === "subagent") {
          writeFileSync(path.join(rootPath, "owned.ts"), "export const owned = true;\n");
          return { text: "Changed owned.ts" };
        }

        return { text: "aggregated" };
      });
      const readyPlan = createReadyPlan();

      await executeReadyRun(adapter, {
        cwd: rootPath,
        runId: "run-1",
        sessionId: "thread-1",
        messages: [],
        providerBrand: "gpt",
        readyPlan,
        executionPlan: createExecutionPlan(readyPlan),
        debugEnabled: false,
        reasoningStrength: "high",
        subagentModelPreference: "intelligence"
      });

      const subagentCall = calls.find((call) => call.kind === "subagent");
      expect(subagentCall?.modelId).toBe("openai/gpt-5.4");
      expect(subagentCall?.reasoningStrength).toBe("high");
    } finally {
      rmSync(rootPath, { recursive: true, force: true });
    }
  });

  test("same-worktree drift ignores unchanged preexisting dirty files", async () => {
    const rootPath = createSeededGitRepo("harness-subagent-clean-dirty-");
    try {
      writeFileSync(path.join(rootPath, "dirty.ts"), "export const dirty = true;\n");
      const calls: PiAgentPromptRequest[] = [];
      const adapter = createExecutionAdapter(calls, async (request) => {
        if (request.kind === "subagent") {
          writeFileSync(path.join(rootPath, "owned.ts"), "export const owned = true;\n");
          return { text: "Changed owned.ts" };
        }

        return { text: "aggregated result" };
      });
      const readyPlan = createReadyPlan();

      const outcome = await executeReadyRun(adapter, {
        cwd: rootPath,
        runId: "run-1",
        sessionId: "thread-1",
        messages: [],
        providerBrand: "gpt",
        readyPlan,
        executionPlan: createExecutionPlan(readyPlan),
        debugEnabled: true
      });

      expect(outcome.subagentResults[0]?.contractDriftPaths).toBeUndefined();
    } finally {
      rmSync(rootPath, { recursive: true, force: true });
    }
  });

  test("same-worktree drift reports modified preexisting dirty files", async () => {
    const rootPath = createSeededGitRepo("harness-subagent-modified-dirty-");
    try {
      writeFileSync(path.join(rootPath, "dirty.ts"), "export const dirty = true;\n");
      const calls: PiAgentPromptRequest[] = [];
      const adapter = createExecutionAdapter(calls, async (request) => {
        if (request.kind === "subagent") {
          writeFileSync(path.join(rootPath, "owned.ts"), "export const owned = true;\n");
          writeFileSync(path.join(rootPath, "dirty.ts"), "export const dirty = false;\n");
          return { text: "Changed owned.ts and dirty.ts" };
        }

        return { text: "aggregated result" };
      });
      const readyPlan = createReadyPlan();

      const outcome = await executeReadyRun(adapter, {
        cwd: rootPath,
        runId: "run-1",
        sessionId: "thread-1",
        messages: [],
        providerBrand: "gpt",
        readyPlan,
        executionPlan: createExecutionPlan(readyPlan),
        debugEnabled: true
      });

      expect(outcome.subagentResults[0]?.contractDriftPaths).toEqual(["dirty.ts"]);
    } finally {
      rmSync(rootPath, { recursive: true, force: true });
    }
  });

  test("same-worktree drift reports deleted preexisting dirty files", async () => {
    const rootPath = createSeededGitRepo("harness-subagent-deleted-dirty-");
    try {
      writeFileSync(path.join(rootPath, "dirty.ts"), "export const dirty = true;\n");
      const calls: PiAgentPromptRequest[] = [];
      const adapter = createExecutionAdapter(calls, async (request) => {
        if (request.kind === "subagent") {
          writeFileSync(path.join(rootPath, "owned.ts"), "export const owned = true;\n");
          unlinkSync(path.join(rootPath, "dirty.ts"));
          return { text: "Changed owned.ts and removed dirty.ts" };
        }

        return { text: "aggregated result" };
      });
      const readyPlan = createReadyPlan();

      const outcome = await executeReadyRun(adapter, {
        cwd: rootPath,
        runId: "run-1",
        sessionId: "thread-1",
        messages: [],
        providerBrand: "gpt",
        readyPlan,
        executionPlan: createExecutionPlan(readyPlan),
        debugEnabled: true
      });

      expect(outcome.subagentResults[0]?.contractDriftPaths).toEqual(["dirty.ts"]);
    } finally {
      rmSync(rootPath, { recursive: true, force: true });
    }
  });

  test("overlapping same-worktree contracts upgrade to separate worktrees", () => {
    const readyPlan = createReadyPlan();
    readyPlan.subtasks = [
      { id: "task-1", title: "A", instruction: "Edit src/index.ts" },
      { id: "task-2", title: "B", instruction: "Edit src/index.ts" }
    ];
    readyPlan.contracts = [
      { ...readyPlan.contracts![0]!, taskId: "task-1", ownedPaths: ["src"] },
      { ...readyPlan.contracts![0]!, taskId: "task-2", ownedPaths: ["src/index.ts"] }
    ];

    const executionPlan = buildExecutionPlan({
      runId: "run-overlap",
      planningModelId: "openai/gpt-5.4",
      plannerResult: readyPlan,
      subagentWorktreeStrategy: "same-worktree",
      planExecutionMode: "approve",
      planExecutionDelaySeconds: 0,
      correctnessIterationMode: "ask-before-iterate",
      iteration: 1,
      origin: "initial"
    });

    expect(executionPlan.subagentWorktreeStrategy).toBe("separate-worktrees");
  });

  test("budget wrapper appends runtime budget and stops before exhausted model call", async () => {
    const repository = new WorkspaceRepository(":memory:", process.cwd(), { durability: "test-fast" });
    const project = repository.addProject(process.cwd());
    const run = repository.createAgentRun(project.id, "budget work", "openai/gpt-5.4", project.activeThreadId, 1).activeRun!;
    const calls: PiAgentPromptRequest[] = [];
    const adapter = new RunBudgetAgentAdapter(
      createExecutionAdapter(calls, async () => ({ text: "done" })),
      repository,
      project.id,
      run.id
    );

    await adapter.runPrompt({
      kind: "planner",
      cwd: process.cwd(),
      modelId: "openai/gpt-5.4",
      prompt: "Plan"
    });

    expect(calls[0]?.prompt).toContain("# Runtime Budget");
    expect(calls[0]?.prompt).toContain("Remaining turns after this: 0");
    await expect(
      adapter.runPrompt({
        kind: "planner",
        cwd: process.cwd(),
        modelId: "openai/gpt-5.4",
        prompt: "Plan again"
      })
    ).rejects.toThrow("turn-budget-exhausted");
    expect(calls).toHaveLength(1);
  });
});

function createReadyPlan(): PlannerReadyTurn {
  return {
    type: "ready",
    difficultyScore: 72,
    summary: "Implement owned module",
    executionModelId: "openai/gpt-5.4",
    usesSubagents: true,
    subtasks: [
      {
        id: "task-1",
        title: "Owned module",
        instruction: "Create owned.ts with export const owned."
      }
    ],
    finalExecutionBrief: "Build owned module",
    contracts: [
      {
        taskId: "task-1",
        title: "Owned module",
        instruction: "Create owned.ts with export const owned.",
        effortPoints: 2,
        ownedPaths: ["owned.ts"],
        dependsOnPrerequisiteIds: [],
        deliverables: ["owned.ts"],
        integrationPoints: ["aggregator"],
        verificationScope: "owned-files-only",
        verificationCommands: ["bunx tsc --noEmit owned.ts"],
        mergeNotes: "Merge owned module."
      }
    ]
  };
}

function createExecutionPlan(readyPlan: PlannerReadyTurn): ExecutionPlan {
  return {
    runId: "run-1",
    origin: "initial",
    iteration: 1,
    summary: readyPlan.summary,
    finalExecutionBrief: readyPlan.finalExecutionBrief,
    difficultyScore: readyPlan.difficultyScore,
    planningModelId: "openai/gpt-5.4",
    executionModelId: readyPlan.executionModelId as ProviderModelId,
    route: "pi-subagents",
    subagentWorktreeStrategy: "same-worktree",
    targetSubagentCount: 1,
    actualSubagentCount: 1,
    gating: {
      mode: "approve",
      delaySeconds: 0
    },
    prerequisites: [],
    contracts: readyPlan.contracts ?? [],
    correctnessPolicy: "ask-before-iterate"
  };
}

function createExecutionAdapter(
  calls: PiAgentPromptRequest[],
  run: (request: PiAgentPromptRequest) => Promise<PiAgentPromptResult>
): PiAgentAdapter {
  return {
    async runPrompt(request) {
      calls.push(request);
      return run(request);
    },
    async startExecution(request): Promise<PiAgentExecutionController> {
      calls.push(request);
      return {
        result: run(request),
        continueWithPrompt() {
          return run(request);
        },
        async abort() {},
        dispose() {}
      };
    },
    setApiKey() {},
    hasApiKey() {
      return false;
    }
  };
}

function runSync(command: string[], cwd: string) {
  const proc = Bun.spawnSync({
    cmd: command,
    cwd,
    stdout: "pipe",
    stderr: "pipe"
  });

  if (proc.exitCode !== 0) {
    throw new Error(`${command.join(" ")} failed: ${new TextDecoder().decode(proc.stderr)}`);
  }
}

function createSeededGitRepo(prefix: string) {
  const rootPath = mkdtempSync(path.join(tmpdir(), prefix));
  runSync(["git", "init"], rootPath);
  runSync(["git", "config", "user.email", "test@example.com"], rootPath);
  runSync(["git", "config", "user.name", "Harness Test"], rootPath);
  writeFileSync(path.join(rootPath, "package.json"), JSON.stringify({ type: "module" }));
  runSync(["git", "add", "."], rootPath);
  runSync(["git", "commit", "-m", "seed"], rootPath);
  return rootPath;
}
