import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { mkdirSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { resolveModeExecutionAccess } from "../../shared/modes";
import { createStableBoundedId } from "./notification-ids";
import { isBackgroundRunPastLeaseGrace } from "./background-run-leases";
import { classifyRunFailure } from "./run-failure-classification";
import {
  assistantsStateSchema,
  agentRunStateSchema,
  assistantAssetRefSchema,
  assistantLearningSchema,
  assistantLogEntrySchema,
  assistantQuestionSchema,
  assistantSchema,
  assistantThreadSchema,
  assistantTodoSchema,
  backgroundJobRunSchema,
  backgroundJobSchema,
  backgroundJobsStateSchema,
  backgroundJobTemplateSchema,
  backgroundRunStatusNotificationSchema,
  browserSessionSchema,
  executionToolActivitySchema,
  correctnessReviewSchema,
  chatMessageSchema,
  chatAttachmentSchema,
  chatMessageMetadataSchema,
  createBackgroundJobRunId,
  createAssistantThreadId,
  createAssistantTodoId,
  createExperimentId,
  createEmptySession,
  createMemoryEntryId,
  createMemoryRetrievalId,
  createSessionId,
  createProjectId,
  createProjectThreadSummary,
  createRunId,
  createThreadId,
  experimentRunSchema,
  executionPlanSchema,
  memoryEntrySchema,
  memoryFreshnessSchema,
  memoryRetrievalSchema,
  notificationInboxItemSchema,
  notificationInboxStateSchema,
  planningChoiceSchema,
  planningQuestionIntentSchema,
  runFailureCategorySchema,
  type Assistant,
  type AssistantAssetRef,
  type AssistantLearning,
  type AssistantLogEntry,
  type AssistantQuestion,
  type AssistantQuestionStatus,
  type AssistantThread,
  type AssistantTodo,
  type AssistantTodoState,
  type AssistantsState,
  type AgentId,
  type AgentRunState,
  type AgentRunStatus,
  type AgentRunSummary,
  type BackgroundJob,
  type BackgroundJobApprovalPolicy,
  type BackgroundJobRun,
  type BackgroundJobRunStatus,
  type BackgroundJobSchedulerStatus,
  type BackgroundJobSchedule,
  type BackgroundJobsState,
  type BackgroundJobTemplate,
  type BackgroundJobThreadKind,
  type BrowserSession,
  type ChatMessage,
  type ChatAttachment,
  type ChatMessageKind,
  type ChatMessageMetadata,
  type ChatRole,
  type CorrectnessIterationMode,
  type CorrectnessReview,
  type ExecutionControlState,
  type ExecutionToolActivity,
  type ExecutionPlan,
  type ExperimentRun,
  type NotificationInboxItem,
  type NotificationInboxState,
  type NotificationSeverity,
  type MemorySummary,
  type MemoryEntry,
  type MemoryEntryKind,
  type MemoryEntryStatus,
  type MemoryRetrieval,
  type ModeDefinition,
  type PlannerReadyTurn,
  type PlanningChoice,
  type PlanningQuestion,
  type PlanExecutionMode,
  type ProviderBrand,
  type ProjectId,
  type ProjectRootPath,
  type ProjectThreadSummary,
  type QuestionId,
  type RunFailureCategory,
  type RunPromptStats,
  type SessionId,
  type SubagentWorktreeStrategy,
  type SubagentTaskState,
  type ThreadBadgeState,
  type ThreadId,
  type RunExecutionTarget,
  type RunDiagnosticsOwnerPrompt,
  type RunDiagnosticsPromptHash,
  type RunDiagnosticsWindowDays,
  type WorkspaceRuleSource,
  type WorkspaceProjectState,
  type WorkspaceState
} from "../../shared/protocol";
import { defaultBackgroundJobTemplates } from "../../shared/background-job-templates";
import { assertResolvedAssistantAssetRefs, resolveAssistantAssetRefs } from "./assistant-capabilities";
import { debugLog } from "./logging";

const ACTIVE_THREAD_STATUS = "active";
const ACTIVE_PROJECT_KEY = "active_project_id";
const OPENAI_API_KEY = "openai_api_key";
const GOOGLE_API_KEY = "google_api_key";
const ANTHROPIC_API_KEY = "anthropic_api_key";
const PROVIDER_BRAND_KEY = "provider_brand";
const DEBUG_ENABLED_KEY = "debug_enabled";
const TRACE_PANEL_DEFAULT_OPEN_KEY = "trace_panel_default_open";
const SUBAGENT_WORKTREE_STRATEGY_DEFAULT_KEY = "subagent_worktree_strategy_default";
const BLOCK_CHAT_ON_DIRTY_GIT_DEFAULT_KEY = "block_chat_on_dirty_git_default";
const DIRTY_GIT_CHANGE_LIMIT_DEFAULT_KEY = "dirty_git_change_limit_default";
const AUTO_COMPACT_CONTEXT_THRESHOLD_PERCENT_DEFAULT_KEY = "auto_compact_context_threshold_percent_default";
const PLAN_EXECUTION_MODE_DEFAULT_KEY = "plan_execution_mode_default";
const PLAN_EXECUTION_DELAY_SECONDS_DEFAULT_KEY = "plan_execution_delay_seconds_default";
const CORRECTNESS_ITERATION_MODE_DEFAULT_KEY = "correctness_iteration_mode_default";
const BACKGROUND_JOB_APPROVAL_POLICY_DEFAULT_KEY = "background_job_approval_policy_default";
const AUTO_ARCHIVE_COMPLETED_THREADS_DEFAULT_KEY = "auto_archive_completed_threads_default";
const BACKGROUND_SCHEDULER_HEARTBEAT_KEY = "background_scheduler_heartbeat_at";
const MEMORY_BANK_ENABLED_DEFAULT_KEY = "memory_bank_enabled_default";
const MEMORY_BANK_RECORD_RUNS_DEFAULT_KEY = "memory_bank_record_runs_default";
const GLOBAL_EXECUTION_PAUSED_KEY = "global_execution_paused";
const WORKSPACE_RULES_CONTENT_KEY = "workspace_rules_content";
const WORKSPACE_RULES_UPDATED_AT_KEY = "workspace_rules_updated_at";
const WORKSPACE_MEMORY_CONTENT_KEY = "workspace_memory_content";
const WORKSPACE_MEMORY_UPDATED_AT_KEY = "workspace_memory_updated_at";

type ProjectRow = {
  id: string;
  name: string;
  root_path: string;
  active_thread_id: string | null;
  selected_mode_id: string | null;
  rules_content: string | null;
  rules_updated_at: string | null;
  created_at: string;
  updated_at: string;
  last_opened_at: string;
};

type ThreadRow = {
  id: string;
  project_id: string;
  status: string;
  kind: BackgroundJobThreadKind;
  title: string;
  title_source: "generated" | "custom";
  updated_at: string;
  forked_from_thread_id: string | null;
  memory_summary_content: string | null;
  memory_summary_updated_at: string | null;
  created_at: string;
  archived_at: string | null;
};

type WorkspaceModeRow = {
  id: string;
  label: string;
  description: string;
  planner_prompt: string;
  execution_prompt: string;
  tool_policy: "full-access" | "read-heavy" | "review-only";
  execution_access: "workspace-write" | "read-only" | null;
  plan_execution_mode_default: PlanExecutionMode | null;
  subagent_worktree_strategy_default: SubagentWorktreeStrategy | null;
  correctness_iteration_mode_default: CorrectnessIterationMode | null;
  updated_at: string;
};

type ProjectModeRow = WorkspaceModeRow & {
  project_id: string;
};

type MessageRow = {
  id: string;
  thread_id: string;
  role: ChatRole;
  kind: ChatMessageKind | null;
  content: string;
  attachments_json: string | null;
  metadata_json: string | null;
  created_at: string;
};

type AgentRunRow = {
  id: string;
  project_id: string;
  thread_id: string;
  status: AgentRunStatus;
  execution_target: RunExecutionTarget | null;
  latest_user_prompt: string;
  prompt_chars: number | null;
  prompt_hash: string | null;
  transcript_chars: number | null;
  latest_task_chars: number | null;
  planning_model_id: string | null;
  execution_model_id: string | null;
  difficulty_score: number | null;
  summary: string | null;
  final_execution_brief: string | null;
  failure_message: string | null;
  failure_category: RunFailureCategory | null;
  max_turns: number | null;
  turns_used: number;
  plan_json: string | null;
  correctness_review_json: string | null;
  browser_sessions_json: string | null;
  tool_activities_json: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

type AgentRunQuestionRow = {
  id: string;
  run_id: string;
  ordinal: number;
  logical_question_id: string | null;
  planner_turn_id: string | null;
  prompt_hash: string | null;
  prompt: string;
  placeholder: string | null;
  response_kind: "choice" | "freeform";
  choices_json: string | null;
  intent_json: string | null;
  status: "pending" | "deferred" | "answered";
  answer_text: string | null;
  asked_at: string;
  answered_at: string | null;
};

type AgentRunSubtaskRow = {
  id: string;
  run_id: string;
  planner_task_id: string;
  title: string;
  instruction: string;
  status: "pending" | "running" | "completed" | "failed";
  attempt_count: number;
  output: string | null;
  error_message: string | null;
  commit_sha: string | null;
  worktree_path: string | null;
  mount_path: string | null;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
};

type AgentRunExperimentRow = {
  id: string;
  run_id: string;
  status: ExperimentRun["status"];
  virtual_branch_name: string;
  repo_mount_path: string;
  project_mount_path: string;
  base_commit_sha: string | null;
  base_branch_name: string | null;
  base_dirty_fingerprint: string;
  head_commit_sha: string | null;
  files_changed: number;
  insertions: number;
  deletions: number;
  promoted_at: string | null;
  discarded_at: string | null;
  created_at: string;
  updated_at: string;
};

type MemoryEntryRow = {
  id: string;
  project_id: string | null;
  thread_id: string | null;
  run_id: string | null;
  kind: MemoryEntryKind;
  status: MemoryEntryStatus;
  title: string;
  summary: string;
  evidence: string | null;
  tags_json: string | null;
  path_globs_json: string | null;
  confidence: MemoryEntry["confidence"];
  pinned: number;
  priority: number;
  hit_count: number;
  last_hit_at: string | null;
  source_commit_sha: string | null;
  created_at: string;
  updated_at: string;
};

type MemoryRetrievalRow = {
  id: string;
  run_id: string;
  owner: MemoryRetrieval["owner"];
  subagent_id: string | null;
  query_text: string;
  entry_ids_json: string;
  created_at: string;
};

type BackgroundJobRow = {
  id: string;
  project_id: string;
  assistant_id: string | null;
  automation_thread_id: string;
  template_id: string | null;
  created_from_run_id: string | null;
  kind: BackgroundJob["kind"];
  name: string;
  description: string | null;
  definition_json: string;
  schedule_json: string;
  schedule_input: string;
  timezone: string | null;
  status: BackgroundJob["status"];
  risk_level: BackgroundJob["riskLevel"];
  next_run_at: string | null;
  last_run_at: string | null;
  last_enqueued_at: string | null;
  scheduler_status: BackgroundJobSchedulerStatus | null;
  scheduler_detail: string | null;
  scheduler_queue_position: number | null;
  scheduler_queue_reason: string | null;
  scheduler_blocked_since_at: string | null;
  scheduler_active_run_id: string | null;
  scheduler_active_run_started_at: string | null;
  scheduler_last_progress_at: string | null;
  scheduler_overloaded: number | null;
  consecutive_failure_count: number | null;
  backoff_until: string | null;
  last_failure_category: RunFailureCategory | null;
  last_scheduler_check_at: string | null;
  last_blocked_at: string | null;
  blocked_reason: string | null;
  created_at: string;
  updated_at: string;
};

type BackgroundJobRunRow = {
  id: string;
  job_id: string;
  project_id: string;
  assistant_id: string | null;
  automation_thread_id: string;
  trigger_source: BackgroundJobRun["triggerSource"];
  status: BackgroundJobRunStatus;
  risk_level: BackgroundJobRun["riskLevel"];
  approval_status: BackgroundJobRun["approvalStatus"];
  skipped_occurrence_count: number;
  linked_agent_run_id: string | null;
  summary: string | null;
  failure_message: string | null;
  failure_category: RunFailureCategory | null;
  prompt_chars: number | null;
  prompt_hash: string | null;
  transcript_chars: number | null;
  latest_task_chars: number | null;
  controller_instance_id: string | null;
  controller_lease_id: string | null;
  controller_lease_expires_at: string | null;
  resume_attempt_count: number | null;
  last_heartbeat_at: string | null;
  heartbeat_stage: string | null;
  heartbeat_detail: string | null;
  timed_out_at: string | null;
  queued_at: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type BackgroundJobRunEventRow = {
  id: string;
  run_id: string;
  ordinal: number;
  stage: string;
  message: string;
  detail_json: string | null;
  created_at: string;
};

type ChatAttachmentUploadRow = {
  key: string;
  project_id: string | null;
  thread_id: string | null;
  attachment_json: string;
  created_at: string;
};

export type GeminiCachedContentRecord = {
  projectId: ProjectId;
  modelId: string;
  attachmentSetHash: string;
  cachedContentName: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
};

type GeminiCachedContentRow = {
  project_id: string;
  model_id: string;
  attachment_set_hash: string;
  cached_content_name: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
};

type NotificationRow = {
  id: string;
  kind: NotificationInboxItem["kind"];
  interactive: number;
  project_id: string | null;
  thread_id: string | null;
  run_id: string | null;
  assistant_id: string | null;
  question_id: string | null;
  session_id: string | null;
  tool_call_id: string | null;
  background_run_id: string | null;
  job_id: string | null;
  payload_json: string;
  created_at: string;
  read_at: string | null;
  archived_at: string | null;
};

type AssistantRow = {
  id: string;
  name: string;
  scope: "global" | "project";
  project_id: string | null;
  description: string | null;
  personality_prompt: string;
  job_prompt: string;
  agent_id: AgentId;
  provider_brand: ProviderBrand | null;
  mode_id: string | null;
  execution_model_id: string | null;
  reasoning_strength: "low" | "medium" | "high" | "extra-high" | null;
  fast_mode: number | null;
  run_state: "active" | "paused";
  bootstrap_state: "pending" | "running" | "completed" | "failed";
  bootstrap_attempt_id: string | null;
  bootstrap_started_at: string | null;
  bootstrap_finished_at: string | null;
  cloned_from_assistant_id: string | null;
  failure_streak_count: number;
  circuit_breaker_state: "closed" | "tripped";
  circuit_breaker_reason: string | null;
  pending_reprioritize_reason: string | null;
  pending_reprioritize_requested_at: string | null;
  deleted_at: string | null;
  latest_activity_at: string | null;
  created_at: string;
  updated_at: string;
};

type AssistantThreadRow = {
  id: string;
  assistant_id: string;
  session_id: string;
  memory_summary_content: string | null;
  memory_summary_updated_at: string | null;
  updated_at: string;
  created_at: string;
};

type AssistantMessageRow = {
  id: string;
  assistant_thread_id: string;
  role: ChatRole;
  kind: ChatMessageKind | null;
  content: string;
  metadata_json: string | null;
  created_at: string;
};

type AssistantTodoRow = {
  id: string;
  assistant_id: string;
  title: string;
  description: string | null;
  state: AssistantTodoState;
  sort_order: number;
  blocker_reason: string | null;
  source: "user" | "assistant" | "bootstrap" | "job" | "question" | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  cancelled_at: string | null;
};

type AssistantLearningRow = {
  id: string;
  assistant_id: string;
  summary: string;
  source: string;
  confidence: "low" | "medium" | "high";
  sort_order: number | null;
  created_at: string;
  kind: "fact" | "summary" | null;
  supersedes_learning_ids_json: string | null;
  compacted_at: string | null;
};

const ASSISTANT_LEARNING_SOURCE_MAX_LENGTH = 256;
const ASSISTANT_LEARNING_SOURCE_FALLBACK = "unknown";
const ASSISTANT_LEARNING_FUZZY_DUPLICATE_THRESHOLD = 0.86;
const ASSISTANT_LEARNING_SIMILAR_SENTIMENT_THRESHOLD = 0.58;
const ASSISTANT_COMPLETED_TODO_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
const GARBAGE_ASSISTANT_LEARNING_SUMMARIES = new Set([
  "merged durable assistant guidance",
  "compacted summary",
  "compacted summary merged durable assistant guidance"
]);
const ASSISTANT_LEARNING_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "be",
  "for",
  "from",
  "in",
  "into",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "to",
  "with"
]);

export function normalizeAssistantLearningSource(source: string) {
  return normalizeRequiredString(source, ASSISTANT_LEARNING_SOURCE_MAX_LENGTH, ASSISTANT_LEARNING_SOURCE_FALLBACK);
}

type PersistedSchema<T> = {
  safeParse(input: unknown):
    | { success: true; data: T }
    | { success: false; error: { issues?: unknown[] } };
};

type PersistedValidationIssue = {
  code: string;
  path: Array<string | number>;
  maximum?: number;
  minimum?: number;
  type?: string;
  expected?: string;
  received?: string;
  message?: string;
};

type PersistedRecoveryContext = {
  table: string;
  rowId?: string;
  field?: string;
};

type PersistedParseOptions = {
  fallbacks?: Record<string, unknown>;
  maxRepairAttempts?: number;
};

function normalizeRequiredString(value: unknown, max: number, fallback: string) {
  const stringValue = typeof value === "string" ? value.trim() : "";
  const normalized = stringValue || fallback;
  return normalized.length > max ? normalized.slice(0, max) : normalized;
}

function normalizeOptionalString(value: unknown, max: number) {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function normalizeRequiredTrimmedString(value: unknown, max: number, fallback: string) {
  return normalizeRequiredString(value, max, fallback);
}

function normalizeInteger(value: unknown, min: number, max: number, fallback: number) {
  const numeric = typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : fallback;
  return Math.min(max, Math.max(min, numeric));
}

function normalizeOptionalInteger(value: unknown, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return normalizeInteger(value, min, max, min);
}

function normalizeBooleanNumber(value: unknown) {
  return value === true || value === 1;
}

function normalizeComposerReasoningStrength(value: unknown) {
  return value === "low" || value === "medium" || value === "high" || value === "extra-high" ? value : undefined;
}

function normalizeBackgroundJobSchedulerStatus(value: unknown) {
  return value === "idle" ||
    value === "due" ||
    value === "queued" ||
    value === "blocked" ||
    value === "running" ||
    value === "stale"
    ? value
    : undefined;
}

function normalizeArray<T>(value: T[], max: number) {
  return value.slice(0, max);
}

function parseJsonObjectOrUndefined(input: string | null): Record<string, unknown> | undefined {
  if (!input) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(input);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function parseJsonArrayOrEmpty(input: string | null): unknown[] {
  if (!input) {
    return [];
  }

  try {
    const parsed = JSON.parse(input);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeStringArray(input: string | null, maxItems: number, maxItemLength: number) {
  return parseJsonArrayOrEmpty(input)
    .filter((value): value is string => typeof value === "string")
    .map((value) => normalizeRequiredString(value, maxItemLength, "Recovered"))
    .slice(0, maxItems);
}

function safeParsePersisted<T>(
  schema: PersistedSchema<T>,
  value: unknown,
  context: PersistedRecoveryContext,
  options: PersistedParseOptions = {}
): T | undefined {
  let candidate = clonePersistedValue(value);
  const maxRepairAttempts = options.maxRepairAttempts ?? 6;

  for (let attempt = 0; attempt <= maxRepairAttempts; attempt += 1) {
    const parsed = schema.safeParse(candidate);
    if (parsed.success) {
      if (attempt > 0) {
        recordPersistenceRecovery(context, "repaired");
      }
      return parsed.data;
    }

    const issues = normalizePersistedIssues(parsed.error.issues ?? []);
    const repaired = issues.some((issue) => repairPersistedIssue(candidate, issue, context, options));
    if (!repaired) {
      recordPersistenceRecovery(context, issues.map((issue) => issue.message ?? issue.code).join("; ") || "invalid persisted row");
      return undefined;
    }
  }

  recordPersistenceRecovery(context, "max repair attempts reached");
  return undefined;
}

function normalizePersistedIssues(issues: unknown[]): PersistedValidationIssue[] {
  return issues.map((issue) => {
    const record = issue && typeof issue === "object" ? (issue as Record<string, unknown>) : {};
    return {
      code: typeof record.code === "string" ? record.code : "invalid",
      path: Array.isArray(record.path) ? record.path.filter((part): part is string | number => typeof part === "string" || typeof part === "number") : [],
      maximum: typeof record.maximum === "number" ? record.maximum : undefined,
      minimum: typeof record.minimum === "number" ? record.minimum : undefined,
      type: typeof record.type === "string" ? record.type : undefined,
      expected: typeof record.expected === "string" ? record.expected : undefined,
      received: typeof record.received === "string" ? record.received : undefined,
      message: typeof record.message === "string" ? record.message : undefined
    };
  });
}

function clonePersistedValue(value: unknown): unknown {
  if (value === undefined || value === null) {
    return value;
  }
  return JSON.parse(JSON.stringify(value));
}

function repairPersistedIssue(
  root: unknown,
  issue: PersistedValidationIssue,
  context: PersistedRecoveryContext,
  options: PersistedParseOptions
) {
  if (issue.path.length === 0 || isNonRecoverablePersistedIssue(issue)) {
    return false;
  }

  const current = getPersistedPath(root, issue.path);
  const pathKey = issue.path.join(".");
  const fallback = options.fallbacks?.[pathKey] ?? inferPersistedFallback(issue.path, context);

  if (issue.code === "too_big" && typeof issue.maximum === "number") {
    if (typeof current === "string" && (issue.type === "string" || issue.type === undefined)) {
      setPersistedPath(root, issue.path, current.slice(0, issue.maximum));
      return true;
    }
    if (Array.isArray(current)) {
      setPersistedPath(root, issue.path, current.slice(0, issue.maximum));
      return true;
    }
    if (typeof current === "number") {
      setPersistedPath(root, issue.path, issue.maximum);
      return true;
    }
  }

  if (issue.code === "too_small" && typeof issue.minimum === "number") {
    if (typeof current === "string" && issue.minimum <= 1) {
      setPersistedPath(root, issue.path, fallback);
      return true;
    }
    if (typeof current === "number") {
      setPersistedPath(root, issue.path, issue.minimum);
      return true;
    }
  }

  if (issue.code === "invalid_type") {
    if (issue.expected === "boolean") {
      setPersistedPath(root, issue.path, false);
      return true;
    }
    if (issue.expected === "number") {
      setPersistedPath(root, issue.path, typeof issue.minimum === "number" ? issue.minimum : 0);
      return true;
    }
    if (issue.expected === "array") {
      setPersistedPath(root, issue.path, []);
      return true;
    }
    if (issue.expected === "string" || issue.received === "undefined" || issue.received === "null") {
      setPersistedPath(root, issue.path, fallback);
      return true;
    }
  }

  return false;
}

function isNonRecoverablePersistedIssue(issue: PersistedValidationIssue) {
  if (issue.code === "invalid_enum_value" || issue.code === "invalid_union_discriminator" || issue.code === "invalid_literal") {
    return true;
  }
  return issue.path.length === 1 && issue.path[0] === "id";
}

function getPersistedPath(root: unknown, pathParts: Array<string | number>) {
  let current = root;
  for (const part of pathParts) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[String(part)];
  }
  return current;
}

function setPersistedPath(root: unknown, pathParts: Array<string | number>, value: unknown) {
  if (root === null || root === undefined || typeof root !== "object") {
    return;
  }

  let current = root as Record<string, unknown>;
  for (let index = 0; index < pathParts.length - 1; index += 1) {
    const key = String(pathParts[index]);
    if (current[key] === null || current[key] === undefined || typeof current[key] !== "object") {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  current[String(pathParts[pathParts.length - 1])] = value;
}

function inferPersistedFallback(pathParts: Array<string | number>, context: PersistedRecoveryContext) {
  const field = String(pathParts[pathParts.length - 1] ?? context.field ?? "value");
  if (field === "content") {
    return "Recovered content";
  }
  if (field === "title" || field === "name" || field === "label") {
    return "Recovered";
  }
  if (field === "summary") {
    return "Recovered summary";
  }
  if (field === "description" || field === "detail" || field === "inputSummary") {
    return "Recovered detail";
  }
  if (field === "prompt" || field === "jobPrompt" || field === "personalityPrompt" || field === "latestUserPrompt") {
    return "Recovered prompt";
  }
  if (field.endsWith("At") || field === "updatedAt" || field === "createdAt") {
    return new Date().toISOString();
  }
  return "Recovered";
}

function recordPersistenceRecovery(context: PersistedRecoveryContext, reason: string) {
  debugLog("workspace.persisted-state-recovery", {
    table: context.table,
    rowId: context.rowId,
    field: context.field,
    reason
  });
}

type AssistantQuestionRow = {
  id: string;
  assistant_id: string;
  prompt: string;
  status: AssistantQuestionStatus;
  answer_text: string | null;
  linked_todo_ids_json: string | null;
  asked_at: string;
  answered_at: string | null;
};

type AssistantLogEntryRow = {
  id: string;
  assistant_id: string;
  level: "info" | "warning" | "error" | "critical";
  summary: string;
  detail: string | null;
  details_json: string | null;
  created_at: string;
};

type AssistantAssetRefRow = {
  id: string;
  assistant_id: string;
  kind: "skill" | "script" | "mode" | "background-template";
  label: string;
  value: string;
  canonical_value: string | null;
  scope: "workspace" | "project" | null;
  provenance: "repo-skill" | "repo-script" | "workspace-mode" | "project-mode" | "background-template" | null;
  resolution_status: "resolved" | "missing" | "out-of-scope" | null;
  resolution_error: string | null;
  created_at: string;
};

type OpenProjectResult = {
  project: WorkspaceProjectState;
  resolution: "created-project" | "existing-project-new-thread";
};

type WorkspaceRepositoryOptions = {
  durability?: "production" | "test-fast";
};

export type RunDiagnosticsQueryReport = {
  topPromptHashes: RunDiagnosticsPromptHash[];
  promptSizeByOwner: RunDiagnosticsOwnerPrompt[];
  failureRows: Array<{
    sourceType: "agent-run" | "background-job-run";
    day: string;
    failureCategory: RunFailureCategory;
    assistantId?: string;
    jobId?: string;
    count: number;
  }>;
};

export class WorkspaceRepository {
  private readonly db: Database;
  private readonly dbPath: string;
  private readonly repoRoot: string;
  private readonly allowDevThreadRecovery: boolean;

  constructor(dbPath?: string, defaultRootPath: string = process.cwd(), options: WorkspaceRepositoryOptions = {}) {
    this.dbPath = dbPath ?? path.join(process.cwd(), ".local", "harness.db");
    this.repoRoot = defaultRootPath;
    this.allowDevThreadRecovery = Bun.env.NODE_ENV !== "production";
    if (this.dbPath !== ":memory:") {
      mkdirSync(path.dirname(this.dbPath), { recursive: true });
    }
    this.db = new Database(this.dbPath, { create: true, strict: true });
    try {
      this.db.exec("PRAGMA foreign_keys = ON;");
      if (options.durability === "test-fast") {
        this.db.exec("PRAGMA journal_mode = MEMORY;");
        this.db.exec("PRAGMA synchronous = OFF;");
        this.db.exec("PRAGMA temp_store = MEMORY;");
      } else {
        this.db.exec("PRAGMA journal_mode = WAL;");
      }
      this.db.exec("PRAGMA busy_timeout = 5000;");
      this.migrate();
    } catch (error) {
      this.db.close(false);
      throw error;
    }
  }

  getDatabasePath() {
    return this.dbPath;
  }

  loadWorkspace(): WorkspaceState {
    const projectRows = this.db
      .query<ProjectRow, []>(
        `SELECT id, name, root_path, active_thread_id, selected_mode_id, rules_content, rules_updated_at, created_at, updated_at, last_opened_at
         FROM projects
         ORDER BY last_opened_at DESC, created_at ASC`
      )
      .all();

    const activeProjectId = this.resolveActiveProjectId(projectRows.map((project) => project.id as ProjectId));
    return {
      projects: projectRows.map((project) => this.readProjectSnapshot(project.id as ProjectId)),
      workspaceModes: this.readWorkspaceModes(),
      workspaceRuleSource: this.readWorkspaceRuleSource(),
      workspaceMemorySummary: this.readWorkspaceMemorySummary(),
      activeProjectId
    };
  }

  addProject(rootPath: string): WorkspaceProjectState {
    const normalizedRootPath = normalizeProjectRootPath(rootPath);
    ensureDirectoryExists(normalizedRootPath);

    const existingProject = this.db
      .query<ProjectRow, [string]>(
        `SELECT id, name, root_path, active_thread_id, selected_mode_id, rules_content, rules_updated_at, created_at, updated_at, last_opened_at
         FROM projects
         WHERE root_path = ?1`
      )
      .get(normalizedRootPath);

    if (existingProject) {
      throw new Error(`Project already exists: ${normalizedRootPath}`);
    }

    const projectId = createProjectId();
    const threadId = createThreadId();
    const now = new Date().toISOString();
    const baseName = path.basename(normalizedRootPath);
    const uniqueName = this.resolveUniqueProjectName(baseName);

    const tx = this.db.transaction(() => {
      this.db
        .query(
          `INSERT INTO projects (
            id, name, root_path, active_thread_id, selected_mode_id, rules_content, rules_updated_at, created_at, updated_at, last_opened_at
          ) VALUES (?1, ?2, ?3, ?4, 'implement', NULL, NULL, ?5, ?5, ?5)`
        )
        .run(projectId, uniqueName, normalizedRootPath, threadId, now);
      this.insertThread(projectId, threadId, {
        title: "Thread 1",
        titleSource: "generated",
        updatedAt: now
      });
      this.setWorkspaceMetaValue(ACTIVE_PROJECT_KEY, projectId);
    });
    tx();

    return this.readProjectSnapshot(projectId);
  }

  openProject(rootPath: string): OpenProjectResult {
    const normalizedRootPath = normalizeProjectRootPath(rootPath);
    ensureDirectoryExists(normalizedRootPath);

    const existingProject = this.db
      .query<ProjectRow, [string]>(
        `SELECT id, name, root_path, active_thread_id, selected_mode_id, rules_content, rules_updated_at, created_at, updated_at, last_opened_at
         FROM projects
         WHERE root_path = ?1`
      )
      .get(normalizedRootPath);

    if (!existingProject) {
      return {
        project: this.addProject(normalizedRootPath),
        resolution: "created-project"
      };
    }

    return {
      project: this.createThread(existingProject.id as ProjectId),
      resolution: "existing-project-new-thread"
    };
  }

  activateProject(projectId: ProjectId) {
    this.assertProjectExists(projectId);
    const now = new Date().toISOString();
    this.touchProject(projectId, now);
    this.setWorkspaceMetaValue(ACTIVE_PROJECT_KEY, projectId);
  }

  removeProject(projectId: ProjectId): { activeProjectId?: ProjectId } {
    this.assertProjectExists(projectId);
    const remainingProjectIds = this.db
      .query<{ id: string }, [string]>(`SELECT id FROM projects WHERE id != ?1 ORDER BY last_opened_at DESC, created_at ASC`)
      .all(projectId)
      .map((project) => project.id as ProjectId);
    const nextActiveProjectId = remainingProjectIds[0];
    const tx = this.db.transaction(() => {
      this.db.query(`DELETE FROM projects WHERE id = ?1`).run(projectId);
      if (nextActiveProjectId) {
        this.setWorkspaceMetaValue(ACTIVE_PROJECT_KEY, nextActiveProjectId);
      } else {
        this.deleteWorkspaceMetaValue(ACTIVE_PROJECT_KEY);
      }
    });
    tx();

    return { activeProjectId: nextActiveProjectId };
  }

  createThread(projectId: ProjectId) {
    this.assertProjectExists(projectId);
    const threadId = createThreadId();
    const now = new Date().toISOString();
    const tx = this.db.transaction(() => {
      this.insertThread(projectId, threadId, {
        title: `Thread ${this.getNextThreadNumber(projectId)}`,
        titleSource: "generated",
        updatedAt: now
      });
      this.setActiveThread(projectId, threadId, now);
    });
    tx();

    return this.readProjectSnapshot(projectId);
  }

  forkThread(projectId: ProjectId, sourceThreadId: ThreadId) {
    const sourceThread = this.readThreadRow(projectId, sourceThreadId);
    const nextThreadId = createThreadId();
    const now = new Date().toISOString();
    const sourceMessages = this.readMessages(sourceThread.id as ThreadId);

    const tx = this.db.transaction(() => {
      this.insertThread(projectId, nextThreadId, {
        title: `Fork of ${sourceThread.title}`,
        titleSource: "generated",
        updatedAt: now,
        forkedFromThreadId: sourceThread.id as ThreadId
      });

      for (const message of sourceMessages.flatMap(toForkableTranscriptMessage)) {
        this.db
          .query(
            `INSERT INTO thread_messages (id, thread_id, role, kind, content, attachments_json, metadata_json, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
          )
          .run(
            crypto.randomUUID(),
            nextThreadId,
            message.role,
            message.kind ?? "plain",
            message.content,
            message.attachments ? JSON.stringify(message.attachments) : null,
            message.metadata ? JSON.stringify(message.metadata) : null,
            message.createdAt
          );
      }

      this.setActiveThread(projectId, nextThreadId, now);
    });
    tx();

    return this.readProjectSnapshot(projectId);
  }

  activateThread(projectId: ProjectId, threadId: ThreadId) {
    this.readThreadRow(projectId, threadId);
    this.setActiveThread(projectId, threadId, new Date().toISOString());
    return this.readProjectSnapshot(projectId);
  }

  renameThread(projectId: ProjectId, threadId: ThreadId, title: string) {
    const normalizedTitle = normalizeThreadTitle(title);
    const now = new Date().toISOString();
    const updated = this.db
      .query(
        `UPDATE project_threads
         SET title = ?3, title_source = 'custom', updated_at = ?4
         WHERE id = ?1 AND project_id = ?2`
      )
      .run(threadId, projectId, normalizedTitle, now);

    if (updated.changes === 0) {
      throw new Error(`Unknown thread: ${threadId}`);
    }

    this.touchProject(projectId, now);
    return this.readProjectSnapshot(projectId);
  }

  archiveThread(projectId: ProjectId, threadId: ThreadId) {
    const thread = this.readThreadRow(projectId, threadId);
    if (thread.kind !== "user") {
      throw new Error("Automation threads cannot be archived");
    }
    if (thread.status === "archived") {
      return this.readProjectSnapshot(projectId);
    }
    const project = this.getProject(projectId);
    if (project.activeThreadId === threadId) {
      throw new Error("Active thread cannot be archived");
    }
    const activeUserThreadCount =
      this.db
        .query<{ count: number }, [string]>(
          `SELECT COUNT(*) AS count
           FROM project_threads
           WHERE project_id = ?1 AND kind = 'user' AND status = 'active'`
        )
        .get(projectId)?.count ?? 0;
    if (activeUserThreadCount <= 1) {
      throw new Error("At least one usable user thread must remain");
    }
    const now = new Date().toISOString();
    const updated = this.db
      .query(
        `UPDATE project_threads
         SET status = 'archived', archived_at = COALESCE(archived_at, ?3), updated_at = ?3
         WHERE id = ?1 AND project_id = ?2 AND kind = 'user' AND status = 'active'`
      )
      .run(threadId, projectId, now);
    if (updated.changes === 0) {
      throw new Error(`Unknown thread: ${threadId}`);
    }
    this.touchProject(projectId, now);
    return this.readProjectSnapshot(projectId);
  }

  cleanupArchiveThreads(input: { projectIds?: ProjectId[]; cutoffIso: string; nowIso?: string }) {
    const now = input.nowIso ?? new Date().toISOString();
    const projectIds =
      input.projectIds && input.projectIds.length > 0
        ? [...new Set(input.projectIds)]
        : this.db
            .query<{ id: string }, []>(`SELECT id FROM projects ORDER BY last_opened_at DESC, updated_at DESC, created_at DESC`)
            .all()
            .map((project) => project.id as ProjectId);
    const projects: Array<{
      projectId: ProjectId;
      archivedThreadIds: ThreadId[];
      skippedThreadIds: ThreadId[];
      project: WorkspaceProjectState;
    }> = [];
    let archivedCount = 0;
    let skippedCount = 0;

    for (const projectId of projectIds) {
      const project = this.getProject(projectId);
      const activeUserThreads = project.threads.filter((thread) => thread.kind === "user" && thread.status === "active");
      const capacity = Math.max(0, activeUserThreads.length - 1);
      const eligible = activeUserThreads
        .filter((thread) => thread.id !== project.activeThreadId)
        .filter((thread) => thread.badgeState !== "planning" && thread.badgeState !== "executing" && thread.badgeState !== "needs-input")
        .filter((thread) => {
          const activityAt = thread.lastUserMessageAt ?? thread.updatedAt ?? thread.createdAt;
          return activityAt ? Date.parse(activityAt) < Date.parse(input.cutoffIso) : false;
        })
        .sort((left, right) => {
          const leftAt = Date.parse(left.lastUserMessageAt ?? left.updatedAt ?? left.createdAt ?? "");
          const rightAt = Date.parse(right.lastUserMessageAt ?? right.updatedAt ?? right.createdAt ?? "");
          return leftAt - rightAt;
        });
      const archiveTargets = eligible.slice(0, capacity);
      const skippedThreadIds = eligible.slice(capacity).map((thread) => thread.id as ThreadId);
      const archivedThreadIds = archiveTargets.map((thread) => thread.id as ThreadId);

      if (archivedThreadIds.length > 0) {
        const tx = this.db.transaction(() => {
          for (const threadId of archivedThreadIds) {
            this.db
              .query(
                `UPDATE project_threads
                 SET status = 'archived', archived_at = COALESCE(archived_at, ?3), updated_at = ?3
                 WHERE id = ?1 AND project_id = ?2 AND kind = 'user' AND status = 'active'`
              )
              .run(threadId, projectId, now);
          }
          this.touchProject(projectId, now);
        });
        tx();
      }

      archivedCount += archivedThreadIds.length;
      skippedCount += skippedThreadIds.length;
      projects.push({
        projectId,
        archivedThreadIds,
        skippedThreadIds,
        project: this.readProjectSnapshot(projectId)
      });
    }

    return { archivedCount, skippedCount, projects };
  }

  restoreThread(projectId: ProjectId, threadId: ThreadId) {
    const thread = this.readThreadRow(projectId, threadId);
    if (thread.kind !== "user") {
      throw new Error("Automation threads cannot be restored");
    }
    if (thread.status === "active") {
      return this.readProjectSnapshot(projectId);
    }
    const now = new Date().toISOString();
    const updated = this.db
      .query(
        `UPDATE project_threads
         SET status = 'active', archived_at = NULL, updated_at = ?3
         WHERE id = ?1 AND project_id = ?2 AND kind = 'user' AND status = 'archived'`
      )
      .run(threadId, projectId, now);
    if (updated.changes === 0) {
      throw new Error(`Unknown thread: ${threadId}`);
    }
    this.touchProject(projectId, now);
    return this.readProjectSnapshot(projectId);
  }

  listThreadSummaries(projectId: ProjectId) {
    this.assertProjectExists(projectId);
    return this.readThreadSummaries(projectId);
  }

  getThreadSummary(projectId: ProjectId, threadId: ThreadId) {
    return this.readThreadSummaries(projectId).find((thread) => thread.id === threadId);
  }

  resetProject(projectId: ProjectId) {
    return this.createThread(projectId);
  }

  appendMessage(
    projectId: ProjectId,
    role: ChatRole,
    content: string,
    threadIdOrOptions?:
      | ThreadId
      | { threadId?: ThreadId; kind?: ChatMessageKind; attachments?: ChatAttachment[]; metadata?: ChatMessageMetadata }
  ): WorkspaceProjectState {
    const options =
      typeof threadIdOrOptions === "string" || threadIdOrOptions === undefined ? { threadId: threadIdOrOptions } : threadIdOrOptions;
    const resolvedThreadId = this.resolveThreadId(projectId, options.threadId);
    const thread = this.readThreadRow(projectId, resolvedThreadId);
    const message = {
      id: crypto.randomUUID(),
      role,
      kind: options.kind ?? "plain",
      content,
      attachments: options.attachments,
      metadata: options.metadata,
      createdAt: new Date().toISOString()
    } satisfies ChatMessage;
    const priorMessageCount =
      this.db.query<{ count: number }, [string]>(`SELECT COUNT(*) AS count FROM thread_messages WHERE thread_id = ?1`).get(thread.id)
        ?.count ?? 0;

    const tx = this.db.transaction(() => {
      this.db
        .query(
          `INSERT INTO thread_messages (id, thread_id, role, kind, content, attachments_json, metadata_json, created_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
        )
        .run(
          message.id,
          thread.id,
          message.role,
          message.kind ?? "plain",
          message.content,
          message.attachments ? JSON.stringify(message.attachments) : null,
          message.metadata ? JSON.stringify(message.metadata) : null,
          message.createdAt
        );
      this.db.query(`UPDATE project_threads SET updated_at = ?2 WHERE id = ?1`).run(thread.id, message.createdAt);
      this.touchProject(projectId, message.createdAt);

      if (role === "user" && priorMessageCount === 0 && thread.title_source === "generated" && /^Thread \d+$/.test(thread.title)) {
        this.db
          .query(`UPDATE project_threads SET title = ?3 WHERE id = ?1 AND project_id = ?2`)
          .run(thread.id, projectId, toGeneratedThreadTitle(content, thread.title));
      }
    });
    tx();

    return this.readProjectSnapshot(projectId);
  }

  saveChatAttachmentUpload(input: { projectId?: ProjectId; threadId?: ThreadId; attachment: ChatAttachment }) {
    const now = new Date().toISOString();
    this.db
      .query(
        `INSERT INTO chat_attachment_uploads (key, project_id, thread_id, attachment_json, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(key) DO UPDATE SET
           project_id = excluded.project_id,
           thread_id = excluded.thread_id,
           attachment_json = excluded.attachment_json`
      )
      .run(input.attachment.key, input.projectId ?? null, input.threadId ?? null, JSON.stringify(input.attachment), now);
  }

  getChatAttachmentUpload(key: string) {
    const row = this.db
      .query<ChatAttachmentUploadRow, [string]>(
        `SELECT key, project_id, thread_id, attachment_json, created_at
         FROM chat_attachment_uploads
         WHERE key = ?1`
      )
      .get(key);
    if (!row) {
      return undefined;
    }

    const attachment = parseChatAttachment(row.attachment_json, {
      table: "chat_attachment_uploads",
      rowId: row.key,
      field: "attachment_json"
    });
    if (!attachment) {
      return undefined;
    }

    return {
      key: row.key,
      projectId: row.project_id ?? undefined,
      threadId: row.thread_id ?? undefined,
      attachment,
      createdAt: row.created_at
    };
  }

  updateThreadMessage(
    projectId: ProjectId,
    threadId: ThreadId,
    messageId: string,
    patch: { content: string; metadata?: ChatMessageMetadata; createdAt?: string }
  ) {
    this.readThreadRow(projectId, threadId);
    const now = new Date().toISOString();
    const updated = this.db
      .query(
        `UPDATE thread_messages
         SET content = ?4, metadata_json = ?5, created_at = COALESCE(?6, created_at)
         WHERE id = ?3
           AND thread_id = ?2
           AND EXISTS (SELECT 1 FROM project_threads WHERE id = ?2 AND project_id = ?1)`
      )
      .run(projectId, threadId, messageId, patch.content, patch.metadata ? JSON.stringify(patch.metadata) : null, patch.createdAt ?? null);

    if (updated.changes === 0) {
      throw new Error(`Unknown thread message: ${messageId}`);
    }

    this.db.query(`UPDATE project_threads SET updated_at = ?3 WHERE id = ?1 AND project_id = ?2`).run(threadId, projectId, now);
    this.touchProject(projectId, now);
    return this.readProjectSnapshot(projectId);
  }

  createAgentRun(projectId: ProjectId, latestUserPrompt: string, planningModelId?: string, threadId?: ThreadId, maxTurns?: number) {
    const resolvedThreadId = this.resolveThreadId(projectId, threadId);
    this.readThreadRow(projectId, resolvedThreadId);
    const runId = createRunId();
    const now = new Date().toISOString();

    this.db
      .query(
        `INSERT INTO agent_runs (
          id,
          project_id,
          thread_id,
          status,
          execution_target,
          latest_user_prompt,
          prompt_chars,
          prompt_hash,
          transcript_chars,
          latest_task_chars,
          planning_model_id,
          execution_model_id,
          difficulty_score,
          summary,
          final_execution_brief,
          failure_message,
          failure_category,
          max_turns,
          turns_used,
          plan_json,
          correctness_review_json,
          browser_sessions_json,
          tool_activities_json,
          created_at,
          updated_at,
          completed_at
        ) VALUES (?1, ?2, ?3, ?4, 'current-project', ?5, ?6, ?7, NULL, NULL, ?8, NULL, NULL, NULL, NULL, NULL, NULL, ?9, 0, NULL, NULL, NULL, NULL, ?10, ?10, NULL)`
      )
      .run(
        runId,
        projectId,
        resolvedThreadId,
        "planning",
        latestUserPrompt,
        latestUserPrompt.length,
        hashPromptText(latestUserPrompt),
        planningModelId ?? null,
        maxTurns ?? null,
        now
      );

    this.db.query(`UPDATE project_threads SET updated_at = ?2 WHERE id = ?1`).run(resolvedThreadId, now);
    this.touchProject(projectId, now);
    return this.readProjectSnapshot(projectId);
  }

  appendPlanningQuestion(
    projectId: ProjectId,
    runId: string,
    question: Pick<PlanningQuestion, "id" | "prompt" | "placeholder" | "choices" | "required" | "intent"> &
      Partial<Pick<PlanningQuestion, "responseKind">>,
    status: Extract<PlanningQuestion["status"], "pending" | "deferred"> = "pending",
    plannerTurnId?: string
  ) {
    return this.appendPlanningQuestions(
      projectId,
      runId,
      [question],
      status,
      plannerTurnId ?? createStableBoundedId(["legacy-planner-turn", runId, question.id, hashPromptText(question.prompt)])
    );
  }

  appendPlanningQuestions(
    projectId: ProjectId,
    runId: string,
    questions: Array<
      Pick<PlanningQuestion, "id" | "prompt" | "placeholder" | "choices" | "required" | "intent"> &
      Partial<Pick<PlanningQuestion, "responseKind">>
    >,
    status: Extract<PlanningQuestion["status"], "pending" | "deferred"> = "pending",
    plannerTurnId: string
  ) {
    if (questions.length === 0) {
      return this.readProjectSnapshot(projectId);
    }

    const now = new Date().toISOString();
    const tx = this.db.transaction(() => {
      this.assertRunExists(projectId, runId);
      let ordinal =
        this.db.query<{ count: number }, [string]>(`SELECT COUNT(*) AS count FROM agent_run_questions WHERE run_id = ?1`).get(runId)?.count ?? 0;
      const existingQuery = this.db.query<{ id: string }, [string, string, string, string]>(
        `SELECT id
         FROM agent_run_questions
         WHERE run_id = ?1
           AND planner_turn_id = ?2
           AND (logical_question_id = ?3 OR prompt_hash = ?4)
         LIMIT 1`
      );

      for (const question of questions) {
        const promptHash = hashPromptText(question.prompt);
        const existing = existingQuery.get(runId, plannerTurnId, question.id, promptHash);
        if (existing) {
          continue;
        }

        ordinal += 1;
        this.db
          .query(
            `INSERT INTO agent_run_questions (
              id,
              run_id,
              ordinal,
              logical_question_id,
              planner_turn_id,
              prompt_hash,
              prompt,
              placeholder,
              response_kind,
              choices_json,
              intent_json,
              status,
              answer_text,
              asked_at,
              answered_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, NULL, ?13, NULL)`
          )
          .run(
            crypto.randomUUID(),
            runId,
            ordinal,
            question.id,
            plannerTurnId,
            promptHash,
            question.prompt,
            question.placeholder ?? null,
            question.responseKind ?? "choice",
            question.choices ? JSON.stringify(question.choices) : null,
            question.intent ? JSON.stringify(question.intent) : null,
            status,
            now
          );
      }

      this.db
        .query(
          `UPDATE agent_runs
           SET status = 'awaiting-user-input', summary = ?3, updated_at = ?4
           WHERE id = ?1 AND project_id = ?2`
        )
        .run(runId, projectId, questions[0]?.prompt ?? null, now);
    });
    tx();

    return this.readProjectSnapshot(projectId);
  }

  promoteDeferredPlanningQuestions() {
    const now = new Date().toISOString();
    const deferred = this.db
      .query<{ project_id: string; thread_id: string; run_id: string }, []>(
        `SELECT agent_runs.project_id, agent_runs.thread_id, agent_run_questions.run_id
         FROM agent_run_questions
         INNER JOIN agent_runs ON agent_runs.id = agent_run_questions.run_id
         WHERE agent_run_questions.status = 'deferred'
         ORDER BY agent_runs.updated_at ASC, agent_run_questions.ordinal ASC`
      )
      .all();

    const tx = this.db.transaction(() => {
      this.db
        .query(`UPDATE agent_run_questions SET status = 'pending' WHERE status = 'deferred'`)
        .run();
      this.db
        .query(
          `UPDATE agent_runs
           SET status = 'awaiting-user-input',
               summary = (
                 SELECT prompt
                 FROM agent_run_questions
                 WHERE run_id = agent_runs.id AND status = 'pending'
                 ORDER BY ordinal ASC
                 LIMIT 1
               ),
               updated_at = ?1
           WHERE id IN (SELECT DISTINCT run_id FROM agent_run_questions WHERE status = 'pending')`
        )
        .run(now);
    });
    tx();

    return [...new Map(
      deferred.map((entry) => [
        entry.run_id,
        {
          projectId: entry.project_id as ProjectId,
          threadId: entry.thread_id as ThreadId,
          runId: entry.run_id
        }
      ])
    ).values()];
  }

  answerPlanningQuestion(projectId: ProjectId, runId: string, questionId: QuestionId, answerText: string) {
    const now = new Date().toISOString();
    const updated = this.db
      .query(
        `UPDATE agent_run_questions
         SET status = 'answered', answer_text = ?4, answered_at = ?5
         WHERE id = ?1 AND run_id = ?2
           AND EXISTS (
             SELECT 1 FROM agent_runs
             WHERE agent_runs.id = ?2 AND agent_runs.project_id = ?3
           )`
      )
      .run(questionId, runId, projectId, answerText, now);

    if (updated.changes === 0) {
      throw new Error(`Unknown pending planning question: ${questionId}`);
    }

    this.db
      .query(
        `UPDATE agent_runs
         SET status = 'planning', updated_at = ?3
         WHERE id = ?1 AND project_id = ?2`
      )
      .run(runId, projectId, now);

    return this.readProjectSnapshot(projectId);
  }

  setAgentRunReady(
    projectId: ProjectId,
    runId: string,
    plan: PlannerReadyTurn,
    executionPlan?: ExecutionPlan,
    subtasks: Array<Pick<SubagentTaskState, "id" | "title" | "instruction">> = [],
    planningModelId?: string
  ) {
    const now = new Date().toISOString();
    const resolvedSubtasks = subtasks.length > 0 ? subtasks : plan.subtasks;
    const resolvedExecutionPlan =
      executionPlan ??
      ({
        runId,
        origin: "initial",
        iteration: 1,
        summary: plan.summary,
        finalExecutionBrief: plan.finalExecutionBrief,
        difficultyScore: Math.round(plan.difficultyScore),
        planningModelId: planningModelId ?? "openai/gpt-5.4",
        executionModelId: plan.executionModelId,
        route: resolvedSubtasks.length > 1 ? "pi-subagents" : "main",
        subagentWorktreeStrategy: "same-worktree",
        targetSubagentCount: resolvedSubtasks.length,
        actualSubagentCount: resolvedSubtasks.length > 1 ? resolvedSubtasks.length : 0,
        gating: {
          mode: "countdown",
          delaySeconds: 10
        },
        prerequisites: [],
        contracts: resolvedSubtasks.map((task) => ({
          taskId: task.id,
          title: task.title,
          instruction: task.instruction,
          effortPoints: 2,
          ownedPaths: ["(planner-unspecified)"],
          dependsOnPrerequisiteIds: [],
          deliverables: [task.title],
          integrationPoints: [],
          verificationScope: "owned-files-only",
          verificationCommands: ["bunx tsc --noEmit"],
          mergeNotes: `Merge ${task.title} into final solution.`
        })),
        correctnessPolicy: "ask-before-iterate"
      } satisfies ExecutionPlan);

    const tx = this.db.transaction(() => {
      this.assertRunExists(projectId, runId);
      this.db.query(`DELETE FROM agent_run_subtasks WHERE run_id = ?1`).run(runId);

      for (const task of resolvedSubtasks) {
        this.db
          .query(
            `INSERT INTO agent_run_subtasks (
              id,
              run_id,
              planner_task_id,
              title,
              instruction,
              status,
              attempt_count,
              output,
              error_message,
              started_at,
              completed_at,
              updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, 'pending', 0, NULL, NULL, NULL, NULL, ?6)`
          )
          .run(crypto.randomUUID(), runId, task.id, task.title, task.instruction, now);
      }

      this.db
        .query(
          `UPDATE agent_runs
           SET status = 'ready',
               planning_model_id = COALESCE(?3, planning_model_id),
               execution_model_id = ?4,
               difficulty_score = ?5,
               summary = ?6,
               final_execution_brief = ?7,
               failure_message = NULL,
               plan_json = ?8,
               correctness_review_json = NULL,
               updated_at = ?9
           WHERE id = ?1 AND project_id = ?2`
        )
        .run(
          runId,
          projectId,
          planningModelId ?? null,
          plan.executionModelId,
          Math.round(plan.difficultyScore),
          plan.summary,
          plan.finalExecutionBrief,
          JSON.stringify(resolvedExecutionPlan),
          now
        );
    });
    tx();

    return this.readProjectSnapshot(projectId);
  }

  setAgentRunStatus(
    projectId: ProjectId,
    runId: string,
    status: AgentRunStatus,
    failureMessage?: string,
    failureCategory?: RunFailureCategory
  ) {
    const now = new Date().toISOString();
    const completedAt = isTerminalAgentRunStatus(status) ? now : null;
    const updated = this.db
      .query(
        `UPDATE agent_runs
         SET status = ?3,
             failure_message = ?4,
             failure_category = ?5,
             updated_at = ?6,
             completed_at = CASE WHEN ?7 IS NULL THEN completed_at ELSE COALESCE(completed_at, ?7) END
         WHERE id = ?1 AND project_id = ?2`
      )
      .run(runId, projectId, status, failureMessage ?? null, failureCategory ?? null, now, completedAt);

    if (updated.changes === 0) {
      throw new Error(`Unknown agent run: ${runId}`);
    }

    return this.readProjectSnapshot(projectId);
  }

  setAgentRunRuntimeBudget(projectId: ProjectId, runId: string, maxTurns: number | undefined) {
    if (maxTurns === undefined) {
      return this.readProjectSnapshot(projectId);
    }
    if (!Number.isInteger(maxTurns) || maxTurns < 1 || maxTurns > 1000) {
      throw new Error("Runtime budget maxTurns must be an integer from 1 to 1000");
    }
    const now = new Date().toISOString();
    const updated = this.db
      .query(
        `UPDATE agent_runs
         SET max_turns = ?3,
             turns_used = MIN(turns_used, ?3),
             updated_at = ?4
         WHERE id = ?1 AND project_id = ?2`
      )
      .run(runId, projectId, maxTurns, now);

    if (updated.changes === 0) {
      throw new Error(`Unknown agent run: ${runId}`);
    }

    return this.readProjectSnapshot(projectId);
  }

  reserveAgentRunTurn(projectId: ProjectId, runId: string) {
    const tx = this.db.transaction(() => {
      const before = this.db
        .query<{ max_turns: number | null; turns_used: number }, [string, string]>(
          `SELECT max_turns, turns_used
           FROM agent_runs
           WHERE id = ?1 AND project_id = ?2`
        )
        .get(runId, projectId);
      if (!before) {
        throw new Error(`Unknown agent run: ${runId}`);
      }
      if (before.max_turns === null) {
        return undefined;
      }

      const updated = this.db
        .query(
          `UPDATE agent_runs
           SET turns_used = turns_used + 1,
               updated_at = ?3
           WHERE id = ?1 AND project_id = ?2
             AND max_turns IS NOT NULL
             AND turns_used < max_turns`
        )
        .run(runId, projectId, new Date().toISOString());

      if (updated.changes === 0) {
        throw new Error("Run turn budget exhausted [category=turn-budget-exhausted]");
      }

      const after = this.db
        .query<{ max_turns: number; turns_used: number }, [string, string]>(
          `SELECT max_turns, turns_used
           FROM agent_runs
           WHERE id = ?1 AND project_id = ?2`
        )
        .get(runId, projectId);
      if (!after) {
        throw new Error(`Unknown agent run: ${runId}`);
      }
      return buildRunRuntimeBudget(after.max_turns, after.turns_used, true);
    });
    return tx();
  }

  setAgentRunExecutionTarget(projectId: ProjectId, runId: string, target: RunExecutionTarget) {
    const now = new Date().toISOString();
    const updated = this.db
      .query(
        `UPDATE agent_runs
         SET execution_target = ?3,
             updated_at = ?4
         WHERE id = ?1 AND project_id = ?2`
      )
      .run(runId, projectId, target, now);

    if (updated.changes === 0) {
      throw new Error(`Unknown agent run: ${runId}`);
    }

    return this.readProjectSnapshot(projectId);
  }

  setAgentRunCorrectnessReview(projectId: ProjectId, runId: string, correctnessReview?: CorrectnessReview) {
    const now = new Date().toISOString();
    const updated = this.db
      .query(
        `UPDATE agent_runs
         SET correctness_review_json = ?3,
             updated_at = ?4
         WHERE id = ?1 AND project_id = ?2`
      )
      .run(runId, projectId, correctnessReview ? JSON.stringify(correctnessReview) : null, now);

    if (updated.changes === 0) {
      throw new Error(`Unknown agent run: ${runId}`);
    }

    return this.readProjectSnapshot(projectId);
  }

  setAgentRunExecutionPlan(projectId: ProjectId, runId: string, executionPlan: ExecutionPlan) {
    const now = new Date().toISOString();
    const updated = this.db
      .query(
        `UPDATE agent_runs
         SET plan_json = ?3,
             summary = ?4,
             final_execution_brief = ?5,
             difficulty_score = ?6,
             execution_model_id = ?7,
             updated_at = ?8
         WHERE id = ?1 AND project_id = ?2`
      )
      .run(
        runId,
        projectId,
        JSON.stringify(executionPlan),
        executionPlan.summary,
        executionPlan.finalExecutionBrief,
        Math.round(executionPlan.difficultyScore),
        executionPlan.executionModelId,
        now
      );

    if (updated.changes === 0) {
      throw new Error(`Unknown agent run: ${runId}`);
    }

    return this.readProjectSnapshot(projectId);
  }

  setAgentRunBrowserSessions(projectId: ProjectId, runId: string, browserSessions: BrowserSession[]) {
    const now = new Date().toISOString();
    const updated = this.db
      .query(
        `UPDATE agent_runs
         SET browser_sessions_json = ?3,
             updated_at = ?4
         WHERE id = ?1 AND project_id = ?2`
      )
      .run(runId, projectId, JSON.stringify(browserSessions), now);

    if (updated.changes === 0) {
      throw new Error(`Unknown agent run: ${runId}`);
    }

    return this.readProjectSnapshot(projectId);
  }

  setAgentRunPromptStats(projectId: ProjectId, runId: string, promptStats: RunPromptStats) {
    const now = new Date().toISOString();
    const updated = this.db
      .query(
        `UPDATE agent_runs
         SET prompt_chars = ?3,
             prompt_hash = ?4,
             transcript_chars = ?5,
             latest_task_chars = ?6,
             updated_at = ?7
         WHERE id = ?1 AND project_id = ?2`
      )
      .run(
        runId,
        projectId,
        promptStats.promptChars,
        promptStats.promptHash,
        promptStats.transcriptChars ?? null,
        promptStats.latestTaskChars ?? null,
        now
      );

    if (updated.changes === 0) {
      throw new Error(`Unknown agent run: ${runId}`);
    }

    return this.readProjectSnapshot(projectId);
  }

  setAgentRunToolActivities(projectId: ProjectId, runId: string, toolActivities: ExecutionToolActivity[]) {
    const now = new Date().toISOString();
    const boundedActivities = toolActivities.slice(-512);
    const updated = this.db
      .query(
        `UPDATE agent_runs
         SET tool_activities_json = ?3,
             updated_at = ?4
         WHERE id = ?1 AND project_id = ?2`
      )
      .run(runId, projectId, JSON.stringify(boundedActivities), now);

    if (updated.changes === 0) {
      throw new Error(`Unknown agent run: ${runId}`);
    }

    return this.readProjectSnapshot(projectId);
  }

  markSubtaskStarted(projectId: ProjectId, runId: string, taskId: string, attemptCount: number) {
    return this.updateSubtask(projectId, runId, taskId, {
      status: "running",
      attemptCount,
      startedAt: new Date().toISOString(),
      completedAt: null,
      output: null,
      errorMessage: null
    });
  }

  markSubtaskCompleted(
    projectId: ProjectId,
    runId: string,
    taskId: string,
    output: string,
    attemptCount: number,
    commitSha?: string,
    worktreePath?: string,
    mountPath?: string
  ) {
    const now = new Date().toISOString();
    return this.updateSubtask(projectId, runId, taskId, {
      status: "completed",
      attemptCount,
      completedAt: now,
      output,
      errorMessage: null,
      commitSha: commitSha ?? null,
      worktreePath: worktreePath ?? null,
      mountPath: mountPath ?? null
    });
  }

  markSubtaskFailed(
    projectId: ProjectId,
    runId: string,
    taskId: string,
    errorMessage: string,
    attemptCount: number,
    worktreePath?: string,
    mountPath?: string
  ) {
    const now = new Date().toISOString();
    return this.updateSubtask(projectId, runId, taskId, {
      status: "failed",
      attemptCount,
      completedAt: now,
      output: null,
      errorMessage,
      commitSha: null,
      worktreePath: worktreePath ?? null,
      mountPath: mountPath ?? null
    });
  }

  clearAgentRun(projectId: ProjectId, runId: string) {
    const deleted = this.db
      .query(`DELETE FROM agent_runs WHERE id = ?1 AND project_id = ?2`)
      .run(runId, projectId);

    if (deleted.changes === 0) {
      throw new Error(`Unknown agent run: ${runId}`);
    }

    return this.readProjectSnapshot(projectId);
  }

  getProject(projectId: ProjectId): WorkspaceProjectState {
    return this.readProjectSnapshot(projectId);
  }

  getAgentRun(projectId: ProjectId, threadId: ThreadId, runId: string): AgentRunState | undefined {
    this.readThreadRow(projectId, threadId);
    const run = this.readRunRow(projectId, threadId, runId);
    return run ? this.hydrateRunState(run) : undefined;
  }

  getThreadMessages(projectId: ProjectId, threadId: ThreadId) {
    this.readThreadRow(projectId, threadId);
    return this.readMessages(threadId);
  }

  saveExperimentRun(projectId: ProjectId, runId: string, experiment: ExperimentRun) {
    this.assertRunExists(projectId, runId);
    this.db
      .query(
        `INSERT INTO agent_run_experiments (
          id,
          run_id,
          status,
          virtual_branch_name,
          repo_mount_path,
          project_mount_path,
          base_commit_sha,
          base_branch_name,
          base_dirty_fingerprint,
          head_commit_sha,
          files_changed,
          insertions,
          deletions,
          promoted_at,
          discarded_at,
          created_at,
          updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)
        ON CONFLICT(run_id) DO UPDATE SET
          status = excluded.status,
          virtual_branch_name = excluded.virtual_branch_name,
          repo_mount_path = excluded.repo_mount_path,
          project_mount_path = excluded.project_mount_path,
          base_commit_sha = excluded.base_commit_sha,
          base_branch_name = excluded.base_branch_name,
          base_dirty_fingerprint = excluded.base_dirty_fingerprint,
          head_commit_sha = excluded.head_commit_sha,
          files_changed = excluded.files_changed,
          insertions = excluded.insertions,
          deletions = excluded.deletions,
          promoted_at = excluded.promoted_at,
          discarded_at = excluded.discarded_at,
          updated_at = excluded.updated_at`
      )
      .run(
        experiment.id,
        runId,
        experiment.status,
        experiment.virtualBranchName,
        experiment.repoMountPath,
        experiment.projectMountPath,
        experiment.baseCommitSha ?? null,
        experiment.baseBranchName ?? null,
        experiment.baseDirtyFingerprint,
        experiment.headCommitSha ?? null,
        experiment.filesChanged,
        experiment.insertions,
        experiment.deletions,
        experiment.promotedAt ?? null,
        experiment.discardedAt ?? null,
        experiment.createdAt,
        experiment.updatedAt
      );

    return this.readProjectSnapshot(projectId);
  }

  getExperimentRun(projectId: ProjectId, runId: string) {
    this.assertRunExists(projectId, runId);
    const row = this.db
      .query<AgentRunExperimentRow, [string]>(
        `SELECT
          id,
          run_id,
          status,
          virtual_branch_name,
          repo_mount_path,
          project_mount_path,
          base_commit_sha,
          base_branch_name,
          base_dirty_fingerprint,
          head_commit_sha,
          files_changed,
          insertions,
          deletions,
          promoted_at,
          discarded_at,
          created_at,
          updated_at
         FROM agent_run_experiments
         WHERE run_id = ?1`
      )
      .get(runId);

    return row ? this.hydrateExperimentRun(row) : undefined;
  }

  listMemoryEntries(
    projectId?: ProjectId,
    filters: {
      query?: string;
      kind?: MemoryEntryKind;
      status?: MemoryEntryStatus;
    } = {}
  ) {
    const rows = this.db
      .query<MemoryEntryRow, []>(
        `SELECT
          id, project_id, thread_id, run_id, kind, status, title, summary, evidence, tags_json, path_globs_json,
          confidence, pinned, priority, hit_count, last_hit_at, source_commit_sha, created_at, updated_at
         FROM memory_entries
         ORDER BY pinned DESC, priority ASC, updated_at DESC, created_at DESC`
      )
      .all();

    return rows
      .map((row) => this.hydrateMemoryEntry(row))
      .filter((entry): entry is MemoryEntry => entry !== undefined)
      .filter((entry) => (projectId ? !entry.projectId || entry.projectId === projectId : true))
      .filter((entry) => (filters.kind ? entry.kind === filters.kind : true))
      .filter((entry) => (filters.status ? entry.status === filters.status : true))
      .filter((entry) => {
        if (!filters.query?.trim()) {
          return true;
        }

        const query = filters.query.toLowerCase();
        return [entry.title, entry.summary, entry.evidence ?? "", entry.tags.join(" "), entry.pathGlobs.join(" ")]
          .join("\n")
          .toLowerCase()
          .includes(query);
      });
  }

  getMemoryEntry(entryId: string) {
    const row = this.db
      .query<MemoryEntryRow, [string]>(
        `SELECT
          id, project_id, thread_id, run_id, kind, status, title, summary, evidence, tags_json, path_globs_json,
          confidence, pinned, priority, hit_count, last_hit_at, source_commit_sha, created_at, updated_at
         FROM memory_entries
         WHERE id = ?1`
      )
      .get(entryId);

    return row ? this.hydrateMemoryEntry(row) : undefined;
  }

  saveMemoryEntry(entry: MemoryEntry) {
    this.db
      .query(
        `INSERT INTO memory_entries (
          id, project_id, thread_id, run_id, kind, status, title, summary, evidence, tags_json, path_globs_json,
          confidence, pinned, priority, hit_count, last_hit_at, source_commit_sha, created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)
        ON CONFLICT(id) DO UPDATE SET
          project_id = excluded.project_id,
          thread_id = excluded.thread_id,
          run_id = excluded.run_id,
          kind = excluded.kind,
          status = excluded.status,
          title = excluded.title,
          summary = excluded.summary,
          evidence = excluded.evidence,
          tags_json = excluded.tags_json,
          path_globs_json = excluded.path_globs_json,
          confidence = excluded.confidence,
          pinned = excluded.pinned,
          priority = excluded.priority,
          hit_count = excluded.hit_count,
          last_hit_at = excluded.last_hit_at,
          source_commit_sha = excluded.source_commit_sha,
          updated_at = excluded.updated_at`
      )
      .run(
        entry.id,
        entry.projectId ?? null,
        entry.threadId ?? null,
        entry.runId ?? null,
        entry.kind,
        entry.status,
        entry.title,
        entry.summary,
        entry.evidence ?? null,
        JSON.stringify(entry.tags),
        JSON.stringify(entry.pathGlobs),
        entry.confidence,
        entry.pinned ? 1 : 0,
        entry.priority,
        entry.hitCount,
        entry.lastHitAt ?? null,
        entry.sourceCommitSha ?? null,
        entry.createdAt,
        entry.updatedAt
      );
    return this.getMemoryEntry(entry.id);
  }

  deleteMemoryEntry(entryId: string) {
    this.db.query(`DELETE FROM memory_entries WHERE id = ?1`).run(entryId);
  }

  getNextMemoryPriority(projectId?: ProjectId) {
    const priorities = this.listMemoryEntries(projectId).map((entry) => entry.priority);
    const maxPriority = priorities.length > 0 ? Math.max(...priorities) : 0;
    return Math.min(100000, maxPriority + 100);
  }

  reorderMemoryEntry(projectId: ProjectId, memoryEntryId: string, direction: "up" | "down") {
    let entries = this.listMemoryEntries(projectId);
    const currentIndex = entries.findIndex((entry) => entry.id === memoryEntryId);
    if (currentIndex === -1) {
      throw new Error("Memory entry not found");
    }

    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= entries.length) {
      return entries;
    }

    if (entries.some((entry, index) => index > 0 && entry.priority === entries[index - 1]?.priority)) {
      const now = new Date().toISOString();
      entries.forEach((entry, index) => {
        this.saveMemoryEntry({
          ...entry,
          priority: Math.min(100000, (index + 1) * 100),
          updatedAt: now
        });
      });
      entries = this.listMemoryEntries(projectId);
    }

    const refreshedCurrentIndex = entries.findIndex((entry) => entry.id === memoryEntryId);
    const refreshedTargetIndex = direction === "up" ? refreshedCurrentIndex - 1 : refreshedCurrentIndex + 1;
    if (refreshedCurrentIndex === -1 || refreshedTargetIndex < 0 || refreshedTargetIndex >= entries.length) {
      return entries;
    }

    const current = entries[refreshedCurrentIndex];
    const target = entries[refreshedTargetIndex];
    if (!current || !target) {
      return entries;
    }

    const now = new Date().toISOString();
    this.saveMemoryEntry({
      ...current,
      priority: target.priority,
      updatedAt: now
    });
    this.saveMemoryEntry({
      ...target,
      priority: current.priority,
      updatedAt: now
    });

    return this.listMemoryEntries(projectId);
  }

  logMemoryRetrieval(retrieval: MemoryRetrieval) {
    this.db
      .query(
        `INSERT INTO memory_retrievals (id, run_id, owner, subagent_id, query_text, entry_ids_json, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
      )
      .run(
        retrieval.id,
        retrieval.runId,
        retrieval.owner,
        retrieval.subagentId ?? null,
        retrieval.queryText,
        JSON.stringify(retrieval.entryIds),
        retrieval.createdAt
      );
  }

  getThreadMemorySummary(projectId: ProjectId, threadId: ThreadId) {
    return toThreadMemorySummary(this.readThreadRow(projectId, threadId));
  }

  getLatestThreadRun(projectId: ProjectId, threadId: ThreadId) {
    this.readThreadRow(projectId, threadId);
    return this.readLatestRun(projectId, threadId);
  }

  getRun(projectId: ProjectId, runId: string) {
    this.assertRunExists(projectId, runId);
    const row = this.db
      .query<AgentRunRow, [string, string]>(
        `SELECT
          id, project_id, thread_id, status, execution_target, latest_user_prompt, prompt_chars, prompt_hash, transcript_chars, latest_task_chars,
          planning_model_id, execution_model_id, difficulty_score, summary, final_execution_brief, failure_message, failure_category, max_turns, turns_used, plan_json, correctness_review_json,
          browser_sessions_json, tool_activities_json,
          created_at, updated_at, completed_at
         FROM agent_runs
         WHERE id = ?1 AND project_id = ?2`
      )
      .get(runId, projectId);
    return row ? this.hydrateRunState(row) : undefined;
  }

  loadAssistantsState(): AssistantsState {
    this.pruneCompletedAssistantTodos();
    return assistantsStateSchema.parse({
      assistants: this.readAssistants().slice(0, 512),
      threads: this.readAssistantThreads().slice(0, 512),
      todos: this.readAssistantTodos().slice(0, 8192),
      learnings: this.readAssistantLearnings().slice(0, 8192),
      questions: this.readAssistantQuestions().slice(0, 4096),
      logs: this.readAssistantLogEntries().slice(0, 16384),
      assetRefs: this.readAssistantAssetRefs().slice(0, 4096)
    });
  }

  getAssistant(assistantId: string, includeDeleted: boolean = false) {
    const row = this.db
      .query<AssistantRow, [string]>(
        `SELECT
          id, name, scope, project_id, description, personality_prompt, job_prompt, agent_id, mode_id,
          provider_brand, execution_model_id, reasoning_strength, fast_mode, run_state, bootstrap_state,
          bootstrap_attempt_id, bootstrap_started_at, bootstrap_finished_at, cloned_from_assistant_id, failure_streak_count,
          circuit_breaker_state, circuit_breaker_reason, pending_reprioritize_reason, pending_reprioritize_requested_at,
          deleted_at, latest_activity_at, created_at, updated_at
         FROM assistants
         WHERE id = ?1`
      )
      .get(assistantId);
    if (!row) {
      return undefined;
    }
    if (!includeDeleted && row.deleted_at) {
      return undefined;
    }
    return this.hydrateAssistant(row);
  }

  saveAssistant(assistant: Assistant, assetRefs: AssistantAssetRef[] = []) {
    if (assistant.scope === "project" && assistant.projectId) {
      this.assertProjectExists(assistant.projectId);
    }

    const resolvedAssetRefs = resolveAssistantAssetRefs({
      repoRoot: this.repoRoot,
      assistant,
      assetRefs,
      workspaceModes: this.readWorkspaceModes(),
      projectModes: assistant.projectId ? this.readProjectModes(assistant.projectId) : [],
      backgroundTemplates: this.readBackgroundJobTemplates()
    });
    assertResolvedAssistantAssetRefs(resolvedAssetRefs);

    const now = new Date().toISOString();
    const tx = this.db.transaction(() => {
      this.db
        .query(
          `INSERT INTO assistants (
            id, name, scope, project_id, description, personality_prompt, job_prompt, agent_id, mode_id,
            provider_brand, execution_model_id, reasoning_strength, fast_mode, run_state, bootstrap_state,
            bootstrap_attempt_id, bootstrap_started_at, bootstrap_finished_at, cloned_from_assistant_id, failure_streak_count,
            circuit_breaker_state, circuit_breaker_reason, pending_reprioritize_reason, pending_reprioritize_requested_at,
            deleted_at, latest_activity_at, created_at, updated_at
          ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, NULL, NULL, ?23, ?24, ?25, ?26)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            scope = excluded.scope,
            project_id = excluded.project_id,
            description = excluded.description,
            personality_prompt = excluded.personality_prompt,
            job_prompt = excluded.job_prompt,
            agent_id = excluded.agent_id,
            mode_id = excluded.mode_id,
            provider_brand = excluded.provider_brand,
            execution_model_id = excluded.execution_model_id,
            reasoning_strength = excluded.reasoning_strength,
            fast_mode = excluded.fast_mode,
            run_state = excluded.run_state,
            bootstrap_state = excluded.bootstrap_state,
            bootstrap_attempt_id = excluded.bootstrap_attempt_id,
            bootstrap_started_at = excluded.bootstrap_started_at,
            bootstrap_finished_at = excluded.bootstrap_finished_at,
            cloned_from_assistant_id = excluded.cloned_from_assistant_id,
            failure_streak_count = excluded.failure_streak_count,
            circuit_breaker_state = excluded.circuit_breaker_state,
            circuit_breaker_reason = excluded.circuit_breaker_reason,
            deleted_at = excluded.deleted_at,
            latest_activity_at = excluded.latest_activity_at,
            updated_at = excluded.updated_at`
        )
        .run(
          assistant.id,
          assistant.name,
          assistant.scope,
          assistant.projectId ?? null,
          assistant.description ?? null,
          assistant.personalityPrompt,
          assistant.jobPrompt,
          assistant.agentId,
          assistant.modeId ?? null,
          assistant.providerBrand ?? null,
          assistant.executionModelId ?? null,
          assistant.reasoningStrength ?? null,
          assistant.fastMode === undefined ? null : assistant.fastMode ? 1 : 0,
          assistant.runState,
          assistant.bootstrapState,
          assistant.bootstrapAttemptId ?? null,
          assistant.bootstrapStartedAt ?? null,
          assistant.bootstrapFinishedAt ?? null,
          assistant.clonedFromAssistantId ?? null,
          assistant.failureStreakCount,
          assistant.circuitBreakerState,
          assistant.circuitBreakerReason ?? null,
          assistant.deletedAt ?? null,
          assistant.latestActivityAt ?? now,
          assistant.createdAt,
          now
        );

      const existingThread = this.db
        .query<{ id: string }, [string]>(`SELECT id FROM assistant_threads WHERE assistant_id = ?1`)
        .get(assistant.id);
      if (!existingThread) {
        this.db
          .query(
            `INSERT INTO assistant_threads (
              id, assistant_id, session_id, memory_summary_content, memory_summary_updated_at, updated_at, created_at
            ) VALUES (?1, ?2, ?3, NULL, NULL, ?4, ?4)`
          )
          .run(createAssistantThreadId(), assistant.id, createSessionId(), now);
      }

      this.db.query(`DELETE FROM assistant_asset_refs WHERE assistant_id = ?1`).run(assistant.id);
      for (const assetRef of resolvedAssetRefs) {
        this.db
          .query(
            `INSERT INTO assistant_asset_refs (
              id, assistant_id, kind, label, value, canonical_value, scope, provenance, resolution_status, resolution_error, created_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`
          )
          .run(
            assetRef.id,
            assistant.id,
            assetRef.kind,
            assetRef.label,
            assetRef.value,
            assetRef.canonicalValue ?? null,
            assetRef.scope ?? null,
            assetRef.provenance ?? null,
            assetRef.resolutionStatus,
            assetRef.resolutionError ?? null,
            assetRef.createdAt
          );
      }
    });
    tx();

    return this.getAssistant(assistant.id)!;
  }

  saveAssistantTodo(todo: AssistantTodo) {
    this.assertAssistantExists(todo.assistantId);
    this.db
      .query(
        `INSERT INTO assistant_todos (
          id, assistant_id, title, description, state, sort_order, blocker_reason, source,
          created_at, updated_at, completed_at, cancelled_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          description = excluded.description,
          state = excluded.state,
          sort_order = excluded.sort_order,
          blocker_reason = excluded.blocker_reason,
          source = excluded.source,
          updated_at = excluded.updated_at,
          completed_at = excluded.completed_at,
          cancelled_at = excluded.cancelled_at`
      )
      .run(
        todo.id,
        todo.assistantId,
        todo.title,
        todo.description ?? null,
        todo.state,
        todo.sortOrder,
        todo.blockerReason ?? null,
        todo.source ?? null,
        todo.createdAt,
        todo.updatedAt,
        todo.completedAt ?? null,
        todo.cancelledAt ?? null
      );
    this.touchAssistant(todo.assistantId);
    return this.getAssistantTodo(todo.id)!;
  }

  reorderAssistantTodos(assistantId: string, todoIds: string[]) {
    this.assertAssistantExists(assistantId);
    const now = new Date().toISOString();
    const tx = this.db.transaction(() => {
      todoIds.forEach((todoId, index) => {
        this.db
          .query(`UPDATE assistant_todos SET sort_order = ?3, updated_at = ?4 WHERE id = ?1 AND assistant_id = ?2`)
          .run(todoId, assistantId, index, now);
      });
    });
    tx();
    this.touchAssistant(assistantId, now);
  }

  deleteAssistantTodo(assistantId: string, todoId: string) {
    this.assertAssistantExists(assistantId);
    const now = new Date().toISOString();
    this.db.query(`DELETE FROM assistant_todos WHERE id = ?1 AND assistant_id = ?2`).run(todoId, assistantId);
    this.touchAssistant(assistantId, now);
  }

  saveAssistantLearning(learning: AssistantLearning) {
    this.assertAssistantExists(learning.assistantId);
    const parsed = assistantLearningSchema.parse({
      ...learning,
      source: normalizeAssistantLearningSource(learning.source)
    });
    if (isGarbageAssistantLearningSummary(parsed.summary)) {
      return undefined;
    }
    this.db
      .query(
        `INSERT INTO assistant_learnings (
           id, assistant_id, summary, source, confidence, sort_order, created_at, kind, supersedes_learning_ids_json, compacted_at
         )
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
         ON CONFLICT(id) DO UPDATE SET
           summary = excluded.summary,
           source = excluded.source,
           confidence = excluded.confidence,
           sort_order = excluded.sort_order,
           kind = excluded.kind,
           supersedes_learning_ids_json = excluded.supersedes_learning_ids_json,
           compacted_at = excluded.compacted_at`
      )
      .run(
        parsed.id,
        parsed.assistantId,
        parsed.summary,
        parsed.source,
        parsed.confidence,
        parsed.sortOrder ?? null,
        parsed.createdAt,
        parsed.kind ?? "fact",
        parsed.supersedesLearningIds ? JSON.stringify(parsed.supersedesLearningIds) : null,
        parsed.compactedAt ?? null
      );
    this.touchAssistant(parsed.assistantId, parsed.createdAt);
    return this.getAssistantLearning(parsed.id);
  }

  reorderAssistantLearnings(assistantId: string, learningIds: string[]) {
    this.assertAssistantExists(assistantId);
    const now = new Date().toISOString();
    const tx = this.db.transaction(() => {
      learningIds.forEach((learningId, index) => {
        this.db
          .query(`UPDATE assistant_learnings SET sort_order = ?3 WHERE id = ?1 AND assistant_id = ?2`)
          .run(learningId, assistantId, index);
      });
    });
    tx();
    this.touchAssistant(assistantId, now);
  }

  saveAssistantLearningDeduped(learning: AssistantLearning) {
    this.assertAssistantExists(learning.assistantId);
    const parsed = assistantLearningSchema.parse({
      ...learning,
      source: normalizeAssistantLearningSource(learning.source)
    });
    if (isGarbageAssistantLearningSummary(parsed.summary)) {
      return undefined;
    }
    const sharedPremise = this.findAssistantLearningSharedPremise(parsed);
    if (sharedPremise) {
      const merged = mergeAssistantLearningSummaries(sharedPremise, parsed);
      if (!merged) {
        return sharedPremise;
      }
      return this.saveAssistantLearning(merged);
    }
    const duplicate = this.findAssistantLearningDuplicate(parsed);
    if (!duplicate) {
      return this.saveAssistantLearning(parsed);
    }

    if (isAssistantQuestionPolicyFollowup(duplicate.source, parsed.source)) {
      return this.saveAssistantLearning(parsed);
    }
    if (shouldSkipSimilarAssistantLearning(duplicate, parsed)) {
      return duplicate;
    }
    const shouldReplace = shouldReplaceAssistantLearning(duplicate, parsed);
    return this.saveAssistantLearning({
      ...duplicate,
      summary: shouldReplace ? parsed.summary : duplicate.summary,
      source: shouldReplace ? parsed.source : duplicate.source,
      confidence: strongerAssistantLearningConfidence(duplicate.confidence, parsed.confidence),
      kind: duplicate.kind ?? parsed.kind ?? "fact",
      supersedesLearningIds: mergeUniqueStrings([
        ...(duplicate.supersedesLearningIds ?? []),
        ...(parsed.supersedesLearningIds ?? [])
      ]),
      compactedAt: duplicate.compactedAt,
      createdAt: duplicate.createdAt
    });
  }

  getAssistantLearningStats(assistantId: string) {
    const learnings = this.getAssistantLearnings(assistantId);
    const activeFactLearnings = learnings.filter((learning) => (learning.kind ?? "fact") === "fact");
    return {
      activeLearningCount: learnings.length,
      activeFactLearningCount: activeFactLearnings.length,
      activeSummaryCharCount: learnings.reduce((total, learning) => total + learning.summary.length, 0)
    };
  }

  compactAssistantLearnings(assistantId: string, compactedLearning: AssistantLearning, supersededIds: string[]) {
    this.assertAssistantExists(assistantId);
    const now = compactedLearning.compactedAt ?? new Date().toISOString();
    const uniqueSupersededIds = mergeUniqueStrings(supersededIds);
    const saved = this.saveAssistantLearningDeduped({
      ...compactedLearning,
      assistantId,
      kind: "summary",
      supersedesLearningIds: uniqueSupersededIds,
      compactedAt: now
    });
    if (!saved) {
      return undefined;
    }
    const tx = this.db.transaction(() => {
      for (const learningId of uniqueSupersededIds) {
        if (learningId === saved.id) {
          continue;
        }
        this.db
          .query(`UPDATE assistant_learnings SET compacted_at = ?3 WHERE id = ?1 AND assistant_id = ?2 AND compacted_at IS NULL`)
          .run(learningId, assistantId, now);
      }
    });
    tx();
    this.touchAssistant(assistantId, now);
    return this.getAssistantLearning(saved.id)!;
  }

  deleteAssistantLearning(assistantId: string, learningId: string) {
    this.assertAssistantExists(assistantId);
    const now = new Date().toISOString();
    this.db.query(`DELETE FROM assistant_learnings WHERE id = ?1 AND assistant_id = ?2`).run(learningId, assistantId);
    this.touchAssistant(assistantId, now);
  }

  saveAssistantQuestion(question: AssistantQuestion) {
    this.assertAssistantExists(question.assistantId);
    this.db
      .query(
        `INSERT INTO assistant_questions (id, assistant_id, prompt, status, answer_text, linked_todo_ids_json, asked_at, answered_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT(id) DO UPDATE SET
           prompt = excluded.prompt,
           status = excluded.status,
           answer_text = excluded.answer_text,
           linked_todo_ids_json = excluded.linked_todo_ids_json,
           answered_at = excluded.answered_at`
      )
      .run(
        question.id,
        question.assistantId,
        question.prompt,
        question.status,
        question.answerText ?? null,
        question.linkedTodoIds ? JSON.stringify(question.linkedTodoIds) : null,
        question.askedAt,
        question.answeredAt ?? null
      );
    this.touchAssistant(question.assistantId, question.answeredAt ?? question.askedAt);
    return this.getAssistantQuestion(question.id)!;
  }

  answerAssistantQuestion(assistantId: string, questionId: string, answerText: string) {
    this.assertAssistantExists(assistantId);
    const now = new Date().toISOString();
    const updated = this.db
      .query(
        `UPDATE assistant_questions
         SET status = 'answered', answer_text = ?3, answered_at = ?4
         WHERE id = ?1 AND assistant_id = ?2`
      )
      .run(questionId, assistantId, answerText.trim(), now);
    if (updated.changes === 0) {
      throw new Error("Unknown assistant question for assistant");
    }
    this.touchAssistant(assistantId, now);
    return this.getAssistantQuestion(questionId)!;
  }

  dismissAssistantQuestion(assistantId: string, questionId: string) {
    this.assertAssistantExists(assistantId);
    const now = new Date().toISOString();
    const updated = this.db
      .query(
        `UPDATE assistant_questions
         SET status = 'dismissed', answered_at = COALESCE(answered_at, ?3)
         WHERE id = ?1 AND assistant_id = ?2 AND status IN ('pending', 'deferred')`
      )
      .run(questionId, assistantId, now);
    if (updated.changes === 0) {
      throw new Error("Assistant question is not dismissable");
    }
    this.touchAssistant(assistantId, now);
    return this.getAssistantQuestion(questionId)!;
  }

  promoteDeferredAssistantQuestions() {
    const questionIds = this.db
      .query<{ id: string }, []>(`SELECT id FROM assistant_questions WHERE status = 'deferred' ORDER BY asked_at ASC`)
      .all()
      .map((row) => row.id);

    this.db.query(`UPDATE assistant_questions SET status = 'pending' WHERE status = 'deferred'`).run();
    return questionIds.map((questionId) => this.getAssistantQuestion(questionId)!).filter(Boolean);
  }

  appendAssistantLogEntry(entry: AssistantLogEntry) {
    this.assertAssistantExists(entry.assistantId);
    this.db
      .query(
        `INSERT INTO assistant_log_entries (id, assistant_id, level, summary, detail, details_json, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
      )
      .run(
        entry.id,
        entry.assistantId,
        entry.level,
        entry.summary,
        entry.detail ?? null,
        entry.detailsJson === undefined ? null : JSON.stringify(entry.detailsJson),
        entry.createdAt
      );
    this.touchAssistant(entry.assistantId, entry.createdAt);
    return this.getAssistantLogEntry(entry.id)!;
  }

  appendAssistantMessage(
    assistantId: string,
    role: ChatRole,
    content: string,
    options: {
      kind?: ChatMessageKind;
      metadata?: ChatMessageMetadata;
      id?: string;
      createdAt?: string;
    } = {}
  ) {
    this.assertAssistantExists(assistantId);
    const thread = this.readAssistantThreadRowByAssistantId(assistantId);
    const createdAt = options.createdAt ?? new Date().toISOString();
    this.db
      .query(
        `INSERT INTO assistant_messages (id, assistant_thread_id, role, kind, content, metadata_json, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
      )
      .run(
        options.id ?? crypto.randomUUID(),
        thread.id,
        role,
        options.kind ?? "plain",
        content,
        options.metadata ? JSON.stringify(options.metadata) : null,
        createdAt
      );
    this.db.query(`UPDATE assistant_threads SET updated_at = ?2 WHERE id = ?1`).run(thread.id, createdAt);
    this.touchAssistant(assistantId, createdAt);
    return this.getAssistantThread(assistantId)!;
  }

  getAssistantThread(assistantId: string): AssistantThread {
    this.assertAssistantExists(assistantId);
    const row = this.readAssistantThreadRowByAssistantId(assistantId);
    const thread = this.hydrateAssistantThread(row);
    if (!thread) {
      throw new Error(`Assistant ${assistantId} has no loadable thread`);
    }
    return thread;
  }

  getAssistantTodos(assistantId: string) {
    this.assertAssistantExists(assistantId);
    return this.readAssistantTodos().filter((todo) => todo.assistantId === assistantId);
  }

  getAssistantLearnings(assistantId: string) {
    this.assertAssistantExists(assistantId);
    return this.readAssistantLearningsByAssistantId(assistantId);
  }

  getAssistantQuestions(assistantId: string) {
    this.assertAssistantExists(assistantId);
    return this.readAssistantQuestions().filter((question) => question.assistantId === assistantId);
  }

  getAssistantsAwaitingBootstrap() {
    return this.readAssistants().filter((assistant) => assistant.bootstrapState === "pending");
  }

  markAssistantPendingReprioritize(assistantId: string, reason: string) {
    this.assertAssistantExists(assistantId);
    const now = new Date().toISOString();
    this.db
      .query(
        `UPDATE assistants
         SET pending_reprioritize_reason = ?2,
             pending_reprioritize_requested_at = ?3,
             updated_at = ?3,
             latest_activity_at = ?3
         WHERE id = ?1`
      )
      .run(assistantId, reason.trim(), now);
  }

  clearAssistantPendingReprioritize(assistantId: string) {
    this.assertAssistantExists(assistantId);
    const now = new Date().toISOString();
    this.db
      .query(
        `UPDATE assistants
         SET pending_reprioritize_reason = NULL,
             pending_reprioritize_requested_at = NULL,
             updated_at = ?2,
             latest_activity_at = ?2
         WHERE id = ?1`
      )
      .run(assistantId, now);
  }

  consumeAssistantsPendingReprioritize() {
    const assistants = this.db
      .query<{ id: string; reason: string }, []>(
        `SELECT id, pending_reprioritize_reason AS reason
         FROM assistants
         WHERE deleted_at IS NULL
           AND pending_reprioritize_reason IS NOT NULL
         ORDER BY pending_reprioritize_requested_at ASC, updated_at ASC`
      )
      .all();

    this.db
      .query(
        `UPDATE assistants
         SET pending_reprioritize_reason = NULL,
             pending_reprioritize_requested_at = NULL
         WHERE pending_reprioritize_reason IS NOT NULL`
      )
      .run();

    return assistants.map((assistant) => ({
      assistantId: assistant.id,
      reason: assistant.reason
    }));
  }

  getAssistantAssetRefs(assistantId: string) {
    this.assertAssistantExists(assistantId);
    return this.readAssistantAssetRefs().filter((assetRef) => assetRef.assistantId === assistantId);
  }

  assertAssistantAssetRefsResolved(assistantId: string) {
    const assistant = this.getAssistant(assistantId);
    if (!assistant) {
      throw new Error(`Unknown assistant: ${assistantId}`);
    }

    const resolvedAssetRefs = resolveAssistantAssetRefs({
      repoRoot: this.repoRoot,
      assistant,
      assetRefs: this.getAssistantAssetRefs(assistantId),
      workspaceModes: this.readWorkspaceModes(),
      projectModes: assistant.projectId ? this.readProjectModes(assistant.projectId) : [],
      backgroundTemplates: this.readBackgroundJobTemplates()
    });
    assertResolvedAssistantAssetRefs(resolvedAssetRefs);
    return resolvedAssetRefs;
  }

  getAssistantLogEntries(assistantId: string) {
    this.assertAssistantExists(assistantId);
    return this.readAssistantLogEntries().filter((entry) => entry.assistantId === assistantId);
  }

  setAssistantThreadMemorySummary(assistantId: string, content: string | undefined) {
    this.assertAssistantExists(assistantId);
    const thread = this.readAssistantThreadRowByAssistantId(assistantId);
    const now = new Date().toISOString();
    this.db
      .query(
        `UPDATE assistant_threads
         SET memory_summary_content = ?2, memory_summary_updated_at = ?3, updated_at = ?3
         WHERE id = ?1`
      )
      .run(thread.id, content?.trim() || null, content?.trim() ? now : null);
    this.touchAssistant(assistantId, now);
    return this.getAssistantThread(assistantId)!;
  }

  setAssistantRunState(assistantId: string, runState: Assistant["runState"], reason?: string) {
    this.assertAssistantExists(assistantId);
    const now = new Date().toISOString();
    this.db
      .query(
        `UPDATE assistants
         SET run_state = ?2,
             circuit_breaker_reason = COALESCE(?3, circuit_breaker_reason),
             updated_at = ?4,
             latest_activity_at = ?4
         WHERE id = ?1`
      )
      .run(assistantId, runState, reason ?? null, now);
    return this.getAssistant(assistantId)!;
  }

  setAssistantBootstrapState(
    assistantId: string,
    bootstrapState: Assistant["bootstrapState"],
    input: { attemptId?: string; startedAt?: string; finishedAt?: string | null } = {}
  ) {
    this.assertAssistantExists(assistantId);
    const now = new Date().toISOString();
    this.db
      .query(
        `UPDATE assistants
         SET bootstrap_state = ?2,
             bootstrap_attempt_id = COALESCE(?3, bootstrap_attempt_id),
             bootstrap_started_at = CASE WHEN ?4 IS NULL THEN bootstrap_started_at ELSE ?4 END,
             bootstrap_finished_at = CASE WHEN ?5 = 1 THEN ?6 ELSE bootstrap_finished_at END,
             updated_at = ?7,
             latest_activity_at = ?7
         WHERE id = ?1`
      )
      .run(
        assistantId,
        bootstrapState,
        input.attemptId ?? null,
        input.startedAt ?? null,
        input.finishedAt === undefined ? 0 : 1,
        input.finishedAt ?? null,
        now
      );
    return this.getAssistant(assistantId)!;
  }

  updateAssistantFailureState(
    assistantId: string,
    input: {
      failureStreakCount: number;
      circuitBreakerState?: Assistant["circuitBreakerState"];
      circuitBreakerReason?: string;
      runState?: Assistant["runState"];
    }
  ) {
    this.assertAssistantExists(assistantId);
    const now = new Date().toISOString();
    this.db
      .query(
        `UPDATE assistants
         SET failure_streak_count = ?2,
             circuit_breaker_state = COALESCE(?3, circuit_breaker_state),
             circuit_breaker_reason = ?4,
             run_state = COALESCE(?5, run_state),
             updated_at = ?6,
             latest_activity_at = ?6
         WHERE id = ?1`
      )
      .run(
        assistantId,
        input.failureStreakCount,
        input.circuitBreakerState ?? null,
        input.circuitBreakerReason ?? null,
        input.runState ?? null,
        now
      );
    return this.getAssistant(assistantId)!;
  }

  recoverAssistantCircuitBreaker(assistantId: string) {
    const assistant = this.getAssistant(assistantId, true);
    if (!assistant) {
      throw new Error(`Unknown assistant: ${assistantId}`);
    }
    if (assistant.deletedAt) {
      throw new Error(`Assistant ${assistant.name} is deleted`);
    }
    const now = new Date().toISOString();
    this.db
      .query(
        `UPDATE assistants
         SET failure_streak_count = 0,
             circuit_breaker_state = 'closed',
             circuit_breaker_reason = NULL,
             run_state = 'active',
             updated_at = ?2,
             latest_activity_at = ?2
         WHERE id = ?1`
      )
      .run(assistantId, now);
    return this.getAssistant(assistantId)!;
  }

  cloneAssistantToProject(assistantId: string, projectId: ProjectId, cloneAssistant: Assistant, assetRefs: AssistantAssetRef[] = []) {
    this.assertAssistantExists(assistantId);
    this.assertProjectExists(projectId);
    const sourceLearnings = this.readAssistantLearningsByAssistantId(assistantId).slice(0, 12);
    const savedAssistant = this.saveAssistant(cloneAssistant, assetRefs);
    if (sourceLearnings.length > 0) {
      this.saveAssistantLearning({
        id: crypto.randomUUID(),
        assistantId: savedAssistant.id,
        summary: `Cloned learnings: ${sourceLearnings.map((entry) => entry.summary).join(" | ").slice(0, 3800)}`,
        source: `clone:${assistantId}`,
        confidence: "medium",
        createdAt: new Date().toISOString()
      });
    }
    return savedAssistant;
  }

  deleteAssistant(assistantId: string) {
    this.assertAssistantExists(assistantId);
    const now = new Date().toISOString();
    const tx = this.db.transaction(() => {
      this.db.query(`UPDATE assistants SET deleted_at = ?2, run_state = 'paused', updated_at = ?2 WHERE id = ?1`).run(assistantId, now);
      this.db.query(`UPDATE background_jobs SET status = 'disabled', updated_at = ?2 WHERE assistant_id = ?1`).run(assistantId, now);
      this.db
        .query(
          `UPDATE background_job_runs
           SET status = 'cancelled', failure_message = 'Assistant deleted', completed_at = ?2, updated_at = ?2
           WHERE assistant_id = ?1 AND status IN ('queued', 'awaiting-approval', 'running')`
        )
        .run(assistantId, now);
      this.db.query(`DELETE FROM background_jobs WHERE assistant_id = ?1`).run(assistantId);
    });
    tx();
  }

  pruneCompletedAssistantTodos(now: Date = new Date()) {
    const cutoff = new Date(now.getTime() - ASSISTANT_COMPLETED_TODO_RETENTION_MS).toISOString();
    this.db
      .query(
        `DELETE FROM assistant_todos
         WHERE state = 'completed'
           AND completed_at IS NOT NULL
           AND completed_at < ?1`
      )
      .run(cutoff);
  }

  loadBackgroundJobsState(): BackgroundJobsState {
    return backgroundJobsStateSchema.parse({
      jobs: this.readBackgroundJobs().slice(0, 512),
      runs: this.readBackgroundJobRuns().slice(0, 2048),
      templates: this.readBackgroundJobTemplates().slice(0, 64),
      schedulerHeartbeatAt: this.getBackgroundSchedulerHeartbeatAt()
    });
  }

  getRunDiagnosticsReport(windowDays: RunDiagnosticsWindowDays = 7): RunDiagnosticsQueryReport {
    const normalizedWindowDays = windowDays;
    const since = new Date(Date.now() - normalizedWindowDays * 24 * 60 * 60 * 1000).toISOString();
    const topPromptHashes = this.db
      .query<
        {
          source_type: "agent-run" | "background-job-run";
          prompt_hash: string;
          assistant_id: string | null;
          job_id: string | null;
          run_count: number;
          average_prompt_chars: number;
          latest_seen_at: string;
        },
        [string]
      >(
        `WITH prompt_rows AS (
           SELECT
             'agent-run' AS source_type,
             prompt_hash,
             prompt_chars,
             updated_at AS seen_at,
             NULL AS assistant_id,
             NULL AS job_id
           FROM agent_runs
           WHERE prompt_hash IS NOT NULL
             AND prompt_chars IS NOT NULL
             AND updated_at >= ?1
           UNION ALL
           SELECT
             'background-job-run' AS source_type,
             background_job_runs.prompt_hash,
             background_job_runs.prompt_chars,
             background_job_runs.updated_at AS seen_at,
             background_jobs.assistant_id,
             background_job_runs.job_id
           FROM background_job_runs
           LEFT JOIN background_jobs ON background_jobs.id = background_job_runs.job_id
           WHERE background_job_runs.prompt_hash IS NOT NULL
             AND background_job_runs.prompt_chars IS NOT NULL
             AND background_job_runs.updated_at >= ?1
         )
         SELECT
           source_type,
           prompt_hash,
           assistant_id,
           job_id,
           COUNT(*) AS run_count,
           AVG(prompt_chars) AS average_prompt_chars,
           MAX(seen_at) AS latest_seen_at
         FROM prompt_rows
         GROUP BY source_type, prompt_hash, assistant_id, job_id
         HAVING COUNT(*) > 1
         ORDER BY run_count DESC, latest_seen_at DESC
         LIMIT 25`
      )
      .all(since)
      .map((row) => ({
        sourceType: row.source_type,
        promptHash: normalizeRequiredString(row.prompt_hash, 64, "unknown-prompt"),
        assistantId: normalizeOptionalString(row.assistant_id, 128),
        jobId: normalizeOptionalString(row.job_id, 128),
        runCount: normalizeInteger(row.run_count, 0, 100000, 0),
        averagePromptChars: normalizeInteger(row.average_prompt_chars, 0, 2_000_000, 0),
        latestSeenAt: normalizeRequiredString(row.latest_seen_at, 256, since)
      }));

    const promptSizeByOwner = this.db
      .query<
        {
          assistant_id: string | null;
          job_id: string | null;
          run_count: number;
          average_prompt_chars: number;
          latest_seen_at: string;
        },
        [string]
      >(
        `SELECT
           background_jobs.assistant_id,
           background_job_runs.job_id,
           COUNT(*) AS run_count,
           AVG(background_job_runs.prompt_chars) AS average_prompt_chars,
           MAX(background_job_runs.updated_at) AS latest_seen_at
         FROM background_job_runs
         INNER JOIN background_jobs ON background_jobs.id = background_job_runs.job_id
         WHERE background_job_runs.prompt_chars IS NOT NULL
           AND background_job_runs.updated_at >= ?1
         GROUP BY background_jobs.assistant_id, background_job_runs.job_id
         ORDER BY average_prompt_chars DESC, latest_seen_at DESC
         LIMIT 50`
      )
      .all(since)
      .map((row) => ({
        assistantId: normalizeOptionalString(row.assistant_id, 128),
        jobId: normalizeOptionalString(row.job_id, 128),
        runCount: normalizeInteger(row.run_count, 0, 100000, 0),
        averagePromptChars: normalizeInteger(row.average_prompt_chars, 0, 2_000_000, 0),
        latestSeenAt: normalizeRequiredString(row.latest_seen_at, 256, since)
      }));

    const failureRows = this.db
      .query<
        {
          source_type: "agent-run" | "background-job-run";
          day: string;
          failure_category: string;
          assistant_id: string | null;
          job_id: string | null;
          count: number;
        },
        [string]
      >(
        `SELECT
           'agent-run' AS source_type,
           substr(updated_at, 1, 10) AS day,
           failure_category,
           NULL AS assistant_id,
           NULL AS job_id,
           COUNT(*) AS count
         FROM agent_runs
         WHERE status = 'failed'
           AND failure_category IS NOT NULL
           AND updated_at >= ?1
         GROUP BY day, failure_category
         UNION ALL
         SELECT
           'background-job-run' AS source_type,
           substr(background_job_runs.updated_at, 1, 10) AS day,
           background_job_runs.failure_category,
           background_jobs.assistant_id,
           background_job_runs.job_id,
           COUNT(*) AS count
         FROM background_job_runs
         LEFT JOIN background_jobs ON background_jobs.id = background_job_runs.job_id
         WHERE background_job_runs.status = 'failed'
           AND background_job_runs.failure_category IS NOT NULL
           AND background_job_runs.updated_at >= ?1
         GROUP BY day, background_job_runs.failure_category, background_jobs.assistant_id, background_job_runs.job_id
         ORDER BY day DESC, count DESC`
      )
      .all(since)
      .map((row) => ({
        sourceType: row.source_type,
        day: normalizeRequiredString(row.day, 32, since.slice(0, 10)),
        failureCategory: classifyRunFailure({ explicitCategory: row.failure_category }),
        assistantId: normalizeOptionalString(row.assistant_id, 128),
        jobId: normalizeOptionalString(row.job_id, 128),
        count: normalizeInteger(row.count, 0, 100000, 0)
      }));

    return {
      topPromptHashes,
      promptSizeByOwner,
      failureRows
    };
  }

  loadNotificationInboxState(): NotificationInboxState {
    const items = this.readNotificationInboxItems().slice(0, 4096);
    const unreadItems = items.filter((item) => !item.readAt && !item.archivedAt);
    return notificationInboxStateSchema.parse({
      items,
      unreadCount: unreadItems.length,
      interactiveUnreadCount: unreadItems.filter((item) => item.interactive).length,
      passiveUnreadCount: unreadItems.filter((item) => !item.interactive).length
    });
  }

  saveNotification(item: NotificationInboxItem) {
    const now = new Date().toISOString();
    this.db
      .query(
        `INSERT INTO notifications (
          id, kind, interactive, project_id, thread_id, run_id, assistant_id, question_id, session_id, tool_call_id,
          background_run_id, job_id, payload_json, created_at, read_at, archived_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)
        ON CONFLICT(id) DO UPDATE SET
          kind = excluded.kind,
          interactive = excluded.interactive,
          project_id = excluded.project_id,
          thread_id = excluded.thread_id,
          run_id = excluded.run_id,
          assistant_id = excluded.assistant_id,
          question_id = excluded.question_id,
          session_id = excluded.session_id,
          tool_call_id = excluded.tool_call_id,
          background_run_id = excluded.background_run_id,
          job_id = excluded.job_id,
          payload_json = excluded.payload_json,
          created_at = excluded.created_at,
          read_at = CASE
            WHEN notifications.created_at = excluded.created_at THEN COALESCE(notifications.read_at, excluded.read_at)
            ELSE excluded.read_at
          END,
          archived_at = CASE
            WHEN notifications.created_at = excluded.created_at THEN COALESCE(notifications.archived_at, excluded.archived_at)
            ELSE excluded.archived_at
          END`
      )
      .run(
        item.id,
        item.kind,
        item.interactive ? 1 : 0,
        "projectId" in item ? item.projectId : null,
        "threadId" in item ? item.threadId : null,
        "runId" in item ? item.runId : null,
        "assistantId" in item ? item.assistantId : null,
        "questionId" in item ? item.questionId : null,
        "sessionId" in item ? item.sessionId : null,
        "toolCallId" in item ? item.toolCallId : null,
        "backgroundRunId" in item ? item.backgroundRunId : null,
        "jobId" in item ? item.jobId : null,
        JSON.stringify(item),
        item.createdAt,
        item.readAt ?? null,
        item.archivedAt ?? null
      );
    return this.loadNotificationInboxState();
  }

  markNotificationRead(notificationId: string, archive: boolean = false) {
    const now = new Date().toISOString();
    this.db
      .query(
        `UPDATE notifications
         SET read_at = COALESCE(read_at, ?2),
             archived_at = CASE WHEN ?3 = 1 THEN COALESCE(archived_at, ?2) ELSE archived_at END
         WHERE id = ?1`
      )
      .run(notificationId, now, archive ? 1 : 0);
    return this.loadNotificationInboxState();
  }

  archiveNotification(notificationId: string) {
    const now = new Date().toISOString();
    this.db
      .query(`UPDATE notifications SET read_at = COALESCE(read_at, ?2), archived_at = COALESCE(archived_at, ?2) WHERE id = ?1`)
      .run(notificationId, now);
    return this.loadNotificationInboxState();
  }

  markAllPassiveNotificationsRead() {
    const now = new Date().toISOString();
    this.db
      .query(
        `UPDATE notifications
         SET read_at = COALESCE(read_at, ?1),
             archived_at = COALESCE(archived_at, ?1)
         WHERE interactive = 0 AND read_at IS NULL AND archived_at IS NULL`
      )
      .run(now);
    return this.loadNotificationInboxState();
  }

  saveBackgroundJob(job: BackgroundJob) {
    this.assertProjectExists(job.projectId);
    if (job.assistantId) {
      this.assertAssistantExists(job.assistantId);
    }
    const now = new Date().toISOString();
    const automationThreadId = this.ensureAutomationThread(job.projectId, job.automationThreadId, job.name, now);
    this.db
      .query(
        `INSERT INTO background_jobs (
          id, project_id, assistant_id, automation_thread_id, template_id, created_from_run_id, kind, name, description,
          definition_json, schedule_json, schedule_input, timezone, status, risk_level, next_run_at,
          last_run_at, last_enqueued_at, scheduler_status, scheduler_detail, last_scheduler_check_at,
          last_blocked_at, blocked_reason, scheduler_queue_position, scheduler_queue_reason, scheduler_blocked_since_at,
          scheduler_active_run_id, scheduler_active_run_started_at, scheduler_last_progress_at, scheduler_overloaded,
          consecutive_failure_count, backoff_until, last_failure_category, created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29, ?30, ?31, ?32, ?33, ?34, ?35)
        ON CONFLICT(id) DO UPDATE SET
          project_id = excluded.project_id,
          assistant_id = excluded.assistant_id,
          automation_thread_id = excluded.automation_thread_id,
          template_id = excluded.template_id,
          created_from_run_id = excluded.created_from_run_id,
          kind = excluded.kind,
          name = excluded.name,
          description = excluded.description,
          definition_json = excluded.definition_json,
          schedule_json = excluded.schedule_json,
          schedule_input = excluded.schedule_input,
          timezone = excluded.timezone,
          status = excluded.status,
          risk_level = excluded.risk_level,
          next_run_at = excluded.next_run_at,
          last_run_at = excluded.last_run_at,
          last_enqueued_at = excluded.last_enqueued_at,
          updated_at = excluded.updated_at`
      )
      .run(
        job.id,
        job.projectId,
        job.assistantId ?? null,
        automationThreadId,
        job.templateId ?? null,
        job.createdFromRunId ?? null,
        job.kind,
        job.name,
        job.description ?? null,
        JSON.stringify(job.definition),
        JSON.stringify(job.schedule),
        job.scheduleInput,
        job.timezone ?? null,
        job.status,
        job.riskLevel,
        job.nextRunAt ?? null,
        job.lastRunAt ?? null,
        job.lastEnqueuedAt ?? null,
        job.schedulerStatus ?? "idle",
        job.schedulerDetail ?? null,
        job.lastSchedulerCheckAt ?? null,
        job.lastBlockedAt ?? null,
        job.blockedReason ?? null,
        job.schedulerQueuePosition ?? null,
        job.schedulerQueueReason ?? null,
        job.schedulerBlockedSinceAt ?? null,
        job.schedulerActiveRunId ?? null,
        job.schedulerActiveRunStartedAt ?? null,
        job.schedulerLastProgressAt ?? null,
        job.schedulerOverloaded ? 1 : 0,
        job.consecutiveFailureCount ?? 0,
        job.backoffUntil ?? null,
        job.lastFailureCategory ?? null,
        job.createdAt,
        now
      );
    this.touchProject(job.projectId, now);
    return this.loadBackgroundJobsState();
  }

  deleteBackgroundJob(projectId: ProjectId, jobId: string) {
    this.db.query(`DELETE FROM background_jobs WHERE id = ?1 AND project_id = ?2`).run(jobId, projectId);
    return this.loadBackgroundJobsState();
  }

  setBackgroundJobStatus(projectId: ProjectId, jobId: string, status: BackgroundJob["status"]) {
    const now = new Date().toISOString();
    this.db
      .query(`UPDATE background_jobs SET status = ?3, updated_at = ?4 WHERE id = ?1 AND project_id = ?2`)
      .run(jobId, projectId, status, now);
    return this.loadBackgroundJobsState();
  }

  clearBackgroundJobFailureTracking(jobId: string) {
    const now = new Date().toISOString();
    this.db
      .query(
        `UPDATE background_jobs
         SET consecutive_failure_count = 0,
             backoff_until = NULL,
             last_failure_category = NULL,
             updated_at = ?2
         WHERE id = ?1`
      )
      .run(jobId, now);
    return this.getBackgroundJob(jobId);
  }

  repairBackgroundJobReferences(jobId: string) {
    const row = this.db
      .query<{ id: string; project_id: string; assistant_id: string | null; automation_thread_id: string; name: string }, [string]>(
        `SELECT id, project_id, assistant_id, automation_thread_id, name
         FROM background_jobs
         WHERE id = ?1`
      )
      .get(jobId);
    if (!row) {
      return undefined;
    }

    const now = new Date().toISOString();
    const project = this.db.query<{ id: string }, [string]>(`SELECT id FROM projects WHERE id = ?1`).get(row.project_id);
    if (!project) {
      this.db
        .query(
          `UPDATE background_jobs
           SET status = 'disabled',
               scheduler_status = 'blocked',
               scheduler_detail = ?2,
               blocked_reason = ?2,
               last_scheduler_check_at = ?3,
               last_blocked_at = ?3,
               updated_at = ?3
           WHERE id = ?1`
        )
        .run(jobId, `Missing project ${row.project_id}`, now);
      return this.getBackgroundJob(jobId);
    }

    let assistantId = row.assistant_id;
    if (assistantId && !this.assistantExists(assistantId)) {
      this.db
        .query(
          `UPDATE background_jobs
           SET assistant_id = NULL,
               scheduler_status = 'blocked',
               scheduler_detail = ?2,
               blocked_reason = ?2,
               last_scheduler_check_at = ?3,
               last_blocked_at = ?3,
               updated_at = ?3
           WHERE id = ?1`
        )
        .run(jobId, `Detached missing assistant ${assistantId}`, now);
      assistantId = null;
    }

    const automationThreadId = this.ensureAutomationThread(row.project_id as ProjectId, row.automation_thread_id as ThreadId, row.name, now);
    if (automationThreadId !== row.automation_thread_id || assistantId !== row.assistant_id) {
      this.db
        .query(
          `UPDATE background_jobs
           SET automation_thread_id = ?2,
               updated_at = ?3
           WHERE id = ?1`
        )
        .run(jobId, automationThreadId, now);
    }

    return this.getBackgroundJob(jobId);
  }

  recordBackgroundJobFailure(jobId: string, failureCategory: RunFailureCategory, now: Date = new Date()) {
    const job = this.getBackgroundJob(jobId);
    if (!job) {
      return undefined;
    }

    const nextCount = (job.consecutiveFailureCount ?? 0) + 1;
    const nextBackoffUntil = resolveBackgroundBackoffUntil(now, nextCount);
    this.db
      .query(
        `UPDATE background_jobs
         SET consecutive_failure_count = ?2,
             backoff_until = ?3,
             last_failure_category = ?4,
             updated_at = ?5
         WHERE id = ?1`
      )
      .run(jobId, nextCount, nextBackoffUntil, failureCategory, now.toISOString());
    return this.getBackgroundJob(jobId);
  }

  updateBackgroundJobSchedulerState(
    jobId: string,
    input: {
      schedulerStatus: BackgroundJobSchedulerStatus;
      schedulerDetail?: string;
      schedulerQueuePosition?: number;
      schedulerQueueReason?: string;
      schedulerBlockedSinceAt?: string;
      schedulerActiveRunId?: string;
      schedulerActiveRunStartedAt?: string;
      schedulerLastProgressAt?: string;
      schedulerOverloaded?: boolean;
      consecutiveFailureCount?: number;
      backoffUntil?: string | null;
      lastFailureCategory?: RunFailureCategory;
      blockedReason?: string;
      lastSchedulerCheckAt?: string;
      lastBlockedAt?: string;
    }
  ) {
    const now = new Date().toISOString();
    const lastSchedulerCheckAt = input.lastSchedulerCheckAt ?? now;
    const lastBlockedAt = input.schedulerStatus === "blocked" ? input.lastBlockedAt ?? now : undefined;
    this.db
      .query(
        `UPDATE background_jobs
         SET scheduler_status = ?2,
             scheduler_detail = ?3,
             last_scheduler_check_at = ?4,
             last_blocked_at = CASE WHEN ?5 IS NULL THEN last_blocked_at ELSE ?5 END,
             blocked_reason = ?6,
             scheduler_queue_position = ?7,
             scheduler_queue_reason = ?8,
             scheduler_blocked_since_at = CASE
               WHEN ?2 = 'blocked' THEN COALESCE(scheduler_blocked_since_at, ?9)
               ELSE NULL
             END,
             scheduler_active_run_id = ?10,
             scheduler_active_run_started_at = ?11,
             scheduler_last_progress_at = ?12,
             scheduler_overloaded = ?13,
             consecutive_failure_count = COALESCE(?14, consecutive_failure_count),
             backoff_until = ?15,
             last_failure_category = ?16,
             updated_at = ?17
         WHERE id = ?1`
      )
      .run(
        jobId,
        input.schedulerStatus,
        input.schedulerDetail ?? null,
        lastSchedulerCheckAt,
        lastBlockedAt ?? null,
        input.blockedReason ?? null,
        input.schedulerQueuePosition ?? null,
        input.schedulerQueueReason ?? null,
        input.schedulerBlockedSinceAt ?? lastBlockedAt ?? now,
        input.schedulerActiveRunId ?? null,
        input.schedulerActiveRunStartedAt ?? null,
        input.schedulerLastProgressAt ?? null,
        input.schedulerOverloaded === undefined ? null : input.schedulerOverloaded ? 1 : 0,
        input.consecutiveFailureCount ?? null,
        input.backoffUntil ?? null,
        input.lastFailureCategory ?? null,
        now
      );
    return this.getBackgroundJob(jobId);
  }

  setBackgroundSchedulerHeartbeat(now: Date = new Date()) {
    const timestamp = now.toISOString();
    this.setWorkspaceMetaValue(BACKGROUND_SCHEDULER_HEARTBEAT_KEY, timestamp);
    return timestamp;
  }

  getBackgroundSchedulerHeartbeatAt() {
    return this.getWorkspaceMetaValue(BACKGROUND_SCHEDULER_HEARTBEAT_KEY);
  }

  getBackgroundJob(jobId: string) {
    const row = this.db
      .query<BackgroundJobRow, [string]>(
        `SELECT
          id, project_id, assistant_id, automation_thread_id, template_id, created_from_run_id, kind, name, description,
          definition_json, schedule_json, schedule_input, timezone, status, risk_level, next_run_at,
          last_run_at, last_enqueued_at, scheduler_status, scheduler_detail, scheduler_queue_position, scheduler_queue_reason,
          scheduler_blocked_since_at, scheduler_active_run_id, scheduler_active_run_started_at, scheduler_last_progress_at,
          scheduler_overloaded, consecutive_failure_count, backoff_until, last_failure_category,
          last_scheduler_check_at, last_blocked_at, blocked_reason, created_at, updated_at
         FROM background_jobs
         WHERE id = ?1`
      )
      .get(jobId);
    return row ? this.hydrateBackgroundJob(row) : undefined;
  }

  getBackgroundJobRun(runId: string) {
    const row = this.db
      .query<BackgroundJobRunRow, [string]>(
        `SELECT
          id, job_id, project_id, assistant_id, automation_thread_id, trigger_source, status, risk_level, approval_status,
          skipped_occurrence_count, linked_agent_run_id, summary, failure_message, failure_category,
          prompt_chars, prompt_hash, transcript_chars, latest_task_chars,
          controller_instance_id, controller_lease_id, controller_lease_expires_at, resume_attempt_count,
          last_heartbeat_at, heartbeat_stage, heartbeat_detail, timed_out_at, queued_at, started_at,
          completed_at, created_at, updated_at
         FROM background_job_runs
         WHERE id = ?1`
      )
      .get(runId);
    return row ? this.hydrateBackgroundJobRun(row) : undefined;
  }

  getBackgroundJobRunByLinkedAgentRunId(agentRunId: string) {
    const row = this.db
      .query<BackgroundJobRunRow, [string]>(
        `SELECT
          id, job_id, project_id, assistant_id, automation_thread_id, trigger_source, status, risk_level, approval_status,
          skipped_occurrence_count, linked_agent_run_id, summary, failure_message, failure_category,
          prompt_chars, prompt_hash, transcript_chars, latest_task_chars,
          controller_instance_id, controller_lease_id, controller_lease_expires_at, resume_attempt_count,
          last_heartbeat_at, heartbeat_stage, heartbeat_detail, timed_out_at, queued_at, started_at,
          completed_at, created_at, updated_at
         FROM background_job_runs
         WHERE linked_agent_run_id = ?1
         ORDER BY updated_at DESC
         LIMIT 1`
      )
      .get(agentRunId);
    return row ? this.hydrateBackgroundJobRun(row) : undefined;
  }

  getQueuedBackgroundJobRuns() {
    return this.db
      .query<{ id: string }, []>(
        `SELECT id
         FROM background_job_runs
         WHERE status = 'queued'
         ORDER BY queued_at ASC, created_at ASC`
      )
      .all()
      .map((row) => this.getBackgroundJobRun(row.id)!)
      .filter(Boolean);
  }

  getActiveBackgroundJobRuns(jobId?: string) {
    const rows = jobId
      ? this.db
        .query<BackgroundJobRunRow, [string]>(
          `SELECT
            id, job_id, project_id, assistant_id, automation_thread_id, trigger_source, status, risk_level, approval_status,
            skipped_occurrence_count, linked_agent_run_id, summary, failure_message, failure_category,
            prompt_chars, prompt_hash, transcript_chars, latest_task_chars,
            controller_instance_id, controller_lease_id, controller_lease_expires_at, resume_attempt_count,
            last_heartbeat_at, heartbeat_stage, heartbeat_detail, timed_out_at, queued_at, started_at,
            completed_at, created_at, updated_at
           FROM background_job_runs
           WHERE job_id = ?1 AND status IN ('queued', 'awaiting-approval', 'awaiting-user-input', 'running')
           ORDER BY updated_at DESC, created_at DESC`
        )
        .all(jobId)
      : this.db
        .query<BackgroundJobRunRow, []>(
          `SELECT
            id, job_id, project_id, assistant_id, automation_thread_id, trigger_source, status, risk_level, approval_status,
            skipped_occurrence_count, linked_agent_run_id, summary, failure_message, failure_category,
            prompt_chars, prompt_hash, transcript_chars, latest_task_chars,
            controller_instance_id, controller_lease_id, controller_lease_expires_at, resume_attempt_count,
            last_heartbeat_at, heartbeat_stage, heartbeat_detail, timed_out_at, queued_at, started_at,
            completed_at, created_at, updated_at
           FROM background_job_runs
           WHERE status IN ('queued', 'awaiting-approval', 'awaiting-user-input', 'running')
           ORDER BY updated_at DESC, created_at DESC`
        )
        .all();
    return rows.map((row) => this.hydrateBackgroundJobRun(row)).filter((run): run is BackgroundJobRun => run !== undefined);
  }

  getActiveBackgroundJobRunsByAssistant(assistantId: string) {
    return this.db
      .query<BackgroundJobRunRow, [string]>(
        `SELECT
          id, job_id, project_id, assistant_id, automation_thread_id, trigger_source, status, risk_level, approval_status,
          skipped_occurrence_count, linked_agent_run_id, summary, failure_message, failure_category,
          prompt_chars, prompt_hash, transcript_chars, latest_task_chars,
          controller_instance_id, controller_lease_id, controller_lease_expires_at, resume_attempt_count,
          last_heartbeat_at, heartbeat_stage, heartbeat_detail, timed_out_at, queued_at, started_at,
          completed_at, created_at, updated_at
         FROM background_job_runs
         WHERE assistant_id = ?1 AND status IN ('queued', 'awaiting-approval', 'awaiting-user-input', 'running')
         ORDER BY updated_at DESC, created_at DESC`
      )
      .all(assistantId)
      .map((row) => this.hydrateBackgroundJobRun(row))
      .filter((run): run is BackgroundJobRun => run !== undefined);
  }

  getRecentSuccessfulBackgroundJobRunDurationsMs(jobId: string, limit = 10) {
    return this.db
      .query<{ started_at: string | null; completed_at: string | null }, [string, number]>(
        `SELECT started_at, completed_at
         FROM background_job_runs
         WHERE job_id = ?1 AND status = 'succeeded' AND started_at IS NOT NULL AND completed_at IS NOT NULL
         ORDER BY completed_at DESC
         LIMIT ?2`
      )
      .all(jobId, limit)
      .map((row) => {
        const startedAt = Date.parse(row.started_at ?? "");
        const completedAt = Date.parse(row.completed_at ?? "");
        return Number.isFinite(startedAt) && Number.isFinite(completedAt) ? Math.max(0, completedAt - startedAt) : undefined;
      })
      .filter((duration): duration is number => duration !== undefined);
  }

  repairInterruptedBackgroundJobRuns(
    options: {
      jobId?: string;
      isRunLive?: (run: BackgroundJobRun) => boolean;
      now?: Date;
      readyGraceMs?: number;
      maxRunMs?: number;
      noProgressMs?: number;
    } = {}
  ) {
    const now = options.now ?? new Date();
    const readyGraceMs = options.readyGraceMs ?? 2 * 60 * 1000;
    const maxRunMs = options.maxRunMs ?? 30 * 60 * 1000;
    const noProgressMs = options.noProgressMs ?? 10 * 60 * 1000;
    const repairedRuns: BackgroundJobRun[] = [];
    for (const run of this.getActiveBackgroundJobRuns(options.jobId)) {
      if (run.linkedAgentRunId) {
        const linkedRun = this.getRun(run.projectId, run.linkedAgentRunId);
        const terminalStatus = linkedRun ? mapAgentRunStatusToBackgroundRunStatus(linkedRun.status) : undefined;
        if (terminalStatus) {
          const failureMessage =
            terminalStatus === "succeeded"
              ? undefined
              : linkedRun?.failureMessage ?? `Linked agent run ended with status ${linkedRun?.status ?? "missing"}`;
          const repairedRun = this.setBackgroundJobRunStatus(run.id, terminalStatus, {
            summary: linkedRun?.summary,
            failureMessage,
            failureCategory:
              terminalStatus === "failed"
                ? classifyRunFailure({
                    explicitCategory: linkedRun?.failureCategory,
                    message: failureMessage
                  })
                : undefined
          });
          this.appendBackgroundJobRunEvent(
            run.id,
            terminalStatus === "succeeded" ? "done" : "failed",
            "Reconciled linked agent run",
            failureMessage ?? linkedRun?.summary
          );
          repairedRuns.push(this.getBackgroundJobRun(repairedRun.id) ?? repairedRun);
          continue;
        }
        if (
          linkedRun?.status === "ready" &&
          options.isRunLive &&
          !options.isRunLive(run) &&
          isBackgroundRunPastLeaseGrace(run, now, readyGraceMs)
        ) {
          const failureMessage = "Linked agent run was ready but no background controller resumed execution";
          const repairedRun = this.setBackgroundJobRunStatus(run.id, "failed", {
            summary: linkedRun.summary,
            failureMessage,
            failureCategory: "controller-lost"
          });
          this.appendBackgroundJobRunEvent(run.id, "failed", "Background run repaired: no live controller", failureMessage);
          repairedRuns.push(this.getBackgroundJobRun(repairedRun.id) ?? repairedRun);
          continue;
        }
      }

      if (
        run.status === "running" &&
        options.isRunLive &&
        !options.isRunLive(run) &&
        isBackgroundRunPastLeaseGrace(run, now, readyGraceMs)
      ) {
        const repairedRun = this.setBackgroundJobRunStatus(run.id, "failed", {
          failureMessage: "Background run interrupted before completion",
          failureCategory: "controller-lost"
        });
        this.appendBackgroundJobRunEvent(
          run.id,
          "failed",
          "Background run repaired: no live controller",
          "No live background controller owns this running row."
        );
        repairedRuns.push(this.getBackgroundJobRun(repairedRun.id) ?? repairedRun);
        continue;
      }

      if (run.status === "running" && getBackgroundRunAgeMs(run, now) >= maxRunMs) {
        const detail = formatBackgroundRunTimeoutDetail(run, now, "max runtime");
        const repairedRun = this.setBackgroundJobRunStatus(run.id, "failed", {
          failureMessage: "Timed out: background run exceeded max runtime",
          failureCategory: "max-runtime-timeout",
          timedOutAt: now.toISOString()
        });
        this.appendBackgroundJobRunEvent(run.id, "failed", "Background run timed out", detail);
        repairedRuns.push(this.getBackgroundJobRun(repairedRun.id) ?? repairedRun);
        continue;
      }

      if (run.status === "running" && getBackgroundRunLastProgressAgeMs(run, now) >= noProgressMs) {
        const detail = formatBackgroundRunTimeoutDetail(run, now, "no progress heartbeat");
        const repairedRun = this.setBackgroundJobRunStatus(run.id, "failed", {
          failureMessage: "Timed out: no background progress heartbeat",
          failureCategory: "heartbeat-timeout",
          timedOutAt: now.toISOString()
        });
        this.appendBackgroundJobRunEvent(run.id, "failed", "Background run timed out", detail);
        repairedRuns.push(this.getBackgroundJobRun(repairedRun.id) ?? repairedRun);
      }
    }
    return repairedRuns;
  }

  repairStaleRunningBackgroundJobRuns(
    options: {
      jobId?: string;
      isRunLive?: (run: BackgroundJobRun) => boolean;
      now?: Date;
      readyGraceMs?: number;
      maxRunMs?: number;
      noProgressMs?: number;
    } = {}
  ) {
    return this.repairInterruptedBackgroundJobRuns(options);
  }

  createBackgroundJobRun(
    input: Pick<
      BackgroundJobRun,
      "jobId" | "projectId" | "assistantId" | "automationThreadId" | "triggerSource" | "status" | "riskLevel" | "approvalStatus"
    > & {
      skippedOccurrenceCount?: number;
    }
  ) {
    const job = this.repairBackgroundJobReferences(input.jobId);
    if (!job || job.status === "disabled") {
      throw new Error(`Background job ${input.jobId} cannot be queued`);
    }
    const now = new Date().toISOString();
    const runId = createBackgroundJobRunId();
    this.db
      .query(
        `INSERT INTO background_job_runs (
          id, job_id, project_id, assistant_id, automation_thread_id, trigger_source, status, risk_level, approval_status,
          skipped_occurrence_count, linked_agent_run_id, summary, failure_message, failure_category,
          prompt_chars, prompt_hash, transcript_chars, latest_task_chars,
          controller_instance_id, controller_lease_id, controller_lease_expires_at, resume_attempt_count,
          last_heartbeat_at, heartbeat_stage, heartbeat_detail, timed_out_at, queued_at, started_at, completed_at, created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0, ?11, 'queued', NULL, NULL, ?11, NULL, NULL, ?11, ?11)`
      )
      .run(
        runId,
        input.jobId,
        job.projectId,
        job.assistantId ?? null,
        job.automationThreadId,
        input.triggerSource,
        input.status,
        input.riskLevel,
        input.approvalStatus,
        input.skippedOccurrenceCount ?? 0,
        now
      );
    this.db
      .query(`UPDATE background_jobs SET last_enqueued_at = ?2, updated_at = ?2 WHERE id = ?1`)
      .run(input.jobId, now);
    return this.getBackgroundJobRun(runId)!;
  }

  appendBackgroundJobRunEvent(runId: string, stage: string, message: string, detail?: string) {
    const now = new Date().toISOString();
    const ordinal =
      (this.db
        .query<{ count: number }, [string]>(`SELECT COUNT(*) AS count FROM background_job_run_events WHERE run_id = ?1`)
        .get(runId)?.count ?? 0) + 1;
    this.db
      .query(
        `INSERT INTO background_job_run_events (id, run_id, ordinal, stage, message, detail_json, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
      )
      .run(crypto.randomUUID(), runId, ordinal, stage, message, detail ?? null, now);
    this.db
      .query(
        `UPDATE background_job_runs
         SET last_heartbeat_at = ?2,
             heartbeat_stage = ?3,
             heartbeat_detail = ?4,
             updated_at = ?2
         WHERE id = ?1`
      )
      .run(runId, now, stage, (detail ?? message).slice(0, 1024));
    return this.getBackgroundJobRun(runId)!;
  }

  touchBackgroundJobRun(runId: string, input: { stage: string; detail?: string; now?: Date }) {
    const now = (input.now ?? new Date()).toISOString();
    this.db
      .query(
        `UPDATE background_job_runs
         SET last_heartbeat_at = ?2,
             heartbeat_stage = ?3,
             heartbeat_detail = ?4,
             updated_at = ?2
         WHERE id = ?1`
      )
      .run(runId, now, input.stage, input.detail ? input.detail.slice(0, 1024) : null);
    return this.getBackgroundJobRun(runId);
  }

  renewBackgroundJobRunLease(runId: string, controllerLeaseId: string, expiresAt: string) {
    this.db
      .query(
        `UPDATE background_job_runs
         SET controller_lease_expires_at = ?3
         WHERE id = ?1
           AND status = 'running'
           AND controller_lease_id = ?2`
      )
      .run(runId, controllerLeaseId, expiresAt);
    return this.getBackgroundJobRun(runId);
  }

  setBackgroundJobRunStatus(
    runId: string,
    status: BackgroundJobRunStatus,
    input: {
      summary?: string;
      failureMessage?: string;
      failureCategory?: RunFailureCategory;
      linkedAgentRunId?: string;
      approvalStatus?: BackgroundJobRun["approvalStatus"];
      timedOutAt?: string;
      controllerInstanceId?: string | null;
      controllerLeaseId?: string | null;
      controllerLeaseExpiresAt?: string | null;
      resumeAttemptCount?: number;
    } = {}
  ) {
    const now = new Date().toISOString();
    this.db
      .query(
        `UPDATE background_job_runs
         SET status = ?2,
             summary = COALESCE(?3, summary),
             failure_message = ?4,
             failure_category = ?5,
             linked_agent_run_id = COALESCE(?6, linked_agent_run_id),
             approval_status = COALESCE(?7, approval_status),
             started_at = CASE WHEN ?2 = 'running' AND started_at IS NULL THEN ?8 ELSE started_at END,
             completed_at = CASE WHEN ?2 IN ('succeeded', 'failed', 'cancelled', 'skipped') THEN ?8 ELSE completed_at END,
             last_heartbeat_at = ?8,
             heartbeat_stage = ?2,
             heartbeat_detail = COALESCE(?9, ?3, heartbeat_detail),
             timed_out_at = COALESCE(?10, timed_out_at),
             controller_instance_id = COALESCE(?11, controller_instance_id),
             controller_lease_id = COALESCE(?12, controller_lease_id),
             controller_lease_expires_at = CASE WHEN ?13 = 1 THEN ?14 ELSE controller_lease_expires_at END,
             resume_attempt_count = COALESCE(?15, resume_attempt_count),
             updated_at = ?8
         WHERE id = ?1`
      )
      .run(
        runId,
        status,
        input.summary ?? null,
        input.failureMessage ?? null,
        input.failureCategory ?? null,
        input.linkedAgentRunId ?? null,
        input.approvalStatus ?? null,
        now,
        input.failureMessage ?? null,
        input.timedOutAt ?? null,
        input.controllerInstanceId ?? null,
        input.controllerLeaseId ?? null,
        input.controllerLeaseExpiresAt !== undefined ? 1 : 0,
        input.controllerLeaseExpiresAt ?? null,
        input.resumeAttemptCount ?? null
      );
    return this.getBackgroundJobRun(runId)!;
  }

  setBackgroundJobRunPromptStats(runId: string, promptStats: RunPromptStats) {
    const now = new Date().toISOString();
    this.db
      .query(
        `UPDATE background_job_runs
         SET prompt_chars = ?2,
             prompt_hash = ?3,
             transcript_chars = ?4,
             latest_task_chars = ?5,
             updated_at = ?6
         WHERE id = ?1`
      )
      .run(
        runId,
        promptStats.promptChars,
        promptStats.promptHash,
        promptStats.transcriptChars ?? null,
        promptStats.latestTaskChars ?? null,
        now
      );
    return this.getBackgroundJobRun(runId)!;
  }

  promoteDeferredBrowserApprovals() {
    const promoted = new Map<string, { projectId: ProjectId; threadId: ThreadId; runId: string }>();
    const rows = this.db
      .query<{ id: string; project_id: string; thread_id: string; browser_sessions_json: string | null }, []>(
        `SELECT id, project_id, thread_id, browser_sessions_json
         FROM agent_runs
         WHERE browser_sessions_json IS NOT NULL`
      )
      .all();

    for (const row of rows) {
      const sessions = parseBrowserSessions(row.browser_sessions_json) ?? [];
      let changed = false;
      const nextSessions = sessions.map((session) => {
        const nextActivities = session.activities.map((activity) => {
          if (activity.approval?.status !== "deferred") {
            return activity;
          }

          changed = true;
          return {
            ...activity,
            approval: {
              ...activity.approval,
              status: "pending"
            }
          };
        });
        const pendingApproval = nextActivities.find((activity) => activity.approval?.status === "pending")?.approval;
        return {
          ...session,
          pendingApproval,
          status: pendingApproval ? "awaiting-approval" : session.status,
          activities: nextActivities
        };
      });

      if (!changed) {
        continue;
      }

      this.db
        .query(`UPDATE agent_runs SET browser_sessions_json = ?2 WHERE id = ?1`)
        .run(row.id, JSON.stringify(nextSessions));
      promoted.set(row.id, {
        projectId: row.project_id as ProjectId,
        threadId: row.thread_id as ThreadId,
        runId: row.id
      });
    }

    return [...promoted.values()];
  }

  updateBackgroundJobSchedule(
    jobId: string,
    input: { schedule?: BackgroundJobSchedule; nextRunAt?: string; lastRunAt?: string }
  ) {
    const now = new Date().toISOString();
    const serializedSchedule = input.schedule ? JSON.stringify(input.schedule) : null;
    const shouldUpdateNextRunAt = Object.hasOwn(input, "nextRunAt");
    this.db
      .query(
        `UPDATE background_jobs
         SET schedule_json = CASE WHEN ?2 IS NULL THEN schedule_json ELSE ?2 END,
             next_run_at = CASE WHEN ?3 = 0 THEN next_run_at ELSE ?4 END,
             last_run_at = COALESCE(?5, last_run_at),
             updated_at = ?6
         WHERE id = ?1`
      )
      .run(jobId, serializedSchedule, shouldUpdateNextRunAt ? 1 : 0, input.nextRunAt ?? null, input.lastRunAt ?? null, now);
    return this.getBackgroundJob(jobId)!;
  }

  getStoredOpenAiApiKey() {
    return this.getWorkspaceMetaValue(OPENAI_API_KEY);
  }

  getStoredGoogleApiKey() {
    return this.getWorkspaceMetaValue(GOOGLE_API_KEY);
  }

  getStoredAnthropicApiKey() {
    return this.getWorkspaceMetaValue(ANTHROPIC_API_KEY);
  }

  setStoredOpenAiApiKey(apiKey: string) {
    const normalizedKey = apiKey.trim();
    if (!normalizedKey) {
      throw new Error("OpenAI API key is required");
    }

    this.setWorkspaceMetaValue(OPENAI_API_KEY, normalizedKey);
  }

  clearStoredOpenAiApiKey() {
    this.deleteWorkspaceMetaValue(OPENAI_API_KEY);
  }

  setStoredGoogleApiKey(apiKey: string) {
    const normalizedKey = apiKey.trim();
    if (!normalizedKey) {
      throw new Error("Google API key is required");
    }

    this.setWorkspaceMetaValue(GOOGLE_API_KEY, normalizedKey);
  }

  clearStoredGoogleApiKey() {
    this.deleteWorkspaceMetaValue(GOOGLE_API_KEY);
  }

  setStoredAnthropicApiKey(apiKey: string) {
    const normalizedKey = apiKey.trim();
    if (!normalizedKey) {
      throw new Error("Anthropic API key is required");
    }

    this.setWorkspaceMetaValue(ANTHROPIC_API_KEY, normalizedKey);
  }

  clearStoredAnthropicApiKey() {
    this.deleteWorkspaceMetaValue(ANTHROPIC_API_KEY);
  }

  getGeminiCachedContent(input: { projectId: ProjectId; modelId: string; attachmentSetHash: string }) {
    const row = this.db
      .query<GeminiCachedContentRow, [string, string, string]>(
        `SELECT project_id, model_id, attachment_set_hash, cached_content_name, expires_at, created_at, updated_at
         FROM gemini_cached_contents
         WHERE project_id = ?1 AND model_id = ?2 AND attachment_set_hash = ?3`
      )
      .get(input.projectId, input.modelId, input.attachmentSetHash);
    return row ? mapGeminiCachedContentRow(row) : undefined;
  }

  saveGeminiCachedContent(input: {
    projectId: ProjectId;
    modelId: string;
    attachmentSetHash: string;
    cachedContentName: string;
    expiresAt: string;
    now: string;
  }) {
    this.db
      .query(
        `INSERT INTO gemini_cached_contents (
           project_id, model_id, attachment_set_hash, cached_content_name, expires_at, created_at, updated_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
         ON CONFLICT(project_id, model_id, attachment_set_hash) DO UPDATE SET
           cached_content_name = excluded.cached_content_name,
           expires_at = excluded.expires_at,
           updated_at = excluded.updated_at`
      )
      .run(input.projectId, input.modelId, input.attachmentSetHash, input.cachedContentName, input.expiresAt, input.now);
    return this.getGeminiCachedContent(input)!;
  }

  getProviderBrand() {
    const value = this.getWorkspaceMetaValue(PROVIDER_BRAND_KEY);
    if (value === "gemini" || value === "claude") {
      return value;
    }
    return "gpt";
  }

  setProviderBrand(providerBrand: ProviderBrand) {
    this.setWorkspaceMetaValue(PROVIDER_BRAND_KEY, providerBrand);
  }

  getDebugEnabledDefault() {
    return this.getWorkspaceMetaValue(DEBUG_ENABLED_KEY) === "true";
  }

  setDebugEnabledDefault(debugEnabled: boolean) {
    this.setWorkspaceMetaValue(DEBUG_ENABLED_KEY, String(debugEnabled));
  }

  getTracePanelDefaultOpen() {
    const value = this.getWorkspaceMetaValue(TRACE_PANEL_DEFAULT_OPEN_KEY);
    return value === undefined ? true : value === "true";
  }

  setTracePanelDefaultOpen(tracePanelDefaultOpen: boolean) {
    this.setWorkspaceMetaValue(TRACE_PANEL_DEFAULT_OPEN_KEY, String(tracePanelDefaultOpen));
  }

  getSubagentWorktreeStrategyDefault(): SubagentWorktreeStrategy {
    return this.getWorkspaceMetaValue(SUBAGENT_WORKTREE_STRATEGY_DEFAULT_KEY) === "separate-worktrees"
      ? "separate-worktrees"
      : "same-worktree";
  }

  setSubagentWorktreeStrategyDefault(value: SubagentWorktreeStrategy) {
    this.setWorkspaceMetaValue(SUBAGENT_WORKTREE_STRATEGY_DEFAULT_KEY, value);
  }

  getBlockChatOnDirtyGitDefault() {
    const value = this.getWorkspaceMetaValue(BLOCK_CHAT_ON_DIRTY_GIT_DEFAULT_KEY);
    return value === undefined ? true : value === "true";
  }

  setBlockChatOnDirtyGitDefault(value: boolean) {
    this.setWorkspaceMetaValue(BLOCK_CHAT_ON_DIRTY_GIT_DEFAULT_KEY, String(value));
  }

  getDirtyGitChangeLimitDefault() {
    const value = Number(this.getWorkspaceMetaValue(DIRTY_GIT_CHANGE_LIMIT_DEFAULT_KEY));
    return Number.isFinite(value) && value >= 0 ? Math.min(10000, Math.round(value)) : 20;
  }

  setDirtyGitChangeLimitDefault(value: number) {
    this.setWorkspaceMetaValue(DIRTY_GIT_CHANGE_LIMIT_DEFAULT_KEY, String(Math.max(0, Math.min(10000, Math.round(value)))));
  }

  getAutoCompactContextThresholdPercentDefault() {
    const value = Number(this.getWorkspaceMetaValue(AUTO_COMPACT_CONTEXT_THRESHOLD_PERCENT_DEFAULT_KEY));
    return Number.isFinite(value) ? Math.max(10, Math.min(95, Math.round(value))) : 40;
  }

  setAutoCompactContextThresholdPercentDefault(value: number) {
    this.setWorkspaceMetaValue(
      AUTO_COMPACT_CONTEXT_THRESHOLD_PERCENT_DEFAULT_KEY,
      String(Math.max(10, Math.min(95, Math.round(value))))
    );
  }

  getPlanExecutionModeDefault(): PlanExecutionMode {
    const value = this.getWorkspaceMetaValue(PLAN_EXECUTION_MODE_DEFAULT_KEY);
    return value === "approve" || value === "immediate" ? value : "countdown";
  }

  setPlanExecutionModeDefault(value: PlanExecutionMode) {
    this.setWorkspaceMetaValue(PLAN_EXECUTION_MODE_DEFAULT_KEY, value);
  }

  getPlanExecutionDelaySecondsDefault() {
    const value = Number(this.getWorkspaceMetaValue(PLAN_EXECUTION_DELAY_SECONDS_DEFAULT_KEY));
    return Number.isFinite(value) && value >= 0 ? Math.min(300, Math.round(value)) : 10;
  }

  setPlanExecutionDelaySecondsDefault(value: number) {
    this.setWorkspaceMetaValue(PLAN_EXECUTION_DELAY_SECONDS_DEFAULT_KEY, String(Math.max(0, Math.min(300, Math.round(value)))));
  }

  getCorrectnessIterationModeDefault(): CorrectnessIterationMode {
    const value = this.getWorkspaceMetaValue(CORRECTNESS_ITERATION_MODE_DEFAULT_KEY);
    if (value === "auto-once" || value === "auto-until-clean") {
      return value;
    }

    return "ask-before-iterate";
  }

  setCorrectnessIterationModeDefault(value: CorrectnessIterationMode) {
    this.setWorkspaceMetaValue(CORRECTNESS_ITERATION_MODE_DEFAULT_KEY, value);
  }

  getBackgroundJobApprovalPolicyDefault(): BackgroundJobApprovalPolicy {
    const value = this.getWorkspaceMetaValue(BACKGROUND_JOB_APPROVAL_POLICY_DEFAULT_KEY);
    if (value === "allow-all" || value === "allow-safe" || value === "ask-risky") {
      return value;
    }

    return "always-ask";
  }

  setBackgroundJobApprovalPolicyDefault(value: BackgroundJobApprovalPolicy) {
    this.setWorkspaceMetaValue(BACKGROUND_JOB_APPROVAL_POLICY_DEFAULT_KEY, value);
  }

  getAutoArchiveCompletedThreadsDefault() {
    return this.getWorkspaceMetaValue(AUTO_ARCHIVE_COMPLETED_THREADS_DEFAULT_KEY) === "true";
  }

  setAutoArchiveCompletedThreadsDefault(value: boolean) {
    this.setWorkspaceMetaValue(AUTO_ARCHIVE_COMPLETED_THREADS_DEFAULT_KEY, String(value));
  }

  getMemoryBankEnabledDefault() {
    const value = this.getWorkspaceMetaValue(MEMORY_BANK_ENABLED_DEFAULT_KEY);
    return value === undefined ? true : value === "true";
  }

  setMemoryBankEnabledDefault(value: boolean) {
    this.setWorkspaceMetaValue(MEMORY_BANK_ENABLED_DEFAULT_KEY, String(value));
  }

  getMemoryBankRecordRunsDefault() {
    const value = this.getWorkspaceMetaValue(MEMORY_BANK_RECORD_RUNS_DEFAULT_KEY);
    return value === undefined ? true : value === "true";
  }

  setMemoryBankRecordRunsDefault(value: boolean) {
    this.setWorkspaceMetaValue(MEMORY_BANK_RECORD_RUNS_DEFAULT_KEY, String(value));
  }

  getGlobalExecutionPaused() {
    return this.getWorkspaceMetaValue(GLOBAL_EXECUTION_PAUSED_KEY) === "true";
  }

  setGlobalExecutionPaused(isPaused: boolean) {
    this.setWorkspaceMetaValue(GLOBAL_EXECUTION_PAUSED_KEY, String(isPaused));
  }

  getExecutionControlState(): ExecutionControlState {
    const deferredPlanningQuestionCount =
      this.db
        .query<{ count: number }, []>(`SELECT COUNT(*) AS count FROM agent_run_questions WHERE status = 'deferred'`)
        .get()?.count ?? 0;
    const deferredAssistantQuestionCount =
      this.db
        .query<{ count: number }, []>(`SELECT COUNT(*) AS count FROM assistant_questions WHERE status = 'deferred'`)
        .get()?.count ?? 0;
    const deferredBrowserApprovalCount =
      this.db
        .query<{ browser_sessions_json: string | null }, []>(
          `SELECT browser_sessions_json
           FROM agent_runs
           WHERE browser_sessions_json IS NOT NULL`
        )
        .all()
        .reduce(
          (count, row) =>
            count +
            (parseBrowserSessions(row.browser_sessions_json) ?? [])
              .flatMap((session) => session.activities)
              .filter((activity) => activity.approval?.status === "deferred").length,
          0
        );

    return {
      isPaused: this.getGlobalExecutionPaused(),
      deferredPlanningQuestionCount,
      deferredAssistantQuestionCount,
      deferredBrowserApprovalCount
    };
  }

  getWorkspaceRuleSource() {
    return this.readWorkspaceRuleSource();
  }

  saveWorkspaceContext(input: { rulesContent?: string; memorySummaryContent?: string }) {
    const now = new Date().toISOString();
    if (input.rulesContent?.trim()) {
      this.setWorkspaceMetaValue(WORKSPACE_RULES_CONTENT_KEY, input.rulesContent.trim());
      this.setWorkspaceMetaValue(WORKSPACE_RULES_UPDATED_AT_KEY, now);
    } else {
      this.deleteWorkspaceMetaValue(WORKSPACE_RULES_CONTENT_KEY);
      this.deleteWorkspaceMetaValue(WORKSPACE_RULES_UPDATED_AT_KEY);
    }

    if (input.memorySummaryContent?.trim()) {
      this.setWorkspaceMetaValue(WORKSPACE_MEMORY_CONTENT_KEY, input.memorySummaryContent.trim());
      this.setWorkspaceMetaValue(WORKSPACE_MEMORY_UPDATED_AT_KEY, now);
    } else {
      this.deleteWorkspaceMetaValue(WORKSPACE_MEMORY_CONTENT_KEY);
      this.deleteWorkspaceMetaValue(WORKSPACE_MEMORY_UPDATED_AT_KEY);
    }

    return this.loadWorkspace();
  }

  saveProjectContext(projectId: ProjectId, input: { rulesContent?: string; threadMemorySummaryContent?: string }) {
    this.assertProjectExists(projectId);
    const threadId = this.readActiveThreadRow(projectId).id as ThreadId;
    const now = new Date().toISOString();
    const tx = this.db.transaction(() => {
      this.db
        .query(`UPDATE projects SET rules_content = ?2, rules_updated_at = ?3 WHERE id = ?1`)
        .run(projectId, input.rulesContent?.trim() || null, input.rulesContent?.trim() ? now : null);
      this.db
        .query(`UPDATE project_threads SET memory_summary_content = ?3, memory_summary_updated_at = ?4 WHERE project_id = ?1 AND id = ?2`)
        .run(projectId, threadId, input.threadMemorySummaryContent?.trim() || null, input.threadMemorySummaryContent?.trim() ? now : null);
      this.touchProject(projectId, now);
    });
    tx();

    return this.readProjectSnapshot(projectId);
  }

  setProjectSelectedMode(projectId: ProjectId, modeId: string) {
    this.assertProjectExists(projectId);
    const now = new Date().toISOString();
    this.db.query(`UPDATE projects SET selected_mode_id = ?2, updated_at = ?3 WHERE id = ?1`).run(projectId, modeId, now);
    return this.readProjectSnapshot(projectId);
  }

  saveMode(scope: "workspace" | "project", mode: Omit<ModeDefinition, "scope"> & { scope: "workspace" | "project" }, projectId?: ProjectId) {
    const now = new Date().toISOString();
    if (scope === "workspace") {
      this.db
        .query(
          `INSERT INTO workspace_modes (
            id, label, description, planner_prompt, execution_prompt, tool_policy, execution_access,
            plan_execution_mode_default, subagent_worktree_strategy_default, correctness_iteration_mode_default, updated_at
          ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
          ON CONFLICT(id) DO UPDATE SET
            label = excluded.label,
            description = excluded.description,
            planner_prompt = excluded.planner_prompt,
            execution_prompt = excluded.execution_prompt,
            tool_policy = excluded.tool_policy,
            execution_access = excluded.execution_access,
            plan_execution_mode_default = excluded.plan_execution_mode_default,
            subagent_worktree_strategy_default = excluded.subagent_worktree_strategy_default,
            correctness_iteration_mode_default = excluded.correctness_iteration_mode_default,
            updated_at = excluded.updated_at`
        )
        .run(
          mode.id,
          mode.label,
          mode.description,
          mode.plannerPrompt,
          mode.executionPrompt,
          mode.toolPolicy,
          mode.executionAccess,
          mode.planExecutionModeDefault ?? null,
          mode.subagentWorktreeStrategyDefault ?? null,
          mode.correctnessIterationModeDefault ?? null,
          now
        );
      return this.loadWorkspace();
    }

    if (!projectId) {
      throw new Error("projectId is required for project mode save");
    }

    this.assertProjectExists(projectId);
    this.db
      .query(
        `INSERT INTO project_modes (
          project_id, id, label, description, planner_prompt, execution_prompt, tool_policy, execution_access,
          plan_execution_mode_default, subagent_worktree_strategy_default, correctness_iteration_mode_default, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
        ON CONFLICT(project_id, id) DO UPDATE SET
          label = excluded.label,
          description = excluded.description,
          planner_prompt = excluded.planner_prompt,
          execution_prompt = excluded.execution_prompt,
          tool_policy = excluded.tool_policy,
          execution_access = excluded.execution_access,
          plan_execution_mode_default = excluded.plan_execution_mode_default,
          subagent_worktree_strategy_default = excluded.subagent_worktree_strategy_default,
          correctness_iteration_mode_default = excluded.correctness_iteration_mode_default,
          updated_at = excluded.updated_at`
      )
      .run(
        projectId,
        mode.id,
        mode.label,
        mode.description,
        mode.plannerPrompt,
        mode.executionPrompt,
        mode.toolPolicy,
        mode.executionAccess,
        mode.planExecutionModeDefault ?? null,
        mode.subagentWorktreeStrategyDefault ?? null,
        mode.correctnessIterationModeDefault ?? null,
        now
      );
    this.touchProject(projectId, now);
    return this.readProjectSnapshot(projectId);
  }

  deleteMode(scope: "workspace" | "project", modeId: string, projectId?: ProjectId) {
    if (scope === "workspace") {
      this.db.query(`DELETE FROM workspace_modes WHERE id = ?1`).run(modeId);
      return this.loadWorkspace();
    }

    if (!projectId) {
      throw new Error("projectId is required for project mode delete");
    }

    this.assertProjectExists(projectId);
    this.db.query(`DELETE FROM project_modes WHERE project_id = ?1 AND id = ?2`).run(projectId, modeId);
    const now = new Date().toISOString();
    this.db.query(`UPDATE projects SET selected_mode_id = CASE WHEN selected_mode_id = ?2 THEN 'implement' ELSE selected_mode_id END, updated_at = ?3 WHERE id = ?1`).run(projectId, modeId, now);
    this.touchProject(projectId, now);
    return this.readProjectSnapshot(projectId);
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        root_path TEXT NOT NULL UNIQUE,
        active_thread_id TEXT NULL,
        selected_mode_id TEXT NULL,
        rules_content TEXT NULL,
        rules_updated_at TEXT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_opened_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS workspace_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS project_threads (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('active', 'archived')),
        kind TEXT NOT NULL DEFAULT 'user' CHECK(kind IN ('user', 'automation')),
        title TEXT NULL,
        title_source TEXT NULL,
        updated_at TEXT NULL,
        forked_from_thread_id TEXT NULL,
        memory_summary_content TEXT NULL,
        memory_summary_updated_at TEXT NULL,
        created_at TEXT NOT NULL,
        archived_at TEXT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS project_threads_project_status_idx
      ON project_threads(project_id, status);

      CREATE INDEX IF NOT EXISTS project_threads_project_updated_idx
      ON project_threads(project_id, updated_at DESC, created_at DESC);

      CREATE TABLE IF NOT EXISTS thread_messages (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('system', 'user', 'assistant')),
        kind TEXT NOT NULL DEFAULT 'plain' CHECK(kind IN ('plain', 'plan-summary', 'run-milestones')),
        content TEXT NOT NULL,
        attachments_json TEXT NULL,
        metadata_json TEXT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(thread_id) REFERENCES project_threads(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS thread_messages_thread_created_idx
      ON thread_messages(thread_id, created_at);

      CREATE TABLE IF NOT EXISTS chat_attachment_uploads (
        key TEXT PRIMARY KEY,
        project_id TEXT NULL,
        thread_id TEXT NULL,
        attachment_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS gemini_cached_contents (
        project_id TEXT NOT NULL,
        model_id TEXT NOT NULL,
        attachment_set_hash TEXT NOT NULL,
        cached_content_name TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(project_id, model_id, attachment_set_hash),
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS gemini_cached_contents_expiry_idx
      ON gemini_cached_contents(expires_at);

      CREATE TABLE IF NOT EXISTS agent_runs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        thread_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN (
          'planning',
          'awaiting-user-input',
          'ready',
          'running-main',
          'running-subagents',
          'aggregating',
          'partial-complete',
          'completed',
          'stopped',
          'failed'
        )),
        execution_target TEXT NULL CHECK(execution_target IN ('current-project', 'ephemeral-experiment')),
        latest_user_prompt TEXT NOT NULL,
        prompt_chars INTEGER NULL,
        prompt_hash TEXT NULL,
        transcript_chars INTEGER NULL,
        latest_task_chars INTEGER NULL,
        planning_model_id TEXT NULL,
        execution_model_id TEXT NULL,
        difficulty_score INTEGER NULL,
        summary TEXT NULL,
        final_execution_brief TEXT NULL,
        failure_message TEXT NULL,
        failure_category TEXT NULL,
        max_turns INTEGER NULL,
        turns_used INTEGER NOT NULL DEFAULT 0,
        plan_json TEXT NULL,
        correctness_review_json TEXT NULL,
        browser_sessions_json TEXT NULL,
        tool_activities_json TEXT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY(thread_id) REFERENCES project_threads(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS agent_runs_project_thread_updated_idx
      ON agent_runs(project_id, thread_id, updated_at DESC);

      CREATE TABLE IF NOT EXISTS agent_run_questions (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        ordinal INTEGER NOT NULL,
        logical_question_id TEXT NULL,
        planner_turn_id TEXT NULL,
        prompt_hash TEXT NULL,
        prompt TEXT NOT NULL,
        placeholder TEXT NULL,
        response_kind TEXT NOT NULL DEFAULT 'choice' CHECK(response_kind IN ('choice', 'freeform')),
        choices_json TEXT NULL,
        intent_json TEXT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending', 'deferred', 'answered')),
        answer_text TEXT NULL,
        asked_at TEXT NOT NULL,
        answered_at TEXT NULL,
        FOREIGN KEY(run_id) REFERENCES agent_runs(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS agent_run_questions_run_ordinal_idx
      ON agent_run_questions(run_id, ordinal ASC);

      CREATE UNIQUE INDEX IF NOT EXISTS agent_run_questions_run_turn_logical_idx
      ON agent_run_questions(run_id, planner_turn_id, logical_question_id);

      CREATE UNIQUE INDEX IF NOT EXISTS agent_run_questions_run_turn_prompt_idx
      ON agent_run_questions(run_id, planner_turn_id, prompt_hash);

      CREATE TABLE IF NOT EXISTS agent_run_subtasks (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        planner_task_id TEXT NOT NULL,
        title TEXT NOT NULL,
        instruction TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending', 'running', 'completed', 'failed')),
        attempt_count INTEGER NOT NULL DEFAULT 0,
        output TEXT NULL,
        error_message TEXT NULL,
        commit_sha TEXT NULL,
        worktree_path TEXT NULL,
        started_at TEXT NULL,
        completed_at TEXT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(run_id) REFERENCES agent_runs(id) ON DELETE CASCADE
      );

      CREATE UNIQUE INDEX IF NOT EXISTS agent_run_subtasks_run_planner_task_idx
      ON agent_run_subtasks(run_id, planner_task_id);

      CREATE TABLE IF NOT EXISTS agent_run_experiments (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL CHECK(status IN ('prepared', 'running', 'completed', 'partial-complete', 'failed', 'promoted', 'discarded')),
        virtual_branch_name TEXT NOT NULL,
        repo_mount_path TEXT NOT NULL,
        project_mount_path TEXT NOT NULL,
        base_commit_sha TEXT NULL,
        base_branch_name TEXT NULL,
        base_dirty_fingerprint TEXT NOT NULL,
        head_commit_sha TEXT NULL,
        files_changed INTEGER NOT NULL DEFAULT 0,
        insertions INTEGER NOT NULL DEFAULT 0,
        deletions INTEGER NOT NULL DEFAULT 0,
        promoted_at TEXT NULL,
        discarded_at TEXT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(run_id) REFERENCES agent_runs(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS memory_entries (
        id TEXT PRIMARY KEY,
        project_id TEXT NULL,
        thread_id TEXT NULL,
        run_id TEXT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('repo-fact', 'task-summary', 'success-pattern', 'failure-pattern', 'verification-recipe', 'fallback-strategy', 'prompt-fragment', 'user-correction')),
        status TEXT NOT NULL CHECK(status IN ('active', 'archived')),
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        evidence TEXT NULL,
        tags_json TEXT NULL,
        path_globs_json TEXT NULL,
        confidence TEXT NOT NULL CHECK(confidence IN ('low', 'medium', 'high')),
        pinned INTEGER NOT NULL DEFAULT 0,
        priority INTEGER NOT NULL DEFAULT 50000,
        hit_count INTEGER NOT NULL DEFAULT 0,
        last_hit_at TEXT NULL,
        source_commit_sha TEXT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY(thread_id) REFERENCES project_threads(id) ON DELETE CASCADE,
        FOREIGN KEY(run_id) REFERENCES agent_runs(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS memory_retrievals (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        owner TEXT NOT NULL CHECK(owner IN ('planner', 'main', 'subagent')),
        subagent_id TEXT NULL,
        query_text TEXT NOT NULL,
        entry_ids_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(run_id) REFERENCES agent_runs(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS workspace_modes (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        description TEXT NOT NULL,
        planner_prompt TEXT NOT NULL,
        execution_prompt TEXT NOT NULL,
        tool_policy TEXT NOT NULL CHECK(tool_policy IN ('full-access', 'read-heavy', 'review-only')),
        execution_access TEXT NOT NULL CHECK(execution_access IN ('workspace-write', 'read-only')),
        plan_execution_mode_default TEXT NULL,
        subagent_worktree_strategy_default TEXT NULL,
        correctness_iteration_mode_default TEXT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS project_modes (
        project_id TEXT NOT NULL,
        id TEXT NOT NULL,
        label TEXT NOT NULL,
        description TEXT NOT NULL,
        planner_prompt TEXT NOT NULL,
        execution_prompt TEXT NOT NULL,
        tool_policy TEXT NOT NULL CHECK(tool_policy IN ('full-access', 'read-heavy', 'review-only')),
        execution_access TEXT NOT NULL CHECK(execution_access IN ('workspace-write', 'read-only')),
        plan_execution_mode_default TEXT NULL,
        subagent_worktree_strategy_default TEXT NULL,
        correctness_iteration_mode_default TEXT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (project_id, id),
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS background_jobs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        assistant_id TEXT NULL,
        automation_thread_id TEXT NOT NULL,
        template_id TEXT NULL,
        created_from_run_id TEXT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('ai-routine', 'shell')),
        name TEXT NOT NULL,
        description TEXT NULL,
        definition_json TEXT NOT NULL,
        schedule_json TEXT NOT NULL,
        schedule_input TEXT NOT NULL,
        timezone TEXT NULL,
        status TEXT NOT NULL CHECK(status IN ('enabled', 'paused', 'disabled')),
        risk_level TEXT NOT NULL CHECK(risk_level IN ('safe', 'slightly-unsafe', 'unsafe')),
        next_run_at TEXT NULL,
        last_run_at TEXT NULL,
        last_enqueued_at TEXT NULL,
        scheduler_status TEXT NULL CHECK(scheduler_status IN ('idle', 'due', 'queued', 'blocked', 'running', 'stale')),
        scheduler_detail TEXT NULL,
        scheduler_queue_position INTEGER NULL,
        scheduler_queue_reason TEXT NULL,
        scheduler_blocked_since_at TEXT NULL,
        scheduler_active_run_id TEXT NULL,
        scheduler_active_run_started_at TEXT NULL,
        scheduler_last_progress_at TEXT NULL,
        scheduler_overloaded INTEGER NULL CHECK(scheduler_overloaded IN (0, 1)),
        consecutive_failure_count INTEGER NULL,
        backoff_until TEXT NULL,
        last_failure_category TEXT NULL,
        last_scheduler_check_at TEXT NULL,
        last_blocked_at TEXT NULL,
        blocked_reason TEXT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY(assistant_id) REFERENCES assistants(id) ON DELETE CASCADE,
        FOREIGN KEY(automation_thread_id) REFERENCES project_threads(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS background_jobs_project_next_run_idx
      ON background_jobs(project_id, next_run_at ASC);

      CREATE TABLE IF NOT EXISTS background_job_runs (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        assistant_id TEXT NULL,
        automation_thread_id TEXT NOT NULL,
        trigger_source TEXT NOT NULL CHECK(trigger_source IN ('schedule', 'startup-catchup', 'manual', 'approval-release', 'retry')),
        status TEXT NOT NULL CHECK(status IN ('queued', 'awaiting-approval', 'awaiting-user-input', 'running', 'succeeded', 'failed', 'cancelled', 'skipped')),
        risk_level TEXT NOT NULL CHECK(risk_level IN ('safe', 'slightly-unsafe', 'unsafe')),
        approval_status TEXT NOT NULL CHECK(approval_status IN ('not-needed', 'pending', 'approved', 'rejected')),
        skipped_occurrence_count INTEGER NOT NULL DEFAULT 0,
        linked_agent_run_id TEXT NULL,
        summary TEXT NULL,
        failure_message TEXT NULL,
        failure_category TEXT NULL,
        prompt_chars INTEGER NULL,
        prompt_hash TEXT NULL,
        transcript_chars INTEGER NULL,
        latest_task_chars INTEGER NULL,
        controller_instance_id TEXT NULL,
        controller_lease_id TEXT NULL,
        controller_lease_expires_at TEXT NULL,
        resume_attempt_count INTEGER NULL,
        last_heartbeat_at TEXT NULL,
        heartbeat_stage TEXT NULL,
        heartbeat_detail TEXT NULL,
        timed_out_at TEXT NULL,
        queued_at TEXT NOT NULL,
        started_at TEXT NULL,
        completed_at TEXT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(job_id) REFERENCES background_jobs(id) ON DELETE CASCADE,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY(assistant_id) REFERENCES assistants(id) ON DELETE CASCADE,
        FOREIGN KEY(automation_thread_id) REFERENCES project_threads(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS background_job_runs_job_updated_idx
      ON background_job_runs(job_id, updated_at DESC);

      CREATE TABLE IF NOT EXISTS background_job_run_events (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        ordinal INTEGER NOT NULL,
        stage TEXT NOT NULL,
        message TEXT NOT NULL,
        detail_json TEXT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(run_id) REFERENCES background_job_runs(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS background_job_run_events_run_ordinal_idx
      ON background_job_run_events(run_id, ordinal ASC);

      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL CHECK(kind IN ('planning-question', 'planning-question-batch', 'assistant-question', 'assistant-question-batch', 'browser-approval', 'background-run-status')),
        interactive INTEGER NOT NULL CHECK(interactive IN (0, 1)),
        project_id TEXT NULL,
        thread_id TEXT NULL,
        run_id TEXT NULL,
        assistant_id TEXT NULL,
        question_id TEXT NULL,
        session_id TEXT NULL,
        tool_call_id TEXT NULL,
        background_run_id TEXT NULL,
        job_id TEXT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        read_at TEXT NULL,
        archived_at TEXT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY(thread_id) REFERENCES project_threads(id) ON DELETE CASCADE,
        FOREIGN KEY(run_id) REFERENCES agent_runs(id) ON DELETE CASCADE,
        FOREIGN KEY(assistant_id) REFERENCES assistants(id) ON DELETE CASCADE,
        FOREIGN KEY(background_run_id) REFERENCES background_job_runs(id) ON DELETE CASCADE,
        FOREIGN KEY(job_id) REFERENCES background_jobs(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS notifications_created_idx
      ON notifications(created_at DESC);

      CREATE TABLE IF NOT EXISTS background_job_templates (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        description TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('ai-routine', 'shell')),
        definition_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS assistants (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        scope TEXT NOT NULL CHECK(scope IN ('global', 'project')),
        project_id TEXT NULL,
        description TEXT NULL,
        personality_prompt TEXT NOT NULL,
        job_prompt TEXT NOT NULL,
        agent_id TEXT NOT NULL CHECK(agent_id IN ('pi', 'copilot-cli', 'codex-cli')),
        provider_brand TEXT NULL CHECK(provider_brand IN ('gpt', 'gemini', 'claude')),
        mode_id TEXT NULL,
        execution_model_id TEXT NULL,
        reasoning_strength TEXT NULL CHECK(reasoning_strength IN ('low', 'medium', 'high', 'extra-high')),
        fast_mode INTEGER NULL CHECK(fast_mode IN (0, 1)),
        run_state TEXT NOT NULL CHECK(run_state IN ('active', 'paused')),
        bootstrap_state TEXT NOT NULL CHECK(bootstrap_state IN ('pending', 'running', 'completed', 'failed')),
        bootstrap_attempt_id TEXT NULL,
        bootstrap_started_at TEXT NULL,
        bootstrap_finished_at TEXT NULL,
        cloned_from_assistant_id TEXT NULL,
        failure_streak_count INTEGER NOT NULL DEFAULT 0,
        circuit_breaker_state TEXT NOT NULL DEFAULT 'closed' CHECK(circuit_breaker_state IN ('closed', 'tripped')),
        circuit_breaker_reason TEXT NULL,
        pending_reprioritize_reason TEXT NULL,
        pending_reprioritize_requested_at TEXT NULL,
        deleted_at TEXT NULL,
        latest_activity_at TEXT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY(cloned_from_assistant_id) REFERENCES assistants(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS assistants_scope_project_idx
      ON assistants(scope, project_id, updated_at DESC);

      CREATE TABLE IF NOT EXISTS assistant_threads (
        id TEXT PRIMARY KEY,
        assistant_id TEXT NOT NULL UNIQUE,
        session_id TEXT NOT NULL,
        memory_summary_content TEXT NULL,
        memory_summary_updated_at TEXT NULL,
        updated_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(assistant_id) REFERENCES assistants(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS assistant_messages (
        id TEXT PRIMARY KEY,
        assistant_thread_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('system', 'user', 'assistant')),
        kind TEXT NOT NULL DEFAULT 'plain' CHECK(kind IN ('plain', 'plan-summary', 'run-milestones')),
        content TEXT NOT NULL,
        metadata_json TEXT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(assistant_thread_id) REFERENCES assistant_threads(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS assistant_messages_thread_created_idx
      ON assistant_messages(assistant_thread_id, created_at);

      CREATE TABLE IF NOT EXISTS assistant_todos (
        id TEXT PRIMARY KEY,
        assistant_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NULL,
        state TEXT NOT NULL CHECK(state IN ('pending', 'in-progress', 'blocked', 'completed', 'failed', 'cancelled')),
        sort_order INTEGER NOT NULL,
        blocker_reason TEXT NULL,
        source TEXT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT NULL,
        cancelled_at TEXT NULL,
        FOREIGN KEY(assistant_id) REFERENCES assistants(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS assistant_todos_assistant_sort_idx
      ON assistant_todos(assistant_id, sort_order ASC, updated_at DESC);

      CREATE TABLE IF NOT EXISTS assistant_learnings (
        id TEXT PRIMARY KEY,
        assistant_id TEXT NOT NULL,
        summary TEXT NOT NULL,
        source TEXT NOT NULL,
        confidence TEXT NOT NULL CHECK(confidence IN ('low', 'medium', 'high')),
        sort_order INTEGER NULL,
        created_at TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'fact' CHECK(kind IN ('fact', 'summary')),
        supersedes_learning_ids_json TEXT NULL,
        compacted_at TEXT NULL,
        FOREIGN KEY(assistant_id) REFERENCES assistants(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS assistant_learnings_assistant_created_idx
      ON assistant_learnings(assistant_id, created_at DESC);

      CREATE INDEX IF NOT EXISTS assistant_learnings_assistant_sort_idx
      ON assistant_learnings(assistant_id, sort_order ASC, created_at DESC);

      CREATE TABLE IF NOT EXISTS assistant_questions (
        id TEXT PRIMARY KEY,
        assistant_id TEXT NOT NULL,
        prompt TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending', 'deferred', 'answered', 'dismissed')),
        answer_text TEXT NULL,
        linked_todo_ids_json TEXT NULL,
        asked_at TEXT NOT NULL,
        answered_at TEXT NULL,
        FOREIGN KEY(assistant_id) REFERENCES assistants(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS assistant_questions_assistant_status_idx
      ON assistant_questions(assistant_id, status, asked_at DESC);

      CREATE TABLE IF NOT EXISTS assistant_log_entries (
        id TEXT PRIMARY KEY,
        assistant_id TEXT NOT NULL,
        level TEXT NOT NULL CHECK(level IN ('info', 'warning', 'error', 'critical')),
        summary TEXT NOT NULL,
        detail TEXT NULL,
        details_json TEXT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(assistant_id) REFERENCES assistants(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS assistant_log_entries_assistant_created_idx
      ON assistant_log_entries(assistant_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS assistant_asset_refs (
        id TEXT PRIMARY KEY,
        assistant_id TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('skill', 'script', 'mode', 'background-template')),
        label TEXT NOT NULL,
        value TEXT NOT NULL,
        canonical_value TEXT NULL,
        scope TEXT NULL CHECK(scope IN ('workspace', 'project')),
        provenance TEXT NULL CHECK(provenance IN ('repo-skill', 'repo-script', 'workspace-mode', 'project-mode', 'background-template')),
        resolution_status TEXT NOT NULL DEFAULT 'resolved' CHECK(resolution_status IN ('resolved', 'missing', 'out-of-scope')),
        resolution_error TEXT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(assistant_id) REFERENCES assistants(id) ON DELETE CASCADE
      );
    `);

    this.addColumnIfMissing("projects", "active_thread_id", "TEXT NULL");
    this.addColumnIfMissing("projects", "selected_mode_id", "TEXT NULL");
    this.addColumnIfMissing("projects", "rules_content", "TEXT NULL");
    this.addColumnIfMissing("projects", "rules_updated_at", "TEXT NULL");
    this.addColumnIfMissing("project_threads", "kind", "TEXT NOT NULL DEFAULT 'user'");
    this.addColumnIfMissing("project_threads", "title", "TEXT NULL");
    this.addColumnIfMissing("project_threads", "title_source", "TEXT NULL");
    this.addColumnIfMissing("project_threads", "updated_at", "TEXT NULL");
    this.addColumnIfMissing("project_threads", "forked_from_thread_id", "TEXT NULL");
    this.addColumnIfMissing("project_threads", "memory_summary_content", "TEXT NULL");
    this.addColumnIfMissing("project_threads", "memory_summary_updated_at", "TEXT NULL");
    this.addColumnIfMissing("thread_messages", "kind", "TEXT NOT NULL DEFAULT 'plain'");
    this.addColumnIfMissing("thread_messages", "attachments_json", "TEXT NULL");
    this.addColumnIfMissing("thread_messages", "metadata_json", "TEXT NULL");
    this.addColumnIfMissing(
      "workspace_modes",
      "execution_access",
      "TEXT NULL CHECK(execution_access IN ('workspace-write', 'read-only'))"
    );
    this.addColumnIfMissing(
      "project_modes",
      "execution_access",
      "TEXT NULL CHECK(execution_access IN ('workspace-write', 'read-only'))"
    );
    this.addColumnIfMissing("agent_run_questions", "choices_json", "TEXT NULL");
    this.addColumnIfMissing("agent_run_questions", "response_kind", "TEXT NOT NULL DEFAULT 'choice' CHECK(response_kind IN ('choice', 'freeform'))");
    this.addColumnIfMissing("agent_run_questions", "intent_json", "TEXT NULL");
    this.addColumnIfMissing("agent_run_questions", "logical_question_id", "TEXT NULL");
    this.addColumnIfMissing("agent_run_questions", "planner_turn_id", "TEXT NULL");
    this.addColumnIfMissing("agent_run_questions", "prompt_hash", "TEXT NULL");
    this.addColumnIfMissing("agent_run_subtasks", "commit_sha", "TEXT NULL");
    this.addColumnIfMissing("agent_run_subtasks", "worktree_path", "TEXT NULL");
    this.addColumnIfMissing("agent_run_subtasks", "mount_path", "TEXT NULL");
    this.addColumnIfMissing("agent_runs", "execution_target", "TEXT NULL");
    this.addColumnIfMissing("agent_runs", "prompt_chars", "INTEGER NULL");
    this.addColumnIfMissing("agent_runs", "prompt_hash", "TEXT NULL");
    this.addColumnIfMissing("agent_runs", "transcript_chars", "INTEGER NULL");
    this.addColumnIfMissing("agent_runs", "latest_task_chars", "INTEGER NULL");
    this.addColumnIfMissing("agent_runs", "plan_json", "TEXT NULL");
    this.addColumnIfMissing("agent_runs", "correctness_review_json", "TEXT NULL");
    this.addColumnIfMissing("agent_runs", "browser_sessions_json", "TEXT NULL");
    this.addColumnIfMissing("agent_runs", "tool_activities_json", "TEXT NULL");
    this.addColumnIfMissing("agent_runs", "failure_category", "TEXT NULL");
    this.addColumnIfMissing("agent_runs", "max_turns", "INTEGER NULL");
    this.addColumnIfMissing("agent_runs", "turns_used", "INTEGER NOT NULL DEFAULT 0");
    this.addColumnIfMissing("memory_entries", "priority", "INTEGER NOT NULL DEFAULT 50000");
    this.addColumnIfMissing("background_jobs", "assistant_id", "TEXT NULL");
    this.addColumnIfMissing(
      "background_jobs",
      "scheduler_status",
      "TEXT NULL CHECK(scheduler_status IN ('idle', 'due', 'queued', 'blocked', 'running', 'stale'))"
    );
    this.addColumnIfMissing("background_jobs", "scheduler_detail", "TEXT NULL");
    this.addColumnIfMissing("background_jobs", "scheduler_queue_position", "INTEGER NULL");
    this.addColumnIfMissing("background_jobs", "scheduler_queue_reason", "TEXT NULL");
    this.addColumnIfMissing("background_jobs", "scheduler_blocked_since_at", "TEXT NULL");
    this.addColumnIfMissing("background_jobs", "scheduler_active_run_id", "TEXT NULL");
    this.addColumnIfMissing("background_jobs", "scheduler_active_run_started_at", "TEXT NULL");
    this.addColumnIfMissing("background_jobs", "scheduler_last_progress_at", "TEXT NULL");
    this.addColumnIfMissing("background_jobs", "scheduler_overloaded", "INTEGER NULL CHECK(scheduler_overloaded IN (0, 1))");
    this.addColumnIfMissing("background_jobs", "consecutive_failure_count", "INTEGER NULL");
    this.addColumnIfMissing("background_jobs", "backoff_until", "TEXT NULL");
    this.addColumnIfMissing("background_jobs", "last_failure_category", "TEXT NULL");
    this.addColumnIfMissing("background_jobs", "last_scheduler_check_at", "TEXT NULL");
    this.addColumnIfMissing("background_jobs", "last_blocked_at", "TEXT NULL");
    this.addColumnIfMissing("background_jobs", "blocked_reason", "TEXT NULL");
    this.addColumnIfMissing("background_job_runs", "assistant_id", "TEXT NULL");
    this.addColumnIfMissing("background_job_runs", "failure_category", "TEXT NULL");
    this.addColumnIfMissing("background_job_runs", "prompt_chars", "INTEGER NULL");
    this.addColumnIfMissing("background_job_runs", "prompt_hash", "TEXT NULL");
    this.addColumnIfMissing("background_job_runs", "transcript_chars", "INTEGER NULL");
    this.addColumnIfMissing("background_job_runs", "latest_task_chars", "INTEGER NULL");
    this.addColumnIfMissing("background_job_runs", "controller_instance_id", "TEXT NULL");
    this.addColumnIfMissing("background_job_runs", "controller_lease_id", "TEXT NULL");
    this.addColumnIfMissing("background_job_runs", "controller_lease_expires_at", "TEXT NULL");
    this.addColumnIfMissing("background_job_runs", "resume_attempt_count", "INTEGER NULL");
    this.addColumnIfMissing("background_job_runs", "last_heartbeat_at", "TEXT NULL");
    this.addColumnIfMissing("background_job_runs", "heartbeat_stage", "TEXT NULL");
    this.addColumnIfMissing("background_job_runs", "heartbeat_detail", "TEXT NULL");
    this.addColumnIfMissing("background_job_runs", "timed_out_at", "TEXT NULL");
    this.addColumnIfMissing("assistants", "provider_brand", "TEXT NULL CHECK(provider_brand IN ('gpt', 'gemini'))");
    this.addColumnIfMissing("assistants", "fast_mode", "INTEGER NULL CHECK(fast_mode IN (0, 1))");
    this.addColumnIfMissing(
      "assistants",
      "reasoning_strength",
      "TEXT NULL CHECK(reasoning_strength IN ('low', 'medium', 'high', 'extra-high'))"
    );
    this.addColumnIfMissing("assistants", "bootstrap_attempt_id", "TEXT NULL");
    this.addColumnIfMissing("assistants", "bootstrap_started_at", "TEXT NULL");
    this.addColumnIfMissing("assistants", "bootstrap_finished_at", "TEXT NULL");
    this.addColumnIfMissing("assistants", "pending_reprioritize_reason", "TEXT NULL");
    this.addColumnIfMissing("assistants", "pending_reprioritize_requested_at", "TEXT NULL");
    this.addColumnIfMissing("assistant_learnings", "kind", "TEXT NOT NULL DEFAULT 'fact' CHECK(kind IN ('fact', 'summary'))");
    this.addColumnIfMissing("assistant_learnings", "supersedes_learning_ids_json", "TEXT NULL");
    this.addColumnIfMissing("assistant_learnings", "compacted_at", "TEXT NULL");
    this.addColumnIfMissing("assistant_learnings", "sort_order", "INTEGER NULL");
    this.addColumnIfMissing("assistant_asset_refs", "canonical_value", "TEXT NULL");
    this.addColumnIfMissing("assistant_asset_refs", "scope", "TEXT NULL CHECK(scope IN ('workspace', 'project'))");
    this.addColumnIfMissing(
      "assistant_asset_refs",
      "provenance",
      "TEXT NULL CHECK(provenance IN ('repo-skill', 'repo-script', 'workspace-mode', 'project-mode', 'background-template'))"
    );
    this.addColumnIfMissing(
      "assistant_asset_refs",
      "resolution_status",
      "TEXT NOT NULL DEFAULT 'resolved' CHECK(resolution_status IN ('resolved', 'missing', 'out-of-scope'))"
    );
    this.addColumnIfMissing("assistant_asset_refs", "resolution_error", "TEXT NULL");

    this.db.exec(`DROP INDEX IF EXISTS project_threads_active_project_idx;`);
    this.db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS agent_run_questions_run_turn_logical_idx ON agent_run_questions(run_id, planner_turn_id, logical_question_id);`);
    this.db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS agent_run_questions_run_turn_prompt_idx ON agent_run_questions(run_id, planner_turn_id, prompt_hash);`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS agent_runs_updated_failure_idx ON agent_runs(updated_at, failure_category);`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS agent_runs_prompt_updated_idx ON agent_runs(prompt_hash, updated_at);`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS background_job_runs_updated_failure_job_idx ON background_job_runs(updated_at, failure_category, job_id);`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS background_job_runs_prompt_updated_job_idx ON background_job_runs(prompt_hash, updated_at, job_id);`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS background_job_runs_status_lease_idx ON background_job_runs(status, controller_lease_expires_at);`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS background_jobs_status_backoff_idx ON background_jobs(status, backoff_until);`);
    this.db.exec(`UPDATE project_threads SET status = 'active' WHERE status = 'archived';`);

    this.rebuildAgentRunQuestionsTableIfNeeded();
    this.rebuildThreadMessagesTableIfNeeded();
    this.rebuildAssistantQuestionsTableIfNeeded();
    this.rebuildBackgroundJobRunsTableIfNeeded();
    this.rebuildNotificationsTableIfNeeded();
    this.repairBackgroundJobRunForeignKeysIfNeeded();
    this.backfillActiveThreadIds();
    this.backfillThreadMetadata();
    this.backfillQuestionChoices();
    this.backfillExecutionTargets();
    this.deleteGarbageAssistantLearnings();
    this.seedBackgroundJobTemplates();
  }

  private readProjectSnapshot(projectId: ProjectId): WorkspaceProjectState {
    let attemptCount = 0;
    while (attemptCount < 8) {
      try {
        return this.readProjectSnapshotUnsafe(projectId);
      } catch (error) {
        if (!this.tryRecoverFromProjectLoadFailure(projectId, error)) {
          throw error;
        }
      }

      attemptCount += 1;
    }

    throw new Error(`Unable to recover project snapshot for ${projectId}`);
  }

  private readProjectSnapshotUnsafe(projectId: ProjectId): WorkspaceProjectState {
    const project = this.db
      .query<ProjectRow, [string]>(
        `SELECT id, name, root_path, active_thread_id, selected_mode_id, rules_content, rules_updated_at, created_at, updated_at, last_opened_at
         FROM projects
         WHERE id = ?1`
      )
      .get(projectId);

    if (!project) {
      throw new Error(`Unknown project: ${projectId}`);
    }

    const activeThread = this.readActiveThreadRow(projectId);
    try {
      return {
        id: project.id as ProjectId,
        name: normalizeRequiredTrimmedString(project.name, 256, "Recovered project"),
        rootPath: normalizeRequiredString(project.root_path, 4096, this.repoRoot) as ProjectRootPath,
        activeThreadId: activeThread.id as ThreadId,
        selectedModeId: normalizeOptionalString(project.selected_mode_id, 128) ?? "implement",
        projectModes: this.readProjectModes(projectId),
        projectRuleSource: toProjectRuleSource(project),
        threadMemorySummary: toThreadMemorySummary(activeThread),
        threads: this.readThreadSummaries(projectId),
        session: {
          ...createEmptySession(activeThread.id as ThreadId),
          messages: this.readMessages(activeThread.id as ThreadId)
        },
        activeRun: this.readActiveRun(projectId, activeThread.id as ThreadId),
        lastRun: this.readLatestRun(projectId, activeThread.id as ThreadId),
        runSummaries: this.readThreadRunSummaries(projectId, activeThread.id as ThreadId)
      };
    } catch (error) {
      throw new ThreadLoadError(projectId, activeThread.id as ThreadId, error);
    }
  }

  private readActiveThreadRow(projectId: ProjectId) {
    const activeThreadId = this.db
      .query<{ active_thread_id: string | null }, [string]>(`SELECT active_thread_id FROM projects WHERE id = ?1`)
      .get(projectId)?.active_thread_id;

    if (!activeThreadId) {
      throw new Error(`Project ${projectId} has no active thread`);
    }

    return this.readThreadRow(projectId, activeThreadId as ThreadId);
  }

  private readThreadRow(projectId: ProjectId, threadId: ThreadId) {
    const thread = this.db
      .query<ThreadRow, [string, string]>(
        `SELECT id, project_id, status, kind, title, title_source, updated_at, forked_from_thread_id, memory_summary_content, memory_summary_updated_at, created_at, archived_at
         FROM project_threads
         WHERE project_id = ?1 AND id = ?2`
      )
      .get(projectId, threadId);

    if (!thread) {
      throw new Error(`Unknown thread: ${threadId}`);
    }

    return thread;
  }

  private readMessages(threadId: ThreadId) {
    return this.db
      .query<MessageRow, [string]>(
        `SELECT id, thread_id, role, kind, content, attachments_json, metadata_json, created_at
         FROM thread_messages
         WHERE thread_id = ?1
         ORDER BY created_at ASC`
      )
      .all(threadId)
      .map((message) =>
        safeParsePersisted(
          chatMessageSchema,
          {
          id: message.id,
          role: message.role,
          kind: message.kind ?? "plain",
          content: normalizeRequiredString(message.content, 1000000, "Recovered message"),
          attachments: parseChatAttachments(message.attachments_json, {
            table: "thread_messages",
            rowId: message.id,
            field: "attachments_json"
          }),
          metadata: parseChatMessageMetadata(message.metadata_json),
          createdAt: normalizeRequiredString(message.created_at, 256, new Date().toISOString())
          },
          { table: "thread_messages", rowId: message.id }
        )
      )
      .filter((message): message is ChatMessage => message !== undefined);
  }

  private readThreadSummaries(projectId: ProjectId): ProjectThreadSummary[] {
    const threadRows = this.db
      .query<ThreadRow, [string]>(
        `SELECT
          id, project_id, status, kind, title, title_source, updated_at, forked_from_thread_id,
          memory_summary_content, memory_summary_updated_at, created_at, archived_at
         FROM project_threads
         WHERE project_id = ?1
         ORDER BY updated_at DESC, created_at DESC`
      )
      .all(projectId);

    return threadRows.map((thread) => {
      try {
        const latestRun = this.readLatestRun(projectId, thread.id as ThreadId);
        const preview =
          this.db
            .query<{ content: string }, [string]>(
              `SELECT content
               FROM thread_messages
               WHERE thread_id = ?1
                 AND role != 'system'
                 AND kind != 'run-milestones'
               ORDER BY created_at DESC
               LIMIT 1`
            )
            .get(thread.id)?.content ??
          this.db
            .query<{ content: string }, [string]>(
              `SELECT content
               FROM thread_messages
               WHERE thread_id = ?1
                 AND kind != 'run-milestones'
               ORDER BY created_at DESC
               LIMIT 1`
            )
            .get(thread.id)?.content ??
          undefined;
        const messageCount =
          this.db.query<{ count: number }, [string]>(`SELECT COUNT(*) AS count FROM thread_messages WHERE thread_id = ?1`).get(thread.id)
            ?.count ?? 0;
        const lastUserMessageAt = this.db
          .query<{ created_at: string }, [string]>(
            `SELECT created_at
             FROM thread_messages
             WHERE thread_id = ?1
               AND role = 'user'
             ORDER BY created_at DESC
             LIMIT 1`
          )
          .get(thread.id)?.created_at;

        return createProjectThreadSummary({
          id: thread.id as ThreadId,
          kind: thread.kind,
          status: thread.status === "archived" ? "archived" : "active",
          title: normalizeRequiredTrimmedString(thread.title, 256, "Recovered thread"),
          titleSource: thread.title_source,
          badgeState: getThreadBadgeState(latestRun),
          messageCount: normalizeInteger(messageCount, 0, 100000, 0),
          lastMessagePreview: preview ? summarizeMessagePreview(preview) : undefined,
          createdAt: normalizeOptionalString(thread.created_at, 256),
          lastUserMessageAt: normalizeOptionalString(lastUserMessageAt, 256),
          archivedAt: normalizeOptionalString(thread.archived_at, 256),
          updatedAt: normalizeRequiredString(thread.updated_at, 256, new Date().toISOString()),
          forkedFromThreadId: (thread.forked_from_thread_id ?? undefined) as ThreadId | undefined
        });
      } catch (error) {
        throw new ThreadLoadError(projectId, thread.id as ThreadId, error);
      }
    });
  }

  private readWorkspaceModes() {
    return this.db
      .query<WorkspaceModeRow, []>(
        `SELECT
          id, label, description, planner_prompt, execution_prompt, tool_policy, execution_access,
          plan_execution_mode_default, subagent_worktree_strategy_default, correctness_iteration_mode_default, updated_at
         FROM workspace_modes
         ORDER BY updated_at DESC, id ASC`
      )
      .all()
      .map((row) => toModeDefinition(row, "workspace"));
  }

  private readProjectModes(projectId: ProjectId) {
    return this.db
      .query<ProjectModeRow, [string]>(
        `SELECT
          project_id, id, label, description, planner_prompt, execution_prompt, tool_policy, execution_access,
          plan_execution_mode_default, subagent_worktree_strategy_default, correctness_iteration_mode_default, updated_at
         FROM project_modes
         WHERE project_id = ?1
         ORDER BY updated_at DESC, id ASC`
      )
      .all(projectId)
      .map((row) => toModeDefinition(row, "project"));
  }

  private readWorkspaceRuleSource() {
    const content = this.getWorkspaceMetaValue(WORKSPACE_RULES_CONTENT_KEY);
    if (!content) {
      return undefined;
    }

    return {
      id: "workspace-rules",
      scope: "workspace",
      label: "Workspace rules",
      content: normalizeRequiredString(content, 32000, "Recovered workspace rules"),
      updatedAt: normalizeRequiredString(this.getWorkspaceMetaValue(WORKSPACE_RULES_UPDATED_AT_KEY), 256, "unknown")
    } satisfies WorkspaceRuleSource;
  }

  private readWorkspaceMemorySummary() {
    const content = this.getWorkspaceMetaValue(WORKSPACE_MEMORY_CONTENT_KEY);
    if (!content) {
      return undefined;
    }

    return {
      id: "workspace-memory",
      scope: "workspace",
      label: "Workspace memory",
      content: normalizeRequiredString(content, 32000, "Recovered workspace memory"),
      updatedAt: normalizeRequiredString(this.getWorkspaceMetaValue(WORKSPACE_MEMORY_UPDATED_AT_KEY), 256, "unknown"),
      source: "user"
    } satisfies MemorySummary;
  }

  private readAssistants() {
    return this.db
      .query<AssistantRow, []>(
        `SELECT
          id, name, scope, project_id, description, personality_prompt, job_prompt, agent_id, mode_id,
          provider_brand, execution_model_id, reasoning_strength, fast_mode, run_state, bootstrap_state,
          bootstrap_attempt_id, bootstrap_started_at, bootstrap_finished_at, cloned_from_assistant_id, failure_streak_count,
          circuit_breaker_state, circuit_breaker_reason, pending_reprioritize_reason, pending_reprioritize_requested_at,
          deleted_at, latest_activity_at, created_at, updated_at
         FROM assistants
         WHERE deleted_at IS NULL
         ORDER BY updated_at DESC, created_at DESC`
      )
      .all()
      .map((row) => this.hydrateAssistant(row))
      .filter((assistant): assistant is Assistant => assistant !== undefined);
  }

  private readAssistantThreadRowByAssistantId(assistantId: string) {
    const row = this.db
      .query<AssistantThreadRow, [string]>(
        `SELECT
          id, assistant_id, session_id, memory_summary_content, memory_summary_updated_at, updated_at, created_at
         FROM assistant_threads
         WHERE assistant_id = ?1`
      )
      .get(assistantId);
    if (!row) {
      throw new Error(`Assistant ${assistantId} has no thread`);
    }
    return row;
  }

  private readAssistantThreads() {
    return this.db
      .query<AssistantThreadRow, []>(
        `SELECT
          id, assistant_id, session_id, memory_summary_content, memory_summary_updated_at, updated_at, created_at
         FROM assistant_threads
         WHERE assistant_id IN (SELECT id FROM assistants WHERE deleted_at IS NULL)
         ORDER BY updated_at DESC`
      )
      .all()
      .map((row) => this.hydrateAssistantThread(row))
      .filter((thread): thread is AssistantThread => thread !== undefined);
  }

  private readAssistantMessages(threadId: string) {
    return this.db
      .query<AssistantMessageRow, [string]>(
        `SELECT id, assistant_thread_id, role, kind, content, metadata_json, created_at
         FROM assistant_messages
         WHERE assistant_thread_id = ?1
         ORDER BY created_at ASC`
      )
      .all(threadId)
      .map((message) =>
        safeParsePersisted(
          chatMessageSchema,
          {
            id: message.id,
            role: message.role,
            kind: message.kind ?? "plain",
            content: normalizeRequiredString(message.content, 1000000, "Recovered assistant message"),
            metadata: parseChatMessageMetadata(message.metadata_json),
            createdAt: normalizeRequiredString(message.created_at, 256, new Date().toISOString())
          },
          { table: "assistant_messages", rowId: message.id }
        )
      )
      .filter((message): message is ChatMessage => message !== undefined);
  }

  private readAssistantTodos() {
    return this.db
      .query<AssistantTodoRow, []>(
        `SELECT
          id, assistant_id, title, description, state, sort_order, blocker_reason, source,
          created_at, updated_at, completed_at, cancelled_at
         FROM assistant_todos
         WHERE assistant_id IN (SELECT id FROM assistants WHERE deleted_at IS NULL)
         ORDER BY sort_order ASC, updated_at DESC`
      )
      .all()
      .map((row) => this.hydrateAssistantTodo(row))
      .filter((todo): todo is AssistantTodo => todo !== undefined);
  }

  private readAssistantLearnings() {
    return this.db
      .query<AssistantLearningRow, []>(
        `SELECT id, assistant_id, summary, source, confidence, sort_order, created_at, kind, supersedes_learning_ids_json, compacted_at
         FROM assistant_learnings
         WHERE assistant_id IN (SELECT id FROM assistants WHERE deleted_at IS NULL)
           AND (compacted_at IS NULL OR kind = 'summary')
         ORDER BY CASE WHEN sort_order IS NULL THEN 1 ELSE 0 END ASC, sort_order ASC, kind DESC, created_at DESC`
      )
      .all()
      .map((row) => this.hydrateAssistantLearning(row))
      .filter((learning): learning is AssistantLearning => learning !== undefined);
  }

  private readAssistantLearningsByAssistantId(assistantId: string) {
    return this.db
      .query<AssistantLearningRow, [string]>(
        `SELECT id, assistant_id, summary, source, confidence, sort_order, created_at, kind, supersedes_learning_ids_json, compacted_at
         FROM assistant_learnings
         WHERE assistant_id = ?1
           AND (compacted_at IS NULL OR kind = 'summary')
         ORDER BY CASE WHEN sort_order IS NULL THEN 1 ELSE 0 END ASC, sort_order ASC, kind DESC, created_at DESC`
      )
      .all(assistantId)
      .map((row) => this.hydrateAssistantLearning(row))
      .filter((learning): learning is AssistantLearning => learning !== undefined);
  }

  private deleteGarbageAssistantLearnings() {
    const rows = this.db.query<{ id: string; summary: string }, []>(`SELECT id, summary FROM assistant_learnings`).all();
    const garbageIds = rows.filter((row) => isGarbageAssistantLearningSummary(row.summary)).map((row) => row.id);
    if (garbageIds.length === 0) {
      return;
    }
    const tx = this.db.transaction(() => {
      for (const id of garbageIds) {
        this.db.query(`DELETE FROM assistant_learnings WHERE id = ?1`).run(id);
      }
    });
    tx();
  }

  private readAssistantQuestions() {
    return this.db
      .query<AssistantQuestionRow, []>(
        `SELECT id, assistant_id, prompt, status, answer_text, linked_todo_ids_json, asked_at, answered_at
         FROM assistant_questions
         WHERE assistant_id IN (SELECT id FROM assistants WHERE deleted_at IS NULL)
         ORDER BY asked_at DESC`
      )
      .all()
      .map((row) => this.hydrateAssistantQuestion(row))
      .filter((question): question is AssistantQuestion => question !== undefined);
  }

  private readAssistantLogEntries() {
    return this.db
      .query<AssistantLogEntryRow, []>(
        `SELECT id, assistant_id, level, summary, detail, details_json, created_at
         FROM assistant_log_entries
         WHERE assistant_id IN (SELECT id FROM assistants WHERE deleted_at IS NULL)
         ORDER BY created_at DESC`
      )
      .all()
      .map((row) => this.hydrateAssistantLogEntry(row))
      .filter((entry): entry is AssistantLogEntry => entry !== undefined);
  }

  private readAssistantAssetRefs() {
    return this.db
      .query<AssistantAssetRefRow, []>(
        `SELECT
          id, assistant_id, kind, label, value, canonical_value, scope, provenance,
          resolution_status, resolution_error, created_at
         FROM assistant_asset_refs
         WHERE assistant_id IN (SELECT id FROM assistants WHERE deleted_at IS NULL)
         ORDER BY created_at ASC`
      )
      .all()
      .map((row) => this.hydrateAssistantAssetRef(row))
      .filter((assetRef): assetRef is AssistantAssetRef => assetRef !== undefined);
  }

  private getAssistantTodo(todoId: string) {
    const row = this.db
      .query<AssistantTodoRow, [string]>(
        `SELECT
          id, assistant_id, title, description, state, sort_order, blocker_reason, source,
          created_at, updated_at, completed_at, cancelled_at
         FROM assistant_todos
         WHERE id = ?1`
      )
      .get(todoId);
    return row ? this.hydrateAssistantTodo(row) : undefined;
  }

  private getAssistantLearning(learningId: string) {
    const row = this.db
      .query<AssistantLearningRow, [string]>(
        `SELECT id, assistant_id, summary, source, confidence, sort_order, created_at, kind, supersedes_learning_ids_json, compacted_at
         FROM assistant_learnings
         WHERE id = ?1`
      )
      .get(learningId);
    return row ? this.hydrateAssistantLearning(row) : undefined;
  }

  private findAssistantLearningDuplicate(candidate: AssistantLearning) {
    const candidateKind = candidate.kind ?? "fact";
    const candidateKey = normalizeAssistantLearningText(candidate.summary);
    const candidateTokens = tokenizeAssistantLearning(candidate.summary);
    return this.readAssistantLearningsByAssistantId(candidate.assistantId).find((learning) => {
      if ((learning.kind ?? "fact") !== candidateKind) {
        return false;
      }
      if (learning.id === candidate.id) {
        return true;
      }
      const learningKey = normalizeAssistantLearningText(learning.summary);
      if (learningKey === candidateKey) {
        return true;
      }
      if (learningKey.includes(candidateKey) || candidateKey.includes(learningKey)) {
        return true;
      }
      const learningTokens = tokenizeAssistantLearning(learning.summary);
      if (tokenSmallerSetOverlap(candidateTokens, learningTokens) >= ASSISTANT_LEARNING_SIMILAR_SENTIMENT_THRESHOLD) {
        return true;
      }
      return tokenJaccardSimilarity(candidateTokens, learningTokens) >= ASSISTANT_LEARNING_FUZZY_DUPLICATE_THRESHOLD;
    });
  }

  private findAssistantLearningSharedPremise(candidate: AssistantLearning) {
    const candidateKind = candidate.kind ?? "fact";
  const candidatePremise = parseNormativeAssistantLearning(candidate.summary);
    if (!candidatePremise) {
      return undefined;
    }
    const candidatePremiseTokens = tokenizeAssistantLearning(candidatePremise.premise);
    return this.readAssistantLearningsByAssistantId(candidate.assistantId).find((learning) => {
      if ((learning.kind ?? "fact") !== candidateKind || learning.id === candidate.id) {
        return false;
      }
      const existingPremise = parseNormativeAssistantLearning(learning.summary);
      if (!existingPremise) {
        return false;
      }
      if (existingPremise.verb !== candidatePremise.verb) {
        return false;
      }
      const existingKey = normalizeAssistantLearningText(existingPremise.premise);
      const candidateKey = normalizeAssistantLearningText(candidatePremise.premise);
      return (
        existingKey === candidateKey ||
        tokenSmallerSetOverlap(candidatePremiseTokens, tokenizeAssistantLearning(existingPremise.premise)) >=
          ASSISTANT_LEARNING_SIMILAR_SENTIMENT_THRESHOLD
      );
    });
  }

  private getAssistantQuestion(questionId: string) {
    const row = this.db
      .query<AssistantQuestionRow, [string]>(
        `SELECT id, assistant_id, prompt, status, answer_text, linked_todo_ids_json, asked_at, answered_at
         FROM assistant_questions
         WHERE id = ?1`
      )
      .get(questionId);
    return row ? this.hydrateAssistantQuestion(row) : undefined;
  }

  private getAssistantLogEntry(entryId: string) {
    const row = this.db
      .query<AssistantLogEntryRow, [string]>(
        `SELECT id, assistant_id, level, summary, detail, details_json, created_at
         FROM assistant_log_entries
         WHERE id = ?1`
      )
      .get(entryId);
    return row ? this.hydrateAssistantLogEntry(row) : undefined;
  }

  private hydrateAssistant(row: AssistantRow) {
    const unreadQuestionCount =
      this.db
        .query<{ count: number }, [string]>(`SELECT COUNT(*) AS count FROM assistant_questions WHERE assistant_id = ?1 AND status = 'pending'`)
        .get(row.id)?.count ?? 0;
    return safeParsePersisted(
      assistantSchema,
      {
      id: row.id,
      name: normalizeRequiredTrimmedString(row.name, 256, "Recovered assistant"),
      scope: row.scope,
      projectId: row.project_id ?? undefined,
      description: normalizeOptionalString(row.description, 1024),
      personalityPrompt: normalizeRequiredString(row.personality_prompt, 8000, "Recovered assistant personality."),
      jobPrompt: normalizeRequiredString(row.job_prompt, 12000, "Recovered assistant job."),
      agentId: row.agent_id,
      providerBrand: row.provider_brand ?? undefined,
      modeId: row.mode_id ?? undefined,
      executionModelId: normalizeOptionalString(row.execution_model_id, 256),
      reasoningStrength: normalizeComposerReasoningStrength(row.reasoning_strength),
      fastMode: row.fast_mode === null ? undefined : normalizeBooleanNumber(row.fast_mode),
      runState: row.run_state,
      bootstrapState: row.bootstrap_state,
      bootstrapAttemptId: normalizeOptionalString(row.bootstrap_attempt_id, 128),
      bootstrapStartedAt: normalizeOptionalString(row.bootstrap_started_at, 256),
      bootstrapFinishedAt: normalizeOptionalString(row.bootstrap_finished_at, 256),
      clonedFromAssistantId: normalizeOptionalString(row.cloned_from_assistant_id, 128),
      failureStreakCount: normalizeInteger(row.failure_streak_count, 0, 1000, 0),
      circuitBreakerState: row.circuit_breaker_state,
      circuitBreakerReason: normalizeOptionalString(row.circuit_breaker_reason, 4000),
      deletedAt: normalizeOptionalString(row.deleted_at, 256),
      latestActivityAt: normalizeOptionalString(row.latest_activity_at, 256),
      unreadQuestionCount: normalizeInteger(unreadQuestionCount, 0, 10000, 0),
      createdAt: normalizeRequiredString(row.created_at, 256, new Date().toISOString()),
      updatedAt: normalizeRequiredString(row.updated_at, 256, new Date().toISOString())
      },
      { table: "assistants", rowId: row.id }
    );
  }

  private hydrateAssistantThread(row: AssistantThreadRow) {
    return safeParsePersisted(
      assistantThreadSchema,
      {
      id: row.id,
      assistantId: row.assistant_id,
      sessionId: row.session_id as SessionId,
      messageCount:
        normalizeInteger(
          this.db
            .query<{ count: number }, [string]>(`SELECT COUNT(*) AS count FROM assistant_messages WHERE assistant_thread_id = ?1`)
            .get(row.id)?.count ?? 0,
          0,
          100000,
          0
        ),
      memorySummary: normalizeOptionalString(row.memory_summary_content, 32000)
        ? {
            id: `${row.id}:memory`,
            scope: "thread",
            label: "Assistant memory",
            content: normalizeRequiredString(row.memory_summary_content, 32000, "Recovered assistant memory"),
            updatedAt: normalizeRequiredString(row.memory_summary_updated_at ?? row.updated_at, 256, new Date().toISOString()),
            source: "generated"
          }
        : undefined,
      messages: this.readAssistantMessages(row.id).slice(0, 4096),
      updatedAt: normalizeRequiredString(row.updated_at, 256, new Date().toISOString())
      },
      { table: "assistant_threads", rowId: row.id }
    );
  }

  private hydrateAssistantTodo(row: AssistantTodoRow) {
    return safeParsePersisted(
      assistantTodoSchema,
      {
      id: row.id,
      assistantId: row.assistant_id,
      title: normalizeRequiredTrimmedString(row.title, 512, "Recovered todo"),
      description: normalizeOptionalString(row.description, 4000),
      state: row.state,
      sortOrder: normalizeInteger(row.sort_order, 0, 1000000, 0),
      blockerReason: normalizeOptionalString(row.blocker_reason, 4000),
      source: row.source ?? undefined,
      createdAt: normalizeRequiredString(row.created_at, 256, new Date().toISOString()),
      updatedAt: normalizeRequiredString(row.updated_at, 256, new Date().toISOString()),
      completedAt: normalizeOptionalString(row.completed_at, 256),
      cancelledAt: normalizeOptionalString(row.cancelled_at, 256)
      },
      { table: "assistant_todos", rowId: row.id }
    );
  }

  private hydrateAssistantLearning(row: AssistantLearningRow) {
    return safeParsePersisted(
      assistantLearningSchema,
      {
      id: row.id,
      assistantId: row.assistant_id,
      summary: normalizeRequiredString(row.summary, 4000, "Recovered learning"),
      source: normalizeAssistantLearningSource(row.source),
      confidence: row.confidence,
      sortOrder: row.sort_order === null ? undefined : normalizeInteger(row.sort_order, 0, 1000000, 0),
      createdAt: normalizeRequiredString(row.created_at, 256, new Date().toISOString()),
      kind: row.kind ?? "fact",
      supersedesLearningIds: normalizeStringArray(row.supersedes_learning_ids_json, 512, 128),
      compactedAt: normalizeOptionalString(row.compacted_at, 256)
      },
      { table: "assistant_learnings", rowId: row.id }
    );
  }

  private hydrateAssistantQuestion(row: AssistantQuestionRow) {
    return safeParsePersisted(
      assistantQuestionSchema,
      {
      id: row.id,
      assistantId: row.assistant_id,
      prompt: normalizeRequiredString(row.prompt, 8000, "Recovered question"),
      status: row.status,
      answerText: normalizeOptionalString(row.answer_text, 32000),
      linkedTodoIds: parseAssistantTodoIds(row.linked_todo_ids_json)?.slice(0, 32),
      askedAt: normalizeRequiredString(row.asked_at, 256, new Date().toISOString()),
      answeredAt: normalizeOptionalString(row.answered_at, 256)
      },
      { table: "assistant_questions", rowId: row.id }
    );
  }

  private hydrateAssistantLogEntry(row: AssistantLogEntryRow) {
    return safeParsePersisted(
      assistantLogEntrySchema,
      {
      id: row.id,
      assistantId: row.assistant_id,
      level: row.level,
      summary: normalizeRequiredString(row.summary, 1024, "Recovered log entry"),
      detail: normalizeOptionalString(row.detail, 4000),
      detailsJson: parseJsonObjectOrUndefined(row.details_json),
      createdAt: normalizeRequiredString(row.created_at, 256, new Date().toISOString())
      },
      { table: "assistant_log_entries", rowId: row.id }
    );
  }

  private hydrateAssistantAssetRef(row: AssistantAssetRefRow) {
    return safeParsePersisted(
      assistantAssetRefSchema,
      {
      id: row.id,
      assistantId: row.assistant_id,
      kind: row.kind,
      label: normalizeRequiredString(row.label, 256, "Recovered asset"),
      value: normalizeRequiredString(row.value, 4096, "recovered"),
      canonicalValue: normalizeOptionalString(row.canonical_value, 4096),
      scope: row.scope ?? undefined,
      provenance: row.provenance ?? undefined,
      resolutionStatus: row.resolution_status ?? "resolved",
      resolutionError: normalizeOptionalString(row.resolution_error, 1024),
      createdAt: normalizeRequiredString(row.created_at, 256, new Date().toISOString())
      },
      { table: "assistant_asset_refs", rowId: row.id }
    );
  }

  private tryRecoverFromProjectLoadFailure(projectId: ProjectId, error: unknown) {
    if (!this.allowDevThreadRecovery) {
      return false;
    }

    if (error instanceof ThreadLoadError) {
      this.deleteThreadForRecovery(projectId, error.threadId, error.cause);
      return true;
    }

    const activeThreadId = this.db
      .query<{ active_thread_id: string | null }, [string]>(`SELECT active_thread_id FROM projects WHERE id = ?1`)
      .get(projectId)?.active_thread_id;
    if (!activeThreadId) {
      this.ensureProjectHasUsableThread(projectId, new Date().toISOString());
      return true;
    }

    return false;
  }

  private assertProjectExists(projectId: ProjectId) {
    const project = this.db.query<{ id: string }, [string]>(`SELECT id FROM projects WHERE id = ?1`).get(projectId);
    if (!project) {
      throw new Error(`Unknown project: ${projectId}`);
    }
  }

  private assertAssistantExists(assistantId: string) {
    if (!this.assistantExists(assistantId)) {
      throw new Error(`Unknown assistant: ${assistantId}`);
    }
  }

  private assistantExists(assistantId: string) {
    return Boolean(
      this.db.query<{ id: string }, [string]>(`SELECT id FROM assistants WHERE id = ?1 AND deleted_at IS NULL`).get(assistantId)
    );
  }

  private assertRunExists(projectId: ProjectId, runId: string) {
    const run = this.db
      .query<{ id: string }, [string, string]>(`SELECT id FROM agent_runs WHERE id = ?1 AND project_id = ?2`)
      .get(runId, projectId);

    if (!run) {
      throw new Error(`Unknown agent run: ${runId}`);
    }
  }

  private resolveActiveProjectId(projectIds: ProjectId[]) {
    if (projectIds.length === 0) {
      this.deleteWorkspaceMetaValue(ACTIVE_PROJECT_KEY);
      return undefined;
    }

    const activeProjectId = this.db
      .query<{ value: string }, [string]>(`SELECT value FROM workspace_meta WHERE key = ?1`)
      .get(ACTIVE_PROJECT_KEY)?.value as ProjectId | undefined;

    if (activeProjectId && projectIds.includes(activeProjectId)) {
      return activeProjectId;
    }

    const fallbackProjectId = projectIds[0];
    this.setWorkspaceMetaValue(ACTIVE_PROJECT_KEY, fallbackProjectId);
    return fallbackProjectId;
  }

  private resolveThreadId(projectId: ProjectId, threadId?: ThreadId) {
    return threadId ?? (this.readActiveThreadRow(projectId).id as ThreadId);
  }

  private readActiveRun(projectId: ProjectId, threadId: ThreadId): AgentRunState | undefined {
    const run = this.db
      .query<AgentRunRow, [string, string]>(
        `SELECT
          id, project_id, thread_id, status, execution_target, latest_user_prompt, prompt_chars, prompt_hash, transcript_chars, latest_task_chars,
          planning_model_id, execution_model_id, difficulty_score, summary, final_execution_brief, failure_message, failure_category, max_turns, turns_used, plan_json, correctness_review_json,
          browser_sessions_json, tool_activities_json,
          created_at, updated_at, completed_at
         FROM agent_runs
         WHERE project_id = ?1 AND thread_id = ?2 AND status != 'completed'
         ORDER BY updated_at DESC
         LIMIT 1`
      )
      .get(projectId, threadId);

    return run ? this.hydrateRunState(run) : undefined;
  }

  private readRunRow(projectId: ProjectId, threadId: ThreadId, runId: string) {
    return this.db
      .query<AgentRunRow, [string, string, string]>(
        `SELECT
          id, project_id, thread_id, status, execution_target, latest_user_prompt, prompt_chars, prompt_hash, transcript_chars, latest_task_chars,
          planning_model_id, execution_model_id, difficulty_score, summary, final_execution_brief, failure_message, failure_category, max_turns, turns_used, plan_json, correctness_review_json,
          browser_sessions_json, tool_activities_json,
          created_at, updated_at, completed_at
         FROM agent_runs
         WHERE project_id = ?1 AND thread_id = ?2 AND id = ?3`
      )
      .get(projectId, threadId, runId);
  }

  private readThreadRunSummaries(projectId: ProjectId, threadId: ThreadId): AgentRunSummary[] {
    return this.db
      .query<AgentRunRow, [string, string]>(
        `SELECT
          id, project_id, thread_id, status, execution_target, latest_user_prompt, prompt_chars, prompt_hash, transcript_chars, latest_task_chars,
          planning_model_id, execution_model_id, difficulty_score, summary, final_execution_brief, failure_message, failure_category, max_turns, turns_used, plan_json, correctness_review_json,
          browser_sessions_json, tool_activities_json,
          created_at, updated_at, completed_at
         FROM agent_runs
         WHERE project_id = ?1 AND thread_id = ?2
         ORDER BY updated_at DESC`
      )
      .all(projectId, threadId)
      .map((run) => this.hydrateRunState(run))
      .filter((run): run is AgentRunState => run !== undefined)
      .map((run) => toAgentRunSummary(run));
  }

  private readLatestRun(projectId: ProjectId, threadId: ThreadId): AgentRunState | undefined {
    const run = this.db
      .query<AgentRunRow, [string, string]>(
        `SELECT
          id, project_id, thread_id, status, execution_target, latest_user_prompt, prompt_chars, prompt_hash, transcript_chars, latest_task_chars,
          planning_model_id, execution_model_id, difficulty_score, summary, final_execution_brief, failure_message, failure_category, max_turns, turns_used, plan_json, correctness_review_json,
          browser_sessions_json, tool_activities_json,
          created_at, updated_at, completed_at
         FROM agent_runs
         WHERE project_id = ?1 AND thread_id = ?2
         ORDER BY updated_at DESC
         LIMIT 1`
      )
      .get(projectId, threadId);

    return run ? this.hydrateRunState(run) : undefined;
  }

  private hydrateRunState(run: AgentRunRow): AgentRunState | undefined {
    const questions = this.db
      .query<AgentRunQuestionRow, [string]>(
        `SELECT id, run_id, ordinal, logical_question_id, planner_turn_id, prompt_hash, prompt, placeholder, response_kind, choices_json, intent_json, status, answer_text, asked_at, answered_at
         FROM agent_run_questions
         WHERE run_id = ?1
         ORDER BY ordinal ASC`
      )
      .all(run.id)
      .map((question) => ({
        id: question.id,
        logicalQuestionId: normalizeOptionalString(question.logical_question_id, 128) ?? question.id,
        prompt: normalizeRequiredString(question.prompt, 1000000, "Recovered planning question"),
        placeholder: normalizeOptionalString(question.placeholder, 32000),
        responseKind: question.response_kind,
        choices: question.response_kind === "freeform" ? undefined : parsePlanningChoices(question.choices_json),
        required: true,
        status: question.status,
        answerText: normalizeOptionalString(question.answer_text, 1000000),
        intent: parsePlanningQuestionIntent(question.intent_json),
        askedAt: normalizeRequiredString(question.asked_at, 256, new Date().toISOString()),
        answeredAt: normalizeOptionalString(question.answered_at, 256)
      }));

    const subtasks = this.db
      .query<AgentRunSubtaskRow, [string]>(
        `SELECT
          id, run_id, planner_task_id, title, instruction, status, attempt_count, output, error_message,
          commit_sha, worktree_path, mount_path, started_at, completed_at, updated_at
         FROM agent_run_subtasks
         WHERE run_id = ?1
         ORDER BY planner_task_id ASC`
      )
      .all(run.id)
      .map((task) => ({
        id: task.planner_task_id,
        title: normalizeRequiredString(task.title, 1000000, "Recovered subtask"),
        instruction: normalizeRequiredString(task.instruction, 1000000, "Recovered subtask instruction"),
        status: task.status,
        attemptCount: normalizeInteger(task.attempt_count, 0, Number.MAX_SAFE_INTEGER, 0),
        output: normalizeOptionalString(task.output, 1000000),
        errorMessage: normalizeOptionalString(task.error_message, 1000000),
        commitSha: normalizeOptionalString(task.commit_sha, 256),
        mountPath: normalizeOptionalString((task as AgentRunSubtaskRow & { mount_path?: string | null }).mount_path, 4096),
        worktreePath: normalizeOptionalString(task.worktree_path, 4096),
        startedAt: normalizeOptionalString(task.started_at, 256),
        completedAt: normalizeOptionalString(task.completed_at, 256),
        updatedAt: normalizeRequiredString(task.updated_at, 256, new Date().toISOString())
      }));

    const experiment = this.db
      .query<AgentRunExperimentRow, [string]>(
        `SELECT
          id,
          run_id,
          status,
          virtual_branch_name,
          repo_mount_path,
          project_mount_path,
          base_commit_sha,
          base_branch_name,
          base_dirty_fingerprint,
          head_commit_sha,
          files_changed,
          insertions,
          deletions,
          promoted_at,
          discarded_at,
          created_at,
          updated_at
         FROM agent_run_experiments
         WHERE run_id = ?1`
      )
      .get(run.id);
    const memoryRetrievals = this.db
      .query<MemoryRetrievalRow, [string]>(
        `SELECT id, run_id, owner, subagent_id, query_text, entry_ids_json, created_at
         FROM memory_retrievals
         WHERE run_id = ?1
         ORDER BY created_at ASC`
      )
      .all(run.id)
      .map((row) => this.hydrateMemoryRetrieval(row))
      .filter((retrieval): retrieval is MemoryRetrieval => retrieval !== undefined);

    const hasExecutionState = subtasks.length > 0 || Boolean(run.final_execution_brief);
    return safeParsePersisted(
      agentRunStateSchema,
      {
      id: run.id,
      threadId: run.thread_id as ThreadId,
      status: run.status,
      executionTarget: run.execution_target ?? "current-project",
      latestUserPrompt: normalizeRequiredString(run.latest_user_prompt, 1000000, "Recovered prompt"),
      promptStats: buildRunPromptStats({
        promptChars: run.prompt_chars,
        promptHash: run.prompt_hash,
        transcriptChars: run.transcript_chars,
        latestTaskChars: run.latest_task_chars
      }),
      planningModelId: normalizeOptionalString(run.planning_model_id, 256),
      executionModelId: normalizeOptionalString(run.execution_model_id, 256),
      difficultyScore: normalizeOptionalInteger(run.difficulty_score, 0, 100),
      summary: normalizeOptionalString(run.summary, 1000000),
      finalExecutionBrief: normalizeOptionalString(run.final_execution_brief, 1000000),
      failureMessage: normalizeOptionalString(run.failure_message, 1000000),
      failureCategory: normalizeRunFailureCategory(run.failure_category),
      runtimeBudget: run.max_turns === null ? undefined : buildRunRuntimeBudget(run.max_turns, run.turns_used, false),
      plan: parseExecutionPlan(run.plan_json),
      correctnessReview: parseCorrectnessReview(run.correctness_review_json),
      questions,
      subtasks,
      experiment: experiment ? this.hydrateExperimentRun(experiment) : undefined,
      memoryRetrievals: memoryRetrievals.length > 0 ? memoryRetrievals : undefined,
      browserSessions: parseBrowserSessions(run.browser_sessions_json),
      toolActivities: parseToolActivities(run.tool_activities_json),
      resumable: isRunResumable(run.status, hasExecutionState),
      retryable: isRunRetryable(run.status, hasExecutionState),
      createdAt: normalizeRequiredString(run.created_at, 256, new Date().toISOString()),
      updatedAt: normalizeRequiredString(run.updated_at, 256, new Date().toISOString()),
      completedAt: normalizeOptionalString(run.completed_at, 256)
      },
      { table: "agent_runs", rowId: run.id }
    );
  }

  private getWorkspaceMetaValue(key: string) {
    return this.db
      .query<{ value: string }, [string]>(`SELECT value FROM workspace_meta WHERE key = ?1`)
      .get(key)?.value;
  }

  private setWorkspaceMetaValue(key: string, value: string) {
    this.db
      .query(
        `INSERT INTO workspace_meta (key, value)
         VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      )
      .run(key, value);
  }

  private deleteWorkspaceMetaValue(key: string) {
    this.db.query(`DELETE FROM workspace_meta WHERE key = ?1`).run(key);
  }

  private resolveUniqueProjectName(baseName: string) {
    const existingNames = new Set(
      this.db
        .query<{ name: string }, []>(`SELECT name FROM projects`)
        .all()
        .map((row) => row.name)
    );

    if (!existingNames.has(baseName)) {
      return baseName;
    }

    let suffix = 2;
    while (existingNames.has(`${baseName} (${suffix})`)) {
      suffix += 1;
    }

    return `${baseName} (${suffix})`;
  }

  private getNextThreadNumber(projectId: ProjectId) {
    const count =
      this.db.query<{ count: number }, [string]>(`SELECT COUNT(*) AS count FROM project_threads WHERE project_id = ?1`).get(projectId)
        ?.count ?? 0;
    return count + 1;
  }

  private insertThread(
    projectId: ProjectId,
    threadId: ThreadId,
    input: {
      kind?: BackgroundJobThreadKind;
      title: string;
      titleSource: "generated" | "custom";
      updatedAt: string;
      forkedFromThreadId?: ThreadId;
    }
  ) {
    this.db
      .query(
        `INSERT INTO project_threads (
          id, project_id, status, kind, title, title_source, updated_at, forked_from_thread_id,
          memory_summary_content, memory_summary_updated_at, created_at, archived_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, NULL, NULL, ?7, NULL)`
      )
      .run(
        threadId,
        projectId,
        ACTIVE_THREAD_STATUS,
        input.kind ?? "user",
        input.title,
        input.titleSource,
        input.updatedAt,
        input.forkedFromThreadId ?? null
      );
  }

  private setActiveThread(projectId: ProjectId, threadId: ThreadId, now: string) {
    this.db
      .query(
        `UPDATE projects
         SET active_thread_id = ?2, updated_at = ?3, last_opened_at = ?3
         WHERE id = ?1`
      )
      .run(projectId, threadId, now);
  }

  private touchProject(projectId: ProjectId, now: string) {
    this.db
      .query(
        `UPDATE projects
         SET updated_at = ?2, last_opened_at = ?2
         WHERE id = ?1`
      )
      .run(projectId, now);
  }

  private touchAssistant(assistantId: string, now: string = new Date().toISOString()) {
    this.db
      .query(`UPDATE assistants SET updated_at = ?2, latest_activity_at = ?2 WHERE id = ?1`)
      .run(assistantId, now);
  }

  private deleteThreadForRecovery(projectId: ProjectId, threadId: ThreadId, cause: unknown) {
    const now = new Date().toISOString();
    const message = cause instanceof Error ? cause.message : String(cause);
    debugLog("workspace.thread-recovery.delete", {
      projectId,
      threadId,
      reason: message
    });

    const tx = this.db.transaction(() => {
      this.db.query(`DELETE FROM project_threads WHERE id = ?1 AND project_id = ?2`).run(threadId, projectId);
      this.ensureProjectHasUsableThread(projectId, now);
    });
    tx();
  }

  private ensureProjectHasUsableThread(projectId: ProjectId, now: string) {
    const fallbackThread = this.db
      .query<{ id: string }, [string]>(
        `SELECT id
         FROM project_threads
         WHERE project_id = ?1
         ORDER BY updated_at DESC, created_at DESC
         LIMIT 1`
      )
      .get(projectId);

    if (fallbackThread) {
      this.setActiveThread(projectId, fallbackThread.id as ThreadId, now);
      return;
    }

    const threadId = createThreadId();
    this.insertThread(projectId, threadId, {
      title: "Thread 1",
      titleSource: "generated",
      updatedAt: now
    });
    this.setActiveThread(projectId, threadId, now);
  }

  private backfillActiveThreadIds() {
    const projects = this.db.query<{ id: string; active_thread_id: string | null }, []>(`SELECT id, active_thread_id FROM projects`).all();
    for (const project of projects) {
      if (project.active_thread_id) {
        continue;
      }

      const threadId = this.db
        .query<{ id: string }, [string]>(
          `SELECT id
           FROM project_threads
           WHERE project_id = ?1
           ORDER BY created_at ASC
           LIMIT 1`
        )
        .get(project.id)?.id;

      if (threadId) {
        this.db.query(`UPDATE projects SET active_thread_id = ?2 WHERE id = ?1`).run(project.id, threadId);
      }
    }
  }

  private backfillThreadMetadata() {
    const projectIds = this.db.query<{ id: string }, []>(`SELECT id FROM projects`).all().map((project) => project.id);

    for (const projectId of projectIds) {
      const threads = this.db
        .query<ThreadRow, [string]>(
          `SELECT
            id, project_id, status, kind, title, title_source, updated_at, forked_from_thread_id,
            memory_summary_content, memory_summary_updated_at, created_at, archived_at
           FROM project_threads
           WHERE project_id = ?1
           ORDER BY created_at ASC`
        )
        .all(projectId);

      threads.forEach((thread, index) => {
        try {
          const firstUserMessage = this.db
            .query<{ content: string }, [string]>(
              `SELECT content FROM thread_messages WHERE thread_id = ?1 AND role = 'user' ORDER BY created_at ASC LIMIT 1`
            )
            .get(thread.id)?.content;
          const latestMessageAt = this.db
            .query<{ created_at: string }, [string]>(
              `SELECT created_at FROM thread_messages WHERE thread_id = ?1 ORDER BY created_at DESC LIMIT 1`
            )
            .get(thread.id)?.created_at;

          this.db
            .query(
              `UPDATE project_threads
               SET title = ?2, title_source = ?3, updated_at = ?4
               WHERE id = ?1`
            )
            .run(
              thread.id,
              normalizeThreadTitle(thread.title ?? toGeneratedThreadTitle(firstUserMessage, `Thread ${index + 1}`)),
              thread.title_source ?? "generated",
              thread.updated_at ?? latestMessageAt ?? thread.created_at
            );
        } catch (error) {
          if (!this.allowDevThreadRecovery) {
            throw error;
          }

          this.deleteThreadForRecovery(projectId as ProjectId, thread.id as ThreadId, error);
        }
      });
    }
  }

  private backfillQuestionChoices() {
    const rows = this.db
      .query<{ id: string; placeholder: string | null; response_kind: string; choices_json: string | null }, []>(
        `SELECT id, placeholder, response_kind, choices_json FROM agent_run_questions`
      )
      .all();

    for (const row of rows) {
      if (row.choices_json || row.response_kind === "freeform") {
        continue;
      }

      this.db
        .query(`UPDATE agent_run_questions SET choices_json = ?2 WHERE id = ?1`)
        .run(row.id, JSON.stringify(createFallbackPlanningChoices(row.placeholder ?? "Provide answer")));
    }
  }

  private rebuildAgentRunQuestionsTableIfNeeded() {
    const createSql = this.readTableCreateSql("agent_run_questions");
    if (createSql.includes("'deferred'")) {
      return;
    }

    this.db.exec(`
      ALTER TABLE agent_run_questions RENAME TO agent_run_questions_legacy;
      CREATE TABLE agent_run_questions (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        ordinal INTEGER NOT NULL,
        logical_question_id TEXT NULL,
        planner_turn_id TEXT NULL,
        prompt_hash TEXT NULL,
        prompt TEXT NOT NULL,
        placeholder TEXT NULL,
        response_kind TEXT NOT NULL DEFAULT 'choice' CHECK(response_kind IN ('choice', 'freeform')),
        choices_json TEXT NULL,
        intent_json TEXT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending', 'deferred', 'answered')),
        answer_text TEXT NULL,
        asked_at TEXT NOT NULL,
        answered_at TEXT NULL,
        FOREIGN KEY(run_id) REFERENCES agent_runs(id) ON DELETE CASCADE
      );
      INSERT INTO agent_run_questions (
        id, run_id, ordinal, logical_question_id, planner_turn_id, prompt_hash, prompt, placeholder, response_kind, choices_json, intent_json, status, answer_text, asked_at, answered_at
      )
      SELECT
        id, run_id, ordinal, id, NULL, NULL, prompt, placeholder, 'choice', choices_json, NULL, status, answer_text, asked_at, answered_at
      FROM agent_run_questions_legacy;
      DROP TABLE agent_run_questions_legacy;
      CREATE INDEX IF NOT EXISTS agent_run_questions_run_ordinal_idx
      ON agent_run_questions(run_id, ordinal ASC);
      CREATE UNIQUE INDEX IF NOT EXISTS agent_run_questions_run_turn_logical_idx
      ON agent_run_questions(run_id, planner_turn_id, logical_question_id);
      CREATE UNIQUE INDEX IF NOT EXISTS agent_run_questions_run_turn_prompt_idx
      ON agent_run_questions(run_id, planner_turn_id, prompt_hash);
    `);
  }

  private rebuildThreadMessagesTableIfNeeded() {
    const createSql = this.readTableCreateSql("thread_messages");
    if (createSql.includes("'run-milestones'")) {
      return;
    }

    this.db.exec(`
      ALTER TABLE thread_messages RENAME TO thread_messages_legacy;
      CREATE TABLE thread_messages (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('system', 'user', 'assistant')),
        kind TEXT NOT NULL DEFAULT 'plain' CHECK(kind IN ('plain', 'plan-summary', 'run-milestones')),
        content TEXT NOT NULL,
        attachments_json TEXT NULL,
        metadata_json TEXT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(thread_id) REFERENCES project_threads(id) ON DELETE CASCADE
      );
      INSERT INTO thread_messages (
        id, thread_id, role, kind, content, attachments_json, metadata_json, created_at
      )
      SELECT
        id, thread_id, role, COALESCE(kind, 'plain'), content, attachments_json, metadata_json, created_at
      FROM thread_messages_legacy;
      DROP TABLE thread_messages_legacy;
      CREATE INDEX IF NOT EXISTS thread_messages_thread_created_idx
      ON thread_messages(thread_id, created_at);
    `);
  }

  private rebuildAssistantQuestionsTableIfNeeded() {
    const createSql = this.readTableCreateSql("assistant_questions");
    if (createSql.includes("'deferred'")) {
      return;
    }

    this.db.exec(`
      ALTER TABLE assistant_questions RENAME TO assistant_questions_legacy;
      CREATE TABLE assistant_questions (
        id TEXT PRIMARY KEY,
        assistant_id TEXT NOT NULL,
        prompt TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending', 'deferred', 'answered', 'dismissed')),
        answer_text TEXT NULL,
        linked_todo_ids_json TEXT NULL,
        asked_at TEXT NOT NULL,
        answered_at TEXT NULL,
        FOREIGN KEY(assistant_id) REFERENCES assistants(id) ON DELETE CASCADE
      );
      INSERT INTO assistant_questions (
        id, assistant_id, prompt, status, answer_text, linked_todo_ids_json, asked_at, answered_at
      )
      SELECT
        id, assistant_id, prompt, status, answer_text, linked_todo_ids_json, asked_at, answered_at
      FROM assistant_questions_legacy;
      DROP TABLE assistant_questions_legacy;
      CREATE INDEX IF NOT EXISTS assistant_questions_assistant_status_idx
      ON assistant_questions(assistant_id, status, asked_at DESC);
    `);
  }

  private rebuildBackgroundJobRunsTableIfNeeded() {
    const createSql = this.readTableCreateSql("background_job_runs");
    if (createSql.includes("'awaiting-user-input'")) {
      return;
    }

    this.db.exec(`
      ALTER TABLE background_job_runs RENAME TO background_job_runs_legacy;
      CREATE TABLE background_job_runs (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        assistant_id TEXT NULL,
        automation_thread_id TEXT NOT NULL,
        trigger_source TEXT NOT NULL CHECK(trigger_source IN ('schedule', 'startup-catchup', 'manual', 'approval-release', 'retry')),
        status TEXT NOT NULL CHECK(status IN ('queued', 'awaiting-approval', 'awaiting-user-input', 'running', 'succeeded', 'failed', 'cancelled', 'skipped')),
        risk_level TEXT NOT NULL CHECK(risk_level IN ('safe', 'slightly-unsafe', 'unsafe')),
        approval_status TEXT NOT NULL CHECK(approval_status IN ('not-needed', 'pending', 'approved', 'rejected')),
        skipped_occurrence_count INTEGER NOT NULL DEFAULT 0,
        linked_agent_run_id TEXT NULL,
        summary TEXT NULL,
        failure_message TEXT NULL,
        failure_category TEXT NULL,
        prompt_chars INTEGER NULL,
        prompt_hash TEXT NULL,
        transcript_chars INTEGER NULL,
        latest_task_chars INTEGER NULL,
        controller_instance_id TEXT NULL,
        controller_lease_id TEXT NULL,
        controller_lease_expires_at TEXT NULL,
        resume_attempt_count INTEGER NULL,
        queued_at TEXT NOT NULL,
        started_at TEXT NULL,
        completed_at TEXT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(job_id) REFERENCES background_jobs(id) ON DELETE CASCADE,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY(assistant_id) REFERENCES assistants(id) ON DELETE CASCADE,
        FOREIGN KEY(automation_thread_id) REFERENCES project_threads(id) ON DELETE CASCADE
      );
      INSERT INTO background_job_runs (
        id, job_id, project_id, assistant_id, automation_thread_id, trigger_source, status, risk_level, approval_status,
        skipped_occurrence_count, linked_agent_run_id, summary, failure_message, failure_category,
        prompt_chars, prompt_hash, transcript_chars, latest_task_chars,
        controller_instance_id, controller_lease_id, controller_lease_expires_at, resume_attempt_count,
        queued_at, started_at, completed_at, created_at, updated_at
      )
      SELECT
        id, job_id, project_id, assistant_id, automation_thread_id, trigger_source, status, risk_level, approval_status,
        skipped_occurrence_count, linked_agent_run_id, summary, failure_message, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0,
        queued_at, started_at, completed_at, created_at, updated_at
      FROM background_job_runs_legacy;
      DROP TABLE background_job_runs_legacy;
      CREATE INDEX IF NOT EXISTS background_job_runs_job_updated_idx
      ON background_job_runs(job_id, updated_at DESC);
    `);
  }

  private repairBackgroundJobRunForeignKeysIfNeeded() {
    const runEventsSql = this.readTableCreateSql("background_job_run_events");
    const notificationsSql = this.readTableCreateSql("notifications");
    if (!runEventsSql.includes("background_job_runs_legacy") && !notificationsSql.includes("background_job_runs_legacy")) {
      return;
    }

    this.rebuildBackgroundJobRunEventsTable();
    this.rebuildNotificationsTable();
  }

  private rebuildNotificationsTableIfNeeded() {
    const createSql = this.readTableCreateSql("notifications");
    if (createSql.includes("'planning-question-batch'") && createSql.includes("'assistant-question-batch'")) {
      return;
    }

    this.rebuildNotificationsTable();
  }

  private rebuildBackgroundJobRunEventsTable() {
    this.db.exec(`
      ALTER TABLE background_job_run_events RENAME TO background_job_run_events_legacy;
      CREATE TABLE background_job_run_events (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        ordinal INTEGER NOT NULL,
        stage TEXT NOT NULL,
        message TEXT NOT NULL,
        detail_json TEXT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(run_id) REFERENCES background_job_runs(id) ON DELETE CASCADE
      );
      INSERT INTO background_job_run_events (
        id, run_id, ordinal, stage, message, detail_json, created_at
      )
      SELECT
        id, run_id, ordinal, stage, message, detail_json, created_at
      FROM background_job_run_events_legacy;
      DROP TABLE background_job_run_events_legacy;
      CREATE INDEX IF NOT EXISTS background_job_run_events_run_ordinal_idx
      ON background_job_run_events(run_id, ordinal ASC);
    `);
  }

  private rebuildNotificationsTable() {
    this.db.exec(`
      ALTER TABLE notifications RENAME TO notifications_legacy;
      CREATE TABLE notifications (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL CHECK(kind IN ('planning-question', 'planning-question-batch', 'assistant-question', 'assistant-question-batch', 'browser-approval', 'background-run-status')),
        interactive INTEGER NOT NULL CHECK(interactive IN (0, 1)),
        project_id TEXT NULL,
        thread_id TEXT NULL,
        run_id TEXT NULL,
        assistant_id TEXT NULL,
        question_id TEXT NULL,
        session_id TEXT NULL,
        tool_call_id TEXT NULL,
        background_run_id TEXT NULL,
        job_id TEXT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        read_at TEXT NULL,
        archived_at TEXT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY(thread_id) REFERENCES project_threads(id) ON DELETE CASCADE,
        FOREIGN KEY(run_id) REFERENCES agent_runs(id) ON DELETE CASCADE,
        FOREIGN KEY(assistant_id) REFERENCES assistants(id) ON DELETE CASCADE,
        FOREIGN KEY(background_run_id) REFERENCES background_job_runs(id) ON DELETE CASCADE,
        FOREIGN KEY(job_id) REFERENCES background_jobs(id) ON DELETE CASCADE
      );
      INSERT INTO notifications (
        id, kind, interactive, project_id, thread_id, run_id, assistant_id, question_id,
        session_id, tool_call_id, background_run_id, job_id, payload_json, created_at, read_at, archived_at
      )
      SELECT
        id, kind, interactive, project_id, thread_id, run_id, assistant_id, question_id,
        session_id, tool_call_id, background_run_id, job_id, payload_json, created_at, read_at, archived_at
      FROM notifications_legacy;
      DROP TABLE notifications_legacy;
      CREATE INDEX IF NOT EXISTS notifications_created_idx
      ON notifications(created_at DESC);
    `);
  }

  private updateSubtask(
    projectId: ProjectId,
    runId: string,
    taskId: string,
    input: {
      status: SubagentTaskState["status"];
      attemptCount: number;
      startedAt?: string | null;
      completedAt?: string | null;
      output?: string | null;
      errorMessage?: string | null;
      commitSha?: string | null;
      worktreePath?: string | null;
      mountPath?: string | null;
    }
  ) {
    const now = new Date().toISOString();
    const updated = this.db
      .query(
        `UPDATE agent_run_subtasks
         SET status = ?4, attempt_count = ?5, started_at = COALESCE(?6, started_at), completed_at = ?7,
             output = ?8, error_message = ?9, commit_sha = ?10, worktree_path = ?11, mount_path = ?12, updated_at = ?13
         WHERE run_id = ?1
           AND planner_task_id = ?2
           AND EXISTS (SELECT 1 FROM agent_runs WHERE agent_runs.id = ?1 AND agent_runs.project_id = ?3)`
      )
      .run(
        runId,
        taskId,
        projectId,
        input.status,
        input.attemptCount,
        input.startedAt ?? null,
        input.completedAt ?? null,
        input.output ?? null,
        input.errorMessage ?? null,
        input.commitSha ?? null,
        input.worktreePath ?? null,
        input.mountPath ?? null,
        now
      );

    if (updated.changes === 0) {
      throw new Error(`Unknown agent subtask: ${taskId}`);
    }

    this.db.query(`UPDATE agent_runs SET updated_at = ?3 WHERE id = ?1 AND project_id = ?2`).run(runId, projectId, now);
    return this.readProjectSnapshot(projectId);
  }

  private ensureAutomationThread(projectId: ProjectId, threadId: ThreadId, title: string, now: string) {
    const existing = this.db
      .query<{ id: string }, [string, string]>(`SELECT id FROM project_threads WHERE project_id = ?1 AND id = ?2`)
      .get(projectId, threadId);
    if (existing) {
      return threadId;
    }

    this.insertThread(projectId, threadId, {
      kind: "automation",
      title: normalizeThreadTitle(title),
      titleSource: "custom",
      updatedAt: now
    });
    return threadId;
  }

  private readBackgroundJobs() {
    return this.db
      .query<BackgroundJobRow, []>(
        `SELECT
          id, project_id, assistant_id, automation_thread_id, template_id, created_from_run_id, kind, name, description,
          definition_json, schedule_json, schedule_input, timezone, status, risk_level, next_run_at,
          last_run_at, last_enqueued_at, scheduler_status, scheduler_detail, scheduler_queue_position, scheduler_queue_reason,
          scheduler_blocked_since_at, scheduler_active_run_id, scheduler_active_run_started_at, scheduler_last_progress_at,
          scheduler_overloaded, consecutive_failure_count, backoff_until, last_failure_category,
          last_scheduler_check_at, last_blocked_at, blocked_reason, created_at, updated_at
         FROM background_jobs
         ORDER BY updated_at DESC, created_at DESC`
      )
      .all()
      .map((row) => this.hydrateBackgroundJob(row))
      .filter((job): job is BackgroundJob => job !== undefined);
  }

  private readBackgroundJobRuns() {
    return this.db
      .query<BackgroundJobRunRow, []>(
        `SELECT
          id, job_id, project_id, assistant_id, automation_thread_id, trigger_source, status, risk_level, approval_status,
          skipped_occurrence_count, linked_agent_run_id, summary, failure_message, failure_category,
          prompt_chars, prompt_hash, transcript_chars, latest_task_chars,
          controller_instance_id, controller_lease_id, controller_lease_expires_at, resume_attempt_count,
          last_heartbeat_at, heartbeat_stage, heartbeat_detail, timed_out_at, queued_at, started_at,
          completed_at, created_at, updated_at
         FROM background_job_runs
         ORDER BY updated_at DESC, created_at DESC
         LIMIT 256`
      )
      .all()
      .map((row) => this.hydrateBackgroundJobRun(row))
      .filter((run): run is BackgroundJobRun => run !== undefined);
  }

  private readBackgroundJobTemplates() {
    return this.db
      .query<{ id: string; label: string; description: string; kind: BackgroundJobTemplate["kind"]; definition_json: string }, []>(
        `SELECT id, label, description, kind, definition_json
         FROM background_job_templates
         ORDER BY id ASC`
      )
      .all()
      .map((row) =>
        safeParsePersisted(
          backgroundJobTemplateSchema,
          {
            id: row.id,
            label: normalizeRequiredString(row.label, 128, "Recovered template"),
            description: normalizeRequiredString(row.description, 512, "Recovered template"),
            kind: row.kind,
            definition: parseBackgroundJobDefinition(row.kind, row.definition_json)
          },
          { table: "background_job_templates", rowId: row.id }
        )
      )
      .filter((template): template is BackgroundJobTemplate => template !== undefined);
  }

  private readNotificationInboxItems() {
    return this.db
      .query<NotificationRow, []>(
        `SELECT
          id, kind, interactive, project_id, thread_id, run_id, assistant_id, question_id, session_id, tool_call_id,
          background_run_id, job_id, payload_json, created_at, read_at, archived_at
         FROM notifications
         WHERE archived_at IS NULL
         ORDER BY created_at DESC`
      )
      .all()
      .map((row) => this.hydrateNotification(row))
      .filter((item): item is NotificationInboxItem => item !== undefined);
  }

  private hydrateBackgroundJob(row: BackgroundJobRow) {
    return safeParsePersisted(
      backgroundJobSchema,
      {
      id: row.id,
      projectId: row.project_id,
      assistantId: row.assistant_id ?? undefined,
      automationThreadId: row.automation_thread_id,
      templateId: normalizeOptionalString(row.template_id, 128),
      createdFromRunId: normalizeOptionalString(row.created_from_run_id, 128),
      kind: row.kind,
      name: normalizeRequiredString(row.name, 256, "Recovered background job"),
      description: normalizeOptionalString(row.description, 1024),
      definition: parseBackgroundJobDefinition(row.kind, row.definition_json),
      schedule: parseBackgroundJobSchedule(row.schedule_json, row.next_run_at ?? row.updated_at),
      scheduleInput: normalizeRequiredString(row.schedule_input, 512, "recovered"),
      timezone: normalizeOptionalString(row.timezone, 128),
      status: row.status,
      riskLevel: row.risk_level,
      nextRunAt: normalizeOptionalString(row.next_run_at, 256),
      lastRunAt: normalizeOptionalString(row.last_run_at, 256),
      lastEnqueuedAt: normalizeOptionalString(row.last_enqueued_at, 256),
      schedulerStatus: normalizeBackgroundJobSchedulerStatus(row.scheduler_status),
      schedulerDetail: normalizeOptionalString(row.scheduler_detail, 1024),
      schedulerQueuePosition: row.scheduler_queue_position
        ? normalizeInteger(row.scheduler_queue_position, 1, 100000, 1)
        : undefined,
      schedulerQueueReason: normalizeOptionalString(row.scheduler_queue_reason, 1024),
      schedulerBlockedSinceAt: normalizeOptionalString(row.scheduler_blocked_since_at, 256),
      schedulerActiveRunId: normalizeOptionalString(row.scheduler_active_run_id, 128),
      schedulerActiveRunStartedAt: normalizeOptionalString(row.scheduler_active_run_started_at, 256),
      schedulerLastProgressAt: normalizeOptionalString(row.scheduler_last_progress_at, 256),
      schedulerOverloaded: row.scheduler_overloaded === null ? undefined : Boolean(row.scheduler_overloaded),
      consecutiveFailureCount: normalizeOptionalInteger(row.consecutive_failure_count, 0, 100000) ?? 0,
      backoffUntil: normalizeOptionalString(row.backoff_until, 256),
      lastFailureCategory: normalizeRunFailureCategory(row.last_failure_category),
      lastSchedulerCheckAt: normalizeOptionalString(row.last_scheduler_check_at, 256),
      lastBlockedAt: normalizeOptionalString(row.last_blocked_at, 256),
      blockedReason: normalizeOptionalString(row.blocked_reason, 1024),
      createdAt: normalizeRequiredString(row.created_at, 256, new Date().toISOString()),
      updatedAt: normalizeRequiredString(row.updated_at, 256, new Date().toISOString())
      },
      { table: "background_jobs", rowId: row.id }
    );
  }

  private hydrateBackgroundJobRun(row: BackgroundJobRunRow) {
    const events = this.db
      .query<BackgroundJobRunEventRow, [string]>(
        `SELECT id, run_id, ordinal, stage, message, detail_json, created_at
         FROM background_job_run_events
         WHERE run_id = ?1
         ORDER BY ordinal ASC`
      )
      .all(row.id)
      .map((event) => ({
        id: event.id,
        stage: normalizeRequiredString(event.stage, 64, "recovered"),
        message: normalizeRequiredString(event.message, 4000, "Recovered job event"),
        detail: normalizeOptionalString(event.detail_json, 16000),
        createdAt: normalizeRequiredString(event.created_at, 256, new Date().toISOString())
      }))
      .slice(0, 512);

    return safeParsePersisted(
      backgroundJobRunSchema,
      {
      id: row.id,
      jobId: row.job_id,
      projectId: row.project_id,
      assistantId: row.assistant_id ?? undefined,
      automationThreadId: row.automation_thread_id,
      triggerSource: row.trigger_source,
      status: row.status,
      riskLevel: row.risk_level,
      approvalStatus: row.approval_status,
      skippedOccurrenceCount: normalizeInteger(row.skipped_occurrence_count, 0, 100000, 0),
      linkedAgentRunId: normalizeOptionalString(row.linked_agent_run_id, 128),
      summary: normalizeOptionalString(row.summary, 4000),
      failureMessage: normalizeOptionalString(row.failure_message, 4000),
      failureCategory: normalizeRunFailureCategory(row.failure_category),
      promptStats: buildRunPromptStats({
        promptChars: row.prompt_chars,
        promptHash: row.prompt_hash,
        transcriptChars: row.transcript_chars,
        latestTaskChars: row.latest_task_chars
      }),
      lastHeartbeatAt: normalizeOptionalString(row.last_heartbeat_at, 256),
      heartbeatStage: normalizeOptionalString(row.heartbeat_stage, 64),
      heartbeatDetail: normalizeOptionalString(row.heartbeat_detail, 1024),
      timedOutAt: normalizeOptionalString(row.timed_out_at, 256),
      resumeAttemptCount: normalizeOptionalInteger(row.resume_attempt_count, 0, 1000),
      queuedAt: normalizeRequiredString(row.queued_at, 256, new Date().toISOString()),
      startedAt: normalizeOptionalString(row.started_at, 256),
      completedAt: normalizeOptionalString(row.completed_at, 256),
      createdAt: normalizeRequiredString(row.created_at, 256, new Date().toISOString()),
      updatedAt: normalizeRequiredString(row.updated_at, 256, new Date().toISOString()),
      events
      },
      { table: "background_job_runs", rowId: row.id }
    );
  }

  private hydrateNotification(row: NotificationRow) {
    const payload = parseJsonObjectOrUndefined(row.payload_json);
    if (!payload) {
      recordPersistenceRecovery({ table: "notifications", rowId: row.id, field: "payload_json" }, "invalid notification payload");
      return undefined;
    }

    return safeParsePersisted(
      notificationInboxItemSchema,
      {
      ...payload,
      id: row.id,
      kind: row.kind,
      interactive: row.kind === "background-run-status" ? false : true,
      projectId: row.project_id ?? payload.projectId,
      threadId: row.thread_id ?? payload.threadId,
      runId: row.run_id ?? payload.runId,
      assistantId: row.assistant_id ?? payload.assistantId,
      questionId: row.question_id ?? payload.questionId,
      sessionId: row.session_id ?? payload.sessionId,
      toolCallId: row.tool_call_id ?? payload.toolCallId,
      backgroundRunId: row.background_run_id ?? payload.backgroundRunId,
      jobId: row.job_id ?? payload.jobId,
      createdAt: normalizeRequiredString(row.created_at, 256, new Date().toISOString()),
      readAt: normalizeOptionalString(row.read_at, 256),
      archivedAt: normalizeOptionalString(row.archived_at, 256)
      },
      { table: "notifications", rowId: row.id }
    );
  }

  private hydrateExperimentRun(row: AgentRunExperimentRow) {
    return safeParsePersisted(
      experimentRunSchema,
      {
      id: row.id,
      runId: row.run_id,
      status: row.status,
      virtualBranchName: normalizeRequiredString(row.virtual_branch_name, 256, "recovered-branch"),
      repoMountPath: normalizeRequiredString(row.repo_mount_path, 4096, this.repoRoot),
      projectMountPath: normalizeRequiredString(row.project_mount_path, 4096, this.repoRoot),
      baseCommitSha: normalizeOptionalString(row.base_commit_sha, 256),
      baseBranchName: normalizeOptionalString(row.base_branch_name, 256),
      baseDirtyFingerprint: normalizeRequiredString(row.base_dirty_fingerprint, 256, "unknown"),
      headCommitSha: normalizeOptionalString(row.head_commit_sha, 256),
      filesChanged: normalizeInteger(row.files_changed, 0, Number.MAX_SAFE_INTEGER, 0),
      insertions: normalizeInteger(row.insertions, 0, Number.MAX_SAFE_INTEGER, 0),
      deletions: normalizeInteger(row.deletions, 0, Number.MAX_SAFE_INTEGER, 0),
      promotedAt: normalizeOptionalString(row.promoted_at, 256),
      discardedAt: normalizeOptionalString(row.discarded_at, 256),
      createdAt: normalizeRequiredString(row.created_at, 256, new Date().toISOString()),
      updatedAt: normalizeRequiredString(row.updated_at, 256, new Date().toISOString())
      },
      { table: "agent_run_experiments", rowId: row.id }
    );
  }

  private hydrateMemoryEntry(row: MemoryEntryRow) {
    return safeParsePersisted(
      memoryEntrySchema,
      {
      id: row.id,
      projectId: row.project_id ?? undefined,
      threadId: row.thread_id ?? undefined,
      runId: row.run_id ?? undefined,
      kind: row.kind,
      status: row.status,
      title: normalizeRequiredString(row.title, 256, "Recovered memory"),
      summary: normalizeRequiredString(row.summary, 4000, "Recovered memory summary"),
      evidence: normalizeOptionalString(row.evidence, 16000),
      tags: parseStringArray(row.tags_json, 32, 128),
      pathGlobs: parseStringArray(row.path_globs_json, 64, 512),
      confidence: row.confidence,
      freshness: deriveMemoryFreshness(row),
      pinned: normalizeBooleanNumber(row.pinned),
      priority: normalizeInteger(row.priority, 0, 100000, 50000),
      hitCount: normalizeInteger(row.hit_count, 0, Number.MAX_SAFE_INTEGER, 0),
      lastHitAt: normalizeOptionalString(row.last_hit_at, 256),
      sourceCommitSha: normalizeOptionalString(row.source_commit_sha, 256),
      createdAt: normalizeRequiredString(row.created_at, 256, new Date().toISOString()),
      updatedAt: normalizeRequiredString(row.updated_at, 256, new Date().toISOString())
      },
      { table: "memory_entries", rowId: row.id }
    );
  }

  private hydrateMemoryRetrieval(row: MemoryRetrievalRow) {
    return safeParsePersisted(
      memoryRetrievalSchema,
      {
      id: row.id,
      runId: row.run_id,
      owner: row.owner,
      subagentId: normalizeOptionalString(row.subagent_id, 128),
      queryText: normalizeRequiredString(row.query_text, 32000, "Recovered memory query"),
      entryIds: parseStringArray(row.entry_ids_json, 16, 128),
      createdAt: normalizeRequiredString(row.created_at, 256, new Date().toISOString())
      },
      { table: "memory_retrievals", rowId: row.id }
    );
  }

  private seedBackgroundJobTemplates() {
    const now = new Date().toISOString();
    for (const template of defaultBackgroundJobTemplates) {
      this.db
        .query(
          `INSERT INTO background_job_templates (id, label, description, kind, definition_json, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
           ON CONFLICT(id) DO UPDATE SET
             label = excluded.label,
             description = excluded.description,
             kind = excluded.kind,
             definition_json = excluded.definition_json,
             updated_at = excluded.updated_at`
        )
        .run(
          template.id,
          template.label,
          template.description,
          template.kind,
          JSON.stringify(template.definition),
          now
        );
    }
  }

  private addColumnIfMissing(tableName: string, columnName: string, definition: string) {
    const columns = this.db
      .query<{ name: string }, [string]>(`SELECT name FROM pragma_table_info(?1)`)
      .all(tableName)
      .map((row) => row.name);

    if (!columns.includes(columnName)) {
      this.db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
    }
  }

  private readTableCreateSql(tableName: string) {
    return (
      this.db
        .query<{ sql: string | null }, [string]>(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?1`)
        .get(tableName)?.sql ?? ""
    );
  }

  private backfillExecutionTargets() {
    this.db
      .query(`UPDATE agent_runs SET execution_target = 'current-project' WHERE execution_target IS NULL`)
      .run();
  }
}

function toModeDefinition(row: WorkspaceModeRow | ProjectModeRow, scope: "workspace" | "project"): ModeDefinition {
  return {
    id: row.id,
    scope,
    label: normalizeRequiredString(row.label, 64, "Recovered mode"),
    description: normalizeRequiredString(row.description, 256, "Recovered mode description"),
    plannerPrompt: normalizeRequiredString(row.planner_prompt, 4000, "Plan the task."),
    executionPrompt: normalizeRequiredString(row.execution_prompt, 4000, "Execute the task."),
    toolPolicy: row.tool_policy,
    executionAccess: resolveModeExecutionAccess({
      toolPolicy: row.tool_policy,
      executionAccess: row.execution_access ?? undefined
    }),
    planExecutionModeDefault: row.plan_execution_mode_default ?? undefined,
    subagentWorktreeStrategyDefault: row.subagent_worktree_strategy_default ?? undefined,
    correctnessIterationModeDefault: row.correctness_iteration_mode_default ?? undefined,
    updatedAt: normalizeRequiredString(row.updated_at, 256, new Date().toISOString())
  };
}

function toProjectRuleSource(project: ProjectRow): WorkspaceRuleSource | undefined {
  if (!project.rules_content) {
    return undefined;
  }

  return {
    id: `${project.id}:rules`,
    scope: "project",
    label: normalizeRequiredString(`${project.name} rules`, 128, "Project rules"),
    content: normalizeRequiredString(project.rules_content, 32000, "Recovered rules"),
    updatedAt: normalizeRequiredString(project.rules_updated_at, 256, "unknown")
  };
}

function toThreadMemorySummary(thread: ThreadRow): MemorySummary | undefined {
  if (!thread.memory_summary_content) {
    return undefined;
  }

  return {
    id: `${thread.id}:memory`,
    scope: "thread",
    label: "Thread memory",
    content: normalizeRequiredString(thread.memory_summary_content, 32000, "Recovered memory"),
    updatedAt: normalizeRequiredString(thread.memory_summary_updated_at, 256, "unknown"),
    source: "user"
  };
}

function parsePlanningChoices(input: string | null): PlanningChoice[] {
  if (!input) {
    return createFallbackPlanningChoices("Provide answer");
  }

  try {
    const parsed = JSON.parse(input);
    if (Array.isArray(parsed) && parsed.length === 3) {
      const choices = parsed.map((choice, index) =>
        safeParsePersisted(
          planningChoiceSchema,
          choice,
          { table: "agent_run_questions", field: `choices_json[${index}]` },
          {
            fallbacks: {
              id: `choice-${index + 1}`,
              label: `Choice ${index + 1}`,
              description: "Recovered choice.",
              answerText: "Recovered answer."
            }
          }
        )
      );
      if (choices.every((choice): choice is PlanningChoice => choice !== undefined)) {
        const recommendedIndex = choices.findIndex((choice) => choice.recommended);
        return choices.map((choice, index) => ({ ...choice, recommended: recommendedIndex === -1 ? index === 0 : index === recommendedIndex }));
      }
    }
  } catch {
    return createFallbackPlanningChoices("Provide answer");
  }

  return createFallbackPlanningChoices("Provide answer");
}

function parsePlanningQuestionIntent(input: string | null): PlanningQuestion["intent"] {
  if (!input) {
    return undefined;
  }

  try {
    return safeParsePersisted(planningQuestionIntentSchema, JSON.parse(input), {
      table: "agent_run_questions",
      field: "intent_json"
    });
  } catch {
    return undefined;
  }
}

function parseChatMessageMetadata(input: string | null): ChatMessageMetadata | undefined {
  if (!input) {
    return undefined;
  }

  try {
    return safeParsePersisted(chatMessageMetadataSchema, JSON.parse(input), {
      table: "thread_messages",
      field: "metadata_json"
    });
  } catch {
    return undefined;
  }
}

function parseChatAttachment(input: string | null, context: PersistedRecoveryContext): ChatAttachment | undefined {
  const parsed = parseJsonObjectOrUndefined(input);
  if (!parsed) {
    return undefined;
  }

  return safeParsePersisted(
    chatAttachmentSchema,
    {
      ...parsed,
      name: normalizeRequiredString(parsed.name, 256, "Recovered attachment"),
      mimeType: normalizeRequiredString(parsed.mimeType, 256, "application/octet-stream"),
      sizeBytes: normalizeInteger(parsed.sizeBytes, 1, 16 * 1024 * 1024, 1),
      key: normalizeRequiredString(parsed.key, 512, "recovered"),
      uploadedAt: normalizeRequiredString(parsed.uploadedAt, 256, new Date().toISOString())
    },
    context
  );
}

function parseChatAttachments(input: string | null, context: PersistedRecoveryContext): ChatAttachment[] | undefined {
  if (!input) {
    return undefined;
  }

  const parsed = parseJsonArrayOrEmpty(input);
  const attachments = parsed
    .map((attachment, index) => {
      if (!attachment || typeof attachment !== "object" || Array.isArray(attachment)) {
        recordPersistenceRecovery(context, `invalid attachment at index ${index}`);
        return undefined;
      }
      const record = attachment as Record<string, unknown>;
      return safeParsePersisted(
        chatAttachmentSchema,
        {
          ...record,
          name: normalizeRequiredString(record.name, 256, "Recovered attachment"),
          mimeType: normalizeRequiredString(record.mimeType, 256, "application/octet-stream"),
          sizeBytes: normalizeInteger(record.sizeBytes, 1, 16 * 1024 * 1024, 1),
          key: normalizeRequiredString(record.key, 512, "recovered"),
          uploadedAt: normalizeRequiredString(record.uploadedAt, 256, new Date().toISOString())
        },
        { ...context, field: `${context.field ?? "attachments"}[${index}]` }
      );
    })
    .filter((attachment): attachment is ChatAttachment => attachment !== undefined)
    .slice(0, 8);

  if (attachments.length === 0) {
    return undefined;
  }
  return attachments;
}

function parseAssistantTodoIds(input: string | null): string[] | undefined {
  if (!input) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(input);
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string").slice(0, 32) : [];
  } catch {
    return [];
  }
}

function parseExecutionPlan(input: string | null): ExecutionPlan | undefined {
  if (!input) {
    return undefined;
  }

  try {
    return executionPlanSchema.parse(JSON.parse(input));
  } catch {
    return undefined;
  }
}

function parseCorrectnessReview(input: string | null): CorrectnessReview | undefined {
  if (!input) {
    return undefined;
  }

  try {
    return correctnessReviewSchema.parse(JSON.parse(input));
  } catch {
    return undefined;
  }
}

function buildRunRuntimeBudget(maxTurns: number, turnsUsed: number, reservedCurrentTurn: boolean) {
  const boundedMaxTurns = normalizeInteger(maxTurns, 1, 1000, 1);
  const boundedTurnsUsed = normalizeInteger(turnsUsed, 0, boundedMaxTurns, 0);
  const remainingTurns = Math.max(0, boundedMaxTurns - boundedTurnsUsed);
  const exhausted = remainingTurns === 0;
  return {
    maxTurns: boundedMaxTurns,
    turnsUsed: boundedTurnsUsed,
    currentTurn: reservedCurrentTurn ? boundedTurnsUsed : exhausted ? boundedTurnsUsed : boundedTurnsUsed + 1,
    remainingTurns,
    exhausted
  };
}

function parseBrowserSessions(input: string | null): BrowserSession[] | undefined {
  if (!input) {
    return undefined;
  }

  const sessions = parseJsonArrayOrEmpty(input)
    .map((session, index) =>
      safeParsePersisted(browserSessionSchema, session, {
        table: "agent_runs",
        field: `browser_sessions_json[${index}]`
      })
    )
    .filter((session): session is BrowserSession => session !== undefined)
    .slice(0, 32);
  if (sessions.length === 0) {
    return undefined;
  }
  return sessions;
}

function parseToolActivities(input: string | null): ExecutionToolActivity[] | undefined {
  if (!input) {
    return undefined;
  }

  const activities = parseJsonArrayOrEmpty(input)
    .map((activity, index) =>
      safeParsePersisted(executionToolActivitySchema, activity, {
        table: "agent_runs",
        field: `tool_activities_json[${index}]`
      })
    )
    .filter((activity): activity is ExecutionToolActivity => activity !== undefined)
    .slice(-512);
  if (activities.length === 0) {
    return undefined;
  }
  return activities;
}

function parseBackgroundJobDefinition(kind: BackgroundJob["kind"], input: string | null) {
  const parsed = parseJsonObjectOrUndefined(input);
  const fallback =
    kind === "shell"
      ? {
          kind: "shell",
          executable: "echo",
          args: ["Recovered background job definition"],
          timeoutSeconds: 60
        }
      : {
          kind: "ai-routine",
          prompt: "Recovered background job prompt."
        };
  const value: Record<string, unknown> = parsed ?? fallback;
  if (value.kind !== kind) {
    value.kind = kind;
  }
  if (kind === "shell") {
    value.executable = normalizeRequiredString(value.executable, 1024, "echo");
    value.args = parseUnknownStringArray(value.args, 64, 4096);
    value.cwd = normalizeOptionalString(value.cwd, 4096);
    value.envRefs = parseUnknownStringArray(value.envRefs, 32, 128);
    value.timeoutSeconds = normalizeInteger(value.timeoutSeconds, 1, 24 * 60 * 60, 60);
  } else {
    value.prompt = normalizeRequiredString(value.prompt, 32000, "Recovered background job prompt.");
    value.modeId = normalizeOptionalString(value.modeId, 128);
    value.executionModelId = normalizeOptionalString(value.executionModelId, 256);
    value.reasoningStrength = normalizeComposerReasoningStrength(value.reasoningStrength);
  }
  return value;
}

function parseBackgroundJobSchedule(input: string | null, fallbackDate: string) {
  const parsed = parseJsonObjectOrUndefined(input);
  const value = parsed ?? {
    type: "interval",
    intervalSeconds: 60,
    nextRunAt: fallbackDate,
    sourceText: "recovered"
  };
  if (value.type === "one-off") {
    value.runAt = normalizeRequiredString(value.runAt, 256, fallbackDate);
    value.consumedAt = normalizeOptionalString(value.consumedAt, 256);
    value.sourceText = normalizeRequiredString(value.sourceText, 512, "recovered");
    return value;
  }
  if (value.type === "cron") {
    value.expression = normalizeRequiredString(value.expression, 256, "* * * * *");
    value.timezone = normalizeRequiredString(value.timezone, 128, "UTC");
    value.nextRunAt = normalizeRequiredString(value.nextRunAt, 256, fallbackDate);
    value.sourceText = normalizeRequiredString(value.sourceText, 512, "recovered");
    return value;
  }
  value.type = "interval";
  value.intervalSeconds = normalizeInteger(value.intervalSeconds, 60, 365 * 24 * 60 * 60, 60);
  value.nextRunAt = normalizeRequiredString(value.nextRunAt, 256, fallbackDate);
  value.sourceText = normalizeRequiredString(value.sourceText, 512, "recovered");
  return value;
}

function parseStringArray(input: string | null, maxItems: number = Number.MAX_SAFE_INTEGER, maxItemLength: number = Number.MAX_SAFE_INTEGER) {
  if (!input) {
    return [];
  }

  try {
    const parsed = JSON.parse(input);
    return parseUnknownStringArray(parsed, maxItems, maxItemLength);
  } catch {
    return [];
  }
}

function parseUnknownStringArray(input: unknown, maxItems: number, maxItemLength: number) {
  return Array.isArray(input)
    ? input
        .filter((value): value is string => typeof value === "string")
        .map((value) => normalizeRequiredString(value, maxItemLength, "Recovered"))
        .slice(0, maxItems)
    : [];
}

function deriveMemoryFreshness(row: Pick<MemoryEntryRow, "updated_at" | "last_hit_at">): MemoryEntry["freshness"] {
  const reference = row.last_hit_at ?? row.updated_at;
  const ageMs = Date.now() - new Date(reference).getTime();
  if (!Number.isFinite(ageMs) || ageMs < 1000 * 60 * 60 * 24 * 14) {
    return memoryFreshnessSchema.parse("fresh");
  }
  if (ageMs < 1000 * 60 * 60 * 24 * 60) {
    return memoryFreshnessSchema.parse("aging");
  }
  return memoryFreshnessSchema.parse("stale");
}

function createFallbackPlanningChoices(placeholder: string): PlanningChoice[] {
  return [
    { id: "choice-1", label: "Use example", description: "Send example answer.", answerText: placeholder, recommended: true },
    { id: "choice-2", label: "Confirm", description: "Send short confirmation.", answerText: placeholder, recommended: false },
    { id: "choice-3", label: "Custom", description: "Type custom answer.", answerText: placeholder, recommended: false }
  ];
}

function getThreadBadgeState(run?: AgentRunState): ThreadBadgeState {
  if (!run) {
    return "idle";
  }
  if (run.status === "failed" || run.status === "partial-complete") {
    return "error";
  }
  if (run.status === "awaiting-user-input") {
    return "needs-input";
  }
  if (run.status === "planning" || run.status === "ready") {
    return "planning";
  }
  if (run.status === "running-main" || run.status === "running-subagents" || run.status === "aggregating") {
    return "executing";
  }
  if (run.status === "completed") {
    return "done";
  }
  return "idle";
}

function summarizeMessagePreview(content: string) {
  const compact = content.replace(/\s+/g, " ").trim();
  return compact.length <= 80 ? compact : `${compact.slice(0, 77)}...`;
}

function normalizeAssistantLearningText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeAssistantLearning(value: string) {
  return new Set(
    normalizeAssistantLearningText(value)
      .split(" ")
      .map((token) => normalizeAssistantLearningToken(token))
      .filter((token) => token.length > 1 && !ASSISTANT_LEARNING_STOP_WORDS.has(token))
  );
}

function isGarbageAssistantLearningSummary(summary: string) {
  return GARBAGE_ASSISTANT_LEARNING_SUMMARIES.has(normalizeAssistantLearningText(summary));
}

function normalizeAssistantLearningToken(token: string) {
  if (token.length > 5 && token.endsWith("ies")) {
    return `${token.slice(0, -3)}y`;
  }
  if (token.length > 5 && token.endsWith("ied")) {
    return `${token.slice(0, -3)}y`;
  }
  if (token.length > 4 && token.endsWith("ed")) {
    const base = token.slice(0, -2);
    return base.endsWith("s") ? `${base}e` : base;
  }
  if (token.length > 5 && token.endsWith("er")) {
    const base = token.slice(0, -2);
    return base.endsWith("s") ? `${base}e` : base;
  }
  if (token.length > 5 && token.endsWith("est")) {
    return token.slice(0, -3);
  }
  if (token.length > 4 && token.endsWith("s")) {
    return token.slice(0, -1);
  }
  return token;
}

function tokenSmallerSetOverlap(left: Set<string>, right: Set<string>) {
  const smallerSize = Math.min(left.size, right.size);
  if (smallerSize === 0) {
    return left.size === right.size ? 1 : 0;
  }
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) {
      intersection += 1;
    }
  }
  return intersection / smallerSize;
}

function parseNormativeAssistantLearning(summary: string) {
  const normalized = summary.replace(/\s+/g, " ").trim();
  const match = /^(?<premise>.+?)\s+(?<verb>needs?|should|must|requires?)\s+(?<guidance>.+?)\.?$/iu.exec(normalized);
  const premise = match?.groups?.premise?.trim();
  const verb = normalizeNormativeAssistantLearningVerb(match?.groups?.verb?.trim().toLowerCase() ?? "");
  const guidance = match?.groups?.guidance?.replace(/[.?!]+$/u, "").trim();
  if (!premise || !verb || !guidance) {
    return undefined;
  }
  if (/[":;?]/u.test(premise) || /[":;?]/u.test(guidance)) {
    return undefined;
  }
  return { premise, verb, guidance };
}

function normalizeNormativeAssistantLearningVerb(verb: string) {
  if (verb === "needs") {
    return "need";
  }
  if (verb === "requires") {
    return "require";
  }
  return verb;
}

function mergeAssistantLearningSummaries(existing: AssistantLearning, candidate: AssistantLearning) {
  const existingNormative = parseNormativeAssistantLearning(existing.summary);
  const candidateNormative = parseNormativeAssistantLearning(candidate.summary);
  if (!existingNormative || !candidateNormative) {
    return undefined;
  }
  const guidance = mergeAssistantLearningGuidance(existingNormative.guidance, candidateNormative.guidance);
  if (!guidance) {
    return undefined;
  }
  const summary = `${existingNormative.premise} ${existingNormative.verb} ${guidance}.`;
  if (summary.length > 4000) {
    return undefined;
  }
  return {
    ...existing,
    summary,
    source: normalizeAssistantLearningSource(
      mergeUniqueStrings([existing.source, candidate.source]).join("; ")
    ),
    confidence: strongerAssistantLearningConfidence(existing.confidence, candidate.confidence),
    supersedesLearningIds: mergeUniqueStrings([
      ...(existing.supersedesLearningIds ?? []),
      ...(candidate.supersedesLearningIds ?? [])
    ]),
    compactedAt: existing.compactedAt,
    createdAt: existing.createdAt
  };
}

function mergeAssistantLearningGuidance(existingGuidance: string, candidateGuidance: string) {
  const phrases = new Map<string, string>();
  for (const phrase of splitAssistantLearningGuidance(existingGuidance)) {
    phrases.set(normalizeAssistantLearningText(phrase), phrase);
  }
  let added = false;
  for (const phrase of splitAssistantLearningGuidance(candidateGuidance)) {
    const key = normalizeAssistantLearningText(phrase);
    if (!phrases.has(key)) {
      phrases.set(key, phrase);
      added = true;
    }
  }
  if (!added) {
    return existingGuidance;
  }
  return [...phrases.values()].join(" and ");
}

function splitAssistantLearningGuidance(guidance: string) {
  return guidance
    .split(/\s+(?:and|,)\s+/iu)
    .map((part) => part.replace(/[.?!]+$/u, "").trim())
    .filter(Boolean);
}

function shouldSkipSimilarAssistantLearning(existing: AssistantLearning, candidate: AssistantLearning) {
  const existingKey = normalizeAssistantLearningText(existing.summary);
  const candidateKey = normalizeAssistantLearningText(candidate.summary);
  if (existingKey === candidateKey || existing.id === candidate.id) {
    return false;
  }
  if (isAssistantQuestionPolicyFollowup(existing.source, candidate.source)) {
    return false;
  }
  const existingTokens = tokenizeAssistantLearning(existing.summary);
  const candidateTokens = tokenizeAssistantLearning(candidate.summary);
  return (
    existingKey.includes(candidateKey) ||
    candidateKey.includes(existingKey) ||
    tokenSmallerSetOverlap(existingTokens, candidateTokens) >= ASSISTANT_LEARNING_SIMILAR_SENTIMENT_THRESHOLD
  );
}

function isAssistantQuestionPolicyFollowup(left: string, right: string) {
  const families = new Set([left, right].map((source) => source.split(":")[0]?.toLowerCase() ?? source.toLowerCase()));
  return families.has("question") && families.has("question-policy");
}

function tokenJaccardSimilarity(left: Set<string>, right: Set<string>) {
  if (left.size === 0 && right.size === 0) {
    return 1;
  }
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) {
      intersection += 1;
    }
  }
  return intersection / (left.size + right.size - intersection);
}

function assistantLearningConfidenceRank(confidence: AssistantLearning["confidence"]) {
  switch (confidence) {
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
      return 1;
  }
}

function strongerAssistantLearningConfidence(
  left: AssistantLearning["confidence"],
  right: AssistantLearning["confidence"]
) {
  return assistantLearningConfidenceRank(right) > assistantLearningConfidenceRank(left) ? right : left;
}

function shouldReplaceAssistantLearning(existing: AssistantLearning, candidate: AssistantLearning) {
  const confidenceImproved =
    assistantLearningConfidenceRank(candidate.confidence) > assistantLearningConfidenceRank(existing.confidence);
  if (confidenceImproved) {
    return true;
  }
  const candidateCreatedAt = new Date(candidate.createdAt).getTime();
  const existingCreatedAt = new Date(existing.createdAt).getTime();
  return Number.isFinite(candidateCreatedAt) && Number.isFinite(existingCreatedAt) && candidateCreatedAt >= existingCreatedAt;
}

function mergeUniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function normalizeThreadTitle(title: string) {
  const normalized = title.replace(/\s+/g, " ").trim();
  if (!normalized) {
    throw new Error("Thread title is required");
  }

  return normalized.slice(0, 256);
}

function toGeneratedThreadTitle(content: string | undefined, fallback: string) {
  if (!content) {
    return fallback;
  }

  const firstLine = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  return firstLine ? normalizeThreadTitle(firstLine.slice(0, 256)) : fallback;
}

function scopePlanningQuestionId(runId: string, questionId: string) {
  return createStableBoundedId([runId, questionId]);
}

function toForkableTranscriptMessage(message: ChatMessage): ChatMessage[] {
  if ((message.kind ?? "plain") !== "plain") {
    return [];
  }

  return [
    {
      ...message,
      kind: "plain",
      metadata: undefined
    }
  ];
}

function isTerminalAgentRunStatus(status: AgentRunStatus) {
  return status === "completed" || status === "partial-complete" || status === "stopped" || status === "failed";
}

function mapAgentRunStatusToBackgroundRunStatus(status: AgentRunStatus): BackgroundJobRunStatus | undefined {
  switch (status) {
    case "completed":
      return "succeeded";
    case "partial-complete":
    case "failed":
      return "failed";
    case "stopped":
      return "cancelled";
    default:
      return undefined;
  }
}

function getBackgroundRunAgeMs(run: BackgroundJobRun, now: Date) {
  const startedAt = Date.parse(run.startedAt ?? run.queuedAt);
  if (!Number.isFinite(startedAt)) {
    return 0;
  }
  return Math.max(0, now.getTime() - startedAt);
}

function getBackgroundRunLastProgressAgeMs(run: BackgroundJobRun, now: Date) {
  const timestamp = Date.parse(run.lastHeartbeatAt ?? run.updatedAt ?? run.startedAt ?? run.queuedAt);
  if (!Number.isFinite(timestamp)) {
    return 0;
  }
  return Math.max(0, now.getTime() - timestamp);
}

function formatBackgroundRunTimeoutDetail(run: BackgroundJobRun, now: Date, reason: string) {
  const ageMs = getBackgroundRunAgeMs(run, now);
  const progressAgeMs = getBackgroundRunLastProgressAgeMs(run, now);
  return `${reason}; active ${Math.floor(ageMs / 1000)}s; last progress ${Math.floor(progressAgeMs / 1000)}s ago.`;
}

function isRunResumable(status: AgentRunStatus, hasExecutionState: boolean) {
  if (status === "partial-complete" || status === "stopped") {
    return true;
  }

  return status === "failed" ? hasExecutionState : false;
}

function isRunRetryable(status: AgentRunStatus, hasExecutionState: boolean) {
  if (status === "completed" || status === "partial-complete" || status === "stopped") {
    return true;
  }

  return status === "failed" ? hasExecutionState : false;
}

function toAgentRunSummary(run: AgentRunState): AgentRunSummary {
  return {
    id: run.id,
    threadId: run.threadId,
    status: run.status,
    failureMessage: run.failureMessage,
    failureCategory: run.failureCategory,
    promptStats: run.promptStats,
    resumable: run.resumable,
    retryable: run.retryable,
    updatedAt: run.updatedAt,
    completedAt: run.completedAt
  };
}

function hashPromptText(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function buildRunPromptStats(input: {
  promptChars: number | null | undefined;
  promptHash: string | null | undefined;
  transcriptChars?: number | null | undefined;
  latestTaskChars?: number | null | undefined;
}): RunPromptStats | undefined {
  if (!input.promptHash || !Number.isFinite(input.promptChars ?? Number.NaN)) {
    return undefined;
  }

  return {
    promptChars: normalizeInteger(input.promptChars ?? 0, 0, 2_000_000, 0),
    promptHash: normalizeRequiredString(input.promptHash, 64, "recovered-prompt"),
    transcriptChars: normalizeOptionalInteger(input.transcriptChars ?? null, 0, 2_000_000),
    latestTaskChars: normalizeOptionalInteger(input.latestTaskChars ?? null, 0, 2_000_000)
  };
}

function normalizeRunFailureCategory(value: unknown) {
  if (typeof value !== "string" || value.length === 0) {
    return undefined;
  }

  return safeParsePersisted(runFailureCategorySchema, value, {
    table: "runtime",
    rowId: "failure-category"
  });
}

function mapGeminiCachedContentRow(row: GeminiCachedContentRow): GeminiCachedContentRecord {
  return {
    projectId: row.project_id as ProjectId,
    modelId: row.model_id,
    attachmentSetHash: row.attachment_set_hash,
    cachedContentName: row.cached_content_name,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function resolveBackgroundBackoffUntil(now: Date, consecutiveFailureCount: number) {
  if (consecutiveFailureCount < 3) {
    return null;
  }

  const backoffMinutes =
    consecutiveFailureCount === 3
      ? 5
      : consecutiveFailureCount === 4
        ? 15
        : consecutiveFailureCount === 5
          ? 60
          : 360;
  return new Date(now.getTime() + backoffMinutes * 60_000).toISOString();
}

export function normalizeProjectRootPath(rootPath: string) {
  const trimmedPath = normalizeWindowsEscapedPath(rootPath.trim());
  if (!trimmedPath) {
    throw new Error("Project path is required");
  }

  if (!path.isAbsolute(trimmedPath)) {
    throw new Error("Project path must be absolute");
  }

  return realpathSync(trimmedPath);
}

export function normalizeWindowsEscapedPath(value: string) {
  if (/^[a-zA-Z]:\\\\/.test(value)) {
    return value.replace(/\\\\/g, "\\");
  }

  return value;
}

function ensureDirectoryExists(rootPath: string) {
  const stats = statSync(rootPath, { throwIfNoEntry: false });
  if (!stats || !stats.isDirectory()) {
    throw new Error(`Project path is not a directory: ${rootPath}`);
  }
}

class ThreadLoadError extends Error {
  readonly threadId: ThreadId;
  readonly cause: unknown;

  constructor(projectId: ProjectId, threadId: ThreadId, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(`Failed to load thread ${threadId} for project ${projectId}: ${detail}`);
    this.threadId = threadId;
    this.cause = cause;
  }
}
