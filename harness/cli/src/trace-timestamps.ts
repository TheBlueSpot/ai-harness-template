import type { AgentTrace } from "../../shared/protocol";

export function withTraceTimestamp(trace: AgentTrace, createdAt: string = new Date().toISOString()): AgentTrace {
  if (trace.createdAt) {
    return trace;
  }
  return {
    ...trace,
    createdAt
  };
}
