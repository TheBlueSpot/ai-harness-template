import type { ChatMessage, ExecutionToolActivity } from "../../../shared/protocol";

export type TimelineLiveMessage = {
  id: string;
  content: string;
  locked: boolean;
  kind: "status" | "assistant";
  updatedAt?: string;
};

export type TimelineToolBlock = {
  id: string;
  runId: string;
  intervalId: string;
  activities: ExecutionToolActivity[];
  startedAt: string;
  updatedAt: string;
  live: boolean;
};

export type ChatTimelineRow =
  | { kind: "persisted"; message: ChatMessage }
  | { kind: "live"; message: TimelineLiveMessage; liveIndex: number }
  | { kind: "tool-block"; block: TimelineToolBlock };

type BuildChatTimelineRowsInput = {
  messages: ChatMessage[];
  liveMessages?: TimelineLiveMessage[];
  toolActivities?: ExecutionToolActivity[];
  activeRunId?: string;
};

export function buildChatTimelineRows(input: BuildChatTimelineRowsInput): ChatTimelineRow[] {
  const baseRows: ChatTimelineRow[] = [
    ...input.messages.map((message) => ({ kind: "persisted" as const, message })),
    ...(input.liveMessages ?? []).map((message, liveIndex) => ({ kind: "live" as const, message, liveIndex }))
  ];
  const activities = (input.toolActivities ?? []).filter((activity) => activity.runId === input.activeRunId || input.activeRunId === undefined);
  if (activities.length === 0) {
    return baseRows;
  }

  const anchors = baseRows.map((row, index) => ({
    index,
    time: row.kind === "persisted" ? row.message.createdAt : row.kind === "live" ? row.message.updatedAt : undefined
  }));
  const groups = new Map<number, ExecutionToolActivity[]>();
  for (const activity of activities) {
    const activityTime = activity.startedAt || activity.updatedAt;
    const rowIndex = findAnchorIndex(anchors, activityTime);
    groups.set(rowIndex, [...(groups.get(rowIndex) ?? []), activity]);
  }

  const rows: ChatTimelineRow[] = [];
  for (let index = 0; index < baseRows.length; index += 1) {
    rows.push(baseRows[index]!);
    const grouped = groups.get(index);
    if (grouped?.length) {
      rows.push(createToolBlock(grouped, index, input.activeRunId));
    }
  }
  const beforeFirst = groups.get(-1);
  if (beforeFirst?.length) {
    rows.unshift(createToolBlock(beforeFirst, -1, input.activeRunId));
  }
  const afterLast = groups.get(baseRows.length);
  if (afterLast?.length) {
    rows.push(createToolBlock(afterLast, baseRows.length, input.activeRunId));
  }
  return rows;
}

function findAnchorIndex(anchors: Array<{ index: number; time?: string }>, activityTime: string) {
  if (anchors.length === 0) {
    return 0;
  }
  const activityMs = parseTime(activityTime);
  let selected = -1;
  for (const anchor of anchors) {
    const anchorMs = parseTime(anchor.time);
    if (anchorMs <= activityMs) {
      selected = anchor.index;
      continue;
    }
    break;
  }
  return selected;
}

function createToolBlock(activities: ExecutionToolActivity[], intervalIndex: number, activeRunId: string | undefined): ChatTimelineRow {
  const sorted = [...activities].sort((left, right) => parseTime(left.startedAt) - parseTime(right.startedAt));
  const first = sorted[0]!;
  const last = sorted.at(-1)!;
  return {
    kind: "tool-block",
    block: {
      id: `${first.runId}:tools:${intervalIndex}:${first.id}:${last.id}`,
      runId: first.runId,
      intervalId: String(intervalIndex),
      activities: sorted,
      startedAt: first.startedAt,
      updatedAt: sorted.reduce((latest, activity) => (activity.updatedAt > latest ? activity.updatedAt : latest), first.updatedAt),
      live: Boolean(activeRunId && first.runId === activeRunId)
    }
  };
}

function parseTime(input: string | undefined) {
  if (!input) {
    return 0;
  }
  const parsed = Date.parse(input);
  return Number.isFinite(parsed) ? parsed : 0;
}
