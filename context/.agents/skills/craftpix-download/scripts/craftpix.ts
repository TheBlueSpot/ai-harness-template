import { createWriteStream, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

export const BASE_URL = "https://craftpix.net";
export const DEFAULT_COOKIE_FILE = ".local/craftpix/cookies.txt";
export const DEFAULT_TIMEOUT = 60;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36";

const DIRECT_DOWNLOAD_RE =
  /^https:\/\/craftpix\.net\/download\/(?<productId>\d+)(?:\/(?<subitem>[^/?#]+))?\/?$/i;
const PRODUCT_ID_RE = /product_ID\s*=\s*"(?<productId>\d+)"/;
const SHORTLINK_RE = /https:\/\/craftpix\.net\/\?p=(?<productId>\d+)/;
const TITLE_RE = /<title>(?<title>[^<]+)<\/title>/i;

export class CraftpixDownloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CraftpixDownloadError";
  }
}

export type ResolvedDownload = {
  productId: string;
  downloadUrl: string;
  title: string;
};

export type DownloadRequest = {
  sourceUrl: string;
  outputDir?: string;
  cookieFile?: string;
  filename?: string;
  subitem?: string;
  resolveOnly: boolean;
  overwrite: boolean;
  timeout: number;
};

function extractMatch(pattern: RegExp, value: string, groupName: string): string | undefined {
  const match = pattern.exec(value);
  return match?.groups?.[groupName];
}

export function expandUserPath(inputPath: string): string {
  if (inputPath === "~") {
    return homedir();
  }
  if (inputPath.startsWith("~/") || inputPath.startsWith("~\\")) {
    return resolve(homedir(), inputPath.slice(2));
  }
  return inputPath;
}

export function getCookieFile(candidate?: string): string {
  if (candidate) {
    return expandUserPath(candidate);
  }
  if (process.env.CRAFTPIX_COOKIE_FILE) {
    return expandUserPath(process.env.CRAFTPIX_COOKIE_FILE);
  }
  return DEFAULT_COOKIE_FILE;
}

export function normalizeCraftpixUrl(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new CraftpixDownloadError("Source URL must be a valid Craftpix URL.");
  }

  if (!["http:", "https:"].includes(parsed.protocol) || parsed.hostname.toLowerCase() !== "craftpix.net") {
    throw new CraftpixDownloadError(
      "Source URL must point at craftpix.net with an http or https scheme.",
    );
  }
  parsed.hash = "";
  return parsed.toString();
}

export function buildCookieHeader(cookieFile: string, requireCookies: boolean): string | undefined {
  const resolvedCookieFile = resolve(expandUserPath(cookieFile));
  if (!existsSync(resolvedCookieFile)) {
    if (requireCookies) {
      throw new CraftpixDownloadError(
        `Cookie file not found: ${resolvedCookieFile}. Export Craftpix cookies to Netscape format first.`,
      );
    }
    return undefined;
  }

  const raw = readFileSync(resolvedCookieFile, "utf8");
  const cookies: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") && !trimmed.startsWith("#HttpOnly_")) {
      continue;
    }

    const normalized = trimmed.startsWith("#HttpOnly_") ? trimmed.slice("#HttpOnly_".length) : trimmed;
    const parts = normalized.split("\t");
    if (parts.length < 7) {
      continue;
    }

    const [domain, , path, secure, , name, value] = parts;
    const normalizedDomain = domain.replace(/^\./, "").toLowerCase();
    if (normalizedDomain !== "craftpix.net") {
      continue;
    }
    if (secure.toUpperCase() === "TRUE" && !BASE_URL.startsWith("https://")) {
      continue;
    }
    if (!path.startsWith("/")) {
      continue;
    }
    cookies.push(`${name}=${value}`);
  }

  if (requireCookies && cookies.length === 0) {
    throw new CraftpixDownloadError(
      `Cookie file did not contain any craftpix.net cookies: ${resolvedCookieFile}`,
    );
  }

  return cookies.length > 0 ? cookies.join("; ") : undefined;
}

export function buildHeaders(cookieHeader?: string): HeadersInit {
  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
    Accept: "*/*",
    Referer: `${BASE_URL}/`,
  };
  if (cookieHeader) {
    headers.Cookie = cookieHeader;
  }
  return headers;
}

async function fetchText(url: string, headers: HeadersInit, timeout: number): Promise<{ finalUrl: string; body: string }> {
  const response = await fetch(url, {
    headers,
    redirect: "follow",
    signal: AbortSignal.timeout(timeout * 1000),
  });
  const body = await response.text();
  return {
    finalUrl: response.url,
    body,
  };
}

function extractProductId(pageHtml: string): string {
  const productId = extractMatch(PRODUCT_ID_RE, pageHtml, "productId") ?? extractMatch(SHORTLINK_RE, pageHtml, "productId");
  if (!productId) {
    throw new CraftpixDownloadError(
      "Could not find Craftpix product_ID on the page. Check that the URL is a product page.",
    );
  }
  return productId;
}

function extractPageTitle(pageHtml: string, fallbackUrl: string): string {
  const title = extractMatch(TITLE_RE, pageHtml, "title");
  if (title) {
    return title.split("- CraftPix", 1)[0].trim();
  }
  const parsed = new URL(fallbackUrl);
  const pathSegments = parsed.pathname.split("/").filter(Boolean);
  const slug = pathSegments[pathSegments.length - 1] ?? "craftpix-asset";
  return slug.replace(/-/g, " ").trim();
}

function slugify(value: string): string {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "craftpix-asset";
}

export async function resolveDownloadUrl(
  sourceUrl: string,
  subitem: string | undefined,
  headers: HeadersInit,
  timeout: number,
): Promise<ResolvedDownload> {
  const directMatch = DIRECT_DOWNLOAD_RE.exec(sourceUrl);
  if (directMatch?.groups?.productId) {
    const productId = directMatch.groups.productId;
    const resolvedSubitem = subitem ?? directMatch.groups.subitem;
    return {
      productId,
      downloadUrl: resolvedSubitem ? `${BASE_URL}/download/${productId}/${resolvedSubitem}/` : `${BASE_URL}/download/${productId}/`,
      title: `craftpix-${productId}`,
    };
  }

  const { finalUrl, body } = await fetchText(sourceUrl, headers, timeout);
  const productId = extractProductId(body);
  const title = extractPageTitle(body, finalUrl);
  return {
    productId,
    downloadUrl: subitem ? `${BASE_URL}/download/${productId}/${subitem}/` : `${BASE_URL}/download/${productId}/`,
    title,
  };
}

function inferFilename(
  contentDisposition: string | null,
  finalUrl: string,
  fallbackTitle: string,
): string {
  if (contentDisposition) {
    const encodedMatch = /filename\*=UTF-8''([^;]+)/i.exec(contentDisposition);
    if (encodedMatch?.[1]) {
      return decodeURIComponent(encodedMatch[1].trim().replace(/^"|"$/g, ""));
    }
    const plainMatch = /filename="?([^";]+)"?/i.exec(contentDisposition);
    if (plainMatch?.[1]) {
      return plainMatch[1].trim();
    }
  }

  const parsed = new URL(finalUrl);
  const pathSegments = parsed.pathname.split("/").filter(Boolean);
  const lastSegment = pathSegments[pathSegments.length - 1];
  if (lastSegment && lastSegment.includes(".")) {
    return decodeURIComponent(lastSegment);
  }

  return `${slugify(fallbackTitle)}.zip`;
}

function detectHtmlError(finalUrl: string, text: string): CraftpixDownloadError {
  if (text.includes("UNLOCK DOWNLOAD") || finalUrl.includes("/membership/")) {
    return new CraftpixDownloadError(
      "Craftpix returned a membership page instead of an archive. Refresh the exported cookies.",
    );
  }
  if (text.includes("Sign in") || finalUrl.includes("/my-account/")) {
    return new CraftpixDownloadError(
      "Craftpix returned a sign-in page instead of an archive. Re-export logged-in cookies.",
    );
  }
  return new CraftpixDownloadError(
    `Craftpix returned HTML instead of an archive from ${finalUrl}. Check cookies and source URL.`,
  );
}

export async function downloadArchive(
  downloadUrl: string,
  outputDir: string,
  filenameOverride: string | undefined,
  overwrite: boolean,
  timeout: number,
  fallbackTitle: string,
  headers: HeadersInit,
): Promise<string> {
  const resolvedOutputDir = resolve(expandUserPath(outputDir));
  mkdirSync(resolvedOutputDir, { recursive: true });

  const response = await fetch(downloadUrl, {
    headers,
    redirect: "follow",
    signal: AbortSignal.timeout(timeout * 1000),
  });
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.startsWith("text/")) {
    throw detectHtmlError(response.url, await response.text());
  }
  if (!response.ok) {
    throw new CraftpixDownloadError(`Craftpix download failed with HTTP ${response.status} from ${response.url}.`);
  }
  if (!response.body) {
    throw new CraftpixDownloadError(`Craftpix returned an empty response from ${response.url}.`);
  }

  const filename =
    filenameOverride ?? inferFilename(response.headers.get("content-disposition"), response.url, fallbackTitle);
  const destination = resolve(resolvedOutputDir, filename);
  if (existsSync(destination) && !overwrite) {
    throw new CraftpixDownloadError(
      `Refusing to overwrite existing file: ${destination}. Pass --overwrite to replace it.`,
    );
  }

  mkdirSync(dirname(destination), { recursive: true });
  const nodeStream = Readable.fromWeb(response.body as any);
  await pipeline(nodeStream, createWriteStream(destination));
  return destination;
}

export async function executeDownload(request: DownloadRequest): Promise<{
  resolved: ResolvedDownload;
  destination?: string;
}> {
  const sourceUrl = normalizeCraftpixUrl(request.sourceUrl);
  const cookieHeader = buildCookieHeader(getCookieFile(request.cookieFile), !request.resolveOnly);
  const headers = buildHeaders(cookieHeader);
  const resolved = await resolveDownloadUrl(sourceUrl, request.subitem, headers, request.timeout);

  if (request.resolveOnly) {
    return { resolved };
  }

  if (!request.outputDir) {
    throw new CraftpixDownloadError("--output-dir is required unless resolve-only mode is active.");
  }

  const destination = await downloadArchive(
    resolved.downloadUrl,
    request.outputDir,
    request.filename,
    request.overwrite,
    request.timeout,
    resolved.title,
    headers,
  );

  return {
    resolved,
    destination,
  };
}
