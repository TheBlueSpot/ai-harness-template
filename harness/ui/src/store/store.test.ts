import { describe, expect, test } from "bun:test";
import {
  createEmptySession,
  createProjectId,
  createWorkspaceProjectState,
  type PreferencesState,
  type ServerEvent,
  type WorkspaceProjectState
} from "../../../shared/protocol";
import { createInitialViewState, reduceServerEvent } from "../harness-store";

const defaultPreferences: PreferencesState = {
  hasUsableApiKey: false,
  hasStoredApiKey: false,
  hasUsableOpenAiApiKey: false,
  hasStoredOpenAiApiKey: false,
  hasUsableGoogleApiKey: false,
  hasStoredGoogleApiKey: false,
  providerBrand: "gpt",
  debugEnabledDefault: false,
  tracePanelDefaultOpen: true
};

function createConnectedState(project?: WorkspaceProjectState) {
  return reduceServerEvent(createInitialViewState(), {
    type: "connection.ready",
    payload: {
      agents: [{ id: "pi", label: "Pi" }],
      workspace: {
        projects: project ? [project] : [],
        activeProjectId: project?.id
      },
      preferences: defaultPreferences
    }
  });
}

function createProject() {
  return createWorkspaceProjectState({
    id: createProjectId(),
    name: "repo-one",
    rootPath: "C:\\repo-one"
  });
}

describe("harness store reducer", () => {
  test("starts with empty workspace", () => {
    const initialState = createInitialViewState();

    expect(initialState.workspace.projects).toHaveLength(0);
    expect(initialState.workspace.activeProjectId).toBeUndefined();
  });

  test("records plans and traces on active project without polluting messages", () => {
    const initialProject = createProject();
    const initialState = createConnectedState(initialProject);
    const projectId = initialProject.id;
    const threadId = initialProject.activeThreadId;
    const sessionId = initialProject.session.sessionId;

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
    const initialProject = createProject();
    const initialState = createConnectedState(initialProject);
    const projectId = initialProject.id;
    const stateWithTrace = reduceServerEvent(initialState, {
      type: "agent.trace",
      requestId: "req-2",
      payload: {
        projectId,
        threadId: initialProject.activeThreadId,
        trace: {
          sessionId: initialProject.session.sessionId,
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
    const initialProject = createProject();
    const initialState = createConnectedState(initialProject);
    const projectId = initialProject.id;
    const threadId = initialProject.activeThreadId;
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
    const initialProject = createProject();
    const initialState = createConnectedState(initialProject);
    const projectId = initialProject.id;
    const threadId = initialProject.activeThreadId;
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
    const initialProject = createProject();
    const initialState = createConnectedState(initialProject);
    const projectId = initialProject.id;
    const threadId = initialProject.activeThreadId;
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
    const initialProject = createProject();
    const initialState = createConnectedState(initialProject);
    const projectId = initialProject.id;
    const threadId = initialProject.activeThreadId;
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
    const initialProject = createProject();
    const initialState = createConnectedState(initialProject);
    const projectId = initialProject.id;
    const nextState = reduceServerEvent(initialState, {
      type: "run.preflight",
      requestId: "req-preflight",
      payload: {
        projectId,
        threadId: initialProject.activeThreadId,
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
    const initialProject = createProject();
    const initialState = createConnectedState(initialProject);
    const projectId = initialProject.id;
    const nextState = reduceServerEvent(initialState, {
      type: "project.context",
      requestId: "req-context",
      payload: {
        projectId,
        threadId: initialProject.activeThreadId,
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

  test("opens project and activates it", () => {
    const initialState = createInitialViewState();
    const project = createProject();

    const nextState = reduceServerEvent(initialState, {
      type: "project.opened",
      requestId: "req-5",
      payload: {
        project,
        activeProjectId: project.id,
        resolution: "created-project"
      }
    });

    expect(nextState.workspace.activeProjectId).toBe(project.id);
    expect(nextState.workspace.projects.some((entry) => entry.id === project.id)).toBe(true);
  });

  test("removes last project and leaves empty workspace", () => {
    const initialProject = createProject();
    const initialState = createConnectedState(initialProject);

    const nextState = reduceServerEvent(initialState, {
      type: "project.removed",
      requestId: "req-remove",
      payload: {
        projectId: initialProject.id,
        activeProjectId: undefined
      }
    });

    expect(nextState.workspace.projects).toHaveLength(0);
    expect(nextState.workspace.activeProjectId).toBeUndefined();
  });

  test("applies server preference payload on connection ready", () => {
    const nextState = reduceServerEvent(createInitialViewState(), {
      type: "connection.ready",
      payload: {
        agents: [{ id: "pi", label: "Pi" }],
        workspace: {
          projects: [],
          activeProjectId: undefined
        },
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
    const nextState = reduceServerEvent(createInitialViewState(), {
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
