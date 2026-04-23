import { describe, expect, test } from "bun:test";
import { planTask, testExports } from "./pi-planner";
import type { PiAgentAdapter, PiAgentExecutionController, PiAgentPromptRequest } from "./pi-agent-adapter";

describe("pi planner payload parsing", () => {
  test("parses pure json payloads", () => {
    expect(
      testExports.parseJsonPayload('{"type":"ready","difficultyScore":20,"summary":"Plan","executionModelId":"openai/gpt-5.4","usesSubagents":false,"subtasks":[],"finalExecutionBrief":"Do work"}')
    ).toMatchObject({
      type: "ready",
      executionModelId: "openai/gpt-5.4"
    });
  });

  test("parses fenced json payloads", () => {
    expect(
      testExports.parseJsonPayload([
        "```json",
        '{"type":"ready","difficultyScore":20,"summary":"Plan","executionModelId":"openai/gpt-5.4","usesSubagents":false,"subtasks":[],"finalExecutionBrief":"Do work"}',
        "```"
      ].join("\n"))
    ).toMatchObject({
      type: "ready"
    });
  });

  test("parses first balanced json object from mixed output", () => {
    expect(
      testExports.parseJsonPayload([
        "C:/repo/thread-notes",
        "// planner preface",
        '{"type":"ready","difficultyScore":20,"summary":"Plan","executionModelId":"openai/gpt-5.4","usesSubagents":false,"subtasks":[],"finalExecutionBrief":"Do work"}',
        "extra trailing note"
      ].join("\n"))
    ).toMatchObject({
      type: "ready",
      summary: "Plan"
    });
  });

  test("handles supplementary-plane characters before first brace", () => {
    // Emoji occupies two UTF-16 code units. A code-point-based startIndex would
    // desync from the UTF-16 loop and truncate the slice; verify both modes agree.
    const payload =
      '{"type":"ready","difficultyScore":20,"summary":"Plan","executionModelId":"openai/gpt-5.4","usesSubagents":false,"subtasks":[],"finalExecutionBrief":"Do work"}';
    expect(testExports.parseJsonPayload(`👋 here is the plan: ${payload}`)).toMatchObject({
      type: "ready",
      summary: "Plan"
    });
    expect(testExports.parseJsonPayload(`𝟘𝟙 prefix ${payload}`)).toMatchObject({
      type: "ready"
    });
  });
  test("normalizes repo-local leading-slash paths in ready planner payloads", () => {
    const result = testExports.normalizePlannerWorkspacePaths(
      {
        type: "ready",
        difficultyScore: 20,
        summary: "Create /breakout assets",
        executionModelId: "openai/gpt-5.4",
        usesSubagents: false,
        subtasks: [
          {
            id: "task-1",
            title: "Create /breakout/index.html",
            instruction: "Write /breakout/index.html"
          }
        ],
        finalExecutionBrief: "Create /breakout/index.html"
      },
      "C:\\repo\\context"
    );

    expect(result.type).toBe("ready");
    if (result.type !== "ready") {
      throw new Error("Expected ready planner result");
    }
    expect(result.summary).toBe("Create breakout assets");
    expect(result.finalExecutionBrief).toBe("Create breakout/index.html");
    expect(result.subtasks[0]?.instruction).toBe("Write breakout/index.html");
  });

  test("normalizes planner verification scope aliases before schema validation", async () => {
    const adapter: PiAgentAdapter = {
      async runPrompt() {
        return {
          text: JSON.stringify({
            type: "ready",
            difficultyScore: 72,
            summary: "Create app",
            executionModelId: "openai/gpt-5.4",
            usesSubagents: true,
            subtasks: [{ id: "task-1", title: "Create app", instruction: "Write app" }],
            finalExecutionBrief: "Build app",
            contracts: [
              {
                taskId: "task-1",
                title: "Create app",
                instruction: "Write app",
                effortPoints: 8,
                ownedPaths: ["src/app.ts"],
                dependsOnPrerequisiteIds: [],
                deliverables: ["src/app.ts"],
                integrationPoints: [],
                verificationScope: "full-app",
                verificationCommands: ["bun run typecheck"],
                mergeNotes: "Merge after full app check."
              }
            ]
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

    const result = await planTask(adapter, {
      cwd: "C:\\repo\\context",
      messages: [],
      latestUserPrompt: "Create app",
      providerBrand: "gpt"
    });

    expect(result.plannerResult.type).toBe("ready");
    if (result.plannerResult.type !== "ready") {
      throw new Error("Expected ready result");
    }
    expect(result.plannerResult.contracts?.[0]?.verificationScope).toBe("worktree-full");
  });

  test("normalizes planner contract paths and prompts for concrete same-worktree ownership", async () => {
    const calls: PiAgentPromptRequest[] = [];
    const adapter: PiAgentAdapter = {
      async runPrompt(request) {
        calls.push(request);
        return {
          text: JSON.stringify({
            type: "ready",
            difficultyScore: 72,
            summary: "Create /game",
            executionModelId: "openai/gpt-5.4",
            usesSubagents: true,
            subtasks: [{ id: "task-1", title: "Create /game/index.html", instruction: "Write /game/index.html" }],
            finalExecutionBrief: "Build /game",
            contracts: [
              {
                taskId: "task-1",
                title: "Create /game/index.html",
                instruction: "Write /game/index.html",
                effortPoints: 8,
                ownedPaths: ["/game/index.html"],
                dependsOnPrerequisiteIds: [],
                deliverables: ["Create /game/index.html"],
                integrationPoints: [],
                verificationScope: "owned-files-only",
                verificationCommands: ["echo verify /game/index.html"],
                mergeNotes: "Merge /game/index.html"
              }
            ]
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

    const result = await planTask(adapter, {
      cwd: "C:\\repo\\context",
      messages: [],
      latestUserPrompt: "Create /game/index.html",
      providerBrand: "gpt"
    });

    expect(calls[0]?.prompt).toContain("emit contracts with concrete ownedPaths");
    expect(calls[0]?.prompt).toContain("Subagents receive implementation packets");
    expect(calls[0]?.prompt).toContain("expected public functions/classes/components/signatures");
    expect(calls[0]?.prompt).toContain("verificationCommands are for the main harness verification pass");
    expect(calls[0]?.prompt).toContain("verificationScope must be exactly");
    expect(calls[0]?.prompt).toContain("Same-worktree parallel work requires contracts with non-overlapping ownedPaths");
    expect(result.plannerResult.type).toBe("ready");
    if (result.plannerResult.type !== "ready") {
      throw new Error("Expected ready result");
    }
    expect(result.plannerResult.contracts?.[0]?.ownedPaths).toEqual(["game/index.html"]);
    expect(result.plannerResult.contracts?.[0]?.effortPoints).toBe(8);
  });
});
