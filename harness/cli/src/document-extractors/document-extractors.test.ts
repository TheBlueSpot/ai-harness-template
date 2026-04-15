import { describe, expect, test } from "bun:test";
import { extractDocumentText } from "./index";
import {
  createSampleDocxBuffer,
  createSampleOdtBuffer,
  createSamplePdfBuffer,
  createSamplePptxBuffer,
  createSampleXlsxBuffer,
  createScanOnlyPdfBuffer
} from "./test-fixtures";

describe("document extractors", () => {
  test("extracts text from supported document formats", async () => {
    const pdfResult = await extractDocumentText(
      {
        id: "pdf",
        kind: "document",
        documentType: "pdf",
        name: "spec.pdf",
        mimeType: "application/pdf",
        sizeBytes: createSamplePdfBuffer().length,
        url: "https://example.com/spec.pdf",
        key: "pdf",
        uploadedAt: new Date().toISOString()
      },
      createSamplePdfBuffer()
    );
    expect(pdfResult).toEqual({
      status: "ok",
      text: "Hello PDF extraction"
    });

    const docxResult = await extractDocumentText(
      {
        id: "docx",
        kind: "document",
        documentType: "docx",
        name: "brief.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        sizeBytes: createSampleDocxBuffer().length,
        url: "https://example.com/brief.docx",
        key: "docx",
        uploadedAt: new Date().toISOString()
      },
      createSampleDocxBuffer()
    );
    expect(docxResult).toEqual({
      status: "ok",
      text: "Docx intro\nCell A1\tCell B1"
    });

    const xlsxResult = await extractDocumentText(
      {
        id: "xlsx",
        kind: "document",
        documentType: "xlsx",
        name: "backlog.xlsx",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        sizeBytes: createSampleXlsxBuffer().length,
        url: "https://example.com/backlog.xlsx",
        key: "xlsx",
        uploadedAt: new Date().toISOString()
      },
      createSampleXlsxBuffer()
    );
    expect(xlsxResult).toEqual({
      status: "ok",
      text: "Sheet: Backlog\nTask\tShip docs"
    });

    const pptxResult = await extractDocumentText(
      {
        id: "pptx",
        kind: "document",
        documentType: "pptx",
        name: "deck.pptx",
        mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        sizeBytes: createSamplePptxBuffer().length,
        url: "https://example.com/deck.pptx",
        key: "pptx",
        uploadedAt: new Date().toISOString()
      },
      createSamplePptxBuffer()
    );
    expect(pptxResult).toEqual({
      status: "ok",
      text: "Slide 1\nSlide heading\nFollow-up bullet"
    });

    const odtResult = await extractDocumentText(
      {
        id: "odt",
        kind: "document",
        documentType: "odt",
        name: "notes.odt",
        mimeType: "application/vnd.oasis.opendocument.text",
        sizeBytes: createSampleOdtBuffer().length,
        url: "https://example.com/notes.odt",
        key: "odt",
        uploadedAt: new Date().toISOString()
      },
      createSampleOdtBuffer()
    );
    expect(odtResult).toEqual({
      status: "ok",
      text: "ODT heading\nODT paragraph\n- First item\nTable A1\tTable B1"
    });
  });

  test("marks textless pdfs as OCR follow-up work", async () => {
    const result = await extractDocumentText(
      {
        id: "scan",
        kind: "document",
        documentType: "pdf",
        name: "scan.pdf",
        mimeType: "application/pdf",
        sizeBytes: createScanOnlyPdfBuffer().length,
        url: "https://example.com/scan.pdf",
        key: "scan",
        uploadedAt: new Date().toISOString()
      },
      createScanOnlyPdfBuffer()
    );

    expect(result).toEqual({
      status: "ocr-required",
      reason: "PDF pages loaded, but no extractable text was found. OCR is not implemented yet."
    });
  });
});
