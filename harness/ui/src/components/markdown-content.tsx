import { Show, createEffect, createSignal, type JSX } from "solid-js";
import { createComponent } from "solid-js/web";
import { SolidMarkdown } from "../../../../node_modules/solid-markdown/dist/index.js";
import type { SolidMarkdownComponents } from "solid-markdown";
import type { Element, Properties } from "hast";
import type { ChatFileLinkContext, ChatFileTarget } from "../lib/chat-file-links";
import { resolveChatFileTarget } from "../lib/chat-file-links";
import { createMarkdownRehypePlugins, markdownRemarkPlugins, classifyLinkHref, extractTextContent, findFirstChildElement, getCodeLanguage, getElementClassNames, normalizeAllowedHref } from "../lib/markdown";
import { cn } from "../lib/utils";
import { CopyTextButton } from "./primitives/copy-text-button";

export type MarkdownContentProps = {
  content: string | (() => string);
  tone?: "default" | "muted" | "danger" | "warning";
  size?: "body" | "compact";
  live?: boolean;
  class?: string;
  fileLinks?: ChatFileLinkContext & {
    onOpenFile: (target: ChatFileTarget) => void;
  };
};

const toneClassNames: Record<NonNullable<MarkdownContentProps["tone"]>, string> = {
  default: "text-(--foreground)",
  muted: "text-(--muted)",
  danger: "text-rose-900/80",
  warning: "text-amber-900/80"
};

const sizeClassNames: Record<NonNullable<MarkdownContentProps["size"]>, string> = {
  body: "text-[0.75rem] leading-6",
  compact: "text-[0.675rem] leading-5"
};

type MarkdownComponentProps<T> = T extends (props: infer P) => unknown ? P : never;
type AnchorProps = MarkdownComponentProps<Exclude<NonNullable<SolidMarkdownComponents["a"]>, keyof JSX.IntrinsicElements>>;
type ImageProps = MarkdownComponentProps<Exclude<NonNullable<SolidMarkdownComponents["img"]>, keyof JSX.IntrinsicElements>>;
type TableProps = MarkdownComponentProps<Exclude<NonNullable<SolidMarkdownComponents["table"]>, keyof JSX.IntrinsicElements>>;
type PreProps = MarkdownComponentProps<Exclude<NonNullable<SolidMarkdownComponents["pre"]>, keyof JSX.IntrinsicElements>>;
type CodeProps = MarkdownComponentProps<Exclude<NonNullable<SolidMarkdownComponents["code"]>, keyof JSX.IntrinsicElements>>;

export function MarkdownContent(props: MarkdownContentProps) {
  const readContent = () => (typeof props.content === "function" ? props.content() : props.content);
  const [content, setContent] = createSignal(readContent());

  createEffect(() => {
    setContent(readContent());
  });

  const components: SolidMarkdownComponents = {
    a(anchorProps: AnchorProps) {
      const fileTarget = resolveMarkdownFileTarget(anchorProps.node, anchorProps.href, props.fileLinks);
      if (fileTarget) {
        return (
          <button
            type="button"
            data-test-chat-file-link=""
            class="markdown-link markdown-file-link"
            onClick={(event) => handleFileLinkClick(event, fileTarget, props.fileLinks)}
          >
            {anchorProps.children}
          </button>
        );
      }

      const href = normalizeAllowedHref(anchorProps.href);
      const linkKind = classifyLinkHref(href);

      if (!href || linkKind === "invalid") {
        return <span class="markdown-link-invalid">{anchorProps.children}</span>;
      }

      return (
        <a
          href={href}
          target={linkKind === "hash" ? undefined : "_blank"}
          rel={linkKind === "hash" ? undefined : "noopener noreferrer"}
          class="markdown-link"
        >
          {anchorProps.children}
        </a>
      );
    },
    img(imageProps: ImageProps) {
      const description = [imageProps.alt, typeof imageProps.src === "string" ? imageProps.src : undefined].filter(Boolean).join(" | ");
      return (
        <span class="markdown-image-placeholder" role="img" aria-label={imageProps.alt || "Image omitted"}>
          Image omitted{description ? `: ${description}` : ""}
        </span>
      );
    },
    table(tableProps: TableProps) {
      return (
        <div class="markdown-table-scroll">
          <table class="markdown-table">{tableProps.children}</table>
        </div>
      );
    },
    pre(preProps: PreProps) {
      const codeElement = findFirstChildElement(preProps.node, "code");
      const codeText = extractTextContent(codeElement ?? preProps.node);
      const language = getCodeLanguage(codeElement)?.toUpperCase() ?? "TEXT";

      return (
        <div class="markdown-code-block">
          <div class="markdown-code-header">
            <span class="markdown-code-language">{language}</span>
            <CopyTextButton
              value={codeText}
              tooltip="Copy code block"
              copiedTitle="Code copied"
              copiedDescription="Code block copied to clipboard."
              disabledReason="No code to copy"
              size="sm"
              variant="secondary"
              ariaLabel="Copy code block"
            >
              Copy
            </CopyTextButton>
          </div>
          <pre class="markdown-code-pre">{preProps.children}</pre>
        </div>
      );
    },
    code(codeProps: CodeProps) {
      const classNames = getClassAttr(codeProps.node.properties);
      if (codeProps.inline) {
        return <code class={cn("markdown-inline-code", classNames)}>{codeProps.children}</code>;
      }

      return <code class={cn("markdown-code-content", classNames)}>{codeProps.children}</code>;
    }
  };

  const markdownProps = {
    get children() {
      return content();
    },
    get class() {
      return cn(
        "markdown-content",
        props.size === "compact" ? "compact" : undefined,
        toneClassNames[props.tone ?? "default"],
        sizeClassNames[props.size ?? "body"],
        props.class
      );
    },
    skipHtml: true,
    remarkPlugins: markdownRemarkPlugins,
    get rehypePlugins() {
      return createMarkdownRehypePlugins({ live: props.live, fileLinks: props.fileLinks });
    },
    get renderingStrategy() {
      return props.live ? ("reconcile" as const) : ("memo" as const);
    },
    components
  };

  if (props.live) {
    return (
      <Show keyed when={content()}>
        {(liveContent) =>
          createComponent(SolidMarkdown, {
            ...markdownProps,
            children: liveContent,
            renderingStrategy: "reconcile"
          })
        }
      </Show>
    );
  }

  return createComponent(SolidMarkdown, markdownProps);
}

function getClassAttr(properties: Properties | undefined) {
  const classNames = getElementClassNames(properties);
  return classNames.length > 0 ? classNames.join(" ") : undefined;
}

function resolveMarkdownFileTarget(
  node: Element | undefined,
  href: string | null | undefined,
  fileLinks: MarkdownContentProps["fileLinks"]
) {
  if (!fileLinks) {
    return undefined;
  }

  const path = getStringProperty(node?.properties, "dataHarnessFilePath");
  if (path) {
    return {
      path,
      line: getNumberProperty(node?.properties, "dataHarnessFileLine"),
      column: getNumberProperty(node?.properties, "dataHarnessFileColumn")
    };
  }

  return resolveChatFileTarget(href ?? undefined, fileLinks);
}

function handleFileLinkClick(event: MouseEvent, target: ChatFileTarget, fileLinks: MarkdownContentProps["fileLinks"]) {
  event.preventDefault();
  event.stopPropagation();
  if (!fileLinks || (!event.ctrlKey && !event.metaKey)) {
    return;
  }
  fileLinks.onOpenFile(target);
}

function getStringProperty(properties: Properties | undefined, key: string) {
  const value = properties?.[key];
  return typeof value === "string" ? value : undefined;
}

function getNumberProperty(properties: Properties | undefined, key: string) {
  const value = getStringProperty(properties, key);
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
