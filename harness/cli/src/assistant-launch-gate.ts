import type { WorkspaceRepository } from "./workspace-repository";

type AssistantLaunchGateOptions = {
  allowGlobalPauseDeferral?: boolean;
};

export function assertAssistantRunnableForLaunch(
  repository: WorkspaceRepository,
  assistantId: string,
  options: AssistantLaunchGateOptions = {}
) {
  const assistant = repository.getAssistant(assistantId, true);
  if (!assistant) {
    throw new Error(`Unknown assistant: ${assistantId}`);
  }
  if (assistant.deletedAt) {
    throw new Error(`Assistant ${assistant.name} is deleted`);
  }
  if (assistant.runState === "paused") {
    throw new Error(`Assistant ${assistant.name} is paused`);
  }
  if (assistant.circuitBreakerState === "tripped") {
    throw new Error(`Assistant ${assistant.name} circuit breaker is tripped`);
  }
  if (repository.getGlobalExecutionPaused() && !options.allowGlobalPauseDeferral) {
    throw new Error("Global execution is paused");
  }
  return assistant;
}
