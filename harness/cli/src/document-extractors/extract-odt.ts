import {
  collectByLocalName,
  getChildObject,
  getChildObjects,
  getNodeText,
  normalizeExtractedText,
  parseXmlDocument,
  readOfficeZipEntries
} from "./extract-office-zip";
import type { DocumentExtractionResult } from "./types";

export async function extractOdtText(input: ArrayBuffer | Uint8Array | Buffer): Promise<DocumentExtractionResult> {
  const entries = await readOfficeZipEntries(input);
  const contentXml = entries.get("content.xml");
  if (!contentXml) {
    throw new Error("Missing content.xml");
  }

  const xmlText = contentXml.toString("utf8");
  const blockMatches =
    xmlText.match(/<(text:h|text:p|text:list|table:table)\b[\s\S]*?<\/\1>/g) ?? [];

  if (blockMatches.length === 0) {
    return {
      status: "no-text",
      reason: "No extractable text found in the ODT document."
    };
  }

  const blocks = blockMatches
    .map((xmlBlock) => {
      if (xmlBlock.startsWith("<table:table")) {
        return extractTableText(xmlBlock);
      }
      if (xmlBlock.startsWith("<text:list")) {
        return extractListText(xmlBlock);
      }

      return getNodeText(getRootNode(xmlBlock)).trim();
    })
    .filter((value) => value.length > 0);

  const text = normalizeExtractedText(blocks.join("\n"));
  if (!text) {
    return {
      status: "no-text",
      reason: "No extractable text found in the ODT document."
    };
  }

  return {
    status: "ok",
    text
  };
}

function extractListText(xmlBlock: string) {
  const rootNode = getRootNode(xmlBlock);
  return getChildObjects(rootNode, "text:list-item")
    .map((item) => {
      const lines = collectByLocalName(item, "p");
      return lines.join(" ").trim();
    })
    .filter(Boolean)
    .map((line) => `- ${line}`)
    .join("\n");
}

function extractTableText(xmlBlock: string) {
  const table = getRootNode(xmlBlock);
  return getChildObjects(table, "table:table-row")
    .map((row) =>
      getChildObjects(row, "table:table-cell")
        .map((cell) => collectByLocalName(cell, "p").join(" ").trim())
        .join("\t")
        .replace(/\t+$/g, "")
    )
    .filter(Boolean)
    .join("\n");
}

function getRootNode(xmlBlock: string) {
  const parsed = parseXmlDocument(xmlBlock);
  const rootKey = Object.keys(parsed)[0];
  return getChildObject(parsed, rootKey) ?? parsed;
}
