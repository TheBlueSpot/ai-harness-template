import path from "node:path";
import {
  createMemoryEntryId,
  createMemoryRetrievalId,
  type AgentRunState,
  type CorrectnessReview,
  type MemoryEntry,
  type MemoryRetrieval,
  type MemorySummary,
  type ProjectId,
  type ThreadId
} from "../../shared/protocol";
import type { WorkspaceRepository } from "./workspace-repository";

type RetrievalOwner = MemoryRetrieval["owner"];

export function retrieveMemorySummaries(
  repository: WorkspaceRepository,
  input: {
    projectId: ProjectId;
    threadId: ThreadId;
    runId: string;
    owner: RetrievalOwner;
    queryText: string;
    subagentId?: string;
    maxEntries?: number;
  }
) {
  const ranked = repository
    .listMemoryEntries(input.projectId, { status: "active", query: input.queryText })
    .sort((left, right) => scoreEntry(right, input.queryText) - scoreEntry(left, input.queryText))
    .slice(0, input.maxEntries ?? resolveBudget(input.owner));

  if (ranked.length === 0) {
    return {
      retrieval: undefined,
      memorySummaries: [] satisfies MemorySummary[]
    };
  }

  const createdAt = new Date().toISOString();
  const retrieval: MemoryRetrieval = {
    id: createMemoryRetrievalId(),
    runId: input.runId,
    owner: input.owner,
    subagentId: input.subagentId,
    queryText: input.queryText,
    entryIds: ranked.map((entry) => entry.id),
    createdAt
  };
  repository.logMemoryRetrieval(retrieval);
  for (const entry of ranked) {
    repository.saveMemoryEntry({
      ...entry,
      hitCount: entry.hitCount + 1,
      lastHitAt: createdAt,
      updatedAt: entry.updatedAt
    });
  }

  return {
    retrieval,
    memorySummaries: ranked.map(toMemorySummary)
  };
}

export function extractRunMemories(
  repository: WorkspaceRepository,
  input: {
    projectId: ProjectId;
    threadId: ThreadId;
    run: AgentRunState;
    finalAssistantMessage?: string;
    correctnessReview?: CorrectnessReview;
    cwd?: string;
  }
) {
  const entries = buildCandidateEntries(input);
  for (const entry of dedupeEntries(repository, input.projectId, entries)) {
    repository.saveMemoryEntry(entry);
  }
}

function buildCandidateEntries(input: {
  projectId: ProjectId;
  threadId: ThreadId;
  run: AgentRunState;
  finalAssistantMessage?: string;
  correctnessReview?: CorrectnessReview;
  cwd?: string;
}) {
  const now = new Date().toISOString();
  const sourceCommitSha = input.run.experiment?.headCommitSha ?? input.run.experiment?.baseCommitSha;
  const pathGlobs = collectPathGlobs(input.run, input.cwd);
  const entries: MemoryEntry[] = [];

  if (input.run.summary || input.finalAssistantMessage) {
    entries.push({
      id: createMemoryEntryId(),
      projectId: input.projectId,
      threadId: input.threadId,
      runId: input.run.id,
      kind: "task-summary",
      status: "active",
      title: truncate(`Run ${input.run.id} summary`, 120),
      summary: truncate(input.run.summary ?? input.finalAssistantMessage ?? "Completed run.", 600),
      evidence: truncate(input.finalAssistantMessage ?? input.run.finalExecutionBrief ?? "", 1200) || undefined,
      tags: ["run", input.run.status],
      pathGlobs,
      confidence: input.run.status === "completed" ? "high" : "medium",
      freshness: "fresh",
      pinned: false,
      hitCount: 0,
      sourceCommitSha,
      createdAt: now,
      updatedAt: now
    });
  }

  if (input.run.status === "completed" && input.run.finalExecutionBrief) {
    entries.push({
      id: createMemoryEntryId(),
      projectId: input.projectId,
      threadId: input.threadId,
      runId: input.run.id,
      kind: "success-pattern",
      status: "active",
      title: truncate(input.run.finalExecutionBrief, 120),
      summary: truncate(input.finalAssistantMessage ?? input.run.summary ?? input.run.finalExecutionBrief, 600),
      evidence: truncate(input.run.finalExecutionBrief, 1200),
      tags: ["success", "executor"],
      pathGlobs,
      confidence: "high",
      freshness: "fresh",
      pinned: false,
      hitCount: 0,
      sourceCommitSha,
      createdAt: now,
      updatedAt: now
    });
  }

  if (input.correctnessReview?.status === "needs-iteration") {
    entries.push({
      id: createMemoryEntryId(),
      projectId: input.projectId,
      threadId: input.threadId,
      runId: input.run.id,
      kind: "failure-pattern",
      status: "active",
      title: truncate(input.correctnessReview.summary, 120),
      summary: truncate(input.correctnessReview.gaps.map((gap) => gap.description).join(" | "), 600),
      evidence: truncate(input.correctnessReview.summary, 1200),
      tags: ["correctness", "gap"],
      pathGlobs,
      confidence: "medium",
      freshness: "fresh",
      pinned: false,
      hitCount: 0,
      sourceCommitSha,
      createdAt: now,
      updatedAt: now
    });
  }

  if (input.run.status === "partial-complete" || input.run.status === "failed") {
    entries.push({
      id: createMemoryEntryId(),
      projectId: input.projectId,
      threadId: input.threadId,
      runId: input.run.id,
      kind: "fallback-strategy",
      status: "active",
      title: truncate(input.run.failureMessage ?? "Resume failed run", 120),
      summary: truncate(input.run.failureMessage ?? input.correctnessReview?.summary ?? "Resume only failed parts and keep completed work.", 600),
      evidence: truncate(input.run.summary ?? input.run.finalExecutionBrief ?? "", 1200) || undefined,
      tags: ["fallback", input.run.status],
      pathGlobs,
      confidence: "medium",
      freshness: "fresh",
      pinned: false,
      hitCount: 0,
      sourceCommitSha,
      createdAt: now,
      updatedAt: now
    });
  }

  return entries.slice(0, 24);
}

function dedupeEntries(repository: WorkspaceRepository, projectId: ProjectId, candidates: MemoryEntry[]) {
  const existing = repository.listMemoryEntries(projectId, { status: "active" });
  return candidates.map<MemoryEntry>((candidate) => {
    const duplicate = existing.find(
      (entry) =>
        entry.kind === candidate.kind &&
        normalize(entry.title) === normalize(candidate.title) &&
        normalize(entry.pathGlobs.join("|")) === normalize(candidate.pathGlobs.join("|"))
    );

    if (!duplicate) {
      return candidate;
    }

    return {
      ...duplicate,
      summary: candidate.summary,
      evidence: candidate.evidence,
      tags: uniqueStrings([...duplicate.tags, ...candidate.tags]),
      confidence: candidate.confidence,
      freshness: "fresh" as const,
      sourceCommitSha: candidate.sourceCommitSha,
      updatedAt: candidate.updatedAt
    };
  });
}

function scoreEntry(entry: MemoryEntry, queryText: string) {
  const haystack = normalize([entry.title, entry.summary, entry.evidence ?? "", entry.tags.join(" ")].join(" "));
  const tokens = normalize(queryText)
    .split(/\s+/)
    .filter(Boolean);
  const lexical = tokens.reduce((count, token) => count + (haystack.includes(token) ? 2 : 0), 0);
  const freshnessBonus = entry.freshness === "fresh" ? 4 : entry.freshness === "aging" ? 2 : 0;
  const pinBonus = entry.pinned ? 6 : 0;
  const confidenceBonus = entry.confidence === "high" ? 4 : entry.confidence === "medium" ? 2 : 0;
  return lexical + freshnessBonus + pinBonus + confidenceBonus + Math.min(entry.hitCount, 10);
}

function toMemorySummary(entry: MemoryEntry): MemorySummary {
  return {
    id: entry.id,
    scope: "workspace",
    label: `${entry.kind} | ${entry.title}`,
    content: truncate(`${entry.summary}${entry.evidence ? ` Source: ${entry.evidence}` : ""}`, 600),
    updatedAt: entry.updatedAt,
    source: entry.pinned ? "user" : "generated"
  };
}

function collectPathGlobs(run: AgentRunState, cwd?: string) {
  const paths = run.subtasks
    .flatMap((task) => [task.mountPath, task.worktreePath])
    .filter((value): value is string => Boolean(value))
    .map((value) => {
      if (!cwd) {
        return value.replace(/\\/g, "/");
      }
      return path.relative(cwd, value).replace(/\\/g, "/");
    })
    .filter(Boolean);
  return uniqueStrings(paths).slice(0, 12);
}

function resolveBudget(owner: RetrievalOwner) {
  if (owner === "planner") {
    return 8;
  }
  if (owner === "main") {
    return 6;
  }
  return 4;
}

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)];
}

function truncate(value: string, maxLength: number) {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;
}
