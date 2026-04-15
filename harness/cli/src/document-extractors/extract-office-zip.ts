import { Buffer } from "node:buffer";
import { posix as pathPosix } from "node:path";
import { Readable } from "node:stream";
import { XMLParser } from "fast-xml-parser";
import { Entry, fromBuffer, ZipFile } from "yauzl";

type XmlValue = string | number | boolean | null | XmlNode[] | XmlNode;
type XmlNode = {
  [key: string]: XmlValue;
};

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  textNodeName: "#text",
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false
});

export async function readOfficeZipEntries(input: ArrayBuffer | Uint8Array | Buffer) {
  const zipFile = await openZipBuffer(toBuffer(input));
  const entries = new Map<string, Buffer>();

  try {
    await new Promise<void>((resolve, reject) => {
      zipFile.once("error", reject);
      zipFile.once("end", resolve);
      zipFile.on("entry", (entry: Entry) => {
        if (entry.fileName.endsWith("/")) {
          zipFile.readEntry();
          return;
        }

        void readEntryBuffer(zipFile, entry)
          .then((buffer) => {
            entries.set(normalizeZipPath(entry.fileName), buffer);
            zipFile.readEntry();
          })
          .catch(reject);
      });

      zipFile.readEntry();
    });
  } finally {
    zipFile.close();
  }

  return entries;
}

export function parseXmlDocument(input: Buffer | string) {
  const xmlText = typeof input === "string" ? input : input.toString("utf8");
  const parsed = xmlParser.parse(xmlText);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("XML document did not parse into an object");
  }

  return parsed as XmlNode;
}

export function normalizeExtractedText(text: string) {
  const normalizedLines = text
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""));
  const collapsed = normalizedLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return collapsed;
}

export function normalizeZipPath(input: string) {
  const normalized = pathPosix.normalize(input.replace(/\\/g, "/"));
  return normalized.startsWith("/") ? normalized.slice(1) : normalized;
}

export function resolveZipPath(basePath: string, target: string) {
  const normalizedTarget = target.replace(/\\/g, "/");
  if (normalizedTarget.startsWith("/")) {
    return normalizeZipPath(normalizedTarget);
  }

  return normalizeZipPath(pathPosix.join(pathPosix.dirname(basePath), normalizedTarget));
}

export function toArray<T>(value: T | T[] | undefined) {
  if (value === undefined) {
    return [] as T[];
  }

  return Array.isArray(value) ? value : [value];
}

export function getChildObject(node: XmlNode | undefined, key: string) {
  const value = node?.[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return value as XmlNode;
}

export function getChildObjects(node: XmlNode | undefined, key: string) {
  return toArray(node?.[key]).filter((value): value is XmlNode => Boolean(value) && typeof value === "object" && !Array.isArray(value));
}

export function getNodeText(node: unknown): string {
  if (node === undefined || node === null) {
    return "";
  }
  if (typeof node === "string" || typeof node === "number" || typeof node === "boolean") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map((entry) => getNodeText(entry)).join("");
  }

  const record = node as Record<string, unknown>;
  const directText = record["#text"];
  const textParts: string[] = [];
  if (typeof directText === "string" || typeof directText === "number" || typeof directText === "boolean") {
    textParts.push(String(directText));
  }

  for (const [key, value] of Object.entries(record)) {
    if (key === "#text") {
      continue;
    }

    textParts.push(getNodeText(value));
  }

  return textParts.join("");
}

export function getAttribute(node: XmlNode | undefined, key: string) {
  const value = node?.[key];
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return undefined;
}

export function collectByLocalName(node: unknown, localName: string, results: string[] = []) {
  if (node === undefined || node === null) {
    return results;
  }
  if (typeof node === "string" || typeof node === "number" || typeof node === "boolean") {
    return results;
  }
  if (Array.isArray(node)) {
    for (const entry of node) {
      collectByLocalName(entry, localName, results);
    }
    return results;
  }

  for (const [key, value] of Object.entries(node)) {
    if (key === "#text") {
      continue;
    }

    if (key === localName || key.endsWith(`:${localName}`)) {
      const text = getNodeText(value).trim();
      if (text) {
        results.push(text);
      }
    }

    collectByLocalName(value, localName, results);
  }

  return results;
}

function openZipBuffer(buffer: Buffer) {
  return new Promise<ZipFile>((resolve, reject) => {
    fromBuffer(buffer, { lazyEntries: true, validateEntrySizes: true }, (error, zipFile) => {
      if (error || !zipFile) {
        reject(error ?? new Error("Could not open zip archive"));
        return;
      }

      resolve(zipFile);
    });
  });
}

function readEntryBuffer(zipFile: ZipFile, entry: Entry) {
  return new Promise<Buffer>((resolve, reject) => {
    zipFile.openReadStream(entry, (error, stream) => {
      if (error || !stream) {
        reject(error ?? new Error(`Could not read ${entry.fileName}`));
        return;
      }

      void readStreamToBuffer(stream)
        .then(resolve)
        .catch(reject);
    });
  });
}

function readStreamToBuffer(stream: Readable) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    stream.once("end", () => resolve(Buffer.concat(chunks)));
    stream.once("error", reject);
  });
}

function toBuffer(input: ArrayBuffer | Uint8Array | Buffer) {
  if (Buffer.isBuffer(input)) {
    return input;
  }
  if (input instanceof Uint8Array) {
    return Buffer.from(input);
  }

  return Buffer.from(input);
}
