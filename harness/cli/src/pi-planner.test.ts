import { describe, expect, test } from "bun:test";
import { planTask, testExports } from "./pi-planner";
import type { PiAgentAdapter, PiAgentExecutionController, PiAgentPromptRequest } from "./pi-agent-adapter";

describe("pi planner payload parsing", () => {
  const buildReadyPayload = (overrides: Record<string, unknown> = {}) => ({
    type: "ready",
    difficultyScore: 72,
    summary: "Create app",
    executionModelId: "openai/gpt-5.4",
    usesSubagents: true,
    subtasks: [{ id: "task-1", title: "Create app", instruction: "Write app" }],
    finalExecutionBrief: "Build app",
    prerequisites: [
      {
        id: "setup-1",
        title: "Create setup",
        instruction: "Create setup",
        reason: "Subagents need setup",
        requiredForTaskIds: ["task-1"],
        owner: "main"
      }
    ],
    contracts: [
      {
        taskId: "task-1",
        title: "Create app",
        instruction: "Write app",
        effortPoints: 8,
        ownedPaths: ["src/app.ts"],
        dependsOnPrerequisiteIds: ["setup-1"],
        deliverables: ["src/app.ts"],
        integrationPoints: [],
        verificationScope: "owned-files-only",
        verificationCommands: ["bun run typecheck"],
        mergeNotes: "Merge after app check."
      }
    ],
    ...overrides
  });

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

  test("planner prompt includes default TypeScript Bun stack and Happy DOM frontend test guidance", async () => {
    let prompt = "";
    const adapter: PiAgentAdapter = {
      async runPrompt(request) {
        prompt = request.prompt;
        return {
          text: JSON.stringify({
            type: "ready",
            difficultyScore: 20,
            summary: "Create app",
            executionModelId: "openai/gpt-5.4",
            usesSubagents: false,
            subtasks: [],
            finalExecutionBrief: "Build app"
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

    await planTask(adapter, {
      cwd: "C:\\repo\\context",
      messages: [],
      latestUserPrompt: "Create a new web app",
      providerBrand: "gpt"
    });

    expect(prompt).toContain("default to TypeScript, Bun runtime/package/test runner, bun test");
    expect(prompt).toContain("Happy DOM for frontend/component tests");
    expect(prompt).toContain("createUiTest-style setup from harness/ui/src/utils/tests/test-harness.ts");
  });

  test("normalizes planner prerequisite owner aliases before schema validation", () => {
    const userOwner = testExports.parsePlannerTurnPayload(
      buildReadyPayload({
        prerequisites: [
          {
            id: "setup-1",
            title: "Create setup",
            instruction: "Create setup",
            reason: "Subagents need setup",
            requiredForTaskIds: ["task-1"],
            owner: "user"
          }
        ]
      })
    );
    const humanOwner = testExports.parsePlannerTurnPayload(
      buildReadyPayload({
        prerequisites: [
          {
            id: "setup-1",
            title: "Create setup",
            instruction: "Create setup",
            reason: "Subagents need setup",
            requiredForTaskIds: ["task-1"],
            owner: "human"
          }
        ]
      })
    );
    const workerOwner = testExports.parsePlannerTurnPayload(
      buildReadyPayload({
        prerequisites: [
          {
            id: "setup-1",
            title: "Create setup",
            instruction: "Create setup",
            reason: "Subagents need setup",
            requiredForTaskIds: ["task-1"],
            owner: "worker"
          }
        ]
      })
    );

    expect(userOwner.type).toBe("ready");
    expect(humanOwner.type).toBe("ready");
    expect(workerOwner.type).toBe("ready");
    if (userOwner.type !== "ready" || humanOwner.type !== "ready" || workerOwner.type !== "ready") {
      throw new Error("Expected ready planner results");
    }
    expect(userOwner.prerequisites?.[0]?.owner).toBe("main");
    expect(humanOwner.prerequisites?.[0]?.owner).toBe("main");
    expect(workerOwner.prerequisites?.[0]?.owner).toBe("subagent");
    expect(userOwner.prerequisites?.[0]?.status).toBe("pending");
  });

  test("rejects unknown prerequisite owner aliases", () => {
    expect(() =>
      testExports.parsePlannerTurnPayload(
        buildReadyPayload({
          prerequisites: [
            {
              id: "setup-1",
              title: "Create setup",
              instruction: "Create setup",
              reason: "Subagents need setup",
              requiredForTaskIds: ["task-1"],
              owner: "external-system"
            }
          ]
        })
      )
    ).toThrow();
  });

  test("repairs invalid planner payload once after schema validation fails", async () => {
    const calls: PiAgentPromptRequest[] = [];
    const adapter: PiAgentAdapter = {
      async runPrompt(request) {
        calls.push(request);
        return {
          text: JSON.stringify(
            calls.length === 1
              ? buildReadyPayload({
                  prerequisites: [
                    {
                      id: "setup-1",
                      title: "Create setup",
                      instruction: "Create setup",
                      reason: "Subagents need setup",
                      requiredForTaskIds: ["task-1"],
                      owner: "external-system"
                    }
                  ]
                })
              : buildReadyPayload()
          )
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

    expect(calls).toHaveLength(2);
    expect(calls[1]?.prompt).toContain("Repair the planner JSON payload");
    expect(result.plannerResult.type).toBe("ready");
    if (result.plannerResult.type !== "ready") {
      throw new Error("Expected ready planner result");
    }
    expect(result.plannerResult.prerequisites?.[0]?.owner).toBe("main");
  });

  test("fails with concise validation error when planner repair is still invalid", async () => {
    const calls: PiAgentPromptRequest[] = [];
    const adapter: PiAgentAdapter = {
      async runPrompt(request) {
        calls.push(request);
        return {
          text: JSON.stringify(
            buildReadyPayload({
              prerequisites: [
                {
                  id: "setup-1",
                  title: "Create setup",
                  instruction: "Create setup",
                  reason: "Subagents need setup",
                  requiredForTaskIds: ["task-1"],
                  owner: "external-system"
                }
              ]
            })
          )
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

    await expect(
      planTask(adapter, {
        cwd: "C:\\repo\\context",
        messages: [],
        latestUserPrompt: "Create app",
        providerBrand: "gpt"
      })
    ).rejects.toThrow('prerequisites.0.owner: expected "main" | "subagent", received "external-system"');
    expect(calls).toHaveLength(2);
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
