import { describe, expect, test } from "bun:test";
import { defaultProviderCapabilities } from "../../shared/capabilities";
import {
  chatMessageSchema,
  createProjectThreadSummary,
  parseClientCommand,
  parseServerEvent,
  planPrerequisiteSchema,
  planningQuestionSchema,
  plannerResultSchema
} from "../../shared/protocol";
import { testExports as plannerTestExports } from "./pi-planner";

const defaultExecutionControl = {
  isPaused: false,
  deferredPlanningQuestionCount: 0,
  deferredAssistantQuestionCount: 0,
  deferredBrowserApprovalCount: 0
} as const;

const defaultSetup = {
  launchMode: "source",
  updatedAt: new Date().toISOString(),
  readyRequiredCount: 0,
  totalRequiredCount: 0,
  checks: []
} as const;

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

  test("accepts project.search payloads", () => {
    expect(
      parseClientCommand({
        type: "project.search",
        requestId: "req-search",
        payload: {
          query: "repo"
        }
      }).type
    ).toBe("project.search");
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
          tracePanelDefaultOpen: false,
          attachmentsEnabled: true,
          capabilities: defaultProviderCapabilities
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

  test("accepts preferences.save payloads with dirty git controls", () => {
    expect(
      parseClientCommand({
        type: "preferences.save",
        requestId: "req-pref-valid",
        payload: {
          openAiApiKey: "sk-local-123",
          providerBrand: "gpt",
          debugEnabled: true,
          tracePanelDefaultOpen: false,
          attachmentsEnabled: true,
          capabilities: defaultProviderCapabilities,
          subagentWorktreeStrategyDefault: "same-worktree",
          blockChatOnDirtyGitDefault: true,
          dirtyGitChangeLimitDefault: 12,
          autoCompactContextThresholdPercentDefault: 40,
          planExecutionModeDefault: "countdown",
          planExecutionDelaySecondsDefault: 10,
          correctnessIterationModeDefault: "ask-before-iterate",
          backgroundJobApprovalPolicyDefault: "ask-risky"
        }
      }).type
    ).toBe("preferences.save");
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

  test("accepts assistant.create-from-thread payloads", () => {
    expect(
      parseClientCommand({
        type: "assistant.create-from-thread",
        requestId: "req-assistant-thread",
        payload: {
          projectId: "project-1",
          threadId: "thread-1",
          sourcePrompt: "Catalog builder start executing todos",
          name: "Catalog builder",
          scope: "project",
          modeId: "implement",
          executionModelId: "openai/gpt-5.4",
          agentId: "pi"
        }
      }).type
    ).toBe("assistant.create-from-thread");
  });

  test("accepts assistant circuit breaker retry payloads", () => {
    expect(
      parseClientCommand({
        type: "assistant.circuit-breaker.retry",
        requestId: "req-assistant-recover",
        payload: {
          assistantId: "assistant-1"
        }
      }).type
    ).toBe("assistant.circuit-breaker.retry");
  });

  test("rejects malformed assistant.create-from-thread payloads", () => {
    expect(() =>
      parseClientCommand({
        type: "assistant.create-from-thread",
        requestId: "req-assistant-thread",
        payload: {
          threadId: "thread-1",
          sourcePrompt: "Catalog builder start executing todos"
        }
      })
    ).toThrow();
  });

  test("accepts planning payloads with attachments", () => {
    const attachment = {
      id: "attachment-plan",
      kind: "text",
      name: "plan.md",
      mimeType: "text/markdown",
      sizeBytes: 120,
      url: "https://example.com/plan.md",
      key: "plan-key",
      uploadedAt: new Date().toISOString()
    } as const;

    expect(
      parseClientCommand({
        type: "planning.answer",
        requestId: "req-answer-attach",
        payload: {
          projectId: "project-1",
          threadId: "thread-1",
          runId: "run-1",
          questionId: "question-1",
          content: "Use the uploaded plan.",
          attachments: [attachment]
        }
      }).type
    ).toBe("planning.answer");

    expect(
      parseClientCommand({
        type: "planning.refine",
        requestId: "req-refine-attach",
        payload: {
          projectId: "project-1",
          threadId: "thread-1",
          runId: "run-1",
          content: "Refine with uploaded plan.",
          attachments: [attachment]
        }
      }).type
    ).toBe("planning.refine");
  });

  test("accepts composer control payloads on chat and run commands", () => {
    expect(
      parseClientCommand({
        type: "chat.send",
        requestId: "req-controls-chat",
        payload: {
          projectId: "project-1",
          threadId: "thread-1",
          agentId: "pi",
          content: "Ship it",
          modeLocked: true,
          reasoningStrength: "extra-high",
          fastMode: true
        }
      }).type
    ).toBe("chat.send");

    expect(
      parseClientCommand({
        type: "run.execute",
        requestId: "req-controls-run",
        payload: {
          projectId: "project-1",
          threadId: "thread-1",
          runId: "run-1",
          reasoningStrength: "medium",
          fastMode: false
        }
      }).type
    ).toBe("run.execute");
  });

  test("accepts chat.send payloads with attachments", () => {
    expect(
      parseClientCommand({
        type: "chat.send",
        requestId: "req-attach",
        payload: {
          projectId: "project-1",
          threadId: "thread-1",
          agentId: "pi",
          content: "Review attached files",
          attachments: [
            {
              id: "attachment-1",
              kind: "text",
              name: "spec.md",
              mimeType: "text/markdown",
              sizeBytes: 120,
              url: "https://example.com/spec.md",
              key: "spec-key",
              uploadedAt: new Date().toISOString()
            }
          ]
        }
      }).type
    ).toBe("chat.send");
  });

  test("accepts chat.send payloads with document attachments", () => {
    expect(
      parseClientCommand({
        type: "chat.send",
        requestId: "req-attach-doc",
        payload: {
          projectId: "project-1",
          threadId: "thread-1",
          agentId: "pi",
          content: "Review attached documents",
          attachments: [
            {
              id: "attachment-doc-1",
              kind: "document",
              documentType: "pdf",
              name: "spec.pdf",
              mimeType: "application/pdf",
              sizeBytes: 2048,
              url: "https://example.com/spec.pdf",
              key: "spec-pdf",
              uploadedAt: new Date().toISOString()
            }
          ]
        }
      }).type
    ).toBe("chat.send");
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

  test("accepts planning.refine payloads", () => {
    expect(
      parseClientCommand({
        type: "planning.refine",
        requestId: "req-refine",
        payload: {
          projectId: "project-1",
          threadId: "thread-1",
          runId: "run-1",
          content: "Scope this to the existing route only."
        }
      }).type
    ).toBe("planning.refine");
  });

  test("accepts cli-session.start payloads", () => {
    expect(
      parseClientCommand({
        type: "cli-session.start",
        requestId: "req-cli-start",
        payload: {
          projectId: "project-1",
          threadId: "thread-1",
          agentId: "codex-cli",
          cols: 120,
          rows: 32,
          prompt: "Inspect this repo"
        }
      }).type
    ).toBe("cli-session.start");
  });

  test("accepts run.execute payloads", () => {
    expect(
      parseClientCommand({
        type: "run.execute",
        requestId: "req-execute",
        payload: {
          projectId: "project-1",
          threadId: "thread-1",
          runId: "run-1"
        }
      }).type
    ).toBe("run.execute");
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

  test("accepts run.refresh payloads", () => {
    expect(
      parseClientCommand({
        type: "run.refresh",
        requestId: "req-refresh",
        payload: {
          projectId: "project-1",
          threadId: "thread-1",
          runId: "run-1",
          subagentId: "task-1"
        }
      }).type
    ).toBe("run.refresh");
  });

  test("accepts execution pause and resume commands", () => {
    expect(
      parseClientCommand({
        type: "execution.pause-all",
        requestId: "req-pause"
      }).type
    ).toBe("execution.pause-all");

    expect(
      parseClientCommand({
        type: "execution.resume-all",
        requestId: "req-resume-all"
      }).type
    ).toBe("execution.resume-all");
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
                    kind: "user",
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
                lastRun: undefined,
                runSummaries: []
              }
            ],
            workspaceModes: [],
            workspaceRuleSource: undefined,
            workspaceMemorySummary: undefined
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
            tracePanelDefaultOpen: true,
            attachmentsEnabled: true,
            capabilities: defaultProviderCapabilities,
            agentRuntimes: [],
            subagentWorktreeStrategyDefault: "same-worktree",
            blockChatOnDirtyGitDefault: true,
            dirtyGitChangeLimitDefault: 20,
            autoCompactContextThresholdPercentDefault: 40,
            planExecutionModeDefault: "countdown",
            planExecutionDelaySecondsDefault: 10,
            correctnessIterationModeDefault: "ask-before-iterate",
            backgroundJobApprovalPolicyDefault: "ask-risky",
            memoryBankEnabledDefault: true
          },
          setup: defaultSetup,
          backgroundJobs: {
            jobs: [],
            runs: [],
            templates: []
          },
          assistants: {
            assistants: [],
            threads: [],
            todos: [],
            learnings: [],
            questions: [],
            logs: [],
            assetRefs: []
          },
          notifications: {
            items: [],
            unreadCount: 0,
            interactiveUnreadCount: 0,
            passiveUnreadCount: 0
          },
          executionControl: defaultExecutionControl
        }
      }).type
    ).toBe("connection.ready");
  });

  test("rejects data URL attachments at command boundary", () => {
    expect(() =>
      parseClientCommand({
        type: "chat.send",
        requestId: "req-data-attach",
        payload: {
          projectId: "project-1",
          threadId: "thread-1",
          agentId: "pi",
          content: "Review attached files",
          attachments: [
            {
              id: "attachment-data",
              kind: "text",
              name: "spec.md",
              mimeType: "text/markdown",
              sizeBytes: 120,
              url: "data:text/markdown,hello",
              key: "spec-key",
              uploadedAt: new Date().toISOString()
            }
          ]
        }
      })
    ).toThrow();
  });

  test("accepts run milestone messages and update events", () => {
    const createdAt = new Date().toISOString();
    const message = chatMessageSchema.parse({
      id: "message-1",
      role: "assistant",
      kind: "run-milestones",
      content: "- Subagent 1 started",
      metadata: {
        type: "run-milestones",
        runId: "run-1",
        windowId: "window-1",
        status: "open",
        startedAt: createdAt,
        updatedAt: createdAt,
        lineCount: 1
      },
      createdAt
    });

    expect(message.kind).toBe("run-milestones");
    expect(
      parseServerEvent({
        type: "chat.message-updated",
        requestId: "req-update",
        payload: {
          projectId: "project-1",
          threadId: "thread-1",
          sessionId: "thread-1",
          message,
          state: {
            sessionId: "thread-1",
            selectedAgentId: "pi",
            executionModelId: "openai/gpt-5.4",
            messages: [message],
            isStreaming: false
          }
        }
      }).type
    ).toBe("chat.message-updated");
  });

  test("accepts streaming tail updates", () => {
    const updatedAt = new Date().toISOString();
    const event = parseServerEvent({
      type: "chat.streaming-tail-updated",
      requestId: "req-tail",
      payload: {
        projectId: "project-1",
        threadId: "thread-1",
        sessionId: "thread-1",
        runId: "run-1",
        segments: [
          {
            id: "run-1:subagents",
            kind: "status",
            phase: "subagents",
            content: "**Subagents**\n- Subagent Build UI: wired HUD.",
            updatedAt
          },
          {
            id: "run-1:assistant",
            kind: "assistant",
            content: "Final answer streaming...",
            updatedAt
          }
        ],
        state: {
          sessionId: "thread-1",
          selectedAgentId: "pi",
          executionModelId: "openai/gpt-5.4",
          messages: [],
          isStreaming: true
        }
      }
    });

    expect(event.type).toBe("chat.streaming-tail-updated");
  });

  test("accepts empty workspace payload", () => {
    expect(
      parseServerEvent({
        type: "connection.ready",
        payload: {
          agents: [{ id: "pi", label: "Pi" }],
          workspace: {
            projects: [],
            activeProjectId: undefined,
            workspaceModes: [],
            workspaceRuleSource: undefined,
            workspaceMemorySummary: undefined
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
            tracePanelDefaultOpen: true,
            attachmentsEnabled: true,
            capabilities: defaultProviderCapabilities,
            agentRuntimes: [],
            subagentWorktreeStrategyDefault: "same-worktree",
            blockChatOnDirtyGitDefault: true,
            dirtyGitChangeLimitDefault: 20,
            autoCompactContextThresholdPercentDefault: 40,
            planExecutionModeDefault: "countdown",
            planExecutionDelaySecondsDefault: 10,
            correctnessIterationModeDefault: "ask-before-iterate",
            backgroundJobApprovalPolicyDefault: "ask-risky",
            memoryBankEnabledDefault: true
          },
          setup: defaultSetup,
          backgroundJobs: {
            jobs: [],
            runs: [],
            templates: []
          },
          assistants: {
            assistants: [],
            threads: [],
            todos: [],
            learnings: [],
            questions: [],
            logs: [],
            assetRefs: []
          },
          notifications: {
            items: [],
            unreadCount: 0,
            interactiveUnreadCount: 0,
            passiveUnreadCount: 0
          },
          executionControl: defaultExecutionControl
        }
      }).type
    ).toBe("connection.ready");
  });

  test("accepts execution-control.updated payload", () => {
    expect(
      parseServerEvent({
        type: "execution-control.updated",
        requestId: "req-execution-control",
        payload: {
          executionControl: {
            isPaused: true,
            deferredPlanningQuestionCount: 1,
            deferredAssistantQuestionCount: 2,
            deferredBrowserApprovalCount: 3
          }
        }
      }).type
    ).toBe("execution-control.updated");
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
                kind: "user",
                title: "Thread 1",
                titleSource: "generated",
                badgeState: "idle",
                messageCount: 0,
                updatedAt: new Date().toISOString()
              },
              {
                id: "thread-2",
                kind: "user",
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
            lastRun: undefined,
            runSummaries: []
          }
        }
      }).type
    ).toBe("project.opened");
  });

  test("accepts project.search.results payload", () => {
    expect(
      parseServerEvent({
        type: "project.search.results",
        requestId: "req-search-results",
        payload: {
          query: "repo",
          results: [
            {
              id: "C:\\repo-one",
              name: "repo-one",
              rootPath: "C:\\repo-one",
              repoKind: "git-repo",
              matchKind: "name-prefix"
            }
          ]
        }
      }).type
    ).toBe("project.search.results");
  });

  test("accepts project create and git init contracts", () => {
    expect(
      parseClientCommand({
        type: "project.create",
        requestId: "req-create",
        payload: {
          rootPath: "C:\\repo-new"
        }
      }).type
    ).toBe("project.create");

    expect(
      parseClientCommand({
        type: "project.git.initBaseline",
        requestId: "req-init-git",
        payload: {
          projectId: "project-1"
        }
      }).type
    ).toBe("project.git.initBaseline");

    expect(
      parseServerEvent({
        type: "project.git.initialized",
        requestId: "req-init-git",
        payload: {
          projectId: "project-1",
          rootPath: "C:\\repo-new",
          initialized: true,
          baselineCommitCreated: true
        }
      }).type
    ).toBe("project.git.initialized");
  });

  test("accepts blocking non-git preflight payload", () => {
    expect(
      parseServerEvent({
        type: "run.preflight",
        requestId: "req-non-git",
        payload: {
          projectId: "project-1",
          threadId: "thread-1",
          preflight: {
            severity: "blocking",
            kind: "git-not-repo",
            message: "This project is not a git repository.",
            changedFileCount: 0,
            repairSummary: "Initialize git or disable dirty-git protection."
          }
        }
      }).type
    ).toBe("run.preflight");
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

  test("accepts planning question assistant intent metadata", () => {
    expect(
      planningQuestionSchema.parse({
        id: "question-1",
        prompt: "Do you want to create a project assistant named \"Catalog builder\", or run this once in project chat?",
        choices: [
          {
            id: "choice-1",
            label: "Create project assistant",
            description: "Create a project-scoped assistant.",
            answerText: "Create a project assistant named \"Catalog builder\" from this prompt.",
            recommended: true
          },
          {
            id: "choice-2",
            label: "Run once",
            description: "Run once in project chat.",
            answerText: "Run once.",
            recommended: false
          },
          {
            id: "choice-3",
            label: "Cancel",
            description: "Cancel this request.",
            answerText: "Cancel this request.",
            recommended: false
          }
        ],
        required: true,
        status: "pending",
        intent: {
          type: "assistant-create-intent",
          projectId: "project-1",
          threadId: "thread-1",
          sourcePrompt: "Catalog builder start executing todos",
          suggestedName: "Catalog builder",
          defaultScope: "project"
        },
        askedAt: new Date().toISOString()
      }).intent?.type
    ).toBe("assistant-create-intent");

    expect(() =>
      planningQuestionSchema.parse({
        id: "question-1",
        prompt: "Invalid?",
        choices: [],
        required: true,
        status: "pending",
        intent: {
          type: "unknown"
        },
        askedAt: new Date().toISOString()
      })
    ).toThrow();
  });

  test("keeps prerequisite owner schema strict", () => {
    expect(() =>
      planPrerequisiteSchema.parse({
        id: "setup-1",
        title: "Create setup",
        instruction: "Create setup",
        reason: "Subagents need setup",
        requiredForTaskIds: ["task-1"],
        owner: "user",
        status: "pending"
      })
    ).toThrow();

    expect(
      plannerResultSchema.parse({
        type: "ready",
        difficultyScore: 50,
        summary: "Do setup",
        executionModelId: "openai/gpt-5.4",
        usesSubagents: true,
        subtasks: [{ id: "task-1", title: "Task", instruction: "Do task" }],
        finalExecutionBrief: "Do setup before task",
        prerequisites: [
          {
            id: "setup-1",
            title: "Create setup",
            instruction: "Create setup",
            reason: "Subagents need setup",
            requiredForTaskIds: ["task-1"],
            owner: "main",
            status: "pending"
          }
        ]
      }).type
    ).toBe("ready");
  });

  test("normalizes planner prerequisite aliases without widening protocol schema", () => {
    const rawPayload = {
      type: "ready",
      difficultyScore: 50,
      summary: "Do setup",
      executionModelId: "openai/gpt-5.4",
      usesSubagents: true,
      subtasks: [{ id: "task-1", title: "Task", instruction: "Do task" }],
      finalExecutionBrief: "Do setup before task",
      prerequisites: [
        {
          id: "setup-1",
          title: "Create setup",
          instruction: "Create setup",
          reason: "Subagents need setup",
          requiredForTaskIds: ["task-1"],
          owner: "user"
        }
      ]
    };

    expect(() => plannerResultSchema.parse(rawPayload)).toThrow();
    const parsed = plannerTestExports.parsePlannerTurnPayload(rawPayload);
    expect(parsed.type).toBe("ready");
    if (parsed.type !== "ready") {
      throw new Error("Expected ready planner result");
    }
    expect(parsed.prerequisites?.[0]?.owner).toBe("main");
    expect(parsed.prerequisites?.[0]?.status).toBe("pending");
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

  test("accepts narrow thread and run patch events", () => {
    const now = new Date().toISOString();
    expect(
      parseServerEvent({
        type: "thread.message-appended",
        requestId: "req-message",
        payload: {
          projectId: "project-1",
          threadId: "thread-1",
          sessionId: "session-1",
          message: {
            id: "message-1",
            role: "assistant",
            kind: "plain",
            content: "Done",
            createdAt: now
          },
          thread: createProjectThreadSummary({
            id: "thread-1",
            title: "Done",
            titleSource: "generated",
            messageCount: 1,
            lastMessagePreview: "Done",
            createdAt: now,
            lastUserMessageAt: now,
            updatedAt: now
          }),
          state: {
            sessionId: "session-1",
            messages: [
              {
                id: "message-1",
                role: "assistant",
                kind: "plain",
                content: "Done",
                createdAt: now
              }
            ],
            isStreaming: false
          }
        }
      }).type
    ).toBe("thread.message-appended");

    expect(
      parseServerEvent({
        type: "run.status-patched",
        requestId: "req-run-patch",
        payload: {
          projectId: "project-1",
          threadId: "thread-1",
          runId: "run-1",
          status: "completed",
          resumable: false,
          retryable: true,
          updatedAt: now,
          completedAt: now
        }
      }).type
    ).toBe("run.status-patched");
  });
});
