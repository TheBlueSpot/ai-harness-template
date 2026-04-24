import {
  type AgentPlan,
  type AgentRunState,
  type AgentTrace,
  type CliSession,
  type MemorySummary,
  type ModeDefinition,
  type ProjectContextUsage,
  type ProjectId,
  type StreamingTailSegment,
  type WorkspaceProjectState,
  type WorkspaceRuleSource,
  type WorkspaceState
} from "../../shared/protocol";
import { getExecutionKey, type ManagedExecutionState } from "./execution-runtime";

export type RuntimeProjectState = WorkspaceProjectState & {
  latestPlan?: AgentPlan;
  contextUsage?: ProjectContextUsage;
  traces: AgentTrace[];
  streamingAssistantText: string;
  streamingTailSegments: StreamingTailSegment[];
  draft: string;
  lastError?: string;
};

type RuntimeThreadState = {
  sessionId: string;
  isStreaming: boolean;
  lastError?: string;
  latestPlan?: AgentPlan;
  contextUsage?: ProjectContextUsage;
  traces: AgentTrace[];
  streamingAssistantText: string;
  streamingTailSegments: StreamingTailSegment[];
};

type RuntimeProjectRecord = {
  project: RuntimeProjectState;
  threadStates: Map<string, RuntimeThreadState>;
  abortControllers: Map<string, AbortController>;
  executions: Map<string, ManagedExecutionState>;
};

export class WorkspaceRuntimeStore {
  private readonly projects = new Map<ProjectId, RuntimeProjectRecord>();
  private activeProjectId?: ProjectId;
  private workspaceModes: ModeDefinition[];
  private workspaceRuleSource?: WorkspaceRuleSource;
  private workspaceMemorySummary?: MemorySummary;

  constructor(workspace: WorkspaceState) {
    for (const project of workspace.projects) {
      const runtimeProject = createRuntimeProject(project);
      this.projects.set(project.id, {
        project: runtimeProject,
        threadStates: new Map([[project.activeThreadId, createThreadRuntimeState(runtimeProject)]]),
        abortControllers: new Map(),
        executions: new Map()
      });
    }

    this.activeProjectId = workspace.activeProjectId;
    this.workspaceModes = [...(workspace.workspaceModes ?? [])];
    this.workspaceRuleSource = workspace.workspaceRuleSource;
    this.workspaceMemorySummary = workspace.workspaceMemorySummary;
  }

  getWorkspace(): WorkspaceState {
    return {
      projects: Array.from(this.projects.values()).map((record) => stripRuntimeProject(record.project)),
      workspaceModes: [...this.workspaceModes],
      workspaceRuleSource: this.workspaceRuleSource,
      workspaceMemorySummary: this.workspaceMemorySummary,
      activeProjectId: this.activeProjectId
    };
  }

  getProject(projectId: ProjectId) {
    const project = this.projects.get(projectId)?.project;
    if (!project) {
      throw new Error(`Unknown project: ${projectId}`);
    }

    return project;
  }

  getThreadRuntime(projectId: ProjectId, threadId: string) {
    const record = this.getProjectRecord(projectId);
    if (record.project.activeThreadId === threadId) {
      return createThreadRuntimeState(record.project);
    }

    return record.threadStates.get(threadId);
  }

  upsertPersistedProject(project: WorkspaceProjectState) {
    const existing = this.projects.get(project.id);
    if (!existing) {
      const runtimeProject = createRuntimeProject(project);
      this.projects.set(project.id, {
        project: runtimeProject,
        threadStates: new Map([[project.activeThreadId, createThreadRuntimeState(runtimeProject)]]),
        abortControllers: new Map(),
        executions: new Map()
      });
      return;
    }

    persistActiveThreadState(existing);
    const nextThreadStates = filterKnownThreadStates(existing.threadStates, project.threads.map((thread) => thread.id));
    const nextProject = hydrateProjectState(existing.project, nextThreadStates, project);
    nextThreadStates.set(nextProject.activeThreadId, createThreadRuntimeState(nextProject));

    this.projects.set(project.id, {
      project: nextProject,
      threadStates: nextThreadStates,
      abortControllers: existing.abortControllers,
      executions: existing.executions
    });
  }

  removeProject(projectId: ProjectId, activeProjectId?: ProjectId) {
    this.projects.delete(projectId);
    this.activeProjectId = activeProjectId;
  }

  setActiveProject(projectId: ProjectId) {
    this.getProject(projectId);
    this.activeProjectId = projectId;
  }

  replaceWorkspaceState(workspace: WorkspaceState) {
    this.workspaceModes = [...(workspace.workspaceModes ?? [])];
    this.workspaceRuleSource = workspace.workspaceRuleSource;
    this.workspaceMemorySummary = workspace.workspaceMemorySummary;
    this.activeProjectId = workspace.activeProjectId;
  }

  setProjectStreaming(projectId: ProjectId, isStreaming: boolean, threadId?: string) {
    this.updateThreadState(projectId, threadId, (state) => ({
      ...state,
      isStreaming
    }));
  }

  setProjectError(projectId: ProjectId, lastError?: string, threadId?: string) {
    this.updateThreadState(projectId, threadId, (state) => ({
      ...state,
      lastError
    }));
  }

  setProjectExecutionModel(projectId: ProjectId, executionModelId?: string) {
    this.updateProject(projectId, (project) => ({
      ...project,
      session: {
        ...project.session,
        executionModelId
      }
    }));
  }

  setProjectSelectedAgentId(projectId: ProjectId, selectedAgentId?: RuntimeProjectState["session"]["selectedAgentId"]) {
    this.updateProject(projectId, (project) => ({
      ...project,
      session: {
        ...project.session,
        selectedAgentId
      }
    }));
  }

  setProjectPlan(projectId: ProjectId, latestPlan?: AgentPlan, threadId?: string) {
    this.updateThreadState(projectId, threadId, (state) => ({
      ...state,
      latestPlan
    }));
  }

  setProjectRun(projectId: ProjectId, activeRun?: AgentRunState) {
    this.updateProject(projectId, (project) => ({
      ...project,
      activeRun
    }));
  }

  setProjectCliSession(projectId: ProjectId, activeCliSession?: CliSession) {
    this.updateProject(projectId, (project) => ({
      ...project,
      activeCliSession
    }));
  }

  setProjectContextUsage(projectId: ProjectId, contextUsage?: ProjectContextUsage, threadId?: string) {
    this.updateThreadState(projectId, threadId, (state) => ({
      ...state,
      contextUsage
    }));
  }

  appendTrace(projectId: ProjectId, trace: AgentTrace, threadId?: string) {
    this.updateThreadState(projectId, threadId, (state) => ({
      ...state,
      traces: [...state.traces, trace]
    }));
  }

  appendStreamingDelta(projectId: ProjectId, delta: string, threadId?: string) {
    this.updateThreadState(projectId, threadId, (state) => ({
      ...state,
      streamingAssistantText: `${state.streamingAssistantText}${delta}`
    }));
  }

  setStreamingTail(projectId: ProjectId, segments: StreamingTailSegment[], threadId?: string) {
    this.updateThreadState(projectId, threadId, (state) => ({
      ...state,
      streamingTailSegments: segments
    }));
  }

  clearStreaming(projectId: ProjectId, threadId?: string) {
    this.updateThreadState(projectId, threadId, (state) => ({
      ...state,
      streamingAssistantText: "",
      streamingTailSegments: []
    }));
  }

  clearProjectTransients(projectId: ProjectId, threadId?: string) {
    const record = this.getProjectRecord(projectId);
    const resolvedThreadId = threadId ?? record.project.activeThreadId;

    this.updateThreadState(projectId, resolvedThreadId, (state) => ({
      ...state,
      latestPlan: undefined,
      contextUsage: undefined,
      traces: [],
      streamingAssistantText: "",
      streamingTailSegments: [],
      lastError: undefined,
      isStreaming: false
    }));

    record.executions = new Map(
      [...record.executions.entries()].filter(([, state]) => state.threadId !== resolvedThreadId)
    );

    if (record.project.activeThreadId === resolvedThreadId) {
      record.project = {
        ...record.project,
        activeCliSession: undefined,
        activeRun: undefined,
        latestPlan: undefined,
        contextUsage: undefined,
        traces: [],
        streamingAssistantText: "",
        streamingTailSegments: [],
        lastError: undefined,
        session: {
          ...record.project.session,
          isStreaming: false,
          lastError: undefined
        }
      };
    }
  }

  setAbortController(projectId: ProjectId, runId: string, abortController?: AbortController) {
    const record = this.getProjectRecord(projectId);
    if (abortController) {
      record.abortControllers.set(runId, abortController);
      return;
    }

    record.abortControllers.delete(runId);
  }

  getAbortController(projectId: ProjectId, runId: string) {
    return this.projects.get(projectId)?.abortControllers.get(runId);
  }

  hasAnyStreamingThread(projectId: ProjectId) {
    const record = this.getProjectRecord(projectId);
    return [...record.threadStates.values()].some((state) => state.isStreaming);
  }

  getExecutionState(projectId: ProjectId, input: Pick<ManagedExecutionState, "runId" | "subagentId" | "kind">) {
    return this.getProjectRecord(projectId).executions.get(getExecutionKey(input));
  }

  getRunExecutionStates(projectId: ProjectId, runId: string) {
    return [...this.getProjectRecord(projectId).executions.values()].filter((entry) => entry.runId === runId);
  }

  setExecutionState(projectId: ProjectId, state: ManagedExecutionState) {
    this.getProjectRecord(projectId).executions.set(getExecutionKey(state), state);
  }

  updateExecutionState(
    projectId: ProjectId,
    input: Pick<ManagedExecutionState, "runId" | "subagentId" | "kind">,
    updater: (state: ManagedExecutionState) => ManagedExecutionState
  ) {
    const record = this.getProjectRecord(projectId);
    const key = getExecutionKey(input);
    const current = record.executions.get(key);
    if (!current) {
      throw new Error(`Unknown execution state: ${key}`);
    }

    record.executions.set(key, updater(current));
  }

  clearExecutionState(projectId: ProjectId, input: Pick<ManagedExecutionState, "runId" | "subagentId" | "kind">) {
    this.getProjectRecord(projectId).executions.delete(getExecutionKey(input));
  }

  private updateProject(projectId: ProjectId, updater: (project: RuntimeProjectState) => RuntimeProjectState) {
    const record = this.getProjectRecord(projectId);
    record.project = updater(record.project);
    record.threadStates.set(record.project.activeThreadId, createThreadRuntimeState(record.project));
  }

  private updateThreadState(
    projectId: ProjectId,
    threadId: string | undefined,
    updater: (state: RuntimeThreadState) => RuntimeThreadState
  ) {
    const record = this.getProjectRecord(projectId);
    const resolvedThreadId = threadId ?? record.project.activeThreadId;
    const current = getOrCreateThreadState(record, resolvedThreadId);
    const next = updater(current);
    record.threadStates.set(resolvedThreadId, next);
    if (record.project.activeThreadId === resolvedThreadId) {
      record.project = applyThreadState(record.project, next);
    }
  }

  private getProjectRecord(projectId: ProjectId) {
    const record = this.projects.get(projectId);
    if (!record) {
      throw new Error(`Unknown project: ${projectId}`);
    }

    return record;
  }
}

function createRuntimeProject(project: WorkspaceProjectState): RuntimeProjectState {
  return {
    ...project,
    latestPlan: undefined,
    contextUsage: undefined,
    traces: [],
    streamingAssistantText: "",
    streamingTailSegments: [],
    draft: "",
    lastError: undefined
  };
}

function stripRuntimeProject(project: RuntimeProjectState): WorkspaceProjectState {
  return {
    id: project.id,
    name: project.name,
    rootPath: project.rootPath,
    activeThreadId: project.activeThreadId,
    selectedModeId: project.selectedModeId,
    projectModes: project.projectModes,
    projectRuleSource: project.projectRuleSource,
    threadMemorySummary: project.threadMemorySummary,
    threads: project.threads,
    session: project.session,
    activeCliSession: project.activeCliSession,
    activeRun: project.activeRun,
    lastRun: project.lastRun,
    runSummaries: project.runSummaries
  };
}

function hydrateProjectState(
  existing: RuntimeProjectState,
  threadStates: Map<string, RuntimeThreadState>,
  incoming: WorkspaceProjectState
): RuntimeProjectState {
  const fallbackProject = {
    ...existing,
    ...incoming,
    latestPlan: undefined,
    contextUsage: undefined,
    traces: [],
    streamingAssistantText: "",
    streamingTailSegments: [],
    draft: existing.draft,
    lastError: undefined,
    session: {
      ...incoming.session,
      selectedAgentId: existing.session.selectedAgentId ?? incoming.session.selectedAgentId,
      executionModelId: existing.session.executionModelId ?? incoming.session.executionModelId,
      isStreaming: incoming.session.isStreaming,
      lastError: incoming.session.lastError
    }
  } satisfies RuntimeProjectState;
  const threadState = threadStates.get(incoming.activeThreadId) ?? createThreadRuntimeState(fallbackProject);
  return applyThreadState(fallbackProject, threadState);
}

function createThreadRuntimeState(project: Pick<
  RuntimeProjectState,
  "session" | "latestPlan" | "contextUsage" | "traces" | "streamingAssistantText" | "streamingTailSegments" | "lastError"
>): RuntimeThreadState {
  return {
    sessionId: project.session.sessionId,
    isStreaming: project.session.isStreaming,
    lastError: project.lastError ?? project.session.lastError,
    latestPlan: project.latestPlan,
    contextUsage: project.contextUsage,
    traces: [...project.traces],
    streamingAssistantText: project.streamingAssistantText,
    streamingTailSegments: [...project.streamingTailSegments]
  };
}

function getOrCreateThreadState(record: RuntimeProjectRecord, threadId: string) {
  return (
    record.threadStates.get(threadId) ?? {
      sessionId: threadId,
      isStreaming: false,
      lastError: undefined,
      latestPlan: undefined,
      contextUsage: undefined,
      traces: [],
      streamingAssistantText: "",
      streamingTailSegments: []
    }
  );
}

function applyThreadState(project: RuntimeProjectState, threadState: RuntimeThreadState): RuntimeProjectState {
  return {
    ...project,
    latestPlan: threadState.latestPlan,
    contextUsage: threadState.contextUsage,
    traces: [...threadState.traces],
    streamingAssistantText: threadState.streamingAssistantText,
    streamingTailSegments: [...threadState.streamingTailSegments],
    lastError: threadState.lastError,
    session: {
      ...project.session,
      sessionId: threadState.sessionId,
      isStreaming: threadState.isStreaming,
      lastError: threadState.lastError
    }
  };
}

function persistActiveThreadState(record: RuntimeProjectRecord) {
  record.threadStates.set(record.project.activeThreadId, createThreadRuntimeState(record.project));
}

function filterKnownThreadStates(threadStates: Map<string, RuntimeThreadState>, knownThreadIds: string[]) {
  const knownIds = new Set(knownThreadIds);
  return new Map([...threadStates.entries()].filter(([threadId]) => knownIds.has(threadId)));
}
