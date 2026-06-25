import { expect, test } from "bun:test";
import type { Assistant, AssistantTodo } from "../../shared/protocol";
import {
  applyAssistantTodoPolicy,
  assistantGoalImpliesCoding,
  inferAssistantTodoWorkKind,
  resolveAssistantTodoBiasStage
} from "./assistant-todo-policy";

const assistant = {
  name: "Builder",
  description: "Build a project",
  jobPrompt: "Build a TypeScript app and improve product behavior."
} satisfies Pick<Assistant, "name" | "description" | "jobPrompt">;

function todo(workKind: AssistantTodo["workKind"], source: AssistantTodo["source"] = "assistant") {
  return { workKind, source };
}

test("classifies assistant todo work kinds from text", () => {
  expect(inferAssistantTodoWorkKind("Implement Solid route", "Add bun test coverage")).toBe("app-code");
  expect(inferAssistantTodoWorkKind("Create validation script")).toBe("automation-code");
  expect(inferAssistantTodoWorkKind("Update README")).toBe("documentation");
  expect(inferAssistantTodoWorkKind("Research competitor behavior")).toBe("research");
  expect(inferAssistantTodoWorkKind("Blocked pending API key")).toBe("blocked");
});

test("detects build-oriented assistant goals", () => {
  expect(assistantGoalImpliesCoding(assistant)).toBe(true);
  expect(assistantGoalImpliesCoding({ name: "Notes", description: "Summarize notes", jobPrompt: "Maintain meeting notes." })).toBe(false);
});

test("allows early discovery before build-stage coding bias", () => {
  expect(resolveAssistantTodoBiasStage({ existingTodos: [todo("documentation")] })).toBe("early");
  expect(resolveAssistantTodoBiasStage({ existingTodos: [todo("documentation"), todo("research"), todo("app-code")] })).toBe("build");
});

test("adds coding todo when build-stage batch is docs-only", () => {
  const result = applyAssistantTodoPolicy({
    assistant,
    existingTodos: [todo("documentation"), todo("research"), todo("documentation")],
    drafts: [{ title: "Update project README", workKind: "documentation" }]
  });

  expect(result[0]?.workKind).toBe("app-code");
  expect(result[0]?.description).toContain("Bun runtime");
  expect(result[0]?.description).toContain("documentation comments for new functions and variables");
  expect(result[0]?.workTarget).toContain("documentation comments for new functions and variables");
});

test("keeps coding todos before limited non-coding todos in build stage", () => {
  const result = applyAssistantTodoPolicy({
    assistant,
    existingTodos: [todo("documentation"), todo("research"), todo("automation-code")],
    drafts: [
      { title: "Research workflow", workKind: "research" },
      { title: "Implement API", workKind: "app-code" },
      { title: "Update docs", workKind: "documentation" }
    ]
  });

  expect(result.map((entry) => entry.workKind)).toEqual(["app-code", "research"]);
});
