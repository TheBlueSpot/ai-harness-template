import { describe, expect, test } from "bun:test";
import {
  detectChatDocumentType,
  detectSupportedChatAttachment,
  isSupportedChatAttachment,
  MAX_CHAT_ATTACHMENT_DOCUMENT_BYTES,
  MAX_CHAT_ATTACHMENT_TEXT_BYTES
} from "./chat-attachments";

describe("chat attachment support", () => {
  test("detects supported document formats", () => {
    expect(detectChatDocumentType({ name: "spec.pdf", mimeType: "application/pdf" })).toBe("pdf");
    expect(
      detectSupportedChatAttachment({
        name: "spec.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      })
    ).toEqual({
      kind: "document",
      documentType: "docx"
    });
    expect(
      detectSupportedChatAttachment({
        name: "report.odt",
        mimeType: "application/vnd.oasis.opendocument.text"
      })
    ).toEqual({
      kind: "document",
      documentType: "odt"
    });
  });

  test("accepts modern document formats and rejects legacy binary office files", () => {
    expect(
      isSupportedChatAttachment({
        name: "slides.pptx",
        mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        sizeBytes: 1024
      })
    ).toEqual({
      ok: true,
      kind: "document",
      documentType: "pptx"
    });
    expect(
      isSupportedChatAttachment({
        name: "legacy.doc",
        mimeType: "application/msword",
        sizeBytes: 1024
      })
    ).toEqual({
      ok: false,
      reason: "Only images, text-like files, PDFs, and modern office or OpenDocument text files are supported right now."
    });
  });

  test("enforces document and text size limits", () => {
    expect(
      isSupportedChatAttachment({
        name: "large.pdf",
        mimeType: "application/pdf",
        sizeBytes: MAX_CHAT_ATTACHMENT_DOCUMENT_BYTES + 1
      })
    ).toEqual({
      ok: false,
      reason: "PDF and office documents must be 16MB or smaller."
    });
    expect(
      isSupportedChatAttachment({
        name: "notes.md",
        mimeType: "text/markdown",
        sizeBytes: MAX_CHAT_ATTACHMENT_TEXT_BYTES + 1
      })
    ).toEqual({
      ok: false,
      reason: "Text-like files must be 256KB or smaller."
    });
  });
});
