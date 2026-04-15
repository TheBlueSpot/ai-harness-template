import { ZodError } from "zod";
import {
  plannerTurnResultSchema,
  type ChatMessage,
  type ProjectContextUsage,
  type PlannerTurnResult,
  type PlanningQuestion,
  type ProviderBrand,
  type ProviderModelId
} from "../../shared/protocol";
import type { PiAgentAdapter } from "./pi-agent-adapter";

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
    executionModelId?: ProviderModelId;
    priorQuestions?: PlanningQuestion[];
    abortSignal?: AbortSignal;
  }
): Promise<{ plannerResult: PlannerTurnResult; contextUsage?: ProjectContextUsage }> {
  const requestedExecutionModelId = options.executionModelId ?? getDefaultExecutionModelId(options.providerBrand);
  const defaultPlanningModelId = getDefaultPlanningModelId(options.providerBrand);
  const prompt = [
    "You are the planning stage for a local coding harness.",
    "Return JSON only. Do not wrap it in markdown fences.",
    "Schema:",
    `{"type":"question","summary":"","question":{"id":"question-1","prompt":"","placeholder":"","choices":[{"id":"choice-1","label":"","description":"","answerText":"","recommended":true},{"id":"choice-2","label":"","description":"","answerText":"","recommended":false},{"id":"choice-3","label":"","description":"","answerText":"","recommended":false}],"required":true}}`,
    `{"type":"ready","difficultyScore":0,"summary":"","executionModelId":"${requestedExecutionModelId}","usesSubagents":false,"subtasks":[{"id":"task-1","title":"","instruction":""}],"finalExecutionBrief":""}`,
    "",
    "Rules:",
    "- You may ask at most one blocking question per turn.",
    "- Return type=question only when missing information would materially change the plan or execution target.",
    "- question.required must always be true.",
    "- question.choices must contain exactly three options.",
    "- Exactly one question choice must set recommended=true.",
    "- Each choice must include concrete answerText that can be sent back verbatim.",
    "- difficultyScore must be an integer from 0 to 100.",
    "- usesSubagents must be true only when difficultyScore is greater than 40.",
    "- executionModelId must be provider-qualified.",
    "- Do not emit usesSubagents=true or non-empty subtasks while any required question remains unanswered.",
    "- subtasks must be empty when usesSubagents is false.",
    "- subtasks must be specific and independent when usesSubagents is true.",
    `- Use ${requestedExecutionModelId} unless the user explicitly requires another execution model from the same provider family.`,
    "",
    "Conversation transcript:",
    formatMessages(options.messages),
    "",
    "Prior planning Q/A:",
    formatPlanningQuestions(options.priorQuestions ?? []),
    "",
    `Latest user task: ${options.latestUserPrompt}`
  ].join("\n");

  const result = await adapter.runPrompt({
    kind: "planner",
    cwd: options.cwd,
    modelId: defaultPlanningModelId,
    prompt,
    abortSignal: options.abortSignal,
    readOnly: true
  });

  try {
    const parsed = normalizePlannerPayload(parseJsonPayload(result.text));
    return {
      plannerResult: plannerTurnResultSchema.parse(parsed),
      contextUsage: result.contextUsage
        ? {
            sourceKind: "planner",
            sourceLabel: "planner",
            modelId: defaultPlanningModelId,
            tokens: result.contextUsage.tokens,
            contextWindow: result.contextUsage.contextWindow,
            usagePercent: result.contextUsage.usagePercent,
            updatedAt: new Date().toISOString()
          }
        : undefined
    };
  } catch (error) {
    if (error instanceof ZodError) {
      throw new Error(`Planner returned invalid JSON payload: ${error.message}`);
    }

    throw error;
  }
}

function formatMessages(messages: ChatMessage[]) {
  const visibleMessages = messages.filter((message) => message.role !== "system");
  if (visibleMessages.length === 0) {
    return "(no prior messages)";
  }

  return visibleMessages.map((message) => `${message.role.toUpperCase()}: ${message.content}`).join("\n");
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

  if (trimmed.startsWith("```")) {
    const lines = trimmed.split(/\r?\n/).filter((line) => !line.startsWith("```"));
    return JSON.parse(lines.join("\n"));
  }

  return JSON.parse(trimmed);
}

function normalizePlannerPayload(input: unknown) {
  if (
    input &&
    typeof input === "object" &&
    !("type" in input) &&
    "difficultyScore" in input &&
    "executionModelId" in input
  ) {
    return {
      type: "ready",
      ...input
    };
  }

  return input;
}

export function getDefaultPlanningModelId(providerBrand: ProviderBrand): ProviderModelId {
  return providerBrand === "gemini" ? GEMINI_DEFAULT_PLANNING_MODEL_ID : GPT_DEFAULT_PLANNING_MODEL_ID;
}

export function getDefaultExecutionModelId(providerBrand: ProviderBrand): ProviderModelId {
  return providerBrand === "gemini" ? GEMINI_DEFAULT_EXECUTION_MODEL_ID : GPT_DEFAULT_EXECUTION_MODEL_ID;
}

export function getDefaultSubagentModelId(providerBrand: ProviderBrand): ProviderModelId {
  return providerBrand === "gemini" ? GEMINI_DEFAULT_SUBAGENT_MODEL_ID : GPT_DEFAULT_SUBAGENT_MODEL_ID;
}
