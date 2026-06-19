import type { Assistant, AssistantTodo } from "../../shared/protocol";

export type AssistantTodoDraft = {
  title: string;
  description?: string;
  workKind?: AssistantTodo["workKind"];
  workTarget?: string;
};

export type NormalizedAssistantTodoDraft = Required<Pick<AssistantTodoDraft, "title" | "workKind">> &
  Pick<AssistantTodoDraft, "description" | "workTarget">;

const DEFAULT_STACK_TARGET = "TypeScript Bun app with bun test, bun:sqlite when persistence is needed, SolidJS + Tailwind UI when needed, and Happy DOM UI tests";

export function inferAssistantTodoWorkKind(title: string, description?: string): AssistantTodo["workKind"] {
  const text = `${title} ${description ?? ""}`.toLowerCase();
  if (/\b(blocked|waiting|approval|decide|choose|clarify|question)\b/.test(text)) {
    return "blocked";
  }
  if (/\b(doc|docs|readme|guide|notes|write[- ]?up|changelog)\b/.test(text)) {
    return "documentation";
  }
  if (/\b(research|compare|investigate|audit|survey|market|explore)\b/.test(text)) {
    return "research";
  }
  if (/\b(script|skill|automation|validator|generator|cli|workflow|check)\b/.test(text)) {
    return "automation-code";
  }
  if (/\b(build|implement|code|component|screen|route|api|backend|frontend|sqlite|database|schema|test|typecheck|solid|tailwind|bun|typescript|tsx|ts)\b/.test(text)) {
    return "app-code";
  }
  return "unspecified";
}

export function isCodingTodoKind(kind: AssistantTodo["workKind"]) {
  return kind === "app-code" || kind === "automation-code";
}

export function assistantGoalImpliesCoding(assistant: Pick<Assistant, "description" | "jobPrompt" | "name">) {
  const text = `${assistant.name} ${assistant.description ?? ""} ${assistant.jobPrompt}`.toLowerCase();
  return /\b(build|implement|code|coding|app|product|feature|workflow|automation|script|frontend|backend|ui|api|database|sqlite|solid|tailwind|typescript|bun)\b/.test(text);
}

export function resolveAssistantTodoBiasStage(input: {
  existingTodos: Array<Pick<AssistantTodo, "source" | "workKind">>;
}) {
  const assistantGeneratedCount = input.existingTodos.filter((todo) => todo.source !== "user").length;
  const codingCount = input.existingTodos.filter((todo) => isCodingTodoKind(todo.workKind)).length;
  return assistantGeneratedCount <= 2 && codingCount === 0 ? "early" : "build";
}

export function applyAssistantTodoPolicy(input: {
  assistant: Pick<Assistant, "description" | "jobPrompt" | "name">;
  existingTodos: Array<Pick<AssistantTodo, "source" | "workKind">>;
  drafts: AssistantTodoDraft[];
}) {
  const normalized = input.drafts
    .map(normalizeDraft)
    .filter((todo) => todo.title.trim().length > 0);
  const codingGoal = assistantGoalImpliesCoding(input.assistant);
  const stage = resolveAssistantTodoBiasStage({ existingTodos: input.existingTodos });

  if (!codingGoal || stage === "early") {
    return normalized;
  }

  const codingTodos = normalized.filter((todo) => isCodingTodoKind(todo.workKind));
  const nonCodingTodos = normalized.filter((todo) => !isCodingTodoKind(todo.workKind));
  const allowedNonCoding = nonCodingTodos.slice(0, codingTodos.length > 0 ? 1 : 0);
  const result = [...codingTodos, ...allowedNonCoding];
  if (result.some((todo) => isCodingTodoKind(todo.workKind))) {
    return result;
  }

  return [buildDefaultCodingTodoDraft(input.assistant), ...allowedNonCoding];
}

export function buildDefaultCodingTodoDraft(
  assistant: Pick<Assistant, "description" | "jobPrompt" | "name">
): NormalizedAssistantTodoDraft {
  const target = assistantGoalImpliesCoding(assistant) ? DEFAULT_STACK_TARGET : "Smallest useful TypeScript implementation target";
  return {
    title: "Build the smallest usable TypeScript project behavior",
    description:
      "Create or update real project files before adding more docs. Default to Bun runtime, bun test, bun:sqlite when persistence is needed, SolidJS + Tailwind when UI is needed, and Happy DOM for frontend tests.",
    workKind: "app-code",
    workTarget: target
  };
}

function normalizeDraft(draft: AssistantTodoDraft): NormalizedAssistantTodoDraft {
  const workKind = draft.workKind ?? inferAssistantTodoWorkKind(draft.title, draft.description);
  return {
    title: draft.title.trim(),
    description: draft.description?.trim() || undefined,
    workKind,
    workTarget: draft.workTarget?.trim() || undefined
  };
}
