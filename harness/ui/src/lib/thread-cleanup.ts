import type { ProjectThreadSummary, WorkspaceProjectState } from "../../../shared/protocol";

const maxDurationMs = 520 * 7 * 24 * 60 * 60 * 1000;
const unitMs = {
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000
} as const;

export function parseThreadCleanupDuration(input: string): { ok: true; ms: number } | { ok: false; reason: string } {
  const match = input.trim().match(/^(\d+)\s*([mhdw])$/i);
  if (!match) {
    return { ok: false, reason: "Use a duration like 30d, 2w, 12h, or 90m." };
  }
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase() as keyof typeof unitMs;
  const ms = amount * unitMs[unit];
  if (!Number.isSafeInteger(ms) || ms <= 0) {
    return { ok: false, reason: "Duration must be greater than zero." };
  }
  if (ms > maxDurationMs) {
    return { ok: false, reason: "Duration must be 520w or less." };
  }
  return { ok: true, ms };
}

export function getThreadCleanupActivityAt(thread: ProjectThreadSummary) {
  return thread.lastUserMessageAt ?? thread.updatedAt ?? thread.createdAt;
}

export function getThreadCleanupCandidates(
  projects: WorkspaceProjectState[],
  selectedProjectIds: string[] | undefined,
  olderThanMs: number,
  now: Date
) {
  if (selectedProjectIds && selectedProjectIds.length === 0) {
    return [];
  }
  const selected = selectedProjectIds ? new Set(selectedProjectIds) : undefined;
  const cutoff = now.getTime() - olderThanMs;
  return projects.flatMap((project) => {
    if (selected && !selected.has(project.id)) {
      return [];
    }
    const activeUserThreads = project.threads.filter((thread) => thread.kind === "user" && thread.status === "active");
    const capacity = Math.max(0, activeUserThreads.length - 1);
    return activeUserThreads
      .filter((thread) => thread.id !== project.activeThreadId)
      .filter((thread) => thread.badgeState !== "planning" && thread.badgeState !== "executing" && thread.badgeState !== "needs-input")
      .filter((thread) => {
        const activityAt = getThreadCleanupActivityAt(thread);
        return activityAt ? Date.parse(activityAt) < cutoff : false;
      })
      .sort((left, right) => Date.parse(getThreadCleanupActivityAt(left) ?? "") - Date.parse(getThreadCleanupActivityAt(right) ?? ""))
      .slice(0, capacity)
      .map((thread) => ({ projectId: project.id, threadId: thread.id }));
  });
}
