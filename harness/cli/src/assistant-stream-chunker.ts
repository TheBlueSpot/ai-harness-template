export type AssistantStreamChunk = {
  index: number;
  content: string;
  startedAt: string;
  updatedAt: string;
  closed: boolean;
};

type AssistantStreamChunkerOptions = {
  targetIntervalMs?: number;
  maxWaitMs?: number;
};

const DEFAULT_TARGET_INTERVAL_MS = 5_000;
const DEFAULT_MAX_WAIT_MS = 10_000;

export class AssistantStreamChunker {
  private readonly targetIntervalMs: number;
  private readonly maxWaitMs: number;
  private chunks: AssistantStreamChunk[] = [];
  private open = "";
  private openStartedAt = 0;
  private openStartedIso = "";
  private openUpdatedIso = "";

  constructor(options: AssistantStreamChunkerOptions = {}) {
    this.targetIntervalMs = options.targetIntervalMs ?? DEFAULT_TARGET_INTERVAL_MS;
    this.maxWaitMs = options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
  }

  append(delta: string, nowMs = Date.now()) {
    if (!delta) {
      return;
    }

    const nowIso = new Date(nowMs).toISOString();
    if (!this.open) {
      this.openStartedAt = nowMs;
      this.openStartedIso = nowIso;
    }

    this.open += delta;
    this.openUpdatedIso = nowIso;
    this.closeReadyChunks(nowMs, false);
  }

  seed(content: string, nowMs = Date.now()) {
    if (this.hasContent() || !content.trim()) {
      return;
    }
    this.append(content, nowMs);
  }

  flush(nowMs = Date.now()) {
    this.closeReadyChunks(nowMs, true);
  }

  getChunks() {
    const result = [...this.chunks];
    if (this.open.trim()) {
      result.push({
        index: result.length,
        content: this.open,
        startedAt: this.openStartedIso || new Date().toISOString(),
        updatedAt: this.openUpdatedIso || new Date().toISOString(),
        closed: false
      });
    }
    return result;
  }

  hasContent() {
    return this.chunks.length > 0 || Boolean(this.open.trim());
  }

  private closeReadyChunks(nowMs: number, force: boolean) {
    while (this.open.trim()) {
      const elapsed = nowMs - this.openStartedAt;
      const boundary = force ? this.open.length : findSplitBoundary(this.open, elapsed >= this.maxWaitMs);
      if (boundary === undefined) {
        return;
      }
      if (!force && elapsed < this.targetIntervalMs) {
        return;
      }

      const content = this.open.slice(0, boundary).trimEnd();
      if (!content.trim()) {
        this.open = this.open.slice(boundary);
        continue;
      }

      this.chunks.push({
        index: this.chunks.length,
        content,
        startedAt: this.openStartedIso || new Date(nowMs).toISOString(),
        updatedAt: this.openUpdatedIso || new Date(nowMs).toISOString(),
        closed: true
      });

      this.open = this.open.slice(boundary).trimStart();
      this.openStartedAt = nowMs;
      this.openStartedIso = new Date(nowMs).toISOString();
      this.openUpdatedIso = this.openStartedIso;

      if (!force) {
        return;
      }
    }
  }
}

function findSplitBoundary(input: string, allowWhitespaceFallback: boolean) {
  const candidates = [
    findClosedCodeFenceBoundary(input),
    findParagraphBoundary(input),
    findListItemBoundary(input),
    findSentenceBoundary(input)
  ].filter((candidate): candidate is number => candidate !== undefined && candidate > 0);
  if (candidates.length > 0) {
    return Math.min(...candidates);
  }
  if (!allowWhitespaceFallback) {
    return undefined;
  }
  const whitespace = findLastWhitespaceBoundary(input);
  return whitespace > 0 ? whitespace : input.length;
}

function findParagraphBoundary(input: string) {
  const index = input.indexOf("\n\n");
  return index >= 0 ? index + 2 : undefined;
}

function findClosedCodeFenceBoundary(input: string) {
  const matches = [...input.matchAll(/```/g)];
  return matches.length >= 2 && matches.length % 2 === 0 ? (matches.at(-1)?.index ?? 0) + 3 : undefined;
}

function findListItemBoundary(input: string) {
  const match = /\n(?:[-*+]|\d+\.)\s+.+(?:\n|$)(?![\s\S]*\n(?:[-*+]|\d+\.)\s+.+(?:\n|$))/.exec(input);
  return match?.index === undefined ? undefined : match.index + match[0].length;
}

function findSentenceBoundary(input: string) {
  const match = /[.!?](?=\s|$)/.exec(input);
  return match?.index === undefined ? undefined : match.index + 1;
}

function findLastWhitespaceBoundary(input: string) {
  for (let index = input.length - 1; index > 0; index -= 1) {
    if (/\s/.test(input[index] ?? "")) {
      return index + 1;
    }
  }
  return -1;
}
