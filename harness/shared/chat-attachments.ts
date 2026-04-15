const TEXT_ATTACHMENT_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".markdown",
  ".json",
  ".yml",
  ".yaml",
  ".xml",
  ".html",
  ".css",
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
  ".py",
  ".rb",
  ".go",
  ".rs",
  ".java",
  ".kt",
  ".swift",
  ".sql",
  ".sh",
  ".bash",
  ".zsh",
  ".ini",
  ".toml",
  ".env",
  ".csv",
  ".log"
]);

const TEXT_ATTACHMENT_MIME_TYPES = new Set([
  "application/json",
  "application/ld+json",
  "application/xml",
  "application/javascript",
  "application/x-javascript",
  "application/ecmascript",
  "application/typescript",
  "application/x-typescript",
  "text/markdown",
  "text/x-markdown"
]);

export const MAX_CHAT_ATTACHMENT_COUNT = 6;
export const MAX_CHAT_ATTACHMENT_TEXT_BYTES = 256 * 1024;
export const MAX_CHAT_ATTACHMENT_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_CHAT_ATTACHMENT_TEXT_CHARS = 24000;
export const MAX_CHAT_ATTACHMENT_IMAGES_PER_PROMPT = 4;

export type ChatAttachmentKind = "image" | "text";

export function getChatAttachmentExtension(name: string) {
  const normalized = name.trim().toLowerCase();
  const extensionIndex = normalized.lastIndexOf(".");
  return extensionIndex >= 0 ? normalized.slice(extensionIndex) : "";
}

export function detectChatAttachmentKind(input: { name: string; mimeType?: string | null }): ChatAttachmentKind | undefined {
  const mimeType = input.mimeType?.trim().toLowerCase() ?? "";
  if (mimeType.startsWith("image/")) {
    return "image";
  }

  if (mimeType.startsWith("text/") || TEXT_ATTACHMENT_MIME_TYPES.has(mimeType)) {
    return "text";
  }

  const extension = getChatAttachmentExtension(input.name);
  if (TEXT_ATTACHMENT_EXTENSIONS.has(extension)) {
    return "text";
  }

  return undefined;
}

export function isSupportedChatAttachment(input: { name: string; mimeType?: string | null; sizeBytes: number }) {
  const kind = detectChatAttachmentKind(input);
  if (!kind) {
    return {
      ok: false as const,
      reason: "Only images and text-like files are supported right now."
    };
  }

  if (kind === "image" && input.sizeBytes > MAX_CHAT_ATTACHMENT_IMAGE_BYTES) {
    return {
      ok: false as const,
      reason: "Images must be 8MB or smaller."
    };
  }

  if (kind === "text" && input.sizeBytes > MAX_CHAT_ATTACHMENT_TEXT_BYTES) {
    return {
      ok: false as const,
      reason: "Text-like files must be 256KB or smaller."
    };
  }

  return {
    ok: true as const,
    kind
  };
}
