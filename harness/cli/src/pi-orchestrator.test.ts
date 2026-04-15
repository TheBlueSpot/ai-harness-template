import { describe, expect, test } from "bun:test";
import { buildExecutionPrompt, chooseExecutionPath } from "./pi-orchestrator";

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
});
