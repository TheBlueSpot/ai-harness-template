import { z } from "zod";

export const requestIdSchema = z.string().min(1).max(128);
export const sessionIdSchema = z.string().min(1).max(128);
export const threadIdSchema = z.string().min(1).max(128);
export const projectIdSchema = z.string().min(1).max(128);
export const runIdSchema = z.string().min(1).max(128);
export const questionIdSchema = z.string().min(1).max(128);
export const planningChoiceIdSchema = z.string().min(1).max(128);
export const projectNameSchema = z.string().min(1).max(256);
export const projectRootPathSchema = z.string().min(1).max(4096);
export const threadTitleSchema = z.string().trim().min(1).max(256);
export const agentIdSchema = z.literal("pi");
export const providerBrandSchema = z.enum(["gpt", "gemini"]);
export const preflightSeveritySchema = z.enum(["warning"]);
export const preflightKindSchema = z.enum(["git-dirty"]);
export const threadTitleSourceSchema = z.enum(["generated", "custom"]);
export const threadBadgeStateSchema = z.enum(["idle", "needs-input", "planning", "executing", "error", "done"]);
export const providerModelIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9._:-]+\/[a-zA-Z0-9._:-]+$/, "Model ids must be provider-qualified");

export const chatRoleSchema = z.enum(["system", "user", "assistant"]);
export const connectionStateSchema = z.enum(["disconnected", "connecting", "connected", "error"]);
export const agentTraceStageSchema = z.enum([
  "planning",
  "planning-question",
  "routing",
  "run-resume",
  "worktree-provision",
  "worktree-cleanup",
  "subagent-start",
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
  "verification-start",
  "verification-complete",
  "sync-back"
]);

export const chatMessageSchema = z.object({
  id: z.string().min(1).max(128),
  role: chatRoleSchema,
  content: z.string().min(1),
  createdAt: z.string().datetime().or(z.string().min(1))
});

export const agentOptionSchema = z.object({
  id: agentIdSchema,
  label: z.string().min(1),
  description: z.string().min(1).optional()
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
  tracePanelDefaultOpen: z.boolean()
});

export const agentPlanSchema = z.object({
  sessionId: sessionIdSchema,
  agentId: agentIdSchema,
  planningModelId: providerModelIdSchema,
  difficultyScore: z.number().min(0).max(100),
  usesSubagents: z.boolean(),
  executionModelId: providerModelIdSchema,
  subtaskCount: z.number().int().min(0)
});

export const agentTraceSchema = z.object({
  sessionId: sessionIdSchema,
  stage: agentTraceStageSchema,
  message: z.string().min(1),
  detail: z.string().min(1).optional(),
  subagentId: z.string().min(1).max(128).optional(),
  modelId: providerModelIdSchema.optional(),
  durationMs: z.number().int().min(0).optional()
});

export const projectContextSourceKindSchema = z.enum(["planner", "main", "subagent", "aggregator"]);

export const projectContextUsageSchema = z.object({
  sourceKind: projectContextSourceKindSchema,
  sourceLabel: z.string().min(1).max(128),
  modelId: providerModelIdSchema,
  tokens: z.number().int().min(0).optional(),
  contextWindow: z.number().int().min(1),
  usagePercent: z.number().min(0).max(100).optional(),
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

export const planningQuestionStatusSchema = z.enum(["pending", "answered"]);

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
  executionModelId: providerModelIdSchema.optional(),
  difficultyScore: z.number().min(0).max(100).optional(),
  summary: z.string().min(1).optional(),
  finalExecutionBrief: z.string().min(1).optional(),
  failureMessage: z.string().min(1).optional(),
  questions: z.array(planningQuestionSchema),
  subtasks: z.array(subagentTaskStateSchema),
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
  executionModelId: providerModelIdSchema,
  usesSubagents: z.boolean(),
  subtasks: z.array(plannerSubtaskSchema).max(8),
  finalExecutionBrief: z.string().min(1)
});

export const plannerTurnResultSchema = z.discriminatedUnion("type", [
  plannerQuestionTurnSchema,
  plannerReadyTurnSchema
]);

export const plannerResultSchema = plannerTurnResultSchema;

export const chatSessionStateSchema = z.object({
  sessionId: sessionIdSchema,
  selectedAgentId: agentIdSchema.optional(),
  executionModelId: providerModelIdSchema.optional(),
  messages: z.array(chatMessageSchema),
  isStreaming: z.boolean(),
  lastError: z.string().min(1).optional()
});

export const projectThreadSummarySchema = z.object({
  id: threadIdSchema,
  title: threadTitleSchema,
  titleSource: threadTitleSourceSchema,
  badgeState: threadBadgeStateSchema,
  messageCount: z.number().int().min(0),
  lastMessagePreview: z.string().min(1).optional(),
  updatedAt: z.string().datetime().or(z.string().min(1)),
  forkedFromThreadId: threadIdSchema.optional()
});

export const workspaceProjectStateSchema = z.object({
  id: projectIdSchema,
  name: projectNameSchema,
  rootPath: projectRootPathSchema,
  activeThreadId: threadIdSchema,
  threads: z.array(projectThreadSummarySchema).min(1),
  session: chatSessionStateSchema,
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
      executionModelId: providerModelIdSchema.optional(),
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
      content: z.string().trim().min(1).max(32000)
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
      subagentIds: z.array(z.string().min(1).max(128)).max(8).optional()
    })
  }),
  z.object({
    type: z.literal("run.retry"),
    requestId: requestIdSchema,
    payload: z.object({
      projectId: projectIdSchema,
      threadId: threadIdSchema,
      runId: runIdSchema,
      subagentId: z.string().min(1).max(128).optional()
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
      tracePanelDefaultOpen: z.boolean()
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
      preferences: preferencesStateSchema
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
    payload: preferencesStateSchema
  }),
  z.object({
    type: z.literal("preferences.apiKeyCleared"),
    requestId: requestIdSchema,
    payload: preferencesStateSchema
  })
]);

export type RequestId = z.infer<typeof requestIdSchema>;
export type SessionId = z.infer<typeof sessionIdSchema>;
export type ThreadId = z.infer<typeof threadIdSchema>;
export type ProjectId = z.infer<typeof projectIdSchema>;
export type RunId = z.infer<typeof runIdSchema>;
export type QuestionId = z.infer<typeof questionIdSchema>;
export type PlanningChoiceId = z.infer<typeof planningChoiceIdSchema>;
export type ProjectName = z.infer<typeof projectNameSchema>;
export type ProjectRootPath = z.infer<typeof projectRootPathSchema>;
export type ThreadTitle = z.infer<typeof threadTitleSchema>;
export type AgentId = z.infer<typeof agentIdSchema>;
export type ProviderBrand = z.infer<typeof providerBrandSchema>;
export type PreflightSeverity = z.infer<typeof preflightSeveritySchema>;
export type PreflightKind = z.infer<typeof preflightKindSchema>;
export type ThreadTitleSource = z.infer<typeof threadTitleSourceSchema>;
export type ThreadBadgeState = z.infer<typeof threadBadgeStateSchema>;
export type ProviderModelId = z.infer<typeof providerModelIdSchema>;
export type ChatRole = z.infer<typeof chatRoleSchema>;
export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type AgentOption = z.infer<typeof agentOptionSchema>;
export type PreferencesState = z.infer<typeof preferencesStateSchema>;
export type ConnectionState = z.infer<typeof connectionStateSchema>;
export type AgentPlan = z.infer<typeof agentPlanSchema>;
export type AgentTrace = z.infer<typeof agentTraceSchema>;
export type ProjectContextSourceKind = z.infer<typeof projectContextSourceKindSchema>;
export type ProjectContextUsage = z.infer<typeof projectContextUsageSchema>;
export type RunPreflight = z.infer<typeof runPreflightSchema>;
export type PlannerSubtask = z.infer<typeof plannerSubtaskSchema>;
export type PlanningChoice = z.infer<typeof planningChoiceSchema>;
export type AgentRunStatus = z.infer<typeof agentRunStatusSchema>;
export type PlanningQuestionStatus = z.infer<typeof planningQuestionStatusSchema>;
export type PlanningQuestion = z.infer<typeof planningQuestionSchema>;
export type SubagentTaskStatus = z.infer<typeof subagentTaskStatusSchema>;
export type SubagentTaskState = z.infer<typeof subagentTaskStateSchema>;
export type AgentRunState = z.infer<typeof agentRunStateSchema>;
export type PlannerQuestionTurn = z.infer<typeof plannerQuestionTurnSchema>;
export type PlannerReadyTurn = z.infer<typeof plannerReadyTurnSchema>;
export type PlannerTurnResult = z.infer<typeof plannerTurnResultSchema>;
export type PlannerResult = z.infer<typeof plannerResultSchema>;
export type ChatSessionState = z.infer<typeof chatSessionStateSchema>;
export type ProjectThreadSummary = z.infer<typeof projectThreadSummarySchema>;
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

export function createQuestionId(): QuestionId {
  return crypto.randomUUID();
}

export function createPlanningChoiceId(): PlanningChoiceId {
  return crypto.randomUUID();
}

export function createChatMessage(
  role: ChatRole,
  content: string,
  id: string = crypto.randomUUID()
): ChatMessage {
  return {
    id,
    role,
    content,
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
    Partial<Pick<ProjectThreadSummary, "badgeState" | "messageCount" | "lastMessagePreview" | "forkedFromThreadId">>
): ProjectThreadSummary {
  return {
    id: input.id,
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
  }
): WorkspaceProjectState {
  const activeThreadId = input.activeThreadId ?? createThreadId();
  return {
    id: input.id,
    name: input.name,
    rootPath: input.rootPath,
    activeThreadId,
    threads:
      input.threads ??
      [
        createProjectThreadSummary({
          id: activeThreadId,
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
