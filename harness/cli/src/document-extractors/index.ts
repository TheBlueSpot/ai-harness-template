import { Buffer } from "node:buffer";
import { detectChatDocumentType } from "../../../shared/chat-attachments";
import type { ChatAttachment } from "../../../shared/protocol";
import { extractDocxText } from "./extract-docx";
import { extractOdtText } from "./extract-odt";
import { extractPptxText } from "./extract-pptx";
import { extractXlsxText } from "./extract-xlsx";
import type { DocumentExtractionResult } from "./types";

export async function extractDocumentText(attachment: ChatAttachment, input: ArrayBuffer | Uint8Array | Buffer) {
  const documentType = attachment.documentType ?? detectChatDocumentType(attachment);
  if (!documentType) {
    return {
      status: "no-text",
      reason: `Unsupported document type for ${attachment.name}.`
    } satisfies DocumentExtractionResult;
  }

  switch (documentType) {
    case "pdf":
      return extractPdfText(input);
    case "docx":
      return extractDocxText(input);
    case "xlsx":
      return extractXlsxText(input);
    case "pptx":
      return extractPptxText(input);
    case "odt":
      return extractOdtText(input);
  }
}

async function extractPdfText(input: ArrayBuffer | Uint8Array | Buffer) {
  const { extractPdfText } = await import("./extract-pdf");
  return extractPdfText(input);
}
