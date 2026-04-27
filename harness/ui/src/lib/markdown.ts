import type { PluggableList } from "unified";
import rehypeHighlight from "rehype-highlight";
import rehypeSanitize from "rehype-sanitize";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import type { Element, ElementContent, Properties, Root, RootContent, Text } from "hast";

const allowedLinkProtocols = new Set(["http:", "https:", "mailto:"]);

export const markdownRemarkPlugins: PluggableList = [remarkGfm, remarkBreaks];
export const markdownRehypePlugins: PluggableList = [rehypeSanitize, [rehypeHighlight, { detect: false }]];
export const markdownLiveRehypePlugins: PluggableList = [rehypeSanitize];

export type LinkKind = "hash" | "external" | "mailto" | "invalid";

export function classifyLinkHref(href: string | null | undefined): LinkKind {
  const value = href?.trim();
  if (!value) {
    return "invalid";
  }

  if (value.startsWith("#")) {
    return "hash";
  }

  try {
    const parsedUrl = new URL(value);
    if (!allowedLinkProtocols.has(parsedUrl.protocol)) {
      return "invalid";
    }

    return parsedUrl.protocol === "mailto:" ? "mailto" : "external";
  } catch {
    return "invalid";
  }
}

export function normalizeAllowedHref(href: string | null | undefined) {
  const value = href?.trim();
  const linkKind = classifyLinkHref(value);
  return linkKind === "invalid" ? undefined : value;
}

export function extractTextContent(node: Root | Element | ElementContent | RootContent | Array<ElementContent | RootContent> | Text | undefined): string {
  if (!node) {
    return "";
  }

  if (Array.isArray(node)) {
    return node.map((child) => extractTextContent(child)).join("");
  }

  if ("type" in node && node.type === "text") {
    return node.value;
  }

  if ("children" in node && Array.isArray(node.children)) {
    return extractTextContent(node.children);
  }

  return "";
}

export function getElementClassNames(properties: Properties | undefined) {
  const className = properties?.className;
  if (Array.isArray(className)) {
    return className.filter((value): value is string => typeof value === "string");
  }

  if (typeof className === "string") {
    return className.split(/\s+/).filter(Boolean);
  }

  return [];
}

export function getCodeLanguage(node: Element | undefined) {
  if (!node) {
    return undefined;
  }

  const languageClass = getElementClassNames(node.properties).find(
    (className) => className.startsWith("language-") || className.startsWith("lang-")
  );
  return languageClass?.replace(/^language-/, "").replace(/^lang-/, "");
}

export function findFirstChildElement(node: Element | undefined, tagName: string) {
  if (!node?.children) {
    return undefined;
  }

  return node.children.find(
    (child): child is Element => child.type === "element" && child.tagName === tagName
  );
}
