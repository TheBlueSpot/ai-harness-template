import type { AgentRunState } from "../../shared/protocol";

const PLANNING_HEARTBEAT_LINES = [
  "Planner still working. Scoping execution plan.",
  "Planner still working. Checking route and task breakdown.",
  "Planner still working. Finalizing execution plan."
];

export function shouldDelayDerivedProgressHeartbeat(status: AgentRunState["status"]) {
  return status !== "planning";
}

export function formatRunProgressHeartbeat(
  run: Pick<AgentRunState, "status" | "subtasks">,
  staleBeatCount: number
) {
  if (run.status === "planning") {
    const index = Math.max(0, (staleBeatCount - 1) % PLANNING_HEARTBEAT_LINES.length);
    return PLANNING_HEARTBEAT_LINES[index];
  }

  if (run.status === "running-subagents") {
    const completed = run.subtasks.filter((task) => task.status === "completed").length;
    const failed = run.subtasks.filter((task) => task.status === "failed").length;
    const running = run.subtasks.filter((task) => task.status === "running").map((task) => task.title).slice(0, 2);
    return `Subagents still running: ${completed}/${run.subtasks.length} complete, ${failed} failed${running.length ? `; active ${running.join(", ")}` : ""}.`;
  }

  if (run.status === "aggregating") {
    return `Combining ${run.subtasks.length} subagent results into the final response.`;
  }

  if (run.status === "running-main") {
    return "Main execution still running.";
  }

  return undefined;
}
