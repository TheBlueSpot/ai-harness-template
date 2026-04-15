import { Buffer } from "node:buffer";
import type { ImageContent } from "@mariozechner/pi-ai";
import {
  MAX_CHAT_ATTACHMENT_IMAGES_PER_PROMPT,
  MAX_CHAT_ATTACHMENT_TEXT_CHARS,
  MAX_CHAT_ATTACHMENT_TOTAL_NON_IMAGE_CHARS
} from "../../shared/chat-attachments";
import type { ChatAttachment, ChatMessage } from "../../shared/protocol";
import { extractDocumentText } from "./document-extractors";

type PromptAttachmentContext = {
  transcript: string;
  images: ImageContent[];
};

type TextBudget = {
  remainingChars: number;
};

export async function buildPromptAttachmentContext(messages: ChatMessage[]): Promise<PromptAttachmentContext> {
  const visibleMessages = messages.filter((message) => message.role !== "system");
  if (visibleMessages.length === 0) {
    return {
      transcript: "(no prior messages)",
      images: []
    };
  }

  const images: ImageContent[] = [];
  const transcriptParts: string[] = [];
  const textBudget: TextBudget = {
    remainingChars: MAX_CHAT_ATTACHMENT_TOTAL_NON_IMAGE_CHARS
  };

  for (const message of visibleMessages) {
    transcriptParts.push(`${message.role.toUpperCase()}: ${message.content}`);
    if (!message.attachments?.length) {
      continue;
    }

    for (const attachment of message.attachments) {
      const attachmentPart = await describeAttachment(message.role, attachment, images.length + 1, textBudget);
      transcriptParts.push(attachmentPart.transcript);
      if (attachmentPart.image && images.length < MAX_CHAT_ATTACHMENT_IMAGES_PER_PROMPT) {
        images.push(attachmentPart.image);
      }
    }
  }

  return {
    transcript: transcriptParts.join("\n"),
    images
  };
}

async function describeAttachment(
  role: ChatMessage["role"],
  attachment: ChatAttachment,
  imageOrdinal: number,
  textBudget: TextBudget
) {
  if (attachment.kind === "image") {
    if (imageOrdinal > MAX_CHAT_ATTACHMENT_IMAGES_PER_PROMPT) {
      return {
        transcript: `[Attachment image skipped] ${role} attached ${attachment.name}; image limit reached.`
      };
    }

    try {
      const response = await fetch(attachment.url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const imageBuffer = Buffer.from(await response.arrayBuffer());
      return {
        transcript: `[Attachment image ${imageOrdinal}] ${role} attached ${attachment.name} (${attachment.mimeType}, ${attachment.sizeBytes} bytes).`,
        image: {
          type: "image" as const,
          data: imageBuffer.toString("base64"),
          mimeType: attachment.mimeType
        }
      };
    } catch (error) {
      return {
        transcript: `[Attachment image unavailable] ${attachment.name}: ${
          error instanceof Error ? error.message : "unknown fetch failure"
        }.`
      };
    }
  }

  try {
    const response = await fetch(attachment.url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    if (attachment.kind === "document") {
      const extractionResult = await extractDocumentText(attachment, await response.arrayBuffer());
      if (extractionResult.status === "ocr-required") {
        return {
          transcript: `[Attachment document OCR required] ${attachment.name}: ${extractionResult.reason}`
        };
      }

      if (extractionResult.status === "no-text") {
        return {
          transcript: `[Attachment document unavailable] ${attachment.name}: ${extractionResult.reason}`
        };
      }

      return {
        transcript: formatNonImageAttachmentTranscript({
          role,
          attachment,
          label: `Attachment document ${attachment.documentType ?? "unknown"}`,
          content: extractionResult.text,
          emptyText: "Attachment contents: (no extractable text)"
        }, textBudget)
      };
    }

    const text = (await response.text()).trim();
    return {
      transcript: formatNonImageAttachmentTranscript({
        role,
        attachment,
        label: "Attachment text",
        content: text,
        emptyText: "Attachment contents: (empty file)"
      }, textBudget)
    };
  } catch (error) {
    const kindLabel = attachment.kind === "document" ? "document unavailable" : "text unavailable";
    return {
      transcript: `[Attachment ${kindLabel}] ${attachment.name}: ${
        error instanceof Error ? error.message : "unknown fetch failure"
      }.`
    };
  }
}

function formatNonImageAttachmentTranscript(
  input: {
    role: ChatMessage["role"];
    attachment: ChatAttachment;
    label: string;
    content: string;
    emptyText: string;
  },
  textBudget: TextBudget
) {
  const header = `[${input.label}] ${input.role} attached ${input.attachment.name} (${input.attachment.mimeType}, ${input.attachment.sizeBytes} bytes).`;
  const trimmedContent = input.content.trim();
  if (!trimmedContent) {
    return [header, input.emptyText].join("\n");
  }

  if (textBudget.remainingChars <= 0) {
    return [header, "Attachment contents: text budget exhausted before this attachment."].join("\n");
  }

  const allowedChars = Math.min(MAX_CHAT_ATTACHMENT_TEXT_CHARS, textBudget.remainingChars);
  const consumedChars = Math.min(trimmedContent.length, allowedChars);
  const truncated = trimmedContent.length > allowedChars;
  const visibleContent = truncated ? `${trimmedContent.slice(0, allowedChars)}\n...[truncated]` : trimmedContent;
  textBudget.remainingChars -= consumedChars;

  return [header, `Attachment contents:\n${visibleContent}`].join("\n");
}
