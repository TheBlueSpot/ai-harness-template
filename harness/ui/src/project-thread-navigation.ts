import { createRequestId, type ClientCommand } from "../../shared/protocol";
import type { HarnessViewState } from "./harness-store";

export function activateProjectThread(
  state: HarnessViewState,
  projectId: string,
  threadId: string,
  sendCommand: (command: ClientCommand) => void
) {
  if (state.workspace.activeProjectId !== projectId) {
    sendCommand({
      type: "project.activate",
      requestId: createRequestId(),
      payload: {
        projectId
      }
    });
  }

  const project = state.workspace.projects.find((entry) => entry.id === projectId);
  if (state.workspace.activeProjectId !== projectId || project?.activeThreadId !== threadId) {
    sendCommand({
      type: "thread.activate",
      requestId: createRequestId(),
      payload: {
        projectId,
        threadId
      }
    });
  }
}
