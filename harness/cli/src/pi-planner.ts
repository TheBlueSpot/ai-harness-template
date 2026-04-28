import { ZodError, type ZodIssue } from "zod";
import {
  plannerTurnResultSchema,
  type ChatMessage,
  type ComposerReasoningStrength,
  type MemorySummary,
  type ModeDefinition,
  type ProjectContextUsage,
  type PlannerTurnResult,
  type PlanningQuestion,
  type ProviderBrand,
  type ProviderModelId,
  type WorkspaceRuleSource
} from "../../shared/protocol";
import type { PiAgentAdapter } from "./pi-agent-adapter";
import { buildPromptAttachmentContext } from "./chat-attachment-prompt";
import { resolveSubagentModelId } from "./subagent-defaults";
import { buildWorkspacePathGuidance, normalizeWorkspaceRelativePaths } from "./workspace-path-intent";

export const GPT_DEFAULT_PLANNING_MODEL_ID = "openai/gpt-5.4";
export const GPT_DEFAULT_EXECUTION_MODEL_ID = "openai/gpt-5.4";
export const GPT_DEFAULT_SUBAGENT_MODEL_ID = "openai/gpt-5.4-nano";
export const GEMINI_DEFAULT_PLANNING_MODEL_ID = "google/gemini-3-flash-preview";
export const GEMINI_DEFAULT_EXECUTION_MODEL_ID = "google/gemini-2.5-flash";
export const GEMINI_DEFAULT_SUBAGENT_MODEL_ID = "google/gemini-2.5-flash-lite";

export async function planTask(
  adapter: PiAgentAdapter,
  options: {
    cwd: string;
    messages: ChatMessage[];
    latestUserPrompt: string;
    providerBrand: ProviderBrand;
    planningModelId?: ProviderModelId;
    executionModelId?: ProviderModelId;
    mode?: ModeDefinition;
    ruleSources?: WorkspaceRuleSource[];
    memorySummaries?: MemorySummary[];
    priorQuestions?: PlanningQuestion[];
    reasoningStrength?: ComposerReasoningStrength;
    fastMode?: boolean;
    abortSignal?: AbortSignal;
  }
): Promise<{ plannerResult: PlannerTurnResult; contextUsage?: ProjectContextUsage }> {
  const requestedExecutionModelId = options.executionModelId ?? getDefaultExecutionModelId(options.providerBrand);
  const planningModelId = options.planningModelId ?? getDefaultPlanningModelId(options.providerBrand);
  const attachmentContext = await buildPromptAttachmentContext(options.messages);
  const workspacePathGuidance = buildWorkspacePathGuidance(options.latestUserPrompt, options.cwd);
  const normalizedLatestUserPrompt = normalizeWorkspaceRelativePaths(options.latestUserPrompt, options.cwd);
  const prompt = [
    "You are the planning stage for a local coding harness.",
    "Return JSON only. Do not wrap it in markdown fences.",
    "Schema:",
    `{"type":"question","summary":"","questions":[{"id":"question-1","prompt":"","placeholder":"","choices":[{"id":"choice-1","label":"","description":"","answerText":"","recommended":true},{"id":"choice-2","label":"","description":"","answerText":"","recommended":false},{"id":"choice-3","label":"","description":"","answerText":"","recommended":false}],"required":true}]}`,
    `{"type":"ready","difficultyScore":0,"summary":"","executionModelId":"${requestedExecutionModelId}","usesSubagents":false,"subtasks":[{"id":"task-1","title":"","instruction":""}],"finalExecutionBrief":"","prerequisites":[{"id":"setup-1","title":"","instruction":"","reason":"","requiredForTaskIds":["task-1"],"owner":"main","status":"pending"}],"contracts":[{"taskId":"task-1","title":"","instruction":"","effortPoints":3,"ownedPaths":["src/example.ts"],"dependsOnPrerequisiteIds":[],"deliverables":[""],"integrationPoints":[""],"verificationScope":"owned-files-only","verificationCommands":["bun run typecheck"],"mergeNotes":""}]}`,
    "",
    "Rules:",
    "- Ask only when missing information would materially change the plan or execution target.",
    "- If multiple blockers exist, batch all related blocking questions in one type=question response instead of asking turn-by-turn.",
    "- question.required must always be true.",
    "- questions must contain 1 to 5 items.",
    "- Each question.choices must contain exactly three options.",
    "- Exactly one question choice must set recommended=true.",
    "- Each choice must include concrete answerText that can be sent back verbatim.",
    "- difficultyScore must be an integer from 0 to 100.",
    "- usesSubagents must be true only when difficultyScore is greater than 40.",
    "- executionModelId must be provider-qualified.",
    "- Do not emit usesSubagents=true or non-empty subtasks while any required question remains unanswered.",
    "- subtasks must be empty when usesSubagents is false.",
    "- subtasks must be specific and independent when usesSubagents is true.",
    "- Main planning owns all decomposition before execution. Subagents receive implementation packets, not open-ended planning work.",
    "- When usesSubagents is true, emit contracts with concrete ownedPaths whenever possible.",
    "- Each contract instruction must include the file update plan, expected public functions/classes/components/signatures, required data flow, and acceptance notes for that subtask.",
    "- Contract deliverables must name concrete files, exported symbols, UI states, or behavior the subagent must produce.",
    "- Contract integrationPoints must name the sibling files, imports, call sites, or runtime surfaces the main agent will merge or verify.",
    "- Contract verificationCommands are for the main harness verification pass; do not put verification work into subtask instructions.",
    "- Contract verificationScope must be exactly \"owned-files-only\" or \"worktree-full\". Use \"worktree-full\" for full app, full workspace, or whole project checks.",
    "- prerequisites[].owner must be exactly \"main\" or \"subagent\".",
    "- Use prerequisites[].owner=\"main\" for user-requested setup, shared setup, scaffolding, repo inspection, migrations, and any work not owned by one subagent.",
    "- Never emit \"user\", \"human\", \"developer\", \"assistant\", \"executor\", or \"agent\" as a prerequisite owner.",
    "- Every enum field must use one of the exact schema literals shown.",
    "- Same-worktree parallel work requires contracts with non-overlapping ownedPaths.",
    "- For greenfield apps, use prerequisites for shared scaffold/setup, then split subagents by concrete files or folders.",
    "- For new directories, include the first file each subagent should create so implementation can start without extra discovery.",
    "- If paths are genuinely ambiguous, keep subagent contracts but use ownedPaths [\"(planner-unspecified)\"]; the scheduler will run those same-worktree tasks sequentially.",
    `- Use ${requestedExecutionModelId} unless the user explicitly requires another execution model from the same provider family.`,
    "",
    options.mode
      ? [
          "Active mode:",
          `- ${options.mode.label}: ${options.mode.description}`,
          `- Planner guidance: ${options.mode.plannerPrompt}`,
          `- Execution guidance: ${options.mode.executionPrompt}`,
          `- Tool policy: ${options.mode.toolPolicy}`
        ].join("\n")
      : "",
    options.ruleSources && options.ruleSources.length > 0
      ? ["Rule sources:", ...options.ruleSources.map((rule) => `[${rule.scope}] ${rule.label}: ${rule.content}`)].join("\n")
      : "",
    options.memorySummaries && options.memorySummaries.length > 0
      ? [
          "Memory summaries:",
          ...options.memorySummaries.map((memory) => `[${memory.scope}] ${memory.label}: ${memory.content}`)
        ].join("\n")
      : "",
    "",
    "Conversation transcript:",
    attachmentContext.transcript,
    "",
    "Prior planning Q/A:",
    formatPlanningQuestions(options.priorQuestions ?? []),
    "",
    workspacePathGuidance ?? "",
    workspacePathGuidance ? "" : undefined,
    `Latest user task: ${normalizedLatestUserPrompt}`
  ].join("\n");

  const result = await adapter.runPrompt({
    kind: "planner",
    cwd: options.cwd,
    modelId: planningModelId,
    prompt,
    images: attachmentContext.images,
    reasoningStrength: options.reasoningStrength,
    fastMode: options.fastMode,
    abortSignal: options.abortSignal,
    readOnly: true
  });

  let rawPayload = parseJsonPayload(result.text);

  try {
    const parsed = normalizePlannerWorkspacePaths(parsePlannerTurnPayload(rawPayload), options.cwd);
    return {
      plannerResult: parsed,
      contextUsage: result.contextUsage
        ? {
            sourceKind: "planner",
            sourceLabel: "planner",
            modelId: planningModelId,
            tokens: result.contextUsage.tokens,
            contextWindow: result.contextUsage.contextWindow,
            usagePercent: result.contextUsage.usagePercent,
            totalProcessedTokens: result.contextUsage.sessionStats.tokens.total,
            updatedAt: new Date().toISOString()
          }
        : undefined
    };
  } catch (error) {
    if (error instanceof ZodError) {
      const repairResult = await adapter.runPrompt({
        kind: "planner",
        cwd: options.cwd,
        modelId: planningModelId,
        prompt: buildPlannerRepairPrompt(prompt, rawPayload, error),
        images: attachmentContext.images,
        reasoningStrength: options.reasoningStrength,
        fastMode: options.fastMode,
        abortSignal: options.abortSignal,
        readOnly: true
      });

      try {
        rawPayload = parseJsonPayload(repairResult.text);
        const parsed = normalizePlannerWorkspacePaths(parsePlannerTurnPayload(rawPayload), options.cwd);
        return {
          plannerResult: parsed,
          contextUsage: repairResult.contextUsage
            ? {
                sourceKind: "planner",
                sourceLabel: "planner",
                modelId: planningModelId,
                tokens: repairResult.contextUsage.tokens,
                contextWindow: repairResult.contextUsage.contextWindow,
                usagePercent: repairResult.contextUsage.usagePercent,
                totalProcessedTokens: repairResult.contextUsage.sessionStats.tokens.total,
                updatedAt: new Date().toISOString()
              }
            : undefined
        };
      } catch (repairError) {
        if (repairError instanceof ZodError) {
          throw new Error(`Planner returned invalid JSON payload after repair: ${formatZodIssues(repairError.issues)}`);
        }

        if (repairError instanceof SyntaxError) {
          throw new Error(`Planner repair returned invalid JSON: ${repairError.message}`);
        }

        throw repairError;
      }
    }

    throw error;
  }
}

function parsePlannerTurnPayload(input: unknown) {
  return plannerTurnResultSchema.parse(normalizePlannerPayload(input));
}

function buildPlannerRepairPrompt(originalPrompt: string, invalidPayload: unknown, error: ZodError) {
  return [
    "Repair the planner JSON payload so it exactly matches the schema.",
    "Return JSON only. Do not wrap it in markdown fences.",
    "Do not change the user intent, task ids, paths, or model ids unless required by the schema.",
    "Use exact enum literals from the schema. In particular, prerequisite owner must be \"main\" or \"subagent\" only.",
    "",
    "Validation errors:",
    formatZodIssues(error.issues),
    "",
    "Invalid payload:",
    JSON.stringify(invalidPayload, null, 2),
    "",
    "Original planner instructions:",
    originalPrompt
  ].join("\n");
}

function formatZodIssues(issues: ZodIssue[]) {
  return issues.map(formatZodIssue).join("; ");
}

function formatZodIssue(issue: ZodIssue) {
  const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
  if (issue.code === "invalid_enum_value") {
    return `${path}: expected ${issue.options.map((option) => JSON.stringify(option)).join(" | ")}, received ${JSON.stringify(issue.received)}`;
  }

  return `${path}: ${issue.message}`;
}

function formatPlanningQuestions(questions: PlanningQuestion[]) {
  if (questions.length === 0) {
    return "(none)";
  }

  return questions
    .map((question) =>
      [
        `Question: ${question.prompt}`,
        question.answerText ? `Answer: ${question.answerText}` : "Answer: (pending)"
      ].join("\n")
    )
    .join("\n\n");
}

function parseJsonPayload(input: string) {
  const trimmed = input.trim();
  const unfenced = unwrapMarkdownFences(trimmed);

  try {
    return JSON.parse(unfenced);
  } catch (error) {
    const extracted = extractFirstJsonPayload(unfenced);
    if (!extracted) {
      throw error;
    }

    return JSON.parse(extracted);
  }
}

function unwrapMarkdownFences(input: string) {
  if (!input.startsWith("```")) {
    return input;
  }

  const lines = input.split(/\r?\n/);
  if (lines.length >= 2 && lines.at(-1)?.startsWith("```")) {
    return lines.slice(1, -1).join("\n").trim();
  }

  return lines.filter((line) => !line.startsWith("```")).join("\n").trim();
}

function extractFirstJsonPayload(input: string) {
  let startIndex = -1;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (character === "{" || character === "[") {
      startIndex = index;
      break;
    }
  }
  if (startIndex < 0) {
    return undefined;
  }

  let inString = false;
  let escaped = false;
  const stack: string[] = [];

  for (let index = startIndex; index < input.length; index += 1) {
    const character = input[index]!;

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (character === "\\") {
        escaped = true;
        continue;
      }

      if (character === "\"") {
        inString = false;
      }
      continue;
    }

    if (character === "\"") {
      inString = true;
      continue;
    }

    if (character === "{" || character === "[") {
      stack.push(character);
      continue;
    }

    if (character === "}" || character === "]") {
      const opener = stack.pop();
      if (!opener) {
        return undefined;
      }

      if ((opener === "{" && character !== "}") || (opener === "[" && character !== "]")) {
        return undefined;
      }

      if (stack.length === 0) {
        return input.slice(startIndex, index + 1);
      }
    }
  }

  return undefined;
}

export const testExports = {
  parseJsonPayload,
  parsePlannerTurnPayload,
  normalizePlannerPayload,
  normalizePlannerPrerequisiteOwner,
  normalizePlannerPrerequisites,
  normalizePlannerWorkspacePaths
};

function normalizePlannerPayload(input: unknown) {
  const normalized = normalizePlannerPrerequisites(normalizePlannerVerificationScopes(input));
  if (normalized && typeof normalized === "object" && !Array.isArray(normalized)) {
    const payload = normalized as Record<string, unknown>;
    if (payload.type === "question") {
      const questions = Array.isArray(payload.questions)
        ? payload.questions
        : payload.question
          ? [payload.question]
          : [];
      if (questions.length > 0) {
        return {
          ...payload,
          question: payload.question ?? questions[0],
          questions
        };
      }
    }
  }
  if (
    normalized &&
    typeof normalized === "object" &&
    !("type" in normalized) &&
    "difficultyScore" in normalized &&
    "executionModelId" in normalized
  ) {
    return {
      type: "ready",
      ...normalized
    };
  }

  return normalized;
}

function normalizePlannerPrerequisites(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return input;
  }

  const payload = input as Record<string, unknown>;
  if (!Array.isArray(payload.prerequisites)) {
    return input;
  }

  return {
    ...payload,
    prerequisites: payload.prerequisites.map((prerequisite) => {
      if (!prerequisite || typeof prerequisite !== "object" || Array.isArray(prerequisite)) {
        return prerequisite;
      }

      const prerequisiteRecord = prerequisite as Record<string, unknown>;
      return {
        ...prerequisiteRecord,
        owner: normalizePlannerPrerequisiteOwner(prerequisiteRecord.owner),
        status: prerequisiteRecord.status ?? "pending"
      };
    })
  };
}

function normalizePlannerPrerequisiteOwner(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.trim().toLowerCase();
  if (["user", "human", "developer", "assistant", "executor", "agent"].includes(normalized)) {
    return "main";
  }

  if (["sub-agent", "sub_agent", "worker"].includes(normalized)) {
    return "subagent";
  }

  return value;
}

function normalizePlannerVerificationScopes(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return input;
  }

  const payload = input as Record<string, unknown>;
  if (!Array.isArray(payload.contracts)) {
    return input;
  }

  return {
    ...payload,
    contracts: payload.contracts.map((contract) => {
      if (!contract || typeof contract !== "object" || Array.isArray(contract)) {
        return contract;
      }

      const contractRecord = contract as Record<string, unknown>;
      return {
        ...contractRecord,
        verificationScope: normalizePlannerVerificationScope(contractRecord.verificationScope)
      };
    })
  };
}

function normalizePlannerVerificationScope(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.trim().toLowerCase();
  if (["full-app", "full", "full-worktree", "whole-app", "whole-project", "workspace", "project"].includes(normalized)) {
    return "worktree-full";
  }

  if (["owned", "owned-files", "files-only"].includes(normalized)) {
    return "owned-files-only";
  }

  return value;
}

function normalizePlannerWorkspacePaths(plannerResult: PlannerTurnResult, cwd: string): PlannerTurnResult {
  if (plannerResult.type !== "ready") {
    return plannerResult;
  }

  return {
    ...plannerResult,
    summary: normalizeWorkspaceRelativePaths(plannerResult.summary, cwd),
    finalExecutionBrief: normalizeWorkspaceRelativePaths(plannerResult.finalExecutionBrief, cwd),
    subtasks: plannerResult.subtasks.map((subtask) => ({
      ...subtask,
      title: normalizeWorkspaceRelativePaths(subtask.title, cwd),
      instruction: normalizeWorkspaceRelativePaths(subtask.instruction, cwd)
    })),
    prerequisites: plannerResult.prerequisites?.map((prerequisite) => ({
      ...prerequisite,
      title: normalizeWorkspaceRelativePaths(prerequisite.title, cwd),
      instruction: normalizeWorkspaceRelativePaths(prerequisite.instruction, cwd),
      reason: normalizeWorkspaceRelativePaths(prerequisite.reason, cwd)
    })),
    contracts: plannerResult.contracts?.map((contract) => ({
      ...contract,
      title: normalizeWorkspaceRelativePaths(contract.title, cwd),
      instruction: normalizeWorkspaceRelativePaths(contract.instruction, cwd),
      ownedPaths: contract.ownedPaths.map((ownedPath) => normalizePlannerPathValue(ownedPath, cwd)),
      deliverables: contract.deliverables.map((deliverable) => normalizeWorkspaceRelativePaths(deliverable, cwd)),
      integrationPoints: contract.integrationPoints.map((point) => normalizeWorkspaceRelativePaths(point, cwd)),
      verificationCommands: contract.verificationCommands.map((command) => normalizeWorkspaceRelativePaths(command, cwd)),
      mergeNotes: normalizeWorkspaceRelativePaths(contract.mergeNotes, cwd)
    }))
  };
}

function normalizePlannerPathValue(value: string, cwd: string) {
  if (value.startsWith("/") && !value.startsWith("//")) {
    return value.slice(1);
  }

  return normalizeWorkspaceRelativePaths(value, cwd);
}

export function getDefaultPlanningModelId(providerBrand: ProviderBrand): ProviderModelId {
  return providerBrand === "gemini" ? GEMINI_DEFAULT_PLANNING_MODEL_ID : GPT_DEFAULT_PLANNING_MODEL_ID;
}

export function getDefaultExecutionModelId(providerBrand: ProviderBrand): ProviderModelId {
  return providerBrand === "gemini" ? GEMINI_DEFAULT_EXECUTION_MODEL_ID : GPT_DEFAULT_EXECUTION_MODEL_ID;
}

export function getDefaultSubagentModelId(
  providerBrand: ProviderBrand,
  executionModelId?: ProviderModelId | string
): ProviderModelId {
  return resolveSubagentModelId({
    agentId: "pi",
    providerBrand,
    executionModelId
  }) as ProviderModelId;
}
