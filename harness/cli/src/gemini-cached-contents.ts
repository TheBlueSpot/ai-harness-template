import { createHash } from "node:crypto";
import { GoogleGenAI } from "@google/genai";
import type { ChatAttachment, ChatMessage, ProjectId } from "../../shared/protocol";
import { extractDocumentText } from "./document-extractors";
import type { WorkspaceRepository } from "./workspace-repository";
import { stableStringifyJson } from "./prompt-cache-assembly";

const GEMINI_CACHE_TTL_SECONDS = 86400;
const GEMINI_CACHE_TTL = `${GEMINI_CACHE_TTL_SECONDS}s`;

export type GeminiCachedAttachmentContext = {
  cachedContentName: string;
  attachmentKeys: string[];
};

export async function prepareGeminiCachedAttachmentContext(input: {
  repository: WorkspaceRepository;
  projectId: ProjectId;
  modelId: string;
  messages: ChatMessage[];
  googleApiKey?: string;
  now?: Date;
}): Promise<GeminiCachedAttachmentContext | undefined> {
  if (!supportsGeminiExplicitCaching(input.modelId) || !input.googleApiKey?.trim()) {
    return undefined;
  }

  const attachments = selectEligibleTopLevelAttachments(input.messages);
  if (attachments.length === 0) {
    return undefined;
  }

  const attachmentSetHash = buildGeminiAttachmentSetHash(attachments);
  const now = input.now ?? new Date();
  const existing = input.repository.getGeminiCachedContent({
    projectId: input.projectId,
    modelId: input.modelId,
    attachmentSetHash
  });
  if (existing && Date.parse(existing.expiresAt) > now.getTime()) {
    return {
      cachedContentName: existing.cachedContentName,
      attachmentKeys: attachments.map((attachment) => attachment.key)
    };
  }

  const contents = await buildCachedContents(attachments);
  if (contents.length === 0) {
    return undefined;
  }

  const ai = new GoogleGenAI({ apiKey: input.googleApiKey.trim() });
  const cache = await ai.caches.create({
    model: normalizeGeminiModelId(input.modelId),
    config: {
      contents,
      ttl: GEMINI_CACHE_TTL
    }
  });
  if (!cache.name) {
    return undefined;
  }

  const expiresAt = new Date(now.getTime() + GEMINI_CACHE_TTL_SECONDS * 1000).toISOString();
  input.repository.saveGeminiCachedContent({
    projectId: input.projectId,
    modelId: input.modelId,
    attachmentSetHash,
    cachedContentName: cache.name,
    expiresAt,
    now: now.toISOString()
  });
  return {
    cachedContentName: cache.name,
    attachmentKeys: attachments.map((attachment) => attachment.key)
  };
}

export function supportsGeminiExplicitCaching(modelId: string) {
  return /^google\/gemini-3(?:[.-]|$)/i.test(modelId);
}

export function buildGeminiAttachmentSetHash(attachments: ChatAttachment[]) {
  const stableAttachmentInfo = attachments
    .slice()
    .sort((left, right) => left.key.localeCompare(right.key))
    .map((attachment) => ({
      key: attachment.key,
      name: attachment.name,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      kind: attachment.kind,
      documentType: attachment.documentType,
      url: attachment.url
    }));
  return createHash("sha256").update(stableStringifyJson(stableAttachmentInfo)).digest("hex");
}

function selectEligibleTopLevelAttachments(messages: ChatMessage[]) {
  const lastUserMessage = [...messages].reverse().find((message) => message.role === "user");
  return (lastUserMessage?.attachments ?? [])
    .filter((attachment) => attachment.kind !== "image")
    .slice()
    .sort((left, right) => left.key.localeCompare(right.key));
}

async function buildCachedContents(attachments: ChatAttachment[]) {
  const parts: Array<{ text: string }> = [];
  for (const attachment of attachments) {
    const response = await fetch(attachment.url);
    if (!response.ok) {
      throw new Error(`Attachment ${attachment.name} fetch failed: HTTP ${response.status}`);
    }

    const text =
      attachment.kind === "document"
        ? await extractCachedDocumentText(attachment, await response.arrayBuffer())
        : (await response.text()).trim();
    if (!text.trim()) {
      continue;
    }

    parts.push({
      text: [
        `[Attachment cached source] ${attachment.name} (${attachment.mimeType}, ${attachment.sizeBytes} bytes)`,
        text.trim()
      ].join("\n")
    });
  }

  return parts.length > 0 ? [{ role: "user", parts }] : [];
}

async function extractCachedDocumentText(attachment: ChatAttachment, body: ArrayBuffer) {
  const result = await extractDocumentText(attachment, body);
  return result.status === "ok" ? result.text.trim() : "";
}

function normalizeGeminiModelId(modelId: string) {
  return modelId.startsWith("google/") ? modelId.slice("google/".length) : modelId;
}
