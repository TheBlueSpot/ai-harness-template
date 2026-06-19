import { expect, test } from "bun:test";
import { assistantTodoPatchSchema, assistantTodoSchema, parseClientCommand, parseServerEvent } from "./protocol";

test("assistant todo schema defaults work metadata", () => {
  const parsed = assistantTodoSchema.parse({
    id: "todo-1",
    assistantId: "assistant-1",
    title: "Update docs",
    state: "pending",
    sortOrder: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  expect(parsed.workKind).toBe("unspecified");
});

test("assistant todo patch schema accepts work metadata", () => {
  expect(
    assistantTodoPatchSchema.parse({
      workKind: "app-code",
      workTarget: "src/app.tsx"
    })
  ).toEqual({
    workKind: "app-code",
    workTarget: "src/app.tsx"
  });
  expect(assistantTodoPatchSchema.parse({ workTarget: null })).toEqual({ workTarget: null });
});

test("assistant pagination commands and events parse", () => {
  expect(
    parseClientCommand({
      type: "assistant.detail.get",
      requestId: "req-detail",
      payload: {
        assistantId: "assistant-1"
      }
    }).type
  ).toBe("assistant.detail.get");
  expect(
    parseClientCommand({
      type: "assistant.logs.list",
      requestId: "req-logs",
      payload: {
        assistantId: "assistant-1",
        cursor: JSON.stringify({ timestamp: "2026-01-01T00:00:00.000Z", id: "log-1" }),
        limit: 50
      }
    }).type
  ).toBe("assistant.logs.list");

  const now = new Date().toISOString();
  expect(
    parseServerEvent({
      type: "assistant.summary.listed",
      requestId: "req-summary",
      payload: {
        assistants: {
          items: [
            {
              id: "assistant-1",
              name: "Helper",
              scope: "global",
              personalityPrompt: "Concise.",
              jobPrompt: "Help.",
              agentId: "pi",
              runState: "active",
              bootstrapState: "completed",
              failureStreakCount: 0,
              circuitBreakerState: "closed",
              unreadQuestionCount: 0,
              createdAt: now,
              updatedAt: now
            }
          ],
          nextCursor: JSON.stringify({ timestamp: now, id: "assistant-1" }),
          totalApprox: 1
        }
      }
    }).type
  ).toBe("assistant.summary.listed");
});
