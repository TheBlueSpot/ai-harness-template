import {
  createAssistantLogEntryId,
  type Assistant,
  type AssistantAssetRef,
  type BackgroundJob,
  type BackgroundJobsState,
  type AssistantsState,
  type ComposerReasoningStrength,
  type ProviderBrand
} from "../../shared/protocol";
import { WorkspaceRepository } from "./workspace-repository";

export type AssistantFactoryLaunchDefaults = {
  providerBrand: ProviderBrand;
  planningModelId?: string;
  executionModelId?: string;
  reasoningStrength?: ComposerReasoningStrength;
  fastMode?: boolean;
  modeId?: string;
};

export type AssistantFactoryEvents = {
  assistantsUpdated?: (state: AssistantsState) => void;
  assistantCreatedCard?: (assistant: Assistant) => void;
  backgroundJobsUpdated?: (state: BackgroundJobsState) => void;
};

export function createOrUpdateAssistantWithJobs(input: {
  repository: WorkspaceRepository;
  assistant: Assistant;
  assetRefs?: AssistantAssetRef[];
  jobs?: BackgroundJob[];
  launchDefaults: AssistantFactoryLaunchDefaults;
  emit?: AssistantFactoryEvents;
}) {
  const existing = input.repository.getAssistant(input.assistant.id, true);
  const assistant = input.repository.saveAssistant(
    {
      ...input.assistant,
      providerBrand: input.assistant.providerBrand ?? input.launchDefaults.providerBrand,
      reasoningStrength: input.assistant.reasoningStrength ?? input.launchDefaults.reasoningStrength,
      fastMode: input.assistant.fastMode ?? input.launchDefaults.fastMode ?? false,
      modeId: input.assistant.modeId ?? input.launchDefaults.modeId,
      executionModelId: input.assistant.executionModelId ?? input.launchDefaults.executionModelId
    },
    input.assetRefs ?? []
  );

  const savedJobs: BackgroundJob[] = [];
  for (const job of input.jobs ?? []) {
    const jobWithProfile = attachAssistantLaunchProfile(job, assistant, input.launchDefaults);
    input.repository.saveBackgroundJob(jobWithProfile);
    const savedJob = input.repository.getBackgroundJob(job.id);
    if (savedJob) {
      savedJobs.push(savedJob);
    }
  }

  input.repository.appendAssistantLogEntry({
    id: createAssistantLogEntryId(),
    assistantId: assistant.id,
    level: "info",
    summary: existing ? "Assistant updated" : "Assistant created",
    detail: savedJobs.length > 0 ? `Persisted ${savedJobs.length} assistant-owned job(s).` : "Assistant state persisted.",
    detailsJson: {
      jobIds: savedJobs.map((job) => job.id),
      launchProfile: summarizeLaunchProfile(assistant, input.launchDefaults)
    },
    createdAt: new Date().toISOString()
  });

  const assistantsState = input.repository.loadAssistantsState();
  const backgroundJobsState = input.repository.loadBackgroundJobsState();
  input.emit?.assistantsUpdated?.(assistantsState);
  input.emit?.assistantCreatedCard?.(assistant);
  input.emit?.backgroundJobsUpdated?.(backgroundJobsState);

  return {
    assistant,
    jobs: savedJobs,
    created: !existing,
    assistantsState,
    backgroundJobsState
  };
}

export function attachAssistantLaunchProfile(
  job: BackgroundJob,
  assistant: Assistant,
  defaults: AssistantFactoryLaunchDefaults
): BackgroundJob {
  if (job.definition.kind !== "ai-routine" || job.assistantId !== assistant.id) {
    return job;
  }

  return {
    ...job,
    definition: {
      ...job.definition,
      modeId: job.definition.modeId ?? assistant.modeId ?? defaults.modeId,
      executionModelId: job.definition.executionModelId ?? assistant.executionModelId ?? defaults.executionModelId,
      reasoningStrength: job.definition.reasoningStrength ?? assistant.reasoningStrength ?? defaults.reasoningStrength,
      fastMode: job.definition.fastMode ?? assistant.fastMode ?? defaults.fastMode,
      launchProfile: {
        agentId: job.definition.launchProfile?.agentId ?? assistant.agentId,
        providerBrand: job.definition.launchProfile?.providerBrand ?? assistant.providerBrand ?? defaults.providerBrand,
        planningModelId: job.definition.launchProfile?.planningModelId ?? defaults.planningModelId,
        executionModelId:
          job.definition.launchProfile?.executionModelId ??
          job.definition.executionModelId ??
          assistant.executionModelId ??
          defaults.executionModelId,
        reasoningStrength:
          job.definition.launchProfile?.reasoningStrength ??
          job.definition.reasoningStrength ??
          assistant.reasoningStrength ??
          defaults.reasoningStrength,
        fastMode: job.definition.launchProfile?.fastMode ?? job.definition.fastMode ?? assistant.fastMode ?? defaults.fastMode,
        modeId: job.definition.launchProfile?.modeId ?? job.definition.modeId ?? assistant.modeId ?? defaults.modeId
      }
    }
  };
}

function summarizeLaunchProfile(assistant: Assistant, defaults: AssistantFactoryLaunchDefaults) {
  return {
    agentId: assistant.agentId,
    providerBrand: assistant.providerBrand ?? defaults.providerBrand,
    planningModelId: defaults.planningModelId,
    executionModelId: assistant.executionModelId ?? defaults.executionModelId,
    reasoningStrength: assistant.reasoningStrength ?? defaults.reasoningStrength,
    fastMode: assistant.fastMode ?? defaults.fastMode,
    modeId: assistant.modeId ?? defaults.modeId
  };
}
