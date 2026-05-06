import type { ModeDefinition } from "./protocol";

/**
 * Auto-mode intent detection.
 *
 * Combines starter phrasing, vocabulary frequency, structural evidence
 * (file paths, extensions, stack frames, code fences), and cross-mode
 * conflict penalties to identify the most likely builtin mode.
 *
 * Public API:
 * - `detectAutoMode(content, availableModes)` — best mode above thresholds, else undefined.
 * - `scoreBuiltinModeIntent(content)` — raw per-mode confidences in [0, 1].
 * - `isDirectWorkspaceImplementTask(content)` — planner-bypass heuristic for atomic edits.
 *
 * Invariants:
 * - All scores are clamped to [0, 1].
 * - Shared regex state (`lastIndex`) is never read across calls; counting uses `matchAll`.
 */

export const AUTO_MODE_CONFIDENCE_THRESHOLD = 0.6;
export const AUTO_MODE_MARGIN_THRESHOLD = 0.1;
export const PLANNER_BYPASS_CONFIDENCE = 0.95;
export const PLANNER_BYPASS_MAX_WORDS = 22;
export const PLANNER_DIFFICULTY_THRESHOLD = 40;

const builtinAutoModeIds = ["ask", "plan", "implement", "debug", "review"] as const;
type BuiltinAutoModeId = (typeof builtinAutoModeIds)[number];

export type ModeIntentMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ModeIntentContext = {
  recentMessages?: ModeIntentMessage[];
  stickyModeId?: string;
};

type WorkspaceAction = {
  artifact: "folder" | "file" | "workspace-artifact";
  target?: string;
  inherited: boolean;
};

// ---------------------------------------------------------------------------
// Starter / gating patterns (non-global, used with .test()).
// ---------------------------------------------------------------------------

const infoQuestionStart = /^(?:what|how|why|when|where|who|which|whose|whom)\b/;
const yesNoQuestionStart =
  /^(?:is|are|was|were|am|do|does|did|can|could|should|would|will|shall|may|might|has|have|had)\b/;
const explainStart =
  /^(?:explain|compare|contrast|clarify|describe|summari[sz]e|break (?:it|this|that|something) down|walk me through|help me (?:understand|see|get)|tell me (?:about|why|how))\b/;
const politeActionStart = /^(?:can|could|would|will|please|should)\s+you\b/;

const planStart = /^(?:plan|design|redesign|outline|brainstorm|propose|architect|sketch|scope)\b/;
const debugStart =
  /^(?:debug|investigate|diagnose|repro|reproduce|bisect|crash(?:ed|ing)?|failing|broken)\b/;
const reviewStart = /^(?:review|audit|critique|evaluate|assess|look over|go over|sanity check)\b/;
const implementStart =
  /^(?:implement|build|create|add|update|change|modify|write|ship|make|refactor|integrate|wire|support|finish|insert|apply|replace|rename|move|delete|remove|inject|port|migrate|extract|bump|upgrade|downgrade|scaffold|stub|extend)\b/;
const directActionStart =
  /^(?:(?:can|could|would|will|please|should)\s+you\s+)?(?:make|create|add|update|change|modify|write|rename|move|delete|remove|implement|replace|inject|patch|fix)\b/;
const directActionCorrectionPrefix =
  /^(?:(?:no|nope|actually|instead|rather|i mean|sorry|wait|hold on)\b[\s,.:;-]*)+/;
const directActionLocationPrefix =
  /^(?:(?:inside|in|within)\s+(?:the\s+)?(?:cwd|current working directory)\b[\s,.:;-]*|here\b[\s,.:;-]*|locally\b[\s,.:;-]*)+/;

const multiPartSplit = /(?:\s+and\s+|,\s|;\s|\bthen\b|\bnext\b|\bafter\b|\bfinally\b)/i;
const complexityBlocker =
  /\b(?:review|audit|diff|pull request|plan|design|strategy|roadmap|debug|diagnose|investigate|bug|error|exception|regression|with tests|and tests|test|tests|multi[- ]step|step \d+|walkthrough|tutorial|explore|experiment|refactor|explain|why|compare|document|docs|describe|discussion|trace|log|deploy|rollback|upgrade|downgrade)\b/;

// ---------------------------------------------------------------------------
// Vocabulary patterns (global, used with matchAll).
// ---------------------------------------------------------------------------

const askVocab =
  /\b(?:explain|compare|contrast|clarify|describe|differ(?:s|ent|ence|ences|ing|ed)?|understand|walk me through|walkthrough|purpose|meaning|reason|rationale|intuition|justification|conceptual(?:ly)?|high level|tldr|vs|versus)\b/g;
const askQuestionWords = /\b(?:what|how|why|when|where|who|which|whose|whom)\b/g;
const askHedges =
  /\b(?:read.?only|without (?:changing|editing|modifying)|no edits?|explanation only|no code|just curious|for learning)\b/g;

const planVocab =
  /\b(?:plans?|(?:re)?designs?|strateg(?:y|ies|ise|ize)|approach(?:es)?|roadmaps?|specs?|proposals?|outlines?|blueprints?|goals?|objectives?|milestones?|timelines?|phases?|requirements?|tradeoffs?|risks?|contracts?|verification|acceptance criteria|criteria|decisions?|alternatives?)\b/g;
const planGates =
  /\b(?:plan first|before (?:coding|implementing|we code|writing code)|don'?t implement|dont implement|no implementation|just plan|only plan|do not code|no code)\b/g;

const debugSymptoms =
  /\b(?:bugs?|broken|flaky|failing|failure|errors?|exceptions?|crash(?:es|ed|ing)?|regressions?|incorrect|unexpected|wrong|stuck|hangs?|hanging|freezing|panicking|misbehav(?:e|es|ing))\b/g;
const debugActions =
  /\b(?:debug|investigate|diagnose|reproduce|repro|trace|step through|root.?cause|bisect|blame)\b/g;
const debugEvidence =
  /\b(?:traceback|stack ?trace|call ?stack|exit code|segfault|segmentation fault|null pointer|undefined is not|cannot read propert|nullpointerexception|typeerror|referenceerror|syntaxerror|rangeerror|eaccess|eperm|enoent|econnrefused|etimedout)\b/g;
const debugPhrases =
  /(?:\bnot working\b|\bdoesn'?t work\b|\bdoesnt work\b|\bwon'?t (?:start|compile|build|run)\b|\bwont (?:start|compile|build|run)\b|\bkeeps (?:crashing|failing|erroring|breaking)\b|\bis failing\b|\bstarted failing\b|\bwhy did\b|\bwhy was\b|\bwhy isn'?t\b|\bwhy isnt\b|\bwhat went wrong\b|\bsomething broke\b)/g;

const reviewVocab =
  /\b(?:review|audit|critique|feedback|evaluate|assess|analy[sz]e|go over|look over|sanity check)\b/g;
const reviewArtifacts =
  /\b(?:diff|patch|pr|pull request|merge request|commit|changelog|changeset|changes)\b/g;
const reviewTerms =
  /\b(?:findings|regressions?|risks?|missing tests?|concerns?|improvements?|nits?|readability|maintainability|pros|cons|approve|reject|block(?:ing)?|sign.?off|looks good)\b/g;

const implementVocab =
  /\b(?:implement|build|create|add|update|change|modify|write|ship|make|refactor|integrate|wire|support|complete|execute|set ?up|apply|replace|finish|develop|insert|move|delete|remove|inject|port|migrate|extract|rename|bump|upgrade|downgrade|scaffold|stub|extend)\b/g;
const implementFollowups =
  /\b(?:with tests|and tests|hook up|hook into|deliver|commit|push|merge|end to end|e2e)\b/g;
const fixVocab = /\b(?:fix|patch|resolve|address|repair|correct)\b/g;

const workspaceArtifact =
  /\b(?:folder|directory|file|readme|read-me|docs?|docstring|config(?:uration)?|package\.json|tsconfig(?:\.json)?|\.env|env|script|path|module|component|class|function|method|interface|type|variable|constant|api|endpoint|route|schema|model|migration|spec|fixture|hook|reducer|selector|command|provider|util(?:ity)?)\b/g;
const workspacePath =
  /(?:^|\s|[(`"'])(?:[a-z]:[\\/]|\.{1,2}[\\/]|~?[\\/]|[a-z0-9_.-]+[\\/])[^\s)`"']*/gi;
const fileLikeToken =
  /\b[a-z0-9_.-]+\.(?:ts|tsx|js|jsx|mjs|cjs|json|md|mdx|yml|yaml|toml|css|scss|sass|html|py|rs|go|java|kt|rb|php|sql|sh|bash|env)\b/gi;
const stackFrame = /\b(?:at\s+[a-z0-9_.$<>]+\s*\(|throw new\s|caused by)/gi;
const codeFence = /```|`[^`\n]+`/g;

// ---------------------------------------------------------------------------
// Public API.
// ---------------------------------------------------------------------------

export function detectAutoMode(
  content: string,
  availableModes: Array<Pick<ModeDefinition, "id">> = [],
  context: ModeIntentContext = {}
) {
  const availableModeIds = new Set(availableModes.map((mode) => mode.id));

  if (availableModeIds.has("implement") && isDirectWorkspaceImplementTask(content, context)) {
    return {
      modeId: "implement" as BuiltinAutoModeId,
      confidence: PLANNER_BYPASS_CONFIDENCE
    };
  }

  const scored = scoreBuiltinModeIntent(content).filter((entry) =>
    availableModeIds.has(entry.modeId)
  );
  if (scored.length === 0) return undefined;

  const sorted = [...scored].sort((a, b) => b.confidence - a.confidence);
  const best = sorted[0];
  const runnerUp = sorted[1];
  if (!best || best.confidence < AUTO_MODE_CONFIDENCE_THRESHOLD) return undefined;
  if (runnerUp && best.confidence - runnerUp.confidence < AUTO_MODE_MARGIN_THRESHOLD) {
    return undefined;
  }
  return best;
}

export function scoreBuiltinModeIntent(content: string) {
  const normalized = normalizeScoringIntentText(content);
  if (!normalized) return emptyScores();

  const wordCount = normalized.split(" ").filter(Boolean).length;

  // Very-short exact-match single-keyword shortcuts.
  if (wordCount < 3) {
    const exactShortcut = exactKeywordShortcut(normalized);
    if (exactShortcut) return [exactShortcut];
  }

  // Starter cues.
  const startsInfoQuestion = infoQuestionStart.test(normalized);
  const startsYesNoQuestion = yesNoQuestionStart.test(normalized);
  const startsExplain = explainStart.test(normalized);
  const startsPolite = politeActionStart.test(normalized);
  const startsPlan = planStart.test(normalized);
  const startsDebug = debugStart.test(normalized);
  const startsReview = reviewStart.test(normalized);
  const startsImplement = implementStart.test(normalized);
  const startsDirectAction = directActionStart.test(normalized);

  const hasQuestionMark = normalized.includes("?");
  const questionStyle = hasQuestionMark || startsInfoQuestion || startsExplain;

  // Vocabulary counts.
  const askVocabN = countMatches(normalized, askVocab);
  const askQuestionN = countMatches(normalized, askQuestionWords);
  const askHedgeN = countMatches(normalized, askHedges);

  const planVocabN = countMatches(normalized, planVocab);
  const planGateN = countMatches(normalized, planGates);

  const debugSymptomN = countMatches(normalized, debugSymptoms);
  const debugActionN = countMatches(normalized, debugActions);
  const debugEvidenceN = countMatches(normalized, debugEvidence);
  const debugPhraseN = countMatches(normalized, debugPhrases);

  const reviewVocabN = countMatches(normalized, reviewVocab);
  const reviewArtifactN = countMatches(normalized, reviewArtifacts);
  const reviewTermN = countMatches(normalized, reviewTerms);

  const implementVocabN = countMatches(normalized, implementVocab);
  const implementFollowupN = countMatches(normalized, implementFollowups);
  const fixVocabN = countMatches(normalized, fixVocab);

  const workspaceArtifactN = countMatches(normalized, workspaceArtifact);
  const workspacePathN = countMatches(normalized, workspacePath);
  const fileLikeN = countMatches(normalized, fileLikeToken);
  const codeFenceN = countMatches(normalized, codeFence);
  const stackFrameN = countMatches(normalized, stackFrame);

  const multiPart = multiPartSplit.test(normalized) ? 1 : 0;

  // Aggregate signals.
  const planSignals = planVocabN + planGateN;
  const debugSignals = debugSymptomN + debugActionN + debugEvidenceN + debugPhraseN;
  const reviewSignals = reviewVocabN + reviewArtifactN + reviewTermN;
  const implementSignals = implementVocabN + implementFollowupN + fixVocabN;
  const actionSignalsTotal = planSignals + debugSignals + reviewSignals + implementSignals;

  const startsAnotherMode = startsImplement || startsDebug || startsReview || startsPlan;
  const debugEvidenceCorroborated =
    (stackFrameN > 0 || debugEvidenceN > 0) && debugSymptomN + debugPhraseN > 0;

  const askScore = clamp01(
    (startsInfoQuestion ? 0.42 : 0) +
      (startsExplain ? 0.44 : 0) +
      (startsYesNoQuestion && !startsDirectAction ? 0.12 : 0) +
      (hasQuestionMark ? 0.14 : 0) +
      askVocabN * 0.16 +
      askQuestionN * 0.16 +
      askHedgeN * 0.22 -
      (startsPolite && actionSignalsTotal > 0 ? 0.26 : 0) -
      (multiPart ? 0.08 : 0) -
      (questionStyle && actionSignalsTotal > 1
        ? Math.min(0.22, 0.06 * actionSignalsTotal)
        : 0) -
      (startsAnotherMode ? 0.22 : 0)
  );

  const planScore = clamp01(
    planVocabN * 0.24 +
      planGateN * 0.38 +
      (startsPlan ? 0.38 : 0) -
      (reviewSignals > 0 && planGateN === 0 ? 0.1 : 0) -
      (implementSignals > 2 && planGateN === 0 ? 0.16 : 0) -
      (questionStyle && planSignals < 2 && planGateN === 0 ? 0.2 : 0) -
      (startsImplement && planGateN === 0 ? 0.18 : 0)
  );

  const debugScore = clamp01(
    debugSymptomN * 0.24 +
      debugActionN * 0.3 +
      debugEvidenceN * 0.4 +
      debugPhraseN * 0.36 +
      (stackFrameN > 0 ? 0.34 : 0) +
      (startsDebug ? 0.3 : 0) +
      (debugEvidenceCorroborated ? 0.14 : 0) -
      (reviewSignals > 1 ? 0.12 : 0) -
      (planGateN > 0 ? 0.14 : 0)
  );

  const reviewScore = clamp01(
    reviewVocabN * 0.26 +
      reviewArtifactN * 0.18 +
      reviewTermN * 0.2 +
      (startsReview ? 0.36 : 0) -
      (implementSignals > 2 && reviewVocabN === 0 ? 0.2 : 0) -
      (questionStyle && reviewSignals < 2 ? 0.14 : 0)
  );

  const implementScore = clamp01(
    implementVocabN * 0.18 +
      implementFollowupN * 0.18 +
      fixVocabN * 0.1 +
      (startsImplement ? 0.36 : 0) +
      (startsDirectAction ? 0.08 : 0) +
      Math.min(2, workspaceArtifactN) * 0.08 +
      Math.min(2, workspacePathN) * 0.09 +
      Math.min(2, fileLikeN) * 0.09 +
      (codeFenceN > 0 ? 0.04 : 0) -
      (planGateN > 0 ? 0.32 : 0) -
      (planSignals > 2 && implementVocabN === 0 ? 0.14 : 0) -
      (reviewSignals > 1 ? 0.18 : 0) -
      (questionStyle ? 0.18 : 0) -
      (multiPart && implementVocabN < 2 ? 0.06 : 0) -
      (debugEvidenceN > 0 && implementVocabN === 0 ? 0.2 : 0) -
      (stackFrameN > 0 && implementVocabN === 0 ? 0.18 : 0)
  );

  return [
    { modeId: "ask", confidence: askScore },
    { modeId: "plan", confidence: planScore },
    { modeId: "implement", confidence: implementScore },
    { modeId: "debug", confidence: debugScore },
    { modeId: "review", confidence: reviewScore }
  ] as Array<{ modeId: BuiltinAutoModeId; confidence: number }>;
}

export function estimateTaskDifficulty(content: string, context: ModeIntentContext = {}) {
  const normalized = normalizeScoringIntentText(content);
  if (!normalized) return 0;

  if (isDirectWorkspaceImplementTask(content, context)) {
    return 10;
  }

  const wordCount = normalized.split(" ").filter(Boolean).length;
  const sentenceCount = Math.max(1, normalized.split(/[.!?\n]+/).filter((part) => part.trim()).length);
  const planGateN = countMatches(normalized, planGates);
  const debugN =
    countMatches(normalized, debugSymptoms) +
    countMatches(normalized, debugActions) +
    countMatches(normalized, debugEvidence) +
    countMatches(normalized, debugPhrases);
  const reviewN =
    countMatches(normalized, reviewVocab) +
    countMatches(normalized, reviewArtifacts) +
    countMatches(normalized, reviewTerms);
  const implementN =
    countMatches(normalized, implementVocab) +
    countMatches(normalized, implementFollowups) +
    countMatches(normalized, fixVocab);
  const workspaceN =
    countMatches(normalized, workspaceArtifact) +
    countMatches(normalized, workspacePath) +
    countMatches(normalized, fileLikeToken);

  return Math.round(
    clamp01(
      0.08 +
        (Math.min(wordCount, 120) / 120) * 0.26 +
        Math.min(sentenceCount - 1, 6) * 0.04 +
        Math.min(planGateN, 2) * 0.26 +
        Math.min(debugN, 5) * 0.08 +
        Math.min(reviewN, 5) * 0.07 +
        Math.min(implementN, 6) * 0.04 +
        Math.min(workspaceN, 6) * 0.03 +
        (multiPartSplit.test(normalized) ? 0.08 : 0) +
        (/\b(?:architecture|migration|security|database|protocol|concurrency|state|persistence|integration|end to end|e2e)\b/.test(normalized) ? 0.12 : 0)
    ) * 100
  );
}

export function isDirectWorkspaceImplementTask(content: string, context: ModeIntentContext = {}) {
  return Boolean(extractWorkspaceAction(content, context));
}

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------

function normalizeIntentText(content: string) {
  return content.toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeScoringIntentText(content: string) {
  const normalized = normalizeIntentText(content);
  const corrected = normalized.replace(directActionCorrectionPrefix, "").trim();
  if (!corrected) {
    return normalized;
  }

  return infoQuestionStart.test(corrected) ||
    explainStart.test(corrected) ||
    directActionStart.test(corrected) ||
    implementStart.test(corrected) ||
    planStart.test(corrected) ||
    debugStart.test(corrected) ||
    reviewStart.test(corrected)
    ? corrected
    : normalized;
}

function normalizeDirectWorkspaceImplementText(content: string) {
  let normalized = normalizeIntentText(content);
  let previous = "";
  while (normalized && normalized !== previous) {
    previous = normalized;
    normalized = normalized.replace(directActionCorrectionPrefix, "").trim();
    normalized = normalized.replace(directActionLocationPrefix, "").trim();
  }

  return normalized;
}

export function extractWorkspaceAction(content: string, context: ModeIntentContext = {}) {
  const normalized = normalizeIntentText(content);
  const normalizedDirect = normalizeDirectWorkspaceImplementText(content);
  const inheritedAction = inferRecentWorkspaceAction(context.recentMessages);

  if (inheritedAction && shouldInheritWorkspaceAction(normalized, normalizedDirect, inheritedAction)) {
    return rebaseWorkspaceActionToCurrentScope(inheritedAction, normalized);
  }

  if (!normalizedDirect || normalizedDirect.includes("?")) {
    return undefined;
  }

  const wordCount = normalizedDirect.split(" ").filter(Boolean).length;
  if (wordCount > PLANNER_BYPASS_MAX_WORDS) {
    return undefined;
  }

  if (!directActionStart.test(normalizedDirect)) {
    return undefined;
  }

  if (complexityBlocker.test(normalizedDirect) || multiPartSplit.test(normalizedDirect)) {
    return undefined;
  }

  const target = extractExplicitWorkspaceTarget(normalizedDirect) ?? inferNamedWorkspaceTarget(normalizedDirect);
  const artifact = extractWorkspaceArtifact(normalizedDirect);
  const hasArtifact = Boolean(artifact) || hasGlobalMatch(normalizedDirect, workspaceArtifact);
  const hasPath = Boolean(target) || hasGlobalMatch(normalizedDirect, workspacePath) || hasGlobalMatch(normalizedDirect, fileLikeToken);
  if (!hasArtifact && !hasPath) {
    return undefined;
  }

  return {
    artifact: artifact ?? "workspace-artifact",
    target,
    inherited: false
  } satisfies WorkspaceAction;
}

function countMatches(input: string, pattern: RegExp) {
  // All vocabulary patterns in this module are declared with `g`, so matchAll
  // is safe. We never read `lastIndex` across calls.
  return Array.from(input.matchAll(pattern)).length;
}

function hasGlobalMatch(input: string, pattern: RegExp) {
  // matchAll is read-only with respect to `lastIndex` of the source regex.
  const iterator = input.matchAll(pattern);
  return !iterator.next().done;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function exactKeywordShortcut(normalized: string) {
  for (const id of builtinAutoModeIds) {
    if (normalized === id) return { modeId: id, confidence: 1 } as const;
  }
  return undefined;
}

function emptyScores() {
  return builtinAutoModeIds.map((id) => ({ modeId: id, confidence: 0 })) as Array<{
    modeId: BuiltinAutoModeId;
    confidence: number;
  }>;
}

function extractWorkspaceArtifact(input: string) {
  if (/\b(?:folder|directory)\b/.test(input)) {
    return "folder" as const;
  }

  if (/\b(?:file|readme|read-me|docs?|config(?:uration)?|package\.json|tsconfig(?:\.json)?|\.env|env)\b/.test(input)) {
    return "file" as const;
  }

  return undefined;
}

function extractExplicitWorkspaceTarget(input: string) {
  const pathMatch = input.match(workspacePath);
  if (pathMatch?.[0]) {
    return cleanWorkspaceTarget(pathMatch[0]);
  }

  const fileMatch = input.match(fileLikeToken);
  if (fileMatch?.[0]) {
    return cleanWorkspaceTarget(fileMatch[0]);
  }

  return undefined;
}

function inferNamedWorkspaceTarget(input: string) {
  const namedTargetMatch = input.match(
    /(?:folder|directory|file)\s+(?:named\s+|called\s+)?([a-z0-9_.-]+(?:[\\/][a-z0-9_.-]+)*)$/
  );
  if (namedTargetMatch?.[1]) {
    return cleanWorkspaceTarget(namedTargetMatch[1]);
  }

  return undefined;
}

function cleanWorkspaceTarget(value: string) {
  return value.trim().replace(/^[(`"']+|[)`"',.;:]+$/g, "");
}

function inferRecentWorkspaceAction(recentMessages: ModeIntentMessage[] | undefined) {
  if (!recentMessages?.length) {
    return undefined;
  }

  let fallbackAction: WorkspaceAction | undefined;
  for (let index = recentMessages.length - 1; index >= 0; index -= 1) {
    const message = recentMessages[index];
    if (!message || message.role === "system") {
      continue;
    }

    const normalized = normalizeIntentText(message.content);
    const artifact = extractWorkspaceArtifact(normalized);
    const target = extractExplicitWorkspaceTarget(normalized) ?? inferNamedWorkspaceTarget(normalized);
    if (!artifact && !target) {
      continue;
    }

    const action = {
      artifact: artifact ?? "workspace-artifact",
      target,
      inherited: true
    } satisfies WorkspaceAction;
    if (artifact) {
      return action;
    }

    fallbackAction ??= action;
  }

  return fallbackAction;
}

function shouldInheritWorkspaceAction(
  normalized: string,
  normalizedDirect: string,
  inheritedAction: WorkspaceAction | undefined
) {
  if (!inheritedAction) {
    return false;
  }

  if (!directActionCorrectionPrefix.test(normalized)) {
    return false;
  }

  if (normalizedDirect && directActionStart.test(normalizedDirect)) {
    return false;
  }

  return directActionLocationPrefix.test(normalized) || /\b(?:here|there|cwd|current working directory|same place)\b/.test(normalized);
}

function rebaseWorkspaceActionToCurrentScope(inheritedAction: WorkspaceAction, normalized: string) {
  const rebasedTarget =
    /\b(?:cwd|current working directory|here)\b/.test(normalized) && inheritedAction.target
      ? inheritedAction.target.split(/[\\/]/).filter(Boolean).at(-1)
      : inheritedAction.target;

  return {
    artifact: inheritedAction.artifact,
    target: rebasedTarget,
    inherited: true
  } satisfies WorkspaceAction;
}
