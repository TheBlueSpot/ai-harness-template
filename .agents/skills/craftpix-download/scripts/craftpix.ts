import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, resolve } from "node:path";
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
const SIGN_IN_TITLE_RE = /<title>[^<]*\b(sign in|log in)\b[^<]*<\/title>/i;
const LOGIN_FORM_RE = /<form[^>]*\bid="loginform"[^>]*>|action="[^"]*wp-login\.php"/i;
const DOWNLOAD_INTERSTITIAL_RE =
  /Your download is starting|endCountdown\(\)|id="down-iframe"/i;
const CDN_ARCHIVE_URL_RE = /https:\/\/files\.craftpix\.net\/[^"'\s]+\.zip/gi;
const CRAFTPIX_COOKIE_DOMAIN_RE = /^(?:[\w-]+\.)*craftpix\.net$/i;
const SCRIPT_DIR = import.meta.dir;
const HTML_BODY_PREVIEW_LENGTH = 240;

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
  debug?: boolean;
};

export type ParsedCookies = {
  resolvedCookieFile: string;
  names: string[];
  header?: string;
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

function findWorkspaceRoot(startDir: string = SCRIPT_DIR): string {
  let dir = startDir;
  let cookieRoot: string | undefined;
  let gitRoot: string | undefined;

  while (true) {
    if (!gitRoot && existsSync(resolve(dir, ".git"))) {
      gitRoot = dir;
    }
    if (existsSync(resolve(dir, ".local/craftpix/cookies.txt"))) {
      cookieRoot = dir;
    }
    if (!gitRoot && existsSync(resolve(dir, "context")) && existsSync(resolve(dir, "harness"))) {
      gitRoot = dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }

  return gitRoot ?? cookieRoot ?? process.cwd();
}

export function resolveWorkspacePath(inputPath: string): string {
  const expanded = expandUserPath(inputPath);
  if (isAbsolute(expanded)) {
    return resolve(expanded);
  }
  return resolve(findWorkspaceRoot(), expanded);
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

export function parseCookieFile(cookieFile: string, requireCookies: boolean): ParsedCookies {
  const resolvedCookieFile = resolveWorkspacePath(cookieFile);
  if (!existsSync(resolvedCookieFile)) {
    if (requireCookies) {
      throw new CraftpixDownloadError(
        `Cookie file not found: ${resolvedCookieFile}. Export Craftpix cookies to Netscape format first.`,
      );
    }
    return {
      resolvedCookieFile,
      names: [],
      header: undefined,
    };
  }

  const raw = readFileSync(resolvedCookieFile, "utf8");
  const cookieEntries = new Map<string, { name: string; value: string }>();
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

    const [domain, , path, secure, expirationRaw, name, ...valueParts] = parts;
    const value = valueParts.join("\t");
    const normalizedDomain = domain.replace(/^\./, "").toLowerCase();
    if (!CRAFTPIX_COOKIE_DOMAIN_RE.test(normalizedDomain)) {
      continue;
    }
    if (secure.toUpperCase() === "TRUE" && !BASE_URL.startsWith("https://")) {
      continue;
    }
    if (!path.startsWith("/")) {
      continue;
    }
    cookieEntries.set(name, { name, value });
  }

  const names = [...cookieEntries.keys()];
  const cookies = names.map((name) => `${name}=${cookieEntries.get(name)?.value ?? ""}`);

  if (requireCookies && cookies.length === 0) {
    throw new CraftpixDownloadError(
      `Cookie file did not contain any craftpix.net cookies: ${resolvedCookieFile}`,
    );
  }

  return {
    resolvedCookieFile,
    names,
    header: cookies.length > 0 ? cookies.join("; ") : undefined,
  };
}

export function buildCookieHeader(cookieFile: string, requireCookies: boolean): string | undefined {
  return parseCookieFile(cookieFile, requireCookies).header;
}

export function buildHeaders(cookieHeader?: string, referer = `${BASE_URL}/`): HeadersInit {
  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
    Accept: "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: referer,
  };
  if (cookieHeader) {
    headers.Cookie = cookieHeader;
  }
  return headers;
}

function isDownloadInterstitial(html: string): boolean {
  return DOWNLOAD_INTERSTITIAL_RE.test(html);
}

export function extractCdnArchiveUrl(html: string): string | undefined {
  const matches = html.match(CDN_ARCHIVE_URL_RE);
  if (!matches?.length) {
    return undefined;
  }
  return matches[0];
}

function isZipResponse(contentType: string, firstBytes: Uint8Array): boolean {
  if (contentType.includes("zip") || contentType.includes("octet-stream")) {
    return true;
  }
  return firstBytes.length >= 2 && firstBytes[0] === 0x50 && firstBytes[1] === 0x4b;
}

async function fetchText(url: string, headers: HeadersInit, timeout: number): Promise<{ finalUrl: string; body: string }> {
  const response = await fetch(url, {
    headers,
    redirect: "follow",
    signal: AbortSignal.timeout(timeout * 1000),
  });
  const body = await response.text();
  if (!response.ok) {
    throw new CraftpixDownloadError(
      `Craftpix page fetch failed with HTTP ${response.status} from ${response.url}.\n  ` +
        formatHtmlFailureDetails(response.url, response.headers.get("content-type") ?? "", body),
    );
  }
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

function summarizeHtmlBody(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= HTML_BODY_PREVIEW_LENGTH) {
    return collapsed;
  }
  return `${collapsed.slice(0, HTML_BODY_PREVIEW_LENGTH)}...`;
}

function formatHtmlFailureDetails(finalUrl: string, contentType: string, body: string): string {
  return [
    `final URL: ${finalUrl}`,
    `content-type: ${contentType || "(missing)"}`,
    `body preview: ${summarizeHtmlBody(body)}`,
  ].join("\n  ");
}

function looksLikeSignInPage(finalUrl: string, text: string): boolean {
  if (isDownloadInterstitial(text) || /\/download\/\d+/i.test(finalUrl)) {
    return false;
  }
  if (finalUrl.includes("/wp-login.php")) {
    return true;
  }
  if (finalUrl.includes("/my-account/") && (LOGIN_FORM_RE.test(text) || SIGN_IN_TITLE_RE.test(text))) {
    return true;
  }
  if (LOGIN_FORM_RE.test(text) && SIGN_IN_TITLE_RE.test(text)) {
    return true;
  }
  return false;
}

function detectHtmlError(finalUrl: string, contentType: string, text: string): CraftpixDownloadError {
  const details = formatHtmlFailureDetails(finalUrl, contentType, text);
  if (isDownloadInterstitial(text)) {
    const archiveUrl = extractCdnArchiveUrl(text);
    if (archiveUrl) {
      return new CraftpixDownloadError(
        `Craftpix returned a download landing page but the archive could not be fetched from ${archiveUrl}. ` +
          "Re-export cookies after completing one browser download on craftpix.net (include files.craftpix.net / Cloudflare cookies if your exporter captured them).\n  " +
          details,
      );
    }
    return new CraftpixDownloadError(
      `Craftpix returned a download landing page without an archive link. Check product access.\n  ${details}`,
    );
  }
  if (text.includes("UNLOCK DOWNLOAD") || finalUrl.includes("/membership/")) {
    return new CraftpixDownloadError(
      `Craftpix returned a membership page instead of an archive. Refresh the exported cookies.\n  ${details}`,
    );
  }
  if (looksLikeSignInPage(finalUrl, text)) {
    return new CraftpixDownloadError(
      `Craftpix returned a sign-in page instead of an archive. Re-export logged-in cookies.\n  ${details}`,
    );
  }
  return new CraftpixDownloadError(
    `Craftpix returned HTML instead of an archive. Check cookies and source URL.\n  ${details}`,
  );
}

function withReferer(headers: HeadersInit, referer: string): HeadersInit {
  const next = new Headers(headers);
  next.set("Referer", referer);
  return next;
}

async function fetchArchiveResponse(
  archiveUrl: string,
  referer: string,
  headers: HeadersInit,
  timeout: number,
): Promise<Response> {
  return fetch(archiveUrl, {
    headers: withReferer(headers, referer),
    redirect: "follow",
    signal: AbortSignal.timeout(timeout * 1000),
  });
}

function logDebug(enabled: boolean | undefined, message: string): void {
  if (enabled) {
    console.error(`[craftpix debug] ${message}`);
  }
}

async function writeArchiveResponse(
  response: Response,
  resolvedOutputDir: string,
  filenameOverride: string | undefined,
  overwrite: boolean,
  fallbackTitle: string,
): Promise<string> {
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

export async function downloadArchive(
  downloadUrl: string,
  outputDir: string,
  filenameOverride: string | undefined,
  overwrite: boolean,
  timeout: number,
  fallbackTitle: string,
  headers: HeadersInit,
  debug?: boolean,
): Promise<string> {
  const resolvedOutputDir = resolve(expandUserPath(outputDir));
  mkdirSync(resolvedOutputDir, { recursive: true });

  const landingResponse = await fetch(downloadUrl, {
    headers,
    redirect: "follow",
    signal: AbortSignal.timeout(timeout * 1000),
  });
  const landingContentType = landingResponse.headers.get("content-type") ?? "";
  if (!landingContentType.startsWith("text/")) {
    return writeArchiveResponse(landingResponse, resolvedOutputDir, filenameOverride, overwrite, fallbackTitle);
  }

  const landingHtml = await landingResponse.text();
  const archiveUrl = extractCdnArchiveUrl(landingHtml);
  if (!archiveUrl) {
    throw detectHtmlError(landingResponse.url, landingContentType, landingHtml);
  }

  logDebug(debug, `resolved CDN archive URL: ${archiveUrl}`);
  const archiveResponse = await fetchArchiveResponse(archiveUrl, landingResponse.url, headers, timeout);
  const archiveContentType = archiveResponse.headers.get("content-type") ?? "";
  if (archiveContentType.startsWith("text/")) {
    const archiveHtml = await archiveResponse.text();
    throw detectHtmlError(archiveResponse.url, archiveContentType, archiveHtml);
  }

  const archiveBytes = new Uint8Array(await archiveResponse.arrayBuffer());
  if (!isZipResponse(archiveContentType, archiveBytes)) {
    throw new CraftpixDownloadError(
      `Craftpix CDN response from ${archiveResponse.url} was not a zip archive (content-type: ${archiveContentType || "unknown"}).`,
    );
  }

  const filename =
    filenameOverride ??
    inferFilename(archiveResponse.headers.get("content-disposition"), archiveResponse.url, fallbackTitle);
  const destination = resolve(resolvedOutputDir, filename);
  if (existsSync(destination) && !overwrite) {
    throw new CraftpixDownloadError(
      `Refusing to overwrite existing file: ${destination}. Pass --overwrite to replace it.`,
    );
  }
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, archiveBytes);
  return destination;
}

export async function executeDownload(request: DownloadRequest): Promise<{
  resolved: ResolvedDownload;
  destination?: string;
}> {
  const sourceUrl = normalizeCraftpixUrl(request.sourceUrl);
  const cookieFile = getCookieFile(request.cookieFile);
  const parsedCookies = parseCookieFile(cookieFile, !request.resolveOnly);
  logDebug(request.debug, `cookie file: ${parsedCookies.resolvedCookieFile}`);
  logDebug(
    request.debug,
    `parsed ${parsedCookies.names.length} craftpix.net cookie(s): ${parsedCookies.names.join(", ") || "(none)"}`,
  );
  const headers = buildHeaders(parsedCookies.header);
  const resolved = await resolveDownloadUrl(sourceUrl, request.subitem, headers, request.timeout);
  logDebug(request.debug, `resolved download URL: ${resolved.downloadUrl}`);

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
    request.debug,
  );

  return {
    resolved,
    destination,
  };
}
