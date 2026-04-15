import { getDocument } from "pdfjs-dist";
import { normalizeExtractedText } from "./extract-office-zip";
import type { DocumentExtractionResult } from "./types";

export async function extractPdfText(input: ArrayBuffer | Uint8Array | Buffer): Promise<DocumentExtractionResult> {
  const data = toPdfUint8Array(input);
  const loadingTask = getDocument({
    data,
    useWorkerFetch: false,
    isOffscreenCanvasSupported: false,
    isImageDecoderSupported: false,
    disableFontFace: true,
    stopAtErrors: false
  });

  const pdfDocument = await loadingTask.promise;
  try {
    const pageTexts: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
      const page = await pdfDocument.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
        .trim();
      if (pageText) {
        pageTexts.push(pageText);
      }
    }

    const text = normalizeExtractedText(pageTexts.join("\n\n"));
    if (!text) {
      return pdfDocument.numPages > 0
        ? {
            status: "ocr-required",
            reason: "PDF pages loaded, but no extractable text was found. OCR is not implemented yet."
          }
        : {
            status: "no-text",
            reason: "No extractable text found in the PDF."
          };
    }

    return {
      status: "ok",
      text
    };
  } finally {
    await pdfDocument.destroy();
  }
}

function toPdfUint8Array(input: ArrayBuffer | Uint8Array | Buffer) {
  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input);
  }

  return new Uint8Array(input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength));
}
