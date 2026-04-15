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

const DOCUMENT_ATTACHMENT_EXTENSIONS = new Map<string, ChatDocumentType>([
  [".pdf", "pdf"],
  [".docx", "docx"],
  [".xlsx", "xlsx"],
  [".pptx", "pptx"],
  [".odt", "odt"]
]);

const DOCUMENT_ATTACHMENT_MIME_TYPES = new Map<string, ChatDocumentType>([
  ["application/pdf", "pdf"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"],
  ["application/vnd.openxmlformats-officedocument.presentationml.presentation", "pptx"],
  ["application/vnd.oasis.opendocument.text", "odt"]
]);

export const MAX_CHAT_ATTACHMENT_COUNT = 6;
export const MAX_CHAT_ATTACHMENT_TEXT_BYTES = 256 * 1024;
export const MAX_CHAT_ATTACHMENT_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_CHAT_ATTACHMENT_DOCUMENT_BYTES = 16 * 1024 * 1024;
export const MAX_CHAT_ATTACHMENT_TEXT_CHARS = 24000;
export const MAX_CHAT_ATTACHMENT_TOTAL_NON_IMAGE_CHARS = 48000;
export const MAX_CHAT_ATTACHMENT_IMAGES_PER_PROMPT = 4;

export type ChatDocumentType = "pdf" | "docx" | "xlsx" | "pptx" | "odt";
export type ChatAttachmentKind = "image" | "text" | "document";
export type SupportedChatAttachment =
  | { kind: "image" }
  | { kind: "text" }
  | { kind: "document"; documentType: ChatDocumentType };

export function getChatAttachmentExtension(name: string) {
  const normalized = name.trim().toLowerCase();
  const extensionIndex = normalized.lastIndexOf(".");
  return extensionIndex >= 0 ? normalized.slice(extensionIndex) : "";
}

export function detectChatDocumentType(input: { name: string; mimeType?: string | null }): ChatDocumentType | undefined {
  const mimeType = input.mimeType?.trim().toLowerCase() ?? "";
  const documentTypeFromMime = DOCUMENT_ATTACHMENT_MIME_TYPES.get(mimeType);
  if (documentTypeFromMime) {
    return documentTypeFromMime;
  }

  const extension = getChatAttachmentExtension(input.name);
  return DOCUMENT_ATTACHMENT_EXTENSIONS.get(extension);
}

export function detectSupportedChatAttachment(input: { name: string; mimeType?: string | null }): SupportedChatAttachment | undefined {
  const mimeType = input.mimeType?.trim().toLowerCase() ?? "";
  if (mimeType.startsWith("image/")) {
    return { kind: "image" };
  }

  const documentType = detectChatDocumentType(input);
  if (documentType) {
    return {
      kind: "document",
      documentType
    };
  }

  if (mimeType.startsWith("text/") || TEXT_ATTACHMENT_MIME_TYPES.has(mimeType)) {
    return { kind: "text" };
  }

  const extension = getChatAttachmentExtension(input.name);
  if (TEXT_ATTACHMENT_EXTENSIONS.has(extension)) {
    return { kind: "text" };
  }

  return undefined;
}

export function detectChatAttachmentKind(input: { name: string; mimeType?: string | null }): ChatAttachmentKind | undefined {
  return detectSupportedChatAttachment(input)?.kind;
}

export function isSupportedChatAttachment(input: { name: string; mimeType?: string | null; sizeBytes: number }) {
  const detectedAttachment = detectSupportedChatAttachment(input);
  if (!detectedAttachment) {
    return {
      ok: false as const,
      reason: "Only images, text-like files, PDFs, and modern office or OpenDocument text files are supported right now."
    };
  }

  if (detectedAttachment.kind === "image" && input.sizeBytes > MAX_CHAT_ATTACHMENT_IMAGE_BYTES) {
    return {
      ok: false as const,
      reason: "Images must be 8MB or smaller."
    };
  }

  if (detectedAttachment.kind === "text" && input.sizeBytes > MAX_CHAT_ATTACHMENT_TEXT_BYTES) {
    return {
      ok: false as const,
      reason: "Text-like files must be 256KB or smaller."
    };
  }

  if (detectedAttachment.kind === "document" && input.sizeBytes > MAX_CHAT_ATTACHMENT_DOCUMENT_BYTES) {
    return {
      ok: false as const,
      reason: "PDF and office documents must be 16MB or smaller."
    };
  }

  return {
    ok: true as const,
    ...detectedAttachment
  };
}
