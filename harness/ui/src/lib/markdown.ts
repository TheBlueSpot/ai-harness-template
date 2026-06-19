import type { PluggableList } from "unified";
import rehypeHighlight from "rehype-highlight";
import rehypeSanitize from "rehype-sanitize";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import type { Element, ElementContent, Properties, Root, RootContent, Text } from "hast";
import { findChatFileReferences, type ChatFileLinkContext } from "./chat-file-links";

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

export function createMarkdownRehypePlugins(input: { live?: boolean; fileLinks?: ChatFileLinkContext } = {}): PluggableList {
  const plugins: PluggableList = [rehypeSanitize];
  if (input.fileLinks) {
    plugins.push(createChatFileLinkRehypePlugin(input.fileLinks));
  }
  if (!input.live) {
    plugins.push([rehypeHighlight, { detect: false }]);
  }
  return plugins;
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

function createChatFileLinkRehypePlugin(context: ChatFileLinkContext) {
  return function chatFileLinkRehypePlugin() {
    return function transformChatFileLinks(tree: Root) {
      transformMarkdownFileLinks(tree.children, context);
    };
  };
}

function transformMarkdownFileLinks(children: RootContent[] | ElementContent[], context: ChatFileLinkContext) {
  for (let index = 0; index < children.length; index += 1) {
    const child = children[index];
    if (!child) {
      continue;
    }
    if (child.type === "text") {
      const replacements = splitTextIntoFileLinks(child, context);
      if (replacements) {
        children.splice(index, 1, ...replacements);
        index += replacements.length - 1;
      }
      continue;
    }
    if (child.type === "element" && !isFileLinkTransformBoundary(child)) {
      transformMarkdownFileLinks(child.children, context);
    }
  }
}

function splitTextIntoFileLinks(node: Text, context: ChatFileLinkContext): ElementContent[] | undefined {
  const references = findChatFileReferences(node.value, context);
  if (references.length === 0) {
    return undefined;
  }

  const output: ElementContent[] = [];
  let cursor = 0;
  for (const reference of references) {
    if (reference.index > cursor) {
      output.push({ type: "text", value: node.value.slice(cursor, reference.index) });
    }
    output.push({
      type: "element",
      tagName: "a",
      properties: {
        href: reference.text,
        dataHarnessFilePath: reference.target.path,
        dataHarnessFileLine: reference.target.line ? String(reference.target.line) : undefined,
        dataHarnessFileColumn: reference.target.column ? String(reference.target.column) : undefined
      },
      children: [{ type: "text", value: reference.text }]
    });
    cursor = reference.index + reference.length;
  }
  if (cursor < node.value.length) {
    output.push({ type: "text", value: node.value.slice(cursor) });
  }
  return output;
}

function isFileLinkTransformBoundary(element: Element) {
  return element.tagName === "a" || element.tagName === "code" || element.tagName === "pre";
}
