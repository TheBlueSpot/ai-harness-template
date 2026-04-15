import { describe, expect, test } from "bun:test";
import { chooseExecutionPath } from "./pi-orchestrator";

describe("pi execution router", () => {
  test("routes low difficulty tasks to the main agent", () => {
    expect(chooseExecutionPath(40)).toBe("main");
  });

  test("routes high difficulty tasks to subagents", () => {
    expect(chooseExecutionPath(41)).toBe("subagents");
  });
});
