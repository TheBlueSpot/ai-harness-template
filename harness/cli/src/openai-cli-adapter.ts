import { defaultModelCatalog } from "../../shared/model-catalog";
import {
  createChatMessage,
  type ChatMessage,
  type ChatSessionState,
  modelIdSchema
} from "../../shared/protocol";

export type OpenAiCliInvocation = {
  command: string[];
  input: string;
};

export type OpenAiCliConversationRequest = {
  modelId: string;
  messages: ChatMessage[];
  abortSignal?: AbortSignal;
};

export type OpenAiCliConversationResult = {
  assistantText: string;
};

export function listOpenAiModels() {
  return [...defaultModelCatalog];
}

export function buildOpenAiCliInvocation(
  request: OpenAiCliConversationRequest
): OpenAiCliInvocation {
  const modelId = modelIdSchema.parse(request.modelId);
  const input = JSON.stringify({
    model: modelId,
    messages: request.messages.map((message) => ({
      role: message.role,
      content: message.content
    }))
  });

  return {
    command: ["openai", "responses", "create", "--model", modelId, "--input", "-"],
    input
  };
}

export async function runOpenAiCliConversation(
  request: OpenAiCliConversationRequest
): Promise<OpenAiCliConversationResult> {
  const invocation = buildOpenAiCliInvocation(request);

  const process = Bun.spawn({
    cmd: invocation.command,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    signal: request.abortSignal
  });

  if (process.stdin) {
    await process.stdin.write(invocation.input);
    await process.stdin.end();
  }

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout ?? null).text(),
    new Response(process.stderr ?? null).text(),
    process.exited
  ]);

  if (exitCode !== 0) {
    throw new Error(stderr.trim() || stdout.trim() || "OpenAI CLI invocation failed");
  }

  const assistantText = stdout.trim() || stderr.trim();

  if (!assistantText) {
    throw new Error("OpenAI CLI returned an empty response");
  }

  return { assistantText };
}

export function createAssistantFallbackMessage(sessionState: ChatSessionState) {
  const latestUserMessage = [...sessionState.messages].reverse().find((message) => message.role === "user");

  return createChatMessage(
    "assistant",
    latestUserMessage
      ? `OpenAI CLI adapter is wired, but this scaffold is awaiting a real CLI response. Latest user message: ${latestUserMessage.content}`
      : "OpenAI CLI adapter is wired, but there is no user message to respond to yet."
  );
}
