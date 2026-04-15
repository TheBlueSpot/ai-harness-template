import {
  getChildObject,
  getChildObjects,
  getNodeText,
  normalizeExtractedText,
  parseXmlDocument,
  readOfficeZipEntries
} from "./extract-office-zip";
import type { DocumentExtractionResult } from "./types";

export async function extractDocxText(input: ArrayBuffer | Uint8Array | Buffer): Promise<DocumentExtractionResult> {
  const entries = await readOfficeZipEntries(input);
  const documentXml = entries.get("word/document.xml");
  if (!documentXml) {
    throw new Error("Missing word/document.xml");
  }

  const blockMatches = documentXml
    .toString("utf8")
    .match(/<w:(p|tbl)\b[\s\S]*?<\/w:\1>/g);

  if (!blockMatches?.length) {
    return {
      status: "no-text",
      reason: "No extractable text found in the DOCX document."
    };
  }

  const blocks = blockMatches
    .map((xmlBlock) => {
      if (xmlBlock.startsWith("<w:tbl")) {
        return extractTableText(xmlBlock);
      }

      return extractParagraphText(xmlBlock);
    })
    .filter((value) => value.length > 0);

  const text = normalizeExtractedText(blocks.join("\n"));
  if (!text) {
    return {
      status: "no-text",
      reason: "No extractable text found in the DOCX document."
    };
  }

  return {
    status: "ok",
    text
  };
}

function extractParagraphText(xmlBlock: string) {
  const paragraph = getChildObject(parseXmlDocument(xmlBlock), "w:p");
  if (!paragraph) {
    return "";
  }

  return normalizeInlineText(readWordInlineText(paragraph)).trim();
}

function extractTableText(xmlBlock: string) {
  const table = getChildObject(parseXmlDocument(xmlBlock), "w:tbl");
  if (!table) {
    return "";
  }

  const rows = getChildObjects(table, "w:tr")
    .map((row) =>
      getChildObjects(row, "w:tc")
        .map((cell) =>
          getChildObjects(cell, "w:p")
            .map((paragraph) => normalizeInlineText(readWordInlineText(paragraph)).trim())
            .filter(Boolean)
            .join(" ")
        )
        .map((value) => value.trim())
        .join("\t")
        .replace(/\t+$/g, "")
    )
    .filter(Boolean);

  return rows.join("\n");
}

function readWordInlineText(node: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(node)) {
    if (key === "w:t") {
      const text = getNodeText(value).replace(/\r\n?/g, "\n");
      if (text) {
        parts.push(text);
      }
      continue;
    }

    if (key === "w:tab") {
      parts.push("\t");
      continue;
    }

    if (key === "w:br" || key === "w:cr") {
      parts.push("\n");
      continue;
    }

    if (key === "#text") {
      continue;
    }

    if (Array.isArray(value)) {
      for (const entry of value) {
        if (entry && typeof entry === "object") {
          parts.push(readWordInlineText(entry as Record<string, unknown>));
        }
      }
      continue;
    }

    if (value && typeof value === "object") {
      parts.push(readWordInlineText(value as Record<string, unknown>));
    }
  }

  return parts.join("");
}

function normalizeInlineText(text: string) {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{2,}/g, "\n");
}
