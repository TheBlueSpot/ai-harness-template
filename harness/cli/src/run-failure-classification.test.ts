import { describe, expect, test } from "bun:test";
import {
  classifyRunFailure,
  isBackoffEligibleFailureCategory,
  isLifecycleFailureCategory
} from "./run-failure-classification";

describe("run failure classification", () => {
  test("prefers explicit category over message parsing", () => {
    expect(
      classifyRunFailure({
        explicitCategory: "question-persist-conflict",
        message: "Pi returned empty response [category=empty-response]"
      })
    ).toBe("question-persist-conflict");
  });

  test("classifies pi empty responses, transport failures, and invalid json", () => {
    expect(classifyRunFailure({ message: "Pi returned empty response after retry" })).toBe("empty-response");
    expect(classifyRunFailure({ message: "Pi agent stream transport failed while provider stream was active" })).toBe(
      "stream-disconnect"
    );
    expect(classifyRunFailure({ message: "Planner returned invalid JSON payload after repair" })).toBe("invalid-json");
  });

  test("classifies question persistence conflicts consistently", () => {
    expect(classifyRunFailure({ message: "UNIQUE constraint failed: agent_run_questions.id" })).toBe(
      "question-persist-conflict"
    );
  });

  test("classifies background job runtime and partial-subagent failures", () => {
    expect(
      classifyRunFailure({
        message:
          "options.repository.setBackgroundJobRunStatusIfOwned is not a function. (In 'options.repository.setBackgroundJobRunStatusIfOwned(...)')"
      })
    ).toBe("runtime-contract-mismatch");
    expect(classifyRunFailure({ message: "Some subagent work failed." })).toBe("partial-subagent-failure");
  });

  test("tracks backoff and lifecycle eligibility per phase rules", () => {
    expect(isBackoffEligibleFailureCategory("controller-lost")).toBe(true);
    expect(isBackoffEligibleFailureCategory("max-runtime-timeout")).toBe(true);
    expect(isBackoffEligibleFailureCategory("runtime-contract-mismatch")).toBe(true);
    expect(isBackoffEligibleFailureCategory("empty-response")).toBe(false);
    expect(isBackoffEligibleFailureCategory("shutdown-interrupt")).toBe(false);
    expect(isLifecycleFailureCategory("heartbeat-timeout")).toBe(true);
    expect(isLifecycleFailureCategory("runtime-contract-mismatch")).toBe(true);
    expect(isLifecycleFailureCategory("planner-question")).toBe(false);
  });
});
