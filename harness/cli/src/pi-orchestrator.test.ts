import { describe, expect, test } from "bun:test";
import { buildExecutionPrompt, chooseExecutionPath, runPlannerTurn, shouldUseReadOnlyExecutionTools } from "./pi-orchestrator";
import type { PiAgentAdapter, PiAgentExecutionController, PiAgentPromptRequest, PiAgentPromptResult } from "./pi-agent-adapter";
import type { ModeDefinition } from "../../shared/protocol";
import { resolveModeExecutionAccess } from "../../shared/modes";

describe("pi execution router", () => {
  test("routes low difficulty tasks to the main agent", () => {
    expect(chooseExecutionPath(40)).toBe("main");
  });

  test("routes high difficulty tasks to subagents", () => {
    expect(chooseExecutionPath(41)).toBe("subagents");
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
    expect(calls[0]?.prompt).toContain("Latest user task: Put all files in breakout and create breakout/index.html");
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
});
