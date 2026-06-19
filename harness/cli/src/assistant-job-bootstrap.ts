import {
  createBackgroundJobId,
  createThreadId,
  type Assistant,
  type AssistantQuestion,
  type BackgroundJob,
  type BackgroundJobSchedule,
  type ProjectId
} from "../../shared/protocol";
import { previewBackgroundJobSchedule } from "./background-job-schedule";
import { createStableBoundedId } from "./notification-ids";
import type { WorkspaceRepository } from "./workspace-repository";

export const ASSISTANT_JOB_BOOTSTRAP_DELAY_MS = 10 * 60 * 1000;
export const ASSISTANT_JOB_BOOTSTRAP_QUESTION_PREFIX = "assistant-job-bootstrap";
export const ASSISTANT_JOB_BOOTSTRAP_SCHEDULE_INPUT = "15m";

export function createAssistantJobBootstrapQuestionId(assistantId: string) {
  return createStableBoundedId([ASSISTANT_JOB_BOOTSTRAP_QUESTION_PREFIX, assistantId]);
}

export function isAssistantJobBootstrapQuestion(question: Pick<AssistantQuestion, "id">) {
  return question.id.startsWith(`${ASSISTANT_JOB_BOOTSTRAP_QUESTION_PREFIX}:`);
}

export function shouldAskAssistantJobBootstrap(
  repository: WorkspaceRepository,
  assistant: Assistant,
  now: Date = new Date(),
  options: { immediate?: boolean } = {}
) {
  if (assistant.deletedAt || assistant.runState !== "active" || assistant.circuitBreakerState === "tripped") {
    return false;
  }
  if (!options.immediate) {
    const createdAtMs = Date.parse(assistant.createdAt);
    if (!Number.isFinite(createdAtMs) || now.getTime() - createdAtMs < ASSISTANT_JOB_BOOTSTRAP_DELAY_MS) {
      return false;
    }
  }
  if (repository.loadBackgroundJobsState().jobs.some((job) => job.assistantId === assistant.id)) {
    return false;
  }
  return !repository.getAssistantQuestions(assistant.id).some((question) => question.id === createAssistantJobBootstrapQuestionId(assistant.id));
}

export function buildAssistantJobBootstrapQuestion(assistant: Assistant, status: AssistantQuestion["status"]): AssistantQuestion {
  const now = new Date().toISOString();
  return {
    id: createAssistantJobBootstrapQuestionId(assistant.id),
    assistantId: assistant.id,
    prompt: `Bootstrap default research, todo maintenance, and implementation jobs for ${assistant.name}?`,
    status,
    askedAt: now
  };
}

export function buildAssistantJobBootstrapJobs(input: {
  assistant: Assistant;
  projectId: ProjectId;
  providerExecutionModelId?: string;
  projectModeId?: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const schedulePreview = previewBackgroundJobSchedule(ASSISTANT_JOB_BOOTSTRAP_SCHEDULE_INPUT, undefined, now);
  if (!schedulePreview.schedule) {
    throw new Error(schedulePreview.error ?? "Invalid assistant job bootstrap schedule");
  }

  const common = {
    projectId: input.projectId,
    assistantId: input.assistant.id,
    kind: "ai-routine" as const,
    status: "enabled" as const,
    riskLevel: "unsafe" as const,
    schedule: schedulePreview.schedule,
    scheduleInput: ASSISTANT_JOB_BOOTSTRAP_SCHEDULE_INPUT,
    timezone: schedulePreview.timezone,
    nextRunAt: resolveBackgroundJobNextRunAt(schedulePreview.schedule),
    createdAt: nowIso,
    updatedAt: nowIso
  };
  const modeId = input.assistant.modeId ?? input.projectModeId ?? "implement";
  const executionModelId = input.assistant.executionModelId ?? input.providerExecutionModelId;

  return [
    {
      ...common,
      id: createBackgroundJobId(),
      automationThreadId: createThreadId(),
      lane: "concurrent" as const,
      name: "Research goal",
      description: `${input.assistant.name} recurring job: Research goal.`,
      definition: {
        kind: "ai-routine" as const,
        prompt: buildResearchGoalPrompt(input.assistant),
        modeId,
        executionModelId,
        reasoningStrength: input.assistant.reasoningStrength,
        fastMode: input.assistant.fastMode,
        planExecutionMode: "immediate" as const,
        subagentWorktreeStrategy: "separate-worktrees" as const
      }
    },
    {
      ...common,
      id: createBackgroundJobId(),
      automationThreadId: createThreadId(),
      lane: "exclusive" as const,
      name: "Maintain todos",
      description: `${input.assistant.name} recurring job: Maintain todos.`,
      definition: {
        kind: "ai-routine" as const,
        prompt: buildMaintainTodosPrompt(input.assistant),
        modeId,
        executionModelId,
        reasoningStrength: input.assistant.reasoningStrength,
        fastMode: input.assistant.fastMode,
        planExecutionMode: "immediate" as const,
        subagentWorktreeStrategy: "separate-worktrees" as const
      }
    },
    {
      ...common,
      id: createBackgroundJobId(),
      automationThreadId: createThreadId(),
      lane: "exclusive" as const,
      name: "Implement todos",
      description: `${input.assistant.name} recurring job: Implement todos.`,
      definition: {
        kind: "ai-routine" as const,
        prompt: buildImplementTodosPrompt(input.assistant),
        modeId,
        executionModelId,
        reasoningStrength: input.assistant.reasoningStrength,
        fastMode: input.assistant.fastMode,
        planExecutionMode: "immediate" as const,
        subagentWorktreeStrategy: "separate-worktrees" as const
      }
    }
  ] satisfies BackgroundJob[];
}

function buildResearchGoalPrompt(assistant: Assistant) {
  return [
    "/market-research",
    `Research the goal for ${assistant.name}.`,
    "Compare current app, code, docs, README, project notes, and assistant state against market signals for the assistant goal.",
    "Scan existing local skills under `.agents/skills/**/SKILL.md` and identify whether research implies a new reusable skill, an existing skill update, a TypeScript script, or a project todo.",
    "Eagerly build or update TypeScript scripts when research exposes repeatable checks, audits, data extraction, scoring, validation, or workflow automation.",
    "Make small, evidence-backed skill or TypeScript script updates only when clearly scoped and not overlapping with active implementation work; otherwise create or update todos for the script, skill, or product work.",
    "Do not spend the pass only reorganizing docs. If research exposes repeatable work, prefer creating or improving a TypeScript script over prose notes.",
    "If no buildable app/product todo exists, create one that explicitly names the smallest usable app behavior, screen, API, workflow, or code path to build next.",
    "For new coding projects with no explicit stack, default to TypeScript, Bun runtime, bun test, bun:sqlite when persistence is needed, SolidJS + Tailwind when UI is needed, frontend tests using Bun + Happy DOM, and shared primitives first.",
    "End with concrete build todos.",
    "",
    "Assistant operating context:",
    assistant.jobPrompt
  ].join("\n");
}

function buildMaintainTodosPrompt(assistant: Assistant) {
  return [
    "Maintain todos.",
    `Clear stale completed or obsolete todos for ${assistant.name}.`,
    "Scan assistant todos, learnings, memory, codebase, docs, local skills, and TypeScript scripts.",
    "Rank next work by implementation value.",
    "Keep skill-building, skill-update, or TypeScript-script todos when they improve future work.",
    "Every active todo should name an app/product implementation target, a TypeScript script target, a skill-improvement target, or explain why implementation is blocked.",
    "After the first discovery runs, most active todos should be app-code or automation-code and should expect real file updates.",
    "For new coding projects with no explicit stack, default to TypeScript, Bun runtime, bun test, bun:sqlite when persistence is needed, SolidJS + Tailwind when UI is needed, frontend tests using Bun + Happy DOM, and shared primitives first.",
    "Do not spend the pass only reorganizing docs.",
    "",
    "Assistant operating context:",
    assistant.jobPrompt
  ].join("\n");
}

function buildImplementTodosPrompt(assistant: Assistant) {
  return [
    "Implement todos.",
    `Implement the top few actionable todos for ${assistant.name}.`,
    "Prefer app/code/product behavior and TypeScript automation scripts over docs-only edits.",
    "Implement skill updates when they are top actionable todos and clearly scoped.",
    "Update documentation after behavior, script, or skill changes as needed.",
    "A successful pass should build or change something real when feasible.",
    "For new coding projects with no explicit stack, default to TypeScript, Bun runtime, bun test, bun:sqlite when persistence is needed, SolidJS + Tailwind when UI is needed, frontend tests using Bun + Happy DOM, and shared primitives first.",
    "If top todos are docs-only but the assistant goal implies repeatable work, convert one todo into a TypeScript script or the smallest usable app/product implementation and do that first.",
    "",
    "Assistant operating context:",
    assistant.jobPrompt
  ].join("\n");
}

function resolveBackgroundJobNextRunAt(schedule: BackgroundJobSchedule) {
  switch (schedule.type) {
    case "one-off":
      return schedule.runAt;
    case "interval":
    case "cron":
      return schedule.nextRunAt;
  }
}
