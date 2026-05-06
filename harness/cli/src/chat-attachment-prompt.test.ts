import { Buffer } from "node:buffer";
import { afterEach, describe, expect, test } from "bun:test";
import { buildPromptAttachmentContext } from "./chat-attachment-prompt";
import { createDataUrl, createSampleDocxBuffer, createSamplePdfBuffer } from "./document-extractors/test-fixtures";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("chat attachment prompt builder", () => {
  test("adds extracted document and text attachment context", async () => {
    const result = await buildPromptAttachmentContext([
      {
        id: "message-1",
        role: "user",
        kind: "plain",
        content: "Review the attachments",
        attachments: [
          {
            id: "attachment-docx",
            kind: "document",
            documentType: "docx",
            name: "brief.docx",
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            sizeBytes: createSampleDocxBuffer().length,
            url: createDataUrl(
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              createSampleDocxBuffer()
            ),
            key: "attachment-docx",
            uploadedAt: new Date().toISOString()
          },
          {
            id: "attachment-text",
            kind: "text",
            name: "notes.md",
            mimeType: "text/markdown",
            sizeBytes: 17,
            url: "data:text/markdown,ship%20smallest%20slice",
            key: "attachment-text",
            uploadedAt: new Date().toISOString()
          }
        ],
        createdAt: new Date().toISOString()
      }
    ]);

    expect(result.images).toHaveLength(0);
    expect(result.transcript).toContain("Attachment document docx");
    expect(result.transcript).toContain("Docx intro");
    expect(result.transcript).toContain("Cell A1\tCell B1");
    expect(result.transcript).toContain("ship smallest slice");
  });

  test("reports malformed document and fetch failures explicitly", async () => {
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url === "https://example.com/fail.docx") {
        throw new Error("network down");
      }

      return new Response(createSamplePdfBuffer(), {
        status: 200,
        headers: {
          "content-type": "application/pdf"
        }
      });
    }) as typeof fetch;

    const result = await buildPromptAttachmentContext([
      {
        id: "message-1",
        role: "user",
        kind: "plain",
        content: "Inspect failure states",
        attachments: [
          {
            id: "attachment-bad-docx",
            kind: "document",
            documentType: "docx",
            name: "broken.docx",
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            sizeBytes: 24,
            url: createDataUrl(
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              Buffer.from("not-a-zip")
            ),
            key: "broken",
            uploadedAt: new Date().toISOString()
          },
          {
            id: "attachment-fail-docx",
            kind: "document",
            documentType: "docx",
            name: "fail.docx",
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            sizeBytes: 24,
            url: "https://example.com/fail.docx",
            key: "fail",
            uploadedAt: new Date().toISOString()
          }
        ],
        createdAt: new Date().toISOString()
      }
    ]);

    expect(result.transcript).toContain("[Attachment document unavailable] broken.docx:");
    expect(result.transcript).toContain("[Attachment document unavailable] fail.docx: network down.");
  });

  test("caps total non-image text budget with explicit truncation", async () => {
    const oversizedText = "x".repeat(50000);
    const result = await buildPromptAttachmentContext([
      {
        id: "message-1",
        role: "user",
        kind: "plain",
        content: "Budget test",
        attachments: [
          {
            id: "attachment-pdf",
            kind: "document",
            documentType: "pdf",
            name: "spec.pdf",
            mimeType: "application/pdf",
            sizeBytes: createSamplePdfBuffer().length,
            url: createDataUrl("application/pdf", createSamplePdfBuffer()),
            key: "pdf",
            uploadedAt: new Date().toISOString()
          },
          {
            id: "attachment-text",
            kind: "text",
            name: "huge.txt",
            mimeType: "text/plain",
            sizeBytes: oversizedText.length,
            url: `data:text/plain,${oversizedText}`,
            key: "huge",
            uploadedAt: new Date().toISOString()
          }
        ],
        createdAt: new Date().toISOString()
      }
    ]);

    expect(result.transcript).toContain("Hello PDF extraction");
    expect(result.transcript).toContain("Attachment contents: moved to cacheable context block.");
    expect(result.cacheableUserBlocks).toHaveLength(1);
    expect(result.cacheableUserBlocks[0]?.text).toContain("...[truncated]");
  });
});
