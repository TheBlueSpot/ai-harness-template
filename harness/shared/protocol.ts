import { z } from "zod";

export const requestIdSchema = z.string().min(1).max(128);
export const sessionIdSchema = z.string().min(1).max(128);
export const modelIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9._:-]+$/, "Model ids must be simple and shell-safe");

export const chatRoleSchema = z.enum(["system", "user", "assistant"]);

export const chatMessageSchema = z.object({
  id: z.string().min(1).max(128),
  role: chatRoleSchema,
  content: z.string().min(1),
  createdAt: z.string().datetime().or(z.string().min(1))
});

export const modelOptionSchema = z.object({
  id: modelIdSchema,
  label: z.string().min(1),
  description: z.string().min(1).optional()
});

export const connectionStateSchema = z.enum([
  "disconnected",
  "connecting",
  "connected",
  "error"
]);

export const chatSessionStateSchema = z.object({
  sessionId: sessionIdSchema,
  selectedModelId: modelIdSchema.optional(),
  messages: z.array(chatMessageSchema),
  isStreaming: z.boolean(),
  lastError: z.string().min(1).optional()
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
    type: z.literal("model.list"),
    requestId: requestIdSchema
  }),
  z.object({
    type: z.literal("session.reset"),
    requestId: requestIdSchema,
    payload: z.object({
      sessionId: sessionIdSchema
    })
  }),
  z.object({
    type: z.literal("chat.stop"),
    requestId: requestIdSchema,
    payload: z.object({
      sessionId: sessionIdSchema
    })
  }),
  z.object({
    type: z.literal("chat.send"),
    requestId: requestIdSchema,
    payload: z.object({
      sessionId: sessionIdSchema,
      modelId: modelIdSchema,
      content: z.string().min(1).max(32000)
    })
  })
]);

export const serverEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("connection.ready"),
    payload: z.object({
      sessionId: sessionIdSchema,
      models: z.array(modelOptionSchema),
      state: chatSessionStateSchema
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
    type: z.literal("model.list"),
    requestId: requestIdSchema,
    payload: z.object({
      models: z.array(modelOptionSchema)
    })
  }),
  z.object({
    type: z.literal("chat.delta"),
    requestId: requestIdSchema,
    payload: z.object({
      sessionId: sessionIdSchema,
      delta: z.string()
    })
  }),
  z.object({
    type: z.literal("chat.complete"),
    requestId: requestIdSchema,
    payload: z.object({
      sessionId: sessionIdSchema,
      assistantMessage: chatMessageSchema,
      state: chatSessionStateSchema
    })
  }),
  z.object({
    type: z.literal("chat.error"),
    requestId: requestIdSchema,
    payload: z.object({
      sessionId: sessionIdSchema.optional(),
      message: z.string().min(1),
      detail: z.string().min(1).optional()
    })
  }),
  z.object({
    type: z.literal("session.reset"),
    requestId: requestIdSchema,
    payload: z.object({
      sessionId: sessionIdSchema,
      state: chatSessionStateSchema
    })
  }),
  z.object({
    type: z.literal("command.rejected"),
    requestId: requestIdSchema.optional(),
    payload: z.object({
      message: z.string().min(1),
      detail: z.string().min(1).optional()
    })
  })
]);

export type RequestId = z.infer<typeof requestIdSchema>;
export type SessionId = z.infer<typeof sessionIdSchema>;
export type ModelId = z.infer<typeof modelIdSchema>;
export type ChatRole = z.infer<typeof chatRoleSchema>;
export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type ModelOption = z.infer<typeof modelOptionSchema>;
export type ConnectionState = z.infer<typeof connectionStateSchema>;
export type ChatSessionState = z.infer<typeof chatSessionStateSchema>;
export type ClientCommand = z.infer<typeof clientCommandSchema>;
export type ServerEvent = z.infer<typeof serverEventSchema>;

export function createRequestId(): RequestId {
  return crypto.randomUUID();
}

export function createSessionId(): SessionId {
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

export function createEmptySession(
  sessionId: SessionId = createSessionId()
): ChatSessionState {
  return {
    sessionId,
    messages: [],
    isStreaming: false
  };
}

export function parseClientCommand(input: unknown): ClientCommand {
  return clientCommandSchema.parse(input);
}

export function parseServerEvent(input: unknown): ServerEvent {
  return serverEventSchema.parse(input);
}

