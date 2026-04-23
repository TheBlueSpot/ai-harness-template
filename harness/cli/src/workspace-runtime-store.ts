import {
  type AgentPlan,
  type CliSession,
  type AgentRunState,
  type AgentTrace,
  type MemorySummary,
  type ModeDefinition,
  type ProjectContextUsage,
  type ProjectId,
  type StreamingTailSegment,
  type WorkspaceRuleSource,
  type WorkspaceProjectState,
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

type RuntimeProjectRecord = {
  project: RuntimeProjectState;
  abortController?: AbortController;
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
      this.projects.set(project.id, {
        project: createRuntimeProject(project),
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

  upsertPersistedProject(project: WorkspaceProjectState) {
    const existing = this.projects.get(project.id);
    const hydratedProject = existing ? hydrateProjectState(existing.project, project) : createRuntimeProject(project);

    this.projects.set(project.id, {
      project: hydratedProject,
      abortController: existing?.abortController,
      executions: existing?.executions ?? new Map()
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

  setProjectStreaming(projectId: ProjectId, isStreaming: boolean) {
    this.updateProject(projectId, (project) => ({
      ...project,
      session: {
        ...project.session,
        isStreaming
      }
    }));
  }

  setProjectError(projectId: ProjectId, lastError?: string) {
    this.updateProject(projectId, (project) => ({
      ...project,
      lastError,
      session: {
        ...project.session,
        lastError
      }
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

  setProjectPlan(projectId: ProjectId, latestPlan?: AgentPlan) {
    this.updateProject(projectId, (project) => ({
      ...project,
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

  setProjectContextUsage(projectId: ProjectId, contextUsage?: ProjectContextUsage) {
    this.updateProject(projectId, (project) => ({
      ...project,
      contextUsage
    }));
  }

  appendTrace(projectId: ProjectId, trace: AgentTrace) {
    this.updateProject(projectId, (project) => ({
      ...project,
      traces: [...project.traces, trace]
    }));
  }

  appendStreamingDelta(projectId: ProjectId, delta: string) {
    this.updateProject(projectId, (project) => ({
      ...project,
      streamingAssistantText: `${project.streamingAssistantText}${delta}`
    }));
  }

  setStreamingTail(projectId: ProjectId, segments: StreamingTailSegment[]) {
    this.updateProject(projectId, (project) => ({
      ...project,
      streamingTailSegments: segments
    }));
  }

  clearStreaming(projectId: ProjectId) {
    this.updateProject(projectId, (project) => ({
      ...project,
      streamingAssistantText: "",
      streamingTailSegments: []
    }));
  }

  clearProjectTransients(projectId: ProjectId) {
    this.updateProject(projectId, (project) => ({
      ...project,
      latestPlan: undefined,
      activeCliSession: undefined,
      activeRun: undefined,
      contextUsage: undefined,
      traces: [],
      streamingAssistantText: "",
      streamingTailSegments: [],
      lastError: undefined,
      session: {
        ...project.session,
        isStreaming: false,
        lastError: undefined
      }
    }));
    this.getProjectRecord(projectId).executions.clear();
  }

  setAbortController(projectId: ProjectId, abortController?: AbortController) {
    const record = this.projects.get(projectId);
    if (!record) {
      throw new Error(`Unknown project: ${projectId}`);
    }

    record.abortController = abortController;
  }

  getAbortController(projectId: ProjectId) {
    return this.projects.get(projectId)?.abortController;
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
    const record = this.projects.get(projectId);

    if (!record) {
      throw new Error(`Unknown project: ${projectId}`);
    }

    record.project = updater(record.project);
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

function hydrateProjectState(existing: RuntimeProjectState, incoming: WorkspaceProjectState): RuntimeProjectState {
  return {
    ...existing,
    ...incoming,
    latestPlan: existing.latestPlan,
    contextUsage: existing.contextUsage,
    traces: existing.traces,
    streamingAssistantText: existing.streamingAssistantText,
    streamingTailSegments: existing.streamingTailSegments,
    draft: existing.draft,
    lastError: existing.lastError,
    session: {
      ...incoming.session,
      selectedAgentId: existing.session.selectedAgentId ?? incoming.session.selectedAgentId,
      executionModelId: existing.session.executionModelId ?? incoming.session.executionModelId,
      isStreaming: existing.session.isStreaming,
      lastError: existing.session.lastError
    }
  };
}
