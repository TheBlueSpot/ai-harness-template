import { Buffer } from "node:buffer";
import type { ImageContent } from "@mariozechner/pi-ai";
import {
  MAX_CHAT_ATTACHMENT_IMAGES_PER_PROMPT,
  MAX_CHAT_ATTACHMENT_TEXT_CHARS
} from "../../shared/chat-attachments";
import type { ChatAttachment, ChatMessage } from "../../shared/protocol";

type PromptAttachmentContext = {
  transcript: string;
  images: ImageContent[];
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

  for (const message of visibleMessages) {
    transcriptParts.push(`${message.role.toUpperCase()}: ${message.content}`);
    if (!message.attachments?.length) {
      continue;
    }

    const attachmentParts = await Promise.all(
      message.attachments.map((attachment, index) =>
        describeAttachment(message.role, attachment, images.length + index + 1, images.length < MAX_CHAT_ATTACHMENT_IMAGES_PER_PROMPT)
      )
    );

    for (const attachmentPart of attachmentParts) {
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
  allowImageFetch: boolean
) {
  if (attachment.kind === "image") {
    if (!allowImageFetch) {
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

    const text = (await response.text()).trim();
    const trimmedText =
      text.length > MAX_CHAT_ATTACHMENT_TEXT_CHARS ? `${text.slice(0, MAX_CHAT_ATTACHMENT_TEXT_CHARS)}\n...[truncated]` : text;
    return {
      transcript: [
        `[Attachment text] ${role} attached ${attachment.name} (${attachment.mimeType}, ${attachment.sizeBytes} bytes).`,
        trimmedText ? `Attachment contents:\n${trimmedText}` : "Attachment contents: (empty file)"
      ].join("\n")
    };
  } catch (error) {
    return {
      transcript: `[Attachment text unavailable] ${attachment.name}: ${
        error instanceof Error ? error.message : "unknown fetch failure"
      }.`
    };
  }
}
