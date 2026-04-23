import type { ExecutionToolActivity } from "../../shared/protocol";
import type { PiAgentExecutionEvent } from "./pi-agent-adapter";

type ToolOwner = ExecutionToolActivity["owner"];

export type ToolFailureKind =
  | "missing-path"
  | "missing-tool"
  | "bad-shell-quoting"
  | "search-no-match"
  | "command-failed";

type ToolActivityInput = {
  runId: string;
  owner: ToolOwner;
  subagentId?: string;
  event: Extract<PiAgentExecutionEvent, { type: "tool-start" | "tool-update" | "tool-end" }>;
  occurredAt?: string;
};

const MAX_TOOL_ACTIVITIES = 512;
const PREVIEW_LENGTH = 4000;

export function recordToolStart(activities: ExecutionToolActivity[], input: ToolActivityInput) {
  const event = input.event;
  if (event.type !== "tool-start") {
    return activities;
  }

  const occurredAt = input.occurredAt ?? new Date().toISOString();
  const existing = activities.find((activity) => activity.toolCallId === event.toolCallId);
  if (existing) {
    return activities;
  }

  return boundActivities([
    ...activities,
    {
      id: crypto.randomUUID(),
      runId: input.runId,
      owner: input.owner,
      subagentId: input.subagentId,
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      category: classifyToolCategory(event.toolName),
      command: extractCommand(event.args),
      argsSummary: summarizeToolArgs(event.args),
      status: "running",
      startedAt: occurredAt,
      updatedAt: occurredAt
    }
  ]);
}

export function recordToolUpdate(activities: ExecutionToolActivity[], input: ToolActivityInput) {
  const event = input.event;
  if (event.type !== "tool-update") {
    return activities;
  }

  return updateActivity(activities, input, (activity, occurredAt) => ({
    ...activity,
    command: activity.command ?? extractCommand(event.args),
    argsSummary: activity.argsSummary ?? summarizeToolArgs(event.args),
    outputPreview: summarizeToolResult(event.partialResult) ?? activity.outputPreview,
    stdoutPreview: summarizeNamedOutput(event.partialResult, "stdout") ?? activity.stdoutPreview,
    stderrPreview: summarizeNamedOutput(event.partialResult, "stderr") ?? activity.stderrPreview,
    exitCode: extractExitCode(event.partialResult) ?? activity.exitCode,
    status: inferTimedOut(event.partialResult) ? "timed-out" : activity.status,
    updatedAt: occurredAt
  }));
}

export function recordToolEnd(activities: ExecutionToolActivity[], input: ToolActivityInput) {
  const event = input.event;
  if (event.type !== "tool-end") {
    return activities;
  }

  return updateActivity(activities, input, (activity, occurredAt) => ({
    ...activity,
    command: activity.command ?? extractCommand(event.result),
    outputPreview: summarizeToolResult(event.result) ?? activity.outputPreview,
    stdoutPreview: summarizeNamedOutput(event.result, "stdout") ?? activity.stdoutPreview,
    stderrPreview: summarizeNamedOutput(event.result, "stderr") ?? activity.stderrPreview,
    exitCode: extractExitCode(event.result) ?? activity.exitCode,
    status: inferTimedOut(event.result) ? "timed-out" : event.isError ? "failed" : "completed",
    completedAt: occurredAt,
    updatedAt: occurredAt
  }));
}

export function summarizeToolArgs(value: unknown) {
  if (!value || typeof value !== "object") {
    return summarizeValue(value);
  }

  const record = value as Record<string, unknown>;
  return summarizeValue(record.command ?? value);
}

export function summarizeToolResult(value: unknown) {
  if (!value || typeof value !== "object") {
    return summarizeValue(value);
  }

  const record = value as Record<string, unknown>;
  return summarizeValue(
    record.output ??
      record.aggregated_output ??
      record.stdout ??
      record.stderr ??
      record.error ??
      record.message ??
      value
  );
}

export function classifyToolCategory(toolName: string): ExecutionToolActivity["category"] {
  if (toolName === "shell" || /shell|command|terminal|powershell|cmd/i.test(toolName)) {
    return "shell";
  }
  if (/browser|playwright|puppeteer|chromium|chrome|webdriver/i.test(toolName)) {
    return "browser";
  }
  if (/web_search|search|fetch|open_url/i.test(toolName)) {
    return "web";
  }
  if (toolName.includes(".")) {
    return "mcp";
  }
  return "other";
}

export function formatToolFailureMilestone(activity: ExecutionToolActivity, ownerLabel: string) {
  const failureKind = classifyToolFailure(activity);
  const exit = activity.exitCode === undefined ? "" : ` (exit ${activity.exitCode})`;
  const cause = firstUsefulSentence(activity.outputPreview ?? activity.stderrPreview ?? activity.stdoutPreview);
  if (failureKind === "missing-path") {
    return `${ownerLabel}: ${activity.toolName} failed: missing path${cause ? `: ${cause}` : ""}.`;
  }
  if (failureKind === "missing-tool") {
    return `${ownerLabel}: ${activity.toolName} failed: missing tool${cause ? `: ${cause}` : ""}.`;
  }
  if (failureKind === "bad-shell-quoting") {
    return `${ownerLabel}: ${activity.toolName} failed: bad shell quoting${cause ? `: ${cause}` : ""}.`;
  }
  if (failureKind === "search-no-match") {
    return `${ownerLabel}: ${activity.toolName} found no matches.`;
  }
  return `${ownerLabel}: ${activity.toolName} failed${exit}${cause ? `: ${cause}` : ""}.`;
}

export function classifyToolFailure(input: {
  toolName?: string;
  command?: string;
  outputPreview?: string;
  stdoutPreview?: string;
  stderrPreview?: string;
  exitCode?: number;
}) {
  const command = input.command ?? "";
  const output = [input.outputPreview, input.stderrPreview, input.stdoutPreview].filter(Boolean).join("\n");
  if (/\\?"'\$\\?"/.test(command) || /"'\$/.test(command) || command.includes("-g '\"!") || command.includes("'\"'!")) {
    return "bad-shell-quoting" as const;
  }
  if (/Cannot find path/i.test(output) || /rg:\s+.*IO error.*os error 2/i.test(output)) {
    return "missing-path" as const;
  }
  if (/not recognized as the name of a cmdlet/i.test(output)) {
    return "missing-tool" as const;
  }
  if ((input.toolName === "shell" || /rg(?:\.exe)?\b/i.test(command)) && input.exitCode === 1 && !output.trim()) {
    return "search-no-match" as const;
  }
  return "command-failed" as const;
}

export function isSubagentBlockedVerificationCommand(activity: ExecutionToolActivity) {
  if (activity.owner !== "subagent" || activity.category !== "shell") {
    return false;
  }

  const command = activity.command?.toLowerCase() ?? "";
  return /\bstart-process\b|\bpython(?:\.exe)?\s+-m\s+http\.server\b|\bplaywright\b|\bchromium\b|\bchrome\b|\bmsedge\b|\bvite\b.*\s--host\b/.test(
    command
  );
}

function updateActivity(
  activities: ExecutionToolActivity[],
  input: ToolActivityInput,
  updater: (activity: ExecutionToolActivity, occurredAt: string) => ExecutionToolActivity
) {
  const event = input.event;
  const occurredAt = input.occurredAt ?? new Date().toISOString();
  const nextActivities = activities.length
    ? activities.map((activity) => (activity.toolCallId === event.toolCallId ? updater(activity, occurredAt) : activity))
    : activities;
  if (nextActivities.some((activity) => activity.toolCallId === event.toolCallId)) {
    return boundActivities(nextActivities);
  }

  return boundActivities(
    recordToolStart(activities, {
      ...input,
      event: {
        type: "tool-start",
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        args: "args" in event ? event.args : undefined
      },
      occurredAt
    }).map((activity) => (activity.toolCallId === event.toolCallId ? updater(activity, occurredAt) : activity))
  );
}

function extractCommand(value: unknown) {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const command = (value as Record<string, unknown>).command;
  return typeof command === "string" ? limit(command) : undefined;
}

function extractExitCode(value: unknown) {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  return typeof record.exitCode === "number"
    ? record.exitCode
    : typeof record.exit_code === "number"
      ? record.exit_code
      : undefined;
}

function inferTimedOut(value: unknown) {
  if (!value || typeof value !== "object") {
    return typeof value === "string" && /timeout|timed out/i.test(value);
  }

  const record = value as Record<string, unknown>;
  return record.timedOut === true || record.status === "timed-out" || /timeout|timed out/i.test(summarizeValue(value) ?? "");
}

function summarizeNamedOutput(value: unknown, key: "stdout" | "stderr") {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const raw = (value as Record<string, unknown>)[key];
  return typeof raw === "string" ? limit(raw.replace(/\s+/g, " ").trim()) : undefined;
}

function summarizeValue(value: unknown) {
  if (typeof value === "string") {
    return limit(value.replace(/\s+/g, " ").trim()) || undefined;
  }
  if (value === undefined || value === null) {
    return undefined;
  }
  return limit(JSON.stringify(value).replace(/\s+/g, " ").trim()) || undefined;
}

function firstUsefulSentence(value: string | undefined) {
  if (!value) {
    return undefined;
  }
  const compact = value.replace(/\s+/g, " ").trim();
  const sentence = compact.split(/(?<=[.!?])\s+/, 1)[0] ?? compact;
  return sentence.replace(/[.]+$/, "").slice(0, 220);
}

function limit(value: string) {
  return value.slice(0, PREVIEW_LENGTH);
}

function boundActivities(activities: ExecutionToolActivity[]) {
  return activities.slice(-MAX_TOOL_ACTIVITIES);
}
