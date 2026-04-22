import { describe, expect, test } from "bun:test";
import { buildExecutionPrompt, chooseExecutionPath, shouldUseReadOnlyExecutionTools } from "./pi-orchestrator";
import type { ModeDefinition } from "../../shared/protocol";

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

  test("uses read-only execution tools for read-heavy and review modes", () => {
    const createMode = (toolPolicy: ModeDefinition["toolPolicy"]): ModeDefinition => ({
      id: toolPolicy,
      scope: "builtin",
      label: toolPolicy,
      description: toolPolicy,
      plannerPrompt: "plan",
      executionPrompt: "exec",
      toolPolicy,
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
  });
});
