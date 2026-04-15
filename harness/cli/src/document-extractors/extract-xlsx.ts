import {
  getAttribute,
  getChildObject,
  getChildObjects,
  getNodeText,
  normalizeExtractedText,
  parseXmlDocument,
  readOfficeZipEntries,
  resolveZipPath
} from "./extract-office-zip";
import type { DocumentExtractionResult } from "./types";

export async function extractXlsxText(input: ArrayBuffer | Uint8Array | Buffer): Promise<DocumentExtractionResult> {
  const entries = await readOfficeZipEntries(input);
  const workbookXml = entries.get("xl/workbook.xml");
  const workbookRelsXml = entries.get("xl/_rels/workbook.xml.rels");
  if (!workbookXml || !workbookRelsXml) {
    throw new Error("Missing workbook metadata in XLSX file");
  }

  const workbook = getChildObject(parseXmlDocument(workbookXml), "workbook");
  const relationships = getChildObject(parseXmlDocument(workbookRelsXml), "Relationships");
  if (!workbook || !relationships) {
    throw new Error("Workbook metadata could not be parsed");
  }

  const sharedStrings = parseSharedStrings(entries.get("xl/sharedStrings.xml"));
  const relationshipMap = new Map(
    getChildObjects(relationships, "Relationship")
      .map((relationship) => {
        const id = getAttribute(relationship, "Id");
        const target = getAttribute(relationship, "Target");
        if (!id || !target) {
          return undefined;
        }

        return [id, resolveZipPath("xl/workbook.xml", target)] as const;
      })
      .filter((entry): entry is readonly [string, string] => Boolean(entry))
  );

  const sheetBlocks = getChildObjects(getChildObject(workbook, "sheets"), "sheet")
    .map((sheet) => {
      const sheetName = getAttribute(sheet, "name") ?? "Sheet";
      const relationshipId = getAttribute(sheet, "r:id");
      const sheetPath = relationshipId ? relationshipMap.get(relationshipId) : undefined;
      if (!sheetPath) {
        return undefined;
      }

      const sheetXml = entries.get(sheetPath);
      if (!sheetXml) {
        return undefined;
      }

      const rows = parseWorksheetRows(sheetXml, sharedStrings);
      if (rows.length === 0) {
        return `Sheet: ${sheetName}\n(empty)`;
      }

      return `Sheet: ${sheetName}\n${rows.join("\n")}`;
    })
    .filter((value): value is string => Boolean(value));

  const text = normalizeExtractedText(sheetBlocks.join("\n\n"));
  if (!text) {
    return {
      status: "no-text",
      reason: "No extractable text found in the XLSX workbook."
    };
  }

  return {
    status: "ok",
    text
  };
}

function parseSharedStrings(sharedStringsXml: Buffer | undefined) {
  if (!sharedStringsXml) {
    return [] as string[];
  }

  const sharedStrings = getChildObject(parseXmlDocument(sharedStringsXml), "sst");
  if (!sharedStrings) {
    return [];
  }

  return getChildObjects(sharedStrings, "si").map((stringItem) => {
    const inlineText = getNodeText(stringItem).trim();
    return inlineText;
  });
}

function parseWorksheetRows(sheetXml: Buffer, sharedStrings: string[]) {
  const worksheet = getChildObject(parseXmlDocument(sheetXml), "worksheet");
  const sheetData = getChildObject(worksheet, "sheetData");
  if (!sheetData) {
    return [] as string[];
  }

  return getChildObjects(sheetData, "row")
    .map((row) => {
      const cells = new Map<number, string>();
      for (const cell of getChildObjects(row, "c")) {
        const reference = getAttribute(cell, "r");
        const cellType = getAttribute(cell, "t");
        const columnIndex = reference ? getColumnIndex(reference) : cells.size;
        cells.set(columnIndex, resolveCellValue(cell, cellType, sharedStrings));
      }

      const lastColumnIndex = Math.max(...cells.keys(), -1);
      const values: string[] = [];
      for (let index = 0; index <= lastColumnIndex; index += 1) {
        values.push(cells.get(index) ?? "");
      }

      return values.join("\t").replace(/\t+$/g, "");
    })
    .filter((row) => row.length > 0);
}

function resolveCellValue(cell: Record<string, unknown>, cellType: string | undefined, sharedStrings: string[]) {
  if (cellType === "inlineStr") {
    return getNodeText((cell["is"] as Record<string, unknown> | undefined) ?? "").trim();
  }

  if (cellType === "s") {
    const sharedStringIndex = Number.parseInt(getNodeText(cell["v"]), 10);
    return Number.isNaN(sharedStringIndex) ? "" : sharedStrings[sharedStringIndex] ?? "";
  }

  return getNodeText(cell["v"]).trim();
}

function getColumnIndex(reference: string) {
  const letters = reference.match(/[A-Za-z]+/)?.[0]?.toUpperCase() ?? "";
  let columnIndex = 0;
  for (const letter of letters) {
    columnIndex = columnIndex * 26 + (letter.charCodeAt(0) - 64);
  }

  return Math.max(0, columnIndex - 1);
}
