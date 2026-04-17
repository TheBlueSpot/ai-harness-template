import type { ModeDefinition } from "./protocol";

export const AUTO_MODE_CONFIDENCE_THRESHOLD = 0.6;
const AUTO_MODE_MARGIN_THRESHOLD = 0.15;
const builtinAutoModeIds = ["ask", "plan", "implement", "debug", "review"] as const;

type BuiltinAutoModeId = (typeof builtinAutoModeIds)[number];

export function detectAutoMode(
  content: string,
  availableModes: Array<Pick<ModeDefinition, "id">> = []
): { modeId: BuiltinAutoModeId; confidence: number } | undefined {
  const availableModeIds = new Set(availableModes.map((mode) => mode.id));
  const scores = scoreBuiltinModeIntent(content).filter((entry) => availableModeIds.has(entry.modeId));

  if (scores.length === 0) {
    return undefined;
  }

  const sorted = [...scores].sort((left, right) => right.confidence - left.confidence);
  const best = sorted[0];
  const runnerUp = sorted[1];
  if (!best || best.confidence < AUTO_MODE_CONFIDENCE_THRESHOLD) {
    return undefined;
  }

  if (runnerUp && best.confidence - runnerUp.confidence < AUTO_MODE_MARGIN_THRESHOLD) {
    return undefined;
  }

  return best;
}

export function scoreBuiltinModeIntent(content: string) {
  const normalized = normalizeIntentText(content);
  const hasQuestionMark = normalized.includes("?");
  const startsInfoQuestion = /^(what|how|why|when|where|who|which)\b/.test(normalized);
  const startsExplainRequest = /^(explain|compare|clarify|describe|walk me through|help me understand)\b/.test(normalized);
  const questionStyle = hasQuestionMark || startsInfoQuestion || startsExplainRequest;
  const politeActionRequest = /^(can|could|would|will)\s+you\b/.test(normalized);

  const askSignals = countMatches(normalized, [
    /\b(what|how|why|when|where|who|which)\b/g,
    /\b(explain|compare|clarify|describe|difference|understand|walk me through)\b/g,
    /\b(high level|read only|without changing|without editing|no edits)\b/g
  ]);
  const planSignals = countMatches(normalized, [
    /\b(plan|design|strategy|approach|roadmap|spec|proposal|outline|brainstorm)\b/g,
    /\b(scope|tradeoffs?|risks?|contracts?|verification|acceptance criteria)\b/g,
    /\b(plan first|before coding|before implementing|don't implement|dont implement|no code)\b/g
  ]);
  const debugSignals = countMatches(normalized, [
    /\b(debug|bug|broken|flaky|failing|failure|error|exception|crash|regression)\b/g,
    /\b(root cause|repro|reproduce|investigate|diagnose|not working|doesn't work|doesnt work)\b/g,
    /\b(fix the bug|fix bug|fix the issue|fix issue)\b/g
  ]);
  const reviewSignals = countMatches(normalized, [
    /\b(code review|review this|review the|review diff|review pr|pull request|audit)\b/g,
    /\b(findings|regressions?|risks?|missing tests|comments?)\b/g,
    /\b(diff|patch)\b/g
  ]);
  const implementSignals = countMatches(normalized, [
    /\b(implement|build|create|add|update|change|modify|write|ship|make|refactor|integrate|wire|support)\b/g,
    /\b(with tests|and tests|hook up|hook into|deliver|finish)\b/g,
    /\b(fix|patch)\b/g
  ]);
  const actionSignals = planSignals + debugSignals + reviewSignals + implementSignals;

  const askScore = clamp01(
    (startsInfoQuestion ? 0.35 : 0) +
      (startsExplainRequest ? 0.35 : 0) +
      (hasQuestionMark ? 0.2 : 0) +
      askSignals * 0.18 -
      (politeActionRequest && actionSignals > 0 ? 0.35 : 0) -
      (questionStyle && actionSignals > 1 ? 0.25 : 0)
  );
  const planScore = clamp01(
    planSignals * 0.28 +
      (/^(plan|design|outline|brainstorm)\b/.test(normalized) ? 0.35 : 0) -
      (reviewSignals > 0 ? 0.1 : 0)
  );
  const debugScore = clamp01(
    debugSignals * 0.28 +
      (/^(debug|investigate|diagnose|fix)\b/.test(normalized) ? 0.28 : 0) -
      (reviewSignals > 0 ? 0.1 : 0)
  );
  const reviewScore = clamp01(
    reviewSignals * 0.32 +
      (/^(review|audit)\b/.test(normalized) ? 0.35 : 0) -
      (implementSignals > 1 ? 0.15 : 0)
  );
  const implementScore = clamp01(
    implementSignals * 0.2 +
      (/^(implement|build|create|add|update|change|modify|write|ship|make|refactor|integrate|wire)\b/.test(normalized)
        ? 0.35
        : 0) -
      (planSignals > 0 ? 0.2 : 0) -
      (reviewSignals > 0 ? 0.25 : 0) -
      (questionStyle ? 0.2 : 0)
  );

  return [
    { modeId: "ask", confidence: askScore },
    { modeId: "plan", confidence: planScore },
    { modeId: "implement", confidence: implementScore },
    { modeId: "debug", confidence: debugScore },
    { modeId: "review", confidence: reviewScore }
  ] as Array<{ modeId: BuiltinAutoModeId; confidence: number }>;
}

function normalizeIntentText(content: string) {
  return content.toLowerCase().replace(/\s+/g, " ").trim();
}

function countMatches(input: string, patterns: RegExp[]) {
  return patterns.reduce((count, pattern) => count + [...input.matchAll(pattern)].length, 0);
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}
