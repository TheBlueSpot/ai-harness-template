import { describe, expect, test } from "bun:test";
import { createLegacyTruncatedId, createStableBoundedId, MAX_BOUNDED_ID_LENGTH } from "./notification-ids";

describe("stable bounded ids", () => {
  test("keeps short ids readable and unchanged", () => {
    expect(createStableBoundedId(["planning-question", "run-1", "question-1"])).toBe(
      "planning-question:run-1:question-1"
    );
  });

  test("keeps long ids bounded and deterministic", () => {
    const parts = ["browser-approval", "project", "run", "session", "x".repeat(180)];
    const first = createStableBoundedId(parts);
    const second = createStableBoundedId(parts);

    expect(first).toBe(second);
    expect(first.length).toBeLessThanOrEqual(MAX_BOUNDED_ID_LENGTH);
    expect(first).toMatch(/:[a-f0-9]{16}$/);
  });

  test("separates ids with identical legacy prefixes", () => {
    const shared = "x".repeat(150);
    const left = createStableBoundedId(["browser-approval", shared, "left"]);
    const right = createStableBoundedId(["browser-approval", shared, "right"]);

    expect(left.slice(0, 100)).toBe(right.slice(0, 100));
    expect(left).not.toBe(right);
  });

  test("legacy helper matches old truncation behavior", () => {
    const parts = ["planning-question", "x".repeat(180), "question"];

    expect(createLegacyTruncatedId(parts)).toBe(parts.join(":").slice(0, MAX_BOUNDED_ID_LENGTH));
  });
});
