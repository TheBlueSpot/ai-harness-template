import type { ExecutionToolActivity } from "../../../shared/protocol";
import { formatShortTimestamp } from "./time-format";

const DEFAULT_SNIPPET_LENGTH = 220;

export type ToolActivityDetailSection = {
  title: string;
  value: string;
  mono?: boolean;
  tone?: "danger";
  copyTooltip?: string;
};

export function formatToolActivityOwner(activity: Pick<ExecutionToolActivity, "owner" | "subagentId">) {
  if (activity.owner === "subagent") {
    return activity.subagentId ? `Subagent ${activity.subagentId}` : "Subagent";
  }
  return activity.owner === "aggregator" ? "Aggregator" : "Main";
}

export function formatToolInvocationDescription(activity: ExecutionToolActivity) {
  if (activity.command || activity.category === "shell" || /shell|command|terminal|powershell|cmd/i.test(activity.toolName)) {
    return describeShellCommand(activity.command ?? activity.argsSummary);
  }

  if (activity.category === "browser") {
    return `Use browser automation: ${normalizeToolSnippet(activity.argsSummary ?? activity.toolName, 140)}`;
  }

  if (activity.category === "web") {
    return `Fetch or search web data with ${activity.toolName}.`;
  }

  if (activity.category === "mcp") {
    return `Call connected tool ${activity.toolName}.`;
  }

  return `Call ${activity.toolName}.`;
}

export function formatApprovalInvocationDescription(label: string, inputSummary: string | undefined) {
  const parsed = parseJsonRecord(inputSummary);
  const command = readString(parsed, ["command", "cmd", "script"]);
  if (command) {
    return describeShellCommand(command);
  }

  const url = readString(parsed, ["url", "href"]);
  if (url) {
    return `Open or inspect ${normalizeToolSnippet(url, 160)}.`;
  }

  const selector = readString(parsed, ["selector", "target", "locator", "element"]);
  if (selector) {
    return `${normalizeToolSnippet(label, 80)}: target ${normalizeToolSnippet(selector, 140)}.`;
  }

  return normalizeToolSnippet([label, inputSummary].filter(Boolean).join(": "), DEFAULT_SNIPPET_LENGTH);
}

export function formatToolActivitySnippet(activity: ExecutionToolActivity, maxLength = DEFAULT_SNIPPET_LENGTH) {
  return normalizeToolSnippet(activity.command ?? activity.argsSummary ?? activity.outputPreview ?? "tool call", maxLength);
}

export function normalizeToolSnippet(value: string | undefined, maxLength = DEFAULT_SNIPPET_LENGTH) {
  const normalized = (value ?? "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/^\s{0,3}#{1,6}\s+/, "").trim())
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  return truncateText(normalized, maxLength);
}

export function formatToolMetadata(activity: ExecutionToolActivity) {
  return [
    `Owner: ${formatToolActivityOwner(activity)}`,
    `Run: ${activity.runId}`,
    `Tool call: ${activity.toolCallId}`,
    `Category: ${activity.category}`,
    `Status: ${activity.status}`,
    activity.exitCode === undefined ? undefined : `Exit: ${activity.exitCode}`,
    `Started: ${formatShortTimestamp(activity.startedAt)}`,
    `Updated: ${formatShortTimestamp(activity.updatedAt)}`,
    activity.completedAt ? `Completed: ${formatShortTimestamp(activity.completedAt)}` : undefined,
    activity.rawArgsRedacted || activity.rawResultRedacted ? "Sensitive fields redacted before persistence." : undefined,
    activity.rawArgsDebugArtifactPath ? `Debug args artifact: ${activity.rawArgsDebugArtifactPath}` : undefined,
    activity.rawResultDebugArtifactPath ? `Debug result artifact: ${activity.rawResultDebugArtifactPath}` : undefined
  ].filter(Boolean).join("\n");
}

export function formatToolActivityTooltip(activity: ExecutionToolActivity) {
  return [
    `${formatToolActivityOwner(activity)} | ${activity.toolName} | ${activity.status}`,
    formatToolInvocationDescription(activity),
    activity.command ? `Command: ${normalizeToolSnippet(activity.command, 220)}` : undefined,
    activity.outputPreview ? `Result: ${normalizeToolSnippet(activity.outputPreview, 220)}` : undefined
  ].filter(Boolean).join("\n");
}

export function formatToolActivityCopyText(activity: ExecutionToolActivity) {
  return [
    formatToolMetadata(activity),
    `Description:\n${formatToolInvocationDescription(activity)}`,
    ...getToolActivityDetailSections(activity).map((section) => `${section.title}:\n${section.value}`)
  ].filter(Boolean).join("\n\n");
}

export function formatToolActivityDetailText(activity: ExecutionToolActivity) {
  return [
    formatToolMetadata(activity),
    `Description: ${formatToolInvocationDescription(activity)}`,
    ...getToolActivityDetailSections(activity).map((section) => `${section.title}:\n${section.value}`)
  ].filter(Boolean).join("\n\n");
}

export function getToolActivityDetailSections(activity: ExecutionToolActivity): ToolActivityDetailSection[] {
  const sections: ToolActivityDetailSection[] = [];

  if (activity.command) {
    sections.push({
      title: "Command",
      value: activity.command,
      mono: true,
      copyTooltip: "Copy command"
    });
  }

  if (activity.rawArgsJson ?? activity.argsSummary) {
    sections.push({
      title: formatRawArgsTitle(activity),
      value: activity.rawArgsJson ?? activity.argsSummary ?? "",
      mono: true,
      copyTooltip: "Copy arguments"
    });
  }

  if (activity.rawArgsOmittedReason) {
    sections.push({
      title: "Args omitted",
      value: formatRawOmission(activity.rawArgsOmittedReason)
    });
  }

  if (activity.rawResultJson ?? activity.outputPreview) {
    sections.push({
      title: formatRawResultTitle(activity),
      value: activity.rawResultJson ?? activity.outputPreview ?? "",
      mono: true,
      copyTooltip: "Copy result"
    });
  }

  if (activity.rawResultOmittedReason) {
    sections.push({
      title: "Result omitted",
      value: formatRawOmission(activity.rawResultOmittedReason)
    });
  }

  const stdout = readRawResultString(activity, "stdout") ?? activity.stdoutPreview;
  if (stdout) {
    sections.push({
      title: activity.rawResultJson ? "Stdout" : "Stdout preview",
      value: stdout,
      mono: true,
      copyTooltip: "Copy stdout"
    });
  }

  const stderr = readRawResultString(activity, "stderr") ?? activity.stderrPreview;
  if (stderr) {
    sections.push({
      title: activity.rawResultJson ? "Stderr" : "Stderr preview",
      value: stderr,
      mono: true,
      tone: "danger",
      copyTooltip: "Copy stderr"
    });
  }

  return sections;
}

function describeShellCommand(command: string | undefined) {
  const normalized = normalizeToolSnippet(command, 400);
  if (!normalized) {
    return "Run local shell command.";
  }

  const parts = splitPipeline(normalized);
  const descriptions = parts.map((part) => describePipelinePart(part, normalized)).filter(Boolean);
  const summary = descriptions.length > 0 ? descriptions.join(" -> ") : "Run local shell command";
  return `${summary}: ${normalizeToolSnippet(normalized, 140)}.`;
}

function describePipelinePart(part: string, fullCommand: string) {
  const command = firstToken(part).toLowerCase();

  if (command === "ps" || command === "get-process") {
    return /%cpu|cpu|--sort=-%cpu/i.test(part) ? "List processes by CPU" : "List processes";
  }
  if (command === "head") {
    const count = part.match(/(?:^|\s)-n\s+(\d+)/)?.[1];
    return count ? `keep first ${count} rows` : "keep first rows";
  }
  if (command === "awk") {
    const threshold = part.match(/\$(\d+)\s*>\s*([0-9.]+)/);
    if (threshold) {
      const column = threshold[1] === "4" && /%cpu|cpu/i.test(fullCommand) ? "CPU column" : `column ${threshold[1]}`;
      return /print/i.test(part)
        ? `filter rows where ${column} > ${threshold[2]} and format output`
        : `filter rows where ${column} > ${threshold[2]}`;
    }
    return "filter or format rows";
  }
  if (command === "rg" || command === "grep" || command === "select-string") {
    return "Search text";
  }
  if (command === "get-childitem" || command === "ls" || command === "dir") {
    return "List files";
  }
  if (command === "get-content" || command === "cat" || command === "type") {
    return "Read file contents";
  }
  if (command === "where-object") {
    return "Filter objects";
  }
  if (command === "select-object") {
    const count = part.match(/(?:^|\s)-first\s+(\d+)/i)?.[1];
    return count ? `keep first ${count} objects` : "select fields";
  }
  if (command === "foreach-object") {
    return "Transform each item";
  }
  if (command === "sort" || command === "sort-object") {
    return "Sort rows";
  }
  if (command === "git") {
    const action = firstToken(part.replace(/^git\s+/i, ""));
    if (action === "status") {
      return "Check Git status";
    }
    if (action === "diff") {
      return "Inspect Git diff";
    }
    return "Run Git command";
  }
  if (command === "bun" || command === "bun.cmd") {
    return /\btest\b/i.test(part) ? "Run Bun tests" : "Run Bun command";
  }
  if (command === "npm" || command === "pnpm" || command === "yarn") {
    return "Run project package command";
  }
  if (command === "python" || command === "python.exe" || command === "py") {
    return "Run Python script";
  }
  if (command === "start-process") {
    return "Start a process";
  }
  if (command === "remove-item" || command === "rm" || command === "del") {
    return "Remove files or folders";
  }
  if (command === "move-item" || command === "mv") {
    return "Move files or folders";
  }
  if (command === "copy-item" || command === "cp") {
    return "Copy files or folders";
  }

  return undefined;
}

function splitPipeline(command: string) {
  const parts: string[] = [];
  let current = "";
  let quote: "'" | "\"" | undefined;
  for (const character of command) {
    if ((character === "'" || character === "\"") && !quote) {
      quote = character;
      current += character;
      continue;
    }
    if (quote === character) {
      quote = undefined;
      current += character;
      continue;
    }
    if (character === "|" && !quote) {
      if (current.trim()) {
        parts.push(current.trim());
      }
      current = "";
      continue;
    }
    current += character;
  }
  if (current.trim()) {
    parts.push(current.trim());
  }
  return parts.slice(0, 4);
}

function firstToken(value: string) {
  return value.trim().split(/\s+/, 1)[0] ?? "";
}

function readRawResultString(activity: ExecutionToolActivity, key: "stdout" | "stderr") {
  const parsed = parseJsonRecord(activity.rawResultJson);
  const value = parsed?.[key];
  return typeof value === "string" ? value : undefined;
}

function parseJsonRecord(value: string | undefined) {
  if (!value) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

function readString(record: Record<string, unknown> | undefined, keys: string[]) {
  if (!record) {
    return undefined;
  }
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function formatRawArgsTitle(activity: ExecutionToolActivity) {
  return formatRawTitle("Sanitized args", activity.rawArgsTruncated, activity.rawArgsRedacted);
}

function formatRawResultTitle(activity: ExecutionToolActivity) {
  const status = activity.rawResultStatus ? ` (${activity.rawResultStatus})` : "";
  return `${formatRawTitle("Sanitized result", activity.rawResultTruncated, activity.rawResultRedacted)}${status}`;
}

function formatRawTitle(base: string, truncated: boolean | undefined, redacted: boolean | undefined) {
  const notes = [redacted ? "redacted" : undefined, truncated ? "truncated" : undefined].filter(Boolean);
  return notes.length ? `${base} (${notes.join(", ")})` : base;
}

function formatRawOmission(reason: ExecutionToolActivity["rawArgsOmittedReason"] | ExecutionToolActivity["rawResultOmittedReason"]) {
  if (reason === "run-budget-exceeded") {
    return "Sanitized raw payload omitted because this run reached the raw artifact budget.";
  }
  return "Sanitized raw payload could not be serialized.";
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}
