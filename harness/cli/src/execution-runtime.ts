import type { PiAgentExecutionController } from "./pi-agent-adapter";
import type { ComposerReasoningStrength } from "../../shared/protocol";

export type ManagedExecutionKind = "planner" | "main" | "subagent" | "aggregator";

export type ManagedExecutionPhase =
  | "queued"
  | "provisioning"
  | "api-starting"
  | "active"
  | "finishing"
  | "waiting-input"
  | "done"
  | "failed";

export type ManagedRefreshAction = "restart" | "continue";

export type ExecutionRequestSnapshot = {
  cwd: string;
  modelId: string;
  prompt: string;
  readOnly?: boolean;
  reasoningStrength?: ComposerReasoningStrength;
  fastMode?: boolean;
};

export type SubagentSpawnTimingSnapshot = {
  dequeuedAt?: number;
  worktreePrepareStartedAt?: number;
  worktreeReadyAt?: number;
  sessionCreatedAt?: number;
  firstActivityAt?: number;
  firstToolStartAt?: number;
  completedAt?: number;
  failedAt?: number;
};

export type ManagedExecutionState = {
  runId: string;
  subagentId?: string;
  kind: ManagedExecutionKind;
  phase: ManagedExecutionPhase;
  hasReceivedActivity: boolean;
  lastProgressAt: number;
  refreshRequested: boolean;
  refreshDeferred: boolean;
  pendingRefreshAction?: ManagedRefreshAction;
  originalRequest: ExecutionRequestSnapshot;
  continuationRequest: ExecutionRequestSnapshot;
  controller?: PiAgentExecutionController;
  spawnTiming?: SubagentSpawnTimingSnapshot;
};

export function getExecutionKey(input: Pick<ManagedExecutionState, "runId" | "subagentId" | "kind">) {
  return [input.runId, input.kind, input.subagentId ?? "run"].join(":");
}
