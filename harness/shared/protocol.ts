import { z } from "zod";

export const requestIdSchema = z.string().min(1).max(128);
export const sessionIdSchema = z.string().min(1).max(128);
export const threadIdSchema = z.string().min(1).max(128);
export const projectIdSchema = z.string().min(1).max(128);
export const runIdSchema = z.string().min(1).max(128);
export const experimentIdSchema = z.string().min(1).max(128);
export const memoryEntryIdSchema = z.string().min(1).max(128);
export const memoryRetrievalIdSchema = z.string().min(1).max(128);
export const backgroundJobIdSchema = z.string().min(1).max(128);
export const backgroundJobRunIdSchema = z.string().min(1).max(128);
export const assistantIdSchema = z.string().min(1).max(128);
export const assistantThreadIdSchema = z.string().min(1).max(128);
export const assistantTodoIdSchema = z.string().min(1).max(128);
export const assistantLearningIdSchema = z.string().min(1).max(128);
export const assistantQuestionIdSchema = z.string().min(1).max(128);
export const assistantLogEntryIdSchema = z.string().min(1).max(128);
export const assistantAssetRefIdSchema = z.string().min(1).max(128);
export const questionIdSchema = z.string().min(1).max(128);
export const planningChoiceIdSchema = z.string().min(1).max(128);
export const modeIdSchema = z.string().min(1).max(128);
export const projectNameSchema = z.string().min(1).max(256);
export const projectRootPathSchema = z.string().min(1).max(4096);
export const projectSearchRepoKindSchema = z.enum(["git-repo", "folder"]);
export const projectSearchMatchKindSchema = z.enum(["exact", "path-prefix", "name-prefix", "substring"]);
export const threadTitleSchema = z.string().trim().min(1).max(256);
export const agentIdSchema = z.enum(["pi", "copilot-cli", "codex-cli"]);
export const providerBrandSchema = z.enum(["gpt", "gemini"]);
export const runtimeKindSchema = z.enum(["sdk", "cli"]);
export const modelDiscoveryConfidenceSchema = z.enum(["exact", "partial", "unknown"]);
export const composerReasoningStrengthSchema = z.enum(["low", "medium", "high", "extra-high"]);
export const setupLaunchModeSchema = z.enum(["source", "portable-launcher"]);
export const setupCheckStatusSchema = z.enum(["ready", "action-required", "warning", "unsupported"]);
export const setupActionKindSchema = z.enum([
  "open-project-switcher",
  "open-preferences",
  "refresh-runtime-health",
  "copy-command",
  "open-url",
  "start-tutorial"
]);
export const subagentWorktreeStrategySchema = z.enum(["same-worktree", "separate-worktrees"]);
export const runExecutionTargetSchema = z.enum(["current-project", "ephemeral-experiment"]);
export const planExecutionModeSchema = z.enum(["countdown", "approve", "immediate"]);
export const correctnessIterationModeSchema = z.enum(["ask-before-iterate", "auto-once", "auto-until-clean"]);
export const dirtyGitChangeLimitSchema = z.number().int().min(0).max(10000);
export const autoCompactContextThresholdPercentSchema = z.number().int().min(10).max(95);
export const preflightSeveritySchema = z.enum(["warning"]);
export const preflightKindSchema = z.enum(["git-dirty"]);
export const threadTitleSourceSchema = z.enum(["generated", "custom"]);
export const threadBadgeStateSchema = z.enum(["idle", "needs-input", "planning", "executing", "error", "done"]);
export const backgroundJobKindSchema = z.enum(["ai-routine", "shell"]);
export const backgroundJobStatusSchema = z.enum(["enabled", "paused", "disabled"]);
export const backgroundJobRunStatusSchema = z.enum([
  "queued",
  "awaiting-approval",
  "awaiting-user-input",
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "skipped"
]);
export const backgroundJobRiskLevelSchema = z.enum(["safe", "slightly-unsafe", "unsafe"]);
export const backgroundJobApprovalPolicySchema = z.enum(["allow-all", "allow-safe", "ask-risky", "always-ask"]);
export const backgroundJobThreadKindSchema = z.enum(["user", "automation"]);
export const modeScopeSchema = z.enum(["builtin", "workspace", "project"]);
export const modeToolPolicySchema = z.enum(["full-access", "read-heavy", "review-only"]);
export const modeExecutionAccessSchema = z.enum(["workspace-write", "read-only"]);
export const capabilityTagSchema = z.enum(["tools", "vision", "browser", "long-context", "fast", "expensive"]);
export const assistantScopeSchema = z.enum(["global", "project"]);
export const assistantRunStateSchema = z.enum(["active", "paused"]);
export const assistantBootstrapStateSchema = z.enum(["pending", "running", "completed", "failed"]);
export const assistantCircuitBreakerStateSchema = z.enum(["closed", "tripped"]);
export const assistantTodoStateSchema = z.enum(["pending", "in-progress", "blocked", "completed", "failed", "cancelled"]);
export const assistantQuestionStatusSchema = z.enum(["pending", "deferred", "answered", "dismissed"]);
export const assistantLearningConfidenceSchema = z.enum(["low", "medium", "high"]);
export const assistantLogLevelSchema = z.enum(["info", "warning", "error", "critical"]);
export const assistantAssetRefKindSchema = z.enum(["skill", "script", "mode", "background-template"]);
export const chatAttachmentKindSchema = z.enum(["image", "text", "document"]);
export const chatDocumentTypeSchema = z.enum(["pdf", "docx", "xlsx", "pptx", "odt"]);
export const providerModelIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9._:-]+\/[a-zA-Z0-9._:-]+$/, "Model ids must be provider-qualified");
export const executionModelIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^(?:[a-zA-Z0-9._:-]+\/)?[a-zA-Z0-9._:-]+$/, "Execution model ids must be provider-qualified or bare CLI ids");

export const chatRoleSchema = z.enum(["system", "user", "assistant"]);
export const chatMessageKindSchema = z.enum(["plain", "plan-summary"]);
export const connectionStateSchema = z.enum(["disconnected", "connecting", "connected", "error"]);
export const agentTraceStageSchema = z.enum([
  "planning",
  "planning-question",
  "routing",
  "plan-presented",
  "run-resume",
  "branchfs-mounted",
  "branchfs-inherit-dirty",
  "branchfs-diff-read",
  "branchfs-flushed",
  "branchfs-unmounted",
  "worktree-provision",
  "worktree-cleanup",
  "prerequisite-start",
  "prerequisite-complete",
  "subagent-start",
  "subagent-spawn-timing",
  "subagent-complete",
  "subagent-retry",
  "subagent-error",
  "merge-start",
  "merge-conflict",
  "merge-complete",
  "execution-start",
  "execution-complete",
  "aggregation-start",
  "aggregation-complete",
  "correctness-start",
  "correctness-gap",
  "correctness-complete",
  "verification-start",
  "verification-complete",
  "sync-back",
  "refresh-requested",
  "refresh-deferred",
  "refresh-complete"
]);

export const experimentRunStatusSchema = z.enum([
  "prepared",
  "running",
  "completed",
  "partial-complete",
  "failed",
  "promoted",
  "discarded"
]);

export const experimentRunSchema = z.object({
  id: experimentIdSchema,
  runId: runIdSchema,
  status: experimentRunStatusSchema,
  virtualBranchName: z.string().min(1).max(256),
  repoMountPath: z.string().min(1).max(4096),
  projectMountPath: z.string().min(1).max(4096),
  baseCommitSha: z.string().min(1).max(256).optional(),
  baseBranchName: z.string().min(1).max(256).optional(),
  baseDirtyFingerprint: z.string().min(1).max(256),
  headCommitSha: z.string().min(1).max(256).optional(),
  filesChanged: z.number().int().min(0),
  insertions: z.number().int().min(0),
  deletions: z.number().int().min(0),
  createdAt: z.string().datetime().or(z.string().min(1)),
  updatedAt: z.string().datetime().or(z.string().min(1)),
  promotedAt: z.string().datetime().or(z.string().min(1)).optional(),
  discardedAt: z.string().datetime().or(z.string().min(1)).optional()
});

export const experimentInspectionSchema = z.object({
  experiment: experimentRunSchema,
  diffText: z.string(),
  filesChanged: z.number().int().min(0),
  insertions: z.number().int().min(0),
  deletions: z.number().int().min(0),
  changedPaths: z.array(z.string().min(1)).max(512)
});

export const memoryEntryKindSchema = z.enum([
  "repo-fact",
  "task-summary",
  "success-pattern",
  "failure-pattern",
  "verification-recipe",
  "fallback-strategy",
  "prompt-fragment",
  "user-correction"
]);

export const memoryEntryStatusSchema = z.enum(["active", "archived"]);
export const memoryConfidenceSchema = z.enum(["low", "medium", "high"]);
export const memoryFreshnessSchema = z.enum(["fresh", "aging", "stale"]);

export const memoryEntrySchema = z.object({
  id: memoryEntryIdSchema,
  projectId: projectIdSchema.optional(),
  threadId: threadIdSchema.optional(),
  runId: runIdSchema.optional(),
  kind: memoryEntryKindSchema,
  status: memoryEntryStatusSchema,
  title: z.string().min(1).max(256),
  summary: z.string().min(1).max(4000),
  evidence: z.string().min(1).max(16000).optional(),
  tags: z.array(z.string().min(1).max(128)).max(32),
  pathGlobs: z.array(z.string().min(1).max(512)).max(64),
  confidence: memoryConfidenceSchema,
  freshness: memoryFreshnessSchema,
  pinned: z.boolean(),
  hitCount: z.number().int().min(0),
  lastHitAt: z.string().datetime().or(z.string().min(1)).optional(),
  sourceCommitSha: z.string().min(1).max(256).optional(),
  createdAt: z.string().datetime().or(z.string().min(1)),
  updatedAt: z.string().datetime().or(z.string().min(1))
});

export const memoryRetrievalSchema = z.object({
  id: memoryRetrievalIdSchema,
  runId: runIdSchema,
  owner: z.enum(["planner", "main", "subagent"]),
  subagentId: z.string().min(1).max(128).optional(),
  queryText: z.string().min(1).max(32000),
  entryIds: z.array(memoryEntryIdSchema).max(16),
  createdAt: z.string().datetime().or(z.string().min(1))
});

export const planPrerequisiteSchema = z.object({
  id: z.string().min(1).max(128),
  title: z.string().min(1),
  instruction: z.string().min(1),
  reason: z.string().min(1),
  requiredForTaskIds: z.array(z.string().min(1).max(128)),
  owner: z.enum(["main", "subagent"]),
  status: z.enum(["pending", "completed"])
});

export const subagentContractSchema = z.object({
  taskId: z.string().min(1).max(128),
  title: z.string().min(1),
  instruction: z.string().min(1),
  effortPoints: z.number().int().min(1).max(5),
  ownedPaths: z.array(z.string().min(1)).max(32),
  dependsOnPrerequisiteIds: z.array(z.string().min(1).max(128)).max(16),
  deliverables: z.array(z.string().min(1)).max(16),
  integrationPoints: z.array(z.string().min(1)).max(16),
  verificationScope: z.enum(["owned-files-only", "worktree-full"]),
  verificationCommands: z.array(z.string().min(1)).max(16),
  mergeNotes: z.string().min(1)
});

export const correctnessGapSchema = z.object({
  id: z.string().min(1).max(128),
  category: z.enum(["plan-gap", "runnable-gap", "quality-gap"]),
  severity: z.enum(["high", "medium", "low"]),
  description: z.string().min(1),
  suggestedFix: z.string().min(1),
  canParallelize: z.boolean(),
  ownedPaths: z.array(z.string().min(1)).max(32)
});

export const executionPlanSchema = z.object({
  runId: runIdSchema,
  origin: z.enum(["initial", "quick-task", "correctness-followup"]),
  iteration: z.number().int().min(1),
  summary: z.string().min(1),
  finalExecutionBrief: z.string().min(1),
  difficultyScore: z.number().min(0).max(100),
  planningModelId: providerModelIdSchema,
  executionModelId: executionModelIdSchema,
  route: z.enum(["main", "pi-subagents"]),
  subagentWorktreeStrategy: subagentWorktreeStrategySchema,
  targetSubagentCount: z.number().int().min(0).max(10),
  actualSubagentCount: z.number().int().min(0).max(10),
  gating: z.object({
    mode: planExecutionModeSchema,
    delaySeconds: z.number().int().min(0).max(300)
  }),
  mode: z.lazy(() => modeDefinitionSchema).optional(),
  ruleSources: z.array(z.lazy(() => workspaceRuleSourceSchema)).max(4).optional(),
  memorySummaries: z.array(z.lazy(() => memorySummarySchema)).max(4).optional(),
  prerequisites: z.array(planPrerequisiteSchema).max(16),
  contracts: z.array(subagentContractSchema).max(16),
  correctnessPolicy: correctnessIterationModeSchema
});

export const correctnessReviewSchema: z.ZodType<{
  status: "pass" | "needs-iteration";
  summary: string;
  gaps: z.infer<typeof correctnessGapSchema>[];
  recommendedPlan?: z.infer<typeof executionPlanSchema>;
}> = z.object({
  status: z.enum(["pass", "needs-iteration"]),
  summary: z.string().min(1),
  gaps: z.array(correctnessGapSchema).max(16),
  recommendedPlan: executionPlanSchema.optional()
});

export const planSummaryMessageMetadataSchema = z.object({
  type: z.literal("plan-summary"),
  runId: runIdSchema,
  plan: executionPlanSchema
});

export const chatMessageMetadataSchema = z.discriminatedUnion("type", [planSummaryMessageMetadataSchema]);

export const chatAttachmentSchema = z.object({
  id: z.string().min(1).max(128),
  kind: chatAttachmentKindSchema,
  documentType: chatDocumentTypeSchema.optional(),
  name: z.string().min(1).max(256),
  mimeType: z.string().min(1).max(256),
  sizeBytes: z.number().int().min(1).max(16 * 1024 * 1024),
  url: z.string().url(),
  key: z.string().min(1).max(512),
  uploadedAt: z.string().datetime().or(z.string().min(1))
});

export const chatMessageSchema = z.object({
  id: z.string().min(1).max(128),
  role: chatRoleSchema,
  kind: chatMessageKindSchema.optional(),
  content: z.string().min(1),
  attachments: z.array(chatAttachmentSchema).max(8).optional(),
  metadata: chatMessageMetadataSchema.optional(),
  createdAt: z.string().datetime().or(z.string().min(1))
});

export const agentOptionSchema = z.object({
  id: agentIdSchema,
  label: z.string().min(1),
  description: z.string().min(1).optional()
});

export const agentRuntimeCapabilitySchema = z.object({
  agentId: agentIdSchema,
  label: z.string().min(1).max(128),
  runtimeKind: runtimeKindSchema,
  installed: z.boolean(),
  authenticated: z.boolean(),
  interactivePipeCompatible: z.boolean(),
  supportsInteractive: z.boolean(),
  supportsProgrammatic: z.boolean(),
  supportsPlanning: z.boolean(),
  supportsReview: z.boolean(),
  supportsReasoningStrengthControl: z.boolean().optional(),
  supportsFastModeControl: z.boolean().optional(),
  version: z.string().min(1).max(256).optional(),
  healthMessage: z.string().min(1).max(1024).optional(),
  installCommand: z.string().min(1).max(1024).optional(),
  authCommand: z.string().min(1).max(1024).optional(),
  docsUrl: z.string().url().optional(),
  discoveredModels: z.array(z.string().min(1).max(256)).max(64),
  activeModel: z.string().min(1).max(256).optional(),
  modelDiscoveryConfidence: modelDiscoveryConfidenceSchema
});

export const modelCapabilitySchema = z.object({
  modelId: providerModelIdSchema,
  providerBrand: providerBrandSchema,
  label: z.string().min(1).max(128),
  tags: z.array(capabilityTagSchema).max(8),
  contextWindow: z.number().int().min(1),
  summary: z.string().min(1).max(256),
  supportedReasoningStrengths: z.array(composerReasoningStrengthSchema).max(4).optional(),
  supportsFastMode: z.boolean().optional()
});

export const providerCapabilitySchema = z.object({
  providerBrand: providerBrandSchema,
  label: z.string().min(1).max(64),
  defaultPlanningModelId: providerModelIdSchema,
  defaultExecutionModelId: providerModelIdSchema,
  defaultSubagentModelId: providerModelIdSchema,
  models: z.array(modelCapabilitySchema).max(16)
});

export const modeDefinitionSchema = z.object({
  id: modeIdSchema,
  scope: modeScopeSchema,
  label: z.string().min(1).max(64),
  description: z.string().min(1).max(256),
  plannerPrompt: z.string().min(1).max(4000),
  executionPrompt: z.string().min(1).max(4000),
  toolPolicy: modeToolPolicySchema,
  executionAccess: modeExecutionAccessSchema,
  planExecutionModeDefault: planExecutionModeSchema.optional(),
  subagentWorktreeStrategyDefault: subagentWorktreeStrategySchema.optional(),
  correctnessIterationModeDefault: correctnessIterationModeSchema.optional(),
  updatedAt: z.string().datetime().or(z.string().min(1))
});

export const workspaceRuleSourceSchema = z.object({
  id: z.string().min(1).max(128),
  scope: z.enum(["workspace", "project"]),
  label: z.string().min(1).max(128),
  content: z.string().min(1).max(32000),
  updatedAt: z.string().datetime().or(z.string().min(1))
});

export const memorySummarySchema = z.object({
  id: z.string().min(1).max(128),
  scope: z.enum(["workspace", "thread"]),
  label: z.string().min(1).max(128),
  content: z.string().min(1).max(32000),
  updatedAt: z.string().datetime().or(z.string().min(1)),
  source: z.enum(["user", "generated"])
});

export const backgroundJobScheduleSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("one-off"),
    runAt: z.string().datetime().or(z.string().min(1)),
    sourceText: z.string().min(1).max(512)
  }),
  z.object({
    type: z.literal("interval"),
    intervalSeconds: z.number().int().min(60).max(365 * 24 * 60 * 60),
    nextRunAt: z.string().datetime().or(z.string().min(1)),
    sourceText: z.string().min(1).max(512)
  }),
  z.object({
    type: z.literal("cron"),
    expression: z.string().min(1).max(256),
    timezone: z.string().min(1).max(128),
    nextRunAt: z.string().datetime().or(z.string().min(1)),
    sourceText: z.string().min(1).max(512)
  })
]);

export const backgroundJobAiRoutineDefinitionSchema = z.object({
  kind: z.literal("ai-routine"),
  prompt: z.string().min(1).max(32000),
  modeId: modeIdSchema.optional(),
  executionModelId: executionModelIdSchema.optional(),
  planExecutionMode: planExecutionModeSchema.optional(),
  subagentWorktreeStrategy: subagentWorktreeStrategySchema.optional()
});

export const backgroundJobShellDefinitionSchema = z.object({
  kind: z.literal("shell"),
  executable: z.string().min(1).max(1024),
  args: z.array(z.string().max(4096)).max(64),
  cwd: z.string().min(1).max(4096).optional(),
  envRefs: z.array(z.string().min(1).max(128)).max(32).optional(),
  timeoutSeconds: z.number().int().min(1).max(24 * 60 * 60),
  networkAccess: z.boolean().optional()
});

export const backgroundJobDefinitionSchema = z.discriminatedUnion("kind", [
  backgroundJobAiRoutineDefinitionSchema,
  backgroundJobShellDefinitionSchema
]);

export const backgroundJobSchema = z.object({
  id: backgroundJobIdSchema,
  projectId: projectIdSchema,
  assistantId: assistantIdSchema.optional(),
  automationThreadId: threadIdSchema,
  templateId: z.string().min(1).max(128).optional(),
  createdFromRunId: runIdSchema.optional(),
  kind: backgroundJobKindSchema,
  name: z.string().min(1).max(256),
  description: z.string().min(1).max(1024).optional(),
  status: backgroundJobStatusSchema,
  riskLevel: backgroundJobRiskLevelSchema,
  definition: backgroundJobDefinitionSchema,
  schedule: backgroundJobScheduleSchema,
  scheduleInput: z.string().min(1).max(512),
  timezone: z.string().min(1).max(128).optional(),
  nextRunAt: z.string().datetime().or(z.string().min(1)).optional(),
  lastRunAt: z.string().datetime().or(z.string().min(1)).optional(),
  lastEnqueuedAt: z.string().datetime().or(z.string().min(1)).optional(),
  createdAt: z.string().datetime().or(z.string().min(1)),
  updatedAt: z.string().datetime().or(z.string().min(1))
});

export const backgroundJobRunEventSchema = z.object({
  id: z.string().min(1).max(128),
  stage: z.string().min(1).max(64),
  message: z.string().min(1).max(4000),
  detail: z.string().min(1).max(16000).optional(),
  createdAt: z.string().datetime().or(z.string().min(1))
});

export const backgroundJobRunSchema = z.object({
  id: backgroundJobRunIdSchema,
  jobId: backgroundJobIdSchema,
  projectId: projectIdSchema,
  assistantId: assistantIdSchema.optional(),
  automationThreadId: threadIdSchema,
  triggerSource: z.enum(["schedule", "startup-catchup", "manual", "approval-release", "retry"]),
  status: backgroundJobRunStatusSchema,
  riskLevel: backgroundJobRiskLevelSchema,
  approvalStatus: z.enum(["not-needed", "pending", "approved", "rejected"]),
  skippedOccurrenceCount: z.number().int().min(0).max(100000),
  linkedAgentRunId: runIdSchema.optional(),
  summary: z.string().min(1).max(4000).optional(),
  failureMessage: z.string().min(1).max(4000).optional(),
  queuedAt: z.string().datetime().or(z.string().min(1)),
  startedAt: z.string().datetime().or(z.string().min(1)).optional(),
  completedAt: z.string().datetime().or(z.string().min(1)).optional(),
  createdAt: z.string().datetime().or(z.string().min(1)),
  updatedAt: z.string().datetime().or(z.string().min(1)),
  events: z.array(backgroundJobRunEventSchema).max(512)
});

export const backgroundJobTemplateSchema = z.object({
  id: z.string().min(1).max(128),
  label: z.string().min(1).max(128),
  description: z.string().min(1).max(512),
  kind: backgroundJobKindSchema,
  definition: backgroundJobDefinitionSchema
});

export const backgroundJobSchedulePreviewSchema = z.object({
  input: z.string().min(1).max(512),
  timezone: z.string().min(1).max(128).optional(),
  schedule: backgroundJobScheduleSchema.optional(),
  error: z.string().min(1).max(1024).optional()
});

export const backgroundJobsStateSchema = z.object({
  jobs: z.array(backgroundJobSchema).max(512),
  runs: z.array(backgroundJobRunSchema).max(2048),
  templates: z.array(backgroundJobTemplateSchema).max(64)
});

export const notificationInboxItemIdSchema = z.string().min(1).max(128);
export const notificationSeveritySchema = z.enum(["info", "warning", "error"]);

const notificationInboxItemBaseSchema = z.object({
  id: notificationInboxItemIdSchema,
  interactive: z.boolean(),
  createdAt: z.string().datetime().or(z.string().min(1)),
  readAt: z.string().datetime().or(z.string().min(1)).optional(),
  archivedAt: z.string().datetime().or(z.string().min(1)).optional()
});

export const planningQuestionNotificationSchema = notificationInboxItemBaseSchema.extend({
  kind: z.literal("planning-question"),
  interactive: z.literal(true),
  projectId: projectIdSchema,
  threadId: threadIdSchema,
  runId: runIdSchema,
  questionId: questionIdSchema,
  prompt: z.string().min(1),
  placeholder: z.string().min(1).optional(),
  choices: z.array(z.lazy(() => planningChoiceSchema)).length(3)
});

export const assistantQuestionNotificationSchema = notificationInboxItemBaseSchema.extend({
  kind: z.literal("assistant-question"),
  interactive: z.literal(true),
  assistantId: assistantIdSchema,
  questionId: assistantQuestionIdSchema,
  prompt: z.string().min(1).max(8000),
  answerText: z.string().min(1).max(32000).optional()
});

export const browserApprovalNotificationSchema = notificationInboxItemBaseSchema.extend({
  kind: z.literal("browser-approval"),
  interactive: z.literal(true),
  projectId: projectIdSchema,
  threadId: threadIdSchema,
  runId: runIdSchema,
  sessionId: sessionIdSchema,
  toolCallId: z.string().min(1).max(256),
  label: z.string().min(1).max(256),
  inputSummary: z.string().min(1).max(4000).optional()
});

export const backgroundRunStatusNotificationSchema = notificationInboxItemBaseSchema.extend({
  kind: z.literal("background-run-status"),
  interactive: z.literal(false),
  backgroundRunId: backgroundJobRunIdSchema,
  jobId: backgroundJobIdSchema,
  projectId: projectIdSchema,
  threadId: threadIdSchema,
  title: z.string().min(1).max(256),
  summary: z.string().min(1).max(4000),
  severity: notificationSeveritySchema
});

export const notificationInboxItemSchema = z.discriminatedUnion("kind", [
  planningQuestionNotificationSchema,
  assistantQuestionNotificationSchema,
  browserApprovalNotificationSchema,
  backgroundRunStatusNotificationSchema
]);

export const notificationInboxStateSchema = z.object({
  items: z.array(notificationInboxItemSchema).max(4096),
  unreadCount: z.number().int().min(0).max(100000),
  interactiveUnreadCount: z.number().int().min(0).max(100000),
  passiveUnreadCount: z.number().int().min(0).max(100000)
});

export const assistantSchema = z.object({
  id: assistantIdSchema,
  name: z.string().trim().min(1).max(256),
  scope: assistantScopeSchema,
  projectId: projectIdSchema.optional(),
  description: z.string().min(1).max(1024).optional(),
  personalityPrompt: z.string().min(1).max(8000),
  jobPrompt: z.string().min(1).max(12000),
  agentId: agentIdSchema,
  modeId: modeIdSchema.optional(),
  executionModelId: executionModelIdSchema.optional(),
  runState: assistantRunStateSchema,
  bootstrapState: assistantBootstrapStateSchema,
  clonedFromAssistantId: assistantIdSchema.optional(),
  failureStreakCount: z.number().int().min(0).max(1000),
  circuitBreakerState: assistantCircuitBreakerStateSchema,
  circuitBreakerReason: z.string().min(1).max(4000).optional(),
  deletedAt: z.string().datetime().or(z.string().min(1)).optional(),
  latestActivityAt: z.string().datetime().or(z.string().min(1)).optional(),
  unreadQuestionCount: z.number().int().min(0).max(10000),
  createdAt: z.string().datetime().or(z.string().min(1)),
  updatedAt: z.string().datetime().or(z.string().min(1))
});

export const assistantThreadSchema = z.object({
  id: assistantThreadIdSchema,
  assistantId: assistantIdSchema,
  sessionId: sessionIdSchema,
  messageCount: z.number().int().min(0).max(100000),
  memorySummary: memorySummarySchema.optional(),
  messages: z.array(chatMessageSchema).max(4096),
  updatedAt: z.string().datetime().or(z.string().min(1))
});

export const assistantTodoSchema = z.object({
  id: assistantTodoIdSchema,
  assistantId: assistantIdSchema,
  title: z.string().trim().min(1).max(512),
  description: z.string().min(1).max(4000).optional(),
  state: assistantTodoStateSchema,
  sortOrder: z.number().int().min(0).max(1000000),
  blockerReason: z.string().min(1).max(4000).optional(),
  source: z.enum(["user", "assistant", "bootstrap", "job", "question"]).optional(),
  createdAt: z.string().datetime().or(z.string().min(1)),
  updatedAt: z.string().datetime().or(z.string().min(1)),
  completedAt: z.string().datetime().or(z.string().min(1)).optional(),
  cancelledAt: z.string().datetime().or(z.string().min(1)).optional()
});

export const assistantLearningSchema = z.object({
  id: assistantLearningIdSchema,
  assistantId: assistantIdSchema,
  summary: z.string().min(1).max(4000),
  source: z.string().min(1).max(256),
  confidence: assistantLearningConfidenceSchema,
  createdAt: z.string().datetime().or(z.string().min(1))
});

export const assistantQuestionSchema = z.object({
  id: assistantQuestionIdSchema,
  assistantId: assistantIdSchema,
  prompt: z.string().min(1).max(8000),
  status: assistantQuestionStatusSchema,
  answerText: z.string().min(1).max(32000).optional(),
  linkedTodoIds: z.array(assistantTodoIdSchema).max(32).optional(),
  askedAt: z.string().datetime().or(z.string().min(1)),
  answeredAt: z.string().datetime().or(z.string().min(1)).optional()
});

export const assistantLogEntrySchema = z.object({
  id: assistantLogEntryIdSchema,
  assistantId: assistantIdSchema,
  level: assistantLogLevelSchema,
  summary: z.string().min(1).max(1024),
  detail: z.string().min(1).max(4000).optional(),
  detailsJson: z.unknown().optional(),
  createdAt: z.string().datetime().or(z.string().min(1))
});

export const assistantAssetRefSchema = z.object({
  id: assistantAssetRefIdSchema,
  assistantId: assistantIdSchema,
  kind: assistantAssetRefKindSchema,
  label: z.string().min(1).max(256),
  value: z.string().min(1).max(4096),
  createdAt: z.string().datetime().or(z.string().min(1))
});

export const assistantsStateSchema = z.object({
  assistants: z.array(assistantSchema).max(512),
  threads: z.array(assistantThreadSchema).max(512),
  todos: z.array(assistantTodoSchema).max(8192),
  learnings: z.array(assistantLearningSchema).max(8192),
  questions: z.array(assistantQuestionSchema).max(4096),
  logs: z.array(assistantLogEntrySchema).max(16384),
  assetRefs: z.array(assistantAssetRefSchema).max(4096)
});

export const executionControlStateSchema = z.object({
  isPaused: z.boolean(),
  deferredPlanningQuestionCount: z.number().int().min(0).max(100000),
  deferredAssistantQuestionCount: z.number().int().min(0).max(100000),
  deferredBrowserApprovalCount: z.number().int().min(0).max(100000)
});

export const setupActionSchema = z.object({
  kind: setupActionKindSchema,
  label: z.string().min(1).max(128),
  value: z.string().min(1).max(4096).optional()
});

export const setupCheckSchema = z.object({
  id: z.string().min(1).max(128),
  title: z.string().min(1).max(256),
  summary: z.string().min(1).max(1024),
  detail: z.string().min(1).max(4000).optional(),
  status: setupCheckStatusSchema,
  requiredForFirstTask: z.boolean(),
  updatedAt: z.string().datetime().or(z.string().min(1)),
  primaryAction: setupActionSchema.optional(),
  secondaryAction: setupActionSchema.optional(),
  docsUrl: z.string().url().optional()
});

export const setupStateSchema = z.object({
  launchMode: setupLaunchModeSchema,
  updatedAt: z.string().datetime().or(z.string().min(1)),
  readyRequiredCount: z.number().int().min(0).max(1000),
  totalRequiredCount: z.number().int().min(0).max(1000),
  checks: z.array(setupCheckSchema).max(32)
});

export const preferencesStateSchema = z.object({
  hasUsableApiKey: z.boolean(),
  hasStoredApiKey: z.boolean(),
  hasUsableOpenAiApiKey: z.boolean(),
  hasStoredOpenAiApiKey: z.boolean(),
  hasUsableGoogleApiKey: z.boolean(),
  hasStoredGoogleApiKey: z.boolean(),
  providerBrand: providerBrandSchema,
  debugEnabledDefault: z.boolean(),
  tracePanelDefaultOpen: z.boolean(),
  subagentWorktreeStrategyDefault: subagentWorktreeStrategySchema,
  blockChatOnDirtyGitDefault: z.boolean(),
  dirtyGitChangeLimitDefault: dirtyGitChangeLimitSchema,
  autoCompactContextThresholdPercentDefault: autoCompactContextThresholdPercentSchema,
  planExecutionModeDefault: planExecutionModeSchema,
  planExecutionDelaySecondsDefault: z.number().int().min(0).max(300),
  correctnessIterationModeDefault: correctnessIterationModeSchema,
  backgroundJobApprovalPolicyDefault: backgroundJobApprovalPolicySchema,
  memoryBankEnabledDefault: z.boolean(),
  attachmentsEnabled: z.boolean(),
  capabilities: z.array(providerCapabilitySchema).max(4),
  agentRuntimes: z.array(agentRuntimeCapabilitySchema).max(8)
});

export const agentPlanSchema = z.object({
  sessionId: sessionIdSchema,
  agentId: agentIdSchema,
  planningModelId: providerModelIdSchema,
  difficultyScore: z.number().min(0).max(100),
  usesSubagents: z.boolean(),
  executionModelId: executionModelIdSchema,
  subtaskCount: z.number().int().min(0),
  executionPlan: executionPlanSchema.optional()
});

export const agentTraceSchema = z.object({
  sessionId: sessionIdSchema,
  stage: agentTraceStageSchema,
  message: z.string().min(1),
  detail: z.string().min(1).optional(),
  subagentId: z.string().min(1).max(128).optional(),
  modelId: executionModelIdSchema.optional(),
  durationMs: z.number().int().min(0).optional()
});

export const projectContextSourceKindSchema = z.enum(["planner", "main", "subagent", "aggregator"]);

export const browserApprovalStatusSchema = z.enum(["pending", "deferred", "approved", "rejected"]);
export const browserSessionStatusSchema = z.enum(["idle", "awaiting-approval", "running", "blocked", "completed", "failed"]);
export const browserActivityKindSchema = z.enum(["navigate", "click", "input", "capture", "extract", "verify", "tool", "unknown"]);
export const browserActivityStatusSchema = z.enum(["pending-approval", "running", "completed", "blocked", "failed"]);

export const browserApprovalSchema = z.object({
  toolCallId: z.string().min(1).max(256),
  toolName: z.string().min(1).max(128),
  kind: browserActivityKindSchema,
  label: z.string().min(1).max(256),
  inputSummary: z.string().min(1).max(4000).optional(),
  status: browserApprovalStatusSchema,
  requestedAt: z.string().datetime().or(z.string().min(1)),
  resolvedAt: z.string().datetime().or(z.string().min(1)).optional(),
  resolutionReason: z.string().min(1).max(4000).optional()
});

export const browserReplayEntrySchema = z.object({
  id: z.string().min(1).max(128),
  status: browserActivityStatusSchema,
  summary: z.string().min(1).max(4000),
  createdAt: z.string().datetime().or(z.string().min(1))
});

export const browserVerificationSchema = z.object({
  id: z.string().min(1).max(128),
  label: z.string().min(1).max(256),
  status: z.enum(["passed", "failed", "unknown"]),
  detail: z.string().min(1).max(4000).optional(),
  createdAt: z.string().datetime().or(z.string().min(1))
});

export const browserActivitySchema = z.object({
  id: z.string().min(1).max(128),
  toolCallId: z.string().min(1).max(256),
  toolName: z.string().min(1).max(128),
  kind: browserActivityKindSchema,
  label: z.string().min(1).max(256),
  inputSummary: z.string().min(1).max(4000).optional(),
  outputSummary: z.string().min(1).max(4000).optional(),
  status: browserActivityStatusSchema,
  startedAt: z.string().datetime().or(z.string().min(1)),
  updatedAt: z.string().datetime().or(z.string().min(1)),
  completedAt: z.string().datetime().or(z.string().min(1)).optional(),
  errorMessage: z.string().min(1).max(4000).optional(),
  approval: browserApprovalSchema.optional(),
  replay: z.array(browserReplayEntrySchema).max(64),
  verification: z.array(browserVerificationSchema).max(32)
});

export const browserSessionSchema = z.object({
  id: z.string().min(1).max(128),
  runId: runIdSchema,
  owner: z.enum(["main", "subagent", "aggregator"]),
  subagentId: z.string().min(1).max(128).optional(),
  status: browserSessionStatusSchema,
  approvalMode: z.literal("per-tool"),
  lastActivityLabel: z.string().min(1).max(256).optional(),
  startedAt: z.string().datetime().or(z.string().min(1)),
  updatedAt: z.string().datetime().or(z.string().min(1)),
  completedAt: z.string().datetime().or(z.string().min(1)).optional(),
  pendingApproval: browserApprovalSchema.optional(),
  activities: z.array(browserActivitySchema).max(256)
});

export const projectContextUsageSchema = z.object({
  sourceKind: projectContextSourceKindSchema,
  sourceLabel: z.string().min(1).max(128),
  modelId: executionModelIdSchema,
  tokens: z.number().int().min(0).optional(),
  contextWindow: z.number().int().min(1),
  usagePercent: z.number().min(0).max(100).optional(),
  totalProcessedTokens: z.number().int().min(0).optional(),
  updatedAt: z.string().datetime().or(z.string().min(1))
});

export const runPreflightSchema = z.object({
  severity: preflightSeveritySchema,
  kind: preflightKindSchema,
  message: z.string().min(1),
  changedFileCount: z.number().int().min(1)
});

export const plannerSubtaskSchema = z.object({
  id: z.string().min(1).max(128),
  title: z.string().min(1),
  instruction: z.string().min(1)
});

export const planningChoiceSchema = z.object({
  id: planningChoiceIdSchema,
  label: z.string().min(1).max(128),
  description: z.string().min(1).max(256),
  answerText: z.string().min(1).max(32000),
  recommended: z.boolean()
});

export const agentRunStatusSchema = z.enum([
  "planning",
  "awaiting-user-input",
  "ready",
  "running-main",
  "running-subagents",
  "aggregating",
  "partial-complete",
  "completed",
  "stopped",
  "failed"
]);

export const planningQuestionStatusSchema = z.enum(["pending", "deferred", "answered"]);

export const planningQuestionSchema = z.object({
  id: questionIdSchema,
  prompt: z.string().min(1),
  placeholder: z.string().min(1).optional(),
  choices: z
    .array(planningChoiceSchema)
    .length(3)
    .refine((choices) => choices.filter((choice) => choice.recommended).length === 1, {
      message: "Planning questions must include exactly one recommended choice"
    }),
  required: z.boolean(),
  status: planningQuestionStatusSchema,
  answerText: z.string().min(1).optional(),
  askedAt: z.string().datetime().or(z.string().min(1)),
  answeredAt: z.string().datetime().or(z.string().min(1)).optional()
});

export const subagentTaskStatusSchema = z.enum(["pending", "running", "completed", "failed"]);

export const subagentTaskStateSchema = z.object({
  id: z.string().min(1).max(128),
  title: z.string().min(1),
  instruction: z.string().min(1),
  status: subagentTaskStatusSchema,
  attemptCount: z.number().int().min(0),
  output: z.string().min(1).optional(),
  errorMessage: z.string().min(1).optional(),
  commitSha: z.string().min(1).optional(),
  mountPath: z.string().min(1).optional(),
  worktreePath: z.string().min(1).optional(),
  startedAt: z.string().datetime().or(z.string().min(1)).optional(),
  completedAt: z.string().datetime().or(z.string().min(1)).optional(),
  updatedAt: z.string().datetime().or(z.string().min(1))
});

export const agentRunStateSchema = z.object({
  id: runIdSchema,
  threadId: threadIdSchema,
  status: agentRunStatusSchema,
  latestUserPrompt: z.string().min(1),
  planningModelId: providerModelIdSchema.optional(),
  executionModelId: executionModelIdSchema.optional(),
  difficultyScore: z.number().min(0).max(100).optional(),
  summary: z.string().min(1).optional(),
  finalExecutionBrief: z.string().min(1).optional(),
  failureMessage: z.string().min(1).optional(),
  executionTarget: runExecutionTargetSchema.optional(),
  plan: executionPlanSchema.optional(),
  correctnessReview: correctnessReviewSchema.optional(),
  questions: z.array(planningQuestionSchema),
  subtasks: z.array(subagentTaskStateSchema),
  browserSessions: z.array(browserSessionSchema).max(32).optional(),
  experiment: experimentRunSchema.optional(),
  memoryRetrievals: z.array(memoryRetrievalSchema).max(128).optional(),
  resumable: z.boolean(),
  retryable: z.boolean(),
  createdAt: z.string().datetime().or(z.string().min(1)),
  updatedAt: z.string().datetime().or(z.string().min(1)),
  completedAt: z.string().datetime().or(z.string().min(1)).optional()
});

export const plannerQuestionTurnSchema = z.object({
  type: z.literal("question"),
  summary: z.string().min(1),
  question: z.object({
    id: questionIdSchema,
    prompt: z.string().min(1),
    placeholder: z.string().min(1).optional(),
    choices: z
      .array(planningChoiceSchema)
      .length(3)
      .refine((choices) => choices.filter((choice) => choice.recommended).length === 1, {
        message: "Planner questions must include exactly one recommended choice"
      }),
    required: z.literal(true)
  })
});

export const plannerReadyTurnSchema = z.object({
  type: z.literal("ready"),
  difficultyScore: z.number().min(0).max(100),
  summary: z.string().min(1),
  executionModelId: executionModelIdSchema,
  usesSubagents: z.boolean(),
  subtasks: z.array(plannerSubtaskSchema).max(8),
  finalExecutionBrief: z.string().min(1),
  prerequisites: z.array(planPrerequisiteSchema).max(16).optional(),
  contracts: z.array(subagentContractSchema).max(16).optional()
});

export const plannerTurnResultSchema = z.discriminatedUnion("type", [
  plannerQuestionTurnSchema,
  plannerReadyTurnSchema
]);

export const plannerResultSchema = plannerTurnResultSchema;

export const cliSessionStatusSchema = z.enum(["starting", "running", "stopped", "exited", "failed"]);
export const cliSessionAttachStateSchema = z.enum(["detached", "attached"]);

export const cliSessionSchema = z.object({
  id: z.string().min(1).max(128),
  projectId: projectIdSchema,
  threadId: threadIdSchema,
  runId: runIdSchema.optional(),
  agentId: agentIdSchema,
  cwd: z.string().min(1).max(4096),
  status: cliSessionStatusSchema,
  cols: z.number().int().min(1).max(1000),
  rows: z.number().int().min(1).max(1000),
  attachState: cliSessionAttachStateSchema,
  idleTimeoutMs: z.number().int().min(0).max(24 * 60 * 60 * 1000),
  totalTimeoutMs: z.number().int().min(0).max(24 * 60 * 60 * 1000).optional(),
  lastStdoutAt: z.string().datetime().or(z.string().min(1)).optional(),
  lastStderrAt: z.string().datetime().or(z.string().min(1)).optional(),
  startedAt: z.string().datetime().or(z.string().min(1)),
  updatedAt: z.string().datetime().or(z.string().min(1)),
  exitedAt: z.string().datetime().or(z.string().min(1)).optional(),
  exitCode: z.number().int().min(-1).max(65535).optional()
});

export const cliAttachTokenSchema = z.object({
  token: z.string().min(16).max(512),
  sessionId: z.string().min(1).max(128),
  clientId: z.string().min(1).max(128),
  expiresAt: z.string().datetime().or(z.string().min(1)),
  usedAt: z.string().datetime().or(z.string().min(1)).optional()
});

export const chatSessionStateSchema = z.object({
  sessionId: sessionIdSchema,
  selectedAgentId: agentIdSchema.optional(),
  executionModelId: executionModelIdSchema.optional(),
  messages: z.array(chatMessageSchema),
  isStreaming: z.boolean(),
  lastError: z.string().min(1).optional()
});

export const projectThreadSummarySchema = z.object({
  id: threadIdSchema,
  kind: backgroundJobThreadKindSchema,
  title: threadTitleSchema,
  titleSource: threadTitleSourceSchema,
  badgeState: threadBadgeStateSchema,
  messageCount: z.number().int().min(0),
  lastMessagePreview: z.string().min(1).optional(),
  updatedAt: z.string().datetime().or(z.string().min(1)),
  forkedFromThreadId: threadIdSchema.optional()
});

export const projectSearchResultSchema = z.object({
  id: z.string().min(1).max(512),
  name: projectNameSchema,
  rootPath: projectRootPathSchema,
  repoKind: projectSearchRepoKindSchema,
  matchKind: projectSearchMatchKindSchema
});

export const workspaceProjectStateSchema = z.object({
  id: projectIdSchema,
  name: projectNameSchema,
  rootPath: projectRootPathSchema,
  activeThreadId: threadIdSchema,
  selectedModeId: modeIdSchema.optional(),
  projectModes: z.array(modeDefinitionSchema).max(16).optional(),
  projectRuleSource: workspaceRuleSourceSchema.optional(),
  threadMemorySummary: memorySummarySchema.optional(),
  threads: z.array(projectThreadSummarySchema).min(1),
  session: chatSessionStateSchema,
  activeCliSession: cliSessionSchema.optional(),
  activeRun: agentRunStateSchema.optional(),
  lastRun: agentRunStateSchema.optional()
}).superRefine((project, ctx) => {
  if (!project.threads.some((thread) => thread.id === project.activeThreadId)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Project activeThreadId must reference an existing thread",
      path: ["activeThreadId"]
    });
  }
});

export const workspaceStateSchema = z.object({
  projects: z.array(workspaceProjectStateSchema),
  workspaceModes: z.array(modeDefinitionSchema).max(16).optional(),
  workspaceRuleSource: workspaceRuleSourceSchema.optional(),
  workspaceMemorySummary: memorySummarySchema.optional(),
  activeProjectId: projectIdSchema.optional()
}).superRefine((workspace, ctx) => {
  if (workspace.projects.length === 0) {
    if (workspace.activeProjectId !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Workspace activeProjectId must be undefined when no projects exist",
        path: ["activeProjectId"]
      });
    }
    return;
  }

  if (!workspace.activeProjectId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Workspace activeProjectId is required when projects exist",
      path: ["activeProjectId"]
    });
    return;
  }

  if (!workspace.projects.some((project) => project.id === workspace.activeProjectId)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Workspace activeProjectId must reference an existing project",
      path: ["activeProjectId"]
    });
  }
});

export const clientCommandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("connection.ping"),
    requestId: requestIdSchema,
    payload: z
      .object({
        timestamp: z.number().optional()
      })
      .optional()
  }),
  z.object({
    type: z.literal("agent.list"),
    requestId: requestIdSchema
  }),
  z.object({
    type: z.literal("project.add"),
    requestId: requestIdSchema,
    payload: z.object({
      rootPath: projectRootPathSchema
    })
  }),
  z.object({
    type: z.literal("project.browse"),
    requestId: requestIdSchema
  }),
  z.object({
    type: z.literal("project.remove"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema
    })
  }),
  z.object({
    type: z.literal("project.activate"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema
    })
  }),
  z.object({
    type: z.literal("project.search"),
    requestId: requestIdSchema,
    payload: z.object({
      query: z.string().trim().min(1).max(4096)
    })
  }),
  z.object({
    type: z.literal("thread.create"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema
    })
  }),
  z.object({
    type: z.literal("thread.activate"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema
    })
  }),
  z.object({
    type: z.literal("thread.fork"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      sourceThreadId: threadIdSchema
    })
  }),
  z.object({
    type: z.literal("thread.rename"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema,
      title: threadTitleSchema
    })
  }),
  z.object({
    type: z.literal("session.reset"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema
    })
  }),
  z.object({
    type: z.literal("execution.pause-all"),
    requestId: requestIdSchema
  }),
  z.object({
    type: z.literal("execution.resume-all"),
    requestId: requestIdSchema
  }),
  z.object({
    type: z.literal("notification.mark-read"),
    requestId: requestIdSchema,
    payload: z.object({
      notificationId: notificationInboxItemIdSchema
    })
  }),
  z.object({
    type: z.literal("notifications.mark-all-read"),
    requestId: requestIdSchema
  }),
  z.object({
    type: z.literal("setup.refresh"),
    requestId: requestIdSchema
  }),
  z.object({
    type: z.literal("chat.stop"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema
    })
  }),
  z.object({
    type: z.literal("chat.send"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema,
      agentId: agentIdSchema,
      content: z.string().min(1).max(32000),
      attachments: z.array(chatAttachmentSchema).max(8).optional(),
      modeId: modeIdSchema.optional(),
      modeLocked: z.boolean().optional(),
      executionModelId: executionModelIdSchema.optional(),
      reasoningStrength: composerReasoningStrengthSchema.optional(),
      fastMode: z.boolean().optional(),
      debug: z.boolean().optional()
    })
  }),
  z.object({
    type: z.literal("planning.answer"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema,
      runId: runIdSchema,
      questionId: questionIdSchema,
      content: z.string().trim().min(1).max(32000),
      reasoningStrength: composerReasoningStrengthSchema.optional(),
      fastMode: z.boolean().optional()
    })
  }),
  z.object({
    type: z.literal("planning.refine"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema,
      runId: runIdSchema,
      content: z.string().trim().min(1).max(32000),
      reasoningStrength: composerReasoningStrengthSchema.optional(),
      fastMode: z.boolean().optional()
    })
  }),
  z.object({
    type: z.literal("run.resume"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema,
      runId: runIdSchema,
      guidanceText: z.string().trim().min(1).max(32000).optional(),
      subagentIds: z.array(z.string().min(1).max(128)).max(8).optional(),
      reasoningStrength: composerReasoningStrengthSchema.optional(),
      fastMode: z.boolean().optional()
    })
  }),
  z.object({
    type: z.literal("run.retry"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema,
      runId: runIdSchema,
      subagentId: z.string().min(1).max(128).optional(),
      reasoningStrength: composerReasoningStrengthSchema.optional(),
      fastMode: z.boolean().optional()
    })
  }),
  z.object({
    type: z.literal("run.execute"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema,
      runId: runIdSchema,
      target: runExecutionTargetSchema.optional(),
      reasoningStrength: composerReasoningStrengthSchema.optional(),
      fastMode: z.boolean().optional()
    })
  }),
  z.object({
    type: z.literal("experiment.inspect"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      runId: runIdSchema
    })
  }),
  z.object({
    type: z.literal("experiment.promote"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      runId: runIdSchema
    })
  }),
  z.object({
    type: z.literal("experiment.discard"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      runId: runIdSchema
    })
  }),
  z.object({
    type: z.literal("memory.list"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      search: z.string().max(512).optional(),
      status: memoryEntryStatusSchema.optional(),
      kind: memoryEntryKindSchema.optional()
    })
  }),
  z.object({
    type: z.literal("memory.inspect"),
    requestId: requestIdSchema,
    payload: z.object({
      memoryEntryId: memoryEntryIdSchema
    })
  }),
  z.object({
    type: z.literal("memory.update"),
    requestId: requestIdSchema,
    payload: z.object({
      memoryEntryId: memoryEntryIdSchema,
      pinned: z.boolean().optional(),
      status: memoryEntryStatusSchema.optional()
    })
  }),
  z.object({
    type: z.literal("memory.delete"),
    requestId: requestIdSchema,
    payload: z.object({
      memoryEntryId: memoryEntryIdSchema
    })
  }),
  z.object({
    type: z.literal("run.refresh"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema,
      runId: runIdSchema,
      subagentId: z.string().min(1).max(128).optional()
    })
  }),
  z.object({
    type: z.literal("background-job.save"),
    requestId: requestIdSchema,
    payload: z.object({
      job: backgroundJobSchema
    })
  }),
  z.object({
    type: z.literal("background-job.delete"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      jobId: backgroundJobIdSchema
    })
  }),
  z.object({
    type: z.literal("background-job.pause"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      jobId: backgroundJobIdSchema
    })
  }),
  z.object({
    type: z.literal("background-job.resume"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      jobId: backgroundJobIdSchema
    })
  }),
  z.object({
    type: z.literal("background-job.run-now"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      jobId: backgroundJobIdSchema
    })
  }),
  z.object({
    type: z.literal("background-job.stop-run"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      runId: backgroundJobRunIdSchema
    })
  }),
  z.object({
    type: z.literal("background-job.retry-run"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      runId: backgroundJobRunIdSchema
    })
  }),
  z.object({
    type: z.literal("background-job.approve-run"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      runId: backgroundJobRunIdSchema
    })
  }),
  z.object({
    type: z.literal("background-job.reject-run"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      runId: backgroundJobRunIdSchema
    })
  }),
  z.object({
    type: z.literal("background-job.schedule.preview"),
    requestId: requestIdSchema,
    payload: z.object({
      input: z.string().trim().min(1).max(512),
      timezone: z.string().min(1).max(128).optional()
    })
  }),
  z.object({
    type: z.literal("assistant.create"),
    requestId: requestIdSchema,
    payload: z.object({
      assistant: assistantSchema,
      assetRefs: z.array(assistantAssetRefSchema).max(64).optional()
    })
  }),
  z.object({
    type: z.literal("assistant.update"),
    requestId: requestIdSchema,
    payload: z.object({
      assistant: assistantSchema,
      assetRefs: z.array(assistantAssetRefSchema).max(64).optional()
    })
  }),
  z.object({
    type: z.literal("assistant.delete"),
    requestId: requestIdSchema,
    payload: z.object({
      assistantId: assistantIdSchema
    })
  }),
  z.object({
    type: z.literal("assistant.pause"),
    requestId: requestIdSchema,
    payload: z.object({
      assistantId: assistantIdSchema
    })
  }),
  z.object({
    type: z.literal("assistant.resume"),
    requestId: requestIdSchema,
    payload: z.object({
      assistantId: assistantIdSchema
    })
  }),
  z.object({
    type: z.literal("assistant.clone-to-project"),
    requestId: requestIdSchema,
    payload: z.object({
      assistantId: assistantIdSchema,
      projectId: projectIdSchema
    })
  }),
  z.object({
    type: z.literal("assistant.inspect"),
    requestId: requestIdSchema,
    payload: z.object({
      assistantId: assistantIdSchema
    })
  }),
  z.object({
    type: z.literal("assistant.bootstrap.retry"),
    requestId: requestIdSchema,
    payload: z.object({
      assistantId: assistantIdSchema
    })
  }),
  z.object({
    type: z.literal("assistant.chat.send"),
    requestId: requestIdSchema,
    payload: z.object({
      assistantId: assistantIdSchema,
      content: z.string().trim().min(1).max(32000)
    })
  }),
  z.object({
    type: z.literal("assistant.question.answer"),
    requestId: requestIdSchema,
    payload: z.object({
      assistantId: assistantIdSchema,
      questionId: assistantQuestionIdSchema,
      content: z.string().trim().min(1).max(32000)
    })
  }),
  z.object({
    type: z.literal("assistant.todo.update"),
    requestId: requestIdSchema,
    payload: z.object({
      todo: assistantTodoSchema
    })
  }),
  z.object({
    type: z.literal("assistant.todo.reorder"),
    requestId: requestIdSchema,
    payload: z.object({
      assistantId: assistantIdSchema,
      todoIds: z.array(assistantTodoIdSchema).max(512)
    })
  }),
  z.object({
    type: z.literal("browser.approval.resolve"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema,
      runId: runIdSchema,
      sessionId: z.string().min(1).max(128),
      toolCallId: z.string().min(1).max(256),
      approved: z.boolean()
    })
  }),
  z.object({
    type: z.literal("agent.runtime.refresh"),
    requestId: requestIdSchema
  }),
  z.object({
    type: z.literal("cli-session.start"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema,
      agentId: agentIdSchema.exclude(["pi"]),
      cols: z.number().int().min(1).max(1000),
      rows: z.number().int().min(1).max(1000),
      prompt: z.string().min(1).max(32000).optional(),
      runId: runIdSchema.optional()
    })
  }),
  z.object({
    type: z.literal("cli-session.stop"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema,
      sessionId: z.string().min(1).max(128)
    })
  }),
  z.object({
    type: z.literal("cli-session.resize"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema,
      sessionId: z.string().min(1).max(128),
      cols: z.number().int().min(1).max(1000),
      rows: z.number().int().min(1).max(1000)
    })
  }),
  z.object({
    type: z.literal("cli-session.attach"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema,
      sessionId: z.string().min(1).max(128)
    })
  }),
  z.object({
    type: z.literal("cli-session.capture-visible-buffer"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema,
      sessionId: z.string().min(1).max(128),
      visibleBuffer: z.string().max(64000),
      stderrTail: z.string().max(32000).optional()
    })
  }),
  z.object({
    type: z.literal("project.mode.select"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      modeId: modeIdSchema
    })
  }),
  z.object({
    type: z.literal("mode.save"),
    requestId: requestIdSchema,
    payload: z
      .object({
        scope: z.enum(["workspace", "project"]),
        projectId: projectIdSchema.optional(),
        mode: modeDefinitionSchema.omit({ scope: true }).extend({
          scope: z.enum(["workspace", "project"])
        })
      })
      .superRefine((payload, ctx) => {
        if (payload.scope === "project" && !payload.projectId) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "projectId is required for project-scoped modes",
            path: ["projectId"]
          });
        }
      })
  }),
  z.object({
    type: z.literal("mode.delete"),
    requestId: requestIdSchema,
    payload: z
      .object({
        scope: z.enum(["workspace", "project"]),
        projectId: projectIdSchema.optional(),
        modeId: modeIdSchema
      })
      .superRefine((payload, ctx) => {
        if (payload.scope === "project" && !payload.projectId) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "projectId is required for project-scoped modes",
            path: ["projectId"]
          });
        }
      })
  }),
  z.object({
    type: z.literal("workspace.context.save"),
    requestId: requestIdSchema,
    payload: z.object({
      rulesContent: z.string().max(32000).optional(),
      memorySummaryContent: z.string().max(32000).optional()
    })
  }),
  z.object({
    type: z.literal("project.context.save"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      rulesContent: z.string().max(32000).optional(),
      threadMemorySummaryContent: z.string().max(32000).optional()
    })
  }),
  z.object({
    type: z.literal("preferences.save"),
    requestId: requestIdSchema,
    payload: z.object({
      openAiApiKey: z.string().min(1).max(1024).optional(),
      googleApiKey: z.string().min(1).max(1024).optional(),
      providerBrand: providerBrandSchema,
      debugEnabled: z.boolean(),
      tracePanelDefaultOpen: z.boolean(),
      subagentWorktreeStrategyDefault: subagentWorktreeStrategySchema,
      blockChatOnDirtyGitDefault: z.boolean(),
      dirtyGitChangeLimitDefault: dirtyGitChangeLimitSchema,
      autoCompactContextThresholdPercentDefault: autoCompactContextThresholdPercentSchema,
      planExecutionModeDefault: planExecutionModeSchema,
      planExecutionDelaySecondsDefault: z.number().int().min(0).max(300),
      correctnessIterationModeDefault: correctnessIterationModeSchema,
      backgroundJobApprovalPolicyDefault: backgroundJobApprovalPolicySchema,
      memoryBankEnabledDefault: z.boolean().optional()
    })
  }),
  z.object({
    type: z.literal("preferences.clearApiKey"),
    requestId: requestIdSchema
  })
]);

export const serverEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("connection.ready"),
    payload: z.object({
      agents: z.array(agentOptionSchema),
      workspace: workspaceStateSchema,
      executionControl: executionControlStateSchema,
      preferences: preferencesStateSchema,
      setup: setupStateSchema,
      backgroundJobs: backgroundJobsStateSchema,
      assistants: assistantsStateSchema,
      notifications: notificationInboxStateSchema
    })
  }),
  z.object({
    type: z.literal("notifications.updated"),
    requestId: requestIdSchema,
    payload: z.object({
      notifications: notificationInboxStateSchema
    })
  }),
  z.object({
    type: z.literal("execution-control.updated"),
    requestId: requestIdSchema,
    payload: z.object({
      executionControl: executionControlStateSchema
    })
  }),
  z.object({
    type: z.literal("connection.pong"),
    requestId: requestIdSchema,
    payload: z
      .object({
        timestamp: z.number().optional()
      })
      .optional()
  }),
  z.object({
    type: z.literal("agent.list"),
    requestId: requestIdSchema,
    payload: z.object({
      agents: z.array(agentOptionSchema)
    })
  }),
  z.object({
    type: z.literal("project.opened"),
    requestId: requestIdSchema,
    payload: z.object({
      project: workspaceProjectStateSchema,
      activeProjectId: projectIdSchema,
      resolution: z.enum(["created-project", "existing-project-new-thread"])
    })
  }),
  z.object({
    type: z.literal("project.removed"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      activeProjectId: projectIdSchema.optional()
    })
  }),
  z.object({
    type: z.literal("project.activated"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema
    })
  }),
  z.object({
    type: z.literal("project.search.results"),
    requestId: requestIdSchema,
    payload: z.object({
      query: z.string().trim().min(1).max(4096),
      results: z.array(projectSearchResultSchema).max(32)
    })
  }),
  z.object({
    type: z.literal("workspace.updated"),
    requestId: requestIdSchema,
    payload: z.object({
      workspace: workspaceStateSchema
    })
  }),
  z.object({
    type: z.literal("project.updated"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      project: workspaceProjectStateSchema
    })
  }),
  z.object({
    type: z.literal("thread.created"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      project: workspaceProjectStateSchema
    })
  }),
  z.object({
    type: z.literal("thread.activated"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      project: workspaceProjectStateSchema
    })
  }),
  z.object({
    type: z.literal("thread.renamed"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      thread: projectThreadSummarySchema
    })
  }),
  z.object({
    type: z.literal("agent.plan"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema,
      plan: agentPlanSchema
    })
  }),
  z.object({
    type: z.literal("agent.trace"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema,
      trace: agentTraceSchema
    })
  }),
  z.object({
    type: z.literal("chat.delta"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema,
      sessionId: sessionIdSchema,
      delta: z.string()
    })
  }),
  z.object({
    type: z.literal("chat.complete"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema,
      sessionId: sessionIdSchema,
      assistantMessage: chatMessageSchema,
      state: chatSessionStateSchema
    })
  }),
  z.object({
    type: z.literal("chat.message-appended"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema,
      sessionId: sessionIdSchema,
      message: chatMessageSchema,
      state: chatSessionStateSchema
    })
  }),
  z.object({
    type: z.literal("chat.error"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema.optional(),
      threadId: threadIdSchema.optional(),
      message: z.string().min(1),
      detail: z.string().min(1).optional()
    })
  }),
  z.object({
    type: z.literal("run.updated"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema,
      run: agentRunStateSchema
    })
  }),
  z.object({
    type: z.literal("experiment.inspected"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema,
      inspection: experimentInspectionSchema
    })
  }),
  z.object({
    type: z.literal("memory.listed"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      entries: z.array(memoryEntrySchema).max(512)
    })
  }),
  z.object({
    type: z.literal("memory.inspected"),
    requestId: requestIdSchema,
    payload: z.object({
      entry: memoryEntrySchema
    })
  }),
  z.object({
    type: z.literal("memory.updated"),
    requestId: requestIdSchema,
    payload: z.object({
      entry: memoryEntrySchema
    })
  }),
  z.object({
    type: z.literal("memory.deleted"),
    requestId: requestIdSchema,
    payload: z.object({
      memoryEntryId: memoryEntryIdSchema
    })
  }),
  z.object({
    type: z.literal("background-jobs.updated"),
    requestId: requestIdSchema,
    payload: z.object({
      backgroundJobs: backgroundJobsStateSchema
    })
  }),
  z.object({
    type: z.literal("assistants.updated"),
    requestId: requestIdSchema,
    payload: z.object({
      assistants: assistantsStateSchema
    })
  }),
  z.object({
    type: z.literal("assistant.updated"),
    requestId: requestIdSchema,
    payload: z.object({
      assistant: assistantSchema
    })
  }),
  z.object({
    type: z.literal("assistant.chat.delta"),
    requestId: requestIdSchema,
    payload: z.object({
      assistantId: assistantIdSchema,
      sessionId: sessionIdSchema,
      delta: z.string()
    })
  }),
  z.object({
    type: z.literal("assistant.chat.complete"),
    requestId: requestIdSchema,
    payload: z.object({
      assistantId: assistantIdSchema,
      sessionId: sessionIdSchema,
      assistantMessage: chatMessageSchema,
      thread: assistantThreadSchema
    })
  }),
  z.object({
    type: z.literal("assistant.question.updated"),
    requestId: requestIdSchema,
    payload: z.object({
      question: assistantQuestionSchema
    })
  }),
  z.object({
    type: z.literal("assistant.todo.updated"),
    requestId: requestIdSchema,
    payload: z.object({
      todo: assistantTodoSchema
    })
  }),
  z.object({
    type: z.literal("assistant.log.appended"),
    requestId: requestIdSchema,
    payload: z.object({
      entry: assistantLogEntrySchema
    })
  }),
  z.object({
    type: z.literal("assistant.created-card"),
    requestId: requestIdSchema,
    payload: z.object({
      assistant: assistantSchema
    })
  }),
  z.object({
    type: z.literal("background-job-run.updated"),
    requestId: requestIdSchema,
    payload: z.object({
      run: backgroundJobRunSchema
    })
  }),
  z.object({
    type: z.literal("background-job-schedule.preview"),
    requestId: requestIdSchema,
    payload: backgroundJobSchedulePreviewSchema
  }),
  z.object({
    type: z.literal("run.preflight"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema,
      preflight: runPreflightSchema
    })
  }),
  z.object({
    type: z.literal("run.cleared"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema,
      runId: runIdSchema
    })
  }),
  z.object({
    type: z.literal("session.reset"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema,
      sessionId: sessionIdSchema,
      state: chatSessionStateSchema
    })
  }),
  z.object({
    type: z.literal("project.context"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema,
      contextUsage: projectContextUsageSchema
    })
  }),
  z.object({
    type: z.literal("command.rejected"),
    requestId: requestIdSchema.optional(),
    payload: z.object({
      message: z.string().min(1),
      detail: z.string().min(1).optional()
    })
  }),
  z.object({
    type: z.literal("preferences.saved"),
    requestId: requestIdSchema,
    payload: preferencesStateSchema.extend({
      setup: setupStateSchema
    })
  }),
  z.object({
    type: z.literal("preferences.apiKeyCleared"),
    requestId: requestIdSchema,
    payload: preferencesStateSchema.extend({
      setup: setupStateSchema
    })
  }),
  z.object({
    type: z.literal("setup.updated"),
    requestId: requestIdSchema,
    payload: z.object({
      setup: setupStateSchema
    })
  }),
  z.object({
    type: z.literal("agent.runtime.updated"),
    requestId: requestIdSchema,
    payload: z.object({
      agentRuntimes: z.array(agentRuntimeCapabilitySchema).max(8)
    })
  }),
  z.object({
    type: z.literal("cli-session.started"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema,
      session: cliSessionSchema
    })
  }),
  z.object({
    type: z.literal("cli-session.updated"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema,
      session: cliSessionSchema
    })
  }),
  z.object({
    type: z.literal("cli-session.attach-ready"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema,
      sessionId: z.string().min(1).max(128),
      attachToken: cliAttachTokenSchema
    })
  }),
  z.object({
    type: z.literal("cli-session.exited"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema,
      session: cliSessionSchema
    })
  }),
  z.object({
    type: z.literal("cli-session.hang-detected"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema,
      session: cliSessionSchema,
      message: z.string().min(1).max(2048)
    })
  })
]);

export type RequestId = z.infer<typeof requestIdSchema>;
export type SessionId = z.infer<typeof sessionIdSchema>;
export type ThreadId = z.infer<typeof threadIdSchema>;
export type ProjectId = z.infer<typeof projectIdSchema>;
export type RunId = z.infer<typeof runIdSchema>;
export type BackgroundJobId = z.infer<typeof backgroundJobIdSchema>;
export type BackgroundJobRunId = z.infer<typeof backgroundJobRunIdSchema>;
export type AssistantId = z.infer<typeof assistantIdSchema>;
export type AssistantThreadId = z.infer<typeof assistantThreadIdSchema>;
export type AssistantTodoId = z.infer<typeof assistantTodoIdSchema>;
export type AssistantLearningId = z.infer<typeof assistantLearningIdSchema>;
export type AssistantQuestionId = z.infer<typeof assistantQuestionIdSchema>;
export type AssistantLogEntryId = z.infer<typeof assistantLogEntryIdSchema>;
export type AssistantAssetRefId = z.infer<typeof assistantAssetRefIdSchema>;
export type QuestionId = z.infer<typeof questionIdSchema>;
export type PlanningChoiceId = z.infer<typeof planningChoiceIdSchema>;
export type ModeId = z.infer<typeof modeIdSchema>;
export type ProjectName = z.infer<typeof projectNameSchema>;
export type ProjectRootPath = z.infer<typeof projectRootPathSchema>;
export type ProjectSearchRepoKind = z.infer<typeof projectSearchRepoKindSchema>;
export type ProjectSearchMatchKind = z.infer<typeof projectSearchMatchKindSchema>;
export type ThreadTitle = z.infer<typeof threadTitleSchema>;
export type AgentId = z.infer<typeof agentIdSchema>;
export type ProviderBrand = z.infer<typeof providerBrandSchema>;
export type RuntimeKind = z.infer<typeof runtimeKindSchema>;
export type ModelDiscoveryConfidence = z.infer<typeof modelDiscoveryConfidenceSchema>;
export type ComposerReasoningStrength = z.infer<typeof composerReasoningStrengthSchema>;
export type SetupLaunchMode = z.infer<typeof setupLaunchModeSchema>;
export type SetupCheckStatus = z.infer<typeof setupCheckStatusSchema>;
export type SetupActionKind = z.infer<typeof setupActionKindSchema>;
export type SubagentWorktreeStrategy = z.infer<typeof subagentWorktreeStrategySchema>;
export type PlanExecutionMode = z.infer<typeof planExecutionModeSchema>;
export type CorrectnessIterationMode = z.infer<typeof correctnessIterationModeSchema>;
export type DirtyGitChangeLimit = z.infer<typeof dirtyGitChangeLimitSchema>;
export type PreflightSeverity = z.infer<typeof preflightSeveritySchema>;
export type PreflightKind = z.infer<typeof preflightKindSchema>;
export type ThreadTitleSource = z.infer<typeof threadTitleSourceSchema>;
export type ThreadBadgeState = z.infer<typeof threadBadgeStateSchema>;
export type BackgroundJobKind = z.infer<typeof backgroundJobKindSchema>;
export type BackgroundJobStatus = z.infer<typeof backgroundJobStatusSchema>;
export type BackgroundJobRunStatus = z.infer<typeof backgroundJobRunStatusSchema>;
export type BackgroundJobRiskLevel = z.infer<typeof backgroundJobRiskLevelSchema>;
export type BackgroundJobApprovalPolicy = z.infer<typeof backgroundJobApprovalPolicySchema>;
export type BackgroundJobThreadKind = z.infer<typeof backgroundJobThreadKindSchema>;
export type NotificationSeverity = z.infer<typeof notificationSeveritySchema>;
export type ModeScope = z.infer<typeof modeScopeSchema>;
export type ModeToolPolicy = z.infer<typeof modeToolPolicySchema>;
export type ModeExecutionAccess = z.infer<typeof modeExecutionAccessSchema>;
export type CapabilityTag = z.infer<typeof capabilityTagSchema>;
export type ChatAttachmentKind = z.infer<typeof chatAttachmentKindSchema>;
export type ChatDocumentType = z.infer<typeof chatDocumentTypeSchema>;
export type ProviderModelId = z.infer<typeof providerModelIdSchema>;
export type ExecutionModelId = z.infer<typeof executionModelIdSchema>;
export type ChatRole = z.infer<typeof chatRoleSchema>;
export type ChatMessageKind = z.infer<typeof chatMessageKindSchema>;
export type PlanPrerequisite = z.infer<typeof planPrerequisiteSchema>;
export type SubagentContract = z.infer<typeof subagentContractSchema>;
export type CorrectnessGap = z.infer<typeof correctnessGapSchema>;
export type ExecutionPlan = z.infer<typeof executionPlanSchema>;
export type CorrectnessReview = z.infer<typeof correctnessReviewSchema>;
export type PlanSummaryMessageMetadata = z.infer<typeof planSummaryMessageMetadataSchema>;
export type ChatMessageMetadata = z.infer<typeof chatMessageMetadataSchema>;
export type ChatAttachment = z.infer<typeof chatAttachmentSchema>;
export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type AgentOption = z.infer<typeof agentOptionSchema>;
export type AgentRuntimeCapability = z.infer<typeof agentRuntimeCapabilitySchema>;
export type ModelCapability = z.infer<typeof modelCapabilitySchema>;
export type ProviderCapability = z.infer<typeof providerCapabilitySchema>;
export type ModeDefinition = z.infer<typeof modeDefinitionSchema>;
export type WorkspaceRuleSource = z.infer<typeof workspaceRuleSourceSchema>;
export type MemorySummary = z.infer<typeof memorySummarySchema>;
export type BackgroundJobSchedule = z.infer<typeof backgroundJobScheduleSchema>;
export type BackgroundJobAiRoutineDefinition = z.infer<typeof backgroundJobAiRoutineDefinitionSchema>;
export type BackgroundJobShellDefinition = z.infer<typeof backgroundJobShellDefinitionSchema>;
export type BackgroundJobDefinition = z.infer<typeof backgroundJobDefinitionSchema>;
export type BackgroundJob = z.infer<typeof backgroundJobSchema>;
export type BackgroundJobRunEvent = z.infer<typeof backgroundJobRunEventSchema>;
export type BackgroundJobRun = z.infer<typeof backgroundJobRunSchema>;
export type BackgroundJobTemplate = z.infer<typeof backgroundJobTemplateSchema>;
export type BackgroundJobSchedulePreview = z.infer<typeof backgroundJobSchedulePreviewSchema>;
export type BackgroundJobsState = z.infer<typeof backgroundJobsStateSchema>;
export type PlanningQuestionNotification = z.infer<typeof planningQuestionNotificationSchema>;
export type AssistantQuestionNotification = z.infer<typeof assistantQuestionNotificationSchema>;
export type BrowserApprovalNotification = z.infer<typeof browserApprovalNotificationSchema>;
export type BackgroundRunStatusNotification = z.infer<typeof backgroundRunStatusNotificationSchema>;
export type NotificationInboxItem = z.infer<typeof notificationInboxItemSchema>;
export type NotificationInboxState = z.infer<typeof notificationInboxStateSchema>;
export type ExperimentRunStatus = z.infer<typeof experimentRunStatusSchema>;
export type ExperimentRun = z.infer<typeof experimentRunSchema>;
export type ExperimentInspection = z.infer<typeof experimentInspectionSchema>;
export type MemoryEntryKind = z.infer<typeof memoryEntryKindSchema>;
export type MemoryEntryStatus = z.infer<typeof memoryEntryStatusSchema>;
export type MemoryConfidence = z.infer<typeof memoryConfidenceSchema>;
export type MemoryFreshness = z.infer<typeof memoryFreshnessSchema>;
export type MemoryEntry = z.infer<typeof memoryEntrySchema>;
export type MemoryRetrieval = z.infer<typeof memoryRetrievalSchema>;
export type AssistantScope = z.infer<typeof assistantScopeSchema>;
export type AssistantRunState = z.infer<typeof assistantRunStateSchema>;
export type AssistantBootstrapState = z.infer<typeof assistantBootstrapStateSchema>;
export type AssistantCircuitBreakerState = z.infer<typeof assistantCircuitBreakerStateSchema>;
export type AssistantTodoState = z.infer<typeof assistantTodoStateSchema>;
export type AssistantQuestionStatus = z.infer<typeof assistantQuestionStatusSchema>;
export type AssistantLearningConfidence = z.infer<typeof assistantLearningConfidenceSchema>;
export type AssistantLogLevel = z.infer<typeof assistantLogLevelSchema>;
export type AssistantAssetRefKind = z.infer<typeof assistantAssetRefKindSchema>;
export type Assistant = z.infer<typeof assistantSchema>;
export type AssistantThread = z.infer<typeof assistantThreadSchema>;
export type AssistantTodo = z.infer<typeof assistantTodoSchema>;
export type AssistantLearning = z.infer<typeof assistantLearningSchema>;
export type AssistantQuestion = z.infer<typeof assistantQuestionSchema>;
export type AssistantLogEntry = z.infer<typeof assistantLogEntrySchema>;
export type AssistantAssetRef = z.infer<typeof assistantAssetRefSchema>;
export type AssistantsState = z.infer<typeof assistantsStateSchema>;
export type ExecutionControlState = z.infer<typeof executionControlStateSchema>;
export type SetupAction = z.infer<typeof setupActionSchema>;
export type SetupCheck = z.infer<typeof setupCheckSchema>;
export type SetupState = z.infer<typeof setupStateSchema>;
export type PreferencesState = z.infer<typeof preferencesStateSchema>;
export type ConnectionState = z.infer<typeof connectionStateSchema>;
export type AgentPlan = z.infer<typeof agentPlanSchema>;
export type AgentTrace = z.infer<typeof agentTraceSchema>;
export type ProjectContextSourceKind = z.infer<typeof projectContextSourceKindSchema>;
export type BrowserApprovalStatus = z.infer<typeof browserApprovalStatusSchema>;
export type BrowserSessionStatus = z.infer<typeof browserSessionStatusSchema>;
export type BrowserActivityKind = z.infer<typeof browserActivityKindSchema>;
export type BrowserActivityStatus = z.infer<typeof browserActivityStatusSchema>;
export type BrowserApproval = z.infer<typeof browserApprovalSchema>;
export type BrowserReplayEntry = z.infer<typeof browserReplayEntrySchema>;
export type BrowserVerification = z.infer<typeof browserVerificationSchema>;
export type BrowserActivity = z.infer<typeof browserActivitySchema>;
export type BrowserSession = z.infer<typeof browserSessionSchema>;
export type ProjectContextUsage = z.infer<typeof projectContextUsageSchema>;
export type RunPreflight = z.infer<typeof runPreflightSchema>;
export type PlannerSubtask = z.infer<typeof plannerSubtaskSchema>;
export type PlanningChoice = z.infer<typeof planningChoiceSchema>;
export type AgentRunStatus = z.infer<typeof agentRunStatusSchema>;
export type RunExecutionTarget = z.infer<typeof runExecutionTargetSchema>;
export type PlanningQuestionStatus = z.infer<typeof planningQuestionStatusSchema>;
export type PlanningQuestion = z.infer<typeof planningQuestionSchema>;
export type SubagentTaskStatus = z.infer<typeof subagentTaskStatusSchema>;
export type SubagentTaskState = z.infer<typeof subagentTaskStateSchema>;
export type AgentRunState = z.infer<typeof agentRunStateSchema>;
export type PlannerQuestionTurn = z.infer<typeof plannerQuestionTurnSchema>;
export type PlannerReadyTurn = z.infer<typeof plannerReadyTurnSchema>;
export type PlannerTurnResult = z.infer<typeof plannerTurnResultSchema>;
export type PlannerResult = z.infer<typeof plannerResultSchema>;
export type CliSessionStatus = z.infer<typeof cliSessionStatusSchema>;
export type CliSessionAttachState = z.infer<typeof cliSessionAttachStateSchema>;
export type CliSession = z.infer<typeof cliSessionSchema>;
export type CliAttachToken = z.infer<typeof cliAttachTokenSchema>;
export type ChatSessionState = z.infer<typeof chatSessionStateSchema>;
export type ProjectThreadSummary = z.infer<typeof projectThreadSummarySchema>;
export type ProjectSearchResult = z.infer<typeof projectSearchResultSchema>;
export type WorkspaceProjectState = z.infer<typeof workspaceProjectStateSchema>;
export type WorkspaceState = z.infer<typeof workspaceStateSchema>;
export type ClientCommand = z.infer<typeof clientCommandSchema>;
export type ServerEvent = z.infer<typeof serverEventSchema>;

export function createRequestId(): RequestId {
  return crypto.randomUUID();
}

export function createSessionId(): SessionId {
  return crypto.randomUUID();
}

export function createThreadId(): ThreadId {
  return crypto.randomUUID();
}

export function createProjectId(): ProjectId {
  return crypto.randomUUID();
}

export function createRunId(): RunId {
  return crypto.randomUUID();
}

export function createExperimentId(): z.infer<typeof experimentIdSchema> {
  return crypto.randomUUID();
}

export function createMemoryEntryId(): z.infer<typeof memoryEntryIdSchema> {
  return crypto.randomUUID();
}

export function createMemoryRetrievalId(): z.infer<typeof memoryRetrievalIdSchema> {
  return crypto.randomUUID();
}

export function createBackgroundJobId(): BackgroundJobId {
  return crypto.randomUUID();
}

export function createBackgroundJobRunId(): BackgroundJobRunId {
  return crypto.randomUUID();
}

export function createAssistantId(): z.infer<typeof assistantIdSchema> {
  return crypto.randomUUID();
}

export function createAssistantThreadId(): z.infer<typeof assistantThreadIdSchema> {
  return crypto.randomUUID();
}

export function createAssistantTodoId(): z.infer<typeof assistantTodoIdSchema> {
  return crypto.randomUUID();
}

export function createAssistantLearningId(): z.infer<typeof assistantLearningIdSchema> {
  return crypto.randomUUID();
}

export function createAssistantQuestionId(): z.infer<typeof assistantQuestionIdSchema> {
  return crypto.randomUUID();
}

export function createAssistantLogEntryId(): z.infer<typeof assistantLogEntryIdSchema> {
  return crypto.randomUUID();
}

export function createAssistantAssetRefId(): z.infer<typeof assistantAssetRefIdSchema> {
  return crypto.randomUUID();
}

export function createQuestionId(): QuestionId {
  return crypto.randomUUID();
}

export function createPlanningChoiceId(): PlanningChoiceId {
  return crypto.randomUUID();
}

export function createChatMessage(
  role: ChatRole,
  content: string,
  options: {
    kind?: ChatMessageKind;
    attachments?: ChatAttachment[];
    metadata?: ChatMessageMetadata;
    id?: string;
  } = {}
): ChatMessage {
  return {
    id: options.id ?? crypto.randomUUID(),
    role,
    kind: options.kind ?? "plain",
    content,
    attachments: options.attachments,
    metadata: options.metadata,
    createdAt: new Date().toISOString()
  };
}

export function createEmptySession(sessionId: SessionId = createSessionId()): ChatSessionState {
  return {
    sessionId,
    selectedAgentId: "pi",
    executionModelId: "openai/gpt-5.4",
    messages: [],
    isStreaming: false
  };
}

export function createProjectThreadSummary(
  input: Pick<ProjectThreadSummary, "id" | "title" | "titleSource" | "updatedAt"> &
    Partial<
      Pick<ProjectThreadSummary, "kind" | "badgeState" | "messageCount" | "lastMessagePreview" | "forkedFromThreadId">
    >
): ProjectThreadSummary {
  return {
    id: input.id,
    kind: input.kind ?? "user",
    title: input.title,
    titleSource: input.titleSource,
    badgeState: input.badgeState ?? "idle",
    messageCount: input.messageCount ?? 0,
    lastMessagePreview: input.lastMessagePreview,
    updatedAt: input.updatedAt,
    forkedFromThreadId: input.forkedFromThreadId
  };
}

export function createWorkspaceProjectState(
  input: Pick<WorkspaceProjectState, "id" | "name" | "rootPath"> & {
    activeThreadId?: ThreadId;
    session?: ChatSessionState;
    threads?: ProjectThreadSummary[];
    selectedModeId?: ModeId;
    projectModes?: ModeDefinition[];
    projectRuleSource?: WorkspaceRuleSource;
    threadMemorySummary?: MemorySummary;
  }
): WorkspaceProjectState {
  const activeThreadId = input.activeThreadId ?? createThreadId();
  return {
    id: input.id,
    name: input.name,
    rootPath: input.rootPath,
    activeThreadId,
    selectedModeId: input.selectedModeId ?? "implement",
    projectModes: input.projectModes ?? [],
    projectRuleSource: input.projectRuleSource,
    threadMemorySummary: input.threadMemorySummary,
    threads:
      input.threads ??
      [
        createProjectThreadSummary({
          id: activeThreadId,
          kind: "user",
          title: "Thread 1",
          titleSource: "generated",
          updatedAt: new Date().toISOString()
        })
      ],
    session: input.session ?? createEmptySession(),
    activeRun: undefined,
    lastRun: undefined
  };
}

export function parseClientCommand(input: unknown): ClientCommand {
  return clientCommandSchema.parse(input);
}

export function parseServerEvent(input: unknown): ServerEvent {
  return serverEventSchema.parse(input);
}
