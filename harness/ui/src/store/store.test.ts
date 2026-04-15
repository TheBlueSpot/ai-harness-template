import { describe, expect, test } from "bun:test";
import {
  createEmptySession,
  createProjectId,
  createWorkspaceProjectState,
  type ServerEvent
} from "../../../shared/protocol";
import { createInitialViewState, reduceServerEvent } from "../harness-store";

describe("harness store reducer", () => {
  test("records plans and traces on active project without polluting messages", () => {
    const initialState = createInitialViewState();
    const projectId = initialState.workspace.activeProjectId;
    const threadId = initialState.workspace.projects[0].activeThreadId;
    const sessionId = initialState.workspace.projects[0].session.sessionId;

    const nextState = reduceServerEvent(initialState, {
      type: "agent.plan",
      requestId: "req-1",
      payload: {
        projectId,
        threadId,
        plan: {
          sessionId,
          agentId: "pi",
          planningModelId: "openai/gpt-5.4",
          difficultyScore: 72,
          usesSubagents: true,
          executionModelId: "openai/gpt-5.4",
          subtaskCount: 2
        }
      }
    });

    const tracedState = reduceServerEvent(nextState, {
      type: "agent.trace",
      requestId: "req-1",
      payload: {
        projectId,
        threadId,
        trace: {
          sessionId,
          stage: "subagent-start",
          message: "Starting scout",
          subagentId: "task-1",
          modelId: "openai/gpt-5.4-nano"
        }
      }
    });

    const project = tracedState.workspace.projects.find((entry) => entry.id === projectId);
    expect(project?.latestPlan?.difficultyScore).toBe(72);
    expect(project?.traces).toHaveLength(1);
    expect(project?.session.messages).toHaveLength(0);
  });

  test("clears traces and plan on session reset", () => {
    const initialState = createInitialViewState();
    const projectId = initialState.workspace.activeProjectId;
    const stateWithTrace = reduceServerEvent(initialState, {
      type: "agent.trace",
      requestId: "req-2",
      payload: {
        projectId,
        threadId: initialState.workspace.projects[0].activeThreadId,
        trace: {
          sessionId: initialState.workspace.projects[0].session.sessionId,
          stage: "planning",
          message: "Planning"
        }
      }
    });

    const resetState = reduceServerEvent(stateWithTrace, {
      type: "session.reset",
      requestId: "req-3",
      payload: {
        projectId,
        threadId: "thread-2",
        sessionId: "thread-2",
        state: createEmptySession("thread-2")
      }
    });

    const project = resetState.workspace.projects.find((entry) => entry.id === projectId);
    expect(project?.traces).toHaveLength(0);
    expect(project?.latestPlan).toBeUndefined();
    expect(project?.activeThreadId).toBe("thread-2");
  });

  test("stores streaming deltas until completion for matching project", () => {
    const initialState = createInitialViewState();
    const projectId = initialState.workspace.activeProjectId;
    const threadId = initialState.workspace.projects[0].activeThreadId;
    const deltaState = reduceServerEvent(initialState, {
      type: "chat.delta",
      requestId: "req-4",
      payload: {
        projectId,
        threadId,
        sessionId: threadId,
        delta: "hello"
      }
    });

    const completeEvent: ServerEvent = {
      type: "chat.complete",
      requestId: "req-4",
        payload: {
          projectId,
          threadId,
          sessionId: threadId,
        assistantMessage: {
          id: "assistant-1",
          role: "assistant",
          content: "hello world",
          createdAt: new Date().toISOString()
        },
        state: {
          ...createEmptySession(threadId),
          messages: [
            {
              id: "assistant-1",
              role: "assistant",
              content: "hello world",
              createdAt: new Date().toISOString()
            }
          ]
        }
      }
    };

    const completeState = reduceServerEvent(deltaState, completeEvent);
    const beforeProject = deltaState.workspace.projects.find((entry) => entry.id === projectId);
    const afterProject = completeState.workspace.projects.find((entry) => entry.id === projectId);

    expect(beforeProject?.streamingAssistantText).toBe("hello");
    expect(afterProject?.streamingAssistantText).toBe("");
  });

  test("appends chat messages without waiting for completion", () => {
    const initialState = createInitialViewState();
    const projectId = initialState.workspace.activeProjectId;
    const threadId = initialState.workspace.projects[0].activeThreadId;
    const nextState = reduceServerEvent(initialState, {
      type: "chat.message-appended",
      requestId: "req-append",
      payload: {
        projectId,
        threadId,
        sessionId: threadId,
        message: {
          id: "user-1",
          role: "user",
          content: "hello planner",
          createdAt: new Date().toISOString()
        },
        state: {
          ...createEmptySession(threadId),
          messages: [
            {
              id: "user-1",
              role: "user",
              content: "hello planner",
              createdAt: new Date().toISOString()
            }
          ]
        }
      }
    });

    const project = nextState.workspace.projects.find((entry) => entry.id === projectId);
    expect(project?.session.messages).toHaveLength(1);
    expect(project?.session.messages[0]?.content).toBe("hello planner");
  });

  test("hydrates active run and clears it", () => {
    const initialState = createInitialViewState();
    const projectId = initialState.workspace.activeProjectId;
    const threadId = initialState.workspace.projects[0].activeThreadId;
    const stateWithRun = reduceServerEvent(initialState, {
      type: "run.updated",
      requestId: "req-run",
      payload: {
        projectId,
        threadId,
        run: {
          id: "run-1",
          threadId,
          status: "partial-complete",
          latestUserPrompt: "complex task",
          executionModelId: "openai/gpt-5.4",
          difficultyScore: 72,
          summary: "Split work",
          finalExecutionBrief: "Combine outputs",
          questions: [],
          subtasks: [
            {
              id: "task-1",
              title: "Inspect",
              instruction: "Inspect files",
              status: "completed",
              attemptCount: 1,
              output: "done",
              updatedAt: new Date().toISOString()
            },
            {
              id: "task-2",
              title: "Patch",
              instruction: "Patch code",
              status: "failed",
              attemptCount: 2,
              errorMessage: "timeout",
              updatedAt: new Date().toISOString()
            }
          ],
          resumable: true,
          retryable: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      }
    });

    const clearedState = reduceServerEvent(stateWithRun, {
      type: "run.cleared",
      requestId: "req-run-clear",
      payload: {
        projectId,
        threadId,
        runId: "run-1"
      }
    });

    expect(stateWithRun.workspace.projects[0]?.activeRun?.status).toBe("partial-complete");
    expect(clearedState.workspace.projects[0]?.activeRun).toBeUndefined();
  });

  test("stores completed runs as lastRun but clears activeRun", () => {
    const initialState = createInitialViewState();
    const projectId = initialState.workspace.activeProjectId;
    const threadId = initialState.workspace.projects[0].activeThreadId;
    const nextState = reduceServerEvent(initialState, {
      type: "run.updated",
      requestId: "req-run-complete",
      payload: {
        projectId,
        threadId,
        run: {
          id: "run-complete",
          threadId,
          status: "completed",
          latestUserPrompt: "simple task",
          executionModelId: "openai/gpt-5.4",
          questions: [],
          subtasks: [],
          resumable: false,
          retryable: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          completedAt: new Date().toISOString()
        }
      }
    });

    expect(nextState.workspace.projects[0]?.activeRun).toBeUndefined();
    expect(nextState.workspace.projects[0]?.lastRun?.id).toBe("run-complete");
  });

  test("stores transient preflight warning by project", () => {
    const initialState = createInitialViewState();
    const projectId = initialState.workspace.activeProjectId;
    const nextState = reduceServerEvent(initialState, {
      type: "run.preflight",
      requestId: "req-preflight",
      payload: {
        projectId,
        threadId: initialState.workspace.projects[0].activeThreadId,
        preflight: {
          severity: "warning",
          kind: "git-dirty",
          message: "Git dirty. 5 files changed. Run anyway.",
          changedFileCount: 5
        }
      }
    });

    expect(nextState.projectPreflights[projectId]?.preflight.changedFileCount).toBe(5);
  });

  test("stores project context usage snapshots", () => {
    const initialState = createInitialViewState();
    const projectId = initialState.workspace.activeProjectId;
    const nextState = reduceServerEvent(initialState, {
      type: "project.context",
      requestId: "req-context",
      payload: {
        projectId,
        threadId: initialState.workspace.projects[0].activeThreadId,
        contextUsage: {
          sourceKind: "planner",
          sourceLabel: "planner",
          modelId: "openai/gpt-5.4",
          tokens: 1234,
          contextWindow: 200000,
          usagePercent: 0.7,
          updatedAt: new Date().toISOString()
        }
      }
    });

    expect(nextState.workspace.projects[0]?.contextUsage?.tokens).toBe(1234);
    expect(nextState.workspace.projects[0]?.contextUsage?.sourceKind).toBe("planner");
  });

  test("adds project and activates it", () => {
    const initialState = createInitialViewState();
    const projectId = createProjectId();
    const nextProject = createWorkspaceProjectState({
      id: projectId,
      name: "repo-two",
      rootPath: "C:\\repo-two"
    });

    const nextState = reduceServerEvent(initialState, {
      type: "project.added",
      requestId: "req-5",
      payload: {
        project: nextProject,
        activeProjectId: projectId
      }
    });

    expect(nextState.workspace.activeProjectId).toBe(projectId);
    expect(nextState.workspace.projects.some((project) => project.id === projectId)).toBe(true);
  });

  test("applies server preference payload on connection ready", () => {
    const initialState = createInitialViewState();
    const nextState = reduceServerEvent(initialState, {
      type: "connection.ready",
      payload: {
        agents: [{ id: "pi", label: "Pi" }],
        workspace: initialState.workspace,
        preferences: {
          hasUsableApiKey: true,
          hasStoredApiKey: true,
          hasUsableOpenAiApiKey: false,
          hasStoredOpenAiApiKey: false,
          hasUsableGoogleApiKey: true,
          hasStoredGoogleApiKey: true,
          providerBrand: "gemini",
          debugEnabledDefault: true,
          tracePanelDefaultOpen: false
        }
      }
    });

    expect(nextState.hasUsableApiKey).toBe(true);
    expect(nextState.hasStoredApiKey).toBe(true);
    expect(nextState.hasUsableGoogleApiKey).toBe(true);
    expect(nextState.providerBrand).toBe("gemini");
    expect(nextState.debugEnabled).toBe(true);
    expect(nextState.tracePanelOpen).toBe(false);
  });

  test("updates usable key state from preferences events", () => {
    const initialState = createInitialViewState();
    const nextState = reduceServerEvent(initialState, {
      type: "preferences.saved",
      requestId: "req-6",
      payload: {
        hasUsableApiKey: true,
        hasStoredApiKey: true,
        hasUsableOpenAiApiKey: true,
        hasStoredOpenAiApiKey: true,
        hasUsableGoogleApiKey: false,
        hasStoredGoogleApiKey: false,
        providerBrand: "gpt",
        debugEnabledDefault: false,
        tracePanelDefaultOpen: true
      }
    });

    expect(nextState.hasUsableApiKey).toBe(true);
    expect(nextState.hasStoredApiKey).toBe(true);
    expect(nextState.hasUsableOpenAiApiKey).toBe(true);
  });
});
