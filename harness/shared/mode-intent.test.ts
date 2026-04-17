import { expect, test } from "bun:test";
import { builtinModes } from "./modes";
import { detectAutoMode, scoreBuiltinModeIntent } from "./mode-intent";

test("detects ask intent for direct questions", () => {
  const detected = detectAutoMode("What do each of the different modes do?", builtinModes);
  expect(detected?.modeId).toBe("ask");
  expect(detected?.confidence).toBeGreaterThanOrEqual(0.6);
});

test("detects plan intent for planning prompts", () => {
  const detected = detectAutoMode("Plan the safest rollout strategy before implementing anything.", builtinModes);
  expect(detected?.modeId).toBe("plan");
});

test("detects debug intent for bug-fix prompts", () => {
  const detected = detectAutoMode("Debug this flaky login bug and find root cause.", builtinModes);
  expect(detected?.modeId).toBe("debug");
});

test("detects review intent for review prompts", () => {
  const detected = detectAutoMode("Review this PR diff for regressions and missing tests.", builtinModes);
  expect(detected?.modeId).toBe("review");
});

test("detects implement intent for delivery prompts", () => {
  const detected = detectAutoMode("Implement auth refresh support and add tests.", builtinModes);
  expect(detected?.modeId).toBe("implement");
});

test("does not auto-switch on ambiguous mixed prompts", () => {
  const detected = detectAutoMode("How do I fix this flaky login bug?", builtinModes);
  expect(detected).toBeUndefined();
});

test("question-style action requests do not overpower debug intent", () => {
  const scores = scoreBuiltinModeIntent("Can you fix this broken login bug?");
  const askScore = scores.find((entry) => entry.modeId === "ask")?.confidence ?? 0;
  const debugScore = scores.find((entry) => entry.modeId === "debug")?.confidence ?? 0;
  expect(debugScore).toBeGreaterThan(askScore);
});
