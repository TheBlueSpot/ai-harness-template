import { describe, expect, test } from "bun:test";
import { testExports } from "./pi-planner";

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
});
