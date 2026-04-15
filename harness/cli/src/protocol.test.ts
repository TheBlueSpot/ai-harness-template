import { describe, expect, test } from "bun:test";
import { parseClientCommand, parseServerEvent, plannerResultSchema } from "../../shared/protocol";

describe("client command validation", () => {
  test("rejects malformed chat.send payloads", () => {
    expect(() =>
      parseClientCommand({
        type: "chat.send",
        requestId: "req-1",
        payload: {
          projectId: "project-1",
          agentId: "pi",
          executionModelId: "bad model id",
          content: "hello"
        }
      })
    ).toThrow();
  });

  test("rejects malformed agent.list payloads", () => {
    expect(() =>
      parseClientCommand({
        type: "agent.list",
        payload: {}
      })
    ).toThrow();
  });

  test("rejects malformed project.add payloads", () => {
    expect(() =>
      parseClientCommand({
        type: "project.add",
        requestId: "req-2",
        payload: {
          rootPath: ""
        }
      })
    ).toThrow();
  });

  test("rejects malformed preferences.save payloads", () => {
    expect(() =>
      parseClientCommand({
        type: "preferences.save",
        requestId: "req-pref",
        payload: {
          openAiApiKey: "",
          providerBrand: "gpt",
          debugEnabled: true,
          tracePanelDefaultOpen: false
        }
      })
    ).toThrow();
  });

  test("accepts preferences.clearApiKey without payload", () => {
    expect(
      parseClientCommand({
        type: "preferences.clearApiKey",
        requestId: "req-clear"
      }).type
    ).toBe("preferences.clearApiKey");
  });

  test("accepts planning.answer payloads", () => {
    expect(
      parseClientCommand({
        type: "planning.answer",
        requestId: "req-answer",
        payload: {
          projectId: "project-1",
          threadId: "thread-1",
          runId: "run-1",
          questionId: "question-1",
          content: "Use the API route."
        }
      }).type
    ).toBe("planning.answer");
  });

  test("rejects empty planning.answer content", () => {
    expect(() =>
      parseClientCommand({
        type: "planning.answer",
        requestId: "req-answer-2",
        payload: {
          projectId: "project-1",
          threadId: "thread-1",
          runId: "run-1",
          questionId: "question-1",
          content: "   "
        }
      })
    ).toThrow();
  });

  test("accepts run.resume payloads", () => {
    expect(
      parseClientCommand({
        type: "run.resume",
        requestId: "req-resume",
        payload: {
          projectId: "project-1",
          threadId: "thread-1",
          runId: "run-1",
          guidanceText: "Retry only the patch task.",
          subagentIds: ["task-2"]
        }
      }).type
    ).toBe("run.resume");
  });

  test("accepts run.retry payloads", () => {
    expect(
      parseClientCommand({
        type: "run.retry",
        requestId: "req-retry",
        payload: {
          projectId: "project-1",
          threadId: "thread-1",
          runId: "run-1",
          subagentId: "task-1"
        }
      }).type
    ).toBe("run.retry");
  });
});

describe("planner result validation", () => {
  test("rejects out-of-range difficulty scores", () => {
    expect(() =>
      plannerResultSchema.parse({
        type: "ready",
        difficultyScore: 101,
        summary: "too hard",
        executionModelId: "openai/gpt-5.4",
        usesSubagents: true,
        subtasks: [],
        finalExecutionBrief: "do the work"
      })
    ).toThrow();
  });

  test("accepts connection.ready preferences payload", () => {
    expect(
      parseServerEvent({
        type: "connection.ready",
        payload: {
          agents: [{ id: "pi", label: "Pi" }],
          workspace: {
            activeProjectId: "project-1",
            projects: [
              {
                id: "project-1",
                name: "Example",
                rootPath: "C:\\repo",
                activeThreadId: "thread-1",
                threads: [
                  {
                    id: "thread-1",
                    title: "Thread 1",
                    titleSource: "generated",
                    badgeState: "idle",
                    messageCount: 0,
                    updatedAt: new Date().toISOString()
                  }
                ],
                session: {
                  sessionId: "session-1",
                  selectedAgentId: "pi",
                  executionModelId: "openai/gpt-5.4",
                  messages: [],
                  isStreaming: false
                },
                activeRun: undefined,
                lastRun: undefined
              }
            ]
          },
          preferences: {
            hasUsableApiKey: false,
            hasStoredApiKey: false,
            hasUsableOpenAiApiKey: false,
            hasStoredOpenAiApiKey: false,
            hasUsableGoogleApiKey: false,
            hasStoredGoogleApiKey: false,
            providerBrand: "gpt",
            debugEnabledDefault: false,
            tracePanelDefaultOpen: true
          }
        }
      }).type
    ).toBe("connection.ready");
  });

  test("accepts empty workspace payload", () => {
    expect(
      parseServerEvent({
        type: "connection.ready",
        payload: {
          agents: [{ id: "pi", label: "Pi" }],
          workspace: {
            projects: [],
            activeProjectId: undefined
          },
          preferences: {
            hasUsableApiKey: false,
            hasStoredApiKey: false,
            hasUsableOpenAiApiKey: false,
            hasStoredOpenAiApiKey: false,
            hasUsableGoogleApiKey: false,
            hasStoredGoogleApiKey: false,
            providerBrand: "gpt",
            debugEnabledDefault: false,
            tracePanelDefaultOpen: true
          }
        }
      }).type
    ).toBe("connection.ready");
  });

  test("accepts project.opened payload", () => {
    expect(
      parseServerEvent({
        type: "project.opened",
        requestId: "req-open",
        payload: {
          activeProjectId: "project-1",
          resolution: "existing-project-new-thread",
          project: {
            id: "project-1",
            name: "Example",
            rootPath: "C:\\repo",
            activeThreadId: "thread-2",
            threads: [
              {
                id: "thread-1",
                title: "Thread 1",
                titleSource: "generated",
                badgeState: "idle",
                messageCount: 0,
                updatedAt: new Date().toISOString()
              },
              {
                id: "thread-2",
                title: "Thread 2",
                titleSource: "generated",
                badgeState: "idle",
                messageCount: 0,
                updatedAt: new Date().toISOString()
              }
            ],
            session: {
              sessionId: "thread-2",
              selectedAgentId: "pi",
              executionModelId: "openai/gpt-5.4",
              messages: [],
              isStreaming: false
            },
            activeRun: undefined,
            lastRun: undefined
          }
        }
      }).type
    ).toBe("project.opened");
  });

  test("accepts planner question payloads", () => {
    expect(
      plannerResultSchema.parse({
        type: "question",
        summary: "Need routing target",
        question: {
          id: "question-1",
          prompt: "Which route should handle this?",
          placeholder: "api/users/[id]",
          choices: [
            {
              id: "choice-1",
              label: "API route",
              description: "Use provided API route.",
              answerText: "api/users/[id]",
              recommended: true
            },
            {
              id: "choice-2",
              label: "Web route",
              description: "Use a page route.",
              answerText: "users/[id]",
              recommended: false
            },
            {
              id: "choice-3",
              label: "Custom",
              description: "Type a custom route.",
              answerText: "custom route",
              recommended: false
            }
          ],
          required: true
        }
      }).type
    ).toBe("question");
  });

  test("accepts run.updated payload", () => {
    expect(
      parseServerEvent({
        type: "run.updated",
        requestId: "req-run",
        payload: {
          projectId: "project-1",
          threadId: "thread-1",
          run: {
            id: "run-1",
            threadId: "thread-1",
            status: "awaiting-user-input",
            latestUserPrompt: "complex task",
            planningModelId: "openai/gpt-5.4",
            questions: [
              {
                id: "question-1",
                prompt: "Which route?",
                choices: [
                  {
                    id: "choice-1",
                    label: "API route",
                    description: "Use provided API route.",
                    answerText: "api/users/[id]",
                    recommended: true
                  },
                  {
                    id: "choice-2",
                    label: "Web route",
                    description: "Use a page route.",
                    answerText: "users/[id]",
                    recommended: false
                  },
                  {
                    id: "choice-3",
                    label: "Custom",
                    description: "Type a custom route.",
                    answerText: "custom route",
                    recommended: false
                  }
                ],
                required: true,
                status: "pending",
                askedAt: new Date().toISOString()
              }
            ],
            subtasks: [],
            resumable: false,
            retryable: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        }
      }).type
    ).toBe("run.updated");
  });
});
