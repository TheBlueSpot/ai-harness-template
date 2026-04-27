import { describe, expect, test } from "bun:test";
import { createAssistantId, type Assistant, type AssistantQuestion, type AssistantTodo, type BackgroundJob } from "../../shared/protocol";
import { resolveAssistantChatAction } from "./assistant-chat-actions";

const now = new Date().toISOString();

function assistant(overrides: Partial<Assistant> = {}): Assistant {
  return {
    id: createAssistantId(),
    name: "Release watcher",
    scope: "project",
    projectId: "project-1",
    personalityPrompt: "Watch releases.",
    jobPrompt: "Track release notes.",
    agentId: "pi",
    runState: "active",
    bootstrapState: "completed",
    failureStreakCount: 0,
    circuitBreakerState: "closed",
    unreadQuestionCount: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

function resolve(content: string, overrides: Partial<Parameters<typeof resolveAssistantChatAction>[0]> = {}) {
  const target = assistant();
  return resolveAssistantChatAction({
    content,
    projectId: "project-1",
    assistants: [target],
    jobs: [],
    questions: [],
    todos: [],
    ...overrides
  });
}

describe("assistant chat actions", () => {
  test("resolves addressed job listing without planner", () => {
    const result = resolve("hey Release watcher what background jobs do you have queued");
    expect(result.kind).toBe("execute");
    if (result.kind === "execute") {
      expect(result.action.actionKind).toBe("list-jobs");
      expect(result.action.assistant.name).toBe("Release watcher");
    }
  });

  test("resolves bare named assistant imperative when assistant exists", () => {
    const result = resolve("Catalog builder start executing todos", {
      assistants: [assistant({ name: "Catalog builder" })]
    });
    expect(result.kind).toBe("execute");
    if (result.kind === "execute") {
      expect(result.action.actionKind).toBe("chat");
      expect(result.action.answerText).toBe("start executing todos");
      expect(result.action.assistant.name).toBe("Catalog builder");
    }
  });

  test("asks for schedule when creating a job without schedule", () => {
    const result = resolve("schedule Release watcher to check docs");
    expect(result.kind).toBe("clarify");
    if (result.kind === "clarify") {
      expect(result.intent.actionKind).toBe("create-job");
      expect(result.prompt).toContain("schedule");
    }
  });

  test("resolves a scheduled assistant-owned job", () => {
    const result = resolve("schedule Release watcher to check docs every 2 hours");
    expect(result.kind).toBe("execute");
    if (result.kind === "execute") {
      expect(result.action.actionKind).toBe("create-job");
      expect(result.action.jobPrompt).toBe("check docs");
      expect(result.action.scheduleText).toBe("2 hours");
    }
  });

  test("requires a job when multiple assistant jobs exist", () => {
    const target = assistant();
    const jobs = ["job-1", "job-2"].map((id) => ({
      id,
      projectId: "project-1",
      assistantId: target.id,
      automationThreadId: `thread-${id}`,
      kind: "ai-routine",
      name: id,
      status: "enabled",
      riskLevel: "unsafe",
      definition: { kind: "ai-routine", prompt: id },
      schedule: { type: "interval", intervalSeconds: 3600, nextRunAt: now, sourceText: "hour" },
      scheduleInput: "hour",
      createdAt: now,
      updatedAt: now
    })) satisfies BackgroundJob[];
    const result = resolve("run Release watcher job now", { assistants: [target], jobs });
    expect(result.kind).toBe("clarify");
  });

  test("resolves question and todo actions", () => {
    const target = assistant();
    const question: AssistantQuestion = {
      id: "question-1",
      assistantId: target.id,
      prompt: "Ship now?",
      status: "pending",
      linkedTodoIds: [],
      askedAt: now
    };
    const todo: AssistantTodo = {
      id: "todo-1",
      assistantId: target.id,
      title: "check changelog",
      state: "pending",
      sortOrder: 0,
      createdAt: now,
      updatedAt: now
    };
    const questionResult = resolve("answer Release watcher's question: yes", { assistants: [target], questions: [question] });
    const todoResult = resolve('mark Release watcher todo "check changelog" done', { assistants: [target], todos: [todo] });
    expect(questionResult.kind).toBe("execute");
    expect(todoResult.kind).toBe("execute");
  });
});
