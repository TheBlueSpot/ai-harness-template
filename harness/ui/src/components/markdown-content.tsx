import { Show, createEffect, createSignal, type JSX } from "solid-js";
import { createComponent } from "solid-js/web";
import { SolidMarkdown } from "../../../../node_modules/solid-markdown/dist/index.js";
import type { SolidMarkdownComponents } from "solid-markdown";
import type { Element, Properties } from "hast";
import { Copy } from "lucide-solid";
import { markdownRehypePlugins, markdownRemarkPlugins, classifyLinkHref, extractTextContent, findFirstChildElement, getCodeLanguage, getElementClassNames, normalizeAllowedHref } from "../lib/markdown";
import { cn } from "../lib/utils";
import { pushToast } from "../toast-store";
import { ActionButton } from "./action-button";

export type MarkdownContentProps = {
  content: string | (() => string);
  tone?: "default" | "muted" | "danger" | "warning";
  size?: "body" | "compact";
  live?: boolean;
  class?: string;
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

  async function handleCopyCode(text: string) {
    if (!text.trim()) {
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      pushToast("Code copied", "Code block copied to clipboard.");
    } catch {
      pushToast("Copy failed", "Clipboard permission denied.", "error");
    }
  }

  const components: SolidMarkdownComponents = {
    a(anchorProps: AnchorProps) {
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
      const canCopy = Boolean(codeText.trim());

      return (
        <div class="markdown-code-block">
          <div class="markdown-code-header">
            <span class="markdown-code-language">{language}</span>
            <ActionButton
              tooltip="Copy code block"
              disabledReason="No code to copy"
              disabled={!canCopy}
              icon={<Copy class="h-3.5 w-3.5" />}
              size="sm"
              variant="secondary"
              ariaLabel="Copy code block"
              onClick={() => void handleCopyCode(codeText)}
            >
              Copy
            </ActionButton>
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
    rehypePlugins: markdownRehypePlugins,
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
