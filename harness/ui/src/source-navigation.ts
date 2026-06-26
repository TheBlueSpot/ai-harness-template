import type { AgentRunState, AssistantLogEntry, BackgroundJobRun, NotificationInboxItem } from "../../shared/protocol";
import { openBackgroundJobInJobsPane, openBackgroundRunInJobsPane } from "./background-run-navigation";
import {
  harnessStore,
  type AssistantDetailTab,
  type ChatPaneTab,
  type HarnessLeftTab,
  type HarnessViewState,
  type PreferencesActiveSectionId
} from "./harness-store";
import { activateProjectThread } from "./project-thread-navigation";

export function openProjectThreadSource(
  state: HarnessViewState,
  projectId: string,
  threadId: string,
  chatPaneTab: ChatPaneTab = "chat"
) {
  harnessStore.setActiveSurface("chat");
  harnessStore.setChatPaneTab(chatPaneTab);
  activateProjectThread(state, projectId, threadId, harnessStore.actions.sendCommand);
}

export function openProjectRunSource(state: HarnessViewState, projectId: string, run: Pick<AgentRunState, "id"> | Pick<AgentRunState, "threadId">) {
  const threadId = "threadId" in run ? run.threadId : findProjectRunThreadId(state, projectId, run.id);
  if (!threadId) {
    return false;
  }
  openProjectThreadSource(state, projectId, threadId, "run");
  return true;
}

export function openAgentRunSource(
  state: HarnessViewState,
  projectId: string,
  run: Pick<AgentRunState, "id" | "threadId">,
  chatPaneTab: ChatPaneTab = "run"
) {
  const backgroundRun = findBackgroundRunForAgentRun(state, projectId, run);
  if (backgroundRun) {
    openBackgroundRunInJobsPane(state, backgroundRun.id, backgroundRun.jobId);
    return true;
  }

  if (isAutomationThread(state, projectId, run.threadId)) {
    harnessStore.setActiveSurface("background-jobs");
    return false;
  }

  openProjectThreadSource(state, projectId, run.threadId, chatPaneTab);
  return true;
}

export function openAssistantSource(state: HarnessViewState, assistantId: string, tab: AssistantDetailTab = "chat") {
  const assistant = state.assistants.assistants.find((entry) => entry.id === assistantId);
  if (assistant) {
    harnessStore.setAssistantScopeFilter(
      assistant.scope === "global" ? "global" : assistant.projectId === state.workspace.activeProjectId ? "project" : "all"
    );
  }
  harnessStore.setActiveSurface("assistants");
  harnessStore.setSelectedAssistantId(assistantId);
  harnessStore.setAssistantDetailTab(tab);
}

export function openPreferencesSectionSource(sectionId: PreferencesActiveSectionId) {
  harnessStore.setActiveSurface("preferences");
  harnessStore.setPreferencesActiveSectionId(sectionId);
}

export function createCurrentToastSourceNavigation(state: HarnessViewState) {
  const snapshot = {
    activeSurface: state.activeSurface,
    activeLeftTab: state.activeLeftTab,
    chatPaneTab: state.chatPaneTab,
    activeProjectId: state.workspace.activeProjectId,
    activeThreadId: getActiveThreadId(state),
    assistantScopeFilter: state.assistants.scopeFilter,
    selectedAssistantId: state.assistants.selectedAssistantId,
    selectedAssistantTab: state.assistants.selectedTab,
    jobsRunFilter: state.jobsRunFilter,
    jobsPanePreferences: {
      segment: state.jobsPanePreferences.segment,
      selectedJobId: state.jobsPanePreferences.selectedJobId,
      selectedRunId: state.jobsPanePreferences.selectedRunId,
      selectedNotificationId: state.jobsPanePreferences.selectedNotificationId
    },
    preferencesSectionId: state.preferencesActiveSectionId
  };

  return () => {
    switch (snapshot.activeSurface) {
      case "chat":
        harnessStore.setActiveSurface("chat");
        harnessStore.setChatPaneTab(snapshot.chatPaneTab);
        if (snapshot.activeProjectId && snapshot.activeThreadId) {
          activateProjectThread(state, snapshot.activeProjectId, snapshot.activeThreadId, harnessStore.actions.sendCommand);
        }
        return;
      case "background-jobs":
        harnessStore.setActiveSurface("background-jobs");
        if (isJobsLeftTab(snapshot.activeLeftTab)) {
          harnessStore.setActiveLeftTab(snapshot.activeLeftTab);
        }
        harnessStore.setJobsRunFilter(snapshot.jobsRunFilter);
        harnessStore.setJobsPanePreferences(snapshot.jobsPanePreferences);
        return;
      case "assistants":
        harnessStore.setActiveSurface("assistants");
        harnessStore.setActiveLeftTab("assistants");
        harnessStore.setAssistantScopeFilter(snapshot.assistantScopeFilter);
        if (snapshot.selectedAssistantId) {
          harnessStore.setSelectedAssistantId(snapshot.selectedAssistantId);
        }
        harnessStore.setAssistantDetailTab(snapshot.selectedAssistantTab);
        return;
      case "preferences":
        openPreferencesSectionSource(snapshot.preferencesSectionId);
        return;
      case "ide":
        harnessStore.setActiveSurface("ide");
        return;
    }
  };
}

export function openNotificationSource(state: HarnessViewState, notification: NotificationInboxItem) {
  switch (notification.kind) {
    case "background-run-status":
      openBackgroundRunInJobsPane(state, notification.backgroundRunId, notification.jobId);
      return true;
    case "planning-question":
    case "planning-question-batch":
      return openAgentRunSource(state, notification.projectId, { id: notification.runId, threadId: notification.threadId }, "chat");
    case "browser-approval":
      return openAgentRunSource(state, notification.projectId, { id: notification.runId, threadId: notification.threadId }, "events");
    case "assistant-question":
    case "assistant-question-batch":
      openAssistantSource(state, notification.assistantId, "questions");
      return true;
    case "cli-update":
      openPreferencesSectionSource("developer-advanced");
      return true;
  }
}

export function openAssistantLogEntrySource(state: HarnessViewState, entry: AssistantLogEntry) {
  const details = getRecord(entry.detailsJson);
  const backgroundRunId = readString(details, "backgroundRunId") ?? readString(details, "runId");
  const backgroundRun = backgroundRunId ? state.backgroundJobs.runs.find((run) => run.id === backgroundRunId) : undefined;
  if (backgroundRun) {
    openBackgroundRunInJobsPane(state, backgroundRun.id, backgroundRun.jobId);
    harnessStore.setAssistantLogDetailsId(undefined);
    return true;
  }

  const jobId = readString(details, "jobId");
  if (jobId && state.backgroundJobs.jobs.some((job) => job.id === jobId)) {
    openBackgroundJobInJobsPane(state, jobId);
    harnessStore.setAssistantLogDetailsId(undefined);
    return true;
  }

  const linkedAgentRunId = readString(details, "linkedAgentRunId") ?? readString(details, "agentRunId");
  const projectRun = linkedAgentRunId ? findProjectRunSource(state, linkedAgentRunId) : undefined;
  if (projectRun) {
    openProjectThreadSource(state, projectRun.projectId, projectRun.threadId, "run");
    harnessStore.setAssistantLogDetailsId(undefined);
    return true;
  }

  openAssistantSource(state, entry.assistantId, "log");
  harnessStore.setAssistantLogDetailsId(undefined);
  return false;
}

function findProjectRunThreadId(state: HarnessViewState, projectId: string, runId: string) {
  return findProjectRunSource(state, runId, projectId)?.threadId;
}

function getActiveThreadId(state: HarnessViewState) {
  const activeProjectId = state.workspace.activeProjectId;
  if (!activeProjectId) {
    return undefined;
  }
  return state.workspace.projects.find((project) => project.id === activeProjectId)?.activeThreadId;
}

function isJobsLeftTab(tab: HarnessLeftTab): tab is "jobs" | "runs" {
  return tab === "jobs" || tab === "runs";
}

function findProjectRunSource(state: HarnessViewState, runId: string, projectId?: string) {
  const projects = projectId ? state.workspace.projects.filter((project) => project.id === projectId) : state.workspace.projects;
  for (const project of projects) {
    for (const run of [project.activeRun, project.lastRun]) {
      if (run?.id === runId) {
        return { projectId: project.id, threadId: run.threadId };
      }
    }
    for (const transcript of Object.values(project.threadLiveTranscriptById)) {
      for (const run of [transcript.activeRun, transcript.lastRun]) {
        if (run?.id === runId) {
          return { projectId: project.id, threadId: run.threadId };
        }
      }
    }
  }
  return undefined;
}

function findBackgroundRunForAgentRun(state: HarnessViewState, projectId: string, run: Pick<AgentRunState, "id" | "threadId">) {
  const linkedRun = state.backgroundJobs.runs.find((entry) => entry.projectId === projectId && entry.linkedAgentRunId === run.id);
  if (linkedRun) {
    return linkedRun;
  }

  return state.backgroundJobs.runs
    .filter((entry) => entry.projectId === projectId && entry.automationThreadId === run.threadId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
}

function isAutomationThread(state: HarnessViewState, projectId: string, threadId: string) {
  return state.workspace.projects
    .find((project) => project.id === projectId)
    ?.threads.some((thread) => thread.id === threadId && thread.kind === "automation");
}

function getRecord(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function readString(record: Record<string, unknown> | undefined, key: string) {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}
