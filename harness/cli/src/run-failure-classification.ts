import { runFailureCategorySchema, type RunFailureCategory } from "../../shared/protocol";

type ClassifyRunFailureInput = {
  message?: string;
  explicitCategory?: string | null;
};

export function classifyRunFailure(input: ClassifyRunFailureInput): RunFailureCategory {
  const explicitCategory = parseFailureCategory(input.explicitCategory) ?? extractFailureCategoryMarker(input.message);
  if (explicitCategory) {
    return explicitCategory;
  }

  const normalized = input.message?.toLowerCase() ?? "";
  if (!normalized) {
    return "unknown";
  }
  if (normalized.includes("unique constraint failed: agent_run_questions.id")) {
    return "question-persist-conflict";
  }
  if (normalized.includes("empty response")) {
    return "empty-response";
  }
  if (
    normalized.includes("stream disconnected") ||
    normalized.includes("stream transport") ||
    normalized.includes("provider stream") ||
    normalized.includes("session stream")
  ) {
    return "stream-disconnect";
  }
  if (normalized.includes("invalid json") || normalized.includes("json parse error") || normalized.includes("json payload")) {
    return "invalid-json";
  }
  if (normalized.includes("stopped by user") || normalized.includes("rejected before execution")) {
    return "manual-abort";
  }
  if (normalized.includes("local harness process shut down before completion") || normalized.includes("shutdown before completion")) {
    return "shutdown-interrupt";
  }
  if (normalized.includes("not runnable") || normalized.includes("definition no longer exists")) {
    return "launch-failure";
  }
  if (
    normalized.includes("runtime contract mismatch") ||
    normalized.includes("setbackgroundjobrunstatusifowned is not a function") ||
    normalized.includes("appendbackgroundjobruneventifowned is not a function") ||
    normalized.includes("touchbackgroundjobrunifowned is not a function") ||
    normalized.includes("renewbackgroundjobrunlease is not a function")
  ) {
    return "runtime-contract-mismatch";
  }
  if (normalized.includes("subagent work failed") || normalized.includes("partial subagent")) {
    return "partial-subagent-failure";
  }
  if (normalized.includes("no background progress heartbeat") || normalized.includes("heartbeat timeout")) {
    return "heartbeat-timeout";
  }
  if (normalized.includes("exceeded max runtime") || normalized.includes("max runtime")) {
    return "max-runtime-timeout";
  }
  if (normalized.includes("turn budget exhausted") || normalized.includes("turn-budget-exhausted")) {
    return "turn-budget-exhausted";
  }
  if (normalized.includes("no live background controller") || normalized.includes("interrupted before completion")) {
    return "controller-lost";
  }
  if (normalized.includes("planning question") || normalized.includes("planner question")) {
    return "planner-question";
  }
  return "unknown";
}

export function isBackoffEligibleFailureCategory(category: RunFailureCategory | undefined) {
  return (
    category === "controller-lost" ||
    category === "heartbeat-timeout" ||
    category === "max-runtime-timeout" ||
    category === "launch-failure" ||
    category === "runtime-contract-mismatch"
  );
}

export function isLifecycleFailureCategory(category: RunFailureCategory | undefined) {
  return (
    category === "controller-lost" ||
    category === "heartbeat-timeout" ||
    category === "max-runtime-timeout" ||
    category === "launch-failure" ||
    category === "runtime-contract-mismatch" ||
    category === "shutdown-interrupt"
  );
}

function parseFailureCategory(value: string | null | undefined) {
  if (!value) {
    return undefined;
  }
  const parsed = runFailureCategorySchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function extractFailureCategoryMarker(message: string | undefined) {
  const match = message?.match(/\[category=([a-z-]+)\]/i);
  return match?.[1] ? parseFailureCategory(match[1].toLowerCase()) : undefined;
}
