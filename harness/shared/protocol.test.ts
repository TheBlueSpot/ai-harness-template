import { expect, test } from "bun:test";
import {
  assistantTodoPatchSchema,
  assistantTodoSchema,
  parseClientCommand,
  parseServerEvent,
  parseServerEventFrame,
  terminalSessionSchema
} from "./protocol";

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

test("terminal sessions carry transport degradation metadata", () => {
  const now = new Date().toISOString();

  const session = terminalSessionSchema.parse({
    id: "terminal-1",
    projectId: "project-1",
    name: "PowerShell",
    shellId: "powershell",
    cwd: "C:\\repo",
    status: "running",
    cols: 120,
    rows: 32,
    transportMode: "pipe",
    transportWarning: "Windows pipe transport",
    startedAt: now,
    updatedAt: now
  });

  expect(session.transportMode).toBe("pipe");
  expect(
    parseServerEvent({
      type: "terminal.session.updated",
      requestId: "req-terminal",
      payload: { session }
    }).type
  ).toBe("terminal.session.updated");
});

test("server event batch frames parse to ordered events", () => {
  const events = parseServerEventFrame({
    type: "server.events-batch",
    payload: {
      events: [
        {
          type: "connection.pong",
          requestId: "req-pong",
          payload: {
            timestamp: 1
          }
        },
        {
          type: "assistant.chat.delta",
          requestId: "req-delta",
          payload: {
            assistantId: "assistant-1",
            sessionId: "session-1",
            delta: "hello"
          }
        }
      ]
    }
  });

  expect(events.map((event) => event.type)).toEqual(["connection.pong", "assistant.chat.delta"]);
});
